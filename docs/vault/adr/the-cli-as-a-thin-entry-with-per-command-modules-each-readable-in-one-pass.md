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
code_refs: ["bin/waypost", "bin/waypost.mjs", "package.json", "tests/scripts.test.mjs", "tests/sizes.test.mjs", "tests/harness.test.mjs", "tests/slots.test.mjs", "tests/team-cli.test.mjs", ".github/workflows/ci.yml", "AGENTS.md", "docs/how-it-works.md"]
review_status: reviewed
reviewed_at: 2026-10-19
drafted_by: {"harness":"claude","provider":null,"date":"2026-10-04"}
related: "ADR-0001 (harness-agnostic core), ADR-0008 (context spend), ADR-0011 (decisions that check themselves), ADR \"Heavy work sized to the machine\", epic WP-21"
guards: []
---

# The CLI as a thin entry with per-command modules, each readable in one pass

| Field | Value |
|---|---|
| **Status** | proposed |
| **Date** | 2026-10-04 (revised 2026-10-14 and 2026-10-19 after critic passes) |
| **Authors** | Ivan Morozov |

---

## Context

`bin/waypost` is one file of ~202 KB and ~3,860 lines: the dispatcher, flag
parsing, and the handlers of every command that writes (setup, clean and its
deleter, run --heavy and the slot, size, profile, status, help, …). The clean
family alone is ~71 KB. Computation that doctor re-runs lives in
`scripts/<domain>.mjs` (sizes, cleanup, capacity, …); the writing half of most
commands does not. It is also the hottest file in the repository: 8 of 36
commits in the two weeks to 2026-10-04 touched it, from three epics.

Indicative measurements, 2026-10-04, from this project's Claude Code
transcripts only (13 main sessions, 51 subagents, 1.98 G input tokens, of which
the large majority is cache reads at 0.1× price). The classifier was a session
script and is not yet committed, so these numbers are not reproducible from the
repository; WP-21 commits it.

1. **Navigation, not volume.** ~195 of ~200 reads of `bin/waypost` were windows
   (`offset`/`limit`), usually 10–30 lines. At ~50 k tokens the file exceeds every
   harness read cap (Claude Code CLI 25 k tokens, Claude Desktop 10 k, OpenCode
   50 KB), so it can never be read in one pass. Turns that read or searched this
   file: 441 in 52 threads; the full input of those requests was ~159 M tokens
   (≈8% of all input). This historical proxy counts initiating-request usage,
   not returned-content cost, a workflow-cost bound or measured savings; later
   reuse of returned code is outside it (see the current WP-21 limitations).
2. **Invisible to the code index.** codegraph picks the language by file
   extension and has no configuration; the extensionless `bin/waypost` is not
   indexed.
3. **Every command links the team code.** The static import of
   `scripts/team-legacy.mjs` (used only by `story --write`, for
   `withTeamArtifactGate`) links 22 more modules / ~538 KB into every
   invocation (a loader trace of `version`: 27 modules / 960 KB before, 6 / 422 KB
   after step 0) — ≈9 ms of a 120–140 ms start
   (macOS, warm cache). A syntax error in any of them breaks every command,
   including `run --heavy`, through which `npm test` runs. Commands that spawn
   doctor, reconcile, ready, sessions, commit or brief load it in their own
   subprocess regardless.

The working copy is the live CLI for every session on this machine and, through
the shared checkout, on the guest hosts (Project Memory `waypost-host-setup`;
AGENTS.md "A shared checkout is the sharper case"). Whatever the shape, the
migration must never leave it broken between steps.

## Decision

