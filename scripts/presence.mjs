#!/usr/bin/env node
// waypost — presence.mjs
// Who is working right now, from which device, OS and harness — across a vault
// that may live on iCloud, Dropbox, SMB or NFS (ADR-0007).
//
// THE HARD PART IS NOT THE FILE FORMAT. Three assumptions that hold for one
// machine are false the moment a vault is shared:
//
//   1. Clocks agree. They do not: two laptops can differ by minutes, and a
//      TTL compared against a remote timestamp then reports a live session as
//      dead (or a dead one as live). So liveness here NEVER compares a remote
//      clock with the local one. Each session publishes a counter it increments
//      itself; we record locally WHEN WE SAW each value change. "Alive" means
//      "its counter changed within the last N seconds *by our clock*" — a
//      measurement made with one clock, whoever wrote the file. The one remote
//      timestamp ever read is the record's own, once, on first sight, to seed
//      that observation (clamped to "no later than now"); after that the
//      counter alone decides.
//
//   2. mtime means something. On SMB it is the server's clock, on FAT/exFAT it
//      is rounded to two seconds, and a sync client rewrites it on download. It
//      is used here only as a coarse hint, never as the liveness signal.
//
//   3. A write is atomic and unique. A sync drive can materialise two copies of
//      the "same" file (iCloud "… 2.json", Dropbox "…conflicted copy…"), so an
//      exclusive create is not mutual exclusion. Where that matters (leases),
//      the protocol is write → settle → re-read → deterministic tie-break, and
//      the loser stands down. Detection, not prevention: prevention is not
//      available on this substrate, and pretending otherwise is how two agents
//      end up believing they hold the same lock.
//
// Everything here is therefore ADVISORY and says how stale it might be. That is
// an honest primitive to build coordination on; a lock that lies is not.

import {
  existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync, statSync,
} from "node:fs";
import { join, basename, resolve } from "node:path";
import { hostname, platform, release as osRelease, userInfo } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readConfig, projectRoot, ignoreEpipe, writeFileAtomic, sessionId } from "./lib.mjs";

// A session is considered live while its counter has moved recently, measured
// locally. The window has to cover the storage's propagation delay, or a peer
// on iCloud looks dead between syncs — hence storageOf() below.
export const BEAT_INTERVAL_MS = 30_000;
export const LIVE_WINDOW_MS = 150_000;      // 5 missed beats on local storage

// ─── Storage ───────────────────────────────────────────────────────────

// How long a write here may take to become visible on another device, and how
// long to wait before re-reading our own write to see whether someone else's
// landed too. Numbers are deliberately conservative: being early is a false
// conflict, being late is a slow command.
const STORAGE = {
  local:   { lag_ms: 0,       settle_ms: 150 },
  network: { lag_ms: 3_000,   settle_ms: 1_500 },
  cloud:   { lag_ms: 60_000,  settle_ms: 4_000 },
};

