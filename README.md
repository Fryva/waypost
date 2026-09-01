# MultiProjectStore (MPS)

> Harness-agnostic fork of [ProjectStore](https://github.com/SmartAndPoint/ProjectStore).
> One vault, one CLI, and the same agent roles in Claude Code, Codex and
> OpenCode. Decisions, specs, epics, stories and a kanban board as plain
> markdown in git — so the next agent, or the next model in a year, knows
> exactly **why** everything is the way it is.

## Why a fork

ProjectStore is a Claude Code plugin: slash commands, hooks, a status line and
subagent spawning are wired to one CLI. MPS keeps the proven core (vault,
layouts, templates, doctor/graph/codemap/reconcile/draft/kanban — pure node,
markdown in git) and replaces the Claude-only wiring with:

- **one neutral CLI**, `mps`, that owns every write;
- **one definition per agent role**, rendered into whatever each harness
  understands — Claude Code subagents, OpenCode agents, Codex prompts, or a raw
  prompt on stdout for anything else;
- **rules instead of hooks**: `mps brief` is the session-start packet, run
  because a rule says so rather than because one harness fires an event.

## The loop

task → artifact (ADR / spec / epic / story) → critic → backlog → planner →
reviewer → done. Every *verify* step is a separate fresh-context pass, and the
deterministic `mps doctor` checks mechanical consistency with zero AI.

## Quick start

```bash
# Pure node, no dependencies. Either put bin/mps on PATH or call it directly.
bin/mps bind ~/Documents/my-project-vault      # bind + scaffold the layout
bin/mps agents install                         # roles into the harnesses in use
bin/mps agents register                        # routing block in AGENTS.md
bin/mps draft adr "Use Postgres for primary storage" --write
bin/mps doctor
```

At the start of a working session, in any harness:

```bash
bin/mps brief
```

Every artifact is plain markdown in git. Open the vault in Obsidian for the
graph and board views; GitHub and any editor render it otherwise.

## CLI

| Command | Purpose |
|---------|---------|
| `mps bind <vault>` | bind a vault and scaffold the layout (`--layout`, `--lang`, `--force`) |
| `mps scaffold` | (re)create the layout's folders and index READMEs |
| `mps brief` | session-start orientation packet (no hook required) |
| `mps draft <kind> "<title>" [--write]` | render an artifact; `--write` creates it and reconciles |
| `mps story plan\|close <path> [--write]` | story lifecycle gates |
| `mps kanban` / `graph` / `codemap` | regenerate one derived view (`--json` previews) |
| `mps reconcile [--write]` | re-derive every view and index |
| `mps doctor [--install\|--vault] [--fix]` | deterministic diagnostics |
| `mps diff-refs` | changed-file evidence for `code_refs` |
| `mps agents …` | `list` / `show` / `install` / `uninstall` / `register` / `model` |
| `mps prompt [name]` / `mps skill [name]` | the loop's procedures and skills |
| `mps sessions [--touch]` | active-session registry |
| `mps tokens` | what the loop cost — Claude Code transcripts only |
| `mps status` | bind summary + per-harness role state |

Project root and tool root resolve via `MPS_PROJECT_DIR` and `MPS_HOME`
(falling back to `CLAUDE_PROJECT_DIR`/`CLAUDE_PLUGIN_ROOT` for an optional
Claude plugin layer, and finally to cwd / repo root).

## Agent roles, everywhere

Five roles — `critic`, `planner`, `reviewer`, `librarian`, `archaeologist` —
defined once in `agents/*.md` with neutral frontmatter
(`model: reasoning|balanced|fast`, `effort`, `access`, `tools`). They are
read-only *by contract*: where the harness has a tool map (OpenCode) edits are
denied outright, and everywhere the shell stays available — these roles need
`git diff` — so "never write" is stated in the role prompt, not enforced by it.

```bash
mps agents list                       # roster + install state per harness
mps harnesses                         # every harness it can render into
mps agents install --harness cursor   # or a list, or `all`
mps agents show critic adr/foo.md     # the raw prompt, for a harness with neither
mps agents model default sonnet       # pin a model, then re-install
mps agents model harness:opencode anthropic/claude-sonnet-4-5
```

`default` and per-role pins are harness-blind, so they only apply to harnesses
with a published tier naming (today: Claude Code). For the others, name the
model per harness — a bare `sonnet` is not an id OpenCode can resolve.

A harness is **data**, not code — `harnesses/<id>.json` says where its role
files go and what shape they are, so supporting one more agent CLI is a JSON
file, and a project can add or override an entry in `.mps/harnesses/`:

| id | Harness | Roles land in | Status |
|----|---------|---------------|--------|
| `claude` | Claude Code | `.claude/agents/mps-<role>.md` | verified |
| `opencode` | OpenCode | `.opencode/agent/mps-<role>.md` | verified |
| `codex` | Codex CLI | `.codex/prompts/mps-<role>.md` | verified |
| `cursor` | Cursor | `.cursor/rules/mps-<role>.mdc` | best-effort |
| `windsurf` | Windsurf | `.windsurf/workflows/mps-<role>.md` | best-effort |
| `copilot` | GitHub Copilot | `.github/chatmodes/mps-<role>.chatmode.md` | best-effort |
| `gemini` | Gemini CLI | `.gemini/commands/mps/<role>.toml` | best-effort |
| `cline` | Cline | `.clinerules/workflows/mps-<role>.md` | best-effort |
| `roo` | Roo Code | `.roomodes` (merged, your own modes untouched) | best-effort |
| anything else | — | `<your-cli> "$(mps agents show critic) <target>"` |

`mps harnesses` prints the list with what this project actually uses marked, and
`docs/harnesses.md` has the schema for adding your own. *verified* means the
format was checked against that harness's documentation; *best-effort* means it
follows the documented shape but has not been run there.

Generated files carry a provenance line with a hash of the render, so
`mps doctor` sees any drift — an edited file, a changed role, a changed model,
a changed adapter. A file under the `mps-` prefix *without* that line is
someone's own: install skips it, `--fix` skips it, uninstall never deletes it.
With no harness detected and none named, `install` refuses rather than
scattering all three directories into the project.

## Several harnesses at once

Two agents in two harnesses on one repository is the case this fork exists for,
and it has three failure modes: history that cannot say who did what, generated
files that conflict on every merge, and two sessions opening the same story.

```bash
mps commit -m "Add the codex adapter" --story PS-1/story-codex-adapter --all
mps log --story PS-1/story-codex-adapter     # …or --harness codex
mps merge feature-branch                     # merge, re-derive, then commit
```

Every commit carries git trailers — `Mps-Harness`, `Mps-Session`, `Mps-Story` —
which git itself parses (`git interpret-trailers`, `--format=%(trailers)`), so
the record survives without this tool. Derived views are marked
`merge=mps-derived` in `.gitattributes`: on conflict they are regenerated from
the artifacts rather than merged line by line (`mps doctor --fix` wires it).
Opening a story claims it in the session registry inside the vault — which every
harness bound to that vault can read — and `mps commit` refuses to close a story
another live session still holds. See
[ADR-0006](docs/decisions/0006-commit-protocol.md).

## Several devices and operating systems at once

A vault on iCloud, Dropbox or an SMB share, with sessions on macOS, Windows and
Linux — that arrangement breaks three assumptions a single machine can make:
clocks agree, `mtime` means something, and a write is atomic and unique. None of
them hold, so MPS does not pretend to lock anything. It coordinates instead:

```bash
mps watch                     # stay live; report who joins, leaves, or takes a story
mps lease src/auth.ts         # "I am editing this right now"
mps sessions                  # who is live, on which OS, holding what
mps storage                   # what the vault is on, and how far behind presence can be
```

Liveness never compares your clock with someone else's: each session publishes a
counter it increments, and every peer decides "alive" from *its own* observation
of that counter changing. A device whose clock is six hours off is still judged
correctly. The liveness window and the settle wait widen automatically on cloud
and network storage, and every answer says how stale it might be.

Leases are advisory by construction — on a sync drive nothing else is honest.
Acquisition is write → settle → re-read → deterministic tie-break, so two
devices converge on one owner instead of both believing they hold it; a lease
dies with its session, and a takeover is recorded rather than silent.
`mps commit` refuses to write over a file another live session holds.

Cross-OS hygiene is checked rather than hoped for: `mps doctor` reports names
that cannot be checked out on Windows, artifacts that differ only in case, and a
missing line-ending policy (`--fix` writes `* text=auto`). Atomic-write temp
files carry the host that made them, so one machine can never sweep a write
another machine has in flight. See
[ADR-0007](docs/decisions/0007-shared-vault-presence.md).

## Layout (`engineering`)

`adr/`, `specs/`, `epics/<id>/stories/`, `research/`, `concepts/`, `meetings/`,
`ops/`, `diagrams/` — see `scaffold/layouts/engineering.json`.

## Docs

- `docs/decisions/` — ADRs for this fork (harness-agnostic core, vault layout,
  roles across harnesses, path split).
- `docs/how-it-works.md` — the mechanics, and what changed relative to upstream.

## Tests

```bash
npm test        # node --test tests/*.test.mjs — no dependencies
```

## The cost, honestly

Running the loop is not free — ProjectStore measured 22.5% of spend on its own
repo, 10–15% on a typical project. What you get: a project manager / systems
analyst that never forgets to file, artifacts that are the working backlog and
decision log, and an exit hatch — plain markdown, no server, no proprietary
format. Move to any model or any harness; the orientation is already on disk.

## License

MIT — see [LICENSE](./LICENSE). Upstream ProjectStore is MIT-licensed by
SmartAndPoint; this fork keeps the licence and the attribution.
