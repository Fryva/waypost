---
type: story
id: "story-reuse-acceptance-attribution-ambiguity-within-each-check"
epic: "WP-21"
title: "Reuse acceptance attribution ambiguity within each check"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-01
updated: 2026-11-01
external_refs: {}
tags: []
code_refs: ["scripts/doctor-specs.mjs", "tests/doctor-specs.test.mjs", "docs/vault/adr/0008-token-budget.md"]
specs: []
started_at: "2026-11-01T15:45:12.495Z"
closed_at: "2026-11-01T16:44:14.738Z"
plan_updated_at: "2026-11-01T15:45:12.495Z"
---

# Reuse acceptance attribution ambiguity within each check

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

checkSpecAcceptance recomputes the same attributed-item ambiguity across done stories and repeated spec aliases. Reuse that boolean by parsed item without caching story applicability.

## Decomposition

- [x] Cache true/false ambiguity per parsed item at the existing evaluation point. — evidence: scripts/doctor-specs.mjs:236; scripts/doctor-specs.mjs:268
- [x] Verify item identity collisions, false results, checked/nonapplicable items, duplicates, ordering and freshness. — evidence: tests/doctor-specs.test.mjs:294; tests/doctor-specs.test.mjs:310; .waypost/experiments/wp21-acceptance-ambiguity-20261101/comparison.json
- [x] Compare full findings/matcher traces and actual ambiguity filter work, hot CLI, focused suites/guards, Doctor and independent review. — evidence: .waypost/experiments/wp21-acceptance-ambiguity-20261101/{comparison,cli-parity,validation,doctor,reviewer}.json

## Implementation Plan

Only checkSpecAcceptance changes. Add a local itemAmbiguity Map. At old const ambiguous after unchanged applies, has/set/get the exact existing item.stories.some(coveredEntries.filter(...).length>1) result, including false. parseSpecAcceptance creates separate item objects per spec, acceptanceItems/coveredStories associate each with one stable covered list; no nested spec key needed. Do not key by rel/text and do not cache applies. Preserve matcher order, ambiguity even when applies=false or checked, duplicate covered entries counted as today, ambiguousReported rel|text suppression and first raw spec id in warnings. Same loops/findings/gates/parser/resolver, first actual ambiguity evaluation at old point, successful returns only. New Map each call; stable plain snapshots, no mutable-getter promise. Persistent different-spec same-path/text false->true collision and same-object coverage/body edits, checked/nonapplicable duplicate coverage behavior. Source-adapted real owner baseline/current replay wraps only ambiguity filter delegate and imported matcher; full findings/traces exact, logical filter calls/entry visits separate from applicability. Scale200done stories/600spec refs/201covered entries with true and false attributed items; both must reuse once. Reuse actual cloned CLI required/optional/missing-section fixtures and compare stdout/status/stderr. Focused specs/predicates+CLI/module/routine/state guards through heavy admission after agents finish, stable source/log hashes, owned cleanup, Doctor and fresh reviewer. No token/latency/heap/quota savings claim.

## Acceptance Criteria

- [x] True and false ambiguity results are reused by parsed item identity, while applicability/matcher and all ordered findings/suppression/gates/first errors/freshness retain their prior behavior. — evidence: tests/doctor-specs.test.mjs:294; tests/doctor-specs.test.mjs:310; .waypost/experiments/wp21-acceptance-ambiguity-20261101/comparison.json
- [x] Source-bound baseline/current findings and matcher traces agree, measured ambiguity filter work decreases, hot CLI outputs agree, suites/guards pass, Doctor clean and fresh reviewer accepts. — evidence: .waypost/experiments/wp21-acceptance-ambiguity-20261101/{comparison,cli-parity,validation,doctor,reviewer}.json

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

No public API/output/config/dependency changes. Item identity is safe because each cached parse constructs independent item objects for its spec; same rel/text across different specs must not collide. Duplicate coverage entries within one epic still count toward current ambiguity semantics.

## Dependencies

-

## Attachments

- Local evidence: `.waypost/experiments/wp21-acceptance-ambiguity-20261101/`.

---

*Last updated: 2026-11-01*
