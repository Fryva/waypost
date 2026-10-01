---
type: story
id: "story-reviewed-integration-and-team-aware-story-gates"
epic: "WP-20"
title: "Reviewed integration and team-aware story gates"
status: planned
priority: p1
assignee: "Ivan Morozov"
created: 2026-09-30
updated: 2026-09-30
external_refs: {}
tags: []
code_refs: ["scripts/commit.mjs", "scripts/sessions.mjs", "bin/waypost", "tests/commits.test.mjs"]
specs: ["cross-harness-team-coordination-protocol"]
started_at: null
closed_at: null
plan_updated_at: null
blocked_by: ["WP-20/story-local-authority-log-and-crash-safe-mutations", "WP-20/story-assignments-supervision-and-stronger-model-handover", "WP-20/story-independent-strongest-model-review-of-immutable-evidence"]
---

# Reviewed integration and team-aware story gates

| Field | Value |
|---|---|
| Epic | [One task coordinated across harnesses and AI models](../epic.md) (WP-20) |
| Status | planned |
| Priority | p1 |

## Description

Integrate exactly the supervised/reviewed candidate with a narrow team authorization, preserving legacy ownership, leases and unrelated staged work.

Architecture/backlog only. No work claim or implementation is asserted.

## Decomposition

- [ ] Implement story ownership handoff and exact assignment-based claim exception; never team-wide bypass.
- [ ] Reserve integration tree/parents/HEAD/reviews and use dedicated staging/checkout.
- [ ] Record contributors/team/work/review trailers; recover commit-before-authority-ack failures.
- [ ] Extend close gate through lifecycle command only.

## Implementation Plan

A fresh planner fills this at the work-start gate after owner ADR approval and
spec activation. Route through spec contracts 7.

## Acceptance Criteria

- [ ] Legacy foreign claims/leases still block; creating/joining team cannot erase or borrow them.
- [ ] Unrelated staged files are preserved and excluded; integrated tree/parents exactly match reserved reviewed candidate.
- [ ] Changed HEAD/merge conflict invalidates candidate until reconciled/reviewed; all/force is no team bypass.
- [ ] Crash after Git commit recovers same commit idempotently, not duplicate commit; reservation and evidence survive restart.
- [ ] Existing harness/session/provider/story trailers preserved with team/work/review attribution.
- [ ] Close refuses unfinished/uncertain work or invalid final review; old binaries cannot perform protected team mutations.

- [ ] Only dedicated team-owned checkout/index/HEAD integrates; subsequent ordinary commits in others preserve staged intent.
- [ ] Candidate reconcile is before final supervision/review, including derived paths; commit cannot alter approved tree.
- [ ] Deterministic races of stronger admission/model/policy/epoch change vs Git publication have ordered outcomes and no invalid approved commit.
- [ ] Parent CLI exit with live Git child keeps publication fence; uncertain child/ref operation blocks retry/release.

## Final Summary

Pending implementation, evidence and independent review.

## Technical Notes

See [[cross-harness-team-coordination-protocol]]. Its acceptance is additive.
No live messaging, model identity or cross-platform proof from document creation.

## Dependencies

- WP-20/story-local-authority-log-and-crash-safe-mutations
- WP-20/story-assignments-supervision-and-stronger-model-handover
- WP-20/story-independent-strongest-model-review-of-immutable-evidence

## Attachments

- [[model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review]]
