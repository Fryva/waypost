---
type: story
id: "story-shared-checkout-detection-covers-sibling-worktrees-of-one-repository"
epic: "WP-15"
title: "Shared-checkout detection covers sibling worktrees of one repository"
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

# Shared-checkout detection covers sibling worktrees of one repository

| Field | Value |
|---|---|
| **Epic** | [WP-15](../epic.md) |
| **Status** | planned |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

`sharedTree()` gains a same-repository signal: a live peer whose git common dir is ours but whose project root differs is a sibling worktree. brief/sessions/status list them separately, and a lease from a sibling worktree is reported as a merge conflict on its way.

## Decomposition

- [ ] Record the common dir in presence records
- [ ] Signal and wording in sharedTree, brief, sessions
- [ ] Tests

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

## Acceptance Criteria

- [ ] A sibling-worktree peer is named as such in brief and sessions (test)
- [ ] A foreign lease from a sibling worktree is shown with the worktree path

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

-

## Dependencies

- story-runtime-coordination-moves-to-the-git-common-dir-old-records-read-for-one-version

## Attachments

-

---

*Last updated: 2026-09-04*
