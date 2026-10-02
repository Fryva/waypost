---
type: story
id: "story-independent-strongest-model-review-of-immutable-evidence"
epic: "WP-20"
title: "Independent strongest-model review of immutable evidence"
status: planned
priority: p1
assignee: "Ivan Morozov"
created: 2026-09-30
updated: 2026-09-30
external_refs: {}
tags: []
code_refs: ["agents/critic.md", "agents/reviewer.md", "scripts/agents.mjs", "tests/harness.test.mjs", "scripts/team-host.mjs", "scripts/team-workflow.mjs", "tests/team-end-to-end.test.mjs"]
specs: ["cross-harness-team-coordination-protocol"]
started_at: null
closed_at: null
plan_updated_at: null
blocked_by: ["WP-20/story-participant-identity-and-owner-approved-model-policy", "WP-20/story-addressed-messages-and-verified-harness-delivery", "WP-20/story-assignments-supervision-and-stronger-model-handover"]
---

# Independent strongest-model review of immutable evidence

| Field | Value |
|---|---|
| Epic | [One task coordinated across harnesses and AI models](../epic.md) (WP-20) |
| Status | planned |
| Priority | p1 |

## Description

Schedule strongest qualified critics/reviewers in genuinely independent contexts and bind verdicts to exact acceptance snapshots rather than author reports.

Architecture/backlog only. No work claim or implementation is asserted.

## Decomposition

- [ ] Implement maximum review-model selection and independently established fresh-context provenance.
- [ ] Pin immutable target/base/criteria/test evidence and context/model/policy/work revision.
- [ ] Enforce negative-verdict resolution, review invalidation and final strongest-policy recheck.

## Implementation Plan

A fresh planner fills this at the work-start gate after owner ADR approval and
spec activation. Route through spec contracts 6.

## Acceptance Criteria

- [ ] Author/implementer context cannot approve any authored component; fresh top-model context may qualify with evidence.
- [ ] If strongest independent context unavailable, review blocks; lesser reviews remain preliminary.
- [ ] Changed target/base/criteria/material evidence invalidates approval; revised target requires new review.
- [ ] Stronger qualified review model joining before integration invalidates insufficient earlier rank.
- [ ] Review receives target/rules/criteria, not author conversation or coordinator verdict; fabricated context/model attestation refuses.
- [ ] Artifact critic and code reviewer preserve their separate targets; coordinator cannot override changes-requested.

- [ ] Busy/unavailable/left strongest models do not lower stored review floor; only explicit owner rebaseline changes acceptance.
- [ ] A new context id with inherited author history is rejected; manual freshness/identity cannot inherit stale owner-attested strength.
- [ ] A real read-only critic returns captured unedited response via bound collector/RPC; reviewer and submitter differ, forged output refuses.

## Final Summary

Pending implementation, evidence and independent review.

## Technical Notes

See [[cross-harness-team-coordination-protocol]]. Its acceptance is additive.
No live messaging, model identity or cross-platform proof from document creation.

## Dependencies

- WP-20/story-participant-identity-and-owner-approved-model-policy
- WP-20/story-addressed-messages-and-verified-harness-delivery
- WP-20/story-assignments-supervision-and-stronger-model-handover

## Attachments

- [[model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review]]
