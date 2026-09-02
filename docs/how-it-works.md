# How Waypost works

Waypost is a harness-agnostic fork of ProjectStore. The core (vault,
layouts, templates, doctor/graph/codemap/reconcile/draft/kanban) is carried over
as it was; the Claude Code interface layer (slash commands, hooks, status line,
spawned subagents) is replaced by one CLI, neutral role definitions, and adapters
for specific harnesses.

## Getting started

```bash
waypost setup        # bind a vault, scaffold it, install and register the roles,
                 # repair the mechanical findings — one command, idempotent
waypost              # is this set up, and what does it need right now
waypost next         # the same question, ranked, with the command for each
```

`waypost setup --dry-run` shows what it would do first. It adopts a vault the
project already has (`vault/`, `docs/vault/`, `knowledge/`) rather than creating
a second one.

## Vault

A directory of artifacts as plain markdown in git. The default layout is
`engineering` (`scaffold/layouts/engineering.json`):

```
vault/
  adr/        <slug>.md
  specs/      <slug>.md
  epics/      <id>/epic.md, <id>/stories/story-<slug>.md
  research/   <slug>.md
  concepts/   <slug>.md
  meetings/   <date>-<slug>.md
  ops/        <slug>.md
  diagrams/
  kanban.md    (derived)
  graph.md     (derived)
  code-map.md  (derived)
  .projectstore.json      vault policy (spec_policy, lifecycle_gates)
  .projectstore/          runtime data: sessions, presence, leases (not committed)
```

The vault stays compatible with upstream ProjectStore: service file names inside
it are not renamed, so one vault opens in either tool (ADR-0004).

## The verified loop

task → artifact (ADR / spec / epic / story) → critic → backlog → planner →
reviewer → done. Every verification step is a separate pass with a fresh
context, and the mechanical half is handled by a deterministic `waypost doctor` with
no LLM involved.

## One CLI

`bin/waypost` is the dispatcher: it owns every write to disk, while the scripts in
`scripts/` stay pure compute printing JSON. That is exactly why doctor can re-run
a generator and compare the result with what is on disk.

| Command | What it does |
|---|---|
| `waypost setup` | the whole install in one command |
| `waypost next` | what the project needs now, ranked |
| `waypost bind <vault>` | bind a vault and scaffold the layout (`--layout`, `--lang`, `--force`) |
| `waypost scaffold` | create any missing layout folders and index READMEs |
| `waypost brief` | session-start orientation packet (`--full` for the descent tutorial) |
| `waypost draft <kind> "<title>" [--write]` | draft an artifact; `--write` creates and reconciles |
| `waypost story plan\|close <path> [--write]` | story lifecycle gates |
| `waypost kanban` / `graph` / `codemap` | regenerate one derived view |
| `waypost graph --for <path>` | one artifact's neighbourhood instead of the whole graph |
| `waypost search "<text>"` | vault-wide search returning pointers |
| `waypost reconcile [--write]` | rebuild every view and index |
| `waypost doctor [--install\|--vault] [--fix]` | deterministic diagnostics |
| `waypost diff-refs` | changed files as evidence for `code_refs` |
| `waypost agents …` | roles: list / show / install / register / model |
| `waypost harnesses` | the registry: where roles land and how to invoke them |
| `waypost commit` / `merge` / `log` | the commit protocol (ADR-0006) |
| `waypost sessions` / `watch` / `lease` / `storage` | presence and leases (ADR-0007) |
| `waypost prompt [name]` / `waypost skill [name]` | loop procedures and skills |
| `waypost status` | bind summary, live sessions, role state |
| `waypost tokens` | what the loop cost, from Claude Code transcripts (the one harness-specific command) |

## Agent roles across harnesses

One definition per role — `agents/<role>.md` with neutral frontmatter
(`model: reasoning|balanced|fast`, `summary`, `effort`, `access`, `tools`).
`waypost agents install` renders it into each harness's own format.

The harness itself is data too: `harnesses/<id>.json` (ADR-0005). Shipped:
`claude` (verified); `codex`, `opencode`, `gemini`, `copilot`, `cursor`,
`windsurf`, `cline`, `roo`, `kimi`, `qwen`, `zcode`, `codebuddy`, `lingma`,
`dsh` (documented); `trae`, `iflow` (inferred). Add your own as a file in
`.waypost/harnesses/` — see `docs/harnesses.md`. `waypost harnesses` prints the list and
marks what is detected in this project.

Separately, model providers (`harnesses/providers/*.json`): DeepSeek, Moonshot,
GLM, MiniMax, DashScope. Those are not harnesses — roles are installed for the
harness you actually run, and the provider is detected from the endpoint or a
vendor key and recorded in the commit as an `Waypost-Provider` trailer.

Every generated file carries a provenance line with a hash of the render: that is
how `waypost doctor` tells "installed and current" from "stale", and how
`waypost agents uninstall` knows which files are its own.

`waypost agents register` writes a routing block between markers into `AGENTS.md`
(and into whichever instruction file each detected harness reads): when to reach
for which role. Re-running replaces the block in place rather than duplicating it.

