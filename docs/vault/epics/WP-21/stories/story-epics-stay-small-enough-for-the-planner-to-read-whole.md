---
type: story
id: "story-epics-stay-small-enough-for-the-planner-to-read-whole"
epic: "WP-21"
title: "Epics stay small enough for the planner to read whole"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-05
updated: 2026-11-05
external_refs: {}
tags: []
code_refs: ["scripts/doctor-integrity.mjs", "scripts/doctor.mjs", "tests/doctor-integrity.test.mjs", "docs/vault/research/token-measurement-pilot-and-cli-split-record-of-wp-21.md"]
specs: []
started_at: "2026-11-05T05:37:14.256Z"
closed_at: "2026-11-05T06:18:36.838Z"
plan_updated_at: "2026-11-05T05:37:14.256Z"
---

# Epics stay small enough for the planner to read whole

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

The planner reads the target epic whole and every other epic's code_refs on every run. WP-21's epic had grown to 50 KB: 40 KB of dated history sections and a 7 KB list of 208 code_refs, appended file by file because the doctor's "falls outside the parent epic's code_refs" warning was satisfied one file at a time.

## Decomposition

- [x] Move the dated sections (2026-10-15 … 2026-10-22) verbatim into the research note "Token measurement, pilot and CLI split record of WP-21"; the epic keeps goal, context, stories, expected results and a pointer.
- [x] Replace 208 code_refs by 35 entries (directories plus specific vault artifacts) that still contain every story code_ref.
- [x] Doctor warns `epic-size` past 16 KB, and the code-refs message suggests adding a containing directory.

## Implementation Plan

Content move by script, footprint checked by prefix containment against all committed story refs; the check sits beside checkCodeRefs in doctor-integrity.mjs.

## Acceptance Criteria

- [x] WP-21 epic.md 50355 → 7484 bytes, every story code_ref still inside the epic footprint, no dead links. — evidence: `waypost doctor` 0 issues (remaining warnings belong to another session's uncommitted story).
- [x] An epic over 16 KB (bytes, not characters) warns; research notes never do. — evidence: tests/doctor-integrity.test.mjs "warns when an epic outgrows the budget"; doctor tests 113/113.

## Final Summary

Largest other epic is WP-20 at 13 KB, so the new check is silent today. Full suite on the combined tree after all review fixes: 2509 tests, 2500 pass, 0 fail, 9 skipped (macOS, Node 25, `npm test` in the heavy slot). Fresh waypost-reviewer pass over all four stories; its blocker and should-fixes are applied.

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-11-05*
