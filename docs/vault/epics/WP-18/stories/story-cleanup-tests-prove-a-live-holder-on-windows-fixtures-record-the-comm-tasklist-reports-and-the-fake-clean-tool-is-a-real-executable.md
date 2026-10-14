---
type: story
id: "story-cleanup-tests-prove-a-live-holder-on-windows-fixtures-record-the-comm-tasklist-reports-and-the-fake-clean-tool-is-a-real-executable"
epic: "WP-18"
title: "Cleanup tests prove a live holder on Windows: fixtures record the comm tasklist reports, and the fake clean tool is a real executable"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-13
updated: 2026-10-14
external_refs: {}
tags: []
code_refs: ["tests/limit.test.mjs", "tests/cleanup.test.mjs", "scripts/capacity.mjs", "bin/waypost"]
specs: []
started_at: null
closed_at: "2026-10-14T01:39:42.294Z"
plan_updated_at: null
---

# Cleanup tests prove a live holder on Windows: fixtures record the comm tasklist reports, and the fake clean tool is a real executable

| Field | Value |
|---|---|
| **Epic** | [WP-18](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

On the Windows VM (FROSTBEBE, network-share checkout, HEAD a2d33fb, 2026-10-13)
five AC8 tests and one AC12 test in `tests/limit.test.mjs` and AC 3 (apply) in
`tests/cleanup.test.mjs` failed: the automatic cleanup after `waypost run --heavy`
renamed an artifact although a live holder covered the project.

Root cause — the fixtures, not the product:

- **limit.test.mjs.** `selfHolderRecord()` and the AC12 "alive" marker recorded
  `comm: "test"`. On win32 there is no process table, so `slotLive()` →
  `processStillThere()` (`scripts/capacity.mjs`) compares the record's `comm`
  with the image name `tasklist` reports for the pid — `node.exe` — and a
  mismatch means "pid reused, holder gone". The live test process therefore read
  as stale, `blockingHolder()` never saw it, and the cleanup went ahead. On
  macOS/Linux the process table decides and `comm` is never compared, which is
  why the suite was green there. `bin/waypost` itself records
  `comm: basename(process.execPath)` (the slot claim), so a real holder matches
  `tasklist` and the product was not affected.
- **cleanup.test.mjs AC 3.** The fake tool was an extensionless `#!/bin/sh`
  script on a `:`-joined PATH: on win32 `findOnPath` cannot find it through
  PATHEXT, and a `.cmd` shim would be refused by design (`removeItem`,
  `BATCH_SHIM_RE`). Unrelated to holders.

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [x] limit fixtures record `comm: basename(process.execPath)`, as `bin/waypost` does
- [x] AC 3's fake tool is node linked as `faketool` (`faketool.exe` on win32) running a `.cjs` script; PATH joined with `path.delimiter`
- [x] run the seven tests on the Windows VM — 10/10 pass at 6310615

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [x] The five AC8 tests and the AC12 leftover test in `tests/limit.test.mjs` pass on Windows — evidence: Windows VM FROSTBEBE at 6310615, 2026-10-13, `node --test --test-name-pattern="AC8|AC12|AC 3 \(apply\)" tests/limit.test.mjs tests/cleanup.test.mjs` — 10 pass, 0 fail
- [x] "AC 3 (apply)" in `tests/cleanup.test.mjs` passes on Windows — evidence: Windows VM FROSTBEBE at 6310615, 2026-10-13, `node --test --test-name-pattern="AC8|AC12|AC 3 \(apply\)" tests/limit.test.mjs tests/cleanup.test.mjs` — 10 pass, 0 fail
- [x] Both files stay green on macOS — evidence: `node --test tests/limit.test.mjs tests/cleanup.test.mjs`, 2026-10-13, all pass
- [x] Both files green on Linux — evidence: Debian 13.6 ARM64 VM (Parallels), node 20.19.2, at 6310615, 2026-10-13, `node --test tests/limit.test.mjs tests/cleanup.test.mjs` — all pass

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

Fixture-only fix, committed in 6310615; no product code changed. The holder
fixtures in `tests/limit.test.mjs` now record `comm: basename(process.execPath)`,
the value `bin/waypost` itself writes, so the win32 `tasklist` comparison sees
them as live. AC 3 in `tests/cleanup.test.mjs` uses node linked as `faketool`
(`.exe` on win32) running a `.cjs` script, on a PATH joined with
`path.delimiter`. Verified the same day on all three OSes: Windows VM (10/10
of the targeted tests), macOS and a Debian ARM64 VM (both files whole).
Follow-up left open: the win32 `comm` comparison is case-sensitive and
`tasklist` truncates image names to 25 characters (see Technical Notes).

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

- A holder fixture meant to be live must carry the `comm` the product would
  write; `tests/slots.test.mjs` selfRecord() already did.
- Not changed, possible follow-up: the win32 `comm` comparison is
  case-sensitive, and `tasklist` truncates image names to 25 characters — a
  holder run from an executable with a longer name would read as gone.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-14*