export function storageOf(path) {
  const p = String(path || "");
  // Cloud-sync roots are recognisable by path on every OS that has them.
  if (/Library\/Mobile Documents|com~apple~CloudDocs|iCloud Drive/i.test(p)) return { kind: "cloud", provider: "iCloud", ...STORAGE.cloud };
  if (/\/Dropbox(\/|$)|\\Dropbox(\\|$)/i.test(p)) return { kind: "cloud", provider: "Dropbox", ...STORAGE.cloud };
  if (/Google ?Drive|My Drive/i.test(p)) return { kind: "cloud", provider: "Google Drive", ...STORAGE.cloud };
  if (/OneDrive/i.test(p)) return { kind: "cloud", provider: "OneDrive", ...STORAGE.cloud };
  if (/Yandex\.?Disk|YandexDisk/i.test(p)) return { kind: "cloud", provider: "Yandex Disk", ...STORAGE.cloud };
  if (/^\\\\/.test(p)) return { kind: "network", provider: "UNC share", ...STORAGE.network };
  if (platform() === "darwin" && /^\/Volumes\//.test(p)) return { kind: "network", provider: "mounted volume", ...STORAGE.network };
  const fs = mountTypeOf(p);
  if (fs && /^(nfs|smbfs|cifs|afpfs|webdav|fuse|sshfs|9p|virtiofs)/i.test(fs)) {
    return { kind: "network", provider: fs, ...STORAGE.network };
  }
  return { kind: "local", provider: fs || platform(), ...STORAGE.local };
}

function mountTypeOf(p) {
  try {
    if (platform() === "win32") return null;
    const r = spawnSync("df", ["-P", "-T", p], { encoding: "utf8", timeout: 3000 });
    if (r.status === 0) {
      const line = (r.stdout || "").trim().split("\n").pop() || "";
      return line.split(/\s+/)[1] || null;
    }
    // macOS df has no -T; `mount` names the type in parentheses.
    const m = spawnSync("mount", [], { encoding: "utf8", timeout: 3000 });
    const rows = (m.stdout || "").split("\n")
      .map((l) => l.match(/^(\S+) on (.+?) \((\w+)/))
      .filter(Boolean)
      .filter(([, , mp]) => p === mp || p.startsWith(mp.replace(/\/$/, "") + "/"))
      .sort((a, b) => b[2].length - a[2].length);
    return rows.length ? rows[0][3] : null;
  } catch { return null; }
}

// ─── Paths ─────────────────────────────────────────────────────────────

export const presenceDir = (vault) => join(vault, ".projectstore", "presence");
export const leaseDir = (vault) => join(vault, ".projectstore", "leases");
// One cache per observing HOST, not per project directory: "machine-local" has
// to hold even when the project directory itself sits on a sync drive, or two
// devices sharing it would read each other's clock stamps — the exact
// comparison assumption 1 rules out — and flip every verdict on every command.
const hostSlug = () => hostname().split(".")[0].replace(/[^\w.-]+/g, "_");
const observationsPath = () => join(projectRoot(), ".waypost", "state", `peers.${hostSlug()}.json`);

function ensure(dir) {
  mkdirSync(dir, { recursive: true });
  const gi = join(dir, "..", ".gitignore");
  if (!existsSync(gi)) { try { writeFileSync(gi, "# waypost — runtime data, do not commit\n*\n", "utf8"); } catch {} }
  return dir;
}

// Cloud clients rename a losing copy rather than failing the write. Those files
// are not peers — they are evidence that two devices wrote at once, and saying
// so is more useful than silently reading one of them.
const CONFLICT_COPY = /( \d+\.json$|conflicted copy|\(конфликт|\.sync-conflict-)/i;

// ─── The harness process, on this host ─────────────────────────────────
//
// ADR-0007 rules pid liveness out ACROSS hosts: another machine's pid means
// nothing here. On the same host it is exact, and it answers the one question
// the counter cannot: idle, or gone? A session's record used to wait 24h for
// --prune after its harness had exited. So a beat records the harness
// process — the nearest ancestor of the CLI that is not a shell or a sandbox
// wrapper (the per-command shell a harness spawns dies with the command; the
// harness itself lives as long as the session) — with its start time, so a
// reused pid is not mistaken for the original. A reader on the same host looks
// the pid up in the process table: absent, or present with another start
// time, means the session is gone whatever its counter says. No table (Windows,
// no `ps`) and no record mean no opinion: the counter rules stay.
const SHELLS = /(^|\/)-?(sh|bash|zsh|fish|dash|ksh|tcsh|csh|nu|pwsh|powershell|sandbox-exec|bwrap|sudo|env|script|login)$/;

export function processTable() {
  if (platform() === "win32") return null;
  let r;
  try { r = spawnSync("ps", ["axo", "pid=,ppid=,lstart=,comm="], { encoding: "utf8", timeout: 5000 }); } catch { return null; }
  if (!r || r.status !== 0 || !r.stdout) return null;
  const table = new Map();
  for (const line of r.stdout.split("\n")) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\w{3}\s+\w{3}\s+\d+\s+[\d:]+\s+\d{4})\s+(.*)$/);
    if (m) table.set(Number(m[1]), { pid: Number(m[1]), ppid: Number(m[2]), started: m[3].replace(/\s+/g, " "), comm: m[4].trim() });
  }
  return table.size ? table : null;
}

export function harnessProcess(table) {
  // Resolved once by bin/waypost's main(), where process.ppid is the shell or
  // harness, and pinned in WAYPOST_PROC for the scripts it spawns — whose own
  // parent is bin/waypost itself, gone the moment the command ends (G-1).
  if (process.env.WAYPOST_PROC) {
    try { const p = JSON.parse(process.env.WAYPOST_PROC); if (p && p.pid) return p; } catch { /* fall through */ }
  }
  if (table === undefined) table = processTable();
  if (!table) return null;
  let pid = process.ppid;
  for (let depth = 0; depth < 32 && pid > 1; depth++) {
    const p = table.get(pid);
    if (!p) return null;
    if (!SHELLS.test(p.comm)) return { pid: p.pid, started: p.started, comm: basename(p.comm) };
    pid = p.ppid;
  }
  return null;
}

