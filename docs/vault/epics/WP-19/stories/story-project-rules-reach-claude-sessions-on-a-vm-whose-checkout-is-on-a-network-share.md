---
type: story
id: "story-project-rules-reach-claude-sessions-on-a-vm-whose-checkout-is-on-a-network-share"
epic: "WP-19"
title: "Project rules reach Claude sessions on a VM whose checkout is on a network share"
status: planned
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-13
updated: 2026-10-13
external_refs: {}
tags: []
code_refs: []
specs: []
started_at: null
closed_at: null
plan_updated_at: null
---

# Project rules reach Claude sessions on a VM whose checkout is on a network share

| Field | Value |
|---|---|
| **Epic** | [WP-19](../epic.md) |
| **Status** | planned |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

This repo's `.claude/CLAUDE.md` is the single line `@AGENTS.md`. Claude Code
resolves a relative import against the file that contains it, so that line
points at `.claude/AGENTS.md`, which does not exist — the routing block and
every rule in `AGENTS.md` likely never reach Claude sessions in this repo, on
any machine, not only on a VM. A Claude session on `FROSTBEBE` received the
line unexpanded. `scripts/agents.mjs` (the G-1 comment, `instructionTargetFor`,
`importsSharedFile`) assumes imports resolve against the project root, and so
skips writing the block where it would land. The title predates this finding.

## Decomposition

- [x] Confirm on the macOS host: a fresh Claude session in this repo has
      `AGENTS.md` content (sentinel rule) after the fix, and did not before —
      2026-10-13, Claude Code 2.1.296, `claude -p` with file tools denied, in
      a worktree of 67a50fa with a sentinel appended to `AGENTS.md`:
      `@../AGENTS.md` → sentinel returned; `@AGENTS.md` → `NONE`.
- [x] Fix this repo: `@../AGENTS.md` in `.claude/CLAUDE.md` — 2026-10-13.
- [x] Resolve an import against the importing file's directory
      (`importTargets`, `importsSharedFile` in `scripts/agents.mjs`); fenced
      code and HTML comments are not imports; one import anywhere among the
      files Claude loads means no own file gets a second copy — 2026-10-13.
- [x] `doctor` reports `claude-import-missing`; `--fix` rewrites a bare
      root-relative import — 2026-10-13.
- [ ] `unregister` sweeps a block left in an own file that later gained a
      correct import.
- [ ] Check every project Waypost has set up for the same broken import.

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

## Acceptance Criteria

- [ ] A fresh Claude session in this repo, on the host and on `FROSTBEBE`,
      follows a sentinel rule placed in `AGENTS.md`.
- [ ] `doctor` reports an `@` import that resolves to a missing file;
      hermetic tests for `.claude/CLAUDE.md` and root `CLAUDE.md` bridges.

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->
- 2026-10-13: hermetic tests in `tests/harness.test.mjs` — the flipped G-1
  case, a root `CLAUDE.md` importing `@../AGENTS.md`, fenced and commented
  examples, the two-file layout, and `doctor` report plus `--fix`; red with
  the change reverted, green with it.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-13*
