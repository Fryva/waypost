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
// Holders (the heavy jobs currently occupying a slot) come from the slot
// table in the machine state directory: bootIdentity() and slotLive() below
// decide which records are live, and measure({ holders }) counts them. This
// file only ever reads that table — every write (the lock, a new record,
// pruning a stale one) lives in bin/waypost (WP-18 Decision 2), so two
// readers racing here can never delete or clobber each other's record.

import { readFileSync, readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { processTable, processGone } from "./presence.mjs";
import { treesOverlap } from "./lib.mjs";

import { defaultOs, defaultReadFile, defaultRun, defaultWait } from "./capacity-probes.mjs";

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

import { readMemory } from "./capacity-memory.mjs";
export { readMemory } from "./capacity-memory.mjs";

import { bootIdentity, sameBoot, authorityOnce, uptimeSaysOtherBoot, confirmBoot } from "./capacity-boot.mjs";
export { bootIdentity, sameBoot, bootAuthority, authorityOnce, uptimeSaysOtherBoot, confirmBoot, AUTHORITY_TIMEOUT_MS, AUTHORITY_WRITE_TIMEOUT_MS, UPTIME_MARGIN_S } from "./capacity-boot.mjs";

// ─── slot liveness ─────────────────────────────────────────────────────
//
// A slot record names the `waypost run --heavy` process itself (its pid, its
// start time in clock ticks since boot where there is one, and the wall-clock
// string otherwise), so on POSIX processGone() — the same comparison
// presence.mjs uses for a session's harness process — decides: a reused pid
// is not mistaken for the holder, and a machine that slept between the two
// readings does not turn the holder into one. Windows has no process table, so
// signal-0 plus the image name `tasklist` reports (run without a shell, a
// 3-second timeout) and a 24-hour cap are the only evidence there.
const WIN_SLOT_STALE_MS = 24 * 60 * 60 * 1000;

function defaultKill(pid) {
  try { process.kill(pid, 0); return true; }
  catch (e) { return Boolean(e) && e.code !== "ESRCH"; }
}

// CSV, no header: "image.exe","1234","Console","1","12,345 K". Returns the
// first column, or null on any failure — a hung or missing tasklist, a
// non-zero exit, unparsable output — so the caller falls back to signal-0
// and the 24-hour cap alone.
function defaultTasklist(pid) {
  let r;
  try {
    r = spawnSync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], {
      shell: false, stdio: ["ignore", "pipe", "ignore"], encoding: "utf8", timeout: 3000,
    });
  } catch { return null; }
  if (!r || r.error || r.status !== 0 || !r.stdout) return null;
  const line = (r.stdout.trim().split(/\r?\n/)[0] || "");
  const m = line.match(/^"([^"]*)"/);
  return m ? m[1] : null;
}

const isEpoch = (b) => Boolean(b) && b.kind === "epoch";

function pastCap(rec, now) {
  const started = Date.parse(rec.started_at);
  return Number.isFinite(started) && now - started > WIN_SLOT_STALE_MS;
}

// Is the process the record names still there? The free evidence: the process
// table on POSIX (already in hand), and on win32 signal-0, the 24-hour cap and
// the one `tasklist` call the ADR names.
function processStillThere(rec, { table, platform, tasklist, now, kill }) {
  if (platform !== "win32") {
    const gone = processGone(rec, table);
    if (gone !== null) return !gone;
    return kill(rec.proc.pid); // undecidable via the table: signal-0 decides
  }
  if (!kill(rec.proc.pid)) return false;
  if (pastCap(rec, now)) return false;
  // Case-insensitively: process.execPath keeps the casing node was started
  // through (NODE.EXE), tasklist reports the file's own name (node.exe).
  const image = tasklist(rec.proc.pid);
  if (image != null && !(typeof rec.proc.comm === "string" && image.toLowerCase() === rec.proc.comm.toLowerCase())) return false;
  return true;
}

