---
type: story
id: "story-doctor-memory-the-memory-directory-claude-code-loads-its-state-and-size"
epic: "WP-22"
title: "doctor --memory: the Memory directory Claude Code loads, its state and size"
status: planned
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-15
updated: 2026-11-15
external_refs: {}
tags: ["memory", "doctor"]
code_refs: []
specs: []
started_at: null
closed_at: null
plan_updated_at: null
---

# doctor --memory: the Memory directory Claude Code loads, its state and size

| Field | Value |
|---|---|
| **Epic** | [WP-22](../epic.md) |
| **Status** | planned |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Implements the accepted ADR [Project Memory: one directory for every harness,
measured on request](../../../adr/project-memory-one-directory-for-every-harness-measured-on-request.md). Codex and OpenCode key the shared
Memory with the wrong rule (`/` → `-`) and read it unmeasured; nothing tells
the owner when an index nears Claude Code's load limit (P2PMessenger: 93 %).
`waypost doctor --memory` computes the directory Claude Code loads by default,
its state, and the index and topic sizes, read-only, in any directory.

## Decomposition

- [ ] `scripts/memory.mjs`: the canonical root (`.git` walk through
  `gitdir`/`commondir`/`worktrees`), the key (realpath, NFC, `[^a-zA-Z0-9]`
  → `-`, over 200 characters truncated plus the base-36 hash), the state in
  the ADR's numbered order, the measurements.
- [ ] `scripts/tokens.mjs` uses the same key function with its own root.
- [ ] `doctor --memory` in the CLI: no binding required, first stdout line
  `memory: <state> …` independent of the registry, `--json`
  `{state, dir, source, findings}`, `--memory --fix` refused, exit 1 only
  on an `issue` in text mode.
- [ ] `harnesses/claude.json`: `memory: {index_lines: 200, index_chars:
  25000, confidence: "inferred", docs, notes}` through the ordinary loader.
- [ ] `tests/memory.test.mjs`: the ADR's Consequences test list; the guard's
  byte-identical home tree. `tests/env.mjs` clears inherited `CLAUDE_*`.
- [ ] `docs/cli-reference.md`: `doctor --memory`, its JSON shape, the sources
  Waypost cannot see.
- [ ] The ADR's three open questions answered against the installed Claude
  Code: legacy `env` in `~/.claude.json`, JSONC settings, 2.1.325 vs 2.1.316.
- [ ] Out of this story, the owner's step: Decision 4's edit of the three
  global rule files, after this ships.

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <path>#"<test title>" | <command> | <file>:<line> -->

- [ ] The key matches Claude Code's for a linked worktree, a submodule, a
  bare repository with a worktree, `--separate-git-dir`, a symlinked path, a
  path over 200 characters, an NFD path and an emoji.
- [ ] Every step of the state order has a test, including the conflicts the
  ADR names (settings `=0` beating process `=1`, process `=0` never turning
  Memory on, invalid settings JSON giving `off`).
- [ ] The first stdout line matches `^memory: (exists|absent|overridden|off)`
  in all four states, also unbound and with a broken registry.
- [ ] A Cyrillic index between 25 000 characters and 25 000 bytes is not an
  issue; over 25 000 characters or 200 lines is, and exits 1.
- [ ] The `.claude/projects` tree of a temporary home, files and
  directories, is byte-identical after a run, also when Memory is absent.
- [ ] `tokens.mjs` keys a path over 200 characters the same as
  `scripts/memory.mjs`.
- [ ] Default `doctor`, `next` and `brief` output is unchanged.
- [ ] `npm test` passes.

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

## Dependencies

- ADR: [Project Memory: one directory for every harness, measured on request](../../../adr/project-memory-one-directory-for-every-harness-measured-on-request.md) (accepted)

## Attachments

-

---

*Last updated: 2026-11-15*
