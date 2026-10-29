---
type: story
id: "story-reuse-file-membership-within-each-supersede-integrity-check"
epic: "WP-21"
title: "Reuse file membership within each supersede integrity check"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-29
updated: 2026-10-29
external_refs: {}
tags: []
code_refs: ["scripts/doctor-integrity.mjs", "tests/doctor-integrity.test.mjs", "scripts/doctor.mjs", "scripts/lib-links.mjs", "tests/lib-links.test.mjs", "tests/scripts.test.mjs", "tests/harness.test.mjs", "tests/state-migrate.test.mjs", "docs/vault/adr/0008-token-budget.md", "docs/vault/adr/0009-artifact-integrity-checks.md"]
specs: []
started_at: "2026-10-29T23:20:00.831Z"
closed_at: "2026-10-29T23:26:46.994Z"
plan_updated_at: "2026-10-29T23:20:00.831Z"
---

# Reuse file membership within each supersede integrity check

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Supersede integrity checking rebuilds the same files membership for each primary, mirror, unscoped fallback and replaced-status resolution. Share only the resolver-owned lazy Set within one check, keeping all kind priority, findings and error behavior.

## Decomposition

- [x] Adopt the first successful resolver membership in the private per-check context and seed fresh resolution contexts; route the existing unscoped fallback through the helper. — evidence: scripts/doctor-integrity.mjs:49; scripts/doctor-integrity.mjs:76
- [x] Verify exact findings/dedup/order/scopes and cold/empty/error/same-array freshness. — evidence: tests/doctor-integrity.test.mjs:81; tests/doctor-integrity.test.mjs:112; tests/doctor-integrity.test.mjs:133
- [x] Record source-bound before/current checker and actual CLI parity, preparation counts, focused tests/guards, independent review and owned cleanup. — evidence: .waypost/experiments/wp21-supersedes-inputs-20261029/{comparison.json,validation.json,diagnostics.json,reviewer.json,cleanup.json}

## Implementation Plan

Extend only the existing private resolve helper in checkSupersedes. Build a fresh scoped context as before, run unchanged shared resolveLinkTarget, adopt its _fileSet on the private base ctx with ??= after success, return the same result. Route the any-kind fallback via resolve(entry, null); preserve kind truthiness and sourceRel null. No eager cache, global/result cache, changes to refsOf, resolver, facade, find/dedup, status checks or public signatures. Exercise primary, reciprocal, fallback, second status pass, ambiguity inside/outside kind, cross-kind warning, self/duplicate/asymmetry/status, scalar/slug/case/path and non-node cases. No refs and malformed files stay lazy; empty Set reused; failed first resolver error unchanged; same files array sees create/rename/delete on next call. Source-bound actual checker/resolver before/current replay compares complete findings and raw/type/source/kinds/result/probe traces; counts only unique fileSets and summed entries. Actual Doctor --vault --json parity uses owned real facade+owner copies with remaining modules linked and fixed clock. Run full integrity/link suites, Doctor supersedes/graph contracts and module/routine/subprocess guards through heavy admission; bind source/runtime/log identities, Doctor and cleanup. No API, ADR, config or native/model run.

## Acceptance Criteria

- [x] At most one lazy membership preparation per checkSupersedes, zero without refs; empty Set reused across primary/mirror/fallback/replaced passes with fresh source/kind contexts and unchanged full files/index. — evidence: scripts/doctor-integrity.mjs:49; tests/doctor-integrity.test.mjs:112
- [x] Complete findings/dedup/severity/order and resolver/probe/error behavior match; repeated calls see updated same-array membership without input mutation. — evidence: tests/doctor-integrity.test.mjs:81; tests/doctor-integrity.test.mjs:133; .waypost/experiments/wp21-supersedes-inputs-20261029/comparison.json
- [x] Source-bound before/current and CLI parity plus lower preparation counts, targeted suites and guards pass; independent review accepts, Doctor clean and owned scratch removed. No physical heap/latency/I/O/native-token/quota/net savings inferred. — evidence: .waypost/experiments/wp21-supersedes-inputs-20261029/{comparison.json,validation.json,diagnostics.json,reviewer.json,cleanup.json}

## Final Summary

Implemented lazy resolver membership adoption on the private per-call base context, seeding each fresh source/kind context; the unscoped fallback now uses the same helper. All reader/loop/dedup/status behavior and public/facade APIs remain unchanged. Source-bound Node24.22.1/macOS replay of 100 reciprocal pairs and 201 files preserves all 500 resolver calls and their full traces, reducing unique membership Sets 500 to 1 and summed entries 100,500 to 201. Mixed exact findings/severity/order/dedup and scoped/unscoped cases, empty/cold/error paths and same-array qualified create/rename/delete agree. Actual Doctor --vault --json output/status/stderr match before/current at a fixed clock. Full integrity/link 13/13, graph/supersedes/facade parity 18/18 and module/routine/subprocess guards 4/4 passed, fail/skip/cancelled0. Source hashes stable and owned scratch removed. Independent reviewer accepted all criteria without findings, 580/580 union hashes matched; pre-close Doctor issue/warn/warning0. No physical heap/latency/I/O/native-token/quota/net savings claim.

## Technical Notes

Keep same-kind first and any-kind fallback semantics. Null sourceRel is intentional. Use refsOf and shared resolver throughout. Inputs and facade stay unchanged; only the private base ctx can own a cache. Dedup continues using rel+level+message, with original node/field/reference/status order.

## Dependencies

-

## Attachments

- Local retained evidence: `.waypost/experiments/wp21-supersedes-inputs-20261029/`.

---

*Last updated: 2026-10-29*
