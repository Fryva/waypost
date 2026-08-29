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

Five read-only roles — `critic`, `planner`, `reviewer`, `librarian`,
`archaeologist` — defined once in `agents/*.md` with neutral frontmatter
(`model: reasoning|balanced|fast`, `effort`, `access`, `tools`).

```bash
mps agents list                       # roster + install state per harness
mps agents install --harness all      # or claude,opencode,codex
mps agents show critic adr/foo.md     # the raw prompt, for a harness with neither
mps agents model default sonnet       # pin a model, then re-install
```

| Harness | File | What it becomes |
|---|---|---|
| Claude Code | `.claude/agents/mps-<role>.md` | a subagent |
| OpenCode | `.opencode/agent/mps-<role>.md` | a `mode: subagent` agent with a tool map |
| Codex | `.codex/prompts/mps-<role>.md` | a custom prompt (`/mps-critic`) |
| anything else | — | `codex exec "$(mps agents show critic) <target>"` |

Generated files carry a provenance line with the source hash, so `mps doctor`
can tell current from stale and `mps agents uninstall` never deletes a file it
did not write.

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
