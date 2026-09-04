#!/usr/bin/env node
// waypost — sessions.mjs
// Active-session registry, harness-neutral.
//
// Upstream kept this registry alive from Claude Code hooks (SessionStart /
// PreToolUse). A fork that refuses hooks has to make the same fact reachable
// by an explicit call, so this is a plain command: a harness (or a rule that
// tells the agent to run it) touches the registry, and every other session
// working on the same vault can see who else is in there before it opens a
// Memory topic, an ADR or a story on the same subject.
//
// Session identity: --id, else $WAYPOST_SESSION_ID, else <host>-<parent pid> —
// stable for the life of one terminal/harness process, distinct between two
// harnesses open on the same project.
//
// `--claim <story>` records that this session is working on a story, and
// `--release` drops it. The registry lives in the vault, so a session in any
// harness bound to the same vault reads the same answer — that shared file is
// the whole coordination channel, and `waypost commit` refuses to close a story
// another live session still claims.
//
// `--prune` reaps this session's own legacy registry (24h+ idle) and the
// presence records of sessions that are gone: not live, not ours, quiet past
// the same 24h threshold — the normal path ADR-0007 describes for stale
// presence, as opposed to hand-deleting another session's file.
//
// CLI: node sessions.mjs [--touch] [--claim <story>] [--release]
//                        [--prune] [--id <id>] [--json]
//      no flag = list the sessions active in the last 30 minutes.

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  beat, clearPresence, peers, storageOf, readLeases, acquire, release, vaultRel, prunePresence,
  sharedTree, sharedWith, SHARED_TREE_ADVICE,
} from "./presence.mjs";
import {
  readConfig,
  projectRoot,
  sessionsDir,
  writeSession,
  touchSession,
  cleanupStaleSessions,
  ignoreEpipe,
  sessionId,
  storyRefOf,
} from "./lib.mjs";

// Re-exported for existing callers (commit.mjs, brief.mjs): the derivation
// itself now lives in lib.mjs, next to storyRefOf, so presence.mjs can use it
// without importing this module and creating a cycle.
export { sessionId, storyRefOf };

// ADR-0006 promises a claim survives 30 minutes of silence — much longer than
// presence.mjs's own LIVE_WINDOW_MS (2.5 minutes), which answers "is anyone
// there right now" (ADR-0007), not "does this story still belong to them".
// Both questions read the same per-peer counter; they just apply a different
// window to it, so a session can be "stale" in `waypost sessions` while its claim
// is still live in `conflicts()`.
export const CLAIM_WINDOW_MS = 30 * 60_000;

// Live claims across every session on this vault. A claim is a fact with a
// liveness window, not a lock: a harness that died holding one must not block
// the vault. Liveness comes from presence.mjs, which measures it with ONE clock
// (ours) — mtime and remote timestamps are not comparable across devices.
// The read persists its observations: `waypost commit` reaches presence only
// through here, and a reader that never records what it saw stays on first
// sight forever, re-trusting the remote timestamp on every commit (D-3).
export function claimsOf(vault, { windowMs = CLAIM_WINDOW_MS, now = Date.now() } = {}) {
  return peers(vault, { windowMs, now }).peers
    .filter((p) => p.live && p.claim && p.claim.story)
    .map((p) => ({
      session: p.session,
      story: p.claim.story,
      harness: p.harness || p.claim.harness || null,
      host: p.host,
      os: p.os,
      at: p.at,
      project_root: p.project_root,
    }));
}

function die(msg) {
  process.stderr.write(`waypost sessions: ${msg}\n`);
  process.exit(1);
}

// `--older-than 6h`: a span as <number><s|m|h|d>. Null for anything else,
// including zero — a threshold of nothing is not a threshold.
export function parseDuration(s) {
  const m = String(s || "").trim().match(/^(\d+(?:\.\d+)?)\s*([smhd])$/i);
  if (!m) return null;
  const ms = Math.round(Number(m[1]) * { s: 1e3, m: 60e3, h: 3600e3, d: 86400e3 }[m[2].toLowerCase()]);
  return ms > 0 ? ms : null;
}

