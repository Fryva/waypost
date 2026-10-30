---
type: story
id: "story-reuse-story-specification-lists-within-link-checks"
epic: "WP-21"
title: "Reuse story specification lists within link checks"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-30
updated: 2026-10-30
external_refs: {}
tags: []
code_refs: ["scripts/doctor-specs.mjs", "tests/doctor-specs.test.mjs", "docs/vault/adr/0008-token-budget.md"]
specs: []
started_at: "2026-10-30T20:34:27.777Z"
closed_at: "2026-10-30T20:39:17.766Z"
plan_updated_at: "2026-10-30T20:34:27.777Z"
---

# Reuse story specification lists within link checks

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

checkSpecLinks repeatedly parses story.specs for every spec covering the same story and again in the reverse pass. Reuse a private per-call parsed list by story object.

## Decomposition

- [x] Lazily reuse story specs at the existing parse sites. — evidence: scripts/doctor-specs.mjs:123
- [x] Verify duplicate identities/references, empty/malformed lists, first-error order and freshness. — evidence: tests/doctor-specs.test.mjs:111; tests/doctor-specs.test.mjs:123; tests/doctor-specs.test.mjs:142; .waypost/experiments/wp21-story-spec-lists-20261030/comparison.json
- [x] Compare complete diagnostics and parser counts; run focused suites, Doctor and independent acceptance. — evidence: .waypost/experiments/wp21-story-spec-lists-20261030/{comparison,validation,doctor,reviewer}.json

## Implementation Plan

Only checkSpecLinks changes. Add local specsByStory Map and helper: has(story), set(story,listOf(story.fm,"specs")) only on first demand, then get. Replace the existing forward listOf(r.story.fm,"specs") inside the spec.fm.id short circuit and reverse listOf(story.fm,"specs") loop expression with helper calls. Keep spec list caching, resolver/matcher, all loops/order, block-sequence raw-field check and bodies unchanged. Key objects, not paths/ids. Cached arrays are read-only to consumers; [] is valid. Stable plain artifact snapshot within synchronous check, no mutable getter contract. First parse remains at its old demand point and errors propagate without cache insertion; map dies with each call. Add persistent tests for different same-path objects/duplicates and same-object edits plus gated first-error ordering. Source-bound actual baseline/current checker replay with only imported listOf wrapped for counters (delegate real parser), complete findings and unchanged input snapshots. Scale200specs sharing one story and200story refs should reduce story-spec parser calls201 to1; include no-forward, missing/ambiguous/idless/cold and raw-list forms. Run specs/predicates and CLI/module/routine/state guards through heavy admission with hashes/logs, Doctor and fresh reviewer; no output/API/native-token/latency claims.

## Acceptance Criteria

- [x] Story specs are parsed at first existing demand and reused by object within one invocation; complete ordered diagnostics, duplicates, gates/first errors, raw block-sequence checks and freshness remain intact. — evidence: scripts/doctor-specs.mjs:123; tests/doctor-specs.test.mjs:111; tests/doctor-specs.test.mjs:142; .waypost/experiments/wp21-story-spec-lists-20261030/comparison.json
- [x] Baseline/current full findings match, logical parse counters decrease, focused tests and guards pass, Doctor is clean and fresh reviewer accepts. No text/native-token or latency savings inferred. — evidence: .waypost/experiments/wp21-story-spec-lists-20261030/{comparison,validation,doctor,reviewer}.json

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

No API/output/JSON/dependency changes. Distinct objects with equal path/id must not collide. Preserve story.fm.specs raw access for YAML block-form diagnostics. Earlier f3f482f spec.stories reuse remains unchanged.

## Dependencies

-

## Attachments

- Local evidence: `.waypost/experiments/wp21-story-spec-lists-20261030/`.

---

*Last updated: 2026-10-30*
