---
type: story
id: "story-isolate-vault-graph-node-indexing-behind-the-library-facade"
epic: "WP-21"
title: "Isolate vault graph node indexing behind the library facade"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-26
updated: 2026-10-26
external_refs: {}
tags: []
code_refs: ["scripts/lib.mjs", "scripts/lib-node-index.mjs", "tests/lib-node-index.test.mjs", "scripts/graph.mjs", "scripts/doctor-vault.mjs", "tests/predicates.test.mjs", "tests/doctor-vault.test.mjs", "docs/how-it-works.md"]
specs: []
started_at: "2026-10-26T03:18:38.114Z"
closed_at: "2026-10-26T03:28:41.792Z"
plan_updated_at: "2026-10-26T03:18:38.114Z"
---

# Isolate vault graph node indexing behind the library facade

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Move the read-only graph node-universe builder into a small leaf behind the unchanged facade, keeping all callers, error boundaries and map/object identities. Continues WP-21 without changing graph policy.

## Decomposition

- [x] Freeze namespace, filesystem corpus/operations, index fields/map order/aliasing and real consumers.
- [x] Move one literal chunk and direct re-export with no state/cache changes.
- [x] Pin focused semantics/import/budget tests, run relevant coverage and independent review.

## Implementation Plan

Move The graph's node universe→before Session identity (3541 B) to scripts/lib-node-index.mjs; direct Node fs read/exists/readdir and path join/basename/dirname, plus direct frontmatter/identity/vault-files leaf imports. Facade directly re-exports buildNodeIndex, removes only unused local imports parseFrontmatter/slugIdentity/listEpicStories, keeps their public re-exports and all other code. Preserve layout order/sorted entries/story discovery, hidden/underscore and case filter differences, raw body and frontmatter fallback/coercion, stem readings, map insertion order/duplicate keys/object aliases and fresh per-call containers. Preserve read failures skipped inside push versus outer readdir errors propagated. No directory validation, realpath normalization/filter tightening/shared cache. Freeze actual filesystem cases incl three story shapes, raw BOM/CRLF, duplicate identities/paths, missing/non-directory dirs, symlinks and injected errors; compare complete index serialization with node reference IDs and read traces. Real graph and doctor consumers/files match. Literal inverse full facade, namespace100/name/arity/binding, focused import/no writes/probes/budget<=6000 B tests, existing predicates/doctor-vault/scripts/harness via heavy gate with runtime/source SHA. Package/Doctor0/0 and fresh reviewer. No new ADR/pilot/savings claim.

## Acceptance Criteria

- [x] Chunk literal, buildNodeIndex binding/name/arity and namespace100/caller imports preserved; no cycle/shared state/dependency changes. — evidence: `chunks.json`, `wiring.json`, `source-after.json`.
- [x] Nodes/fields/order/map aliasing/freshness, duplicate and error behavior, read traces and graph/doctor outputs match baseline; protected files unchanged. — evidence: `api-before.json`, `api-after.json`, `tests/lib-node-index.test.mjs`.
- [x] Import adds no own I/O/probes/writes/cache; leaf<=6000 B, exact inverse/source measurements and package inclusion retained. — evidence: `comparison.json`, `pack.json`, focused import tests.
- [x] Focused and relevant consumer tests pass through heavy admission, Doctor0/0 and independent reviewer approves. — evidence: `validation.json`, `tests-attempt-1.log`, `doctor.json`, `review-final.json`.

## Final Summary

Independent reviewer: ship, no findings; all four acceptance criteria met. Literal3541 B chunk moved behind one direct re-export; binding/name/arity, namespace100 and all callers preserved. Three unused local facade imports removed, their public re-exports retained. No cycles/cache/shared state introduced.

Frozen comparison matches12filesystem/error cases,335operations, complete node fields/order and maps encoded with node reference IDs, aliases and per-call freshness. Two actual CLI graph/doctor outputs and20protected live file/symlink identities match. Initial graph output comparison differed only in generated_at because the clock was not inherited by CLI subprocesses; both versions were replayed with inherited clock preload and matched exactly. Original unpinned-clock receipts retained. Full inverse facade proof exact.

Leaf3826 B (budget6000), facade52655→49003 B, combined+174 B. Eight-file admitted run365pass,0fail/skip,90622.957542ms Node24.22.1 logged at startup with stable binary SHA. Package includes leaf, syntax/diff-check clean and Doctor0issues/0warnings. Reviewer verified23current/18baseline/10dirty hashes and source-bound log/runner/argv; additional unchanged lib-links test verified against HEAD. Evidence: `.waypost/experiments/wp21-lib-node-index-20261026/` (comparison/validation/review-final, before/after replay, source manifests and tests-attempt-1.log). Owned fixture/npmcache/replay removed:1594347 B; sources retained as text. No native-token, quota, runtime or net-saving measurement.

## Technical Notes

All node/Map state is per invocation. Preserve lexical paths and existing stat-following-symlinks discovery. A read failure is swallowed only inside push; directory enumeration errors may propagate. Duplicate paths can yield distinct nodes with byPath choosing the last object; do not deduplicate nodes.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-26*
