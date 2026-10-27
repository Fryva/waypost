---
type: story
id: "story-isolate-capacity-memory-measurement"
epic: "WP-21"
title: "Isolate capacity memory measurement"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-27
updated: 2026-10-27
external_refs: {}
tags: []
code_refs: ["scripts/capacity.mjs", "scripts/capacity-memory.mjs", "tests/capacity-memory.test.mjs", "tests/capacity.test.mjs", "tests/slots.test.mjs", "tests/run-budget.test.mjs", "tests/test-runner.test.mjs", "docs/how-it-works.md"]
specs: []
started_at: "2026-10-27T17:18:32.299Z"
closed_at: "2026-10-27T17:25:14.651Z"
plan_updated_at: "2026-10-27T17:18:32.299Z"
---

# Isolate capacity memory measurement

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Make memory measurement readable independently of CPU, boot and holder mechanics. Literal source-boundary optimization under existing WP-21/ADR-0008 patterns, without changing cgroup or memory-pressure behavior.

## Decomposition

- [x] Freeze source/API and injected memory baseline.
- [x] Validate memory leaf before atomic owner wiring.
- [x] Verify memory/slot/budget/runner consumers, review and cleanup before close.

## Implementation Plan

Move literal7420B memory domain (six private cgroup path strings, inactiveFile/parseVmStat/darwinPressure/darwinMemory/readMemory) to capacity-memory.mjs with sole import defaultOs/defaultReadFile/defaultRun from capacity-probes. Leaf ceiling12000B, owner<=24000B. Owner locally imports readMemory for measure and directly re-exports same binding; public API21/name/arity0/function-source preserved. Keep all other imports/defaults/probes/boot/holder code. No cycle or mutable module state; defaults stay call-time.

Preserve every formula, coercion, fallback, result field/probe string and callback/error order. In particular v2 max prevents v1 fallback; inactive-file subtraction and cgroup box total stay unchanged. Darwin performs the existing probes BEFORE critical zeroing; unreadable pressure selects warning formula. Do not swallow injected callback exceptions. No policy/threshold or ADR status changes (including existing proposed pressure policy).

Freeze complete owner/API21 and small injected memory matrix with result AND call traces: Linux cgroup v1/v2/fallback, Darwin normal/warning/critical/fallback, Windows/unknown, callback errors. No actual sysctl/vm_stat/cgroup/native probes. Exact inverse restores cohort/removes wiring; validate leaf before atomic owner replacement. Focused export/arity/alias/budgets/import-silence positive control; existing capacity/slots/run-budget/test-runner through heavy gate with source/runtime/runner/log identities. Package/syntax/diff-check/Doctor issue/warn/warning0; independent finalreview and owned-temp cleanup before CLI close/commit. ADR edits only source refs, no new architecture decision. Local files only, no external Codegraph. Report new Node20/22/24 CI status without inferred green or token/runtime savings.

## Acceptance Criteria

- [x] Literal7420B domain and exact inverse/API21/function source preserved; sole readMemory export arity0/direct alias, no import-time probing or cycle, leaf<=12000B/owner<=24000B - evidence: `comparison.json`, exact source/API snapshots and import-silence control in `.waypost/experiments/wp21-capacity-memory-20261027/`.
- [x] Injected before/after values AND calls/errors match; focused/existing tests pass with source-bound receipts, package/syntax/Doctor pass - evidence: `memory-before.json`/`memory-after.json`, `validation.json`, full `tests.tap`, `pack.json`, `doctor.json`.
- [x] Independent review accepts diff/evidence; docs name memory owner; owned-temp cleanup before CLI close - evidence: `review-final.json`, eleven matched review-input hashes and `cleanup.json` removal confirmed.

## Final Summary

Literal7420B memory domain moved to7501B leaf (ceiling12000); owner24838->17523B (ceiling24000), combined+186B. Exact inverse/API21/function-source/name/arity and direct readMemory alias preserved; valid leaf loaded before atomic owner wiring. Injected24case baseline/current matches values, errors and90calls; no actual probes in replay. Linux cgroup semantics, Darwin fallback/probe-order/critical zeroing and callback exception propagation unchanged; no pressure-policy status edits. Source-bound5file run150total145pass0fail5expected Linux-only skips,15868.9075ms Node24.22.1 wrapper/child0,403input identities/stable binary. Focused tests include import-silence positive control and exact critical-fallback/v2-max traces. Package/syntax/diff-check/Doctor issue/warn/warning0; independent reviewer no findings. Cleanup before close removed1618961logicalB own runner/npmcache; retained proof `.waypost/experiments/wp21-capacity-memory-20261027/`. ADR/parent changes only source pointers; no live VM/pressure/stress/model/history experiment or measured native-token/runtime/net saving. New Node20/22/24 CI follows publication.

## Technical Notes

Existing memory-pressure decisions/statuses are not amended. Unit/injected-probe evidence is not a live Linux/Windows VM or macOS pressure-state validation. No native model/history pilot, threshold change or measured token/runtime/net saving.
