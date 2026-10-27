import { defaultOs, defaultReadFile, defaultRun } from "./capacity-probes.mjs";

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

