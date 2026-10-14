---
type: story
id: "story-readme-opens-a-path-for-working-alone-in-one-tool"
epic: "WP-23"
title: "README opens a path for working alone, in one tool"
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
blocked_by: ["WP-23/story-commit-carries-an-external-task-id-in-a-waypost-task-trailer", "WP-23/story-doctor-vault-path-checks-a-vault-on-a-fresh-clone-without-a-binding", "WP-23/story-a-vault-turns-briefs-self-install-off-for-every-clone"]
---

# README opens a path for working alone, in one tool

| Field | Value |
|---|---|
| **Epic** | [WP-23](../epic.md) |
| **Status** | planned |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

The README leads with the full loop and the team material. A solo developer
should find, near the top, the short path: bind a vault, gate CI with
`doctor --vault <path>`, put the tracker id in commits with `--task`, and turn
self-install off.

## Decomposition

- [ ] "Working alone, in one tool" section after Quick start, in order: `bind --self-install off`, `.waypost/` in `.gitignore`, `doctor --vault <path>` in CI, `commit --task`
- [ ] the minimum release with these commands, and one line advising `waypost agents register` to anyone who runs builds through agents
- [ ] doctor and trailers presented as parts you can take alone
- [ ] cross-check `docs/` for a contradicting description

## Acceptance Criteria

- [ ] the section is under 25 lines and every command in it runs as shown (a test extracts the commands and runs them in a scratch repo)
- [ ] it sits before "Working across tools, machines and people"

## Dependencies

- the three other WP-23 stories (commands must exist first)

---

*Last updated: 2026-10-14*