// true: gone; false: alive; null: not decidable here (another host, no
// process recorded, no process table).
export function processGone(rec, table) {
  const proc = rec && rec.proc;
  if (!proc || !proc.pid || rec.host !== hostname().split(".")[0]) return null;
  if (table === undefined) table = processTable();
  if (!table) return null;
  const p = table.get(Number(proc.pid));
  return !p || Boolean(proc.started && p.started !== proc.started);
}

// ─── Heartbeat ─────────────────────────────────────────────────────────

export function selfDescriptor(sessionId, harness) {
  return {
    session: sessionId,
    host: hostname().split(".")[0],
    os: `${platform()}-${osRelease().split(".")[0]}`,
    user: (() => { try { return userInfo().username; } catch { return null; } })(),
    harness: harness || process.env.WAYPOST_HARNESS || null,
    project_root: projectRoot(),
  };
}

// One write per beat. `seq` is ours and only ever increases; `at` is our local
// clock — read by an observer exactly once, on first sight, to seed its own
// observation, never compared against theirs after that. `started_at` is
// minted once per presence file and kept across beats: it is what tells an
// observer "same id, new session" apart from "same session, still here".
export function beat(vault, sessionId, { harness = null, doing = null, claim = null } = {}) {
  ensure(presenceDir(vault));
  const p = join(presenceDir(vault), `${sessionId}.json`);
  let prev = null;
  try { prev = JSON.parse(readFileSync(p, "utf8")); } catch {}
  const rec = {
    ...selfDescriptor(sessionId, harness || (prev && prev.harness)),
    vault_rel: vaultOffset(vault),
    proc: harnessProcess(),
    seq: ((prev && Number(prev.seq)) || 0) + 1,
    at: new Date().toISOString(),
    started_at: (prev && prev.started_at) || new Date().toISOString(),
    doing: doing !== null ? doing : (prev ? prev.doing : null),
    claim: claim !== null ? claim : (prev ? prev.claim : null),
  };
  writeFileAtomic(p, JSON.stringify(rec, null, 2) + "\n");
  return rec;
}

export function clearPresence(vault, sessionId) {
  try { unlinkSync(join(presenceDir(vault), `${sessionId}.json`)); return true; } catch { return false; }
}

// ─── Skew-immune liveness ──────────────────────────────────────────────

function readObservations() {
  try { return JSON.parse(readFileSync(observationsPath(), "utf8")); } catch { return {}; }
}

function writeObservations(obs) {
  try {
    mkdirSync(join(projectRoot(), ".waypost", "state"), { recursive: true });
    writeFileAtomic(observationsPath(), JSON.stringify(obs, null, 2) + "\n", { sweep: false });
  } catch { /* observations are a cache; losing them costs one window of accuracy */ }
}

