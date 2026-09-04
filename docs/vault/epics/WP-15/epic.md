---
type: epic
id: "WP-15"
title: "Coordination follows the repository, and ready work"
status: planned
priority: p1
created: 2026-09-04
updated: 2026-09-04
external_refs: {}
tags: []
code_refs: []
review_status: pending
reviewed_at: null
---

# WP-15: Coordination follows the repository, and ready work

| Field | Value |
|---|---|
| **Status** | planned |
| **Priority** | p1 |
| **Created** | 2026-09-04 |
| **Updated** | 2026-09-04 |

---

## Goal

Release 0.15: sessions of one repository see each other whatever the checkout layout, and an autonomous loop can ask what is ready to work on.

## Context

Orchestrators isolate agents by git worktree; Waypost's presence, leases and claims live per checkout in `<vault>/.projectstore/`, so sibling worktrees are blind to each other. Stories have no dependencies, so `next` cannot say what is unblocked.

## Stories

| Story | Status | Description |
|-------|--------|-------------|
| `story-adr-0010-accepted-presence-leases-and-claims-in-the-git-common-dir` | planned | critic pass, owner decision, status accepted, index and docs updated |
| `story-measure-the-git-common-dir-and-worktree-binding-on-macos-windows-and-a-cloud-drive` | planned | measured table for the layouts the critic pass did not cover, before the move |
| `story-runtime-coordination-moves-to-the-git-common-dir-old-records-read-for-one-version` | planned | binding inherited by linked worktrees, coordination dir resolution, dual-write/dual-read migration, `waypost storage` names the dir |
| `story-shared-checkout-detection-covers-sibling-worktrees-of-one-repository` | planned | sharedTree gains the same-repository signal; leases from other worktrees reported |
| `story-blockedby-in-stories-waypost-ready-and-a-board-that-shows-blocked` | planned | `blocked_by` frontmatter, `waypost ready`, kanban blocked state, `next` ranks ready stories |
| `story-doctor-dangling-and-cyclic-dependencies-duplicate-adr-numbers` | planned | doctor findings for bad dependency links and colliding ADR numbers |

## Expected Results

- [ ] Two sessions in two worktrees see each other's claim and lease within one command (test)
- [ ] `waypost ready` lists unblocked, unclaimed stories with the claim command
- [ ] doctor names a dependency cycle and a duplicate ADR number

## Dependencies

- ADR-0010 accepted before the second story starts
- ADR-0006, ADR-0007

## Open Questions

- [ ] (none open at planning time)

## Related

- ADR-0010 (proposed): ../../../decisions/0010-coordination-follows-the-repository.md
- [Concept: Waypost 1.0](../../concepts/waypost-10-the-projects-memory-every-tool-shares-checked-without-a-model.md)

---

*Last updated: 2026-09-04*
