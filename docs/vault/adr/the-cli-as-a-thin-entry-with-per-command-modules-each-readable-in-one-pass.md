---
type: adr
id: "the-cli-as-a-thin-entry-with-per-command-modules-each-readable-in-one-pass"
title: "The CLI as a thin entry with per-command modules, each readable in one pass"
status: proposed
date: 2026-10-04
authors: ["Ivan Morozov"]
tags: []
external_refs: {}
supersedes: null
superseded_by: null
code_refs: ["bin/waypost", "package.json", "tests/scripts.test.mjs", "tests/harness.test.mjs", "tests/slots.test.mjs", "AGENTS.md", "docs/how-it-works.md"]
review_status: pending
reviewed_at: null
drafted_by: {"harness":"claude","provider":null,"date":"2026-10-04"}
related: "ADR-0001 (harness-agnostic core), ADR-0008 (context spend), ADR-0010 (coordination follows the repository), ADR-0011 (decisions that check themselves), epic WP-21"
guards: []
---

# The CLI as a thin entry with per-command modules, each readable in one pass

| Field | Value |
|---|---|
| **Status** | proposed |
| **Date** | 2026-10-04 |
| **Authors** | Ivan Morozov |

---

## Context

`bin/waypost` is one file of 202 KB and 3,857 lines: the dispatcher, flag
parsing, and the handlers of every command that writes (setup, clean and its
deleter, run --heavy and the slot, size, profile, status, help, …). The clean
family alone is 71 KB, 35% of the file. Pure computation already lives in
`scripts/<domain>.mjs` (sizes, cleanup, capacity, presence, …); the writing half
of every command does not.

Measured on 2026-10-04 from this project's Claude Code transcripts (13 main
sessions, 51 subagents, 1.98 G input tokens):

1. **Navigation, not volume.** 195 of 200 reads of `bin/waypost` were windows
   (`offset`/`limit`; Read returns at most 2,000 of its lines). The cost is the
   turns spent finding the right place: 441 navigation turns in 52 threads,
   ~159 M input tokens (≈8% of all input). Two WP-17 subagents spent 64 and 83
   turns each inside this file.
2. **Invisible to the code index.** codegraph picks the language by file
   extension and has no configuration; the extensionless `bin/waypost` is not
   indexed, so `explore`/`callers` cannot answer anything about the most
   navigated file.
3. **Every command loads WP-20.** The static import of `scripts/team-legacy.mjs`
   pulls >230 KB of team code into every invocation (~30 ms of a 140 ms start).
   A syntax error in a team module under active work breaks the whole CLI on
   every host — including `run --heavy`, through which `npm test` runs.

The shared working tree is the live CLI for all sessions on all hosts
(ADR-0010), so whatever the shape, the migration must never leave it broken
between steps.

## Decision

1. `bin/waypost` becomes a thin entry (≤ 14 KB): early exits
   (`__waypost-delete`, team-mcp*), `--project`, harness/session binding,
   heartbeat, and the command `switch`. The switch is the map from command to
   module — no registry, no plugin layer.
2. The writing half of each command moves verbatim into `bin/cli/<module>.mjs`
   (about 20 modules: core, status, help, bind, views, artifacts, brief,
   profile, size, slots, capacity, run, clean-plan, remove, deleter,
   clean-apply, clean, auto-clean, setup, mcp-config). Target ≤ 16 KB, ceiling
   24 KB per module.
3. A command's module is loaded lazily, only for that command:
   `import(new URL(\`./cli/${m}.mjs\`, import.meta.url).href)`. Shared state and
   helpers (`ROOT`, `SCRIPT`, `fail`/`run`, flag parsing with the single
   `VALUED` set, `INHERITED_*` capture) live in `bin/cli/core.mjs`, imported
   statically.
4. A module never imports the entry (importing it runs `main()`).
5. Pure generators stay in `scripts/`; the rule becomes: the entry and
   `bin/cli/` write derived views, generators in `scripts/` stay pure so that
   doctor can re-run them.
