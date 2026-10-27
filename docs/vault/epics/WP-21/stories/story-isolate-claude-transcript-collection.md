---
type: story
id: "story-isolate-claude-transcript-collection"
epic: "WP-21"
title: "Isolate Claude transcript collection"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-27
updated: 2026-10-27
external_refs: {}
tags: []
code_refs: ["scripts/tokens.mjs", "scripts/token-collect.mjs", "tests/token-collect.test.mjs", "tests/tokens.test.mjs", "tests/token-codex.test.mjs", "tests/token-navigation.test.mjs", "docs/how-it-works.md"]
specs: []
started_at: "2026-10-27T03:53:50.090Z"
closed_at: "2026-10-27T04:02:18.095Z"
plan_updated_at: "2026-10-27T03:53:50.090Z"
---

# Isolate Claude transcript collection

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Make Claude transcript discovery/reduction/coverage readable separately from pricing and reporting, bringing the tokens owner below24KB. Literal mechanical split under existing ADR-0008/WP-21 boundaries, no accounting/report/schema policy change.

## Decomposition

- [x] Freeze source/API and controlled owned-fixture baseline.
- [x] Move collection chunks, imports and explicit provenance entries.
- [x] Verify traversal/audit/navigation and consumers, independent review and close.

## Implementation Plan

Planner verified272B bare/comment chunk and8007B readSource/eachRecord/collect chunk. Move literally to token-collect.mjs with fs readFileSync/existsSync/readdirSync, path join/basename/relative, crypto createHash, createNavigationAnalyzer from token-navigation and ingest/countCommandRuns from token-requests; append export collect only (arity3). Leaf ceiling12000B, owner ceiling24000B. Keep stageOf in owner. Owner imports collect without re-export; remove now-unused local request import but keep direct request re-export, remove unused readdir/basename/relative/navigation imports. All Maps/Sets/audit/navigation stay per-call; no cache/cycle or pricing move. Preserve subagents FIRST, sorted iteration, metadata fallback/duplicate labels, dedup and timestamp ownership, unknown/inline sidechains, coverage/error order, exclusions, returned structures and navigation report.

Freeze full owner/API6/types/values/function-source/name/arity, queried PRICING ownership and collector private baseline on artificial owned transcript/project fixture. Compare full rows/calls/audit/excluded IDs and navigation reports for unbounded/date-filtered/navigation modes; protect fixture file hashes and fresh per-call identities. Add leaf to both explicit analyzer_sources lists with exact5path/actualSHA fixture assertions. Inverse reverts only wiring/import removal, two specific provenance additions and restores chunks. No broad suppression of provenance fields.

Focused export/arity/budget/import-silence and owned-fixture assertions; reuse tokens/token-codex/token-navigation tests. Heavy-gated4file run with source/log/runner/argv/runtime identity receipt, package/syntax/diff-check/Doctor issue/warn/warning0. Independent finalreview before CLI-close/commit. Full Node20/22/24 CI follows publication; no real histories/model calls/pilots or measured token/runtime savings.

## Acceptance Criteria

- [x] Both chunks literal, full inverse/API6 and queried pricing ownership preserved; collect export arity3 only, no import-time collection/analyzer creation; leaf<=12000B, owner<=24000B — evidence: `comparison.json`, exact API snapshots and import-silence test in `.waypost/experiments/wp21-token-collect-20261027/`.
- [x] Owned-fixture baseline/current rows/calls/audit/exclusions/navigation match and targeted consumers pass with source-bound receipt; both provenance lists contain5exactpaths and actualSHA; package/syntax/Doctor pass — evidence: `collection-before.json`/`collection-after.json`, `validation.json`, full `tests.tap`, `pack.json`, `doctor.json` and exact5path/SHA CLI assertions.
- [x] Independent reviewer accepts actual diff/evidence; docs name boundary; close through CLI and remove owned temporary fixture/cache — evidence: `review-final.json`, twelve matched input hashes, `cleanup.json` with nine verified fixture hashes and removal confirmed before close.

## Final Summary

Literal272B+8007B collection blocks moved into8593B leaf (ceiling12000); owner30899->22561B (ceiling24000), combined+255B. Stage attribution, API6/function-source/values and query pricing ownership retained; full inverse reverts only explicit imports/wiring/chunks and two provenance additions. Controlled four-mode replay matches full rows/calls/audit/exclusions/navigation; nine owned fixture hashes unchanged. Both Claude/Codex analyzer_sources contain leaf with exact5path/actualSHA fixture tests. Source-bound4file run103pass0fail/skip,6428.412833ms Node24.22.1 wrapper/child0,395input identities/stable binary. Package/syntax/diff-check/Doctor issue/warn/warning0; independent reviewer ship/no code findings. Cleanup condition resolved before CLI-close: removed1615052logicalB owned fixture/runner/npmcache, nine fixture hashes verified. Retained proof `.waypost/experiments/wp21-token-collect-20261027/`. Full Node20/22/24 CI follows publication; no native history scan/model run, pricing/schema/policy change or measured token/runtime/net saving.

## Technical Notes

No error swallowing, traversal normalization or attribution cleanup. Artificial fixture is not native history; existing unit/CLI checks do not establish live accounting completeness or native-token/runtime/net savings.