## Parallel sessions (ADR-0006)

- `waypost commit -m "…" [--story <id>]` — reconciles the views, checks other
  sessions' claims, and writes `Waypost-Harness` / `Waypost-Session` / `Waypost-Provider` /
  `Waypost-Story` trailers.
- `waypost log [--story|--harness|--provider|--session <v>]` — reads that back.
- `waypost merge <ref>` — merge without auto-commit, reconcile, then commit, so the
  board in the merge commit matches the merged vault.
- `waypost merge-derived` — the git merge driver: a conflict in a generated file is
  resolved by regeneration rather than line by line. Installed by
  `waypost doctor --fix`.
- `waypost sessions --claim/--release` (and automatically at the story gates) — who
  is working on what.

## Several devices and operating systems (ADR-0007)

- `waypost watch` — heartbeat plus other devices' events (who joined, went quiet,
  took a story). Any working command also beats on its own.
- `waypost lease <path…>` / `lease list` / `lease release` — advisory path leases
  with a deterministic race resolution; `waypost commit` respects live foreign leases.
- `waypost sessions`, `waypost brief`, `waypost status` — who is live, on which harness, OS
  and device.
- `waypost storage` — storage kind (local/network/cloud) and the presence lag estimate.
- Liveness is computed with the local clock only (a peer's counter plus a local
  observation), so clock skew between machines affects nothing.
- doctor: non-portable names, case collisions, `* text=auto`, sync conflicted
  copies, stale foreign leases.

## Context spend (ADR-0008)

Standing in the context: the routing block (197 tokens), the role descriptions a
harness injects (92), and `waypost brief` (409) — about 700 tokens, and that number
does not grow with the vault. Only derived views grow, which is why they are
never read whole: `waypost graph --for <path>` (44 against 1119) and
`waypost search "<text>"` (91 against 1516 for one index). Detail is behind a flag:
`brief --full`, `harnesses --all`, `agents list -v`, `draft --json`. The budgets
are pinned by tests.

## Doctor

`waypost doctor` is deterministic and AI-free:

- **install**: the bind, the layout and templates, the roles per harness, the
  routing block, `.gitignore`, git in the vault, the merge driver, the
  line-ending policy.
- **vault**: statuses ↔ board ↔ indexes, legal names and slugs, acceptance
  criteria, links (wiki and relative), `code_refs`, supersede links, spec and
  lifecycle gates, portable names, shared-vault state.
- `--fix` repairs only the mechanical things: `.gitignore` entries, `git init` in
  a vault outside the repository, re-rendering roles and the routing block, the
  merge driver and the line-ending policy. The vault side is repaired by
  `waypost reconcile --write`.

Artifact integrity (ADR-0009): a `code_refs` path that no longer resolves is an
issue for an in-progress or done artifact and a warning at any other status —
annotate it `(waiting)`, `(planned)` or `(deleted)` to say it is a promise rather
than a claim. A `supersedes` / `superseded_by` entry naming nothing is an issue;
a one-directional link, or a replaced artifact whose status is not `superseded`,
is a warning. `acceptance_gate: on` in the vault config adds the acceptance gate:
`status: accepted` requires `review_status` to hold an answer rather than
`pending`. Its own key, because `lifecycle_gates` is story-scoped and recommended
by default — a project that wanted story gates never asked for a policy on how
decisions get accepted.

## Paths and environment

- `WAYPOST_PROJECT_DIR` — the project root (fallback: `CLAUDE_PROJECT_DIR`, cwd).
- `WAYPOST_HOME` — the tool root (fallback: `CLAUDE_PLUGIN_ROOT`, the directory above
  `scripts/`).
- `WAYPOST_SESSION_ID`, `WAYPOST_HARNESS`, `WAYPOST_PROVIDER` — session identity and labels.
- `WAYPOST_NO_BEAT=1` — disable the automatic presence heartbeat.
- Bind config: `.waypost/projectstore.json` (legacy `.claude/projectstore.json`).

## What changed relative to ProjectStore

| Upstream (Claude Code) | Waypost |
|---|---|
| `/projectstore:*` slash commands | `bin/waypost` plus `waypost prompt <name>` procedures |
| hooks (SessionStart/PreToolUse/Stop/PreCompact) | `waypost brief`, `waypost sessions`, an automatic heartbeat |
| status line | none (removed with the wiring it described) |
| Claude-only subagents | `agents/*.md` plus a registry of seventeen harnesses |
| `CLAUDE_*`, `.claude/.projectstore/` | `WAYPOST_*`, `.waypost/` |
| marketplace/auto-update checks | none; the version comes from `package.json` |

The core is preserved in meaning: `lib`, `doctor`, `graph`, `codemap`,
`reconcile`, `draft`, `kanban`, `diff-refs`, `story-section`, `tokens`, the
layouts, the templates and the vault mechanics.

## Tests

`npm test` (or `node --test tests/*.test.mjs`) — core predicates, the scripts
(draft/reconcile/graph/story-section), locales, the harness layer (roles,
adapters, registry, CLI, token budgets), the commit protocol, and presence.
