---
type: story
id: "story-reuse-file-membership-within-each-doctor-link-check"
epic: "WP-21"
title: "Reuse file membership within each Doctor link check"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-29
updated: 2026-10-29
external_refs: {}
tags: []
code_refs: ["scripts/doctor-vault.mjs", "scripts/doctor.mjs", "scripts/lib-links.mjs", "tests/doctor-vault.test.mjs", "tests/lib-links.test.mjs", "tests/scripts.test.mjs", "tests/harness.test.mjs", "tests/state-migrate.test.mjs", "docs/vault/adr/0008-token-budget.md"]
specs: []
started_at: "2026-10-29T19:44:10.531Z"
closed_at: "2026-10-29T19:53:10.904Z"
plan_updated_at: "2026-10-29T19:44:10.531Z"
---

# Reuse file membership within each Doctor link check

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Doctor link checking rebuilds the same vault-file membership Set for the first link of every artifact. Reuse the resolver's lazy Set inside a single check while retaining all findings, severities, duplicate/order behavior and fresh membership between calls.

## Decomposition

- [x] Adopt the first resolver file Set and seed later artifact contexts within one checkWikilinks invocation. — evidence: scripts/doctor-vault.mjs:130
- [x] Verify per-source/unscoped-kind/non-node/duplicate findings and membership changes, empty/cold and error paths. — evidence: tests/doctor-vault.test.mjs:125; tests/doctor-vault.test.mjs:152; tests/doctor-vault.test.mjs:169
- [x] Record source-bound findings/trace/probe/CLI parity and preparation counts, independent acceptance and owned cleanup. — evidence: .waypost/experiments/wp21-doctor-link-inputs-20261029/{comparison.json,validation.json,reviewer.json,cleanup.json}

## Implementation Plan

After existing walk and index/error handling, declare a local fileSet. Keep a fresh ctx for each artifact; seed _fileSet only when the shared Set exists. After each successful unchanged resolveLinkTarget call adopt ctx._fileSet with a nullish check. Empty Set is valid; no links means no membership preparation. Do not move file walking or index try/catch, change extractLinks, add kinds, memoize results/exists, dedup findings or share data across calls. Tests cover multiple artifacts and duplicate links, exact finding severity/order, different source directories, cross-kind ambiguity and non-node silence, same-array create/rename/remove, empty Set reuse, cold no-link and malformed body/files. Source-bound actual checker/resolver replay compares complete serialized findings and resolver/exists trace; count unique fileSet identities/sizes only. Default walk failure/index-skip warnings and probe exception identity/order stay unchanged. Actual CLI Doctor vault JSON before/current comparison uses owned tool roots and fixed clock. Run full Doctor-vault/link suites, graph/doctor parity and CLI/module/routine/subprocess guards through heavy admission with source/runtime/log identities, Doctor, independent review and owned cleanup. No API/facade/resolver/ADR/config/native/model change.

## Acceptance Criteria

- [x] Membership is prepared at most once per checkWikilinks invocation, remains lazy with no extracted links and reuses an empty Set; full ordered files/index/fresh sourceRel/exists and unscoped body-link kinds are preserved. — evidence: scripts/doctor-vault.mjs:130; tests/doctor-vault.test.mjs:152
- [x] Complete findings, severity/order/duplicates and resolver/probe/error behavior stay equivalent; default walk/index failures remain visible, and later calls see changes to the same files array without stale cache or input mutation. — evidence: tests/doctor-vault.test.mjs:89; tests/doctor-vault.test.mjs:125; tests/doctor-vault.test.mjs:169; .waypost/experiments/wp21-doctor-link-inputs-20261029/comparison.json
- [x] Source-bound before/current checker/CLI parity and fewer preparation Sets pass relevant suites and safety checks; independent reviewer accepts, Doctor is clean and owned scratch removed. No physical heap/latency/I/O/native-token/quota/net savings inferred. — evidence: .waypost/experiments/wp21-doctor-link-inputs-20261029/{comparison.json,validation.json,diagnostics.json,reviewer.json,cleanup.json}

## Final Summary

Implemented a per-call lazy fileSet in checkWikilinks; fresh source contexts and the shared resolver remain unchanged. Source-bound Node 24.22.1/macOS replay of 200 linked artifacts and 204 files retained all 800 ordered findings and resolver/probe traces while reducing unique membership Sets 200 to 1 and summed entries 40,800 to 204. Empty/cold/error paths and same-array create/rename/delete freshness match. Actual Doctor --vault --json output/status/stderr are identical before/current at a fixed clock. The first measurement attempt stopped on a harness-only wrong exit-code expectation (JSON Doctor returns 0); its log is retained, production unchanged. Focused Doctor-vault/link suites 17/17, graph/Doctor parity 11/11 and safety/module/routine/subprocess guards 4/4 passed, fail/skip 0. Source hashes stayed stable; owned tool/fixture scratch removed. Independent reviewer accepted all criteria with zero findings; pre-close Doctor issue/warn/warning 0. No physical heap, latency, I/O or token saving is claimed.

## Technical Notes

Only checkWikilinks changes. The six Doctor-vault exports and facade bindings remain identical. Shared resolver and graph engine remain untouched. Unlike graph edge dedup, repeated Doctor findings must remain repeated. Keep walking before index failure handling and extraction before per-body membership construction.

## Dependencies

-

## Attachments

- Local retained evidence: `.waypost/experiments/wp21-doctor-link-inputs-20261029/`.

-

---

*Last updated: 2026-10-29*
