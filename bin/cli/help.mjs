// Waypost CLI: help.
import { ROOT, VERSION, fail } from "./core.mjs";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ─── prompts & skills ──────────────────────────────────────────────────

function printDoc(dir, name, suffix) {
  const base = join(ROOT, dir);
  const names = readdirSync(base)
    .map((n) => n.replace(/\.md$/, ""))
    .filter((n) => !n.startsWith("."))
    .sort();
  if (!name) {
    process.stdout.write(`${dir}:\n  ${names.join("\n  ")}\n\nPrint one with: waypost ${dir === "prompts" ? "prompt" : "skill"} <name>\n`);
    return;
  }
  // A name, never a path: `waypost prompt ../README` used to print whatever the
  // traversal landed on.
  if (!/^[\w.-]+$/.test(name) || name.includes("..")) fail(`not a valid name: ${name}`);
  // Bundled skills carry the waypost- prefix (the standard wants a name
  // that is unique across every skill a harness loads); the short name
  // still works here.
  if (suffix && !existsSync(join(base, name, suffix)) && existsSync(join(base, `waypost-${name}`, suffix))) name = `waypost-${name}`;
  const p = suffix ? join(base, name, suffix) : join(base, `${name}.md`);
  if (!existsSync(p)) fail(`no such ${dir === "prompts" ? "prompt" : "skill"}: ${name} (have: ${names.join(", ")})`);
  process.stdout.write(readFileSync(p, "utf8"));
}

