const GB = 1024 ** 3;

// ─── the machine-wide limit (the amended ADR) ───────────────────────────
//
// `waypost clean --limit [<value>]`'s own value grammar: a bare positive
// number (gigabytes, per project), `free:<P>%` with P from 5 to 50 (keep at
// least that much of the disk free), or `off` (no automatic cleanup). Any
// other spelling is invalid — the caller decides what to do with a null
// (print the choices again, refuse the flag, …); this function never throws.
export function parseLimit(raw) {
  const s = String(raw ?? "").trim();
  if (s === "off") return { kind: "off" };
  const free = s.match(/^free:(\d+(?:\.\d+)?)%$/);
  if (free) {
    const percent = Number(free[1]);
    if (!(percent >= 5 && percent <= 50)) return null;
    return { kind: "free", percent };
  }
  const gb = Number(s);
  if (Number.isFinite(gb) && gb > 0) return { kind: "gb", gb, bytes: gb * GB };
  return null;
}

// From the setting already in force (`cur`, a parseLimit() result or null —
// no limit ever set) to the one just asked for (`next`, already parsed and
// valid): which of the ADR's six outcomes this is, and whether it needs the
// gate (Decision 2) — setting a limit where none is set, tightening it (a
// smaller GB value or a larger P), or switching between a GB limit and
// `free:`. `off` and loosening (a larger GB value, a smaller P, or `off`
// itself) never need the gate, from any state.
export function limitChange(cur, next) {
  const curKind = cur ? cur.kind : "off";
  const nextKind = next.kind;
  if (curKind === nextKind) {
    if (nextKind === "off") return { change: "same", gated: false };
    if (nextKind === "gb") {
      if (next.gb === cur.gb) return { change: "same", gated: false };
      return next.gb < cur.gb ? { change: "tighten", gated: true } : { change: "loosen", gated: false };
    }
    // free:<P>% — a LARGER percent asks for more headroom, so it is the
    // tighter setting (more may be removed to reach it), the same way a
    // smaller GB value is tighter.
    if (next.percent === cur.percent) return { change: "same", gated: false };
    return next.percent > cur.percent ? { change: "tighten", gated: true } : { change: "loosen", gated: false };
  }
  if (nextKind === "off") return { change: "off", gated: false };
  if (curKind === "off") return { change: "set", gated: true };
  return { change: "switch", gated: true };
}

// Whether a gated change may proceed, from facts bin/waypost already
// gathered — never itself reads a flag, an environment variable or a
// keystroke, the same posture as consent() above. There is no `--yes
// --reason` path for this one (Decision 2: "only the owner, in their own
// terminal"): `method: "prompt"` means the caller still has to actually ask
// (with an unbounded [y/N], answered false after 60s); everything else is a
// final answer. `checkError` is set by the caller when the gate itself could
// not be evaluated (the shipped harness registry was unreadable) — refused,
// never treated as "no harness found".
export function limitDecision({ gated = false, harness = null, checkError = false, isTTY = false } = {}) {
  if (!gated) return { method: "none", ok: true };
  if (harness) {
    return { method: "refused", ok: false, reason: `a harness (${harness}) is running — only the owner, in their own terminal, may set or tighten the limit` };
  }
  if (checkError) return { method: "refused", ok: false, reason: "could not confirm whether a harness is running — refused" };
  if (!isTTY) return { method: "refused", ok: false, reason: "no interactive terminal — see `waypost prompt cleanup`" };
  return { method: "prompt", ok: null };
}

// The bytes a `free:<P>%` limit is still short of its own floor, from one
// `fs.statfsSync` reading of the root's filesystem (the ADR: computed once —
// snapshots can keep freed space from showing at once, so this is never
// recomputed mid-sweep). `size`/`avail` are that reading's own byte totals
// (block size × block counts); never negative.
export function shortfallOf({ size = 0, avail = 0 } = {}, percent) {
  const want = size * (percent / 100);
  return Math.max(0, want - avail);
}

// The yes, decided from facts bin/waypost already gathered (a flag pair, or
// a terminal with no harness detected) — never itself reads a flag, an
// environment variable or a keystroke. `method: "prompt"` means the caller
// still has to actually ask (this module has no I/O); everything else is a
// final answer.
export function consent({ yes = false, reason = null, isTTY = false, harnessDetected = false } = {}) {
  // A reason of all whitespace is not a reason — `--reason "   "` must be
  // refused the same as no --reason at all, not accepted as a truthy string.
  const trimmedReason = typeof reason === "string" ? reason.trim() : reason;
  if (yes && trimmedReason) return { method: "flag", ok: true, reason: trimmedReason };
  if (isTTY && !harnessDetected) return { method: "prompt", ok: null };
  return {
    method: "refused", ok: false,
    reason: "no --yes --reason, and no interactive terminal without a harness detected — see `waypost prompt cleanup`",
  };
}

// One JSONL log line, as a string with no trailing newline — bin/waypost
// appends "\n" and the file handle; this module never opens one. `entry.kind`
// overrides the default "apply" — "limit" for a setting change, "auto" for
// an automatic run, "purge" for leftovers handed to the deleter (the amended
// ADR).
export function logLine(entry) {
  return JSON.stringify({ v: 1, kind: "apply", ...entry });
}

// A short line for `status`/`brief`/the `--limit` preview: the setting's
// VALUE only — a caller wanting "set on <date>" or the gate's own view reads
// those fields off the stored record itself and adds them.
export function formatLimit(limit) {
  if (!limit) return "no limit set";
  if (limit.kind === "off") return "off — no automatic cleanup";
  if (limit.kind === "gb") return `${limit.gb} GB per project`;
  if (limit.kind === "free") return `free:${limit.percent}% — keep at least ${limit.percent}% of the disk free`;
  return "no limit set";
}

// A short line for `status`/`brief`/the stderr report, from a `kind: "auto"`
// log record (readLastAutoCleanup, scripts/lib.mjs) — null when automatic
// cleanup has never run. `outcome.result` is "ran"/"skipped"/"failed"; the
// byte counts it carries (renamed/stayed/…) are the ones logLine itself
// writes (the amended ADR, Decision 4's own report shape).
export function formatOutcome(outcome) {
  if (!outcome) return "automatic cleanup: never run";
  // `at` is the real kind:"auto" log field (an ISO timestamp); `time` was
  // this function's own guess before that record's exact shape existed —
  // both are accepted so an older-shaped test fixture still renders.
  const when = outcome.at || outcome.time ? ` (${outcome.at || outcome.time})` : "";
  if (outcome.result !== "ran") {
    return `automatic cleanup: ${outcome.result || "unknown"}${when}${outcome.reason ? ` — ${outcome.reason}` : ""}`;
  }
  // `renamed`/`stayed` are arrays in the real log record (the items
  // themselves, capped); a bare count is accepted too, for the same
  // pre-shape-knowledge reason as `time` above.
  const count = (v) => (Array.isArray(v) ? v.length : (Number.isFinite(v) ? v : 0));
  const renamed = count(outcome.renamed);
  const stayed = count(outcome.stayed);
  const deadlineNote = outcome.deadline ? " (stopped at its deadline)" : "";
  return `automatic cleanup: ran${when}${deadlineNote} — ${renamed} item(s) removed, ${stayed} stayed`;
}
