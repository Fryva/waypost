---
type: story
id: "story-isolate-host-process-evidence-behind-the-presence-facade"
epic: "WP-21"
title: "Isolate host process evidence behind the presence facade"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-24
updated: 2026-10-24
external_refs: {}
tags: []
code_refs: ["scripts/presence.mjs", "scripts/presence-process.mjs", "tests/presence-process.test.mjs", "tests/presence.test.mjs"]
specs: []
started_at: "2026-10-24T19:38:49.804Z"
closed_at: "2026-10-24T19:45:22.857Z"
plan_updated_at: "2026-10-24T19:38:49.804Z"
---

# Isolate host process evidence behind the presence facade

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Make host process evidence readable in one focused module without changing coordination or cleanup authority. Continue the accepted context-economy work in WP-21.

## Decomposition

- [x] Extract the literal process-evidence block into presence-process.mjs.
- [x] Preserve five facade bindings and all callers.
- [x] Verify safety and deterministic parity, then obtain independent review.

## Implementation Plan

Move the self-contained process block (lines 162-289 at base 842990d) with its private shell matcher into a dependency-leaf module. Import and re-export exactly processTable, harnessProcess, argv0Of, startTicks and processGone from the facade. Preserve LC_ALL=C on child ps only, call-time environment handling, pinned WAYPOST_PROC behavior, explicit null versus undefined, shell ancestor depth, foreign-host unknown state, Linux tick priority and legacy start-string fallback. No storage, leases, heartbeat, observation, prune or policy edits. Add env-first focused tests and replay retained process facts/namespace/function bodies/fake-ps locale/failure/fixture identities. Run affected coordination, attribution, locale, commit, cleanup and capacity contours through heavy admission. Record source/log identities and independent review before close.

## Acceptance Criteria

- [x] Literal extraction reverses to the whole baseline, with the focused module below 24,000 bytes and a smaller facade. — evidence: .waypost/experiments/wp21-presence-process-module-20261024/verify-move.py, move-proof.json.
- [x] Five public bindings and full facade namespace are preserved; deterministic process facts and fixture contents/identities match. — evidence: .waypost/experiments/wp21-presence-process-module-20261024/facts-before/after.json, files-before/after.json, tests-attempt-2.log.
- [x] Regression tests cover null/undefined, pinned/malformed env, shell depth, foreign/reused PID, ticks and legacy fallback; existing locale and integration safety contours pass. — evidence: .waypost/experiments/wp21-presence-process-module-20261024/tests-attempt-1.log, tests-attempt-2.log and source manifests.
- [x] Heavy-run receipt identifies source, command, log and exit; doctor reports no issues or warnings. — evidence: .waypost/experiments/wp21-presence-process-module-20261024/validation.json, doctor.json.
- [x] Independent reviewer verifies the criteria before close/commit. — evidence: .waypost/experiments/wp21-presence-process-module-20261024/fresh-context reviewer: ship, all five criteria met.

## Final Summary

The literal process block and private shell matcher now live in scripts/presence-process.mjs (7,519 B); the facade shrank from 48,043 to 40,897 B, combined +373 B. Five bindings and namespace27 remain compatible; no callers, storage, leases, observations, heartbeat, prune or policy changed. Current module and facade reverse exactly to baseline SHA256 35076c2509f7fcb3d03b8f90ab0cd08281daff1c88545b99e68ef834555f4290. Synthetic process results, function body hashes/arity, fake-ps locale/failure results and fixture bytes/inodes match before and after.

Evidence is retained in .waypost/experiments/wp21-presence-process-module-20261024/ (validation.json, both complete logs, source manifests, review-input.json, move-proof.json, verify-move.py, frozen facts/files, pack-proof.json and doctor.json). First ten-file heavy run: 559 total, 551 pass, one NEW-test assertion failure, seven existing Linux-only skips on macOS. That assertion compared the exotic process.env object to a plain object; corrected only that line to compare value snapshots. Production and all existing-test hashes remained unchanged. Second focused heavy run: all eight new tests passed, zero failed/skipped, exit 0 in 0.843 s. Combined current result is 552 pass and seven skips; this is explicitly two source-bound runs, not a single complete green run. Existing nine files account for 544 pass and seven skips.

Fresh reviewer ship, no findings; verified 26 current/22 baseline/10 dirty hashes, both log hashes, live fixture and exact reconstruction. Package includes both modules, syntax checks pass and doctor reports zero issues/warnings. No measured native-token/runtime/workflow saving; no native pilot or budget change. Cross-version CI for the eventual commit remains pending.

## Technical Notes

Mechanical extraction does not establish native-token savings. Existing native pilot budgets remain closed. Retain diagnostic evidence; remove owned temporary replay data after review.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-24*
