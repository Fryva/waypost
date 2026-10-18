---
type: story
id: "story-distinguish-evaluation-moderation-rejection-causes"
epic: "WP-21"
title: "Distinguish evaluation moderation rejection causes"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-18
updated: 2026-10-18
external_refs: {}
tags: []
code_refs: ["scripts/codex-evaluation-surface.mjs", "tests/evaluation-transport.test.mjs"]
specs: []
started_at: "2026-10-18T23:44:53.862Z"
closed_at: "2026-10-18T23:51:51.389Z"
plan_updated_at: "2026-10-18T23:44:53.862Z"
---

# Distinguish evaluation moderation rejection causes

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

The failed revision-3 C1 retained only native-evaluation-moderation-binding, which combines params schema, unbound turn, ownership, envelope keys and JSON-RPC validation. Its raw offending frame was not retained, so the original live cause remains unknown. Give future failures precise fixed reason codes without payload capture or changing admission/accounting rules. Add offline fixtures, including an event before turn binding; do not replay the closed pilot or authorize inference.

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [x] Separate the existing rejection predicates into fixed, payload-free reasons. — evidence: scripts/codex-evaluation-surface.mjs:89
- [x] Verify individual failure causes, unchanged strict admission and sticky invalidation. — evidence: 66/66 affected guard/transport fixtures; tests/evaluation-transport.test.mjs:195
- [x] Verify the pre-binding event path through fake transport; independent reviewer before close/commit. — evidence: tests/evaluation-transport.test.mjs:220; fresh evaluation_final_review acceptance

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

1. Split the existing compound moderation predicate in original order: params shape, ownership, envelope keys, JSON-RPC version. Keep the exact predicates and all admission, byte/counter/C3 behavior unchanged; reasons are fixed strings only.
2. Assert exact reason codes for independent and mixed-invalid frames, preserving first-reason priority and sticky accounting invalidation after later valid frames/binding. No opaque metadata/ID/key capture.
3. Add one fake-transport earlyModeration option before the turn/start RPC response and turn/started; verify unbound-turn reason, zero source calls, retained invalidation and owned stop. This reproduces a possible ordering only, not the lost live C1.
4. Source-bound affected fixtures through the heavy gate, unchanged definition digest and fresh reviewer before close/commit. No native invocation, billing mutation or protocol replay.

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [x] Each distinct params/envelope/JSON-RPC/unbound-turn failure has a stable fixed reason; existing foreign ownership, late, byte/count and C3 failures remain strict. No metadata values, identifiers or arbitrary keys enter diagnostics. — evidence: guard exact-reason and mixed-invalid assertions; 66/66 affected fixtures
- [x] Accepted frames, surface definition/digest, counters, broker boundaries and billing behavior remain unchanged. Offline guard and transport tests cover the pre-binding rejection and prove later binding cannot restore accounting validity. — evidence: unchanged definition digest; synthetic early transport test; verification.json
- [x] Historical C1 receipts, assumed charges, closed teams and frozen protocols remain unchanged; no live call, retry or registration. Report distinguishes synthetic reproduction from unproven live cause. — evidence: historical artifacts unchanged; verification.json; independent reviewer AC3 met

## Final Summary

Separated moderation rejection causes into fixed params, unbound-turn, envelope and JSON-RPC reasons while retaining predicate order, accepted inputs, ownership and accounting boundaries. Added exact-reason, priority, sticky-invalidity and synthetic early-frame coverage. Affected fixtures passed 66/66 with all 385 source hashes unchanged; fresh evaluation_final_review found no findings and accepted AC1–AC3 for close/commit.

The synthetic case demonstrates a possible ordering, not the historical live C1 cause. No live evaluation dispatch or pilot retry occurred; historical receipts and assumed charges remain unchanged. Live compatibility, full usage and savings remain unknown. External consumers of the previous collapsed reason must handle the new specific reasons.

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

### Validation and compatibility

`waypost run --heavy --wait 30s -- node --test tests/evaluation-transport.test.mjs tests/codex-surface-transport.test.mjs`: exit0,66 passed,0 failed,0 skipped. All385 inputs matched manifest SHA256 `0100eabad250d8a9d671a2981349be69d6efd07b1cb708d08a223d9daa43b333` before/after; base HEAD `429235d3aa502ec6dee5532027fb4a0ad79a79e7`. Retained local ignored evidence `.waypost/experiments/wp21-moderation-reasons-20261018/{before.json,source-before.json,tests.log,definition.json,verification.json}`; full test log SHA256 `bb8ad0eac6aec3a8e8d538c457ec33e9e9695c7f51e8f6c426b87dd79c41fbba`.

Fixed reasons now distinguish params shape, unbound turn, envelope keys and JSON-RPC; the original binding reason remains as a defensive fallback for an owned-turn mismatch that survives higher-level checks. Original predicate order and accepted inputs are unchanged. Foreign/late/C3/byte/count behavior and surface definition digest `4a2f988e4e71e2d91b44aae17169926300e58fb90259dbfd7b5da982559913ed` remain unchanged. No values, arbitrary keys or metadata objects are captured. Internal Host consumers special-case only the unchanged forbidden-tool reason; external consumers matching the old collapsed string should handle the new specific reasons.

The synthetic early-frame test proves a possible pre-binding failure path and retained invalidation after later binding/drain, not the actual cause of the lost live revision3 frame. This implementation is newer than that measurement; old receipts, frozen protocols and closed teams are unchanged. No live evaluation dispatch, experiment-source navigation, billing/authority mutation or catalog registration occurred. Machine budget remains counted17520 assumed, reserved0, remaining232480; no savings/full-cost/weekly-quota claim. A later live run still requires a separately owner-authorized and frozen protocol; continuation here authorizes only offline work.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-18*
