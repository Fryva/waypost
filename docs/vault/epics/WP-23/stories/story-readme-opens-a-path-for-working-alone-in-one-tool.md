---
type: story
id: "story-readme-opens-a-path-for-working-alone-in-one-tool"
epic: "WP-23"
title: "README opens a path for working alone, in one tool"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-14
updated: 2026-10-15
external_refs: {}
tags: []
code_refs: ["README.md", "tests/readme-solo.test.mjs", "docs/how-it-works.md"]
specs: []
started_at: "2026-10-15T00:00:38.765Z"
closed_at: "2026-10-15T00:13:06.855Z"
plan_updated_at: "2026-10-15T00:00:38.765Z"
blocked_by: ["WP-23/story-commit-carries-an-external-task-id-in-a-waypost-task-trailer", "WP-23/story-doctor-vault-path-checks-a-vault-on-a-fresh-clone-without-a-binding", "WP-23/story-a-vault-turns-briefs-self-install-off-for-every-clone"]
---

# README opens a path for working alone, in one tool

| Field | Value |
|---|---|
| **Epic** | [WP-23](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

The README leads with the full loop and the team material. A solo developer
should find, near the top, the short path: bind a vault, gate CI with
`doctor --vault <path>`, put the tracker id in commits with `--task`, and turn
self-install off.

## Decomposition

- [x] "Working alone, in one tool" section after Quick start, in order: `bind --self-install off`, `.waypost/` in `.gitignore`, `doctor --vault <path>` in CI, `commit --task`
- [x] the minimum release with these commands, and one line advising `waypost agents register` to anyone who runs builds through agents
- [x] doctor and trailers presented as parts you can take alone
- [x] cross-check `docs/` for a contradicting description — docs/how-it-works.md (bind, brief, doctor, commit/log, skills) and README (Quick start, brief, command table, trailer list) updated

## Implementation Plan

<!-- Route through the covering spec's contracts: which contracts, in what order, which files. Filled at the gate. -->

## Acceptance Criteria

- [x] the section is under 25 lines and every command in it runs as shown (a test extracts the commands and runs them in a scratch repo) — evidence: tests/readme-solo.test.mjs (runs the bash block line by line in a scratch repo; asserts <25 lines, the task trailer, no role files even after brief)
- [x] it sits before "Working across tools, machines and people" — evidence: tests/readme-solo.test.mjs section-order assertion

## Final Summary

README gains "Working alone, in one tool" right after Quick start (20 lines):
`bind vault --self-install off`, `.waypost/` in `.gitignore`, `doctor --vault`,
`commit --task`, `log --task`, an anchored `git log --grep` for the whole
history, `bind` (not `setup`) on another clone, and `agents register` for anyone
whose agent runs builds. Quick start points solo users there; README and
docs/how-it-works.md now mention `--task`, `Waypost-Task`, `--vault <path>` and
`self_install`. tests/readme-solo.test.mjs runs the section's bash block as
written. Reviewer (fresh context): AC met after fixes (gitignore without a final
newline, unanchored grep, docs contradictions, the test checking files after brief).
Open: the version is stated as "newer than 0.16.0" until the release; the test
uses `sh`, so it needs Git Bash on Windows.

## Dependencies

- the three other WP-23 stories (commands must exist first)

---

*Last updated: 2026-10-15*
