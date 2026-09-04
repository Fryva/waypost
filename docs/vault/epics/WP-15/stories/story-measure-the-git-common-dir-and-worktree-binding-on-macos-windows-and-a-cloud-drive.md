---
type: story
id: "story-measure-the-git-common-dir-and-worktree-binding-on-macos-windows-and-a-cloud-drive"
epic: "WP-15"
title: "Measure the git common dir and worktree binding on macOS, Windows and a cloud drive"
status: in-progress
priority: p1
assignee: "Ivan Morozov"
created: 2026-09-04
updated: 2026-09-04
external_refs: {}
tags: []
code_refs: []
specs: []
started_at: "2026-09-04T16:48:24.407Z"
closed_at: null
plan_updated_at: "2026-09-04T16:48:24.407Z"
---

# Measure the git common dir and worktree binding on macOS, Windows and a cloud drive

| Field | Value |
|---|---|
| **Epic** | [WP-15](../epic.md) |
| **Status** | in-progress |
| **Priority** | p1 |
| **Assignee** | Ivan Morozov |

---

## Description

ADR-0010 rests on measured behaviour of `git rev-parse --path-format=absolute
--git-common-dir` and of a linked worktree's `.git` file. The critic pass
measured macOS (git 2.50.1): main copy, subdirectory, linked worktree, bare
repo, submodule, nested repo. Windows worktrees and a `.git` on a cloud drive
are not measured, and CI is Linux only, so this story runs by hand on the
owner's machines before anything moves.

## Decomposition

- [x] Script that prints, per layout, the common dir and whether the main binding is reachable — evidence: runbook "Measure the git common dir across checkout layouts"
- [x] macOS run — evidence: table in ADR-0010, 2026-09-04, git 2.50.1
- [ ] Windows (native git and Git for Windows) — owner's machine
- [ ] Repository on iCloud or Dropbox — owner's machine
- [x] Rows CI can reproduce pinned in tests — evidence: tests/presence.test.mjs "the git common dir answers what ADR-0010 assumes"

## Implementation Plan

Runbook in `ops/` with the script; rows measured on macOS today, pinned by a test in tests/presence.test.mjs for the layouts CI (Linux) can reproduce; Windows and a cloud-drive `.git` are the owner's to run with the same script.

## Acceptance Criteria

- [x] ADR-0010 carries the measured table with dates and git versions — evidence: ADR-0010 "Verification and follow-up" (macOS rows; Windows and cloud rows marked open)
- [x] Tests pin every row that CI can reproduce — evidence: tests/presence.test.mjs

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

A linked worktree's `.git` file holds an absolute gitdir; a checkout mounted under different paths on two machines will not resolve for linked worktrees — confirm and document rather than paper over.

## Dependencies

- story-adr-0010-accepted-presence-leases-and-claims-in-the-git-common-dir

## Attachments

-

---

*Last updated: 2026-09-04*
