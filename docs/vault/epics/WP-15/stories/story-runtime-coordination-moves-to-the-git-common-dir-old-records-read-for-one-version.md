---
type: story
id: "story-runtime-coordination-moves-to-the-git-common-dir-old-records-read-for-one-version"
epic: "WP-15"
title: "Runtime coordination moves to the git common dir; old records read for one version"
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

# Runtime coordination moves to the git common dir; old records read for one version

| Field | Value |
|---|---|
| **Epic** | [WP-15](../epic.md) |
| **Status** | planned |
| **Priority** | p1 |
| **Assignee** | Ivan Morozov |

---

## Description

Resolve the coordination directory once per command (git common dir when the vault is inside a repository, the vault otherwise, `coordination_dir` when set); write presence, leases and the legacy registry there; read the old location too for one minor version; `waypost storage` names the directory.

## Decomposition

- [ ] Measure git common dir behaviour on macOS, Linux and Windows worktrees; on a cloud drive
- [ ] `coordinationDir()` in lib.mjs; presenceDir/leaseDir/sessionsDir use it
- [ ] Dual-read in peers/readLeases/claimsOf; prune reaps both
- [ ] Tests with two worktrees of one temp repo

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

## Acceptance Criteria

- [ ] Two worktrees see each other's presence, claim and lease (test)
- [ ] A vault outside any repository keeps `.projectstore/` (test)
- [ ] `coordination_dir` overrides both (test)
- [ ] Old-location records are read and reaped (test)

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

Observations cache stays per host in `.waypost/state/`; it is keyed by session id, so the move does not change it.

## Dependencies

- story-adr-0010-accepted-presence-leases-and-claims-in-the-git-common-dir

## Attachments

-

---

*Last updated: 2026-09-04*