// Read every peer, and decide liveness from OUR OWN observations of their
// counters. First sight of a peer has no history to judge by, so its own
// timestamp SEEDS the observation — the single place a remote clock is read —
// bounded to "no later than now": a clock set ahead reads as fresh, a clock far
// behind reads as stale, and either way the verdict from then on comes from
// watching the counter. A record first seen stale therefore stays stale until
// its counter is seen to move; it is never resurrected for one window just
// because we started watching (that was the old rule, and it made every
// crashed session's leftover claim block the next commit for the whole claim
// window once something had warmed the cache).
//
// The observation is written on every read by default, including the reads a
// commit makes. A session that only ever commits used to stay on first sight
// forever, re-trusting the remote timestamp every time — so a peer whose clock
// was behind by more than the window was invisible to it no matter how long
// it kept beating (D-3). Seeding from the timestamp is what makes persisting
// safe from any reader: the seed is the same whichever window looks first.
//
// `windowMs` overrides LIVE_WINDOW_MS itself; the storage lag is always added
// on top of whichever window is in force. A claim (ADR-0006) and a plain
// presence check (ADR-0007) read the same per-peer counter but disagree on
// how long silence may mean "still there" — the counter is one observable,
// the window is the caller's policy.
export function peers(vault, { self = null, now = Date.now(), persist = true, windowMs = null } = {}) {
  const dir = presenceDir(vault);
  const storage = storageOf(vault);
  const window = (windowMs == null ? LIVE_WINDOW_MS : windowMs) + storage.lag_ms;
  const obs = readObservations();
  // Rebuilt from this read: an entry whose presence file is gone is dropped,
  // so the cache neither grows without bound nor keeps history for a session
  // that no longer exists (a file merely absent for one read on a sync drive
  // is re-seeded next time, which is never worse than first sight).
  const next = {};
  const out = [];
  const here = hostname().split(".")[0];
  let table;
  const tableOnce = () => (table === undefined ? (table = processTable()) : table);
  let names = [];
  try { names = readdirSync(dir); } catch { return { peers: [], storage, conflicts: [] }; }

  const conflicts = names.filter((n) => n.endsWith(".json") && CONFLICT_COPY.test(n));
  for (const name of names) {
    if (!name.endsWith(".json") || CONFLICT_COPY.test(name)) continue;
    let rec;
    try { rec = JSON.parse(readFileSync(join(dir, name), "utf8")); } catch { rec = null; }
    if (!rec || !rec.session) {
      // A torn or half-synced file is not evidence the session is gone: keep
      // what we knew, or the full file that lands next read would be first
      // sight again — for a peer whose clock is behind, that is the D-3 blind
      // spot reopened until its next beat.
      const key = name.replace(/\.json$/, "");
      if (obs[key]) next[key] = obs[key];
      continue;
    }

    const key = rec.session;
    const seen = obs[key];
    // Keyed by session AND incarnation. `beat()` mints started_at once per
    // presence file, so a different started_at under the same id is a new
    // session that happens to reuse it (the same terminal tab after
    // `sessions --end`, a wrapper exporting one constant WAYPOST_SESSION_ID).
    // Its counter restarts at 1 and can equal the old entry's, and judging it
    // by the old entry's history called a five-second-old session dead — at
    // exactly the two gates that exist to prevent that.
    const started = rec.started_at || null;
    const firstSight = !seen || (seen.started_at || null) !== started;
    let entry;
    if (firstSight) {
      // Their own timestamp, read once. A clock ahead of ours (assumption 1 at
      // the top of this file: clocks do not agree) is clamped to now and reads
      // as fresh — deliberately fail-safe, since a spurious "someone else is
      // live" costs a commit refusal or a lease wait while a spurious "dead"
      // costs a missed collision. An unparsable timestamp reads as fresh for
      // the same reason.
      const own = Date.parse(rec.at);
      entry = { seq: rec.seq, started_at: started, changed_at: Number.isNaN(own) ? now : Math.min(now, own), host: rec.host };
    } else if (seen.seq !== rec.seq) {
      entry = { ...seen, seq: rec.seq, changed_at: now, host: rec.host };
    } else {
      entry = seen;
    }
    next[key] = entry;
    const sinceLocalChange = now - entry.changed_at;
    const isSelf = self != null && rec.session === self;
    // On this host the process table settles "idle or gone" exactly; nothing
    // else about liveness changes (see harnessProcess()).
    const verdict = !isSelf && rec.proc && rec.host === here ? processGone(rec, tableOnce()) : null;
    const gone = verdict === true;
    const live = !gone && sinceLocalChange < window;

    out.push({
      ...rec,
      self: isSelf,
      live,
      ended: gone,
      process_alive: verdict === false,
      basis: gone ? "harness process gone on this host"
        : firstSight ? "first sight (their timestamp seeds the clock; the counter decides from here)" : "observed locally",
      quiet_ms: firstSight ? null : sinceLocalChange,
      file: join(dir, name),
    });
  }
  if (persist) writeObservations(next);
  return { peers: out.sort((a, b) => String(a.session).localeCompare(String(b.session))), storage, conflicts };
}

// A presence record left behind by a session that is simply gone (crashed,
// closed without `--end`) is never removed by liveness alone — a session
// merely quiet for a few minutes must not be reaped. 24h is the same
// threshold `cleanupStaleSessions` already uses for the legacy registry
// (ADR-0007 names this the normal path for stale presence, not a hand
// deletion of someone else's file): not live, not ours, and quiet for longer
// than that by either evidence — our own observation of it standing still, or
// its own timestamp (24h dwarfs any realistic clock skew).
export function prunePresence(vault, { self = null, maxAgeMs = 24 * 60 * 60 * 1000, now = Date.now(), dryRun = false } = {}) {
  const { peers: ps } = peers(vault, { self, now, persist: false });
  let removed = 0;
  for (const p of ps) {
    if (p.self) continue;
    // Its harness process is gone from this host: nothing to wait 24h for.
    if (p.ended) { if (!dryRun) { try { unlinkSync(p.file); } catch {} } removed++; continue; }
    if (p.live) continue;
    // Its harness is still running on this host: idle, not gone. No age
    // threshold — a lowered `--older-than` included — reaps a record whose
    // owner is provably still here, since that would drop its story claim.
    if (p.process_alive) continue;
    // Either evidence is enough once the record is not live: our own
    // observation of it standing still, or its own timestamp — a remote clock,
    // but the 24h threshold dwarfs any real skew, and without it a device that
    // just joined would have to watch a two-day-old ghost for a full day first.
    const own = Date.parse(p.at);
    const age = Math.max(p.quiet_ms != null ? p.quiet_ms : -1, Number.isNaN(own) ? -1 : now - own);
    if (age <= maxAgeMs) continue;
    if (!dryRun) { try { unlinkSync(p.file); } catch {} }
    removed++;
  }
  return removed;
}

