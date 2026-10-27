---
type: story
id: "story-isolate-token-request-reduction-and-command-run-counting"
epic: "WP-21"
title: "Isolate token request reduction and command run counting"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-27
updated: 2026-10-27
external_refs: {}
tags: []
code_refs: ["scripts/tokens.mjs", "scripts/token-requests.mjs", "tests/token-requests.test.mjs", "tests/tokens.test.mjs", "tests/token-codex.test.mjs", "docs/how-it-works.md"]
specs: []
started_at: "2026-10-27T03:38:04.028Z"
closed_at: "2026-10-27T03:45:23.523Z"
plan_updated_at: "2026-10-27T03:38:04.028Z"
---

# Isolate token request reduction and command run counting

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Make native request reduction and command-run counting readable independently of transcript discovery, pricing and CLI reporting. Literal mechanical extraction under accepted ADR-0008/WP-21 boundaries, without changing accounting policy or report schemas.

## Decomposition

- [x] Freeze source/API and controlled in-memory reduction baseline.
- [x] Move two literal chunks and wire owner/provenance.
- [x] Validate targeted consumers, package and Doctor; independent review and close.

## Implementation Plan

Planner selected3601B ingest block (dedup comment, private USAGE_FIELDS/validCount, exported ingest) and822B countCommandRuns block including comments. Move both literally into token-requests.mjs, no imports. Leaf ceiling6000B. Keep private fields array unchanged/unexported/unfrozen. Owner imports both for collect and directly re-exports to preserve public API6; no cycle. PRICING, model normalization, stage attribution, collect and report formulas stay in owner. Preserve first-record metadata, output max, tool-ID union, partial/cache-split and sticky invalid/conflict semantics, direct-ingest permissiveness, stable timestamp/session ordering and increments to existing calls. Add leaf to both explicit analyzer_sources lists; exact4paths/actualSHA expectations in existing Claude/Codex CLI fixtures. No report version/schema change.

Freeze whole owner/API6 values/name/arity/function-source and queried PRICING ownership. Controlled in-memory replay compares Map/Set snapshots, existing row identities, flags and command counts before/after; no histories or native calls. Exact inverse restores both chunks/wiring and specifically reverses two provenance additions. Focused alias/arity/budget and reducer invariants plus existing tokens/token-codex consumers; no duplicate broad accounting harness. Heavy-gated3file tests bind source/log/runner/argv/runtime identities. Package/syntax/diff-check/Doctor issue/warn/warning0 and independent finalreview before CLI-close/commit. Full Node20/22/24 CI after publication; do not claim pending matrix or native savings.

## Acceptance Criteria

- [x] Both chunks literal, full inverse/API6/name/arity/function-source preserved; leaf<=6000B with no imports/I/O/env/clock; private state and queried pricing contract preserved — evidence: `comparison.json`, exact API snapshots and `replay.mjs` in `.waypost/experiments/wp21-token-requests-20261027/`.
- [x] In-memory baseline/current reduction and targeted tests match/pass with source-bound receipts; both provenance arrays include leaf with exact path/hash tests, package/syntax/Doctor pass — evidence: `validation.json`, full `tests.tap`, `pack.json`, `doctor.json`, exact4path/SHA assertions in both CLI fixtures.
- [x] Independent review approves actual diff/evidence; docs name owner; close through CLI — evidence: `review-final.json`, twelve matched dirty input hashes, `docs/how-it-works.md`.

## Final Summary

Both3601B/822B chunks moved literally to4423B leaf (ceiling6000). Owner35131->30899B, combined+191B. Direct aliases/API6/function-source/values and query pricing ownership preserved; full inverse reverses wiring and only two specific provenance additions. Controlled13step in-memory reduction and2command passes match exactly, preserving row identities/flags/sets/counter behavior. Both Claude/Codex provenance lists contain leaf with exact4path/hash fixture assertions. Source-bound3file run82pass0fail/skip,5798.856417ms Node24.22.1 wrapper/child0,393input identities and stable binary. Package/syntax/diff-check/Doctor issue/warn/warning0; independent reviewer ship/no findings. Removed1609793logicalB owned runner/npmcache; retained proof `.waypost/experiments/wp21-token-requests-20261027/`. Full Node20/22/24 CI follows publication; previous3941a18 matrix40444442702 remains in_progress. No native history/model call, pricing update, quota conversion or measured token/runtime/net savings.

## Technical Notes

rows/calls are caller-owned; no shared mutable reducer state introduced. No pricing update, native transcript scan, live model pilot, weekly-quota inference or new accounting semantics. Read-volume reduction is not measured token/runtime/net savings.
