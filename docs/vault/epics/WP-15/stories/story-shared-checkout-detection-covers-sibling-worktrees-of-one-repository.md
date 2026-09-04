---
type: story
id: "story-shared-checkout-detection-covers-sibling-worktrees-of-one-repository"
epic: "WP-15"
title: "Shared-checkout detection covers sibling worktrees of one repository"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-09-04
updated: 2026-09-04
external_refs: {}
tags: []
code_refs: []
specs: []
started_at: "2026-09-04T18:14:29.428Z"
closed_at: "2026-09-04T18:14:30.249Z"
plan_updated_at: "2026-09-04T18:14:29.428Z"
---

# Shared-checkout detection covers sibling worktrees of one repository

| Field | Value |
|---|---|
| **Epic** | [WP-15](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

`sharedTree()` gains a same-repository signal: a live peer whose git common dir is ours but whose project root differs is a sibling worktree. brief/sessions/status list them separately, and a lease from a sibling worktree is reported as a merge conflict on its way.

## Decomposition

- [x] `common_dir` in presence records — evidence: scripts/presence.mjs `selfDescriptor`
- [x] Signal and wording in sharedTree, brief, sessions — evidence: `sharedTree().siblings`, brief "Sibling worktrees of this repository", sessions "sibling worktrees of this repository: …"
- [x] Tests — evidence: "a live peer on another host in this very checkout is shared; a sibling worktree is named, never shared (ADR-0010)" and the worktree test in tests/presence.test.mjs

## Implementation Plan

Landed in the same change as the move (7392907), as ADR-0010 requires: every presence record carries `common_dir`; `sharedTree` reads same common dir + different project root as a sibling worktree and returns `siblings` beside `with`; the vault-offset signal is retired. brief and sessions print siblings with their project root; the shared-checkout gate on `commit --all` ignores them; their leases surface through the existing lease list and commit gate.

## Acceptance Criteria

- [x] A sibling-worktree peer is named as such in brief and sessions (test) — evidence: worktree test asserts `shared_tree.siblings` and the brief line
- [x] A foreign lease from a sibling worktree is shown — evidence: the worktree test sees the sibling's lease in `sessions --json` `leases`; sessions/brief already print foreign leases with their session

## Final Summary

Closed with the move; the only design change from the plan is the one ADR-0010's critic forced: the vault-offset signal is gone rather than kept beside the new one.

## Technical Notes

-

## Dependencies

- story-runtime-coordination-moves-to-the-git-common-dir-old-records-read-for-one-version

## Attachments

-

---

*Last updated: 2026-09-04*
