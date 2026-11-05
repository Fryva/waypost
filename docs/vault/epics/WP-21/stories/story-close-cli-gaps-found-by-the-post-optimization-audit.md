---
type: story
id: "story-close-cli-gaps-found-by-the-post-optimization-audit"
epic: "WP-21"
title: "Close CLI gaps found by the post-optimization audit"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-05
updated: 2026-11-05
external_refs: {}
tags: []
code_refs: ["bin/waypost.mjs", "bin/cli/core.mjs", "bin/cli/views.mjs", "bin/cli/handoff-transfer.mjs", "docs/cli-reference.md", "tests/harness.test.mjs", "tests/scripts.test.mjs"]
specs: []
started_at: "2026-11-05T04:45:08.571Z"
closed_at: "2026-11-05T04:45:17.027Z"
plan_updated_at: "2026-11-05T04:45:08.571Z"
---

# Close CLI gaps found by the post-optimization audit

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

A fresh five-zone audit of the WP-21 optimization range (7255443..9f274c5) found no
regressions from the module splits, caches or compacted output, but three gaps an
agent can hit: `<cmd> --help` ran commands that have no help of their own
(`setup --help` bound a vault and installed roles); `graph --for` on a hub filled
its 60-row bound with outgoing rows and hid every backlink; `handoff transfer gc`
without `--keep` collected every stored snapshot.

## Decomposition

- [x] The entry routes `<cmd> --help`/`-h` (before `--`) to the general help, except agents/harnesses/tokens which parse it themselves.
- [x] `graph --for` past its bound lists incoming rows first (unmirrored before mirrored), names `--all` in the remainder line, and `--all` lifts the bound.
- [x] `handoff transfer gc` requires `--keep`.

## Implementation Plan

`asksHelp(cmd, args)` lives in `bin/cli/core.mjs` next to `flag()` (which already stops at `--`), so the entry stays under its 14000-byte ceiling; the entry rewrites `cmd` to `help` before state migration, heartbeat or harness detection. `handleGraphQuery` partitions edges only when truncating, so output at or under 60 rows is unchanged. `gc` joins the required-option list.

## Acceptance Criteria

- [x] `setup --help`, `bind -h`, `team --help`, `run --heavy -h` print help and leave the project untouched; `run --heavy -- echo x -h` still passes `-h` through. — evidence: tests/harness.test.mjs "<cmd> --help prints help instead of running a command that has none"; manual run in a temp project.
- [x] A hub over the bound shows its backlinks first (an unmirrored one before story mirrors), the remainder names `--all`, `--all` prints every row; output at or under 60 rows is byte-identical. — evidence: tests/scripts.test.mjs graph query tests incl. "a backlink from an unlinked node precedes mirrored ones", `waypost graph --for epics/WP-21/epic.md`.
- [x] `handoff transfer gc` without `--keep` fails with handoff-transfer-required-options. — evidence: tests/harness.test.mjs "handoff transfer gc refuses to run without --keep…".

## Final Summary

Three CLI gaps closed; the audit itself found the optimization range regression-free (Doctor checks/JSON/exit codes, derived views byte-identical to base, 200k-line differential fuzz of link parsing, all compacted `--json` unchanged). Full suite on 9f274c5: 2479 tests, 0 fail, 9 skipped (macOS, Node 25). Affected files after the change: harness, scripts, sizes, handoff-capture/-delivery/-recovery/-transfer, cleanup-limit, token-navigation, tokens — 443 tests, 2 graph-remainder expectations updated, then graph query 6/6. Fresh waypost-reviewer: story closed / commit; its should-fixes applied (hermetic env for the help test, `--` boundary and own-help exceptions pinned, positive gc control, unmirrored backlinks first). Full suite not re-run after the change.

Left for the owner, not changed here: `handoff capture` timeout kills only the direct child (grandchildren outlive the heavy slot; a process group would stop terminal Ctrl-C reaching it); the handoff store `.lock` carries no pid, so a crash leaves it forever; `deliver`/`continue` cannot resume past a stored deadline; cleanup does not literally spare the newest artifact; host identity is the short hostname; bare-link ring-2 resolution is still O(links × files).

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-11-05*
