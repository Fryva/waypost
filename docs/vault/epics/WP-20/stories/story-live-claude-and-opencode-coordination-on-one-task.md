---
type: story
id: "story-live-claude-and-opencode-coordination-on-one-task"
epic: "WP-20"
title: "Live Claude, Codex and OpenCode coordination on one task"
status: planned
priority: p1
assignee: "Ivan Morozov"
created: 2026-09-30
updated: 2026-09-30
external_refs: {}
tags: []
code_refs: ["docs/harnesses.md", "docs/vault/ops/verify-a-harness-live-the-whole-waypost-loop-in-one-session.md", "tests/commits.test.mjs", "tests/presence.test.mjs"]
specs: ["cross-harness-team-coordination-protocol"]
started_at: null
closed_at: null
plan_updated_at: null
blocked_by: ["WP-20/story-participant-identity-and-owner-approved-model-policy", "WP-20/story-local-authority-log-and-crash-safe-mutations", "WP-20/story-addressed-messages-and-verified-harness-delivery", "WP-20/story-assignments-supervision-and-stronger-model-handover", "WP-20/story-independent-strongest-model-review-of-immutable-evidence", "WP-20/story-reviewed-integration-and-team-aware-story-gates", "WP-20/story-team-cli-orientation-and-deterministic-diagnostics", "WP-20/story-automatic-model-routing-by-task-complexity-and-expected-cost"]
---

# Live Claude, Codex and OpenCode coordination on one task

| Field | Value |
|---|---|
| Epic | [One task coordinated across harnesses and AI models](../epic.md) (WP-20) |
| Status | planned |
| Priority | p1 |

## Description

Prove the actual feature with concurrently running Claude/Codex/OpenCode sessions and different model profiles, independent review and a real integration. Tests/role generation cannot substitute.

Architecture/backlog only. No work claim or implementation is asserted.

## Decomposition

- [ ] Draft live runbook/evidence through Waypost; name installed versions/platform/model identities and owner policy.
- [ ] Execute one task: exchange both ways, weaker-model work, stronger-model promotion and independent top-model critique.
- [ ] Demonstrate changes-requested, addressed revision, re-review of exact candidate and reviewed integration.
- [ ] Exercise disconnect/duplicate/stale result and authority restart; report cooperative delivery separately from idle wake.

## Implementation Plan

A fresh planner fills this at the work-start gate after owner ADR approval and
spec activation. Route through spec contracts 1–8, Acceptance.

## Acceptance Criteria

- [ ] Claude, Codex and OpenCode contexts actually receive addressed assignments/questions/results both ways and return correlated responses on one task.
- [ ] Different real model descriptors and policy evidence are recorded; strongest eligible leader visibly supervises weaker model diff.
- [ ] A stronger arrival hands over without concurrent accepted leaders or unsafe duplicate editing.
- [ ] Independent strongest-model context rejects a concrete defect, worker revises and new target passes fresh review.
- [ ] One integrated task demonstrates a routine economical route and a complex
      strongest route, using actual collector-qualified models and observed
      whole-cycle usage/cost at the same acceptance quality.
- [ ] Exact reviewed tree integrates with contributors and trailers; stale/duplicate results and changed target/base cannot pass.
- [ ] Per-adapter unattended wake either has live evidence or is explicitly unsupported; generic autonomous support is not claimed.
- [ ] Mac/Windows/Linux and remote evidence are distinguished; full regression suite through heavy gate plus doctor passes before release.

## Final Summary

Pending implementation, evidence and independent review.

## Technical Notes

See [[cross-harness-team-coordination-protocol]]. Its acceptance is additive.
No live messaging, model identity or cross-platform proof from document creation.

## Dependencies

- WP-20/story-participant-identity-and-owner-approved-model-policy
- WP-20/story-local-authority-log-and-crash-safe-mutations
- WP-20/story-addressed-messages-and-verified-harness-delivery
- WP-20/story-assignments-supervision-and-stronger-model-handover
- WP-20/story-independent-strongest-model-review-of-immutable-evidence
- WP-20/story-reviewed-integration-and-team-aware-story-gates
- WP-20/story-team-cli-orientation-and-deterministic-diagnostics
- WP-20/story-automatic-model-routing-by-task-complexity-and-expected-cost

## Attachments

- [[model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review]]
