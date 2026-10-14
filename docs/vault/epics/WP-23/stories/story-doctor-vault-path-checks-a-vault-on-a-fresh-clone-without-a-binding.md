---
type: story
id: "story-doctor-vault-path-checks-a-vault-on-a-fresh-clone-without-a-binding"
epic: "WP-23"
title: "doctor --vault <path> checks a vault on a fresh clone without a binding"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-14
updated: 2026-10-14
external_refs: {}
tags: []
code_refs: ["scripts/doctor.mjs", "scripts/lib.mjs", "bin/waypost.mjs", "tests/scripts.test.mjs", "AGENTS.md", "CHANGELOG.md"]
specs: []
started_at: "2026-10-14T23:06:17.830Z"
closed_at: "2026-10-14T23:20:55.332Z"
plan_updated_at: "2026-10-14T23:06:17.830Z"
---

# doctor --vault <path> checks a vault on a fresh clone without a binding

| Field | Value |
|---|---|
| **Epic** | [WP-23](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

A CI job on a fresh clone should check the vault with one command, without
`waypost bind` first.

## Decomposition

- [x] `doctor --vault <path>`: a non-flag token after `--vault` is the vault directory
- [x] no binding required in that mode (a present binding still supplies layout/language); install checks not run
- [x] the kanban / code-map / graph generator children receive the vault (not via the binding); layout defaults to `engineering`
- [x] `--vault` alone unchanged

## Implementation Plan

<!-- Route through the covering spec's contracts: which contracts, in what order, which files. Filled at the gate. -->

## Acceptance Criteria

- [x] in a clone with no `.waypost/`, `waypost doctor --vault docs/vault` exits 0 on a healthy vault and prints no "generator failed" (test) — evidence: tests/scripts.test.mjs "doctor --vault <path> checks a vault with no binding…" (healthy, no "generator failed"); manual run on a fresh clone of this repo: 0 issues
- [x] the same with a stale kanban, graph or code map exits non-zero, with the same issues as with a binding (test) — evidence: tests/scripts.test.mjs "doctor --vault <path> checks a vault with no binding…" — kanban, graph and code-map each made stale, each exit 1 naming the view
- [x] a path that does not exist, and an existing directory with none of the layout folders, are issues, exit non-zero (test) — evidence: tests/scripts.test.mjs "doctor --vault <path> checks a vault with no binding…" (`empty`, `nope`)
- [x] `waypost doctor --vault` with no binding still reports "No usable vault" (existing test stays green) — evidence: tests/scripts.test.mjs "doctor --vault without a usable vault is an issue…" green

## Final Summary

`doctor --vault <path>` checks a vault with no binding: doctor sets an internal
`WAYPOST_VAULT` in its own process, `readConfig` honours it, and the kanban /
graph / code-map generators inherit it, so a stale view still fails. A path that
is not a directory, or holds none of the layout's folders, is an issue;
`--vault=<path>` is refused (exit 2). `writeConfig` refuses while `WAYPOST_VAULT`
is set, so a borrowed vault can never rebind the project.
Tests: scripts + commits suites 112/112, then the new test after the reviewer's
fixes. Reviewer (fresh context): AC met after fixes (graph/code-map coverage,
the rebind hazard, the `=` form).
Known limit: with no binding the language is English, so a non-English vault
reads as stale (red, not green). "generator failed" stays a warning, as before.

## Dependencies

- ADR "Solo entry without a profile: an external task trailer, doctor on a vault path, a vault-level opt-out from self-install"

---

*Last updated: 2026-10-14*