// ─── Leases ────────────────────────────────────────────────────────────
//
// A lease says "I am editing these paths right now". It is not a lock: on a
// sync drive nothing can be. Acquisition is write → settle → re-read →
// tie-break, and the loser releases and reports, so two devices converge on one
// owner instead of both believing they hold it.

// Keyed by session as well as path (C-1/G-3): two sessions racing to acquire
// the same path used to compute the SAME filename, so the second write
// silently clobbered the first and an unlink by either side could delete the
// OTHER side's record. One file per (path, session) makes that structurally
// impossible — a race can now only produce two distinct files, which the
// settle → re-read → tie-break protocol below is exactly built to resolve.
const leaseName = (rel, sid) =>
  `${rel.replace(/[^\w.-]+/g, "_").slice(0, 80)}.${hash(rel)}.${String(sid).replace(/[^\w.-]+/g, "_").slice(0, 40)}.json`;

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// A lease is keyed by a path every session spells the same way: vault-relative
// inside the vault, project-relative outside it (`waypost commit` compares leases
// against `git diff --cached --name-only`, which is project-relative), and
// absolute only when the path is under neither. A relative argument is taken
// from the project root, as `waypost commit -- <paths>` takes it. The raw string
// used to go in as typed, so `waypost lease /abs/proj/src/x.rs` recorded a lease
// no staged path could ever match.
const normPath = (s) => String(s || "").replace(/\\/g, "/").replace(/\/+$/, "");
const underPath = (a, base) => (a === base ? "" : a.startsWith(base + "/") ? a.slice(base.length + 1) : null);
export const vaultRel = (p, vault) => {
  const abs = normPath(resolve(projectRoot(), String(p)));
  const inVault = underPath(abs, normPath(vault));
  if (inVault !== null) return inVault;
  const inProject = underPath(abs, normPath(projectRoot()));
  return inProject !== null ? inProject : abs;
};

// Where the vault sits inside the checkout ("vault", "docs/vault", "." when
// the vault is the checkout), or null when it lives outside. Every presence
// record carries it: it is what lets a session on another OS tell "the same
// checkout" from "the same vault" — see sharedTree().
export function vaultOffset(vault) {
  if (!vault) return null;
  const rel = underPath(normPath(vault), normPath(projectRoot()));
  return rel === null ? null : rel === "" ? "." : rel;
}

export function readLeases(vault, { now = Date.now(), self = null, persist = true } = {}) {
  const dir = leaseDir(vault);
  // Observations persist from here by default: `waypost commit` and `acquire`
  // judge a lease holder's liveness through this read, and a reader that
  // never records what it saw is stuck on first sight (see peers()). A
  // diagnostic read (doctor) passes persist:false and leaves no trace.
  const { peers: ps } = peers(vault, { self, now, persist });
  const liveSessions = new Set(ps.filter((p) => p.live).map((p) => p.session));
  const out = [];
  let names = [];
  try { names = readdirSync(dir); } catch { return out; }
  for (const n of names) {
    if (!n.endsWith(".json")) continue;
    let rec;
    try { rec = JSON.parse(readFileSync(join(dir, n), "utf8")); } catch { continue; }
    if (!rec || !rec.path || !rec.session) continue;
    out.push({
      ...rec,
      file: join(dir, n),
      conflicted_copy: CONFLICT_COPY.test(n),
      live: liveSessions.has(rec.session),
      mine: self != null && rec.session === self,
    });
  }
  return out;
}

// Deterministic and symmetric: both devices compute the same winner from the
// same two records, so the loser can stand down without asking anyone.
export function winnerOf(a, b) {
  const key = (r) => `${r.acquired_at} ${r.session}`;
  return key(a) <= key(b) ? a : b;
}

