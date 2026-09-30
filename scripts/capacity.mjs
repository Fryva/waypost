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

import { availableParallelism, loadavg, cpus, totalmem, freemem, uptime } from "node:os";
import { readFileSync, readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { processTable, processGone } from "./presence.mjs";
import { treesOverlap } from "./lib.mjs";

const GB = 1024 ** 3;

// ─── default probes ─────────────────────────────────────────────────────

function defaultOs() {
  return { availableParallelism, loadavg, cpus, totalmem, freemem, uptime };
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
function defaultRun(cmd, args, timeoutMs = 2000) {
  let r;
  try {
    r = spawnSync(cmd, args, {
      shell: false,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
      timeout: timeoutMs,
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
const CGROUP_V2_MEM_STAT = "/sys/fs/cgroup/memory.stat";
const CGROUP_V1_MEM_STAT = "/sys/fs/cgroup/memory/memory.stat";

// A cgroup's usage counts its page cache, which the kernel reclaims before it
// ever kills. Inactive file pages are subtracted, as the kubelet and docker
// compute a working set, so a container full of clone and install cache is
// not refused forever while nothing allocates to make the kernel drop it.
function inactiveFile(readFile, path, key) {
  const stat = readFile(path);
  const m = stat != null ? stat.match(new RegExp(`^${key} (\\d+)$`, "m")) : null;
  return m ? Number(m[1]) : 0;
}

// Memory available to new work on macOS, chosen by the kernel's own pressure
// level (kern.memorystatus_vm_pressure_level: 1 normal, 2 warning, 4
// critical — ADR "Memory for heavy work: half the memory up to 2 GB, …"):
// - normal: vm_stat's free + inactive + speculative + purgeable pages. With
//   no pressure, inactive memory is what the kernel gives up first.
// - warning: free + file-backed + purgeable — what a job can take without
//   squeezing anyone already running. Anonymous pages (every live process's
//   own memory, idle agents included), wired pages and the compressor's are
//   not available. This is XNU's own definition of available pages off macOS,
//   and Activity Monitor's Free + Cached Files.
// - critical: 0, whatever the pages say; the machine is already thrashing.
// kern.memorystatus_level, the first probe before, counts resident anonymous
// pages as available: 8.0 GB "available" on the owner's Mac against 2.7 GB by
// the warning formula, with 8 of 9 GB of swap in use.
function parseVmStat(text, pressured) {
  const pageMatch = text.match(/page size of (\d+) bytes/);
  if (!pageMatch) return null;
  const pageSize = Number(pageMatch[1]);
  const pages = (label) => {
    const m = text.match(new RegExp(`${label}:\\s*(\\d+)\\.`));
    return m ? Number(m[1]) : null;
  };
  const labels = pressured
    ? ["Pages free", "File-backed pages", "Pages purgeable"]
    : ["Pages free", "Pages inactive", "Pages speculative", "Pages purgeable"];
  const counts = labels.map(pages);
  if (counts.some((v) => v == null)) return null;
  return counts.reduce((sum, n) => sum + n, 0) * pageSize;
}

function darwinPressure(run) {
  const out = run("sysctl", ["-n", "kern.memorystatus_vm_pressure_level"]);
  const level = out != null ? Number(out.trim()) : NaN;
  return Number.isFinite(level) ? level : null;
}

// An unreadable pressure level counts as warning: the stricter formula.
function darwinMemory(total, os, run, pressure) {
  const pressured = pressure !== 1;
  const vmStatOut = run("vm_stat", []);
  const available = vmStatOut != null ? parseVmStat(vmStatOut, pressured) : null;
  if (available != null) return { available, total, probe: "vm_stat" };
  // vm_stat failed or was refused (a sandbox). kern.memorystatus_level counts
  // resident anonymous memory as available, so it only bounds from above.
  const sysctlOut = run("sysctl", ["-n", "kern.memorystatus_level"]);
  const level = sysctlOut != null ? Number(sysctlOut.trim()) : NaN;
  if (Number.isFinite(level) && level >= 0) {
    return { available: total * (level / 100), total, probe: "kern.memorystatus_level (upper bound)" };
  }
  return { available: os.freemem(), total, probe: "os.freemem() (lower bound)" };
}

export function readMemory({ platform = process.platform, os = defaultOs(), readFile = defaultReadFile, run = defaultRun } = {}) {
  const total = os.totalmem();

  if (platform === "darwin") {
    const pressure = darwinPressure(run);
    const result = darwinMemory(total, os, run, pressure);
    if (pressure != null && pressure >= 4) return { available: 0, total, probe: `${result.probe}, memory pressure critical` };
    if (pressure === 2) return { ...result, probe: `${result.probe}, memory pressure warning` };
    return result;
  }

  if (platform === "linux") {
    const meminfo = readFile("/proc/meminfo");
    const match = meminfo != null ? meminfo.match(/^MemAvailable:\s*(\d+)\s*kB$/m) : null;
    if (!match) return { available: os.freemem(), total, probe: "os.freemem() (lower bound)" };

    let available = Number(match[1]) * 1024;
    let probe = "MemAvailable";

    // The box we are actually in — what a job's share is computed from, since
    // a cgroup limit is the whole machine as far as anything inside it is
    // concerned. Without this a job inside a 256 MB container was told it
    // needed 1.0 GB, a quarter of the host's 3.8 GB, and nothing could ever
    // start (WP-18, measured on the Linux VM). `total` itself stays the host's
    // own figure below, because that is what decides whether a v1 limit is the
    // "unlimited" sentinel.
    let box = total;

    // A cgroup is exclusively v1 or v2 on a real system, so v1 is checked
    // only when v2's file is absent — not merely when v2 reports "max".
    const v2max = readFile(CGROUP_V2_MEM_MAX);
    if (v2max != null) {
      const v2current = readFile(CGROUP_V2_MEM_CURRENT);
      if (v2max.trim() !== "max" && v2current != null) {
        const max = Number(v2max.trim());
        const current = Number(v2current.trim()) - inactiveFile(readFile, CGROUP_V2_MEM_STAT, "inactive_file");
        if (Number.isFinite(max) && Number.isFinite(current)) {
          const cap = Math.max(0, max - current);
          if (cap < available) { available = cap; probe = "cgroup v2 memory.max"; }
          if (max < box) box = max;
        }
      }
    } else {
      const limitRaw = readFile(CGROUP_V1_MEM_LIMIT);
      const usageRaw = readFile(CGROUP_V1_MEM_USAGE);
      if (limitRaw != null && usageRaw != null) {
        const limit = Number(limitRaw.trim());
        const usage = Number(usageRaw.trim()) - inactiveFile(readFile, CGROUP_V1_MEM_STAT, "total_inactive_file");
        // A v1 limit above total memory means unlimited (the conventional
        // "no cgroup limit" sentinel on that side, unlike v2's literal "max").
        if (Number.isFinite(limit) && Number.isFinite(usage) && limit <= total) {
          const cap = Math.max(0, limit - usage);
          if (cap < available) { available = cap; probe = "cgroup v1 memory.limit_in_bytes"; }
          if (limit < box) box = limit;
        }
      }
    }
    // `probe` names where the AVAILABLE figure came from, which is not always
    // where the total came from: a limit can bound the box while the host's own
    // MemAvailable is the smaller of the two and still binds.
    return { available, total: box, probe };
  }

  if (platform === "win32") return { available: os.freemem(), total, probe: "os.freemem()" };

  return { available: os.freemem(), total, probe: "os.freemem() (lower bound)" };
}

// ─── boot identity ───────────────────────────────────────────────────────
//
// A record from an earlier boot must never hold a slot after a restart —
// pids are reused at once (the ADR's Alternative H). Linux and macOS each
// expose a real boot identifier; everywhere else, and when the platform's
// own probe fails (no /proc, a sandboxed sysctl), now minus os.uptime()
// stands in, compared later with a tolerance instead of exact equality.
const BOOT_EPOCH_TOLERANCE_S = 120;

export function bootIdentity({ platform = process.platform, os = defaultOs(), readFile = defaultReadFile, run = defaultRun, now = Date.now() } = {}) {
  if (platform === "linux") {
    const id = readFile("/proc/sys/kernel/random/boot_id");
    if (id != null && id.trim()) return { kind: "boot_id", value: id.trim() };
  } else if (platform === "darwin") {
    const out = run("sysctl", ["-n", "kern.boottime"]);
    const m = out != null ? out.match(/sec\s*=\s*(\d+)/) : null;
    if (m) return { kind: "kern.boottime", value: Number(m[1]) };
  }
  const nowS = Math.floor(now / 1000);
  return { kind: "epoch", value: Math.round(nowS - os.uptime()) };
}

// Exact equality for a real OS identifier; a 120s window for the epoch
// fallback, since two readings of "now - uptime" drift with scheduling and
// the tests verify this stays sound across sleep/wake.
export function sameBoot(a, b) {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === "epoch") return Math.abs(a.value - b.value) <= BOOT_EPOCH_TOLERANCE_S;
  return a.value === b.value;
}

// ─── the boot identity's second opinion (WP-18 amendment, 2026-09-17) ───
//
// The epoch fallback drifts. A host suspending a VM freezes the tick count
// that os.uptime() reads, and the wall clock is corrected forward on resume,
// so `now - uptime` steps by the frozen duration and every record written
// before it reads as another boot. Measured on the owner's Windows VM: 534 s
// of suspend moved it 535 s, a live holder's record was judged stale,
// `capacity` reported the slot free while that job was still running, and the
// next claim deleted the record on its way in.
//
// Windows keeps one answer that survives that, because the kernel stores it
// as an absolute time and never recomputes it: the System process's creation
// time (pid 4). `Win32_OperatingSystem.LastBootUpTime` does NOT survive it —
// read six minutes after the resume it still gave the true boot second, read
// at twenty it gave the drifted one and stayed there, being the same biased
// tick count behind a cache. `wmic` is absent from current Windows, so this
// goes through PowerShell's CIM, with the conversion done inside PowerShell:
// a formatted local date parses differently on every locale, and this machine
// prints Russian.
//
// null means "no answer", never "another boot": nothing may be deleted on the
// strength of a probe that did not answer.
const WIN_SYSTEM_PID = 4;
const WIN_BOOT_QUERY =
  `([DateTimeOffset](Get-CimInstance Win32_Process -Filter 'ProcessId=${WIN_SYSTEM_PID}').CreationDate).ToUnixTimeSeconds()`;

// Two budgets, because the two paths ask for different reasons and neither may
// hold anything up. A report (`capacity`, `--release`) gets 2 s: a no-answer
// there is safe, since unconfirmable keeps the record. A claim writes its own
// record after the lock is released and gets **less** — one second,
// best-effort: the field is worth having when it is cheap, and worth nothing
// if a heavy job waits for it. Measured on this Windows VM: ~0.4 s when the
// machine is quiet, 4–9 s under load (one call 74 s), and a 10 s budget on the
// claim path stretched a five-way stress test from 3 s to 52 s. What the
// record is guaranteed to carry is `uptime`, which costs nothing; the
// authority is the extra that settles the one case uptime cannot.
export const AUTHORITY_TIMEOUT_MS = 2000;
export const AUTHORITY_WRITE_TIMEOUT_MS = 1000;

export function bootAuthority({ platform = process.platform, run = defaultRun, timeoutMs = AUTHORITY_TIMEOUT_MS } = {}) {
  // Linux has boot_id; macOS is not covered at all (the ADR says why).
  if (platform !== "win32") return null;
  const out = run("powershell", ["-NoProfile", "-NonInteractive", "-Command", WIN_BOOT_QUERY], timeoutMs);
  // Digits or nothing: Number("") and Number("   ") are 0, and a boot identity
  // of zero would match no record and so delete every one of them. An empty
  // stdout from a command that exited 0 is no answer, like any other.
  const text = out == null ? "" : String(out).trim();
  if (!/^[0-9]+$/.test(text)) return null;
  return { kind: "win-system-process", value: Number(text) };
}

// One answer per command invocation: a thunk that asks at most once, and only
// when a record actually needs it. readHolders() makes one and hands it to
// every slotLive() call it makes; bin/waypost makes one for the whole process,
// so the claim, the lock and `--release` share the single read.
export function authorityOnce(probes = {}) {
  let asked = false;
  let answer = null;
  return () => {
    if (!asked) { asked = true; answer = bootAuthority(probes); }
    return answer;
  };
}

// true: the authority says this record belongs to the current boot. false: it
// says it does not. null: it could not say — no answer, no recorded value,
// or two values that cannot be compared. Only `false` may destroy anything.
// Uptime never decreases within one boot: it pauses while a guest is frozen
// and resumes, and it resets on a restart. So a record claimed at an uptime
// above the one read now is from another boot — with certainty, and for free,
// which matters most in the minutes after a restart, when previous-boot records
// exist and the authority is slowest (4" + "–" + "9 s measured on Windows, against a
// 2 s timeout). The converse proves nothing — a new boot can have been up longer
// than the record's own claim was — so this only ever answers "another boot"
// or "cannot say" (WP-18, second amendment). The margin is there because this
// is the direction that deletes.
export const UPTIME_MARGIN_S = 5;

export function uptimeSaysOtherBoot(rec, uptimeNow) {
  if (!rec || typeof rec.uptime !== "number" || !Number.isFinite(rec.uptime)) return false;
  if (typeof uptimeNow !== "number" || !Number.isFinite(uptimeNow)) return false;
  return uptimeNow < rec.uptime - UPTIME_MARGIN_S;
}

export function confirmBoot(rec, asked) {
  if (!asked || !rec || !rec.authority) return null;
  if (asked.kind !== rec.authority.kind) return null;
  return asked.value === rec.authority.value;
}

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
  const image = tasklist(rec.proc.pid);
  if (image != null && image !== rec.proc.comm) return false;
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
export function readHolders({ dir, ...probes } = {}) {
  let names = [];
  try { names = readdirSync(dir); } catch { return { live: [], stale: [] }; }
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
  for (const name of names) {
    if (!name.endsWith(".json")) continue; // skips .lock and any stray entry
    const file = join(dir, name);
    let rec;
    try { rec = JSON.parse(readFileSync(file, "utf8")); } catch { continue; }
    if (!rec || !rec.id || !rec.proc) continue;
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

// ─── canStart ────────────────────────────────────────────────────────────
//
// The owner's defaults (Owner's decisions, item 1): one slot per four cores,
// at least one; a job's share is a quarter of the cores (at least one) and
// the smaller of 2 GiB and half the memory (ADR "Memory for heavy work: half
// the memory up to 2 GB, …": a quarter was a 0.95 GB share on a 3.8 GB VM,
// where a Rust test build beside background agents was OOM-killed along with
// the harness). WAYPOST_HEAVY_MAX can only LOWER
// the slot count — a bigger or invalid value changes nothing.
export const CORES_PER_SLOT = 4;
export const JOB_CORE_DIVISOR = 4;
export const JOB_MEMORY_CAP = 2 * 1024 ** 3; // 2 GiB
export const JOB_MEMORY_DIVISOR = 2;

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
  // Each live holder reserves one share: a job admitted seconds ago has not
  // allocated its memory yet, and the next claim would otherwise count it as
  // free. Once it has, its share is counted twice — strict on purpose.
  const memoryKnown = jobMemory > 0 && Number.isFinite(available);
  const reserved = holders * jobMemory;
  const byMemory = memoryKnown ? Math.max(0, Math.floor((available - reserved) / jobMemory)) : 0;

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
      const held = reserved > 0 ? ` (${(reserved / GB).toFixed(1)} GB reserved for ${holders} running heavy job(s))` : "";
      reason = `memory: ${(available / GB).toFixed(1)} GB available${held}, a heavy job needs ${(jobMemory / GB).toFixed(1)} GB`;
    }
  }

  return { slots, job_cores: jobCores, job_memory: jobMemory, can_start: started, reason };
}

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