function help() {
  process.stdout.write(`waypost — Waypost ${VERSION}

USAGE
  waypost <command> [args]
  waypost <command> [args] -- <literal positional, even if it looks like a flag>

START HERE
  setup                    do the whole install: bind a vault, scaffold it,
                           install the roles for the harnesses this project
                           uses, register them, repair the mechanical findings
                           [--vault <path>] [--harness <id>] [--dry-run]
  next                     what this project needs right now, ranked, with the
                           command for each

VAULT
  bind <vault-path>        bind a vault and scaffold the layout (alias: init)
                           [--layout <name>] [--lang <en|ru|es|de|fr|zh>] [--force]
                           [--self-install off|on: whether brief installs roles]
  scaffold                 (re)create the layout's folders and index READMEs
  status                   bound-vault summary + agent-role install state
  draft <kind> "<title>"   render an artifact; --write creates it and reconciles
                           (epic/story take a leading id: draft epic <ID> "…",
                            draft story <EPIC> "…")
                           kinds: adr spec epic story research concept meeting runbook
  story <plan|close> <p>   story lifecycle gate; --write applies
  kanban | graph | codemap regenerate one derived view (--json to preview only)
  graph --for <path>       one artifact's typed neighbourhood, instead of
                           reading a graph that grows with the vault
  search "<text>"          vault-wide search returning pointers, not documents
                           [--kind adr|spec|story|…] [--limit N]
  reconcile [--write]      re-derive every view (indexes, kanban, code-map, graph)
  brief                    session-start orientation packet (run it when you
                           start work: where things live, what is in flight)
  doctor [flags]           deterministic diagnostics (--install|--vault [<path>]|--fix|--full);
                           --vault <path> needs no binding (CI on a fresh clone)
  diff-refs [flags]        changed-file evidence for code_refs

WORKING IN SEVERAL HARNESSES AT ONCE
  commit -m "<what>"       commit with the trailers that say which harness,
                           session, OS and story it came from [--story <id>]
                           [--task <id>: an external tracker's task id, repeatable]
                           [--all: everything not ignored | --tracked]
                           [--dry-run] [-- <paths>]
  merge <ref>              merge, re-derive the views, then commit — so the
                           board in the merge commit matches the merged vault
  log [--story|--task|--harness|--provider|--session|--os <v>]
                           the history, read back through those trailers
                           (--os takes darwin, linux or win32, not "macos")
  sessions --claim <story> tell the other live sessions what you are on
  lease <path…>            announce the files you are editing right now, so a
                           session on another device does not touch them
                           (lease list | lease release [path…])
  watch                    stay live: beat on an interval and report who joins,
                           leaves or picks up a story on another device
  team status [<id>]       experimental host-local task authority and inboxes
  team create <task>       --native-policy-bootstrap prepares protocol calibration
  team refresh <id>        refresh automatic model-strength evidence
  team watch <id>          periodically check evidence [--interval <seconds>]
  team route <id>          preview a manifest [--request-file <json>]; no grant
  team roles <id>          list participants and their observed identity; --assign --coordinator a,b --reviewers c --executors d --reason "<why>" --yes sets roles (owner)
  team host <id>           managed endpoints, relay, review and owned Git flow
  team budget set|status|clear  the machine's token budget for live runs (set --name N --cap <schema>=<n> [--total <n>] --yes --reason "<why>")
                           --operation bootstrap|inspect|relay|review|checkout|
                           candidate|dispatch|publish|recover-publication
                           native-policy-install --cohort <id> --policy-revision <n>
  team-mcp                cooperative stdio inbox tools; --project, --team,
                          --credential (absolute paths); no native wake proof
  team-mcp-config         preview project MCP snippet; --harness, --project,
                          --team, --credential, --name; --write creates only
                          an absent project config, never overwrites settings
                           current scope and limits: docs/team-coordination.md
  storage                  what the vault is stored on and how far behind
                           another device's presence can be
  merge-derived <file>     git merge driver: regenerate a derived view instead
                           of merging two machine-written copies of it

ROLES (same roles in every harness)
  agents list              roles + per-harness install state
  agents show <role>       print the role prompt (fresh-context handoff)
  harnesses                every harness waypost can render roles for, and where
                           they land (* = detected here)
  agents install           render the roles into the harnesses this project
                           uses  [--harness <id>[,<id>…]|all]
  agents uninstall         remove generated role files
  agents register          write the routing block into AGENTS.md / CLAUDE.md
  agents unregister        remove that routing block again  [--dry-run]
  agents model <role|default|harness:<name>> <id>
                           pin a model; role/default reach only harnesses with
                           a published tier naming, harness:<name> the rest

PROCEDURES
  prompt [name]            print a workflow procedure (the verified loop's steps)
  skill [name]             print a bundled skill (waypost-<name> or <name>)
  skills …                 Agent Skills in this project: install [--harness <id,…>|all], list, uninstall, validate
  launcher [--write]       the command on PATH: is it npm's symlink into a checkout that loses its
                           executable bit (one another OS edits)? --write replaces it with a shim
  ready [--all] [--json]   stories that are planned, unblocked (blocked_by, draft spec, proposed ADR) and unclaimed, with the claim command
  sessions [--touch]       active-session registry (--claim/--release/--prune [--older-than 6h])
  tokens [flags]           what the loop cost, from Claude Code transcripts
                           (Claude-only: no other harness writes them)
  profile [--refresh]      the scheme of what waypost works with: detected
                           tools, their cache paths (asked, then env, then
                           default) and the project's ecosystems — rebuilt
                           when missing, older than 30 days, or --refresh
                           [--json]
  size [--project [dir]]   build-artifact sizes, read-only — measures, never
                           deletes; needs no bound vault [--budget <n>] [--json]
  size --global            toolchain/package-manager caches, simulators,
                           containers and temp dirs ≥ 0.1 GB, each with its
                           own clean command — measures a fresh machine
                           profile's paths when one exists [--json for the rest]
  clean [--json]           a classified plan over the project and the machine
                           at once (keep / should / can, with why) — read-only
  clean --apply <id…>|should [--yes --reason "<who agreed, when>"]
                           remove exactly those ids, or every should item;
                           can only by id, keep and manual always refused;
                           re-checked right before each removal, one failure
                           never stops the rest [--json for the full report]
                           on a terminal with no harness detected, asks
                           [y/N] (60s, no otherwise); a harness or no
                           terminal needs --yes --reason
  clean --limit [<N>|free:<P>%|off]
                           the machine-wide automatic-cleanup limit — no
                           value prints the current setting and the last
                           automatic outcome; setting or tightening it needs
                           your own terminal, with no harness detected, and
                           a preview before the [y/N]; off and loosening it
                           work from anywhere [--json]
  capacity [--json]        the machine's real free resources right now: cores,
                           load, available memory and how many more heavy
                           jobs it can take (never cached) [--json for detail]
  capacity --release <id> [--force]
                           recovery path for a stuck slot: refuses a
                           live-looking holder unless --force is given
  run --heavy -- <cmd…>    claim a machine-wide slot, run at lowered priority
                           (nice +10), and release it on exit
                           [--wait <Ns|Nm>] (refused: exit 75, with the
                           reason and the retry command)

HARNESS-AGNOSTIC
  No hooks, no status line, no slash commands: the CLI is the interface, and
  the roles are rendered into whatever each harness understands. A harness is a
  JSON file in harnesses/ — add your own in .waypost/harnesses/ (waypost harnesses).
  Project root: WAYPOST_PROJECT_DIR (else cwd). Tool root: the tree this
  executable belongs to (WAYPOST_HOME applies to a script run directly).
`);
}

export { printDoc, help };
