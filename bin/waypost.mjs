#!/usr/bin/env node
import { accountStateDir, expandHome, isLinkedWorktree, legacyDirsToMove, legacyStateDirs, machineStateDir, sessionId, sessionIdFlag, worktreeTag } from "../scripts/lib.mjs";
import { SCRIPT_URL, VERSION, fail, opt, positionals, readConfig, run, withRegistryHome } from "./cli/core.mjs";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

// ─── lease ─────────────────────────────────────────────────────────────
//
// AGENTS.md and this file's own help() document `waypost lease <path…>` — a path
// as the first token, not a subcommand. presence.mjs's own CLI takes
// `lease|acquire|release|list|watch|storage` as its first token, so a path
// forwarded unchanged reads as an unknown subcommand. Insert the implied
// "lease" subcommand unless the caller already named a real one, or gave only
// flags (`waypost lease --json`, read as "list mine, as json" — there is no path
// to lease, so there is nothing to insert "lease" in front of).
const LEASE_SUBCOMMANDS = new Set(["lease", "acquire", "release", "list", "watch", "storage"]);
function leaseArgs(rest) {
  if (!rest.length) return ["list"];
  if (LEASE_SUBCOMMANDS.has(rest[0])) return rest;
  if (rest[0].startsWith("--")) return ["list", ...rest];
  return ["lease", ...rest];
}

// Presence is only useful if it happens without being asked. Every command that
// implies work beats the session's heartbeat, so another device sees this
// session without anyone remembering `waypost sessions --touch`. Never fails the
// command, never runs for a read-only lookup, and WAYPOST_NO_BEAT=1 turns it off.
// "clean" is deliberately NOT here, unlike "size": it is a working command
// that will remove things once --apply lands (the next commit), so it beats
// the heartbeat like any other write-side command; a plan-only run today
// costs one extra beat, which is cheap.
const QUIET_COMMANDS = new Set(["help", "--help", "-h", "version", "--version", "-v",
  "harnesses", "prompt", "skill", "skills", "agents", "log", "storage", "merge-derived", "size", "capacity"]);

async function heartbeat(cmd) {
  if (QUIET_COMMANDS.has(cmd) || process.env.WAYPOST_NO_BEAT) return;
  try {
    // Harness and session id are already resolved and pinned in the environment
    // by main() (G-1, E-3): the child this command spawns (sessions, lease,
    // watch, status, brief) labels the session the way commits do.
    const { beat } = await import(SCRIPT_URL("presence"));
    const cfg = readConfig();
    if (cfg && cfg.vault_path && existsSync(cfg.vault_path)) {
      beat(cfg.vault_path, process.env.WAYPOST_SESSION_ID, { harness: process.env.WAYPOST_HARNESS || null });
    }
  } catch { /* presence is advisory; a command must never fail because of it */ }
}

// Machine state moved to one root on every OS (the global-rules ADR,
// Decision 1). Whatever an older version left under its own root — on Windows
// one per packaged harness — moves on the first command that finds it; a
// failure is reported and retried next time, never fatal.
async function migrateStateIfNeeded() {
  // The suite's own children never move a developer's real state; a budget
  // still waiting in an old root refuses on its own (run-budget.mjs), so
  // leaving the move for later never opens anything.
  if (process.env.WAYPOST_NO_STATE_MIGRATION === "1") return;
  try {
    // Only roots under this process's own home, or any when that home is the
    // account's: a command run with HOME/USERPROFILE pointed elsewhere never
    // carries the owner's real state there (lib.mjs legacyDirsToMove).
    const from = legacyDirsToMove();
    // A root with something to move that this process may not move: say why,
    // and what to do — otherwise the budget refusal is a dead end.
    const movable = new Set(from);
    const all = legacyStateDirs();
    const stuck = all.filter((d) => !movable.has(d));
    if (stuck.length) {
      const mig0 = await import(SCRIPT_URL("state-migrate"));
      let account = null;
      try { account = (await import("node:os")).userInfo().homedir; } catch {}
      for (const d of stuck) {
        if (!mig0.pendingEntries(d).length) continue;
        process.stderr.write(`waypost: machine state: ${d} is not moved — this process's home (${homedir()}) is not the account's own (${account || "unknown"}). Run any waypost command as the account itself, or move its files into ${accountStateDir() || "the account's own ~/.local/state/waypost"} by hand.\n`);
      }
    }
    if (!from.length) return;
    const mig = await import(SCRIPT_URL("state-migrate"));
    if (!from.some((d) => mig.pendingEntries(d).length)) return;
    const [presence, capacity] = await Promise.all([import(SCRIPT_URL("presence")), import(SCRIPT_URL("capacity"))]);
    const report = await mig.migrateMachineState({ to: machineStateDir(), from, deps: { presence, capacity } });
    for (const line of report) process.stderr.write(`waypost: machine state: ${line}\n`);
  } catch (e) {
    process.stderr.write(`waypost: machine state: could not move it yet (${e.message}) — tried again next run\n`);
  }
}