function main() {
  ignoreEpipe();
  const args = process.argv.slice(2);
  const cfg = readConfig();
  if (!cfg || !cfg.vault_path) die("no bound vault — run `waypost bind <vault-path>` first");
  const vault = cfg.vault_path;
  const sid = sessionId();
  const json = args.includes("--json");
  const out = { session_id: sid, vault, touched: false, pruned: 0, pruned_presence: 0, active: [] };

  if (args.includes("--touch")) {
    if (!touchSession(vault, sid)) writeSession(vault, sid, projectRoot());
    beat(vault, sid, { harness: process.env.WAYPOST_HARNESS || null });
    out.touched = true;
  }
  const ci = args.indexOf("--claim");
  if (ci !== -1) {
    if (!args[ci + 1] || args[ci + 1].startsWith("--")) die("--claim requires a story (<epic>/<story-stem>, or its path)");
    if (!touchSession(vault, sid)) writeSession(vault, sid, projectRoot());
    // Normalise to the same reference the commit trailer uses, so a claim made
    // from a path and a commit made from an id are talking about one story.
    const ref = storyRefOf(args[ci + 1], vault) || args[ci + 1];
    beat(vault, sid, {
      harness: process.env.WAYPOST_HARNESS || null,
      claim: { story: ref, at: new Date().toISOString() },
    });
    out.claimed = ref;
  }
  if (args.includes("--release")) {
    // Releases the story CLAIM only. Leases are a separate resource, freed by
    // `waypost lease release`; closing a story someone is not editing files
    // for must not silently drop an unrelated file's collision warning (D-1).
    beat(vault, sid, { claim: false });
    out.released = true;
  }
  if (args.includes("--end")) {
    release(vault, { sessionId: sid });
    clearPresence(vault, sid);
    out.ended = true;
  }
  // The 24h threshold is the default, not a law: `--older-than 6h` lowers it
  // explicitly and stays a threshold-bounded mechanical reap (ADR-0007). A
  // record whose harness process is still running on this host is never
  // reaped by age, whatever the threshold — prunePresence checks that.
  const oi = args.indexOf("--older-than");
  let maxAgeMs = 24 * 3600e3;
  if (oi !== -1) {
    if (!args.includes("--prune")) die("--older-than only means something with --prune");
    maxAgeMs = parseDuration(args[oi + 1]);
    if (!maxAgeMs) die(`--older-than needs a span like 6h, 90m or 2d (got ${JSON.stringify(args[oi + 1] || "")})`);
    out.older_than_ms = maxAgeMs;
  }
  if (args.includes("--prune")) {
    out.pruned = cleanupStaleSessions(vault, maxAgeMs / 3600e3, sid);
    out.pruned_presence = prunePresence(vault, { self: sid, maxAgeMs });
  }

  const view = peers(vault, { self: sid });
  out.storage = view.storage;
  out.active = view.peers.filter((p) => p.live).map((p) => ({
    id: p.session,
    host: p.host,
    os: p.os,
    harness: p.harness,
    project_root: p.project_root,
    started_at: p.started_at,
    at: p.at,
    quiet_ms: p.quiet_ms,
    liveness: p.basis,
    claim: (p.claim && p.claim.story) || null,
    self: p.self,
  }));
  out.stale = view.peers.filter((p) => !p.live).map((p) => ({ id: p.session, host: p.host, at: p.at, ended: !!p.ended }));
  out.claims = claimsOf(vault);
  out.leases = readLeases(vault, { self: sid })
    .filter((l) => l.live)
    .map((l) => ({ path: l.path, session: l.session, host: l.host, harness: l.harness, mine: l.mine }));
  if (view.conflicts.length) out.sync_conflicts = view.conflicts;
  const shared = sharedTree(vault, { self: sid, view });
  out.shared_tree = { shared: shared.shared, with: shared.with };

  if (json) {
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
    return;
  }
  if (out.touched) process.stdout.write(`registered ${sid}\n`);
  if (out.claimed) process.stdout.write(`claimed    ${out.claimed}\n`);
  if (out.released) process.stdout.write(`released\n`);
  if (out.ended) process.stdout.write(`ended      presence cleared\n`);
  if (out.pruned) process.stdout.write(`pruned ${out.pruned} stale session(s)\n`);
  if (out.pruned_presence) process.stdout.write(`pruned ${out.pruned_presence} stale presence record(s)\n`);
  if (!args.includes("--prune")) {
    // Both registries count: the legacy per-session files and the presence
    // records --prune would reap (dry run — nothing is removed here).
    const staleCount = cleanupStaleSessions(vault, 24, sid, { dryRun: true })
      + prunePresence(vault, { self: sid, dryRun: true });
    if (staleCount > 0) {
      process.stdout.write(`${staleCount} stale session record(s) — waypost sessions --prune\n`);
    }
  }
  // The legacy registry is optional since presence beats by itself; its hint
  // must not hide a peer that is live right now (a shared checkout, for one).
  if (!existsSync(sessionsDir(vault)) && !out.active.some((s) => !s.self)) {
    process.stdout.write("no session registry yet — run `waypost sessions --touch` at the start of a session\n");
    return;
  }
  const st = out.storage;
  if (st && st.kind !== "local") {
    process.stdout.write(`storage: ${st.provider} (${st.kind}) — presence from other devices can lag ~${Math.round(st.lag_ms / 1000)}s\n\n`);
  }
  if (!out.active.length) {
    process.stdout.write("nobody is live on this vault right now\n");
  }
  for (const s of out.active) {
    process.stdout.write(`${s.self ? "*" : " "} ${String(s.id).padEnd(22)} ${String(s.harness || "?").padEnd(9)}`
      + ` ${String(`${s.host}/${s.os}`).padEnd(20)}${s.claim ? ` story:${s.claim}` : ""}\n`);
  }
  for (const l of out.leases.filter((x) => !x.mine)) {
    process.stdout.write(`  editing: ${l.path}  (${l.session} on ${l.host})\n`);
  }
  if (out.shared_tree.shared) {
    process.stdout.write(`\n⚠️  shared checkout: ${sharedWith(shared)} — ${SHARED_TREE_ADVICE}\n`);
  }
  if (out.sync_conflicts && out.sync_conflicts.length) {
    process.stdout.write(`\n⚠️  the sync client left ${out.sync_conflicts.length} conflicted copy(ies) in the presence directory:\n`
      + out.sync_conflicts.map((c) => `    ${c}\n`).join("")
      + "    two devices wrote at once; delete them once you know which device is authoritative.\n");
  }
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) main();
