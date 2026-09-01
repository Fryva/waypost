#!/usr/bin/env node
// mps — sessions.mjs
// Active-session registry, harness-neutral.
//
// Upstream kept this registry alive from Claude Code hooks (SessionStart /
// PreToolUse). A fork that refuses hooks has to make the same fact reachable
// by an explicit call, so this is a plain command: a harness (or a rule that
// tells the agent to run it) touches the registry, and every other session
// working on the same vault can see who else is in there before it opens a
// Memory topic, an ADR or a story on the same subject.
//
// Session identity: --id, else $MPS_SESSION_ID, else <host>-<parent pid> —
// stable for the life of one terminal/harness process, distinct between two
// harnesses open on the same project.
//
// `--touch --file <path>` also records a vault write in this session's
// activity log — the same log `mps brief` reads back to say where a compacted
// or resumed session left off. Upstream filled it from a PostToolUse hook;
// here whoever edits the vault says so.
//
// `--claim <story>` records that this session is working on a story, and
// `--release` drops it. The registry lives in the vault, so a session in any
// harness bound to the same vault reads the same answer — that shared file is
// the whole coordination channel, and `mps commit` refuses to close a story
// another live session still claims.
//
// CLI: node sessions.mjs [--touch [--file <path>]] [--claim <story>] [--release]
//                        [--prune] [--id <id>] [--json]
//      no flag = list the sessions active in the last 30 minutes.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  readConfig,
  projectRoot,
  appendActivity,
  isInsideVault,
  sessionsDir,
  sessionFilePath,
  writeSession,
  touchSession,
  readActiveSessions,
  cleanupStaleSessions,
  ignoreEpipe,
} from "./lib.mjs";

// Live claims across every session on this vault, newest first. A claim is a
// fact with a timestamp, not a lock: it expires with its session's liveness
// window, because a harness that died holding one must not block the vault.
export function claimsOf(vault, maxAgeMinutes = 30) {
  return readActiveSessions(vault, null, maxAgeMinutes)
    .filter((s) => s.claim && s.claim.story)
    .map((s) => ({
      session: s.id,
      story: s.claim.story,
      harness: s.claim.harness || null,
      at: new Date(s.last_active).toISOString(),
      project_root: s.project_root,
    }));
}

// <epic>/<story-stem> from a path inside the vault, or from an already-shaped
// reference. Kept here rather than imported from commit.mjs so the registry has
// no dependency on the commit protocol — the reference format is the contract.
export function storyRefOf(pathOrRef, vault) {
  const raw = String(pathOrRef || "");
  const abs = resolve(raw);
  if (vault && abs.startsWith(vault + "/")) {
    const m = abs.slice(vault.length + 1).match(/^epics\/([^/]+)\/stories\/(.+)\.md$/);
    if (m) return `${m[1]}/${m[2]}`;
  }
  return /^[\w.-]+\/[\w.-]+$/.test(raw) ? raw : null;
}

function patchSession(vault, sid, patch) {
  const p = sessionFilePath(vault, sid);
  let data = {};
  try { data = JSON.parse(readFileSync(p, "utf8")); } catch {}
  writeFileSync(p, JSON.stringify({ ...data, ...patch }, null, 2), "utf8");
}

// Session identity has to be STABLE for as long as the harness session lives,
// or every command invents a new session and the registry fills with ghosts of
// one agent. In order of trust:
//
//   --id                    the caller knows best
//   $MPS_SESSION_ID         a harness that can export one (document this first)
//   a terminal/pane id      stable per window across processes
//   <host>-<parent pid>     last resort: right while one shell drives the CLI,
//                           wrong when each call gets its own shell
//
// The harness name is prefixed when known, so `mps sessions` reads as who is
// working rather than as a list of numbers.
const TERMINAL_ENV = ["MPS_SESSION_ID", "CLAUDE_SESSION_ID", "CODEX_SESSION_ID",
  "TERM_SESSION_ID", "ITERM_SESSION_ID", "TMUX_PANE", "WT_SESSION", "KITTY_WINDOW_ID", "SSH_TTY"];

