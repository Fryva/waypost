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
// CLI: node sessions.mjs [--touch [--file <path>]] [--prune] [--id <id>] [--json]
//      no flag = list the sessions active in the last 30 minutes.

import { existsSync } from "node:fs";
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

export function sessionId(argv = process.argv) {
  const i = argv.indexOf("--id");
  if (i !== -1 && argv[i + 1]) return argv[i + 1];
  return process.env.MPS_SESSION_ID || `${hostname().split(".")[0]}-${process.ppid}`;
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
    if (fi !== -1 && args[fi + 1]) {
      const abs = resolve(args[fi + 1]);
      if (!isInsideVault(abs, vault)) die(`--file is outside the vault: ${abs}`);
      appendActivity(vault, sid, abs, "Write");
      out.recorded = abs;
    }
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
    self: s.id === sid,
  }));

  if (json) {
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
    return;
  }
  if (out.touched) process.stdout.write(`registered ${sid}\n`);
  if (out.recorded) process.stdout.write(`recorded   ${out.recorded}\n`);
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
    process.stdout.write(`${s.self ? "*" : " "} ${s.id.padEnd(24)} ${s.last_active}  ${s.project_root}\n`);
  }
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) main();

export { sessionFilePath };
