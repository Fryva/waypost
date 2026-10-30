---
type: story
id: "story-avoid-repeating-exact-paths-in-reconciliation-rows"
epic: "WP-21"
title: "Avoid repeating exact paths in reconciliation rows"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-30
updated: 2026-10-30
external_refs: {}
tags: []
code_refs: ["bin/cli/views.mjs", "scripts/reconcile.mjs", "tests/scripts.test.mjs", "tests/harness.test.mjs", "tests/state-migrate.test.mjs", "docs/cli-reference.md", "docs/vault/adr/0008-token-budget.md"]
specs: []
started_at: "2026-10-30T00:23:43.123Z"
closed_at: "2026-10-30T00:34:12.514Z"
plan_updated_at: "2026-10-30T00:23:43.123Z"
---

# Avoid repeating exact paths in reconciliation rows

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Reconcile index rows repeat the same full path as both the row label and state suffix. Omit only a suffix whose path is exactly the same string as the label, retaining every target, action, error, skip, counter, JSON byte and exit behavior.

## Decomposition

- [x] Add a strict-string duplicate-label guard only to the ordinary row suffix and document the single-path presentation. — evidence: bin/cli/views.mjs:228; docs/cli-reference.md:17
- [x] Verify actual CLI dirty-index preview/write/settled/JSON and source-bound state/type/path/exit/error matrices without input mutation. — evidence: tests/scripts.test.mjs:1387; .waypost/experiments/wp21-reconcile-path-output-20261029/comparison.json
- [x] Measure full before/current outputs from actual frozen generator reports with offline encodings, including zero-saving control; run suites/guards, Doctor, independent acceptance and owned cleanup. — evidence: .waypost/experiments/wp21-reconcile-path-output-20261029/{tokens.json,tokenizer-proof.json,validation.json,core-validation.json,diagnostics.json,reviewer.json,cleanup.json}

## Implementation Plan

In handleReconcile private line, after error/skipped/confirmed-unchanged returns and state selection, compute repeatedPath = typeof t.path === "string" && label === t.path. Keep old t.path truthiness and append the suffix only if not repeatedPath. No normalization, basename, coercion or index-only flag; a contrived fixed label/path same string also safely omits the duplicate. Preserve every earlier branch, ordering/header/count, status/null handling, summary.failed, invalid report behavior, captured/inherited stdout/stderr and JSON forwarding. Real CLI regression on stale adr index verifies preview no writes, exact path-once would-change/write rows, full JSON, settled count. Source-bound real baseline/current handler compares all rows and child calls/exit/JSON bytes across strings, Unicode/spaces/Windows/long/missing/null/empty/nonstring paths and all states, including contradictory written:false-change, error and skip. Use actual generator reports from owned fixtures; frozen exact JSON guarantees repeatability. Count full captured stdout under pinned tiktoken o200k_base and cl100k_base with roundtrip/repeat and network-denied counting; include unchanged control0saving. Run reconcile/failure/streaming/core and module/routine/subprocess checks through heavy admission, bind sources/runtime/inputs/logs, Doctor and fresh review; remove owned tokenizer/runtime/cache/tool fixtures. No native inference or quota/workflow saving claim.

## Acceptance Criteria

- [x] Ordinary rows omit only exact duplicate string path suffixes, leaving the entire path visible once; all state/error/skip/unchanged/count/order/JSON/argv/stdout/stderr/exit behavior unchanged. — evidence: bin/cli/views.mjs:228; .waypost/experiments/wp21-reconcile-path-output-20261029/comparison.json
- [x] Real CLI preview/write/settled/JSON regression and source-bound matrix retain full target facts and inputs, including typed paths and near matches; unaffected output is byte-identical and changed rows differ only by duplicate suffix. — evidence: tests/scripts.test.mjs:1387; .waypost/experiments/wp21-reconcile-path-output-20261029/comparison.json
- [x] Actual frozen reports have lower full raw-text token counts in named offline encodings plus unchanged zero-saving control; relevant suites/guards pass, independent reviewer accepts, Doctor clean and owned scratch removed. No native-token/subscription-quota/whole-workflow savings inferred. — evidence: .waypost/experiments/wp21-reconcile-path-output-20261029/{tokens.json,tokenizer-proof.json,validation.json,core-validation.json,diagnostics.json,reviewer.json,cleanup.json}

## Final Summary

Human reconcile row formatting suppresses only a repeated strict string path suffix; entire path remains the label. Source-bound actual handler replay:847 matrix/actual cases retain call/exit/stderr/JSON/input and nonmatching bytes, with only known duplicate suffixes removed. Actual generator preview/write/settled reports and cloned real CLI agree for three changed indexes. Offline tiktoken0.14.0 full-output o200k_base: preview321 to183 (-42.99%), written312 to174 (-44.23%), unchanged34 to34 (0%). cl100k_base:327 to186,318 to177,34 to34. All roundtrip/repeat controls pass, counting network attempts0/native inference calls by runner0; public install/cache warm separately logged. Main reconcile/failure/streaming suite16/16 and guards4/4 pass; one missing exact Core-test title ran separately1/1, total21 fail/skip/cancelled0. Initial harness clone symlink main-guard failure is retained; changed only to real scripts copies, production unchanged. Sources/runtime stable; own final tokenizer/runtime/cache/tool/project scratch removed. Independent reviewer accepted all criteria with no findings and579/579 union identities matched; pre-close Doctor issue/warn/warning0. Counts concern these fixed CLI texts and named encodings, not native models, subscription quota or whole-workflow savings.

## Technical Notes

The generator supplies string absolute index paths. Earlier structural validation does not type-check paths, so preserve malformed nonstring behavior with a typeof guard. Keep path truthiness for empty/missing values. Errors/skips must return before the guard; confirmed unchanged targets still fold into the same count. Human formatter only, never change generator JSON or private captures.

## Dependencies

-

## Attachments

- Local retained evidence: `.waypost/experiments/wp21-reconcile-path-output-20261029/`.

---

*Last updated: 2026-10-30*
