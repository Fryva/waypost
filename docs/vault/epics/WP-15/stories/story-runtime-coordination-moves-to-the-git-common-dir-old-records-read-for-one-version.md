---
type: story
id: "story-runtime-coordination-moves-to-the-git-common-dir-old-records-read-for-one-version"
epic: "WP-15"
title: "Runtime coordination moves to the git common dir; old records read for one version"
status: done
priority: p1
assignee: "Ivan Morozov"
created: 2026-09-04
updated: 2026-09-04
external_refs: {}
tags: []
code_refs: []
specs: []
started_at: "2026-09-04T17:57:32.223Z"
closed_at: "2026-09-04T18:13:59.810Z"
plan_updated_at: "2026-09-04T17:57:32.223Z"
---

# Runtime coordination moves to the git common dir; old records read for one version

| Field | Value |
|---|---|
| **Epic** | [WP-15](../epic.md) |
| **Status** | done |
| **Priority** | p1 |
| **Assignee** | Ivan Morozov |

---

## Description

Resolve the coordination directory once per command (git common dir when the vault is inside a repository, the vault otherwise, `coordination_dir` when set); write presence, leases and the legacy registry there; read the old location too for one minor version; `waypost storage` names the directory.

## Decomposition

- [x] Measure the common dir on macOS (Linux rows pinned by test; Windows/cloud in the measurement story) — evidence: ADR-0010 table, test "the git common dir answers what ADR-0010 assumes…"
- [x] `coordinationDirs()` in presence.mjs; presenceDir/leaseDir use it; `sessionsDir` stays in the vault — evidence: scripts/presence.mjs, scripts/lib.mjs `sessionsDir` untouched
- [x] Dual write and merged read for one minor version; prune and release over every copy — evidence: test "inside a repository presence and leases live in the git common dir, and both places are written for one version"
- [x] Two worktrees of one temp repository see each other — evidence: test "a linked worktree inherits the binding, shares the records, is named a sibling, and keeps its own identity"

## Implementation Plan

lib.mjs: `gitCommonDir` (absolute form, bare excluded, cached per root), `mainWorktree`, `isLinkedWorktree` (real paths), `worktreeTag`, `bindingInfo` (a linked worktree inherits the main worktree's binding; `writeConfig` writes back there). presence.mjs: `coordinationDirs(vault)` → `.git/waypost/<vault key>/` inside a repository, `<vault>/.projectstore/` otherwise, `coordination_dir` overriding; dual write in `beat`/`acquire`, merged reads in `peers`/`readLeases` keyed by file name with the new place first, reaps and releases over every copy; `common_dir` in every presence record; `sharedTree` with sibling worktrees and the vault-offset signal retired; storage classified for the coordination directory. bin/waypost: config reading delegated to lib, ids from the environment qualified per linked worktree, `status` says where the binding came from. sessions/brief print siblings; `waypost storage` names the directory.

## Acceptance Criteria

- [x] Two worktrees see each other's presence, claim and lease (test) — evidence: presence and lease asserted both ways in the worktree test; claims ride in presence records
- [x] A vault outside any repository keeps `.projectstore/` (test) — evidence: test "a vault outside any repository, or a project without git, keeps the ADR-0007 place"
- [x] `coordination_dir` overrides both (test) — evidence: the worktree test's last block, through `waypost storage` from both worktrees
- [x] Old-location records are read and reaped (test) — evidence: `old-timer` in the dual-write test

## Final Summary

Landed as designed in ADR-0010, plus what the tests surfaced: macOS real paths (`/private/var` vs `/var`) must be compared as real paths or a main worktree reads as linked; the test fixtures had to ask for coordination directories under the fixture's project, because they resolve against the project root by design. 358 tests green. Windows and cloud-drive measurements stay with the measurement story before the release.

## Technical Notes

Observations cache stays per host in `.waypost/state/`; it is keyed by session id, so the move does not change it.

## Dependencies

- story-adr-0010-accepted-presence-leases-and-claims-in-the-git-common-dir

## Attachments

-

---

*Last updated: 2026-09-04*
