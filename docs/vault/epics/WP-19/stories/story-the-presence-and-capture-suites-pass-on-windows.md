---
type: story
id: "story-the-presence-and-capture-suites-pass-on-windows"
epic: "WP-19"
title: "The presence and capture suites pass on Windows"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-05
updated: 2026-11-05
external_refs: {}
tags: []
code_refs: ["tests/presence-storage.test.mjs", "tests/presence.test.mjs", "tests/handoff-capture.test.mjs"]
specs: []
started_at: "2026-11-05T21:29:03.165Z"
closed_at: "2026-11-05T21:29:04.715Z"
plan_updated_at: "2026-11-05T21:29:03.165Z"
---

# The presence and capture suites pass on Windows

| Field | Value |
|---|---|
| **Epic** | [WP-19](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

A run on a Windows 11 VM (Node 24) failed four tests that also fail at 9f274c5, before this round of work: each encoded a POSIX assumption, not a Windows defect in the code.

- presence-storage (two tests, three assertions): gitCommonDir() deliberately returns the common dir with forward slashes (it is written into presence records); the tests expected a native join().
- presence: checkProcessTable() returns nothing on win32 by design (Windows liveness never reads a process table); the test asserted the POSIX warning on every platform.
- handoff-capture "inherited pipes have an independent bounded drain deadline": libuv puts a node process's children in a kill-on-close job object, so the grandchild meant to hold the pipes died with its parent and the drain deadline was never reached.

## Decomposition

- [x] Expect the forward-slash common dir in the three presence-storage assertions
- [x] On win32, assert that checkProcessTable(null) is empty; the POSIX assertions are unchanged
- [x] On win32, spawn the pipe-holding grandchild detached so it leaves the job object

## Implementation Plan

Test-only changes; no code path changes. POSIX behaviour of every test is unchanged.

## Acceptance Criteria

- [x] The three suites pass on Windows 11 — evidence: two consecutive runs on the VM, 89 tests, 81 pass, 0 fail, 8 skipped (POSIX-only)
- [x] They still pass on macOS — evidence: 89 tests, 87 pass, 0 fail, 2 skipped (Linux-only)

## Final Summary

Four Windows failures that predate this work are gone; all were test assumptions. The baseline run hid a third common-dir assertion behind the first failing one; it is fixed too. A run straight after the VM booted timed out three capture tests (status 124 under a 3 s fixture timeout, one test took 51 s); taskkill was measured at about 100 ms and two later runs were clean, so that was boot load, not the change. Not run on Windows: the rest of the suite.

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-11-05*
