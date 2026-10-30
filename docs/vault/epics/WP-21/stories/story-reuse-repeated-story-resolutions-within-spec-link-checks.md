---
type: story
id: "story-reuse-repeated-story-resolutions-within-spec-link-checks"
epic: "WP-21"
title: "Reuse repeated story resolutions within spec link checks"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-30
updated: 2026-10-30
external_refs: {}
tags: []
code_refs: ["scripts/doctor-specs.mjs", "tests/doctor-specs.test.mjs", "docs/vault/adr/0008-token-budget.md"]
specs: []
started_at: "2026-10-30T20:43:14.555Z"
closed_at: "2026-10-30T20:53:14.154Z"
plan_updated_at: "2026-10-30T20:43:14.555Z"
---

# Reuse repeated story resolutions within spec link checks

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Repeated exact spec.stories entries cause repeated full-artifact scans in resolveSpecStory. Reuse the deterministic resolution within a single stable snapshot while retaining every per-reference finding.

## Decomposition

- [x] Cache exact-entry story resolution results privately per call. — evidence: scripts/doctor-specs.mjs:123; scripts/doctor-specs.mjs:134
- [x] Verify successful/missing/ambiguous/malformed duplicates, raw key distinctions, first errors and freshness. — evidence: tests/doctor-specs.test.mjs:153; tests/doctor-specs.test.mjs:165; .waypost/experiments/wp21-story-resolutions-20261030/comparison.json
- [x] Compare complete findings and resolver work; run focused suites, Doctor and fresh acceptance. — evidence: .waypost/experiments/wp21-story-resolutions-20261030/{comparison,validation,doctor,reviewer}.json

## Implementation Plan

Only checkSpecLinks changes: local storyResolutions Map. At the original resolveSpecStory call, has(entry), then set(entry,resolveSpecStory(entry,artifacts,epicFolder.path)) on first demand; get exact result. listOf guarantees primitive string entries; no trimming, case folding, key serialization or alias merging. Cache success and error results alike; no insertion on thrown error. Never cache/suppress findings: all original per-spec/per-entry branches, spec id gates and reverse checks run in unchanged order. Keep private resolver, imported matcher, parsed-list caches and YAML block trap unchanged. Stable plain artifact snapshot and one epic path per synchronous call; results read only. New Map on every call. Persistent duplicate missing/ambiguous and same-array add/edit/delete resolution tests. Actual baseline/current source replay with delegated resolver/matcher counters, exact full findings and input immutability. Scale200specs referencing one story should reduce200resolutions to1 without reducing per-reference findings; include repeated errors, exact keys, aliases, tier precedence, duplicate objects, nested/folder/legacy forms, cold/first-error controls. Focused specs/predicates plus CLI/module/routine/state guards through heavy admission; source hashes/logs, Doctor and independent review. No API/output/latency/text-token/native-token claim.

## Acceptance Criteria

- [x] Exact raw entries reuse successful/error resolution results within a call; all ordered per-reference findings, tier semantics, first thrown errors and same-array freshness remain intact. — evidence: tests/doctor-specs.test.mjs:153; tests/doctor-specs.test.mjs:165; .waypost/experiments/wp21-story-resolutions-20261030/comparison.json
- [x] Source-bound old/current complete diagnostics match and logical resolver/matcher work decreases; suites/guards pass, Doctor clean and fresh reviewer accepts. No latency or token savings inferred. — evidence: .waypost/experiments/wp21-story-resolutions-20261030/{comparison,validation,doctor,reviewer}.json

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

This adds a local deterministic resolution-result cache, extending earlier parsed-list-only optimizations; no new shared/global cache or architecture boundary. Do not modify resolveSpecStory or storyMatchesEntry. All consumers only read r.error/r.story. First failure remains at the old call site.

## Dependencies

-

## Attachments

- Local evidence: `.waypost/experiments/wp21-story-resolutions-20261030/`.

---

*Last updated: 2026-10-30*
