---
type: story
id: "story-reuse-covered-story-lists-within-acceptance-checks"
epic: "WP-21"
title: "Reuse covered story lists within acceptance checks"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-30
updated: 2026-10-30
external_refs: {}
tags: []
code_refs: ["scripts/doctor-specs.mjs", "tests/doctor-specs.test.mjs", "docs/vault/adr/0008-token-budget.md"]
specs: []
started_at: "2026-10-30T20:57:53.669Z"
closed_at: "2026-10-30T21:03:34.360Z"
plan_updated_at: "2026-10-30T20:57:53.669Z"
---

# Reuse covered story lists within acceptance checks

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

checkSpecAcceptance repeatedly parses spec.stories after its cached Acceptance section. Reuse that list by spec object within one check, retaining every acceptance finding.

## Decomposition

- [x] Reuse covered story lists at the existing post-null parse point. — evidence: scripts/doctor-specs.mjs:235; scripts/doctor-specs.mjs:253
- [x] Verify object identity/aliases, null versus empty, error gates, attribution/ambiguity and freshness. — evidence: tests/doctor-specs.test.mjs:257; tests/doctor-specs.test.mjs:276; .waypost/experiments/wp21-acceptance-covered-lists-20261030/comparison.json
- [x] Compare full findings and matcher traces, count delegated parser calls, exercise required-policy CLI and suites/guards, Doctor and independent review. — evidence: .waypost/experiments/wp21-acceptance-covered-lists-20261030/{comparison,cli-parity,validation,doctor,reviewer}.json

## Implementation Plan

Only checkSpecAcceptance changes. Add local coveredStories Map beside acceptanceItems. At original coveredEntries listOf(spec.fm,"stories") after items===null continue, use has/set/get keyed exact resolved spec object. Empty array is reusable. Do not move the parse even when items is []; retain first error. No changes to parser/resolver/matcher, loops, status/policy/legacy/dead-ref gates, per-ref missing-section warnings or existing rel+item ambiguity suppression. Stable plain snapshots within synchronous call, arrays only read, new Map each call. Persistent same-path object/duplicate refs and same-object list mutation tests, missing Acceptance skips list while empty Acceptance still parses/errors. Actual old/current source replay wraps only imported listOf/matcher with real delegates; compare complete findings/matcher traces and immutable inputs. Scale200done stories with repeated id/slug refs to one spec counts stories-list parses600 to1; rich/missing/empty/bare/mixed/invalid controls, hot/cold gates and same-array edits. Actual cloned CLI doctor --vault --json required/optional/missing-section fixtures use real bin/scripts copies and compare stdout/status/stderr. Focused specs/predicates+CLI/module/routine/state guards via heavy admission; source/log binding, owned cleanup, Doctor and fresh review. No token/latency/quota savings claim.

## Acceptance Criteria

- [x] Covered lists are reused by spec object after existing null gate, including empty lists; full ordered findings/matcher behavior, first errors/gates and same-object freshness are preserved. — evidence: tests/doctor-specs.test.mjs:257; tests/doctor-specs.test.mjs:276; .waypost/experiments/wp21-acceptance-covered-lists-20261030/comparison.json
- [x] Source-bound baseline/current replay and hot required-policy CLI outputs agree, logical parse counts decrease, suites/guards pass, Doctor clean and fresh reviewer accepts. — evidence: .waypost/experiments/wp21-acceptance-covered-lists-20261030/{comparison,cli-parity,validation,doctor,reviewer}.json

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

No public API, config, output or dependency change; no result/global cache. This extends the acceptance parser optimization from2b8d114 without moving its original list parsing boundary.

## Dependencies

-

## Attachments

- Local evidence: `.waypost/experiments/wp21-acceptance-covered-lists-20261030/`.

---

*Last updated: 2026-10-30*
