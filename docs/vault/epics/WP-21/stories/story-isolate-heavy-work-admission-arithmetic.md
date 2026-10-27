---
type: story
id: "story-isolate-heavy-work-admission-arithmetic"
epic: "WP-21"
title: "Isolate heavy work admission arithmetic"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-27
updated: 2026-10-27
external_refs: {}
tags: []
code_refs: ["scripts/capacity.mjs", "scripts/capacity-admission.mjs", "tests/capacity-admission.test.mjs", "tests/capacity.test.mjs", "tests/slots.test.mjs", "tests/run-budget.test.mjs", "tests/test-runner.test.mjs", "docs/how-it-works.md"]
specs: []
started_at: "2026-10-27T16:42:48.898Z"
closed_at: "2026-10-27T16:50:15.584Z"
plan_updated_at: "2026-10-27T16:42:48.898Z"
---

# Isolate heavy work admission arithmetic

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Make heavy-work admission arithmetic readable without OS probes and holder discovery. Mechanical source-boundary optimization under existing WP-21/ADR-0008 boundaries; no thresholds, policy or behavior change.

## Decomposition

- [x] Freeze source/API and injected arithmetic baseline.
- [x] Create valid pure leaf before atomically wiring the live capacity owner.
- [x] Verify capacity/slot/budget/runner consumers, independent review and cleanup.

## Implementation Plan

Planner verified3167B canStart cohort: comments, four public numeric constants, private parseHeavyMax and canStart. Move literally into capacity-admission.mjs with original private const GB line; remove now-unused GB from owner rather than duplicate it. No imports, I/O, clock, environment or shared mutable state. Leaf ceiling5000B. Owner locally imports canStart for measure and directly re-exports five original bindings, preserving public namespace21 and function source/name/arity0. parseCapacityProbe and all probes/defaults/boot/holder functions stay owner. No extra validation, coercion, clamping or reason reordering. Keep lower-only max, holder memory reservation, job shares, slots/CPU/memory reason precedence and exact text. Read files locally: Codegraph external MCP rejected by automatic review, no retry/export workaround.

Freeze whole owner/API21 and a small injected canStart before/after matrix, including boundaries, unknowns, lower-only max, conversion/error traces and caller-input immutability. Exact inverse restores cohort/GB and removes wiring. Create/syntax-check leaf before atomic owner replacement so installed CLI never references a missing module. Focused alias/arity/budget and independent return-value tests, existing capacity/slots/run-budget/test-runner consumers through heavy gate with source/runtime/runner/log identity receipts. Package/syntax/diff-check/Doctor issue/warn/warning0; independent finalreview and owned-fixture cleanup before CLI close/commit. Add only code_refs pointers to related accepted ADRs/parent epic; no decision text/policy changes. Publish and report new Node20/22/24 CI status without premature green claim.

## Acceptance Criteria

- [x] Literal3167B cohort and GB move, exact inverse/API21/constant values/function source preserved; five direct aliases, canStart arity0, pure leaf<=5000B; probes and policies unchanged - evidence: `comparison.json`, exact API snapshots and `replay.mjs` in `.waypost/experiments/wp21-capacity-admission-20261027/`.
- [x] Injected baseline/current results/reasons/conversion errors match; focused and existing consumers pass with source-bound receipts; package/syntax/Doctor pass - evidence: `arithmetic-before.json`/`arithmetic-after.json`, `validation.json`, full `tests.tap`, `pack.json` and `doctor.json`.
- [x] Independent review accepts diff/evidence; docs describe arithmetic boundary; cleanup before CLI close - evidence: `review-final.json`, eleven matched review input hashes, `cleanup.json` removal confirmed before close.

## Final Summary

Literal3167B cohort and original private GB moved into3190B leaf (ceiling5000); owner35355->32342B, combined+177B. Five direct aliases/API21/function-source/name/arity/constants and exact inverse preserved; valid leaf installed before atomic owner wiring. Pure arithmetic24cases plus4conversion/error cases match exactly, including non-finite values encoded explicitly. Thresholds/reservations/reason precedence and all probes unchanged. Source-bound5file run149total144pass0fail5expected Linux-only skips,15582.422875ms Node24.22.1 wrapper/child0,397input identities/stable binary. Package/syntax/diff-check/Doctor issue/warn/warning0; independent local-file reviewer no findings. Cleanup AC resolved before close: removed1615663logicalB owned runner/npmcache. Retained proof `.waypost/experiments/wp21-capacity-admission-20261027/`. ADR/parent changes only code_refs; no policy decision. Prior23f068b full Node20/22/24 CI40449371556 success; new CI follows publication. No live stress workload/native model/history pilot or measured token/runtime/net saving.

## Technical Notes

The owner may remain above24KB; this isolates the decision function agents need when diagnosing refusals. Existing invalid-input permissiveness is preserved, not repaired. No real stress workload, native model/history experiment or measured token/runtime/net saving. CI23f068b40449371556 verified success on Node20/22/24 before work.
