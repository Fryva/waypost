---
type: story
id: "story-commit-carries-an-external-task-id-in-a-waypost-task-trailer"
epic: "WP-23"
title: "Commit carries an external task id in a Waypost-Task trailer"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-14
updated: 2026-10-14
external_refs: {}
tags: []
code_refs: ["scripts/commit.mjs", "bin/waypost.mjs", "tests/commits.test.mjs", "AGENTS.md", "CHANGELOG.md"]
specs: []
started_at: "2026-10-14T22:51:05.090Z"
closed_at: "2026-10-14T23:03:07.884Z"
plan_updated_at: "2026-10-14T22:51:05.090Z"
---

# Commit carries an external task id in a Waypost-Task trailer

| Field | Value |
|---|---|
| **Epic** | [WP-23](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

A developer whose tasks live in an external tracker (YouTrack, Jira, Linear)
wants the task id in each commit without creating vault stories.

## Decomposition

- [x] `waypost commit --task <id>` writes `Waypost-Task: <id>`; allowlist from the ADR; repeatable; empty/flag value is an error
- [x] `waypost log --task <id>` filters on it by exact match, with its own key (no fallback to another field)
- [x] `--story` behaviour unchanged (ADR-0006 test stays green)
- [x] Help text and the AGENTS.md command table mention `--task`

## Implementation Plan

<!-- Route through the covering spec's contracts: which contracts, in what order, which files. Filled at the gate. -->

## Acceptance Criteria

- [x] `waypost commit -m x --task PROJ-123` in a repo with no vault writes the trailer (test) — evidence: tests/commits.test.mjs "an external task id goes in its own Waypost-Task trailer…" (bare repo, read back through git's trailer parser)
- [x] the same with a bound vault that has no such story writes the trailer (test) — evidence: same test, `repo()` with epic PS-1 and no stories
- [x] `--task "a b"`, a 65-character id, an id with `\x1f`, `--task` with no value and `--task --all` are rejected (test) — evidence: same test, refusal loop (also `--task=PROJ-9`); scripts/commit.mjs taskIds
- [x] `--task A-1 --task B-2` writes two trailer lines (test) — evidence: same test, deepEqual ["PROJ-123","OPS-7"]
- [x] `waypost log --task PROJ-123` lists that commit and `waypost log --task PROJ-12` does not (test) — evidence: same test; exact match in scripts/commit.mjs log
- [x] `tests/commits.test.mjs` typo-rejection test for `--story` still passes — evidence: tests/commits.test.mjs "a story reference is resolved against the vault…" passes; storyRef unchanged

## Final Summary

`waypost commit --task <id>` writes `Waypost-Task: <id>` (allowlist
`^[A-Za-z0-9][A-Za-z0-9._#/-]{0,63}$`, repeatable, duplicates dropped; no value,
a flag as value, or `--task=` is an error before anything is staged). `log --task`
matches exactly on its own field. `--story` and ADR-0006 typo rejection unchanged.
Tests: `tests/commits.test.mjs` 27/27 before the reviewer's fixes, then the
affected tests 5/5. Reviewer (fresh context): all AC met.
Not done: `merge <ref> --task` drops the id (as `--story` already does); `log`
filters scan only the last 20×n commits — for "everything on task X" use
`git log --grep "Waypost-Task: X"`.

## Dependencies

- ADR "Solo entry without a profile: an external task trailer, doctor on a vault path, a vault-level opt-out from self-install"

---

*Last updated: 2026-10-14*
