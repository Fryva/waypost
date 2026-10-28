---
type: story
id: "story-compact-unchanged-reconciliation-results-without-hiding-changes"
epic: "WP-21"
title: "Compact unchanged reconciliation results without hiding changes"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-28
updated: 2026-10-28
external_refs: {}
tags: []
code_refs: ["bin/cli/views.mjs", "bin/cli/core.mjs", "scripts/reconcile.mjs", "tests/scripts.test.mjs", "tests/harness.test.mjs", "tests/state-migrate.test.mjs", "docs/cli-reference.md", "docs/vault/adr/0008-token-budget.md"]
specs: []
started_at: "2026-10-28T17:02:08.878Z"
closed_at: "2026-10-28T17:10:37.818Z"
plan_updated_at: "2026-10-28T17:02:08.878Z"
---

# Compact unchanged reconciliation results without hiding changes

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Routine reconcile output repeats full paths for every unchanged view/index. Count only confirmed unchanged targets in one compact line, preserve changed/written/skipped/error details, and retain complete JSON. Dry-run changed:true is currently mislabeled unchanged; render it as would change instead.

## Decomposition

- [x] Define strict unchanged classification and output-preservation checks. — evidence: bin/cli/views.mjs strict predicate; frozen controls.
- [x] Implement bounded routine prose, dry-run label and regression cases. — evidence: tests/scripts.test.mjs E-5 and error/status regression.
- [x] Measure identical-input output, verify source-bound checks and independent review. — evidence: comparison.json, validation.json, diagnostics.json and final independent reviewer.

## Implementation Plan

Change only handleReconcile presentation and its explanatory comment in bin/cli/views.mjs. After existing error/skipped branches, count t.changed===false only when t.written is falsy; keep every other target explicit and in original relative order. Use written / would change / unchanged according to written and changed; append N unchanged (details: --json) only when nonzero. Keep header, all forwarded arguments, run/runJson calls, JSON branch, summary.failed exit policy, core execution, generators, atomic writes and public flags unchanged. Extend existing E-5 CLI integration using seedDerivedFixture for settled, changed/dry-run, skipped and compute-error scenarios; preserve child nonzero status. Capture identical-input old/new formatter outputs and call/exit traces, JSON identity and owner syntax/size. Existing core run() exits before returning captured stdout on child failure; this pre-existing failure-output limitation is outside presentation scope and must not be represented as fixed. Tests through heavy admission, fresh reviewer before close/commit.

## Acceptance Criteria

- [x] Only confirmed unchanged targets are counted; changes, written paths, skips and returned errors stay explicit, with correct dry-run would-change labels and unchanged exit policy. — evidence: bin/cli/views.mjs strict predicate and branch order; CLI E-5/error regressions; frozen unknown and written controls.
- [x] JSON and execution/generator contracts remain unchanged; meaningful CLI regression cases pass, syntax/module-size/diff/Doctor pass with source-bound evidence. — evidence: validation.json: 15 passed, 0 failures/skips; 575 source identities stable; diagnostics.json all checks exit0 and Doctor issue/warn/warning0; core/generator unchanged.
- [x] Identical-input measurement quantifies routine text reduction, fresh reviewer accepts criteria and owned temporary runner is removed; no native-token/quota/net saving inferred. — evidence: comparison.json: 53 cases, 644->44 characters on fixed 11-target fixture; final reviewer accepted all criteria; cleanup.json own runner absent, 6596 logical bytes removed.

## Final Summary

Only handleReconcile presentation and its comment change in production. Confirmed unchanged targets are counted once; returned errors/skips and other target details remain explicit, with correct would-change dry-run labels. JSON branch, calls/arguments, child failure/summary exit policy, core, generators and atomic writes are unchanged. The known core captured-output limitation on child failure remains outside scope.

Source-bound Node24.22.1: 15 focused checks passed, 0 failures/skips, 13474.080292 ms, 575 stable source identities; wrapper/child exit0. CLI regressions cover settled/dirty targets, dry-run byte preservation, skipped reasons, compute errors, JSON detail and child write failure status; CLI module syntax/import/size and subprocess guards passed. Frozen 53-case comparison preserves call/exit traces, exact JSON bytes and immutable inputs; exact handler/comment inverse restores baseline. An 11-target unchanged fixture shrinks 644->44 characters (-600/93.1677%); this is fixture text reduction, not native-token, subscription or total-workflow saving. Own temporary runner removed. Independent reviewer accepted all criteria with no findings. Full CI for this revision follows publication.

## Technical Notes

Applies accepted ADR-0008 default-compact/JSON-detail policy. No new flag, storage schema, dependency, role/model, native run or budget change. Fold only actual per-target facts, never summary totals or !written. Existing tests/env.mjs isolation and state-migrate subprocess guard remain mandatory.

## Dependencies

- Accepted ADR-0008; existing deterministic reconciliation contracts.

## Attachments

- Local retained evidence: `.waypost/experiments/wp21-reconcile-summary-20261028/`.

---

*Last updated: 2026-10-28*