// Every probe is injectable — table, tasklist, kill, bootNow, now, authority
// — so these tests never depend on the host's own process table, clock or
// boot. Read-only: nothing here removes a stale record, which is
// bin/waypost's job, under the lock.
export function slotLive(rec, {
  table,
  platform = process.platform,
  bootNow = bootIdentity(),
  tasklist = defaultTasklist,
  now = Date.now(),
  kill = defaultKill,
  authority = null,
  uptimeNow = defaultOs().uptime(),
} = {}) {
  // The free checks first (WP-18 amendment): a holder whose process is gone is
  // gone whatever boot it names, and settling a record here costs nothing.
  if (!processStillThere(rec, { table, platform, tasklist, now, kill })) return false;
  if (sameBoot(rec.boot, bootNow)) return true;

  // A mismatch. On anything but the epoch fallback that is a real identifier
  // disagreeing, and it decides on its own, as it always has.
  if (!isEpoch(rec.boot) || !isEpoch(bootNow)) return false;

  // Free, and certain in the one direction it answers: a record claimed at a
  // higher uptime than now's is from another boot, whatever the authority is
  // doing (second amendment).
  if (uptimeSaysOtherBoot(rec, uptimeNow)) return false;

  // On the epoch path a mismatch is a reason to ask, never a reason to delete.
  // Unconfirmable keeps the record — bounded by the same 24-hour cap, which
  // this rule extends from Windows to every platform for this case.
  const verdict = confirmBoot(rec, typeof authority === "function" ? authority() : authority);
  if (verdict !== null) return verdict;
  return !pastCap(rec, now);
}

// ─── holders ─────────────────────────────────────────────────────────────
//
// Every record in the slot directory (<machineStateDir>/slots.<hostSlug>/),
// split into live and stale by slotLive(). Read and compute only — a stale
// record is reported, never removed; bin/waypost prunes under the lock, so
// two readers racing here never delete a record the other still sees as live.
// `dirs` adds directories read the same way — for one release, the slot
// directories earlier versions kept under older state roots (bin/waypost
// legacySlotsDirs()), so an older Waypost's live holder still counts. A record
// reached twice (one directory under two spellings) counts once.
export function readHolders({ dir, dirs = [], ...probes } = {}) {
  const files = [];
  for (const d of [dir, ...dirs].filter(Boolean)) {
    let names = [];
    try { names = readdirSync(d); } catch { continue; }
    for (const name of names) files.push([d, name]);
  }
  if (!files.length) return { live: [], stale: [] };
  const platform = probes.platform ?? process.platform;
  // No process table on win32 (presence.mjs's own probe returns null there);
  // slotLive() never consults `table` on that branch, so it is not worth a
  // real `ps` call when a test injects platform: "win32" on a POSIX runner.
  const table = platform === "win32" ? undefined
    : (probes.table !== undefined ? probes.table : processTable());
  const bootNow = probes.bootNow ?? bootIdentity(probes);
  // One thunk for the whole directory: at most one authority read per command,
  // and none at all unless some record's epoch disagrees (WP-18 amendment).
  const authority = probes.authority ?? authorityOnce(probes);
  const uptimeNow = probes.uptimeNow ?? (probes.os || defaultOs()).uptime();
  const live = [];
  const stale = [];
  const ids = new Set();
  for (const [d, name] of files) {
    if (!name.endsWith(".json")) continue; // skips .lock and any stray entry
    const file = join(d, name);
    let rec;
    try { rec = JSON.parse(readFileSync(file, "utf8")); } catch { continue; }
    if (!rec || !rec.id || !rec.proc) continue;
    if (ids.has(rec.id)) continue;
    ids.add(rec.id);
    const entry = { ...rec, file };
    (slotLive(rec, { ...probes, platform, table, bootNow, authority, uptimeNow }) ? live : stale).push(entry);
  }
  return { live, stale };
}

// ─── overlapping holders (the machine-wide-limit ADR, Decision 4) ───────
//
// Whether some OTHER live slot holder works in the same tree the caller is
// about to clean up — the automatic path's own "no heavy job overlaps"
// check, and read fresh right before each item, per the ADR. `self` is this
// process's own slot id, always skipped. A record naming neither `root` nor
// `cwd` (an older Waypost, or another install that never claimed one)
// blocks unconditionally — the ADR's own call: nothing about that holder can
// be compared, and treating "unknown" as "not overlapping" would let a
// heavy job with no location on record switch the limit off machine-wide.
// Otherwise `root` decides when present; `cwd` decides when `root` is null
// (claimed outside any git repository) — never both, and never falling back
// from one to the other. `canon` resolves a path to the form the two sides
// are compared in (real, case-as-the-filesystem-sees-it); the default
// resolves through the filesystem where it can and falls back to the path
// itself where it cannot (a path that no longer exists is still worth
// comparing lexically, not treated as "no opinion").
function defaultCanon(p) {
  try { return realpathSync(p); } catch { return p; }
}

