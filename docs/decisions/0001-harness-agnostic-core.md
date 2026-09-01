# ADR-0001: A harness-agnostic core: one CLI instead of hooks and slash commands

- Status: proposed
- Date: 2026-08-28
- Deciders: not approved by the project owner; status `proposed`
- Supersedes: —
- Superseded by: —
- Related: `bin/mps`, `scripts/*.mjs`, `AGENTS.md`, `opencode.json`
- code_refs: ["bin/mps", "scripts/lib.mjs", "scripts/doctor.mjs", "scripts/graph.mjs", "scripts/codemap.mjs", "scripts/reconcile.mjs", "scripts/draft.mjs", "scripts/kanban.mjs", "scripts/agents.mjs", "scripts/brief.mjs", "scripts/sessions.mjs", "tests/harness.test.mjs", "AGENTS.md", "opencode.json"]

## Context

Upstream ProjectStore is a Claude Code plugin: slash commands (`/projectstore:adr`),
hooks (SessionStart/PreToolUse/Stop/PreCompact), a status line and spawned
subagents. The whole interface layer is bound to one CLI and to its environment
and paths — `CLAUDE_PROJECT_DIR`, `CLAUDE_PLUGIN_ROOT`, `.claude/settings.local.json`.
The core (vault, layouts, templates, doctor/graph/codemap/reconcile/draft/kanban)
is pure node, markdown in git, and harness-agnostic already.

The fork's goal is to work identically from Claude Code, Codex, OpenCode and
whatever comes next. The Claude-only wiring is either unavailable or
incompatible everywhere else.

## Decision drivers

- The same working process regardless of harness.
- Do not rewrite a proven core; replace the interface layer only.
- Minimum external dependencies (zero: pure node).
- Keep config paths backward-compatible for an optional Claude plugin layer.

## Considered options

### Option 1: one neutral CLI, `mps` (chosen)

`bin/mps` dispatches into the core scripts and prints the same JSON for every
harness. Paths in `lib.mjs` become neutral (`MPS_PROJECT_DIR` / `MPS_HOME`, with
`CLAUDE_*` as fallbacks) and the bind config moves to `.mps/projectstore.json`
(legacy `.claude/projectstore.json` still read). Shared rules live in `AGENTS.md`,
which all three harnesses read (Claude via `@AGENTS.md`, OpenCode via
`opencode.json` instructions).
**Pros:** one entry point; harness-agnostic; the core is reused whole.
**Cons:** no native slash interface (familiar in Claude Code); the agent has to
call the CLI deliberately.

### Option 2: keep the slash commands and add a CLI beside them

A full clone of the Claude wiring (commands/, hooks/, statusline/) plus a CLI.
**Pros:** maximum compatibility with Claude Code.
**Cons:** two interfaces to maintain, and only one harness gets the good one.
Rejected: it contradicts the point of the fork.

### Option 3: documentation only, no CLI

**Pros:** zero code changes.
**Cons:** no single entry point; every harness invents its own way to call the
scripts. Rejected.

## Decision

Take option 1. The vault mechanics are reused as-is; the interface layer
(commands/hooks/status line/agent spawning) is replaced by one dispatcher plus
shared rules in `AGENTS.md` / `opencode.json`. Path handling is neutralised in
`scripts/lib.mjs`.

## Consequences

### Positive

- The same loop — task → artifact → doctor → derived views — from any harness.
- The proven core (doctor/graph/codemap/reconcile/draft/kanban) works unchanged.
- Zero external dependencies; minimum duplication.

### Negative / risks

- No native slash commands or status line for Claude Code users.
- The CLI must be called deliberately (a matter of rules) rather than injected
  by a hook.
- The path adaptation in `lib.mjs` is the one core change; a re-import from
  upstream has to preserve it.

## Verification and follow-up

- The first revision of this ADR claimed the CLI had been "run by hand against a
  test vault". That was false: at the time not one script parsed — a bulk
  rewrite of `/projectstore:X` into `"mps X"` had broken string literals across
  every `scripts/*.mjs`. Fixed on 2026-08-29 together with the code; the record
  is kept here as a warning about self-confirming verification.
- Actual verification (2026-08-29): `node --check` over every `scripts/*.mjs`
  and `bin/mps`; an end-to-end run of
  `bind → scaffold → draft adr|epic|story --write → story plan|close --write →
  kanban/graph/codemap → doctor --fix → brief → agents install/register`
  in a temporary project; `node --test tests/*.test.mjs` green.
- This is infrastructure; on-device verification does not apply. Behaviour
  inside Codex and OpenCode themselves has not been checked by the project owner.
