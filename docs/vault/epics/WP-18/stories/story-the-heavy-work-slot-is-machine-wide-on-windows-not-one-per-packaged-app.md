---
type: story
id: "story-the-heavy-work-slot-is-machine-wide-on-windows-not-one-per-packaged-app"
epic: "WP-18"
title: "The heavy-work slot is machine-wide on Windows, not one per packaged app"
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

# The heavy-work slot is machine-wide on Windows, not one per packaged app

| Field | Value |
|---|---|
| **Epic** | [WP-18](../epic.md) |
| **Status** | planned |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

On Windows, Claude Code and Codex run as MSIX-packaged apps, and AppData is
virtualized per package: from a Claude desktop session
`%LOCALAPPDATA%\Waypost` resolves to
`…\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Local\Waypost`. The heavy-work
slot directory `slots.<host>` lives there, so each packaged harness and the
terminal likely keep their own slot — two heavy jobs from two harnesses would
not see each other, the case the slot exists for.

## Decomposition

- [ ] Measure: a slot claimed from the Claude app, the Codex app and a terminal
      — one directory or three (`realpathSync.native`).
- [ ] `machineStateDir()` → `~/.local/state/waypost` from `os.homedir()` on
      every OS (`%USERPROFILE%\.local\state\waypost` on Windows), as the
      global-rules ADR decides; refuse AppData targets.
- [ ] Migration from **every** old root — the real `%LOCALAPPDATA%\Waypost`,
      each `%LOCALAPPDATA%\Packages\*\LocalCache\Local\Waypost`,
      `$XDG_STATE_HOME/waypost`, `~/Library/Application Support/Waypost` —
      per file, no global "done" marker; old-root lock then new-root lock;
      older duplicates archived; conflicting copies kept under
      `migrated-conflicts/` (run budget: live runs refused until reset;
      cleanup limit: most restrictive wins); a budget anywhere but the new root
      refuses live runs; slots read from every old root for one release.
- [ ] Test isolation: once `machineStateDir()` ignores the environment, every
      test child sets `USERPROFILE` (`tests/env.mjs` `ambientEnv()`,
      `heavyEnv`, `tests/harness.test.mjs`, `tests/capacity.test.mjs`), with
      a guard test that no run touches the real home.
- [ ] Measure whether the Codex app's sandbox can write
      `%USERPROFILE%\.local\state` at all; if not, record it as a limitation.
- [ ] Re-check what the 2026-09-17 Windows pass of
      `story-capacity-verified-on-linux-and-windows-virtual-machines` measured,
      if it ran inside one package.
- [ ] Then re-stage the second real Windows restart from the owner's terminal.

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

## Acceptance Criteria

- [ ] A slot held from the Claude app refuses a heavy job from the Codex app
      and from a terminal, and the other way round, on `FROSTBEBE`.
- [ ] No Waypost machine state resolves under AppData.
- [ ] After the upgrade the run budget, the cleanup limit and a live slot are
      all still in force; a budget left only in the old root refuses live runs.
- [ ] Hermetic tests for the move from two package-store fixtures, a
      conflicting budget, the fallback and the AppData refusal.

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

- 2026-10-13: a restart test staged from a Claude desktop session wrote its
  planted record into the Claude package store; a terminal would not have seen
  it. The holder (`run --heavy`, 2 h) also expired before the restart. The
  test must be staged from the owner's terminal, after this story.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-13*
