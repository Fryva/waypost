# CLI reference

Use `waypost help` for the installed CLI. Required project procedures remain in
[AGENTS.md](../AGENTS.md); consult this page for command and option details.

| Command | What it does |
|---------|--------------|
| `waypost setup` | the whole install in one command (`--dry-run` to look first) |
| `waypost next` | what needs doing now, ranked; adjacent actions sharing a command show it once beneath a counted group |
| `waypost brief` | orientation packet at the start of work (compact cleanup status; `--full` for the tutorial and expanded cleanup labels) |
| `waypost draft <kind> "<title>" [--write]` | draft an artifact; `--write` creates it and reconciles |
| `waypost story plan\|close <path> [--write]` | story lifecycle gates |
| `waypost ready [--all]` | stories that are planned, unblocked (`blocked_by`, a draft spec, a proposed ADR) and unclaimed, with the exact claim command; headings show epic and title (`--all` retains full story references and blockers) |
| `waypost kanban` / `graph` / `codemap` | regenerate one derived view; `--json` streams a full generator preview without writing (`graph --for` remains a query) |
| `waypost graph --for <path>` | exact node metadata inherits the header path; up to 60 typed edges with `in`/`out`/`self` relative to that path; full count and remainder retained |
| `waypost search "<text>"` | vault-wide search returning pointers; retains only `--limit` results while counting all matches; finds the first matching line without splitting the whole document; excludes exact derived-view paths, not same-named source artifacts; exact title matches include their line number without repeating the title; hidden matches get a centered excerpt within 120 UTF-16 units including truncation markers (long matches may be clipped) |
| `waypost reconcile [--write]` | rebuild every view and index; unchanged targets are counted together, pending dry-run changes say `would change`; an exact path used as the row label is shown once; `--json` streams complete per-target records even on partial failure; prose retains failure details and child exit status |
| `waypost doctor [--install\|--vault [<path>]] [--fix] [--full]` | consistency diagnostics; repeated declarative checks are counted by default; repeat with `--full` for commands and reasons; errors and warnings stay complete; `--vault <path>` checks a vault with no binding (CI on a fresh clone) |
| `waypost diff-refs` | changed files as evidence for `code_refs` |
| `waypost agents …` | roles: `list`/`show`/`install`/`uninstall`/`register`/`model` |
| `waypost skills …` | Agent Skills: `install`/`list`/`uninstall`/`validate` — the bundled procedures as standard `SKILL.md`, in the directory each harness discovers |
| `waypost harnesses` | which harnesses are supported, where roles land, how to invoke them |
| `waypost commit -m "<what>" [--task <id>]` | commit with harness/session/story trailers; `--task` adds an external tracker's id |
| `waypost merge <ref>` | merge, re-derive the views, then commit |
| `waypost log [--story\|--task\|--harness]` | history through trailers; adjacent records share date/harness/provider/OS headings, with story/tasks kept per commit; `--json` retains full records; filtered history is paged at one pinned HEAD until `-n` matches or exhaustion, shrinking overflowing pages without raising the capture limit (`-n`: nonnegative safe integer, default 20) |
| `waypost sessions [--touch] [--claim/--release] [--prune [--older-than <span>]]` | active sessions and story claims; adjacent editing rows share identical raw owners when shorter, with full paths and all safety warnings retained; `--json` stays complete |
| `waypost watch` | stay live and see other devices' events |
| `waypost lease <path…>` | announce the files you are editing right now; `lease list` groups adjacent identical owners when shorter, retaining every path and mine/live flag; `--json` retains full records |
| `waypost storage` | what the vault is stored on and how far behind presence can be |
| `waypost prompt [name]` / `waypost skill [name]` | loop procedures and skills |
| `waypost capacity [--json] [--release <id>]` | the machine's real free resources right now, and how many more heavy jobs it can take |
| `waypost run --heavy [--wait <Ns\|Nm>] -- <cmd…>` | the rule: heavy work (a build, a full test suite, a simulator/emulator boot, a whole-disk scan, a background agent that builds or tests) always runs through this, never directly; refused = exit 75 (`waypost prompt heavy`) |
| `waypost status`, `waypost help` | summary and full help |

## Additional commands

| Command | What it does |
|---|---|
| `waypost bind <vault>` | bind a vault and scaffold the layout (`--layout`, `--lang`, `--force`, `--self-install off\|on`) |
| `waypost scaffold` | create any missing layout folders and index READMEs |
| `waypost tokens` | offline token evidence: Claude by default, separate native Codex spans with `--harness codex` |

## Option notes

- `waypost brief`: session-start orientation packet (`--full` for the descent tutorial); installs the running harness's roles when they are missing (`--no-install` to only read; `"self_install": "off"` in the vault policy for every clone)
- `waypost ready [--all]`: planned, unblocked, unclaimed stories with the claim command (WP-15); a story whose spec is not `active` or whose spec's ADR is not `accepted` is blocked
- `waypost status`: bind summary, live sessions, role state

The commit protocol is ADR-0006; presence and leases follow ADR-0007.
