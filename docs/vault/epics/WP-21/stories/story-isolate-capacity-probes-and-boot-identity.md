---
type: story
id: "story-isolate-capacity-probes-and-boot-identity"
epic: "WP-21"
title: "Isolate capacity probes and boot identity"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-27
updated: 2026-10-27
external_refs: {}
tags: []
code_refs: ["scripts/capacity.mjs", "scripts/capacity-probes.mjs", "scripts/capacity-boot.mjs", "tests/capacity-probes-boot.test.mjs", "tests/helpers/capacity-probe-scenarios.mjs", "tests/capacity.test.mjs", "tests/slots.test.mjs", "tests/run-budget.test.mjs", "tests/test-runner.test.mjs", "docs/how-it-works.md"]
specs: []
started_at: "2026-10-27T17:00:20.667Z"
closed_at: "2026-10-27T17:13:11.535Z"
plan_updated_at: "2026-10-27T17:00:20.667Z"
---

# Isolate capacity probes and boot identity

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Separate low-level default resource probes and boot-identity helpers from the capacity facade. Mechanical source-boundary optimization under existing WP-21/ADR-0008 patterns, preserving every probe, timeout, boot verdict and caller-owned state.

## Decomposition

- [x] Freeze source/API and controlled default-probe/boot baseline.
- [x] Create both valid leaves before atomic facade wiring.
- [x] Validate boot/slot/budget/runner consumers, review and cleanup before close.

## Implementation Plan

Move literal1090B default-probes chunk into capacity-probes.mjs with original node:os six bindings, fs readFileSync and child_process spawnSync; append four private helper exports. Move literal6723B boot cohort into capacity-boot.mjs importing defaultOs/defaultReadFile/defaultRun from probes. Budgets2500B/9000B respectively. Owner imports four defaults and five locally-used boot helpers, directly re-exports all nine boot bindings, keeps public namespace21/function source/name/arity. Remove only unused node:os import; keep spawnSync for tasklist and readFileSync for holders. No cycle or shared module state. Owner remains around24.8KB; do not expand scope to force24KB.

Preserve call-time platform/Date.now/defaults/timer, read failure/null behavior, spawn options/no shell/timeouts/stdout/errors; all boot IDs/fallback/tolerance/CIM query/budgets/uptime margin/three-valued verdict. authorityOnce stays lazy and memoized PER CLOSURE, retains original probes reference, caches null and sets asked before authority invocation even on throw. No new validation or policy changes. Create and syntax-check leaves before atomic owner replacement; inverse restores both chunks/import changes exactly.

Use same isolated child scenario helper against pre-extraction defaults/owner and new leaves. Builtin fs/OS/spawn/timer/clock stubs have positive controls before any default OS-command boot path; restore originals in finally. No actual PowerShell/sysctl/tasklist/read probes or timers in replay. Compare complete trace, outcomes, errors and memoization identities, plus public API21 and private wrapper signatures/source. Focused alias/arity/budgets and scenario test; reuse existing capacity/slots/run-budget/test-runner consumers through heavy gate with source/runtime/runner/log identity receipts. Package/syntax/diff-check/Doctor issue/warn/warning0; independent finalreview and owned-temp cleanup before CLI close/commit. ADR edits only source pointers, no new architecture/policy approval. Local files only; previous external Codegraph rejection remains respected. Publish new CI status honestly, no native-token/runtime savings claim.

## Acceptance Criteria

- [x] Both chunks literal, full inverse/API21/function source/arity preserved, nine direct boot aliases and four default imports, no cycle/shared state; leaf budgets2500B/9000B - evidence: `comparison.json`, exact inverse/literal checks and scenario API snapshots in `.waypost/experiments/wp21-capacity-boot-20261027/`.
- [x] Controlled mocked before/after probes/boot traces match with positive controls and no actual probes; focused/existing tests pass with source-bound receipts, package/syntax/Doctor pass - evidence: `scenarios-before.json`/`scenarios-after.json`, `validation.json`, full `tests.tap`, `pack.json`, `doctor.json`.
- [x] Independent review accepts diff/evidence; docs name boundaries; owned temp cleanup before CLI close - evidence: `review-final.json`, thirteen matched input hashes and `cleanup.json` removal confirmed.

## Final Summary

Literal1090B default wrappers and6723B boot domain moved to1333B/6804B leaves (budgets2500/9000). Owner32342->24838B, still>24KB; combined+633B. Public API21/source/name/arity and nine direct boot aliases preserved; full inverse exact. Both leaves validated before atomic owner wiring; only unused node:os owner import removed. Same controlled child replay matches46outcomes/28events with positive builtin-stub controls; no real PowerShell/sysctl/tasklist/boot-read/timer probes. Defaults remain call-time, authorityOnce stays lazy/per-closure/reference-preserving/null-caching; asked remains set before an injected throw, next call returns null without retry. Final source-bound5file run149total144pass0fail5expected Linux-only skips,15919.131708ms Node24.22.1 wrapper/child0,401input identities/stable binary. Initial green run retained; final repeat followed ONLY strengthened focused security/null/clock assertions. Package/syntax/diff-check/Doctor issue/warn/warning0; independent reviewer no findings. Cleanup before close removed1617461logicalB own runner/npmcache; retained proof `.waypost/experiments/wp21-capacity-boot-20261027/`. ADR changes only source pointers; no live Windows/stress/model/history pilot or measured token/runtime/net saving. New Node20/22/24 CI follows publication.

## Technical Notes

Only injected/default wrapper semantics are tested locally; live Windows suspend/reboot/PowerShell behavior is not newly verified. No admission threshold, PID-liveness algorithm, budget or native pilot change.
