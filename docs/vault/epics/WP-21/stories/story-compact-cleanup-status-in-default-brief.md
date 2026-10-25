---
type: story
id: "story-compact-cleanup-status-in-default-brief"
epic: "WP-21"
title: "Compact cleanup status in default brief"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-25
updated: 2026-10-25
external_refs: {}
tags: []
code_refs: ["scripts/brief.mjs", "tests/limit.test.mjs", "tests/harness.test.mjs", "docs/cli-reference.md"]
specs: []
started_at: "2026-10-25T05:07:13.713Z"
closed_at: "2026-10-25T05:16:03.731Z"
plan_updated_at: "2026-10-25T05:07:13.713Z"
---

# Compact cleanup status in default brief

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Default brief repeats the free-space threshold explanation and long automatic-cleanup label on every orientation. Shorten these fixed strings while preserving every changing fact; --full retains the legacy text under accepted ADR-0008.

## Decomposition

- [x] Compact only the brief cleanup line, preserving full output and shared formatters.
- [x] Pin isolated setting/outcome/fallback regressions and a fixture character budget.
- [x] Freeze before/after evidence, run admitted tests and obtain independent review.

## Implementation Plan

Pass opts.full to private cleanupLine. In ordinary mode only, render a free-kind limit as free:<percent>% and shorten the fixed formatOutcome prefix from automatic cleanup: to auto:. Keep formatLimit/formatOutcome implementations and all other call sites unchanged, including off/GB/unknown behavior. Preserve set date, result, at||time timestamp, reason, array/numeric removed/stayed counts and deadline phrase verbatim. No setting means silent; malformed/unreadable state behavior unchanged. Full=true uses previous formatting exactly; facts/JSON/policy/storage/self-install and other commands unchanged. Test isolated home/state, no-install CLI default/full/JSON, all setting kinds and outcome branches including missing fields/rotated log. Compare frozen baseline vs changed CLI/API text/facts and shared formatter source, and inverse whole brief source. Run limit+harness+predicates tests via heavy slot with source/log receipts; reviewer before close/commit.

## Acceptance Criteria

- [x] Default cleanup line removes redundant free-space prose and shortens only the fixed outcome label; all values, dates, reasons, counts and deadline remain. — evidence: scripts/brief.mjs:39; tests/limit.test.mjs:108.
- [x] --full and full API text retain legacy bytes; facts/JSON, missing/corrupt state, shared formatters, other commands and policy unchanged. — evidence: fixture-before.json/fixture-after.json; unchanged scripts/cleanup.mjs hash.
- [x] Frozen cases and inverse-source proof identify only the intended text differences; fixed free/ran fixture has a tested compact budget; no native-token saving inferred. — evidence: comparison.json; tests/limit.test.mjs:149; inverse whole-source proof.
- [x] Addressed regressions and existing context budgets pass through heavy admission; doctor has zero issues/warnings; independent review approves. — evidence: validation.json; tests.log; independent reviewer ship.

## Final Summary

Default brief keeps the limit/date and every outcome fact, omitting only the repeated free-space explanation and shortening the fixed outcome prefix. Full text and shared formatters remain unchanged. No cleanup policy/state mutation or native pilot.

Evidence: .waypost/experiments/wp21-brief-cleanup-20261025/ contains frozen14cases x5CLI/API modes, source-bound validation/identities and full log. Full/JSON/apiFull output and state bytes match baseline; seven default cleanup lines differ, all surrounding text/API facts unchanged. Exact inverse of whole brief source matches baselinec65b53c. Fixed numeric free/ran example159->109characters,165->113UTF8bytes (line only, no newline). This measures text, not native-token/quota/workflow savings.

Heavy Node24.21.0 run374/374pass,0fail/skip,exit0,141.183s after waiting for CPU admission; existing formatter/context budgets pass. Syntax/package pass;doctor0issues/0warnings. Fresh reviewer ship/no findings verifies11current/11baseline identities,8dirty inputs and log/manifest/package SHA/livefixture. Own fixture/cache removed after review; cleanup receipt retained. BaselineCI40163985765 still in progress; follow-up CI checked after publication.

## Technical Notes

This is a local presentation change within existing compact/full policy; no new ADR, native pilot, allocation, cleanup execution or owner-setting change. Persist diagnostics and remove only owned fixture/cache after review.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-25*