export function sessionId(argv = process.argv, env = process.env) {
  const i = argv.indexOf("--id");
  if (i !== -1 && argv[i + 1]) return argv[i + 1];
  if (env.MPS_SESSION_ID) return env.MPS_SESSION_ID;
  const harness = env.MPS_HARNESS || null;
  for (const k of TERMINAL_ENV) {
    if (!env[k]) continue;
    const slug = String(env[k]).replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(-24);
    if (slug) return `${harness ? harness + "-" : ""}${slug}`;
  }
  return `${harness ? harness + "-" : ""}${hostname().split(".")[0]}-${process.ppid}`;
}

function die(msg) {
  process.stderr.write(`mps sessions: ${msg}\n`);
  process.exit(1);
}

function main() {
  ignoreEpipe();
  const args = process.argv.slice(2);
  const cfg = readConfig();
  if (!cfg || !cfg.vault_path) die("no bound vault — run `mps bind <vault-path>` first");
  const vault = cfg.vault_path;
  const sid = sessionId();
  const json = args.includes("--json");
  const out = { session_id: sid, vault, touched: false, pruned: 0, active: [] };

  if (args.includes("--touch")) {
    if (!touchSession(vault, sid)) writeSession(vault, sid, projectRoot());
    out.touched = true;
    const fi = args.indexOf("--file");
    if (fi !== -1) {
      if (!args[fi + 1]) die("--file requires a path");
      const abs = resolve(args[fi + 1]);
      if (!isInsideVault(abs, vault)) die(`--file is outside the vault: ${abs}`);
      appendActivity(vault, sid, abs, "Write");
      out.recorded = abs;
    }
  }
  const ci = args.indexOf("--claim");
  if (ci !== -1) {
    if (!args[ci + 1] || args[ci + 1].startsWith("--")) die("--claim requires a story (<epic>/<story-stem>, or its path)");
    if (!touchSession(vault, sid)) writeSession(vault, sid, projectRoot());
    // Normalise to the same reference the commit trailer uses, so a claim made
    // from a path and a commit made from an id are talking about one story.
    const ref = storyRefOf(args[ci + 1], vault) || args[ci + 1];
    patchSession(vault, sid, {
      claim: { story: ref, harness: process.env.MPS_HARNESS || null, at: new Date().toISOString() },
    });
    out.claimed = ref;
  }
  if (args.includes("--release")) {
    if (existsSync(sessionFilePath(vault, sid))) patchSession(vault, sid, { claim: null });
    out.released = true;
  }
  if (args.includes("--prune")) {
    out.pruned = cleanupStaleSessions(vault, 24, sid);
  }

  out.active = readActiveSessions(vault, null, 30).map((s) => ({
    id: s.id,
    project_root: s.project_root,
    host: s.host,
    started_at: s.started_at,
    last_active: new Date(s.last_active).toISOString(),
    claim: (s.claim && s.claim.story) || null,
    self: s.id === sid,
  }));
  out.claims = claimsOf(vault, 30);

  if (json) {
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
    return;
  }
  if (out.touched) process.stdout.write(`registered ${sid}\n`);
  if (out.recorded) process.stdout.write(`recorded   ${out.recorded}\n`);
  if (out.claimed) process.stdout.write(`claimed    ${out.claimed}\n`);
  if (out.released) process.stdout.write(`released\n`);
  if (out.pruned) process.stdout.write(`pruned ${out.pruned} stale session(s)\n`);
  if (!existsSync(sessionsDir(vault))) {
    process.stdout.write("no session registry yet — run `mps sessions --touch` at the start of a session\n");
    return;
  }
  if (!out.active.length) {
    process.stdout.write("no sessions active in the last 30 min\n");
    return;
  }
  for (const s of out.active) {
    process.stdout.write(`${s.self ? "*" : " "} ${s.id.padEnd(24)} ${s.last_active}`
      + `${s.claim ? `  story:${s.claim}` : ""}  ${s.project_root}\n`);
  }
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) main();

export { sessionFilePath };
