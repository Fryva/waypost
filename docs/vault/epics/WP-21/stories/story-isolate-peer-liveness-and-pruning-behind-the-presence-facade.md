---
type: story
id: "story-isolate-peer-liveness-and-pruning-behind-the-presence-facade"
epic: "WP-21"
title: "Isolate peer liveness and pruning behind the presence facade"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-24
updated: 2026-10-24
external_refs: {}
tags: []
code_refs: ["scripts/presence.mjs", "scripts/presence-liveness.mjs", "tests/presence-liveness.test.mjs", "tests/presence.test.mjs", "tests/presence-process.test.mjs"]
specs: []
started_at: "2026-10-24T20:13:08.032Z"
closed_at: "2026-10-24T20:25:14.305Z"
plan_updated_at: "2026-10-24T20:13:08.032Z"
---

# Isolate peer liveness and pruning behind the presence facade

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Make peer liveness and safe pruning readable independently while preserving coordination policy and authority.

## Decomposition

- [x] Extract the literal liveness block, live window and shared conflict matcher.
- [x] Preserve three public bindings and all callers without backimports.
- [x] Verify clock/counter/process/persistence/prune safety and independent review.

## Implementation Plan

Independent planner selected liveness lines124-292, live-window comment47-49 and constant51, conflict comment/matcher63-66 at base2965585. Move to presence-liveness.mjs with direct storage/process/lib imports. Re-export LIVE_WINDOW_MS, peers and prunePresence unchanged; import the single CONFLICT_COPY privately for readLeases. Keep heartbeat/ensure/leases/path helpers unchanged. Preserve one lazy process probe per peers call, primary-first dual-read, skew/incarnation/counter rules, torn-file cache preservation and missing-file eviction, persist:false and missing-directory early return, lag/window/age boundaries, self/live/process-alive exclusions, dry-run and removal counts. Add env-first tests and replay full liveness/cache/prune plus real-Git heartbeat/lease/observation flows using fixed inputs. Run affected existing tests through heavy admission with source/command/log receipts, then fresh-context review. Facade remains above24000B; do not widen scope to reach a cosmetic ceiling.

## Acceptance Criteria

- [x] Current sources reconstruct baseline SHA256 f47bd6cae5b6476b565546d7afceb8dc70b9258289086bd2ffbb9d0fa8fb1617; focused module below24000B and smaller facade. — evidence: .waypost/experiments/wp21-presence-liveness-module-20261024/verify-move.py, move-proof.json.
- [x] Three public bindings/namespace27 and shared private matcher remain compatible; no caller/policy/cap changes. — evidence: .waypost/experiments/wp21-presence-liveness-module-20261024/source-final.json and binding/namespace tests.
- [x] Frozen full peer/prune/cache and real-Git dual-write/read/lease flows match, including dry-run and safe preservation cases. — evidence: .waypost/experiments/wp21-presence-liveness-module-20261024/liveness-before/after.json, flow-before/after.json.
- [x] Focused and existing safety tests pass with source-bound heavy receipts; package/syntax checks pass; doctor has zero issues/warnings. — evidence: .waypost/experiments/wp21-presence-liveness-module-20261024/validation.json, tests-node24.log, compat-node24/25.log, doctor-final.json.
- [x] Independent reviewer verifies criteria before close/commit. — evidence: .waypost/experiments/wp21-presence-liveness-module-20261024/fresh-context reviewer: ship, all five criteria met.

The baseline CI run 40126753114 exposed a prerequisite test portability defect:
Node22/24 ESM loaders legitimately use readFileSync, but the existing process
module import guard rejected every read. Narrow the guard to process-file reads,
preserve the subprocess guard, delegate source loading and add positive controls.
Production process code is unchanged. Bind the corrected-test runtime checks
to a separate manifest and retain the original failed CI log.

## Final Summary

Literal liveness/window/conflict blocks moved to presence-liveness.mjs (10031 B). Facade35367->25831B; combined +495B. Three public bindings and namespace27 preserved; CONFLICT_COPY is shared internally with readLeases. Heartbeat, ensure, path helpers, leases and policies unchanged. Exact current-source reconstruction to baseline SHA256 f47bd6cae5b6476b565546d7afceb8dc70b9258289086bd2ffbb9d0fa8fb1617. Full liveness/cache/prune and real-Git dual-write/lease/observation replay results and contents match.

Original six-file heavy Node25.6.1 run109total/107pass/0fail/2existing Linux-only macOS skips,exit0,73.893s. Baseline remote CI40126753114 then failed on Node22/24 because an old test blocked the ESM loader's own readFileSync. Fixed only that prerequisite test to delegate source loading and deny process-file reads/spawns. A full heavy Node24.21.0 contour passed107/109,0fail/2same skips,exit0,53.770s. Final counter assertions and positive controls additionally prove caught exceptions cannot conceal eager probes: current eight process tests passed8/8 independently on Node24.21.0 and Node25.6.1 through heavy admission. Production hashes remained unchanged across these validation stages; all command/source/log receipts retained. Final result uses the full contour plus focused final-test verification, not an invented single run of the final snapshot.

Fresh reviewer ship/no findings: verified21final/19baseline/12dirty hashes, reconstruction, full receipts, live fixtures and packaging; doctor0issues/0warnings. All nine new liveness tests passed. Evidence: .waypost/experiments/wp21-presence-liveness-module-20261024/ (validation.json, all logs, source manifests, replay pairs, verify-move.py, pack-proof.json, doctor-final.json). Owned replay/scripts/npmcache removed after review; receipts retained. New remote CI pending; no measured native-token/runtime/workflow saving and no new native pilot/budget.

## Technical Notes

No measured native-token savings claimed; no new pilot or budget allocation. Temporary owned replay data is removed after review; diagnostic evidence retained.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-24*
