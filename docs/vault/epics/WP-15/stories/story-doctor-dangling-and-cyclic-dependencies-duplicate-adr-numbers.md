---
type: story
id: "story-doctor-dangling-and-cyclic-dependencies-duplicate-adr-numbers"
epic: "WP-15"
title: "doctor: dangling and cyclic dependencies, duplicate ADR numbers"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-09-04
updated: 2026-09-04
external_refs: {}
tags: []
code_refs: []
specs: []
blocked_by: ["WP-15/story-blockedby-in-stories-waypost-ready-and-a-board-that-shows-blocked"]
started_at: "2026-09-04T18:23:29.941Z"
closed_at: "2026-09-04T18:23:30.929Z"
plan_updated_at: "2026-09-04T18:23:29.941Z"
---

# doctor: dangling and cyclic dependencies, duplicate ADR numbers

| Field | Value |
|---|---|
| **Epic** | [WP-15](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

doctor reports a `blocked_by` that names no story, a dependency cycle, and two ADRs sharing a number (as happens when two sessions draft in parallel), with a `renumber` suggestion for the latter.

## Decomposition

- [x] Checks in the vault group with the ADR-0009 style — evidence: scripts/doctor.mjs `checkDependencies`, `checkAdrNumbers`
- [x] Tests — evidence: tests/harness.test.mjs (dangling reference, cycle, block form, duplicate number with the next free one)

## Implementation Plan

`checkDependencies(vault)` in scripts/doctor.mjs reads the same story list as `ready.mjs`: a `blocked_by` entry that names no story is an issue, a cycle is an issue reported once per cycle, and block-form `blocked_by` is named since the line-based reader sees it as empty (the same class of finding `specs:` already had). `checkAdrNumbers(vault, adrFolder)` groups `NNNN-*.md` files by number and names the next free one. Both registered in `runVaultChecks`; `next` maps them to `waypost ready --all` and `waypost doctor`.

## Acceptance Criteria

- [x] Each finding has a test with a fixture — evidence: the ready test's doctor block
- [x] A clean vault yields no finding — evidence: `waypost doctor` on this vault: 0 issues after the blockers were declared

## Final Summary

Landed with the ready story (50979f9): the checks and the command share one reader, so a dependency the board honours is a dependency doctor can verify.

## Technical Notes

-

## Dependencies

- story-blockedby-in-stories-waypost-ready-and-a-board-that-shows-blocked

## Attachments

-

---

*Last updated: 2026-09-04*
