---
type: story
id: "story-coordination-stops-writing-and-reading-the-old-place-prune-sweeps-what-is-left"
epic: "WP-15"
title: "Coordination stops writing and reading the old place; prune sweeps what is left"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-06
updated: 2026-11-06
external_refs: {}
tags: []
code_refs: ["scripts/presence.mjs", "scripts/presence-liveness.mjs", "scripts/presence-storage.mjs", "scripts/sessions.mjs", "tests/presence.test.mjs", "tests/presence-liveness.test.mjs", "tests/presence-storage.test.mjs", "tests/commits.test.mjs"]
specs: []
started_at: "2026-11-06T18:02:42.472Z"
closed_at: "2026-11-06T19:26:12.877Z"
plan_updated_at: "2026-11-06T18:02:42.472Z"
---

# Coordination stops writing and reading the old place; prune sweeps what is left

| Field | Value |
|---|---|
| **Epic** | [WP-15](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

ADR-0010 moved presence and leases into the git common dir in 0.15.0 and promised the
old place, `<vault>/.projectstore/{presence,leases}`, would be written and read for one
minor version. main is on 0.16.0: the window has passed. Every beat and every lease still
writes a second copy into the vault and every read merges two directories. This story
removes the old place from the hot path and leaves one mechanical sweep for what is left
there. The legacy session registry `<vault>/.projectstore/sessions/` is not touched
(ADR-0004: upstream ProjectStore reads it).

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [x] `beat` and `acquire` write only the primary place; `peers`, `readLeases` read only it
- [x] `clearPresence` and `release` still remove the session's own old-place copy
- [x] `sessions --prune` sweeps the old place (duplicates at once, the rest by age); the stale hint counts them
- [x] ADR-0010 addendum, AGENTS.md, docs/how-it-works.md, CHANGELOG
- [x] tests updated; `npm test` green except a failure already on main; live `waypost storage`, `waypost sessions`

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

Chosen: stop writing and reading the old place together (a dual read without the
dual write protects no older peer). `scripts/presence.mjs`: drop the legacy prev-read
and write in `beat`, the second directory in `readLeases`, the legacy write in
`acquire`; `clearPresence`/`release` unlink the session's own old copy by name.
`scripts/presence-liveness.mjs`: `peers` reads the primary place only; new
`pruneOldPlace` (copies at once, others by own timestamp past the threshold, keep a
record whose harness process still runs here, rmdir when empty). `scripts/sessions.mjs`:
call it under `--prune` and count it in the dry-run hint. ADR-0010 addendum; AGENTS.md,
how-it-works, CHANGELOG; tests in presence/presence-liveness/presence-storage.

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [x] Inside a repository a beat and a lease create nothing under `<vault>/.projectstore/{presence,leases}` — evidence: tests/presence.test.mjs "inside a repository presence and leases live only in the git common dir; prune sweeps the old place (ADR-0010 addendum)"; scripts/presence.mjs beat/acquire
- [x] A record only in the old place is invisible to `peers`/`readLeases` and is removed by `sessions --prune` once it is a duplicate of the primary copy or older than the prune threshold; a record of a harness process still running on this host is kept — evidence: tests/presence.test.mjs (both ADR-0010 tests, incl. "the old-place sweep keeps a live process's record and its lease, and never runs when the two places are one directory"); live `node bin/waypost sessions --prune` in this worktree: "pruned 1 record(s) from the old coordination place"
- [x] The old-place directories are removed once empty; `.projectstore/sessions/` is never touched — evidence: tests/presence.test.mjs asserts; live: `docs/vault/.projectstore/` kept only `sessions/` after prune
- [x] ADR-0010 carries a dated addendum naming the choice; AGENTS.md, how-it-works, CHANGELOG match — evidence: docs/vault/adr/0010-coordination-follows-the-repository.md "Addendum 2026-11-06"; AGENTS.md coordination bullet; docs/how-it-works.md; CHANGELOG.md Unreleased/Changed
- [x] `npm test` green — evidence: `waypost run --heavy -- npm test` 2026-11-06: 2581 pass, 10 skipped, 1 fail. Waived: "CLI migration stage f keeps fixed entry and module byte ceilings" (bin/cli/auto-clean.mjs 24266 > 24000 B) fails on main since b25c306; this story does not touch that file

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

Presence and leases are written and read only in the git common dir; the ADR-0010
dual write/read of `<vault>/.projectstore/{presence,leases}` is gone. New
`pruneOldPlace` (scripts/presence-liveness.mjs), run by `sessions --prune` before
`prunePresence` and counted in the stale hint, sweeps the old place: copies at once,
others past the threshold by their own timestamp, keeping a presence record whose
harness process runs here and that session's leases, and skipping entirely when the
two places resolve to one real directory. Choice and accepted risk recorded as the
ADR-0010 addendum 2026-11-06. A fresh-context waypost-reviewer pass found the
same-directory deletion (symlinked `coordination_dir`), the prune order, and the
lease-of-live-session gap; all three fixed with tests (mutation-checked).
Tests: full `npm test` as above; live `waypost storage`, `waypost sessions [--prune]`
from this worktree's `bin/waypost`.
Risks/follow-ups: the accepted risk in the addendum (0.14 peers, vault-fallback
peers) awaits the owner's confirmation; the auto-clean byte ceiling is red on main;
the globally installed CLI (0.16) keeps dual-writing until a release.

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-11-06*
