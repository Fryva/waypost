---
type: epic
id: "WP-21"
title: "Source an agent can read in one pass"
status: planned
priority: p2
created: 2026-10-04
updated: 2026-10-04
external_refs: {}
tags: []
code_refs: ["bin/", "package.json", "tests/scripts.test.mjs", "tests/harness.test.mjs", "AGENTS.md", "docs/how-it-works.md", "CHANGELOG.md"]
review_status: pending
reviewed_at: null
---

# WP-21: Source an agent can read in one pass

| Field | Value |
|---|---|
| **Status** | planned |
| **Priority** | p2 |
| **Created** | 2026-10-04 |
| **Updated** | 2026-10-04 |

---

## Goal

A task about one part of Waypost needs one file that fits in a single read and
is visible to extension-based code indexes — instead of windowed reads and
searching through files of 50–200 KB.

## Context

Measured on 2026-10-04 from this project's Claude Code transcripts (1.98 G
input tokens, two thirds of them in subagents): reading code is ≈26% of all
input; whole-file reads by subagents ≈16%; re-reading the same file in the same
context ≈8%. Project Memory and Waypost CLI output are each under 2% — not the
lever.

The most expensive file is `bin/waypost` (202 KB, extensionless, so the code
index does not see it): 441 navigation turns, ~159 M tokens. Next by measured
read volume: `scripts/sizes.mjs`, `scripts/lib.mjs` (88 KB), `scripts/presence.mjs`,
then `scripts/doctor.mjs` (104 KB). `scripts/team-host.mjs` is dense rather than
long and is under active WP-20 work.

Decision for the first and largest step: ADR "The CLI as a thin entry with
per-command modules, each readable in one pass" (proposed).

## Stories

| Story | Status | Description |
|-------|--------|-------------|

<!-- Planned, drafted after the ADR is accepted:
     1. bin/waypost becomes a thin entry; each command lives in bin/cli/
     2. scripts/lib.mjs split into lib-*.mjs behind an `export *` facade
     3. sizes.mjs / presence.mjs split by measured read volume
     4. doctor.mjs split into doctor-*.mjs (low priority)
     team-host.mjs: proposed to the WP-20 owner, not in this epic. -->

## Expected Results

- [ ] `bin/waypost` ≤ 14 KB; every `bin/cli/*.mjs` ≤ 24 KB, pinned by a test.
- [ ] `help`, `version` and an unknown command are byte-identical before and after.
- [ ] `version` and `help` work with a deliberately broken team module.
- [ ] `npm pack --dry-run` lists `bin/cli/`.
- [ ] codegraph indexes the CLI handlers (`codegraph query handleClean` finds it).
- [ ] Re-measured from transcripts after a few weeks: navigation turns per CLI
      task go down.

## Dependencies

- ADR "The CLI as a thin entry with per-command modules, each readable in one pass" — accepted.
- Coordination with WP-20 for `installMcpConfig` and the story gate in `bin/waypost`.

## Open Questions

- [ ] Start now in a separate worktree, or after the current WP-20 story?
- [ ] Who moves the WP-20 code out of `bin/waypost`?
- [ ] Do the size ceilings (14 KB entry, 24 KB module) hold for every module, or does `clean-plan` need a refactor beyond a move?

## Related

- ADR-0008 — context spend as a design constraint.
- ADR-0010 — coordination follows the repository.
- Project Memory `memory-format-benchmark` — the measurements behind this epic.

---

*Last updated: 2026-10-04*
