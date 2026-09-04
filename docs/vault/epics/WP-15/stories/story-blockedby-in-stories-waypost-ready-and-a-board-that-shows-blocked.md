---
type: story
id: "story-blockedby-in-stories-waypost-ready-and-a-board-that-shows-blocked"
epic: "WP-15"
title: "blocked_by in stories, waypost ready, and a board that shows blocked"
status: done
priority: p1
assignee: "Ivan Morozov"
created: 2026-09-04
updated: 2026-09-04
external_refs: {}
tags: []
code_refs: []
specs: []
started_at: "2026-09-04T18:17:19.636Z"
closed_at: "2026-09-04T18:23:10.017Z"
plan_updated_at: "2026-09-04T18:17:19.636Z"
---

# blocked_by in stories, waypost ready, and a board that shows blocked

| Field | Value |
|---|---|
| **Epic** | [WP-15](../epic.md) |
| **Status** | done |
| **Priority** | p1 |
| **Assignee** | Ivan Morozov |

---

## Description

Stories may declare `blocked_by: [<epic>/<stem>, …]`. `waypost ready` lists stories that are planned, not claimed by a live session, and have no open blocker, each with its claim command; the kanban shows blocked stories as such; `waypost next` ranks ready stories first.

## Decomposition

- [x] Frontmatter field, parsed by the same reader as `code_refs` — evidence: scripts/ready.mjs `stories()` via `listOf`
- [x] `ready` command in bin/waypost + kanban and next integration — evidence: bin/waypost `case "ready"`, `handleNext`; scripts/kanban.mjs `#blocked`
- [x] Tests: ready/blocked/claimed matrix — evidence: tests/harness.test.mjs "blocked_by, waypost ready, a board that shows blocked, next ranking, and doctor on bad dependencies"

## Implementation Plan

`scripts/ready.mjs`: `stories(vault)` reads every story's frontmatter (`blocked_by` as a JSON list through `listOf`; block form detected from the raw text), `readiness(vault)` marks each story ready when planned, every blocker settled (done/closed/superseded/archived/cancelled) and no live claim (`claimsOf`). `waypost ready [--all] [--json]` prints ready stories with `waypost story plan <rel> --write`; `next` ranks the first three at rank 2; the board tags `#blocked` (computed from the blockers' status, never stored, claims left out because the board is a file). Waypost's own stories now declare their blockers.

## Acceptance Criteria

- [x] `waypost ready --json` matches a fixture matrix — evidence: the test above (unblocked, blocked by open, blocked by unknown, freed by close, claimed by a live session)
- [x] kanban.md marks blocked stories — evidence: `#blocked` asserted on the board in the test
- [x] `waypost next` shows a ready story above install findings — evidence: `- ready: First (PS-1, p2)` with its command, asserted in the test

## Final Summary

Landed with the doctor checks of the next story in one change (they share the reader). On this vault `waypost ready` now shows one ready story and three blocked, which is the truth: the dependencies that used to live only in prose are frontmatter.

## Technical Notes

Markdown only. No priorities queue, no assignments — the boundary is dependencies, readiness, claim.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-09-04*
