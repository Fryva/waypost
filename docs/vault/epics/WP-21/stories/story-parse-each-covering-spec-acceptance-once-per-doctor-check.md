---
type: story
id: "story-parse-each-covering-spec-acceptance-once-per-doctor-check"
epic: "WP-21"
title: "Parse each covering spec acceptance once per Doctor check"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-29
updated: 2026-10-29
external_refs: {}
tags: []
code_refs: ["scripts/doctor-specs.mjs", "tests/doctor-specs.test.mjs", "scripts/doctor.mjs", "tests/scripts.test.mjs", "tests/predicates.test.mjs", "tests/harness.test.mjs", "tests/state-migrate.test.mjs", "docs/vault/adr/0008-token-budget.md"]
specs: []
started_at: "2026-10-29T23:52:17.344Z"
closed_at: "2026-10-29T23:59:30.197Z"
plan_updated_at: "2026-10-29T23:52:17.344Z"
---

# Parse each covering spec acceptance once per Doctor check

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

A covering spec acceptance section is reparsed for each eligible done story and each resolved reference, even when several references resolve to the same artifact. Reuse only the pure parsing result lazily within one checkSpecAcceptance call, retaining story-specific checking and findings.

## Decomposition

- [x] Add a private lazy per-call Map keyed by resolved artifact object, including null and empty-list parsing results. — evidence: scripts/doctor-specs.mjs:222; scripts/doctor-specs.mjs:233
- [x] Verify exact findings/order/duplicates/attribution, alias and same-path identities, lazy gates/errors and refreshed bodies on later calls. — evidence: tests/doctor-specs.test.mjs:100; tests/doctor-specs.test.mjs:117; tests/doctor-specs.test.mjs:128; tests/doctor-specs.test.mjs:146
- [x] Record source-bound actual parser/checker and CLI parity, preparation counts, suites/guards, Doctor, independent acceptance and owned cleanup. — evidence: .waypost/experiments/wp21-spec-acceptance-inputs-20261029/{comparison.json,validation.json,diagnostics.json,reviewer.json,cleanup.json}

## Implementation Plan

In checkSpecAcceptance after existing policy/layout/resolver setup, allocate a private Map. At the existing parse call, use has(spec) before setting parseSpecAcceptance(spec), then get(spec). Key by resolved artifact object, never raw reference or spec.rel; null and [] are valid cached values. Keep coveredEntries listOf and all story/spec/item/ambiguity loops in their original positions; no finding or matcher/result cache, parser/API/facade/resolver changes or cross-call cache. Optional policy, missing epic folder, non-done/legacy/dead refs remain parse-free; unused malformed spec bodies stay unread. First eligible malformed body still throws. Exact ordered findings/severity/duplicate missing-section warnings and per-spec ambiguity suppression retained, including aliases, full-width attribution, fenced content, shared and checked items, distinct artifacts with same path. Repeated calls see body changes on the same artifact and same array. Source-bound before/current actual parser/checker replay counts parser calls and sections/line work, compares full findings and story matcher traces. Actual Doctor --vault --json before/current output/status/stderr parity uses real facade and owner copies, fixed clock and owned fixtures. Run full specs tests, spec/graph facade contracts and module/routine/subprocess guards through heavy admission; stable source/runtime/log hashes, Doctor, independent acceptance and owned cleanup. No architecture/config/native/model changes.

## Acceptance Criteria

- [x] Each resolved spec artifact is parsed at most once per checkSpecAcceptance call, lazily only when its original parse site is reached; null/empty results reused and object identities/alias resolution preserved. — evidence: scripts/doctor-specs.mjs:222; tests/doctor-specs.test.mjs:100; tests/doctor-specs.test.mjs:117
- [x] Complete findings/severity/order/duplicates/ambiguity and matcher/error behavior remain equivalent without input mutation; future calls see changed bodies in the same artifact/array, and ineligible paths do not parse. — evidence: tests/doctor-specs.test.mjs:77; tests/doctor-specs.test.mjs:128; tests/doctor-specs.test.mjs:146; .waypost/experiments/wp21-spec-acceptance-inputs-20261029/comparison.json
- [x] Source-bound actual parser/checker and CLI parity plus reduced parser calls pass relevant suites/guards, Doctor clean, independent reviewer accepts and owned scratch removed. No physical heap/latency/I/O/native-token/quota/net savings inferred. — evidence: .waypost/experiments/wp21-spec-acceptance-inputs-20261029/{comparison.json,validation.json,diagnostics.json,reviewer.json,cleanup.json}

## Final Summary

Implemented a private lazy per-check Map keyed by resolved spec artifact object; null/empty parsing results are retained. Parser, resolver, facade and all story/item/finding/ambiguity logic unchanged. Source-bound Node24.22.1/macOS actual-module replay of 200 stories preserves all 201 findings and matcher traces, reducing parser/section calls 200 to 1 and linesOutsideFences line visits 1,600 to 8. Alias-heavy 1,000 refs reduce parses to 3 for rich/missing/empty specs while retaining 400 missing-section warnings. Distinct same-path objects, ambiguity, cold policy/layout/status/legacy/dead refs, first error identity and same-object/array changed bodies pass. Actual Doctor --vault --json stdout/status/stderr match under required, optional and legacy scenarios. specs-predicates: # tests 107, # pass 107, # fail 0, # skipped 0; graph-links: # tests 11, # pass 11, # fail 0, # skipped 0; guards: # tests 4, # pass 4, # fail 0, # skipped 0. Sources stable; owned tool/fixture scratch removed. Independent reviewer accepted all criteria without findings; 579/579 union hashes matched, pre-close Doctor issue/warn/warning0. No physical heap/latency/I/O/native-token/quota/net savings claim.

## Technical Notes

Pure parseSpecAcceptance returns null for missing Acceptance and [] for an empty section; Map.has distinguishes both from a missing cache entry. Items are read-only in checkSpecAcceptance. Keep full story/spec/item passes: missing-section warnings and unchecked-item findings are story/reference-specific, ambiguity reporting remains scoped by the existing rel+item key. No cached policy or story applicability.

## Dependencies

-

## Attachments

- Local retained evidence: `.waypost/experiments/wp21-spec-acceptance-inputs-20261029/`.

---

*Last updated: 2026-10-29*
