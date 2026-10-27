---
type: story
id: "story-isolate-token-report-table-formatting"
epic: "WP-21"
title: "Isolate token report table formatting"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-27
updated: 2026-10-27
external_refs: {}
tags: []
code_refs: ["scripts/tokens.mjs", "scripts/token-table.mjs", "tests/token-table.test.mjs", "tests/tokens.test.mjs", "tests/token-codex.test.mjs", "docs/how-it-works.md"]
specs: []
started_at: "2026-10-27T03:18:37.677Z"
closed_at: "2026-10-27T03:28:09.215Z"
plan_updated_at: "2026-10-27T03:18:37.677Z"
---

# Isolate token report table formatting

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Make token-report table formatting readable on its own, without the accounting/transcript reader. Literal mechanical split under existing ADR-0008/WP-21 boundaries, no calculation, pricing, schema or reporting policy change.

## Decomposition

- [x] Freeze complete source, public API and private table baseline.
- [x] Move stateless formatting cohort and add focused golden checks.
- [x] Verify consumers, package and Doctor; independent review and close.

## Implementation Plan

Planner selected1437B contiguous n/usd/table/totals chunk before nativeUsage. Move unchanged into scripts/token-table.mjs, append export statement for four private helpers; no imports or module state. tokens.mjs imports those four without re-export. Leaf ceiling2500B. Preserve en-US numeric formatting, toFixed(2), Unicode dashes/padding, runs columns, input order/sum order, error/coercion and nonmutation. PRICING/model aliases/ingest/nativeUsage/measurement/provenance and CLI stay in owner; queried tokens imports retain independent mutable PRICING. Freeze whole-file before and exact private table baseline; remove wiring and restore chunk for exact inverse. Public namespace/signatures/function-source and PRICING values unchanged. Existing import-time no-CLI behavior preserved. Critic requires adding token-table.mjs to both explicit analyzer_sources arrays (Claude and Codex), with exact path/hash assertions in existing CLI fixtures. Inverse separately reverses only those two provenance additions; no schema change and provenance is not suppressed.

Focused golden tests for empty/single/multiple groups, runs on/off, zero turns, long labels and totals/nonmutation; existing tokens tests exercise text/JSON/summary/runs/sessions using owned transcript fixtures. No new accounting replay harness. Heavy-gated targeted tests with source/log/runner/argv/runtime identities; package/syntax/diff-check and Doctor issue/warn/warning0. Independent finalreview before CLI-close/commit. Full Node20/22/24 CI follows publication. No native transcript reads, live model pilot, new pricing snapshot or quota inference.

## Acceptance Criteria

- [x] Literal1437B cohort, whole-file inverse and public API preserved; leaf<=2500B, no imports/state/I/O; queried PRICING ownership preserved — evidence: `comparison.json`, `api-before.json`/`api-after.json`, `replay.mjs` in `.waypost/experiments/wp21-token-table-20261027/`.
- [x] Golden table/totals tests and existing CLI consumers pass with source-bound receipt; package, syntax and Doctor pass — evidence: `validation.json`, full `tests.tap`, `pack.json`, `doctor.json`; both CLI provenance fixtures assert exact source paths and hashes.
- [x] Independent reviewer approves exact diff/evidence; docs describe new owner; close through CLI — evidence: `review-final.json`, twelve verified dirty input hashes and `docs/how-it-works.md`.

## Final Summary

Literal1437B formatter cohort moved into1471B leaf (ceiling2500). Owner36454->35131B, combined+148B, owner still>24KB. Public API6/function-source/values and queried mutable pricing ownership preserved; exact inverse reverses wiring and only two explicit provenance additions. Three baseline cases/six tables match byte-for-byte. Both Claude/Codex analyzer_sources include new leaf with exact path/SHA CLI assertions. Source-bound3file run81pass0fail/skip,5914.47625ms Node24.22.1, wrapper/child0;391input identities and runtime stable. Package/syntax/diff-check/Doctor issue/warn/warning0; independent reviewer ship/no findings. Removed1608531logicalB owned runner/npmcache; retained proof `.waypost/experiments/wp21-token-table-20261027/`. Full Node20/22/24 CI follows publication. No native history/model call, pricing update, quota inference or measured token/runtime/net savings.

## Technical Notes

Source read-volume is the only size result; main tokens module remains above24KB. This is not a native-token/runtime/net-saving measurement. Reporting provenance/source hashes legitimately follow changed source and must not be suppressed or broadly ignored.
