---
type: story
id: "story-blockedby-in-stories-waypost-ready-and-a-board-that-shows-blocked"
epic: "WP-15"
title: "blocked_by in stories, waypost ready, and a board that shows blocked"
status: planned
priority: p1
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

# blocked_by in stories, waypost ready, and a board that shows blocked

| Field | Value |
|---|---|
| **Epic** | [WP-15](../epic.md) |
| **Status** | planned |
| **Priority** | p1 |
| **Assignee** | Ivan Morozov |

---

## Description

Stories may declare `blocked_by: [<epic>/<stem>, …]`. `waypost ready` lists stories that are planned, not claimed by a live session, and have no open blocker, each with its claim command; the kanban shows blocked stories as such; `waypost next` ranks ready stories first.

## Decomposition

- [ ] Frontmatter field, parsed by the same story reader as `code_refs`
- [ ] `ready` command in bin/waypost + sessions/kanban integration
- [ ] Tests: ready/blocked/claimed matrix

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

## Acceptance Criteria

- [ ] `waypost ready --json` matches a fixture matrix
- [ ] kanban.md marks blocked stories
- [ ] `waypost next` shows a ready story above install findings

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

Markdown only. No priorities queue, no assignments — the boundary is dependencies, readiness, claim.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-09-04*