export function acquire(vault, paths, { sessionId, harness = null, now = Date.now(), settleMs = null, force = false } = {}) {
  ensure(leaseDir(vault));
  const storage = storageOf(vault);
  const settle = settleMs == null ? storage.settle_ms : settleMs;
  const results = [];
  const held = [];

  for (const raw of paths) {
    const rel = vaultRel(raw, vault);
    const file = join(leaseDir(vault), leaseName(rel, sessionId));
    const rec = {
      path: rel,
      session: sessionId,
      host: hostname().split(".")[0],
      os: platform(),
      harness: harness || process.env.WAYPOST_HARNESS || null,
      acquired_at: new Date(now).toISOString(),
    };
    const rivals = readLeases(vault, { now, self: sessionId }).filter((l) => l.path === rel && !l.mine);
    const liveRival = rivals.find((l) => l.live);
    if (liveRival && !force) {
      results.push({ path: rel, ok: false, reason: "held", by: liveRival });
      continue;
    }
    // `force` over a live rival: the write below proceeds and the rival's
    // record is left on disk (see the taken_over_from note below — only
    // STALE records are removed), but the result must say so, or "forced
    // over a live session" and "acquired an uncontested path" render the
    // same line.
    const forcedOver = liveRival && force ? liveRival : null;
    // A stale rival is taken over through the normal path (ADR-0007: "never
    // delete what is not yours… a stale lease is taken over through the
    // normal path, never by hand") — this IS that path, and taken_over_from
    // records the fact. Only stale records are removed: a live one bypassed
    // by --force is left on disk, contested but not destroyed, so a device
    // that still believes it holds it is not silently made wrong on disk too.
    const staleRivals = rivals.filter((l) => !l.live);
    if (staleRivals.length) {
      rec.taken_over_from = { session: staleRivals[0].session, host: staleRivals[0].host };
      for (const l of staleRivals) { try { unlinkSync(l.file); } catch {} }
    }
    try { writeFileSync(file, JSON.stringify(rec, null, 2) + "\n", "utf8"); }
    catch (e) { results.push({ path: rel, ok: false, reason: "write failed", error: e.message }); continue; }
    held.push({ rel, file, rec, forcedOver });
  }

  // Settle, then look again: a peer's copy of the same lease may have arrived
  // while we were writing, and on a sync drive our own file may have been
  // duplicated rather than merged.
  if (held.length && settle > 0) sleep(settle);
  // The same clock reference as the first pass: a caller that injects `now`
  // (tests, and any future replay) must not have half the decision made against
  // the real clock and half against theirs.
  const after = now + settle;
  for (const h of held) {
    const others = readLeases(vault, { now: after, self: sessionId })
      .filter((l) => l.path === h.rel && l.session !== sessionId && l.live);
    const rival = others[0];
    if (rival && !force) {
      const win = winnerOf(h.rec, rival);
      if (win !== h.rec) {
        // h.file is OUR OWN file — session-keyed filenames (above) mean it can
        // never be the rival's, so this can never delete a record we do not
        // own even under a genuine simultaneous-write race.
        try { unlinkSync(h.file); } catch {}
        results.push({ path: h.rel, ok: false, reason: "lost the tie-break", by: rival });
        continue;
      }
      // We won: our file is already on disk under our own name, and the
      // rival's file is theirs to remove (it will, on its own next re-read) —
      // nothing here to overwrite or touch.
      results.push({ path: h.rel, ok: true, contested: true, over: rival.session });
      continue;
    }
    if (h.forcedOver) {
      results.push({ path: h.rel, ok: true, forced: true, contested: true, over: h.forcedOver.session });
      continue;
    }
    results.push({ path: h.rel, ok: true, contested: false });
  }
  return { results, storage, settle_ms: settle };
}

export function release(vault, { sessionId, paths = null }) {
  const out = [];
  for (const l of readLeases(vault, { self: sessionId })) {
    if (l.session !== sessionId) continue;
    if (paths && !paths.map((p) => vaultRel(p, vault)).includes(l.path)) continue;
    try { unlinkSync(l.file); out.push(l.path); } catch {}
  }
  return out;
}

function sleep(ms) {
  const sab = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(sab), 0, 0, ms);
}

// ─── CLI ───────────────────────────────────────────────────────────────

