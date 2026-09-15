#!/usr/bin/env node
// waypost — capacity.mjs (WP-18, Decision 1 of the heavy-work-sized-to-the-
// machine ADR): measure the machine's real free resources, right now, with
// each OS's own means, and compute how many more heavy jobs it can take.
//
// Compute only — nothing here writes, caches, or shells through a shell.
// Every probe is a parameter with a real default, so tests inject platform,
// file reads and command output and never depend on the host. The two traps
// the ADR measured on the owner's Mac (Node's os.freemem() reporting ~0.18 GB
// free while macOS itself reported 81% available; os.loadavg() always zero on
// Windows) are why each OS gets its own probe instead of one constant call.
//
// Holders (the heavy jobs currently occupying a slot) come from the next
// story's slot table; this story always reports 0.

import { availableParallelism, loadavg, cpus, totalmem, freemem } from "node:os";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const GB = 1024 ** 3;

// ─── default probes ─────────────────────────────────────────────────────

function defaultOs() {
  return { availableParallelism, loadavg, cpus, totalmem, freemem };
}

function defaultReadFile(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

// A spawnSync with no shell, stdin ignored, and a 2-second timeout — a sysctl
// or vm_stat call that hangs must never hang capacity measurement with it.
// Returns stdout on a clean exit, null on any failure (missing binary,
// non-zero exit, timeout, signal).
function defaultRun(cmd, args) {
  let r;
  try {
    r = spawnSync(cmd, args, {
      shell: false,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
      timeout: 2000,
    });
  } catch {
    return null;
  }
  if (!r || r.error || r.status !== 0) return null;
  return r.stdout;
}

function defaultWait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── cores ───────────────────────────────────────────────────────────────
//
// os.availableParallelism(), capped on Linux by a cgroup CPU quota when one
// is set: v2's single "cpu.max" file ("<quota> <period>", or "max" for
// unlimited), else v1's separate cfs_quota_us / cfs_period_us pair (a
// negative or missing quota also means unlimited). A quota rounds UP to
// whole cores — a 2.1-core quota still needs 3 cores worth of scheduling
// headroom, never fewer than the quota allows.
const CGROUP_V2_CPU_MAX = "/sys/fs/cgroup/cpu.max";
const CGROUP_V1_CPU_QUOTA = "/sys/fs/cgroup/cpu/cpu.cfs_quota_us";
const CGROUP_V1_CPU_PERIOD = "/sys/fs/cgroup/cpu/cpu.cfs_period_us";

function quotaCores(quota, period) {
  if (!Number.isFinite(quota) || quota <= 0 || !Number.isFinite(period) || period <= 0) return null;
  return Math.max(1, Math.ceil(quota / period));
}

export function readCores({ platform = process.platform, os = defaultOs(), readFile = defaultReadFile } = {}) {
  const base = os.availableParallelism();
  if (platform !== "linux") return { cores: base, probe: "availableParallelism" };

  const v2 = readFile(CGROUP_V2_CPU_MAX);
  if (v2 != null) {
    const trimmed = v2.trim();
    if (trimmed && trimmed !== "max") {
      const [quotaStr, periodStr] = trimmed.split(/\s+/);
      const capped = quotaCores(Number(quotaStr), Number(periodStr));
      if (capped != null) return { cores: Math.min(base, capped), probe: "cgroup v2 cpu.max" };
    }
    return { cores: base, probe: "availableParallelism" };
  }

  const quotaStr = readFile(CGROUP_V1_CPU_QUOTA);
  const periodStr = readFile(CGROUP_V1_CPU_PERIOD);
  if (quotaStr != null && periodStr != null) {
    const capped = quotaCores(Number(quotaStr.trim()), Number(periodStr.trim()));
    if (capped != null) return { cores: Math.min(base, capped), probe: "cgroup v1 cpu.cfs_quota_us" };
  }
  return { cores: base, probe: "availableParallelism" };
}

// ─── busy ────────────────────────────────────────────────────────────────
//
// macOS and Linux report a real 1-minute load average. Windows never does
// (os.loadavg() is always zeros there), so two os.cpus() snapshots ~250ms
// apart stand in: the busy share of that window, times the core count, is a
// figure in the same units as loadavg() (cores wanted, not a percentage).
function cpuTotal(times) {
  return times.user + times.nice + times.sys + times.idle + times.irq;
}

function busyFraction(before, after) {
  let idleDelta = 0;
  let totalDelta = 0;
  for (let i = 0; i < before.length; i++) {
    idleDelta += after[i].times.idle - before[i].times.idle;
    totalDelta += cpuTotal(after[i].times) - cpuTotal(before[i].times);
  }
  if (totalDelta <= 0) return 0;
  return Math.max(0, Math.min(1, 1 - idleDelta / totalDelta));
}

export async function readBusy({ platform = process.platform, os = defaultOs(), wait = defaultWait, sampleMs = 250 } = {}) {
  if (platform === "win32") {
    const before = os.cpus();
    await wait(sampleMs);
    const after = os.cpus();
    const cores = before.length || os.availableParallelism();
    return { busy: busyFraction(before, after) * cores, probe: "os.cpus() sample" };
  }
  return { busy: os.loadavg()[0], probe: "loadavg" };
}

// ─── memory ──────────────────────────────────────────────────────────────
//
// Each OS's own measure of memory available to NEW work, not "free" in the
// naive sense — macOS and Linux both keep reclaimable memory as cache, which
// os.freemem() alone reports as unavailable.
const CGROUP_V2_MEM_MAX = "/sys/fs/cgroup/memory.max";
const CGROUP_V2_MEM_CURRENT = "/sys/fs/cgroup/memory.current";
const CGROUP_V1_MEM_LIMIT = "/sys/fs/cgroup/memory/memory.limit_in_bytes";
const CGROUP_V1_MEM_USAGE = "/sys/fs/cgroup/memory/memory.usage_in_bytes";

// "page size of N bytes" from vm_stat's header, and the four page counts the
// ADR names as available: free + inactive + speculative + purgeable. Pages
// wired or active are not available; pages throttled are not counted either
// (the ADR names exactly these four).
function parseVmStat(text) {
  const pageMatch = text.match(/page size of (\d+) bytes/);
  if (!pageMatch) return null;
  const pageSize = Number(pageMatch[1]);
  const pages = (label) => {
    const m = text.match(new RegExp(`Pages ${label}:\\s*(\\d+)\\.`));
    return m ? Number(m[1]) : null;
  };
  const free = pages("free");
  const inactive = pages("inactive");
  const speculative = pages("speculative");
  const purgeable = pages("purgeable");
  if ([free, inactive, speculative, purgeable].some((v) => v == null)) return null;
  return (free + inactive + speculative + purgeable) * pageSize;
}

export function readMemory({ platform = process.platform, os = defaultOs(), readFile = defaultReadFile, run = defaultRun } = {}) {
  const total = os.totalmem();

  if (platform === "darwin") {
    const sysctlOut = run("sysctl", ["-n", "kern.memorystatus_level"]);
    if (sysctlOut != null) {
      const level = Number(sysctlOut.trim());
      if (Number.isFinite(level) && level >= 0) {
        return { available: total * (level / 100), total, probe: "kern.memorystatus_level" };
      }
    }
    // The sysctl failed or was refused (a sandbox) — fall back to vm_stat.
    // os.freemem() is never used here while either probe works (0.18 GB
    // "free" against 81% actually available is exactly the trap this
    // fallback order exists to avoid).
    const vmStatOut = run("vm_stat", []);
    if (vmStatOut != null) {
      const available = parseVmStat(vmStatOut);
      if (available != null) return { available, total, probe: "vm_stat" };
    }
    return { available: os.freemem(), total, probe: "os.freemem() (lower bound)" };
  }

  if (platform === "linux") {
    const meminfo = readFile("/proc/meminfo");
    const match = meminfo != null ? meminfo.match(/^MemAvailable:\s*(\d+)\s*kB$/m) : null;
    if (!match) return { available: os.freemem(), total, probe: "os.freemem() (lower bound)" };

    let available = Number(match[1]) * 1024;
    let probe = "MemAvailable";

    // A cgroup is exclusively v1 or v2 on a real system, so v1 is checked
    // only when v2's file is absent — not merely when v2 reports "max".
    const v2max = readFile(CGROUP_V2_MEM_MAX);
    if (v2max != null) {
      const v2current = readFile(CGROUP_V2_MEM_CURRENT);
      if (v2max.trim() !== "max" && v2current != null) {
        const max = Number(v2max.trim());
        const current = Number(v2current.trim());
        if (Number.isFinite(max) && Number.isFinite(current)) {
          const cap = Math.max(0, max - current);
          if (cap < available) { available = cap; probe = "cgroup v2 memory.max"; }
        }
      }
    } else {
      const limitRaw = readFile(CGROUP_V1_MEM_LIMIT);
      const usageRaw = readFile(CGROUP_V1_MEM_USAGE);
      if (limitRaw != null && usageRaw != null) {
        const limit = Number(limitRaw.trim());
        const usage = Number(usageRaw.trim());
        // A v1 limit above total memory means unlimited (the conventional
        // "no cgroup limit" sentinel on that side, unlike v2's literal "max").
        if (Number.isFinite(limit) && Number.isFinite(usage) && limit <= total) {
          const cap = Math.max(0, limit - usage);
          if (cap < available) { available = cap; probe = "cgroup v1 memory.limit_in_bytes"; }
        }
      }
    }
    return { available, total, probe };
  }

  if (platform === "win32") return { available: os.freemem(), total, probe: "os.freemem()" };

  return { available: os.freemem(), total, probe: "os.freemem() (lower bound)" };
}

// ─── canStart ────────────────────────────────────────────────────────────
//
// The owner's defaults (Owner's decisions, item 1): one slot per four cores,
// at least one; a job's share is a quarter of the cores (at least one) and
// the smaller of 2 GiB and a quarter of the memory. WAYPOST_HEAVY_MAX can
// only LOWER the slot count — a bigger or invalid value changes nothing.
export const CORES_PER_SLOT = 4;
export const JOB_CORE_DIVISOR = 4;
export const JOB_MEMORY_CAP = 2 * 1024 ** 3; // 2 GiB
export const JOB_MEMORY_DIVISOR = 4;

function parseHeavyMax(raw) {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function canStart({ cores, busy, available, total, holders = 0, max = null } = {}) {
  let slots = Math.max(1, Math.floor(cores / CORES_PER_SLOT));
  const requestedMax = parseHeavyMax(max);
  if (requestedMax != null && requestedMax < slots) slots = requestedMax;

  const jobCores = Math.max(1, cores / JOB_CORE_DIVISOR);
  const jobMemory = Math.min(JOB_MEMORY_CAP, total / JOB_MEMORY_DIVISOR);

  // An unknown figure (NaN busy or memory, a zero total) counts as "cannot
  // start": the safe answer, and never a NaN in can_start.
  const bySlots = Math.max(0, slots - holders);
  const idleCores = Number.isFinite(busy) ? Math.max(0, cores - busy) : 0;
  const byCores = Math.max(0, Math.floor(idleCores / jobCores));
  const memoryKnown = jobMemory > 0 && Number.isFinite(available);
  const byMemory = memoryKnown ? Math.max(0, Math.floor(available / jobMemory)) : 0;

  const started = Math.max(0, Math.min(bySlots, byCores, byMemory));

  // Named in the ADR's own order (a), (b), (c) — the first limit that binds,
  // in plain words, so an agent can report why without another round trip.
  let reason = null;
  if (started === 0) {
    if (bySlots <= 0) {
      reason = `slots: ${holders} of ${slots} heavy job slot(s) already held`;
    } else if (byCores <= 0) {
      reason = `cpu: ${idleCores.toFixed(1)} idle core(s) available, a heavy job needs ${jobCores.toFixed(1)}`;
    } else if (!memoryKnown) {
      reason = "memory: available or total memory unknown";
    } else {
      reason = `memory: ${(available / GB).toFixed(1)} GB available, a heavy job needs ${(jobMemory / GB).toFixed(1)} GB`;
    }
  }

  return { slots, job_cores: jobCores, job_memory: jobMemory, can_start: started, reason };
}

// ─── measure ─────────────────────────────────────────────────────────────
//
// Everything above in one call: never cached, so every invocation reflects
// the machine right now. Holders come from the next story's slot table — this
// story always reports 0, so can_start here only ever reflects (b) and (c).
export async function measure({
  platform = process.platform,
  os = defaultOs(),
  readFile = defaultReadFile,
  run = defaultRun,
  wait = defaultWait,
  env = process.env,
} = {}) {
  const coresResult = readCores({ platform, os, readFile });
  const busyResult = await readBusy({ platform, os, wait });
  const memoryResult = readMemory({ platform, os, readFile, run });
  const holders = 0;

  const started = canStart({
    cores: coresResult.cores,
    busy: busyResult.busy,
    available: memoryResult.available,
    total: memoryResult.total,
    holders,
    max: env.WAYPOST_HEAVY_MAX,
  });

  return {
    cores: coresResult.cores,
    busy: busyResult.busy,
    memory: { available: memoryResult.available, total: memoryResult.total },
    probes: { cores: coresResult.probe, busy: busyResult.probe, memory: memoryResult.probe },
    holders,
    slots: started.slots,
    can_start: started.can_start,
    reason: started.reason,
  };
}