6. The size ceilings are pinned by a test in the token-economy section of
   `tests/harness.test.mjs`; once `bin/cli/` exists, guards are added:
   the ceiling test as a `check`, and a `forbid` of importing `../waypost`
   from `bin/cli/*.mjs`.

## Rationale

1. A task about one command needs one module of ≤ 24 KB, read in one pass,
   instead of a dozen windowed reads with searching in between.
2. `.mjs` modules are indexed by codegraph and any extension-based tool, so
   "where is X / who calls X" stops costing reads at all.
3. Lazy loading isolates `run`, `capacity`, `size`, `clean`, `help`, `version`
   from work in progress in the team modules.
4. `bin/` is already in `package.json` `files`; the modules ship without a
   packaging change, and the extracted shape mirrors how WP-17…19 already split
   computation into `scripts/<domain>.mjs`.
5. Verbatim moves keep the risk mechanical: each step is reviewable with
   `git show --color-moved`.

## Alternatives Considered

### Keep the monolith, rely on navigation and the code index

**Pros**: no migration.
**Cons**: the index cannot see the file; navigation cost stays; WP-20 coupling stays.
**Rejected because**: both measured costs remain and the coupling is a live-CLI risk.

### One subprocess per command (the team-cli shape)

**Pros**: strongest isolation.
**Cons**: `selfMarker` records the CLI's own pid as the slot holder — a child
would die and leave the slot looking abandoned; breaks terminal `askYesNo` and
`INHERITED_*`; ~60 ms node start per command.
**Rejected because**: it breaks the slot protocol of the ADR "Heavy work sized to the machine".

### Modules in `scripts/` or a new top-level directory

**Pros**: one place for all code.
**Cons**: `scripts/` means "pure generators doctor re-runs"; the race fixture
symlinks `scripts/` and ESM resolves symlinks to the real path, breaking the
`story-section.mjs` substitution; a new top-level dir must be added to `files`
and a checkout-based test would not notice if it were forgotten.
**Rejected because**: `bin/cli/` needs no packaging change and keeps both meanings clean.

### A build step (src → bin)

**Rejected because**: contradicts zero dependencies and the live checkout used as the CLI.

## Consequences

**Positive**:
- One-pass reads for single-command tasks; fewer navigation turns (estimated
  ≈5% of all input tokens recovered).
- Commands outside `team` keep working while team modules are broken mid-edit.
- The code index covers the CLI.

**Negative / trade-offs**:
- A narrow task may read slightly more characters (a whole module instead of a
  window); the gain is in turns, not bytes.
- `git blame`/`log` on new modules start at the move; use `blame -C -C`.
- A forgotten import surfaces as a `ReferenceError` only when that branch runs;
  each step needs a free-identifier check, not only `node --check`.
- `commit`, `sessions`, `brief`, `ready`, `status` still load the team graph in
  their own subprocess (`commit.mjs`/`sessions.mjs` import team-legacy) — out of
  scope here, for the WP-20 owner.

**What changes in code / process**:
- `bin/waypost` → thin entry; new `bin/cli/*.mjs`.
- `tests/scripts.test.mjs` `makeRaceRepo` copies `bin/cli/*.mjs` as real files.
- `INHERITED_*` captured in `core.mjs` (static import, before `main()`), as
  `tests/slots.test.mjs` requires.
- `AGENTS.md` and `docs/how-it-works.md`: the "only the dispatcher writes" rule
  is restated (outside the managed block).
- Migration in six verbatim commits from the leaves, in a separate worktree
  under a lease on `bin/waypost` and `bin/cli`; the WP-20 hooks
  (`installMcpConfig`, the story gate) move last, coordinated with the WP-20 owner.

## References

- Epic WP-21 "Source an agent can read in one pass".
- ADR-0008 — standing context and "pointers, not documents".
- ADR-0010 — the shared tree is the live CLI; worktrees for multi-step work.
- Transcript measurements 2026-10-04 (session scratchpad, not kept); summary in
  Project Memory `memory-format-benchmark`.

---

*Last updated: 2026-10-04*