// ─── A shared checkout ─────────────────────────────────────────────────
//
// ADR-0007 modelled a shared VAULT. What happened in the field (2026-09-03) was
// a shared CHECKOUT: two machines on one working copy, and a `git checkout --
// <file>` on one of them reverted an edit the other had verified but not yet
// committed. Git runs no hook before checkout/restore/stash/reset/clean, so
// this cannot be prevented — only named while it still matters. Three signals,
// every one about a live peer on ANOTHER host (two sessions on one machine in
// one checkout are ADR-0006's case, covered by leases, and their `--all` stays
// their own call), all advisory like everything else here:
//   1. it reports OUR project root — the same directory under the same path;
//   2. its vault sits inside its checkout at the same offset as ours — the
//      presence file we are reading arrived through a directory inside this
//      checkout, so the checkout is the same one whatever each OS calls it
//      (a separate clone bound to a shared vault reports no offset);
//   3. our project root is on cloud/network storage — the path may differ per
//      OS, the directory cannot.
export function sharedTree(vault, { self = null, now = Date.now(), persist = true, view = null } = {}) {
  const v = view || peers(vault, { self, now, persist });
  const root = normPath(projectRoot());
  const here = hostname().split(".")[0];
  const storage = storageOf(projectRoot());
  const offset = vaultOffset(vault);
  const describe = (p, basis) => ({
    session: p.session, host: p.host, harness: p.harness || null, os: p.os || null,
    project_root: p.project_root || null, basis,
  });
  const found = [];
  for (const p of v.peers) {
    if (!p.live || p.self || !p.host || p.host === here) continue;
    if (p.project_root && normPath(p.project_root) === root) found.push(describe(p, "same project root"));
    else if (offset != null && p.vault_rel != null && normPath(p.vault_rel) === offset) found.push(describe(p, `same vault inside the checkout (${offset}/)`));
    else if (storage.kind !== "local") found.push(describe(p, `project root on ${storage.provider}`));
  }
  return { shared: found.length > 0, with: found, storage };
}

// One sentence every gate repeats, so brief, sessions and commit agree on what
// a shared checkout means and on the one rule that helps.
export const SHARED_TREE_ADVICE = "an uncommitted edit here is uncommitted on their side too: "
  + "`git checkout --`, `restore`, `stash`, `reset --hard` or `clean` from either side erases the other's unsaved work, "
  + "and git has no hook to stop it. Commit verified work at once (`waypost commit -- <paths>`); "
  + "before any revert, check `waypost sessions` and `waypost lease list`.";
export const sharedWith = (st) => st.with
  .map((p) => `${p.session} on ${p.host}${p.harness ? ` (${p.harness})` : ""}, ${p.basis}`).join("; ");

