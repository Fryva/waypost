// Waypost CLI: slots.
import { legacyStateDirs, machineStateDir, writeFileAtomic } from "../../scripts/lib.mjs";
import { acquireLock, releaseLock } from "../../scripts/machine-lock.mjs";
import { bootAuthority, warnIfProbed } from "./core.mjs";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { hostname, constants as osConstants, uptime as osUptime } from "node:os";
import { basename, join } from "node:path";

// ─── run --heavy: a machine-wide slot for heavy work ────────────────────
//
// WP-18 Decision 2. One slot table per machine, in the machine state
// directory (never synced): <machineStateDir()>/slots.<hostSlug>/. Every
// session, harness and project on this machine shares it. All writes to it —
// the lock, a new record, pruning a stale one — live here; scripts/capacity.mjs
// (readHolders, slotLive, bootIdentity) only ever reads it.
function slotsDir(presence) {
  return join(machineStateDir(), `slots.${presence.hostSlug()}`);
}

// The slot directories older versions kept under their state roots — on
// Windows one per packaged harness. Read beside slotsDir() for one release, so
// a heavy job an older Waypost still holds keeps refusing the next one; new
// claims and the lock always go to slotsDir().
function legacySlotsDirs(presence) {
  return legacyStateDirs().map((d) => join(d, `slots.${presence.hostSlug()}`)).filter((d) => existsSync(d));
}

const EX_TEMPFAIL = 75; // sysexits.h: temporary failure, safe to retry
const WAIT_POLL_MS = 5000;
const REASON_PRINT_MS = 30_000;

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}


// The identity fields a slot record, a claimSlot record and a
// waypost-removing/ marker all share — who and which process, on which
// boot, since when. Factored out of claimSlot (the amended machine-wide-
// limit ADR) so the detached deleter's own marker rewrite, and its parent's
// interim one, write the identical shape without re-deriving it by hand.
function selfMarker(capacity, presence) {
  const table = process.platform === "win32" ? null : presence.processTable();
  const self = table ? table.get(process.pid) : null;
  return {
    host: hostname().split(".")[0],
    proc: { pid: process.pid, started: self ? self.started : null, ticks: presence.startTicks(process.pid), comm: basename(process.execPath) },
    boot: capacity.bootIdentity(),
    // What an epoch mismatch is checked against later (WP-18 amendment):
    // the epoch in `boot` is itself drifted once the machine has slept, so
    // comparing THAT against a true boot time would delete live records.
    // null where the platform has no authority — such a record can then
    // only ever be kept, never pruned, which is the safe half.
    // The uptime at claim: a later reading below it confirms another boot
    // with no spawn at all (second amendment). Free on every platform.
    uptime: osUptime(),
    started_at: new Date().toISOString(),
  };
}

// The working directory a slot is claimed from, and — when it sits inside a
// repository — that repository's own root and common dir, both resolved to
// real paths (the amended machine-wide-limit ADR, Decision 4's own slot-
// record fields). One combined `git rev-parse`, so this costs one spawn, not
// two, on the path every heavy claim (including `run --heavy`'s own retry
// loop) goes through; computed BEFORE the slot lock is ever taken — nothing
// may spawn inside that critical section. Outside a repository, or when git
// itself is unavailable, `root`/`common` stay null and `cwd` is still
// reported: a live record with NEITHER is what capacity.blockingHolder
// treats as an unconditional block, so cwd alone is worth recording even
// there.
function slotWhere(dir) {
  const real = (p) => { try { return realpathSync(p); } catch { return p; } };
  const cwd = real(dir);
  let root = null;
  let common = null;
  try {
    const r = spawnSync("git", ["-C", dir, "rev-parse", "--path-format=absolute", "--show-toplevel", "--git-common-dir"],
      { encoding: "utf8", timeout: 5000 });
    if (r.status === 0) {
      const [top, commonDir] = String(r.stdout).trim().split(/\r?\n/);
      if (top) root = real(top);
      if (commonDir) common = real(commonDir);
    }
  } catch { /* no git: root/common stay null */ }
  return { cwd, root, common };
}

