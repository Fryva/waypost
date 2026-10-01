---
type: story
id: "story-addressed-messages-and-verified-harness-delivery"
epic: "WP-20"
title: "Addressed messages and verified harness delivery"
status: planned
priority: p1
assignee: "Ivan Morozov"
created: 2026-09-30
updated: 2026-09-30
external_refs: {}
tags: []
code_refs: ["harnesses/claude.json", "harnesses/opencode.json", "harnesses/codex.json", "scripts/agents.mjs", "scripts/presence.mjs", "docs/harnesses.md"]
specs: ["cross-harness-team-coordination-protocol"]
started_at: null
closed_at: null
plan_updated_at: null
blocked_by: ["WP-20/story-local-authority-log-and-crash-safe-mutations"]
---

# Addressed messages and verified harness delivery

| Field | Value |
|---|---|
| Epic | [One task coordinated across harnesses and AI models](../epic.md) (WP-20) |
| Status | planned |
| Priority | p1 |

## Description

Provide one neutral addressed queue and capability-gated delivery to actual conversations. Claude/OpenCode bidirectional delivery is required; a mailbox alone is not completion.

Architecture/backlog only. No work claim or implementation is asserted.

## Decomposition

- [ ] FIRST perform a feasibility spike of installed Claude/OpenCode send_existing, wake, inspect_model and fresh_review; record evidence before building adapters.
- [ ] Implement bounded envelopes, addressed poll/cursors, idempotency, ack and correlated responses.
- [ ] Add independent registry coordination descriptors, argv/stdin execution and exact native address validation.
- [ ] Separate watcher/subscription from participant/lease lifecycle; report cooperative and autonomous modes honestly.

## Implementation Plan

A fresh planner fills this at the work-start gate after owner ADR approval and
spec activation. Route through spec contracts 4, 2.5.

## Acceptance Criteria

- [ ] Evidence names exact versions/platforms and demonstrates or falsifies each native capability independently; install confidence grants no delivery claim.
- [ ] Duplicate/lost/out-of-order messages retain correlation; old recipient incarnation/stale epoch cannot authorize new work.
- [ ] Queue, context receipt, ack and processing are distinct; watcher output never means an LLM was awakened.
- [ ] Stopping watcher cannot remove parent membership/claims/leases; no eval or use of human invoke string as executable transport.
- [ ] Unsupported idle sessions stay visibly waiting; no new conversation fallback; message injection and forged sender are refused.
- [ ] Claude/OpenCode actual-context bidirectional exchange has a reproducible runbook; unattended wake is proved separately or explicitly blocks autonomous support.

## Final Summary

Pending implementation, evidence and independent review.

## Technical Notes

See [[cross-harness-team-coordination-protocol]]. Its acceptance is additive.
No live messaging, model identity or cross-platform proof from document creation.

## Dependencies

- WP-20/story-local-authority-log-and-crash-safe-mutations

## Attachments

- [[model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review]]
