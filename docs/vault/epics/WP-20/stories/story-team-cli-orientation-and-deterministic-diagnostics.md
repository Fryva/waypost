---
type: story
id: "story-team-cli-orientation-and-deterministic-diagnostics"
epic: "WP-20"
title: "Team CLI orientation and deterministic diagnostics"
status: planned
priority: p1
assignee: "Ivan Morozov"
created: 2026-09-30
updated: 2026-09-30
external_refs: {}
tags: []
code_refs: ["bin/waypost", "scripts/brief.mjs", "scripts/doctor.mjs", "scripts/sessions.mjs", "scripts/ready.mjs", "scripts/agents.mjs", "templates/agents-block.md.tmpl", "tests/harness.test.mjs"]
specs: ["cross-harness-team-coordination-protocol"]
started_at: null
closed_at: null
plan_updated_at: null
blocked_by: ["WP-20/story-local-authority-log-and-crash-safe-mutations", "WP-20/story-addressed-messages-and-verified-harness-delivery", "WP-20/story-assignments-supervision-and-stronger-model-handover", "WP-20/story-independent-strongest-model-review-of-immutable-evidence", "WP-20/story-reviewed-integration-and-team-aware-story-gates"]
---

# Team CLI orientation and deterministic diagnostics

| Field | Value |
|---|---|
| Epic | [One task coordinated across harnesses and AI models](../epic.md) (WP-20) |
| Status | planned |
| Priority | p1 |

## Description

Expose team commands and concise pending-work orientation across harnesses, with deterministic diagnostics and no mandatory hooks.

Architecture/backlog only. No work claim or implementation is asserted.

## Decomposition

- [ ] Wire create/join/status/poll/send/ack/assign/submit/review/handover/recover dispatch.
- [ ] Show team-owned stories, explicit participant disambiguation, strongest identity/evidence and delivery blockers.
- [ ] Doctor checks log/eligibility/review drift without electing or approving; preserve context budgets and legacy behavior.
- [ ] Document rollout/protocol floor, authority locality and recovery, runtime untracked state and bounded evidence.

## Implementation Plan

A fresh planner fills this at the work-start gate after owner ADR approval and
spec activation. Route through spec contracts 8, 4.3, 7.1.

## Acceptance Criteria

- [ ] Every protected mutation names participant/role/revision; malformed requests and unsupported protocol versions refuse clearly.
- [ ] Brief/next/sessions/ready show pending work and do not list team-owned stories as unclaimed ready.
- [ ] Doctor detects drift/invalid identity or review; never silently changes leader, ranking or verdict.
- [ ] Routing/summary budget tests pass; detail is opt-in and all supported install paths remain harness-neutral.
- [ ] Projects without teams behave as before; no new writes into unrelated harness directories or tracked secrets.
- [ ] Watch/recover/retention keep ownership boundaries; cleanup deletes only authorized proven own artifacts.

## Final Summary

Pending implementation, evidence and independent review.

## Technical Notes

See [[cross-harness-team-coordination-protocol]]. Its acceptance is additive.
No live messaging, model identity or cross-platform proof from document creation.

## Dependencies

- WP-20/story-local-authority-log-and-crash-safe-mutations
- WP-20/story-addressed-messages-and-verified-harness-delivery
- WP-20/story-assignments-supervision-and-stronger-model-handover
- WP-20/story-independent-strongest-model-review-of-immutable-evidence
- WP-20/story-reviewed-integration-and-team-aware-story-gates

## Attachments

- [[model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review]]
