---
type: story
id: "story-isolate-pure-link-parsing-and-resolution-behind-the-library-facade"
epic: "WP-21"
title: "Isolate pure link parsing and resolution behind the library facade"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-26
updated: 2026-10-26
external_refs: {}
tags: []
code_refs: ["scripts/lib.mjs", "scripts/lib-links.mjs", "tests/lib-links.test.mjs", "tests/predicates.test.mjs", "scripts/graph.mjs", "scripts/doctor-vault.mjs", "docs/how-it-works.md"]
specs: []
started_at: "2026-10-26T01:25:00.552Z"
closed_at: "2026-10-26T01:31:46.630Z"
plan_updated_at: "2026-10-26T01:25:00.552Z"
---

# Isolate pure link parsing and resolution behind the library facade

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Extract pure Markdown link parsing and resolution into one readable leaf while preserving the facade and all consumer imports. This continues WP-21 without changing link policy.

## Decomposition

- [x] Freeze namespace, parsing/resolver outcomes and caller cache/callback traces.
- [x] Move two literal chunks and direct re-exports; preserve index construction in facade.
- [x] Pin semantics/purity/budget, run relevant tests and obtain independent acceptance.

## Implementation Plan

Move two literal chunks: Link graph extraction through relDirSegments (2600 B), and ONE link resolver comments/body (4725 B). scripts/lib-links.mjs imports only isLegacyNumberedId directly from lib-identity.mjs. Keep buildNodeIndex and all callers literal; facade directly re-exports stripCodeSpans/extractLinks/resolveLinkTarget and removes only unused local isLegacyNumberedId import (seven existing identity re-exports unchanged). Preserve ctx._fileSet caller-owned cache including lazy nullish initialization, mutation, identity and stale reuse; no module cache. Preserve coercions, regexes, extraction ordering, exact identity/stem/legacy tier precedence, ambiguity, kind filtering, path normalization, escape rejection, exists callback order/errors and ring2. Before edits freeze baseline on deterministic parser/error corpus, synthetic indexes and owned fixture graph/doctor consumer function outputs with content identities. Literal inverse proves full facade unchanged except wiring. Focused tests pin three bindings/name/arity, namespace100, important legacy resolver and cache cases, import purity/no added I/O and <=10000B leaf. Relevant predicates/doctor-vault/scripts/harness tests through heavy slot; log runtime version/binarySHA, source hashes, pack inclusion, Doctor0/0 and fresh reviewer. No new ADR, native pilot or savings claim.

## Acceptance Criteria

- [x] Two chunks literal, three bindings/name/arity and namespace100/caller imports preserved; buildNodeIndex unchanged, no dependency cycle. — evidence: `chunks.json`, `wiring.json`, `source-after.json`.
- [x] Parser/resolver outcomes/errors, callback order, node identity and caller-owned cache initialization/reuse/staleness match frozen baseline and consumer outputs. — evidence: `api-before.json`, `api-after.json`, `replay.mjs.txt`.
- [x] Import adds no I/O/probes/cache; focused leaf <=10000 B, inverse proof and source measurements retained without token/runtime savings inference. — evidence: `comparison.json`, `tests/lib-links.test.mjs`.
- [x] Focused and relevant consumer tests pass through heavy admission; package includes leaf, Doctor0/0 and independent reviewer approves. — evidence: `validation.json`, `tests-attempt-1.log`, `pack.json`, `doctor.json`, `review-final.json`.

## Final Summary

Independent reviewer: ship, no findings; all four acceptance criteria met. Two literal chunks (2600+4725 B) moved behind direct re-exports; three bindings/names/arities and namespace100 remain unchanged. buildNodeIndex, all consumers and other leaf modules are unchanged. Caller-owned ctx._fileSet initialization/reuse/staleness and callback behavior remain intentional.

Frozen replay matches 16 parser, 720 resolver and five cache/error cases, node identities and callback traces. Two actual consumer function outputs (buildGraph/checkWikilinks) and seven live content/inode/dev/mtime identities match; these are function comparisons, not CLI stdout captures. Existing CLI/doctor-to-graph parity tests passed. Whole-facade inverse is exact. Leaf7383 B (budget10000), facade71173→63911 B, combined+121 B.

Seven-file heavy run:360pass,0fail/skip,91214.474958ms on Node24.22.1 logged at startup with stable executable SHA. Package includes leaf, syntax/diff-check clean, Doctor0issues/0warnings. Reviewer independently verified20current/15baseline/10dirty hashes and source-bound log/runner/argv. Evidence: `.waypost/experiments/wp21-lib-links-20261026/` (comparison/validation/review-final, before/after replay, source manifests and tests-attempt-1.log). Owned fixtures, npm cache and replay runner removed:1589033 B; replay sources retained as text. No native-token, quota, runtime or net-saving measurement.

## Technical Notes

ctx._fileSet is existing caller-owned mutable state, not a module cache. Do not turn the resolver immutable, invalidate stale caches, tighten path grammar or alter ring2/kinds/legacy behavior in this extraction.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-26*