async function main() {
  const onFail = name => err => fail(`requested ./cli/${name}.mjs: ${err.message}`);
  const argv = process.argv.slice(2);
  // The detached deleter's own entry point (spawnDeleter above), dispatched
  // before anything else in this function: not a session, so none of the
  // --project/heartbeat/harness-detection machinery below applies to a
  // process nobody is watching.
  if (argv[0] === "__waypost-delete") { await (0,(await import("./cli/deleter.mjs").catch(onFail("deleter")))["handleInternalDelete"])(argv.slice(1)); return; }
  // A stdio MCP connection is not a new harness session. Keep stdout strictly
  // protocol-only and do not touch parent membership or advisory presence.
  if (argv[0] === "team-mcp") { run("team-mcp", argv.slice(1)); return; }
  if (argv[0] === "team-mcp-config") { (0,(await import("./cli/mcp-config.mjs").catch(onFail("mcp-config")))["installMcpConfig"])(argv.slice(1)); return; }
  // --project is recognised ONLY in the leading position, before the command
  // name — not anywhere in argv, or a positional argument that happens to
  // equal it (a search term, say) would be swallowed as a global flag (A-8).
  let i = 0;
  while (i < argv.length) {
    if (argv[i] === "--project" && argv[i + 1] !== undefined) {
      process.env.WAYPOST_PROJECT_DIR = resolve(expandHome(argv[i + 1]));
      i += 2;
    } else break;
  }
  const args = argv.slice(i);

  // Harness first, then the session id — in that order, once, here (G-1). The
  // id carries the harness as a prefix, and deriving it before the harness was
  // known used to split one session in two: `8-48df-…` from a command that ran
  // before anything pinned WAYPOST_HARNESS, `claude-8-48df-…` from one that ran
  // after — two presence records, two trailer values, one session. Detection
  // reads the registry, which may hold project overrides, so it runs after
  // --project is known. process.ppid genuinely is the shell or harness that
  // invoked the CLI here — not inside a script bin/waypost spawns, whose parent
  // pid is bin/waypost itself and differs on every invocation. Every child this
  // process spawns inherits both via `env: { ...process.env }`.
  const [cmd = "", ...rest] = args;
  if (cmd && !["help", "--help", "-h", "version", "--version", "-v"].includes(cmd)) await migrateStateIfNeeded();
  // The harness process first (ADR-0007 amendment): the scripts this command
  // spawns beat as well, and from inside them the nearest ancestor is this very
  // process, gone the moment the command ends — and harness detection reads it
  // too, since env markers are inherited across nested harnesses while the
  // process is not. One `ps` per working command.
  if (!process.env.WAYPOST_PROC && !QUIET_COMMANDS.has(cmd)) {
    try {
      const { harnessProcess } = await import(SCRIPT_URL("presence"));
      const p = harnessProcess();
      if (p) process.env.WAYPOST_PROC = JSON.stringify(p);
    } catch { /* no process table: the counter rules stay */ }
  }
  if (!process.env.WAYPOST_HARNESS) {
    try {
      const { detectHarness } = await import(SCRIPT_URL("agents"));
      // Pinned like every read in handleSetup: this is the first registry read
      // of the process, and an unpinned one would both take its answer from a
      // foreign WAYPOST_HOME and prime the memo every later read inherits.
      const h = withRegistryHome(() => detectHarness());
      if (h && h !== "unknown") process.env.WAYPOST_HARNESS = h;
    } catch { /* detection is best-effort; a null harness is still valid */ }
  }
  // An explicit `--id` outranks an id inherited from the environment — the
  // precedence sessionId() documents, and which a pre-set WAYPOST_SESSION_ID
  // used to win against here: under a harness that exports its own id,
  // `sessions --touch --id X` wrote a record for X and beat another one for
  // the ambient session, so one command registered two live sessions.
  const idFromFlag = sessionIdFlag(process.argv);
  if (idFromFlag) process.env.WAYPOST_SESSION_ID = idFromFlag;
  else if (!process.env.WAYPOST_SESSION_ID) process.env.WAYPOST_SESSION_ID = sessionId(process.argv);
  // In a linked worktree an id that came from the environment (a wrapper's
  // constant WAYPOST_SESSION_ID, a Claude session driving two worktrees)
  // would make two live worktrees write one presence record and one lease
  // name; qualify it by the worktree, once, deterministically (ADR-0010).
  // An explicit --id means what it says.
  if (!idFromFlag && isLinkedWorktree()) {
    const tag = `-wt${worktreeTag()}`;
    if (!process.env.WAYPOST_SESSION_ID.endsWith(tag)) process.env.WAYPOST_SESSION_ID += tag;
  }
  await heartbeat(cmd);

  switch (cmd) {
    case "": (0,(await import("./cli/status.mjs").catch(onFail("status")))["handleDefault"])(); break;
    case "setup": await (0,(await import("./cli/setup.mjs").catch(onFail("setup")))["handleSetup"])(rest); break;
    case "next": (0,(await import("./cli/status.mjs").catch(onFail("status")))["handleNext"])(rest); break;
    case "bind": case "init": (0,(await import("./cli/bind.mjs").catch(onFail("bind")))["handleBind"])(rest); break;
    case "scaffold": (0,(await import("./cli/bind.mjs").catch(onFail("bind")))["handleScaffold"])(rest); break;
    case "draft": (0,(await import("./cli/artifacts.mjs").catch(onFail("artifacts")))["handleDraft"])(rest); break;
    case "story": await (0,(await import("./cli/artifacts.mjs").catch(onFail("artifacts")))["handleStory"])(rest); break;
    case "graph": {
      const forPath = opt(rest, "--for");
      if (forPath) (0,(await import("./cli/views.mjs").catch(onFail("views")))["handleGraphQuery"])(forPath, rest); else (0,(await import("./cli/views.mjs").catch(onFail("views")))["handleDerived"])("graph", rest);
      break;
    }
    case "kanban": case "codemap": (0,(await import("./cli/views.mjs").catch(onFail("views")))["handleDerived"])(cmd, rest); break;
    case "search": (0,(await import("./cli/views.mjs").catch(onFail("views")))["handleSearch"])(rest); break;
    case "reconcile": (0,(await import("./cli/views.mjs").catch(onFail("views")))["handleReconcile"])(rest); break;
    case "doctor": run("doctor", rest); break;
    case "diff-refs": run("diff-refs", rest); break;
    case "size": await (0,(await import("./cli/size.mjs").catch(onFail("size")))["handleSize"])(rest); break;
    case "clean": await (0,(await import("./cli/clean.mjs").catch(onFail("clean")))["handleClean"])(rest); break;
    case "profile": await (0,(await import("./cli/profile.mjs").catch(onFail("profile")))["handleProfile"])(rest); break;
    case "capacity": await (0,(await import("./cli/capacity.mjs").catch(onFail("capacity")))["handleCapacity"])(rest); break;
    case "run": await (0,(await import("./cli/run.mjs").catch(onFail("run")))["handleRun"])(rest); break;
    case "agents": run("agents", rest); break;
    case "harnesses": run("agents", ["harnesses", ...rest]); break;
    case "sessions": run("sessions", rest); break;
    case "team": run("team-cli", rest); break;
    case "ready": run("ready", rest); break;
    case "brief": await (0,(await import("./cli/brief.mjs").catch(onFail("brief")))["selfInstall"])(rest); run("brief", rest.filter((a) => a !== "--no-install")); break;
    case "commit": run("commit", rest); break;
    case "merge": run("commit", ["--merge", ...rest]); break;
    case "log": run("commit", ["--log", ...rest]); break;
    case "merge-derived": run("merge-derived", rest); break;
    case "lease": run("presence", leaseArgs(rest)); break;
    case "storage": run("presence", ["storage"]); break;
    case "watch": run("presence", ["watch", ...rest]); break;
    case "tokens": run("tokens", rest); break;
    case "prompt": (0,(await import("./cli/help.mjs").catch(onFail("help")))["printDoc"])("prompts", positionals(rest)[0]); break;
    case "skill": (0,(await import("./cli/help.mjs").catch(onFail("help")))["printDoc"])("skills", positionals(rest)[0], "SKILL.md"); break;
    case "skills": run("skills", rest); break;
    case "launcher": run("launcher", rest); break;
    case "status": await (0,(await import("./cli/status.mjs").catch(onFail("status")))["handleStatus"])(); break;
    case "version": case "--version": case "-v": process.stdout.write(`${VERSION}\n`); break;
    case "help": case "--help": case "-h": (0,(await import("./cli/help.mjs").catch(onFail("help")))["help"])(); break;
    default:
      process.stderr.write(`waypost: unknown command "${cmd}"\n\n`);
      (0,(await import("./cli/help.mjs").catch(onFail("help")))["help"])();
      process.exit(1);
  }
}

main().catch((e) => fail(e && e.message ? e.message : String(e)));
