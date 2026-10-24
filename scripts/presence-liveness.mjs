import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { hostname } from "node:os";
import { projectRoot, writeFileAtomic } from "./lib.mjs";
import { storageOf, coordinationDirs, presenceDir, legacyPresenceDir, observationsPath } from "./presence-storage.mjs";
import { processTable, processGone } from "./presence-process.mjs";

// A session is considered live while its counter has moved recently, measured
// locally. The window has to cover the storage's propagation delay, or a peer
// on iCloud looks dead between syncs — hence storageOf() below.
export const LIVE_WINDOW_MS = 150_000;      // 5 missed beats on local storage
// Cloud clients rename a losing copy rather than failing the write. Those files
// are not peers — they are evidence that two devices wrote at once, and saying
// so is more useful than silently reading one of them.
export const CONFLICT_COPY = /( \d+\.json$|conflicted copy|\(конфликт|\.sync-conflict-)/i;
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
  const storage = storageOf(coordinationDirs(vault).primary);
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
  // Both locations for one minor version (ADR-0010): the new one first, so a
  // session present in both is read once, from the new one; its other copy is
  // remembered so a reap removes both.
  const legacyDir = legacyPresenceDir(vault);
  const entries = [];
  const seenNames = new Map();
  for (const [d, primaryLoc] of [[dir, true], [legacyDir, false]]) {
    if (!d) continue;
    let names = [];
    try { names = readdirSync(d); } catch { continue; }
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      if (seenNames.has(name)) { seenNames.get(name).files.push(join(d, name)); continue; }
      const e = { name, dir: d, files: [join(d, name)], primaryLoc };
      seenNames.set(name, e); entries.push(e);
    }
  }
  if (!entries.length && !existsSync(dir) && !(legacyDir && existsSync(legacyDir))) return { peers: [], storage, conflicts: [] };

  const conflicts = entries.map((e) => e.name).filter((n) => CONFLICT_COPY.test(n));
  for (const { name, dir: d, files } of entries) {
    if (CONFLICT_COPY.test(name)) continue;
    let rec;
    try { rec = JSON.parse(readFileSync(join(d, name), "utf8")); } catch { rec = null; }
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
      file: join(d, name),
      files,
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
    if (p.ended) { if (!dryRun) { for (const f of p.files || [p.file]) { try { unlinkSync(f); } catch {} } } removed++; continue; }
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
    if (!dryRun) { for (const f of p.files || [p.file]) { try { unlinkSync(f); } catch {} } }
    removed++;
  }
  return removed;
}

