---
type: story
id: "story-reuse-parsed-coverage-lists-in-spec-link-checks"
epic: "WP-21"
title: "Reuse parsed coverage lists in spec link checks"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-30
updated: 2026-10-30
external_refs: {}
tags: []
code_refs: ["scripts/doctor-specs.mjs", "tests/doctor-specs.test.mjs", "docs/vault/adr/0008-token-budget.md"]
specs: []
started_at: "2026-10-30T20:26:30.596Z"
closed_at: "2026-10-30T20:30:57.367Z"
plan_updated_at: "2026-10-30T20:26:30.596Z"
---

# Reuse parsed coverage lists in spec link checks

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

checkSpecLinks parses the same spec stories list in its forward pass and again for every reverse story reference. Reuse the already parsed list within this call.

## Decomposition

- [x] Retain parsed forward lists by spec object and reuse in reverse checks. — evidence: scripts/doctor-specs.mjs:122
- [x] Verify aliases, duplicates, distinct objects, empty/invalid lists, cold paths and freshness. — evidence: tests/doctor-specs.test.mjs:77; .waypost/experiments/wp21-spec-link-lists-20261030/comparison.json
- [x] Compare complete baseline/current findings and logical parse counts; run relevant suites, Doctor and fresh review. — evidence: .waypost/experiments/wp21-spec-link-lists-20261030/{validation,comparison,doctor,reviewer}.json

## Implementation Plan

Only checkSpecLinks in scripts/doctor-specs.mjs changes. Create a local Map after resolver construction. At the exact original forward listOf(spec.fm, "stories") point, bind entries, save by spec object and iterate unchanged. Reverse resolved-spec branches use the saved array for the unchanged some callback. Every resolver result belongs to specs and has already passed the forward loop, so no fallback or extra parser call. Repeated occurrences of the same spec object still execute the original forward parse each time; distinct same-path/id objects remain distinct Map keys. Do not cache reverse coverage booleans, story specs, resolutions or matcher results; preserve every row/reference/warning, list order and original first parse errors. Stable plain-record snapshots within synchronous check; not mutable getter semantics. Map is per call, so changed same-array objects are fresh next call. Persistent behavior regressions and actual baseline/current full-checker comparison with counted listOf reads for200stories, aliases, rich/empty/invalid lists, duplicate objects/refs, nested/folder/legacy and ambiguous matches. Run focused specs/predicates and required CLI/module/state isolation guards through heavy admission, source-bound logs, Doctor and fresh acceptance. Logical parse counters only, no elapsed/native/text-token savings claim.

## Acceptance Criteria

- [x] Reverse checks reuse exact forward lists by spec identity; ordered complete findings, duplicates, first parse behavior, cold branches and same-object freshness between calls remain intact. — evidence: tests/doctor-specs.test.mjs:77; tests/doctor-specs.test.mjs:89; .waypost/experiments/wp21-spec-link-lists-20261030/comparison.json
- [x] Baseline/current full findings match and source-bound logical counters show fewer repeated parses; relevant checks pass, Doctor clean and independent review accepts. No token or latency savings inferred. — evidence: .waypost/experiments/wp21-spec-link-lists-20261030/{comparison,validation,doctor,reviewer}.json

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

No API/output/JSON/dependency change. buildSpecResolver returns original spec objects from the same artifact snapshot, and forward traversal finishes before reverse traversal. Cached arrays are only read. Empty [] is valid. No cross-invocation state.

## Dependencies

-

## Attachments

- Local evidence: `.waypost/experiments/wp21-spec-link-lists-20261030/`.

---

*Last updated: 2026-10-30*
