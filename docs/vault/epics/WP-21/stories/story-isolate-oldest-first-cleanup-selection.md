---
type: story
id: "story-isolate-oldest-first-cleanup-selection"
epic: "WP-21"
title: "Isolate oldest-first cleanup selection"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-27
updated: 2026-10-27
external_refs: {}
tags: []
code_refs: ["scripts/cleanup.mjs", "scripts/cleanup-selection.mjs", "tests/cleanup-selection.test.mjs", "tests/cleanup-limit.test.mjs", "tests/cleanup.test.mjs", "tests/limit.test.mjs", "tests/sizes-measure.test.mjs", "tests/doctor-guards.test.mjs", "docs/how-it-works.md"]
specs: []
started_at: "2026-10-27T22:04:49.406Z"
closed_at: "2026-10-27T22:11:29.044Z"
plan_updated_at: "2026-10-27T22:04:49.406Z"
---

# Isolate oldest-first cleanup selection

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Make oldest-first cleanup selection readable independently of path protection and item classification. Literal split under WP-21 and ADR-0008; no policy change. Also repair the stale cleanup-guard selector assertion discovered in previous commit36640e8 CI40553458454 (all Node20/22/24 failed that one scanner test).

## Decomposition

- [x] Freeze source/API and deterministic selection baseline.
- [x] Extract literal selection cohort and two immutable constants; preserve guard coverage.
- [x] Validate dependent tests, review and remove owned temporary files.

## Implementation Plan

Move the literal orderOldestFirst..pickUnderLimit cohort (including private qualifiesForLimitKind) plus original DAY_MS and DEFAULT_PROJECT_STALE_DAYS declarations into scripts/cleanup-selection.mjs. Seven exports, no imports/state/I/O; keep call-time Date.now default parameters unchanged. Owner locally imports only DAY_MS, DEFAULT_PROJECT_STALE_DAYS and pickUnderLimit and directly re-exports all seven bindings. Other constants, classification, recheck and limit/consent facade remain unchanged. No cycle, wrapper, duplication or new policy. Leaf ceiling9000B; owner ceiling24000B.

Preserve counted-total versus eligible selection distinction, strict seven-day/longer floor, project origin/auto/package/ignored gates, device equality for free-space selection only, unknown-age ordering and path ties, input/reference/nonmutation behavior, early-return and Date/getter/coercion order. Freeze full API24/function-source/name/arity and exact whole-owner inverse. Compare in-memory baseline/current selection and classify outputs with fixed clock, including errors, unusual values and getter traces; no actual artifacts/settings/sweep.

Existing canonical no-removal guards already select scripts/cleanup*.mjs; keep ADR guard objects unchanged. Expand permanent guard fixture roster to all three computation files and require both guards to specifically detect their match paths in each (six controls); CLI writer remains excluded and fixture source is never executed. Fix tests/sizes-measure.test.mjs obsolete exact-selector assertion to the actual family selector; preserve all scanner controls. Search other affected selector consumers. Update ownership docs/source pointers only, not accepted decisions/statuses.

Focused alias/arity/budget/import-free tests and existing cleanup/limit/doctor-guards/sizes-measure consumers run through capacity admission/heavy wrapper. Retain source/runtime/runner/log identities, syntax/package/Doctor checks and previous failed CI. Fresh critic before implementation and independent reviewer before close/commit. Remove own temporary runner/npmcache before close, keep evidence in .waypost/experiments/wp21-cleanup-selection-20261027/. No external Codegraph/native pilot or measured token/runtime savings.

## Acceptance Criteria

- [x] Literal cohort/constants move, exact inverse/API24 and seven aliases preserved; leaf<=9000B, owner<=24000B; selection/classify values, references, order, errors and call-time clock unchanged. - evidence: `comparison.json`, independently checked exact inverse and `before.json`/`after.json` replay in `.waypost/experiments/wp21-cleanup-selection-20261027/`.
- [x] Unchanged canonical guards cover all three computation files with six concrete negative controls; stale scanner selector assertion corrected; affected tests, syntax/package and Doctor pass with source-bound logs. - evidence: `validation.json`, `tests.tap`, `static-checks.json`, `pack.json`, `doctor.json` and actual six concrete match-path controls.
- [x] Independent review accepts implementation/evidence; docs identify ownership; owned temporary files removed before CLI close. - evidence: independent reviewer `review-final.json`, fourteen input hashes and `cleanup.json`.

## Final Summary

Literal6173B selection cohort plus original two immutable constants moved into6262B leaf; no imports/state/I/O/owner cycle. Owner26709->20698B, below24000B ceiling; combined production source+251B. Seven aliases/API24/function-source/name/arity and exact inverse preserved. In-memory baseline/current1426cases/70getterevents/1337clockcalls match values, original references, ordering/errors and call-time defaults, including early off return. Canonical removal guards unchanged; all three cleanup modules tested through six inert-source controls. Fixed obsolete cleanup selector in scanner test, the sole failure on Node20/22/24 in previous CI40553458454 (full failed log retained). Source-bound six-file run162pass0fail/skip,34072.48275ms Node24.22.1 wrapper/child0, stable binary/runner/log and407input identities. Syntax/package/Doctor issue/warn/warning0; independent reviewer no findings. Removed1627622logicalB own runner/npmcache/replay before close, source identities reverified. Evidence `.waypost/experiments/wp21-cleanup-selection-20261027/`. No settings/sweep/user-artifact removal, policy change, native pilot or measured token/runtime/net saving. New full Node20/22/24 CI follows publication.

## Technical Notes

Previous CI failure is a stale test selector, not a cleanup operation failure; local prior four-file run omitted sizes-measure.test.mjs. Retain that evidence rather than claim previous full CI success. Date.now defaults execute before early returns when now is omitted; do not hoist the clock to module initialization.
