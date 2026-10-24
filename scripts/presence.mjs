#!/usr/bin/env node
import { vaultRel, vaultOffset } from "./presence-checkout.mjs";
export { vaultRel, vaultOffset, sharedTree, SHARED_TREE_ADVICE, sharedWith } from "./presence-checkout.mjs";
import { peers, prunePresence, CONFLICT_COPY } from "./presence-liveness.mjs";
export { LIVE_WINDOW_MS, peers, prunePresence } from "./presence-liveness.mjs";
import { storageOf, coordinationDirs, presenceDir, leaseDir, legacyPresenceDir, legacyLeaseDir } from "./presence-storage.mjs";
export { storageOf, coordinationDirs, presenceDir, leaseDir, hostSlug } from "./presence-storage.mjs";
import { harnessProcess } from "./presence-process.mjs";
export { processTable, harnessProcess, argv0Of, startTicks, processGone } from "./presence-process.mjs";
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
import { join, dirname } from "node:path";
import { hostname, platform, release as osRelease, userInfo } from "node:os";
import { fileURLToPath } from "node:url";
import { readConfig, projectRoot, ignoreEpipe, writeFileAtomic, sessionId, gitCommonDir } from "./lib.mjs";

export const BEAT_INTERVAL_MS = 30_000;

function ensure(dir) {
  mkdirSync(dir, { recursive: true });
  // Inside .git nothing is tracked, so the guard file is only for the vault shape.
  const gi = join(dir, "..", ".gitignore");
  if (!existsSync(gi) && !/\/\.git\//.test(String(dir).replace(/\\/g, "/"))) {
    try { writeFileSync(gi, "# waypost — runtime data, do not commit\n*\n", "utf8"); } catch {}
  }
  return dir;
}


// ─── Heartbeat ─────────────────────────────────────────────────────────

export const osTag = () => `${platform()}-${osRelease().split(".")[0]}`;

export function selfDescriptor(sessionId, harness) {
  return {
    session: sessionId,
    host: hostname().split(".")[0],
    os: osTag(),
    user: (() => { try { return userInfo().username; } catch { return null; } })(),
    harness: harness || process.env.WAYPOST_HARNESS || null,
    project_root: projectRoot(),
    common_dir: gitCommonDir(),
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
  const legacyDir = legacyPresenceDir(vault);
  let prev = null;
  try { prev = JSON.parse(readFileSync(p, "utf8")); } catch {}
  if (!prev && legacyDir) { try { prev = JSON.parse(readFileSync(join(legacyDir, `${sessionId}.json`), "utf8")); } catch {} }
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
  if (legacyDir) {
    // Dual write for one minor version: a peer on the previous version reads
    // only here (ADR-0010).
    try { ensure(legacyDir); writeFileAtomic(join(legacyDir, `${sessionId}.json`), JSON.stringify(rec, null, 2) + "\n"); } catch {}
  }
  return rec;
}

export function clearPresence(vault, sessionId) {
  let any = false;
  for (const d of [presenceDir(vault), legacyPresenceDir(vault)]) {
    if (!d) continue;
    try { unlinkSync(join(d, `${sessionId}.json`)); any = true; } catch {}
  }
  return any;
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

export function readLeases(vault, { now = Date.now(), self = null, persist = true } = {}) {
  const dir = leaseDir(vault);
  // Observations persist from here by default: `waypost commit` and `acquire`
  // judge a lease holder's liveness through this read, and a reader that
  // never records what it saw is stuck on first sight (see peers()). A
  // diagnostic read (doctor) passes persist:false and leaves no trace.
  const { peers: ps } = peers(vault, { self, now, persist });
  const liveSessions = new Set(ps.filter((p) => p.live).map((p) => p.session));
  const out = [];
  const seen = new Map();
  for (const d of [dir, legacyLeaseDir(vault)]) {
    if (!d) continue;
    let names = [];
    try { names = readdirSync(d); } catch { continue; }
    for (const n of names) {
      if (!n.endsWith(".json")) continue;
      if (seen.has(n)) { seen.get(n).files.push(join(d, n)); continue; }
      let rec;
      try { rec = JSON.parse(readFileSync(join(d, n), "utf8")); } catch { continue; }
      if (!rec || !rec.path || !rec.session) continue;
      const row = {
        ...rec,
        file: join(d, n),
        files: [join(d, n)],
        conflicted_copy: CONFLICT_COPY.test(n),
        live: liveSessions.has(rec.session),
        mine: self != null && rec.session === self,
      };
      seen.set(n, row); out.push(row);
    }
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
      for (const l of staleRivals) for (const f of l.files || [l.file]) { try { unlinkSync(f); } catch {} }
    }
    try { writeFileSync(file, JSON.stringify(rec, null, 2) + "\n", "utf8"); }
    catch (e) { results.push({ path: rel, ok: false, reason: "write failed", error: e.message }); continue; }
    const legacy = legacyLeaseDir(vault);
    if (legacy) { try { ensure(legacy); writeFileSync(join(legacy, leaseName(rel, sessionId)), JSON.stringify(rec, null, 2) + "\n", "utf8"); } catch {} }
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
    let any = false;
    for (const f of l.files || [l.file]) { try { unlinkSync(f); any = true; } catch {} }
    if (any) out.push(l.path);
  }
  return out;
}

function sleep(ms) {
  const sab = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(sab), 0, 0, ms);
}

// ─── CLI ───────────────────────────────────────────────────────────────

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
      const c = coordinationDirs(vault);
      process.stdout.write(JSON.stringify({ vault, storage, coordination: { dir: c.primary, legacy: c.legacy, git_common_dir: c.common } }, null, 2) + "\n");
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
