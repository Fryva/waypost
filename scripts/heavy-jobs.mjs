// waypost — heavy-jobs.mjs
// No agents beside a heavy job, in either order (ADR "Memory for heavy
// work"). The live heavy jobs on this machine, read for whoever must not start
// agents beside one: `team`'s peer factories, `brief`, `status` — the slot
// table itself belongs to bin/cli/slots.mjs. And the other order: the peers
// `team` has running, one record per spawned peer process in a table beside
// the slot table, which `run --heavy` reads before it starts a job.

import { join, basename } from "node:path";
import { accessSync, constants as fsConstants } from "node:fs";
import { hostname, uptime as osUptime } from "node:os";
import { unlinkSync, writeFileSync, readFileSync } from "node:fs";
import * as capacity from "./capacity.mjs";
import * as presence from "./presence.mjs";
import { hostId } from "./presence-host.mjs";
import { acquireLock, releaseLock } from "./machine-lock.mjs";
import { machineStateDir, legacyStateDirs, ensureMachineStateDir, writeFileAtomic, stateWriteHint } from "./lib.mjs";

const { readHolders } = capacity;
const { processTable, hostSlug } = presence;

// The live holders of this machine's slot table, minus the slots this
// process itself runs inside: `waypost run --heavy` exports its slot id to
// the job as WAYPOST_HEAVY_SLOT (comma-joined when nested), and on POSIX a
// holder whose wrapper pid is one of our ancestors is ours too — that also
// covers a child whose environment dropped the variable (the test suite's
// own children do). A team run as a heavy job, or a brief inside `npm test`,
// is the job, not something beside it. Never throws: an unreadable table
// reads as "none", the same advisory stance as presence.
export function liveHeavyJobs({ env = process.env, pid = process.pid, home, ...probes } = {}) {
  try {
    const host = hostSlug();
    const dirs = [machineStateDir(home ? { home } : {}), ...legacyStateDirs(home ? { home } : {})].map((d) => join(d, `slots.${host}`));
    const platform = probes.platform ?? process.platform;
    // The process table only once some record is live: readHolders() reads
    // none at all for an empty slot table, and that is the common case.
    let table = probes.table;
    const { live } = readHolders({ dir: dirs[0], dirs: dirs.slice(1), ...probes, platform });
    if (!live.length) return [];
    if (table === undefined && platform !== "win32") table = processTable();
    const own = new Set(String(env.WAYPOST_HEAVY_SLOT || "").split(",").filter(Boolean));
    const ancestors = new Set([pid]);
    for (let p = pid, n = 0; table && p > 1 && n < 256; n++) {
      const row = table.get(p);
      if (!row) break;
      ancestors.add(row.ppid);
      p = row.ppid;
    }
    // The wrapper or, when the wrapper was killed and the job lives on, the job.
    return live.filter((h) => !own.has(h.id) && !ancestors.has(h.proc && h.proc.pid) && !ancestors.has(h.job && h.job.pid));
  } catch { return []; }
}

// One holder in a sentence: what runs, on which machine, since when. The
// command is cut at 80 characters: this line enters the standing context
// (`brief`), and a test suite's command line runs to kilobytes. The whole
// command stays in `waypost capacity` and in the JSON.
const COMMAND_CHARS = 80;
export function heavyJobLine(h) {
  const c = String(h.command || "?").replace(/\s+/g, " ");
  const cmd = c.length > COMMAND_CHARS ? c.slice(0, COMMAND_CHARS - 1) + "…" : c;
  return `\`${cmd}\` on ${h.host || "?"} since ${h.started_at || "?"}`;
}

// The refusal a peer start gets beside a live job, or null. The go-ahead is
// the owner's (WAYPOST_BESIDE_HEAVY=1), and even then the job is named.
export function heavyJobRefusal(jobs, env = process.env) {
  if (!jobs.length) return null;
  const named = jobs.map(heavyJobLine).join("; ");
  if (env.WAYPOST_BESIDE_HEAVY === "1") { process.stderr.write(`waypost: starting agents beside a heavy job (WAYPOST_BESIDE_HEAVY=1) — ${named}\n`); return null; }
  return Object.assign(new Error(`heavy-job-live: a heavy job is running — ${named}. `
    + "No agents beside it: wait until it ends (waypost capacity). Starting them anyway is the owner's call (WAYPOST_BESIDE_HEAVY=1), not an agent's"), { code: "heavy-job-live", heavy_jobs: jobs.map(j => ({ id: j.id, command: j.command, host: j.host, since: j.started_at })) });
}

// ─── the other order: live team peers ──────────────────────────────────
//
// <machineStateDir>/peers.<hostSlug>/<id>.json, one per peer process `team`
// spawned (a conversation: claude, `codex app-server`, a managed `opencode
// serve`; never the short metadata sessions — owner, 2026-11-06). Shaped like
// a slot record, so readHolders()/slotLive() decide liveness unchanged:
// `proc` is the waypost process until the peer is spawned, then the peer
// itself (the waypost process moves to `owner`) — a peer that died on its own
// stops blocking while waypost lives, and an orphan that outlives waypost
// still blocks. On win32 `proc.comm` of a peer is unknown, so its readers pass
// `tasklist: () => null`: signal-0 and the 24-hour cap decide.
export function peersDir({ home } = {}) {
  return join(machineStateDir(home ? { home } : {}), `peers.${hostSlug()}`);
}
const PEER_PROBES = { tasklist: () => null };