export function blockingHolder(holders, { self = null, root, platform = process.platform, canon = defaultCanon } = {}) {
  const ours = canon(root);
  for (const h of holders || []) {
    if (!h || h.id === self) continue;
    const hasRoot = typeof h.root === "string" && h.root;
    const hasCwd = typeof h.cwd === "string" && h.cwd;
    if (!hasRoot && !hasCwd) return { holder: h, reason: "no location recorded for this holder (an older Waypost) — treated as overlapping" };
    const theirs = canon(hasRoot ? h.root : h.cwd);
    if (treesOverlap(theirs, ours, { platform })) {
      return { holder: h, reason: hasRoot ? "its project root overlaps this one" : "its working directory overlaps this root (it recorded no root)" };
    }
  }
  return null;
}

import { canStart } from "./capacity-admission.mjs";
export { CORES_PER_SLOT, JOB_CORE_DIVISOR, JOB_MEMORY_CAP, JOB_MEMORY_DIVISOR, canStart } from "./capacity-admission.mjs";

// Malformed or partial JSON is ignored, falling back to the real probes, so a
// typo in the env never silently mis-measures a real machine.
function parseCapacityProbe(raw) {
  try {
    const v = JSON.parse(raw);
    const nums = ["cores", "busy", "available", "total"];
    if (v && typeof v === "object" && nums.every((k) => typeof v[k] === "number")) return v;
  } catch { /* falls through to the real probes */ }
  return null;
}

// ─── measure ─────────────────────────────────────────────────────────────
//
// Everything above in one call: never cached, so every invocation reflects
// the machine right now. `holders` is the live-holder array a caller already
// read with readHolders() (empty by default, e.g. before any slot table
// exists) — this function only counts it, per WP-18 Decision 2's division of
// labour: reading the slot directory and writing to it are bin/waypost's job.
export async function measure({
  platform = process.platform,
  os = defaultOs(),
  readFile = defaultReadFile,
  run = defaultRun,
  wait = defaultWait,
  env = process.env,
  holders = [],
} = {}) {
  // WAYPOST_CAPACITY_PROBE replaces every machine probe with fixed numbers —
  // for hermetic CLI tests only (WP-18's stress test and its neighbours),
  // never a documented user-facing override.
  const probe = env.WAYPOST_CAPACITY_PROBE ? parseCapacityProbe(env.WAYPOST_CAPACITY_PROBE) : null;

  let coresResult, busyResult, memoryResult;
  if (probe) {
    coresResult = { cores: probe.cores, probe: "WAYPOST_CAPACITY_PROBE" };
    busyResult = { busy: probe.busy, probe: "WAYPOST_CAPACITY_PROBE" };
    memoryResult = { available: probe.available, total: probe.total, probe: "WAYPOST_CAPACITY_PROBE" };
  } else {
    coresResult = readCores({ platform, os, readFile });
    busyResult = await readBusy({ platform, os, wait });
    memoryResult = readMemory({ platform, os, readFile, run });
  }

  const holderCount = Array.isArray(holders) ? holders.length : 0;
  const started = canStart({
    cores: coresResult.cores,
    busy: busyResult.busy,
    available: memoryResult.available,
    total: memoryResult.total,
    holders: holderCount,
    max: env.WAYPOST_HEAVY_MAX,
  });

  return {
    cores: coresResult.cores,
    busy: busyResult.busy,
    memory: { available: memoryResult.available, total: memoryResult.total },
    probes: { cores: coresResult.probe, busy: busyResult.probe, memory: memoryResult.probe },
    holders: holderCount,
    slots: started.slots,
    can_start: started.can_start,
    // Critical pressure zeroes memory whatever the pages say; name it, or the
    // reason reads "0.0 GB available" with nothing to explain it.
    reason: started.reason?.startsWith("memory:") && /pressure critical$/.test(memoryResult.probe)
      ? `${started.reason} (memory pressure critical)`
      : started.reason,
  };
}