0. **First, independent of the split** (story "The team code loads only for
   story --write, and the CLI entry is an .mjs the code index sees"):
   - `story --write` imports `team-legacy.mjs` lazily, with no try/catch — the
     gate stays fail-closed;
   - the entry moves to `bin/waypost.mjs`; `bin/waypost` stays as a small
     shim (`#!/usr/bin/env node`, a comment, `import "./waypost.mjs";`), so `package.json`
     `bin`, the launcher, `spawnDeleter` and every test keep invoking the same
     path.
1. **Then the split.** `bin/waypost.mjs` becomes a thin entry (≤ 14 KB): early
   exits (`__waypost-delete`, team-mcp*), `--project`, harness/session binding,
   heartbeat, and the command `switch`. The switch is the map from command to
   module — no registry, no plugin layer.
2. The writing half of each command moves into `bin/cli/<module>.mjs` (about 20
   modules: core, status, help, bind, views, artifacts, brief, profile, size,
   slots, capacity, run, clean-plan, remove, deleter, clean-apply, clean,
   auto-clean, setup, mcp-config). Function bodies are unchanged; the only
   non-verbatim edits are `export`, import headers, the `ROOT` depth in
   `core.mjs` (one `dirname` more, or `VERSION` silently becomes `0.0.0`) and the
   switch. Target ≤ 16 KB, ceiling 24 KB per module — under every harness read
   cap above. A module over the ceiling is split by cohesion, not mechanically.
3. A command's module is loaded lazily with a literal specifier per case
   (`await import("./cli/clean.mjs")`); imports inside `bin/cli` are static. A
   load failure names the module the entry tried to load: a `SyntaxError` from
   a dynamic import carries neither the file nor the line in its message or
   stack (checked 2026-10-14 — the entry prints only `Unexpected token ';'`),
   so the message identifies the requested module, not necessarily the failing
   static dependency. Localize syntax errors with `node --check` over the entry
   and **every** `bin/cli/*.mjs`, reporting each checked filename; checking only
   the requested module does not check its dependencies.
   Shared state and helpers (`ROOT`, `SCRIPT`, `fail`/`run`, flag parsing with
   the single `VALUED` set, `INHERITED_*` capture) live in `bin/cli/core.mjs`,
   imported statically by the entry, so `INHERITED_*` is captured before
   `main()` as `tests/slots.test.mjs` requires.
   Preserve the existing startup order: capture `INHERITED_*`, early exits,
   leading `--project`, state migration, harness/process/session binding,
   worktree qualification, heartbeat, then dispatch. Importing a module must
   add no new writes, process launch or command execution; shared mutable
   bindings have one owner, recorded in the implementation plan.
4. A module never imports the entry (importing it runs `main()`). `bin/cli`
   imports form a DAG; `core.mjs` imports nothing from `bin/cli`.
5. The write rule is restated truthfully: generator functions that doctor
   re-runs stay pure; writes live in `bin/` and in the scripts that own a store
   or a `--write` mode (reconcile, presence, sessions, commit, agents/skills
   install, launcher, `doctor --fix`, team-*). AGENTS.md and
   `docs/how-it-works.md` say this instead of "only the dispatcher writes",
   which is already false.
6. Safety nets, permanent and deterministic, in the token-economy section of
   `tests/harness.test.mjs`:
   - size ceilings for the entry and every `bin/cli/*.mjs`;
   - a free-identifier test: U = every name imported or declared at top level in
     the monolith before the split; in the entry and each module, every name of U
     used outside comments and strings is declared or imported there (72 empty
     `catch {}` blocks would otherwise turn a forgotten import into silent
     degradation, not a `ReferenceError`);
     template `${...}` expressions count as code. A local declaration or
     shadowed name cannot satisfy a missing module-level dependency. Pin these
     cases with negative mutation fixtures, including a missing import inside
     a suppressed `catch`. Do not assume an external JavaScript parser exists:
     the planner must choose and document a dependency-free implementation of
     this bounded guard before the first move; its claim is scoped to frozen U,
     not arbitrary JavaScript free-identifier analysis;
   - a test that imports every `bin/cli` module (link errors);
   - `node --check` over `bin/waypost.mjs` and `bin/cli/*.mjs`.
   Extend the current entry-only static team-import prohibition to the
   **transitive static import closure** of the early entry/core. Retain the
   broken-team-module scenarios for utility commands and the fail-closed story
   write; moving the same dependency into core must not defeat Decision 0.
   Once `bin/cli/` exists, guards are added: the ceiling test as a `check`, and
   a `forbid` of importing `../waypost.mjs` from `bin/cli/*.mjs`. Guards of
   other ADRs whose `in` names the entry are re-scoped in the commit that moves
   their code.

## Rationale

1. A task about one command needs one module that fits in one read, instead of
   a dozen windowed reads with searching in between.
2. Structural, and the stronger reason: the hottest file stops being one unit.
   Leases, merges and review become per module; a lease on `bin/cli/clean.mjs`
   no longer blocks work on `setup`.
3. `.mjs` modules are indexed by codegraph and any extension-based tool —
   achieved already by step 0; the split makes the indexed units small.
4. `bin/` is already in `package.json` `files`; the modules ship without a
   packaging change, and the shape mirrors how WP-17…19 split computation into
   `scripts/<domain>.mjs`.
5. Moves keep function bodies byte-identical, so review is mechanical
   (`git show --color-moved`) and the safety nets of Decision 6 catch what
   colour-moved cannot: a missing import.

## Alternatives Considered

### Rename and lazy team import, no split (Decision 0 alone)

**Pros**: a few lines; gets the index visibility and the WP-20 isolation of
`bin/waypost` itself; no migration of the live CLI.
**Cons**: the file stays ~50 k tokens — over every read cap — and stays one unit
for leases, merges and review; navigation turns remain.
**Not rejected — adopted as step 0.** Whether the split follows is decided by
the owner on the structural grounds above, or after re-measuring with the
committed classifier for two weeks after step 0.

### One subprocess per command (the team-cli shape)

**Pros**: strongest isolation.
**Cons**: ~60–70 ms of node start per command; `INHERITED_*` would have to be
passed explicitly; double SIGINT handling in `runHeavy`.
**Rejected because**: the cost is paid on every command for isolation that the
in-process lazy import already gives.

### Modules in `scripts/` or a new top-level directory

**Cons**: the race fixture symlinks `scripts/` and ESM resolves symlinks to the
real path, breaking the `story-section.mjs` substitution; a new top-level dir
must be added to `files` and a checkout-based test would not notice if it were
forgotten.
**Rejected because**: `bin/cli/` needs no packaging change.

### A build step (src → bin)

**Rejected because**: contradicts zero dependencies and the live checkout used as the CLI.

## Consequences

**Positive**:
- After step 0: `run`, `capacity`, `size`, `clean`, `profile`, `help`,
  `version` and the utilities (prompt, skill(s), agents, harnesses, lease,
  storage, watch, tokens, launcher) no longer depend on the team modules;
  the vault commands still do, through their subprocesses.
- After the split: one-pass reads for single-command tasks, per-module leases
  and review. Token effect expected, not yet measured; it is measured by the
  committed classifier, net of the module then carried in context.

**Negative / trade-offs**:
- A narrow task may read more characters (a whole module instead of a window).
- `git blame`/`log` on moved code start at the move; use `blame -C -C`.
- ~40 comments in `scripts/`, ~60 mentions in tests and 39 `code_refs` name
  `bin/waypost`; they keep resolving (the shim exists) but point at less
  precise places until updated.
- The split needs one freeze window of the entry for WP-20.

**What changes in code / process**:
- Step 0: `bin/waypost.mjs` + shim; `makeRaceRepo` copies `bin/waypost.mjs`;
  `node --check` covers it; the guard of ADR "setup asks the running harness"
  moves to `bin/waypost.mjs`.
- Split: six commits prepared in a separate worktree from the leaves, the suite
  green on Node 20/22/24 at each, merged in one sitting during a WP-20 freeze of
  the entry; a CLI test "team-bound story → refuse" lands before the gate moves.
  In the same commit that makes the entry depend on `bin/cli`, update
  `makeRaceRepo` in `tests/scripts.test.mjs` to recursively copy that directory
  as **real files**, preserving the fixture's `scripts/story-section.mjs`
  substitution and concurrent-edit preservation assertions. A symlink back to
  the live entry/modules would test the wrong ROOT.
  The existing `.github/workflows/ci.yml` Ubuntu matrix provides the Node
  20/22/24 gate for every prepared commit; each revision must have all three
  results before advancing the migration. A local Node 25 run cannot replace
  those results. Node versions and operating systems are separate coverage
  dimensions; this matrix does not establish Windows/macOS runtime coverage.
  Rollback: revert the merge — the entry and shim before it are self-contained.

## Readiness for an owner decision (2026-10-19)

Current entry at `3f7933e`: 204781 bytes. Decision 0 is implemented; no
`bin/cli` split has started. The reproducible navigation collector is committed;
its retained-history limitations and baseline are in WP-21. Historical
navigation-request input is observational initiating-request usage, not
returned-content cost, a workflow-cost bound or measured savings.

The real CLI prerequisite is now committed as `3f7933e`: changed:true plan/close
previews, exact refusal for a canonical team-bound story before any vault file
changes, plus a successful unbound lifecycle control. The full affected
`tests/team-cli.test.mjs` run passed 11/11 on Node 25.6.1/macOS, with 154 unchanged
code-input identities and independent acceptance. Earlier capacity refusals ran
no tests. This is local guard verification, not the Node 20/22/24 migration gate,
full-suite verification, or a token-saving measurement.

Independent fresh-context review on 2026-10-19 returned `ship` as a proposal,
with no open blocker or should-fix. This records review, not owner acceptance.

The owner decision is whether to adopt Decisions 1–6 on structural grounds now,
or retain Decision 0 and defer the split for more measurement. Approval adopts
the bounded plan and its gates; it does not establish runtime coverage or token
savings and does not authorize a native role pilot. Freeze coordination, the
dependency-guard implementation and the per-module mapping remain prerequisites
before implementation, not reasons to edit the live entry while preparing them.

## References

- Epic WP-21 "Source an agent can read in one pass".
- ADR-0008 — standing context and "pointers, not documents".
- ADR-0011 — guards.
- Read caps: [Claude Code #77489](https://github.com/anthropics/claude-code/issues/77489),
  [#40357](https://github.com/anthropics/claude-code/issues/40357);
  [OpenCode read.ts](https://raw.githubusercontent.com/sst/opencode/dev/packages/opencode/src/tool/read.ts).

---

*Last updated: 2026-10-14*
