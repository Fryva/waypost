---
type: story
id: "story-doctor-agentsmd-hygiene-size-duplicate-block-claude-bridge"
epic: "WP-14"
title: "doctor: AGENTS.md hygiene (size, duplicate block, Claude bridge)"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-09-04
updated: 2026-09-04
external_refs: {}
tags: []
code_refs: []
specs: []
started_at: "2026-09-04T16:27:01.871Z"
closed_at: "2026-09-04T16:29:57.517Z"
plan_updated_at: "2026-09-04T16:27:01.871Z"
---

# doctor: AGENTS.md hygiene (size, duplicate block, Claude bridge)

| Field | Value |
|---|---|
| **Epic** | [WP-14](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

doctor's install group checks the instruction files against 2026 field practice: an AGENTS.md over ~200 lines is a warning, a routing block present twice is an issue, a CLAUDE.md that neither imports AGENTS.md nor carries the block is a warning when Claude is used.

## Decomposition

- [x] Findings with clear messages; `--fix` for the bridge only — evidence: scripts/doctor.mjs `checkInstructionsHygiene`, `applyFixes`
- [x] Tests for each — evidence: test "doctor: instruction-file hygiene — length is a warning, and Claude gets its bridge to AGENTS.md"

## Implementation Plan

Duplicate-block detection already existed in `checkAgentsBlock` (per file). Added `checkInstructionsHygiene` in scripts/doctor.mjs: `instructions-size` (warn, > 300 lines — generous against the field guide's 150–200 so the warning is rare and true) and `claude-bridge` (warn when Claude is used and the block is only in AGENTS.md; `--fix` writes `CLAUDE.md` with `@AGENTS.md`). Target choice: a root CLAUDE.md that imports AGENTS.md is no longer a block target, neither in the root set nor as Claude's shared file — the G-1 rule extended from `.claude/CLAUDE.md`.

## Acceptance Criteria

- [x] Each finding has a test — evidence: the test above covers bridge, fix, no-second-block, size
- [x] No false positive on this repository after the check lands — evidence: the same test runs doctor on this repository (AGENTS.md 272 lines, `.claude/CLAUDE.md` = `@AGENTS.md`)

## Final Summary

Duplicate blocks were already covered. The 300-line threshold is deliberately above the field guide's target so that the warning stays rare; this repository's AGENTS.md sits at 272 lines and is a candidate for trimming on its own merits.

## Technical Notes

Size is a heuristic from the field guide; keep it a warning.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-09-04*
