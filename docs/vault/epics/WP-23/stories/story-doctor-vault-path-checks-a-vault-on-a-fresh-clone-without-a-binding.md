---
type: story
id: "story-doctor-vault-path-checks-a-vault-on-a-fresh-clone-without-a-binding"
epic: "WP-23"
title: "doctor --vault <path> checks a vault on a fresh clone without a binding"
status: planned
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-14
updated: 2026-10-14
external_refs: {}
tags: []
code_refs: []
specs: []
started_at: null
closed_at: null
plan_updated_at: null
---

# doctor --vault <path> checks a vault on a fresh clone without a binding

| Field | Value |
|---|---|
| **Epic** | [WP-23](../epic.md) |
| **Status** | planned |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

A CI job on a fresh clone should check the vault with one command, without
`waypost bind` first.

## Decomposition

- [ ] `doctor --vault <path>`: a non-flag token after `--vault` is the vault directory
- [ ] no binding read in that mode; install checks not run
- [ ] the kanban / code-map / graph generator children receive the vault (not via the binding); layout defaults to `engineering`
- [ ] `--vault` alone unchanged

## Acceptance Criteria

- [ ] in a clone with no `.waypost/`, `waypost doctor --vault docs/vault` exits 0 on a healthy vault and prints no "generator failed" (test)
- [ ] the same with a stale kanban, graph or code map exits non-zero, with the same issues as with a binding (test)
- [ ] a path that does not exist, and an existing directory with none of the layout folders, are issues, exit non-zero (test)
- [ ] `waypost doctor --vault` with no binding still reports "No usable vault" (existing test stays green)

## Dependencies

- ADR "Solo entry without a profile: an external task trailer, doctor on a vault path, a vault-level opt-out from self-install"

---

*Last updated: 2026-10-14*
