---
type: story
id: "story-commit-carries-an-external-task-id-in-a-waypost-task-trailer"
epic: "WP-23"
title: "Commit carries an external task id in a Waypost-Task trailer"
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

# Commit carries an external task id in a Waypost-Task trailer

| Field | Value |
|---|---|
| **Epic** | [WP-23](../epic.md) |
| **Status** | planned |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

A developer whose tasks live in an external tracker (YouTrack, Jira, Linear)
wants the task id in each commit without creating vault stories.

## Decomposition

- [ ] `waypost commit --task <id>` writes `Waypost-Task: <id>`; allowlist from the ADR; repeatable; empty/flag value is an error
- [ ] `waypost log --task <id>` filters on it by exact match, with its own key (no fallback to another field)
- [ ] `--story` behaviour unchanged (ADR-0006 test stays green)
- [ ] Help text and the AGENTS.md command table mention `--task`

## Acceptance Criteria

- [ ] `waypost commit -m x --task PROJ-123` in a repo with no vault writes the trailer (test)
- [ ] the same with a bound vault that has no such story writes the trailer (test)
- [ ] `--task "a b"`, a 65-character id, an id with `\x1f`, `--task` with no value and `--task --all` are rejected (test)
- [ ] `--task A-1 --task B-2` writes two trailer lines (test)
- [ ] `waypost log --task PROJ-123` lists that commit and `waypost log --task PROJ-12` does not (test)
- [ ] `tests/commits.test.mjs` typo-rejection test for `--story` still passes

## Dependencies

- ADR "Solo entry without a profile: an external task trailer, doctor on a vault path, a vault-level opt-out from self-install"

---

*Last updated: 2026-10-14*
