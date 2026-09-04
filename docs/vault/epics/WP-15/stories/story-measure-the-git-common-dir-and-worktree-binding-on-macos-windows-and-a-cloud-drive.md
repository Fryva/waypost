---
type: story
id: "story-measure-the-git-common-dir-and-worktree-binding-on-macos-windows-and-a-cloud-drive"
epic: "WP-15"
title: "Measure the git common dir and worktree binding on macOS, Windows and a cloud drive"
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

# Measure the git common dir and worktree binding on macOS, Windows and a cloud drive

| Field | Value |
|---|---|
| **Epic** | [WP-15](../epic.md) |
| **Status** | planned |
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

- [ ] A script that prints, for each layout, what `--git-common-dir` answers and whether the main worktree's `.waypost/projectstore.json` is reachable
- [ ] Run it on macOS, on Windows (native git and Git for Windows paths), and with a repository on iCloud or Dropbox
- [ ] Record the table in ADR-0010 and pin the macOS/Linux rows in tests

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

## Acceptance Criteria

- [ ] ADR-0010 carries the measured table with dates and git versions
- [ ] Tests pin every row that CI can reproduce

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
