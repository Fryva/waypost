#!/usr/bin/env node
// mps — presence.mjs
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
//      itself; we record locally WHEN WE FIRST SAW each value. "Alive" means
//      "its counter changed within the last N seconds *by our clock*" — a
//      measurement made entirely with one clock, whoever wrote the file.
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
import { join, basename } from "node:path";
import { hostname, platform, release as osRelease, userInfo } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readConfig, projectRoot, ignoreEpipe, writeFileAtomic } from "./lib.mjs";

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
const observationsPath = () => join(projectRoot(), ".mps", "state", "peers.json");

function ensure(dir) {
  mkdirSync(dir, { recursive: true });
  const gi = join(dir, "..", ".gitignore");
  if (!existsSync(gi)) { try { writeFileSync(gi, "# mps — runtime data, do not commit\n*\n", "utf8"); } catch {} }
  return dir;
}

// Cloud clients rename a losing copy rather than failing the write. Those files
// are not peers — they are evidence that two devices wrote at once, and saying
// so is more useful than silently reading one of them.
const CONFLICT_COPY = /( \d+\.json$|conflicted copy|\(конфликт|\.sync-conflict-)/i;

// ─── Heartbeat ─────────────────────────────────────────────────────────

export function selfDescriptor(sessionId, harness) {
  return {
    session: sessionId,
    host: hostname().split(".")[0],
    os: `${platform()}-${osRelease().split(".")[0]}`,
    user: (() => { try { return userInfo().username; } catch { return null; } })(),
    harness: harness || process.env.MPS_HARNESS || null,
    project_root: projectRoot(),
  };
}

// One write per beat. `seq` is ours and only ever increases; `at` is our local
// clock and is published for humans, never used for liveness by anyone else.
export function beat(vault, sessionId, { harness = null, doing = null, claim = null } = {}) {
  ensure(presenceDir(vault));
  const p = join(presenceDir(vault), `${sessionId}.json`);
  let prev = null;
  try { prev = JSON.parse(readFileSync(p, "utf8")); } catch {}
  const rec = {
    ...selfDescriptor(sessionId, harness || (prev && prev.harness)),
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
    mkdirSync(join(projectRoot(), ".mps", "state"), { recursive: true });
    writeFileAtomic(observationsPath(), JSON.stringify(obs, null, 2) + "\n", { sweep: false });
  } catch { /* observations are a cache; losing them costs one window of accuracy */ }
}

// Read every peer, and decide liveness from OUR OWN observations of their
// counters. First sight of a peer has no history to judge by, so it is trusted
// for one window — the single place a remote clock is consulted, and it is
// bounded: after one window we have our own evidence either way.
export function peers(vault, { self = null, now = Date.now(), persist = true } = {}) {
  const dir = presenceDir(vault);
  const storage = storageOf(vault);
  const window = LIVE_WINDOW_MS + storage.lag_ms;
  const obs = readObservations();
  const out = [];
  let names = [];
  try { names = readdirSync(dir); } catch { return { peers: [], storage, conflicts: [] }; }

  const conflicts = names.filter((n) => n.endsWith(".json") && CONFLICT_COPY.test(n));
  for (const name of names) {
    if (!name.endsWith(".json") || CONFLICT_COPY.test(name)) continue;
    let rec;
    try { rec = JSON.parse(readFileSync(join(dir, name), "utf8")); } catch { continue; }
    if (!rec || !rec.session) continue;

    const key = rec.session;
    const seen = obs[key];
    if (!seen || seen.seq !== rec.seq) {
      obs[key] = { seq: rec.seq, changed_at: now, host: rec.host };
    }
    const changedAt = obs[key].changed_at;
    const sinceLocalChange = now - changedAt;
    const firstSight = !seen;
    // Their own claim about freshness, used ONLY on first sight and only to
    // avoid calling a perfectly live peer dead the moment we start watching.
    let claimedAge = null;
    try { claimedAge = now - Date.parse(rec.at); } catch {}
    const live = firstSight
      ? (claimedAge === null || claimedAge < window || claimedAge < 0)
      : sinceLocalChange < window;

    out.push({
      ...rec,
      self: self != null && rec.session === self,
      live,
      basis: firstSight ? "first sight (their timestamp, bounded to one window)" : "observed locally",
      quiet_ms: firstSight ? null : sinceLocalChange,
      file: join(dir, name),
    });
  }
  if (persist) writeObservations(obs);
  return { peers: out.sort((a, b) => String(a.session).localeCompare(String(b.session))), storage, conflicts };
}

// ─── Leases ────────────────────────────────────────────────────────────
//
// A lease says "I am editing these paths right now". It is not a lock: on a
// sync drive nothing can be. Acquisition is write → settle → re-read →
// tie-break, and the loser releases and reports, so two devices converge on one
// owner instead of both believing they hold it.

const leaseName = (rel) => `${rel.replace(/[^\w.-]+/g, "_").slice(0, 80)}.${hash(rel)}.json`;

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export const vaultRel = (p, vault) => {
  const norm = String(p).replace(/\\/g, "/");
  const v = String(vault).replace(/\\/g, "/").replace(/\/$/, "");
  return norm.startsWith(v + "/") ? norm.slice(v.length + 1) : norm;
};

export function readLeases(vault, { now = Date.now(), self = null } = {}) {
  const dir = leaseDir(vault);
  const { peers: ps } = peers(vault, { self, now, persist: false });
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
  const key = (r) => `${r.acquired_at} ${r.session}`;
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
    const file = join(leaseDir(vault), leaseName(rel));
    const rec = {
      path: rel,
      session: sessionId,
      host: hostname().split(".")[0],
      os: platform(),
      harness: harness || process.env.MPS_HARNESS || null,
      acquired_at: new Date(now).toISOString(),
    };
    const existing = readLeases(vault, { now, self: sessionId }).find((l) => l.path === rel && !l.mine);
    if (existing && existing.live && !force) {
      results.push({ path: rel, ok: false, reason: "held", by: existing });
      continue;
    }
    if (existing && !existing.live) rec.taken_over_from = { session: existing.session, host: existing.host };
    try { writeFileSync(file, JSON.stringify(rec, null, 2) + "\n", "utf8"); }
    catch (e) { results.push({ path: rel, ok: false, reason: "write failed", error: e.message }); continue; }
    held.push({ rel, file, rec });
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
        try { unlinkSync(h.file); } catch {}
        results.push({ path: h.rel, ok: false, reason: "lost the tie-break", by: rival });
        continue;
      }
      results.push({ path: h.rel, ok: true, contested: true, over: rival.session });
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

// CLI: node presence.mjs storage | lease <path…> | release [path…] | list
function main() {
  ignoreEpipe();
  const [sub = "storage", ...rest] = process.argv.slice(2);
  const cfg = readConfig();
  if (!cfg || !cfg.vault_path) {
    process.stderr.write("mps lease: no bound vault — run `mps bind <vault-path>` first\n");
    process.exit(1);
  }
  const vault = cfg.vault_path;
  const json = rest.includes("--json");
  const paths = rest.filter((a) => !a.startsWith("--"));
  const sid = process.env.MPS_SESSION_ID
    || (spawnSync(process.execPath, [join(fileURLToPath(new URL(".", import.meta.url)), "sessions.mjs"), "--json"],
        { encoding: "utf8" }).stdout || "").trim() && JSON.parse(
        spawnSync(process.execPath, [join(fileURLToPath(new URL(".", import.meta.url)), "sessions.mjs"), "--json"],
        { encoding: "utf8" }).stdout).session_id;

  switch (sub) {
    case "storage": {
      const { storage } = peers(vault, { persist: false });
      process.stdout.write(JSON.stringify({ vault, storage }, null, 2) + "\n");
      return;
    }
    case "lease": case "acquire": {
      if (!paths.length) { process.stderr.write("mps lease: usage: mps lease <path…>\n"); process.exit(1); }
      beat(vault, sid, { harness: process.env.MPS_HARNESS || null });
      const out = acquire(vault, paths, { sessionId: sid, force: rest.includes("--force") });
      if (json) { process.stdout.write(JSON.stringify(out, null, 2) + "\n"); return; }
      for (const r of out.results) {
        if (r.ok) process.stdout.write(`leased    ${r.path}${r.contested ? `  (won a tie-break against ${r.over})` : ""}\n`);
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
      const every = Math.max(5000, Number(process.env.MPS_BEAT_MS) || BEAT_INTERVAL_MS);
      process.stdout.write(`watching ${vault}\n`
        + `  storage: ${storage.provider} (${storage.kind}), peer changes can lag ~${Math.round(storage.lag_ms / 1000)}s\n`
        + `  beating every ${Math.round(every / 1000)}s as ${sid}${process.env.MPS_HARNESS ? ` (${process.env.MPS_HARNESS})` : ""} — ctrl-c to stop\n\n`);
      let known = null;      // null = first tick: print a roster, not N "joined" events
      const tick = () => {
        beat(vault, sid, { harness: process.env.MPS_HARNESS || null });
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
      process.stderr.write(`mps lease: unknown subcommand "${sub}" (lease|release|list|watch|storage)\n`);
      process.exit(1);
  }
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) main();
