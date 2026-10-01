---
type: story
id: "story-local-authority-log-and-crash-safe-mutations"
epic: "WP-20"
title: "Local authority log and crash-safe mutations"
status: planned
priority: p1
assignee: "Ivan Morozov"
created: 2026-09-30
updated: 2026-09-30
external_refs: {}
tags: []
code_refs: ["scripts/presence.mjs", "scripts/lib.mjs", "bin/waypost", "tests/presence.test.mjs"]
specs: ["cross-harness-team-coordination-protocol"]
started_at: null
closed_at: null
plan_updated_at: null
blocked_by: ["WP-20/story-participant-identity-and-owner-approved-model-policy"]
---

# Local authority log and crash-safe mutations

| Field | Value |
|---|---|
| Epic | [One task coordinated across harnesses and AI models](../epic.md) (WP-20) |
| Status | planned |
| Priority | p1 |

## Description

Build the pinned host-local serialized authority independently of advisory heartbeat/leases. Supply replay, revision checks, durable idempotency and safe recovery.

Architecture/backlog only. No work claim or implementation is asserted.

## Decomposition

- [ ] Implement pure state reducer and append-only valid-prefix event store with reconstructed snapshot.
- [ ] Serialize command mutations; validate locality/version and path traversal/symlink boundaries.
- [ ] Fault-inject publication, reply and snapshot boundaries; define lock and authority-outage recovery.

## Implementation Plan

A fresh planner fills this at the work-start gate after owner ADR approval and
spec activation. Route through spec contracts 1.

## Acceptance Criteria

- [ ] Two processes mutate one revision: exactly one accepted event; loser refreshes, no lost scheduling update.
- [ ] Retry after event publication/before reply returns original outcome; changed payload with same key refuses.
- [ ] Damaged/gapped/unknown log blocks mutation; missing/stale snapshot rebuilds without accepting incomplete events.
- [ ] Cloud/network replicas cannot mutate/elect; unknown locality blocks pending owner evidence.
- [ ] Stale/empty mutex is never stolen by age; only proven process end or explicit stopped-command owner recovery permits continuation.

- [ ] Parallel different team ids targeting one canonical task yield only one active ownership binding, including legacy handoff races.
- [ ] Authenticated completed-key retry returns original outcome even with stale revision/epoch; damaged-log recovery preserves evidence.

## Final Summary

Pending implementation, evidence and independent review.

## Technical Notes

See [[cross-harness-team-coordination-protocol]]. Its acceptance is additive.
No live messaging, model identity or cross-platform proof from document creation.

## Dependencies

- WP-20/story-participant-identity-and-owner-approved-model-policy

## Attachments

- [[model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review]]
