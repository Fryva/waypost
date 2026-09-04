---
type: story
id: "story-doctor-dangling-and-cyclic-dependencies-duplicate-adr-numbers"
epic: "WP-15"
title: "doctor: dangling and cyclic dependencies, duplicate ADR numbers"
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

# doctor: dangling and cyclic dependencies, duplicate ADR numbers

| Field | Value |
|---|---|
| **Epic** | [WP-15](../epic.md) |
| **Status** | planned |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

doctor reports a `blocked_by` that names no story, a dependency cycle, and two ADRs sharing a number (as happens when two sessions draft in parallel), with a `renumber` suggestion for the latter.

## Decomposition

- [ ] Checks in the vault group with the ADR-0009 style
- [ ] Tests

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

## Acceptance Criteria

- [ ] Each finding has a test with a fixture
- [ ] A clean vault yields no finding

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

-

## Dependencies

- story-blockedby-in-stories-waypost-ready-and-a-board-that-shows-blocked

## Attachments

-

---

*Last updated: 2026-09-04*
