---
type: story
id: "story-doctor-agentsmd-hygiene-size-duplicate-block-claude-bridge"
epic: "WP-14"
title: "doctor: AGENTS.md hygiene (size, duplicate block, Claude bridge)"
status: planned
priority: p2
assignee: "Ivan Morozov"
created: 2026-09-04
updated: 2026-09-04
external_refs: {}
tags: []
code_refs: []
specs: []
started_at: null
closed_at: null
plan_updated_at: null
---

# doctor: AGENTS.md hygiene (size, duplicate block, Claude bridge)

| Field | Value |
|---|---|
| **Epic** | [WP-14](../epic.md) |
| **Status** | planned |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

doctor's install group checks the instruction files against 2026 field practice: an AGENTS.md over ~200 lines is a warning, a routing block present twice is an issue, a CLAUDE.md that neither imports AGENTS.md nor carries the block is a warning when Claude is used.

## Decomposition

- [ ] Three findings with clear messages and a `--fix` only for the duplicate block
- [ ] Tests for each

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

## Acceptance Criteria

- [ ] Each finding has a test
- [ ] No false positive on this repository after the check lands

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

Size is a heuristic from the field guide; keep it a warning.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-09-04*
