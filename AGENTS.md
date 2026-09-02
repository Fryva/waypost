# AGENTS.md

Instructions for any agent harness working on **MultiProjectStore (MPS)**.

MPS is a harness-agnostic fork of ProjectStore: one project engine (decisions,
specs, epics, stories, a kanban board — markdown in git), one CLI `mps`, and one
set of agent roles available identically from every harness. No hooks, no status
line, no slash commands as a required interface.

## Start here

Run `mps` with no arguments. It answers the only two questions that matter: is
this project set up, and what does it need right now. If it is not set up,
`mps setup` does the whole install in one command — bind a vault, scaffold it,
install the roles for the harnesses this project uses, register them, and repair
whatever is mechanical.

## Required context

Before analysing a task, planning, editing or running checks:

1. Read this file in full.
2. Run `mps brief` — the orientation packet for the bound vault (where things
   live, what is in flight, in what order to read). It replaces upstream's
   SessionStart hook.
3. Read `docs/decisions/README.md` and the related ADRs when the task touches the
   fork's architecture, CLI, roles, layouts, templates or working mechanics.
4. `mps next` — what this project needs right now, ranked, with the command for
   each.

## What MPS does

- **Vault** — a directory of artifacts as markdown in git: `adr/`, `specs/`,
  `epics/<id>/stories/`, `research/`, `concepts/`, `meetings/`, `ops/`,
  `diagrams/` (the `engineering` layout).
- **The verified loop**: task → artifact (ADR/spec/epic/story) → critic →
  backlog → planner → reviewer → done. Every verification step is a separate
  pass with a fresh context.
- **A deterministic doctor**: `mps doctor` checks consistency with no AI.

## The CLI (instead of slash commands)

| Command | What it does |
|---------|--------------|
| `mps setup` | the whole install in one command (`--dry-run` to look first) |
| `mps next` | what needs doing now, ranked, with the command for each |
| `mps brief` | orientation packet at the start of work (`--full` for the tutorial) |
| `mps draft <kind> "<title>" [--write]` | draft an artifact; `--write` creates it and reconciles |
| `mps story plan\|close <path> [--write]` | story lifecycle gates |
| `mps kanban` / `graph` / `codemap` | regenerate one derived view |
| `mps graph --for <path>` | one artifact's neighbourhood instead of the whole graph |
| `mps search "<text>"` | vault-wide search returning pointers, not documents |
| `mps reconcile [--write]` | rebuild every view and index |
| `mps doctor [--install\|--vault] [--fix]` | consistency diagnostics |
| `mps diff-refs` | changed files as evidence for `code_refs` |
| `mps agents …` | roles: `list`/`show`/`install`/`uninstall`/`register`/`model` |
| `mps harnesses` | which harnesses are supported, where roles land, how to invoke them |
| `mps commit -m "<what>"` | commit with harness/session/story trailers |
| `mps merge <ref>` | merge, re-derive the views, then commit |
| `mps log [--story\|--harness]` | history read back through those trailers |
| `mps sessions [--touch] [--claim/--release]` | active sessions and story claims |
| `mps watch` | stay live and see other devices' events |
| `mps lease <path…>` | announce the files you are editing right now |
| `mps storage` | what the vault is stored on and how far behind presence can be |
| `mps prompt [name]` / `mps skill [name]` | loop procedures and skills |
| `mps status`, `mps help` | summary and full help |

Every write to disk is made by the dispatcher `bin/mps`; the scripts under
`scripts/` are pure compute printing JSON. Never hand-edit a derived view: it is
regenerated.

## Agent roles (the same roles in every harness)

A role is defined once in `agents/<role>.md`; `mps agents install` renders it
into the format of whichever harness the project uses. `mps harnesses` lists
them — Claude Code, Codex, OpenCode, Kimi Code CLI, Qwen Code, ZCode, CodeBuddy
Code, DeepSeek Harness, Grok Build, Google Antigravity, QM, Pi, Cursor,
Windsurf, Cline, Copilot, Gemini CLI, Roo Code, Tongyi Lingma, Trae, iFlow. That list is data, not code: a harness is a JSON file
in `harnesses/`, and your own goes in `.mps/harnesses/` (see
`docs/harnesses.md`). Where a harness has no role concept, `mps agents show
<role>` prints the prompt for a separate run.

- **Every role runs in a fresh context, separate from the author.** Reviewing
  your own work in your own context removes the entire point of the role.
- `mps-critic` — after writing or revising an artifact or a design proposal,
  before treating it as final.
- `mps-planner` — before implementing an epic or story: a plan grounded in how
  previous epics landed in the code (`code_refs`).
- `mps-reviewer` — after the code, before commit or story-done: does the diff
  close the acceptance criteria?
- `mps-librarian`, `mps-archaeologist` — semantic vault curation, and recovering
  decisions from an existing codebase.
- Roles are read-only by contract: edits are denied by the tool map or sandbox
  where the harness has one, the shell stays open, and "never write" is carried
  by the role prompt. They propose; writes go through the approval-gated `mps`
  flow.
- Role models: `mps agents model default <id>` applies to harnesses with a
  published tier naming (Claude Code); for the others use
  `mps agents model harness:<name> <id>`. Re-run `mps agents install` afterwards.
- A vendor's CLI and a vendor's models are different entries. Moonshot, Zhipu,
  Alibaba, Tencent, DeepSeek and xAI ship both (`kimi`/`zcode`/`qwen`/
  `codebuddy`/`dsh`/`grok` are tools; `moonshot`/`glm`/`dashscope`/`deepseek`/
  `xai` are models); MiniMax ships models only. A harness with no role-file
  format (`roles.shape: "none"`, as with `dsh`, `qm` and `pi`) still receives the
  routing block, and a role is reached with
  `mps agents show <role>` or through a subagent that harness can spawn.