// Under the lock: prune the stale records, measure with the live ones, and
// either write our own record or report why not. Two processes starting in
// the same second cannot both pass the cap. `where` (slotWhere(), computed
// by the caller before the lock) is carried on the record so a live heavy
// job can be told apart from one working somewhere unrelated
// (capacity.blockingHolder) — null when the caller never computed one (kept
// optional so a caller with nothing meaningful to report, if one is ever
// added, is not forced to invent a location).
async function claimSlot(dir, argv, capacity, presence, where = null) {
  const lockDir = await acquireLock(dir, presence, capacity);
  if (!lockDir) {
    return { ok: false, reason: "the slot lock is busy — another `waypost run --heavy` is claiming right now" };
  }
  try {
    const holders = capacity.readHolders({ dir, dirs: legacySlotsDirs(presence), authority: bootAuthority(capacity) });
    for (const rec of holders.stale) { try { unlinkSync(rec.file); } catch {} }
    const m = await capacity.measure({ holders: holders.live, env: process.env });
    warnIfProbed(m);
    if (m.can_start <= 0) return { ok: false, reason: m.reason || "no heavy job slot available" };

    const id = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const rec = {
      id,
      ...selfMarker(capacity, presence),
      // Filled in by recordAuthority() once the lock is released (third
      // amendment): reading it here cost a refusal 2486 ms against a 2000 ms
      // budget, came back null under load anyway, and moved the timings enough
      // that a claim slipped past a live lock owner in the suite.
      authority: null,
      cwd: where ? where.cwd : null,
      root: where ? where.root : null,
      session: process.env.WAYPOST_SESSION_ID || null,
      harness: process.env.WAYPOST_HARNESS || null,
      command: argv.map(shellQuote).join(" "),
    };
    const file = join(dir, `${id}.json`);
    writeFileSync(file, JSON.stringify(rec, null, 2) + "\n", "utf8");
    return { ok: true, id, file, release: () => { try { unlinkSync(file); } catch {} } };
  } finally {
    releaseLock(lockDir);
  }
}

// The authority is read AFTER the slot is claimed and the lock released, and
// its answer is written into the record we already own. Not before: a refusal
// must stay immediate (Decision 2's "exits at once", and the test that pins it
// under two seconds), and a spawn inside the lock serialises the other
// claimants. Atomically, because a reader that finds a half-written record
// skips it, and a skipped record is an unheld slot. No answer is not a
// failure: uptime carries the common case on its own (WP-18, third
// amendment).
function recordAuthority(file, capacity) {
  let asked;
  // Its own patient read, not the report path's memo: this is the one place
  // whose answer every later decision about this record depends on, and the
  // only cost of waiting is the start of a job that will run for minutes.
  try { asked = capacity.bootAuthority({ timeoutMs: capacity.AUTHORITY_WRITE_TIMEOUT_MS }); } catch { return; }
  if (!asked || !file) return;
  let rec;
  try { rec = JSON.parse(readFileSync(file, "utf8")); } catch { return; }
  if (!rec || rec.authority) return;
  try { writeFileAtomic(file, JSON.stringify({ ...rec, authority: asked }, null, 2) + "\n"); } catch {}
}

// <N>s or <N>m only, the ADR's own examples (30s, 10m) — anything else fails
// fast rather than guessing.
function parseDuration(spec) {
  const m = String(spec).match(/^(\d+)(s|m)$/);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] === "m" ? n * 60_000 : n * 1000;
}

function signalNumber(sig) {
  return (osConstants.signals && osConstants.signals[sig]) || 0;
}

// The retry line is printed to be pasted back, so an argument with anything
// beyond plain characters is quoted: POSIX single quotes, or double quotes on
// Windows.
function shellQuote(arg) {
  const s = String(arg);
  if (/^[\w@%+=:,./-]+$/.test(s)) return s;
  return process.platform === "win32" ? `"${s.replace(/"/g, '\\"')}"` : `'${s.replace(/'/g, "'\\''")}'`;
}

export { slotsDir, legacySlotsDirs, EX_TEMPFAIL, WAIT_POLL_MS, REASON_PRINT_MS, delay, selfMarker, slotWhere, claimSlot, recordAuthority, parseDuration, signalNumber, shellQuote };