export function readPeers({ home, dir = peersDir({ home }), ...probes } = {}) {
  try { return readHolders({ dir, ...PEER_PROBES, ...probes }); }
  catch { return { live: [], stale: [] }; }
}

export function peerLine(p) {
  const c = String(p.command || "?").replace(/\s+/g, " ");
  const cmd = c.length > COMMAND_CHARS ? c.slice(0, COMMAND_CHARS - 1) + "…" : c;
  return `${p.harness || "?"} peer pid ${p.proc && p.proc.pid} \`${cmd}\` since ${p.started_at || "?"} (${p.id})`;
}

// Patient: a peer start is not latency-bound, and on a loaded machine the
// claim's own two-second budget is exactly what runs out.
const PEER_LOCK_WAIT_MS = 15_000;
const registrationFailed = (e, dir) => Object.assign(new Error(`peer-registration-failed: ${dir && e && e.code ? stateWriteHint(dir, e) : (e && e.message || e)}`), { code: "peer-registration-failed" });

// The predictable half of a registration's failure, checked by the read-only
// pre-checks (`inspect`, `dispatchRouted`) BEFORE their journal writes: the
// peer table and the slot table can be created and written. Only a slot lock
// busy past PEER_LOCK_WAIT_MS can still fail later, at the spawn site.
export function assertPeerTableWritable({ home } = {}) {
  const at = home ? { home } : {};
  let dir;
  try {
    for (dir of [join(machineStateDir(at), `slots.${hostSlug()}`), peersDir(at)]) {
      ensureMachineStateDir(dir);
      accessSync(dir, fsConstants.W_OK);
    }
  } catch (e) { throw registrationFailed(e, dir); }
}

// Under the slot lock, the one a heavy claim takes: read the live heavy jobs,
// refuse beside one (heavyJobRefusal), else write this peer's record — so a
// peer start and a heavy claim can never both pass. Returns the handle the
// spawn site keeps: setJob(pid) once the peer runs, release() when it ends
// (idempotent). Fails closed: a lock or write it cannot get is
// `peer-registration-failed`, never a peer started unrecorded.
export async function registerPeer({ harness = null, command = null, cwd = null, env = process.env, home, heavyJobs = liveHeavyJobs, lockWaitMs = PEER_LOCK_WAIT_MS } = {}) {
  const at = home ? { home } : {};
  let slots, dir, lock = null;
  try {
    slots = ensureMachineStateDir(join(machineStateDir(at), `slots.${hostSlug()}`));
    dir = ensureMachineStateDir(peersDir(at));
    const deadline = Date.now() + lockWaitMs;
    while (!(lock = await acquireLock(slots, presence, capacity))) {
      if (Date.now() >= deadline) throw new Error("the slot lock stayed busy");
    }
  } catch (e) { throw registrationFailed(e, dir || slots); }
  let rec, file;
  try {
    const refusal = heavyJobRefusal(heavyJobs({ env, ...at }), env);
    if (refusal) throw refusal;
    const table = process.platform === "win32" ? null : processTable();
    const self = table ? table.get(process.pid) : null;
    const id = `peer-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    rec = {
      id, kind: "peer",
      host: hostname().split(".")[0], host_id: hostId(),
      proc: { pid: process.pid, started: self ? self.started : null, ticks: presence.startTicks(process.pid), comm: basename(process.execPath) },
      owner: null,
      boot: capacity.bootIdentity(), uptime: osUptime(), authority: null,
      started_at: new Date().toISOString(),
      harness, command, cwd,
      session: env.WAYPOST_SESSION_ID || null,
    };
    file = join(dir, `${id}.json`);
    writeFileSync(file, JSON.stringify(rec, null, 2) + "\n", "utf8");
  } catch (e) {
    if (e && e.code === "heavy-job-live") throw e;
    if (file) { try { unlinkSync(file); } catch {} } // never a truncated record left behind
    throw registrationFailed(e, dir);
  } finally { releaseLock(lock); }
  // The boot authority after the lock, as recordAuthority() does for a slot:
  // a record without one is kept, never pruned, on an epoch mismatch.
  try {
    const asked = capacity.bootAuthority({ timeoutMs: capacity.AUTHORITY_WRITE_TIMEOUT_MS });
    if (asked) { rec = { ...rec, authority: asked }; writeFileAtomic(file, JSON.stringify(rec, null, 2) + "\n"); }
  } catch { /* no answer is not a failure */ }
  let released = false;
  return {
    id: rec.id, file,
    setJob(pid) {
      if (released || !pid) return;
      try {
        const cur = JSON.parse(readFileSync(file, "utf8"));
        const table = process.platform === "win32" ? null : processTable();
        const row = table ? table.get(pid) : null;
        const next = { ...cur, owner: cur.owner || cur.proc, proc: { pid, started: row ? row.started : null, ticks: presence.startTicks(pid), comm: null } };
        if (!released) writeFileAtomic(file, JSON.stringify(next, null, 2) + "\n");
      } catch { /* the record stays the waypost process's: still live while it is */ }
    },
    release() { if (released) return; released = true; try { unlinkSync(file); } catch {} },
  };
}