## Working in several harnesses at once

One project may be driven by several sessions at the same time (ADR-0006):

- **Commit through `mps commit -m "<what>" [--story <id>] [--all]`.** It
  reconciles the derived views, checks other sessions' claims, and writes the
  `Mps-Harness` / `Mps-Session` / `Mps-Provider` / `Mps-Story` trailers. One
  commit, one story.
- **`mps log [--story|--harness|--provider|--session <v>]`** reads that back. A
  commit made outside `mps commit` carries no trailers; `mps log` says how many.
- **Opening a story claims it** (`mps story plan --write`), closing releases it.
  Check `mps sessions` first: if a story is already held, that is duplicated work.
- **Never merge derived views by hand.** `mps doctor --fix` wires `.gitattributes`
  and the merge driver; a conflict in `kanban.md`/`graph.md`/`code-map.md`/an
  index is resolved by regeneration. Prefer `mps merge <ref>`, which puts the
  correct board in the merge commit itself.
- **Session identity**: a harness should export `MPS_SESSION_ID` (and
  `MPS_HARNESS` when it cannot be detected from the environment), otherwise the
  id is derived from the terminal or the parent pid and may fragment.

## Several devices and operating systems (ADR-0007)

- **Start of work**: any working command beats the heartbeat automatically; for a
  long session run `mps watch` in the background. `mps brief` and `mps status`
  show who else is live and what they hold.
- **Before editing files someone else might touch**: `mps lease <path…>`. A
  refusal names the device and harness holding it. `mps lease release` when done;
  `mps commit` refuses to write over a live foreign lease.
- **This is advisory coordination, not a lock.** On a cloud drive another
  device's data can lag (the command says by how much). "Nobody is working"
  means "nothing has synced", not "nobody is there".
- **Never delete what is not yours**: other hosts' temp files, other sessions'
  presence or lease records, files without mps provenance. A stale lease is
  taken over through the normal path, never by hand; a presence record quiet
  for 24h+ is reaped the same way, by `mps sessions --prune`, never by hand.
- **Cross-OS hygiene**: `mps doctor` catches names that cannot be checked out on
  Windows, case collisions and a missing line-ending policy; `--fix` writes
  `* text=auto`. Do not create vault names with `<>:"|?*`, with a trailing space
  or dot, or differing only in case.

## Context spend (ADR-0008)

- **Never read derived views whole.** `graph.md` and the indexes grow linearly
  (~66 and ~51 tokens per artifact). Use `mps graph --for <path>` and
  `mps search "<text>" [--kind] [--limit]`: at 32 artifacts that is 44 and 91
  tokens against 1119 and 1516, and the gap widens with the vault.
- **Detail is behind a flag.** By default commands answer the question:
  `mps brief` (`--full`), `mps harnesses` (`--all`), `mps agents list` (`-v`),
  `mps draft` without `--write` (`--json`).
- **Text that enters the standing context needs a budget in a test.** The routing
  block and a role's `summary` are re-read every turn; changes to them are
  checked by the token-economy section of `tests/harness.test.mjs`.
- **A role is the most expensive operation** ($1.62 for a critic pass on Opus, of
  which the prompt is 0.08%). Call one for ADRs, specs and story reviews, not for
  every edit; `mps agents model default sonnet` cuts it by ~60%.

## How to work with the vault

- **Before an architectural choice** — read `adr/README.md` and the relevant ADR
  rather than deciding it again.
- **Feature-sized work** — open an epic or story before editing code:
  `mps draft story <EPIC> "<title>"` to preview, then `--write`.
- **After an artifact** — derived views are rebuilt automatically on `--write`;
  by hand it is `mps reconcile --write` (or `mps graph` if the graph does not
  exist yet).
- **Before finishing** — `mps doctor`, and `mps next` if anything is unclear.

## Configuration

- Project: `.mps/projectstore.json` (legacy `.claude/projectstore.json`);
  machine-local, belongs in `.gitignore`.
- Vault: `<vault>/.projectstore.json` — policy (`spec_policy`,
  `lifecycle_gates`), travels with the vault.
- Generated role files are the opposite: commit them, so the whole team gets the
  same roles.
- Environment: `MPS_PROJECT_DIR`, `MPS_HOME`, `MPS_SESSION_ID`, `MPS_HARNESS`,
  `MPS_PROVIDER`, `MPS_NO_BEAT`.

## Architecture decisions (ADR)

- The canonical source of MPS decisions is `docs/decisions/`. The process is in
  `docs/decisions/README.md`, the template in `docs/decisions/0000-template.md`.
- A new ADR is for a long-lived decision with real alternatives. Status stays
  `proposed` until the project owner approves it.
- After a decision is made or superseded, update the ADR index, the related
  documentation and the Memory topic.

## Change compatibility

- **Code** (`.mjs`, `bin/mps`) is pure node with no external dependencies;
  comments and strings in English. Tests: `npm test`.
- Do not break harness-agnosticism: no hooks, status line or slash commands as a
  required interface, and no writes into `.claude/` for a non-Claude harness.
- A new role is a file in `agents/` with neutral frontmatter, not a change to the
  adapters.
- A new harness is a JSON file in `harnesses/` (or `.mps/harnesses/` in a
  project), not a branch in the renderer. Confidence levels are about evidence:
  `verified` (documented and exercised), `documented` (from the vendor's docs,
  URL required in `docs`), `inferred` (guessed from a convention — then `notes`
  must say what was assumed).
- Vault compatibility with upstream ProjectStore is preserved (ADR-0004): do not
  rename the service files inside a vault.
- Preserve the user's uncommitted changes and keep them separate from your own.