// CLI: node presence.mjs storage | lease <path…> | release [path…] | list
function main() {
  ignoreEpipe();
  const [sub = "storage", ...rest] = process.argv.slice(2);
  const cfg = readConfig();
  if (!cfg || !cfg.vault_path) {
    process.stderr.write("waypost lease: no bound vault — run `waypost bind <vault-path>` first\n");
    process.exit(1);
  }
  const vault = cfg.vault_path;
  const json = rest.includes("--json");
  const paths = rest.filter((a) => !a.startsWith("--"));
  // bin/waypost sets WAYPOST_SESSION_ID before spawning this script (G-1); the
  // fallback (derive it here, from OUR OWN parent pid) only matters when
  // presence.mjs is invoked directly, not through bin/waypost — it used to cost
  // two spawnSync calls into sessions.mjs just to compute the same value
  // lib.mjs already exports.
  const sid = process.env.WAYPOST_SESSION_ID || sessionId();

  switch (sub) {
    case "storage": {
      const { storage } = peers(vault, { persist: false });
      process.stdout.write(JSON.stringify({ vault, storage }, null, 2) + "\n");
      return;
    }
    case "lease": case "acquire": {
      if (!paths.length) { process.stderr.write("waypost lease: usage: waypost lease <path…>\n"); process.exit(1); }
      beat(vault, sid, { harness: process.env.WAYPOST_HARNESS || null });
      const out = acquire(vault, paths, { sessionId: sid, force: rest.includes("--force") });
      if (json) { process.stdout.write(JSON.stringify(out, null, 2) + "\n"); return; }
      for (const r of out.results) {
        if (r.ok) {
          const suffix = r.forced ? `  (forced over ${r.over})` : r.contested ? `  (won a tie-break against ${r.over})` : "";
          process.stdout.write(`leased    ${r.path}${suffix}\n`);
        }
        else process.stdout.write(`REFUSED   ${r.path}  — ${r.reason}`
          + (r.by ? `: ${r.by.session} on ${r.by.host} (${r.by.harness || "?"})` : "") + "\n");
      }
      if (out.storage.kind !== "local") {
        process.stdout.write(`\n(${out.storage.provider}: waited ${out.settle_ms}ms for the write to settle; another device's lease can still be up to ~${Math.round(out.storage.lag_ms / 1000)}s behind)\n`);
      }
      if (out.results.some((r) => !r.ok)) process.exitCode = 1;
      return;
    }
    case "release": {
      const freed = release(vault, { sessionId: sid, paths: paths.length ? paths : null });
      process.stdout.write(freed.length ? freed.map((f) => `released  ${f}\n`).join("") : "nothing leased by this session\n");
      return;
    }
    case "list": {
      const rows = readLeases(vault, { self: sid });
      if (json) { process.stdout.write(JSON.stringify(rows, null, 2) + "\n"); return; }
      if (!rows.length) { process.stdout.write("no leases\n"); return; }
      for (const l of rows) {
        process.stdout.write(`${l.mine ? "*" : " "} ${l.live ? "live " : "stale"} ${l.path.padEnd(40)} ${l.session} on ${l.host} (${l.harness || "?"})\n`);
      }
      return;
    }
    case "watch": {
      // "Real time" on a shared vault means: beat on an interval so other
      // devices keep seeing us, and report THEIR changes as they arrive. There
      // is no push channel on a sync drive — this is polling, and the interval
      // is bounded below by the storage's own propagation delay anyway.
      const { storage } = peers(vault, { persist: false });
      const every = Math.max(5000, Number(process.env.WAYPOST_BEAT_MS) || BEAT_INTERVAL_MS);
      process.stdout.write(`watching ${vault}\n`
        + `  storage: ${storage.provider} (${storage.kind}), peer changes can lag ~${Math.round(storage.lag_ms / 1000)}s\n`
        + `  beating every ${Math.round(every / 1000)}s as ${sid}${process.env.WAYPOST_HARNESS ? ` (${process.env.WAYPOST_HARNESS})` : ""} — ctrl-c to stop\n\n`);
      let known = null;      // null = first tick: print a roster, not N "joined" events
      const tick = () => {
        beat(vault, sid, { harness: process.env.WAYPOST_HARNESS || null });
        const view = peers(vault, { self: sid });
        const now = new Map();
        for (const p2 of view.peers) now.set(p2.session, p2);
        if (known === null) {
          const live = [...now.values()].filter((p2) => p2.live && !p2.self);
          process.stdout.write(live.length
            ? `live now: ${live.map((p2) => `${p2.session} (${p2.harness || "?"}, ${p2.host})${p2.claim && p2.claim.story ? ` on ${p2.claim.story}` : ""}`).join(", ")}\n`
            : "live now: nobody else\n");
          known = now;
          return;
        }
        for (const [id, p2] of now) {
          if (p2.self) continue;
          const before = known.get(id);
          if (!before && p2.live) process.stdout.write(`+ ${stampLine(p2)} joined\n`);
          else if (before && before.live && !p2.live) process.stdout.write(`- ${stampLine(p2)} went quiet\n`);
          else if (before && !before.live && p2.live) process.stdout.write(`+ ${stampLine(p2)} back\n`);
          const b = (before && before.claim && before.claim.story) || null;
          const a = (p2.claim && p2.claim.story) || null;
          if (a !== b && p2.live) process.stdout.write(`~ ${stampLine(p2)} ${a ? `is on ${a}` : "released its story"}\n`);
        }
        for (const [id, p2] of known || []) if (!now.has(id) && p2.live) process.stdout.write(`- ${stampLine(p2)} left\n`);
        const mineLess = readLeases(vault, { self: sid }).filter((l) => l.live && !l.mine);
        const key = mineLess.map((l) => `${l.session}:${l.path}`).sort().join("|");
        if (key !== lastLeases) {
          lastLeases = key;
          if (mineLess.length) {
            process.stdout.write(mineLess.map((l) => `  editing: ${l.path} (${l.session} on ${l.host})\n`).join(""));
          }
        }
        if (view.conflicts.length) process.stdout.write(`⚠️  sync conflicted copies: ${view.conflicts.join(", ")}\n`);
        known = now;
      };
      let lastLeases = "";
      const stampLine = (p2) => `${new Date().toISOString().slice(11, 19)} ${p2.session} (${p2.harness || "?"}, ${p2.host}/${p2.os})`;
      tick();
      const timer = setInterval(tick, every);
      const stop = () => { clearInterval(timer); release(vault, { sessionId: sid }); clearPresence(vault, sid); process.stdout.write("\nstopped; presence cleared\n"); process.exit(0); };
      process.on("SIGINT", stop);
      process.on("SIGTERM", stop);
      return;
    }
    default:
      process.stderr.write(`waypost lease: unknown subcommand "${sub}" (lease|release|list|watch|storage)\n`);
      process.exit(1);
  }
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) main();
