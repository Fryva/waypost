import { hostname } from "node:os";

// Session identity has to be STABLE for as long as the harness session lives,
// or every command invents a new session and the registry fills with ghosts of
// one agent. In order of trust:
//
//   --id                    the caller knows best
//   $WAYPOST_SESSION_ID         set once, by bin/waypost's own main() — process.ppid
//                           there really is the shell/harness that invoked the
//                           CLI, unlike inside a script bin/waypost spawns, whose
//                           parent pid is bin/waypost itself and changes every call
//   a harness/terminal env var   stable per window across processes
//   <host>-<parent pid>     last resort, right only when the caller IS that
//                           original process
//
// The harness name is prefixed when known, so `waypost sessions` reads as who is
// working rather than as a list of numbers.
const TERMINAL_ENV = ["WAYPOST_SESSION_ID", "CLAUDE_CODE_SESSION_ID", "CLAUDE_SESSION_ID", "CODEX_SESSION_ID", "CODEX_THREAD_ID",
  "TERM_SESSION_ID", "ITERM_SESSION_ID", "TMUX_PANE", "WT_SESSION", "KITTY_WINDOW_ID", "SSH_TTY"];

// `--id` and WAYPOST_SESSION_ID are sanitised with the same allowlist
// leaseName (presence.mjs) uses for filenames: a path-like value (`../../x`,
// `2026-09-02/abc`) would otherwise escape the presence directory or,
// worse, silently fail to write a record at all (its containing directory
// does not exist), making the session invisible to every other one. An
// empty sanitised result falls through to the next source. Leading dots go
// too: `../../x` would otherwise become a dotfile that `ls` hides and some
// sync clients skip. The `--id` scan stops at a `--` terminator so a literal
// `--id` argument to a subcommand (e.g. `search -- --id somebody`) is not
// mistaken for the flag.
const sanitiseSessionId = (v) => String(v).replace(/[^\w.-]+/g, "_").replace(/^\.+/, "").slice(0, 64);

// The `--id` half of that precedence on its own, so bin/waypost can weigh it
// against an ALREADY-set WAYPOST_SESSION_ID — which sessionId() never gets to
// see, being called only when the variable is unset. null when the flag is
// absent, or when its value sanitises away to nothing.
export function sessionIdFlag(argv = process.argv) {
  const stop = argv.indexOf("--");
  const scope = stop === -1 ? argv : argv.slice(0, stop);
  const i = scope.indexOf("--id");
  if (i === -1 || !scope[i + 1]) return null;
  return sanitiseSessionId(scope[i + 1]) || null;
}

export function sessionId(argv = process.argv, env = process.env) {
  const flag = sessionIdFlag(argv);
  if (flag) return flag;
  if (env.WAYPOST_SESSION_ID) {
    const id = sanitiseSessionId(env.WAYPOST_SESSION_ID);
    if (id) return id;
  }
  const harness = env.WAYPOST_HARNESS || null;
  for (const k of TERMINAL_ENV) {
    if (!env[k]) continue;
    const slug = String(env[k]).replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(-24);
    if (slug) return `${harness ? harness + "-" : ""}${slug}`;
  }
  return `${harness ? harness + "-" : ""}${hostname().split(".")[0]}-${process.ppid}`;
}

