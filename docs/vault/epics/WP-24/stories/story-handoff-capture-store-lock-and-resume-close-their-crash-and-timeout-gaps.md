---
type: story
id: "story-handoff-capture-store-lock-and-resume-close-their-crash-and-timeout-gaps"
epic: "WP-24"
title: "Handoff capture, store lock and resume close their crash and timeout gaps"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-05
updated: 2026-11-05
external_refs: {}
tags: []
code_refs: ["bin/cli/handoff-capture.mjs", "scripts/handoff-transfer.mjs", "scripts/handoff-delivery.mjs", "scripts/handoff-retrieval.mjs", "tests/handoff-capture.test.mjs", "tests/handoff-transfer.test.mjs", "tests/handoff-delivery.test.mjs", "tests/handoff-retrieval.test.mjs", "docs/handoffs.md"]
specs: []
started_at: "2026-11-05T05:37:10.007Z"
closed_at: "2026-11-05T06:18:33.375Z"
plan_updated_at: "2026-11-05T05:37:10.007Z"
---

# Handoff capture, store lock and resume close their crash and timeout gaps

| Field | Value |
|---|---|
| **Epic** | [WP-24](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

An audit of the handoff code found three ways a crash or a deadline loses work: `handoff capture` killed only its direct child on timeout, so grandchildren outlived the heavy slot; the transfer store's `.lock` named no holder, so a crashed import left every later import/report/gc failing with EEXIST forever (and a crash between creating the store and writing owner.json left an unreadable store); and a `deliver`/`continue` resume past the stored deadline failed before reading an answer the owner had already paid for.

## Decomposition

- [x] Capture runs the command as its own process group on POSIX and signals the group (taskkill /T on Windows); SIGINT/SIGTERM/SIGHUP to waypost kill the group before re-raising.
- [x] The store lock records pid, host and a nonce; only a this-host dead-pid lock is broken, by rename plus nonce check, and only the holder's own nonce is released.
- [x] A new store is built in a sibling temp directory and renamed into place; gc removes orphaned `.transfer-*.tmp`.
- [x] Past the deadline a resume at stage `relayed` collects the answer: same request key, stored relay receipt, poll inside a fixed 60 s window; `deadline_at` never moves; earlier stages still fail; an interrupted resume before the deadline no longer lowers `relayed` to `sent`.

## Implementation Plan

Changes stay in the existing modules: `captureCommand` (signal helper and forwarders), `withStore`/`acquireLock`/`breakStaleLock`/`collectTransferStore`, `deliverHandoff` (recovery flag and budget), and the retrieval `compact()` key list (keeps `relay` so a round can recover).

## Acceptance Criteria

- [x] No capture outcome leaves a live descendant: timeout with a TERM-ignoring grandchild, drain timeout, normal exit with a detached child; a signal to waypost kills the group and re-raises, with no listener left behind. — evidence: tests/handoff-capture.test.mjs (three descendant scenarios, listenerCount, child-process SIGTERM), POSIX.
- [x] A dead-pid lock on this host is taken over; a live pid, foreign host, empty or corrupt lock still refuses; a lock replaced between read and rename is given back. — evidence: tests/handoff-transfer.test.mjs stale-lock cases incl. `beforeRename` race.
- [x] Store creation is atomic and gc removes orphan temp files. — evidence: tests/handoff-transfer.test.mjs.
- [x] A relayed delivery past its deadline returns the answer without a second relay and with the same deadline, through deliver and continue; sent/prepared past the deadline and an expired recovery window fail. — evidence: tests/handoff-delivery.test.mjs recovery cases, tests/handoff-retrieval.test.mjs continue recovery (fails without `relay` in compact()).

## Final Summary

Handoff tests 122/122 after review fixes (9 files). Independent review found that a TERM-ignoring grandchild survived because the leader's exit cancelled SIGKILL; finish() now always kills the group and the escalation survives the leader. docs/handoffs.md describes group signalling, the recovery window and the lock rule. Not exercised: the Windows taskkill branch. Before the deadline a resume still re-runs relay, because existing retrieval tests require a fresh receipt there. Full suite on the combined tree after all review fixes: 2509 tests, 2500 pass, 0 fail, 9 skipped (macOS, Node 25, `npm test` in the heavy slot). Fresh waypost-reviewer pass over all four stories; its blocker and should-fixes are applied.

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-11-05*
