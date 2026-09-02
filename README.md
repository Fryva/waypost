# Waypost

> A waypost is a signpost for travellers — a marker left where the path forks,
> for whoever comes next. One vault, one CLI, and the same agent roles in every
> harness. Decisions, specs, epics, stories and a kanban board as plain markdown
> in git — so the next agent, or the next model in a year, knows exactly **why**
> everything is the way it is.
>
> Harness-agnostic fork of [ProjectStore](https://github.com/SmartAndPoint/ProjectStore).

## Why a fork

ProjectStore is a Claude Code plugin: slash commands, hooks, a status line and
subagent spawning are wired to one CLI. Waypost keeps the proven core (vault,
layouts, templates, doctor/graph/codemap/reconcile/draft/kanban — pure node,
markdown in git) and replaces the Claude-only wiring with:

- **one neutral CLI**, `waypost`, that owns every write;
- **one definition per agent role**, rendered into whatever each harness
  understands — Claude Code subagents, OpenCode agents, Codex prompts, or a raw
  prompt on stdout for anything else;
- **rules instead of hooks**: `waypost brief` is the session-start packet, run
  because a rule says so rather than because one harness fires an event.

## The loop

task → artifact (ADR / spec / epic / story) → critic → backlog → planner →
reviewer → done. Every *verify* step is a separate fresh-context pass, and the
deterministic `waypost doctor` checks mechanical consistency with zero AI.

## Quick start

```bash
# Pure node, no dependencies. Put bin/waypost on PATH, or call it directly.
waypost setup     # binds a vault, scaffolds it, installs the roles for whichever
              # harnesses this project uses, registers them, and repairs the
              # mechanical findings. Idempotent; --dry-run to look first.
```

That is the whole installation. Afterwards:

```bash
waypost           # is this set up, and what does it need right now
waypost next      # the same, ranked, with the command for each
waypost brief     # orientation at the start of a session, in any harness
waypost draft adr "Use Postgres for primary storage" --write
```

`setup` adopts a vault the project already has (`vault/`, `docs/vault/`,
`knowledge/`) instead of creating a second one, detects the harnesses from the
directories they own, and leaves `waypost doctor` clean.

Every artifact is plain markdown in git. Open the vault in Obsidian for the
graph and board views; GitHub and any editor render it otherwise.

## CLI

| Command | Purpose |
|---------|---------|
| `waypost setup` | the whole install in one idempotent command (`--dry-run`) |
| `waypost next` | what the project needs right now, ranked, with the command for each |
| `waypost bind <vault>` | bind a vault and scaffold the layout (`--layout`, `--lang`, `--force`) |
| `waypost scaffold` | (re)create the layout's folders and index READMEs |
| `waypost brief` | session-start orientation packet (no hook required) |
| `waypost draft <kind> "<title>" [--write]` | render an artifact; `--write` creates it and reconciles |
| `waypost story plan\|close <path> [--write]` | story lifecycle gates |
| `waypost kanban` / `graph` / `codemap` | regenerate one derived view (`--json` previews) |
| `waypost graph --for <path>` | one artifact's typed neighbourhood, instead of the whole graph |
| `waypost search "<text>"` | vault-wide search returning pointers, not documents |
| `waypost reconcile [--write]` | re-derive every view and index |
| `waypost doctor [--install\|--vault] [--fix]` | deterministic diagnostics |
| `waypost diff-refs` | changed-file evidence for `code_refs` |
| `waypost agents …` | `list` / `show` / `install` / `uninstall` / `register` / `model` |
| `waypost prompt [name]` / `waypost skill [name]` | the loop's procedures and skills |
| `waypost sessions [--touch]` | active-session registry |
| `waypost tokens` | what the loop cost — Claude Code transcripts only |
| `waypost status` | bind summary + per-harness role state |

Project root and tool root resolve via `WAYPOST_PROJECT_DIR` and `WAYPOST_HOME`
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
waypost agents list                       # roster + install state per harness
waypost harnesses                         # every harness it can render into
waypost agents install --harness cursor   # or a list, or `all`
waypost agents show critic adr/foo.md     # the raw prompt, for a harness with neither
waypost agents model default sonnet       # pin a model, then re-install
waypost agents model harness:opencode anthropic/claude-sonnet-4-5
```

`default` and per-role pins are harness-blind, so they only apply to harnesses
with a published tier naming (today: Claude Code). For the others, name the
model per harness — a bare `sonnet` is not an id OpenCode can resolve.

A harness is **data**, not code — `harnesses/<id>.json` says where its role
files go and what shape they are, so supporting one more agent CLI is a JSON
file, and a project can add or override an entry in `.waypost/harnesses/`:

| id | Harness | Roles land in | Confidence |
|----|---------|---------------|------------|
| `claude` | Claude Code | `.claude/agents/waypost-<role>.md` | verified |
| `codex` | Codex CLI | `.codex/agents/waypost-<role>.toml` (`sandbox_mode: read-only`) | documented |
| `opencode` | OpenCode | `.opencode/agents/waypost-<role>.md` | documented |
| `gemini` | Gemini CLI | `.gemini/agents/waypost-<role>.md` | documented |
| `grok` | Grok Build (xAI) | `.grok/agents/waypost-<role>.md` | documented |
| `antigravity` | Google Antigravity | `.agents/agents/waypost-<role>/agent.md` | documented |
| `copilot` | GitHub Copilot | `.github/agents/waypost-<role>.agent.md` | documented |
| `kimi` | Kimi Code CLI (Moonshot) | `.kimi-code/agents/waypost-<role>.md` | documented |
| `qwen` | Qwen Code (Alibaba) | `.qwen/agents/waypost-<role>.md` | documented |
| `zcode` | ZCode (Z.ai / Zhipu) | `.zcode/agents/waypost-<role>.md` | documented |
| `codebuddy` | CodeBuddy Code (Tencent) | `.codebuddy/agents/waypost-<role>.md` | documented |
| `dsh` | DeepSeek Harness | — (subagents live in code; routing block only) | documented |
| `qm` | QM (Y Combinator) | — (drives another harness; routing block only) | documented |
| `pi` | Pi (Earendil) | — (no sub-agents by design; routing block only) | documented |
| `cursor` · `windsurf` · `cline` · `lingma` | rules / workflows | per-tool rule files | documented |
| `roo` | Roo Code | `.roomodes` (merged, your own modes untouched) | documented |
| `trae` · `iflow` | Trae (ByteDance), iFlow | rules / agents | inferred |
| anything else | — | `<your-cli> "$(waypost agents show critic) <target>"` |

**A vendor's CLI and a vendor's models are different things.** Moonshot, Zhipu,
Alibaba, Tencent, DeepSeek and xAI ship both — those are the `kimi`, `zcode`,
`qwen`, `codebuddy`, `dsh` and `grok` rows above. MiniMax ships models only (its MMX-CLI
generates media rather than driving a codebase), so it is a *provider* entry:
nothing installs for it, but `waypost commit` records
which model produced the work (`Waypost-Provider: deepseek`) and `waypost log --provider
deepseek` reads it back. The same harness behaves very differently behind a
different model, and nothing else in a repository remembers which one wrote a
commit.

`waypost harnesses` prints the list with what this project actually uses marked, and
`docs/harnesses.md` has the full table and the schema for adding your own. The
confidence column is about evidence: *verified* = documented and exercised here,
*documented* = taken from the vendor's own docs (the entry records the URL),
*inferred* = guessed from a convention, with the assumption written down.

Generated files carry a provenance line with a hash of the render, so
`waypost doctor` sees any drift — an edited file, a changed role, a changed model,
a changed adapter. A file under the `waypost-` prefix *without* that line is
someone's own: install skips it, `--fix` skips it, uninstall never deletes it.
With no harness detected and none named, `install` refuses rather than
scattering all three directories into the project.

## Several harnesses at once

Two agents in two harnesses on one repository is the case this fork exists for,
and it has three failure modes: history that cannot say who did what, generated
files that conflict on every merge, and two sessions opening the same story.

```bash
waypost commit -m "Add the codex adapter" --story PS-1/story-codex-adapter --all
waypost log --story PS-1/story-codex-adapter     # …or --harness codex
waypost merge feature-branch                     # merge, re-derive, then commit
```

Every commit carries git trailers — `Waypost-Harness`, `Waypost-Session`, `Waypost-Story` —
which git itself parses (`git interpret-trailers`, `--format=%(trailers)`), so
the record survives without this tool. Derived views are marked
`merge=waypost-derived` in `.gitattributes`: on conflict they are regenerated from
the artifacts rather than merged line by line (`waypost doctor --fix` wires it).
Opening a story claims it in the session registry inside the vault — which every
harness bound to that vault can read — and `waypost commit` refuses to close a story
another live session still holds. See
[ADR-0006](docs/decisions/0006-commit-protocol.md).

## Several devices and operating systems at once

A vault on iCloud, Dropbox or an SMB share, with sessions on macOS, Windows and
Linux — that arrangement breaks three assumptions a single machine can make:
clocks agree, `mtime` means something, and a write is atomic and unique. None of
them hold, so Waypost does not pretend to lock anything. It coordinates instead:

```bash
waypost watch                     # stay live; report who joins, leaves, or takes a story
waypost lease src/auth.ts         # "I am editing this right now"
waypost sessions                  # who is live, on which OS, holding what
waypost storage                   # what the vault is on, and how far behind presence can be
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
`waypost commit` refuses to write over a file another live session holds.

Cross-OS hygiene is checked rather than hoped for: `waypost doctor` reports names
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

Two different costs, and only one of them is large.

**The standing overhead is small and does not grow with the vault.** Measured on
a 32-artifact project (o200k tokenizer): the routing block 197 tokens, the five
role descriptions a harness injects 92, and `waypost brief` 409 — **698 tokens**
carried into a session, flat whether the vault holds 3 artifacts or 300. In a
100-turn Opus session that is about $0.04. Routine commands are in the same
range: `status` 175, `agents list` 147, `harnesses` 51, `doctor` ~320, a `draft`
preview 156.

**On a large vault the trap is reading derived views whole**, because those do
grow — roughly 66 tokens per artifact in `graph.md`, 51 in a folder index. So
don't read them:

```bash
waypost graph --for adr/use-postgres.md    # 44 tokens, vs 1119 for the whole graph
waypost search "retry budget" --limit 5    # 91 tokens, vs 1516 for one index file
```

Both gaps widen linearly with the vault. Budgets for all of this are enforced by
tests, not by good intentions — see
[ADR-0008](docs/decisions/0008-token-budget.md).

**The roles are where the money is**, and that is the point of them: a measured
critic pass on Opus cost $1.62 (16 requests, 25 tool calls), of which the role's
prompt was 0.08% — the rest is the reading it does. `waypost agents model default
sonnet` cuts that by ~60%. Reserve the roles for ADRs, specs and story reviews
rather than every edit.

What you get for it: a project manager / systems analyst that never forgets to
file, artifacts that are the working backlog and decision log, and an exit hatch
— plain markdown, no server, no proprietary format. Move to any model or any
harness; the orientation is already on disk.

## License

MIT — see [LICENSE](./LICENSE). Upstream ProjectStore is MIT-licensed by
SmartAndPoint; this fork keeps the licence and the attribution.
