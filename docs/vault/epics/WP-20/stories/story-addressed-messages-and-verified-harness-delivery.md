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
code_refs: ["harnesses/claude.json", "harnesses/opencode.json", "harnesses/codex.json", "scripts/agents.mjs", "scripts/presence.mjs", "scripts/team-mcp.mjs", "scripts/team-cli.mjs", "tests/team-mcp.test.mjs", "docs/team-coordination.md", "docs/harnesses.md", "scripts/team-transport.mjs", "scripts/team-host.mjs", "tests/team-transport.test.mjs", "tests/team-host.test.mjs", "scripts/team-mcp-config.mjs", "tests/team-mcp-config.test.mjs", "bin/waypost"]
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

The story remains planned behind its authority blocker. A bounded feasibility
prototype now provides cooperative MCP inbox tools; it does not complete native
delivery or claim this story's acceptance criteria.

## Decomposition

- [ ] FIRST perform a feasibility spike of installed Claude/OpenCode send_existing, wake, inspect_model and fresh_review; record evidence before building adapters.
- [ ] Implement bounded envelopes, addressed poll/cursors, idempotency, ack and correlated responses.
- [ ] Add independent registry coordination descriptors, argv/stdin execution and exact native address validation.
- [ ] Separate watcher/subscription from participant/lease lifecycle; report cooperative and autonomous modes honestly.

## Implementation Plan

A fresh planner fills this at the work-start gate after owner ADR approval and
spec activation. Route through spec contracts 4, 2.5.

Fresh planner feasibility pass (2026-10-01): keep one neutral CLI authority and
add a stdio MCP adapter with fixed project/team/participant credential. Expose
only addressed poll/send/ack; no caller-supplied actor/native locator/model or
owner grants. Surface metadata is descriptive. A globally shared MCP credential
does not distinguish desktop chats, so tool calls cannot certify native delivery,
wake or independent review. Native binding/collectors remain subsequent work.

Fresh planner configuration pass (2026-10-02): add a preview-only MCP renderer
before session detection/heartbeat, with format and project target in registry
data. Use absolute Node and bundled script, separate argv, strict options, and no
credential/config reads or writes. Project discovery and cooperative tool access
remain separate from native identity, protected role eligibility and wake.

## Acceptance Criteria

- [ ] Evidence names exact versions/platforms and demonstrates or falsifies each native capability independently; install confidence grants no delivery claim.
- [ ] Duplicate/lost/out-of-order messages retain correlation; old recipient incarnation/stale epoch cannot authorize new work.
- [ ] Queue, context receipt, ack and processing are distinct; watcher output never means an LLM was awakened.
- [ ] Stopping watcher cannot remove parent membership/claims/leases; no eval or use of human invoke string as executable transport.
- [ ] Unsupported idle sessions stay visibly waiting; no new conversation fallback; message injection and forged sender are refused.
- [ ] Claude/OpenCode actual-context bidirectional exchange has a reproducible runbook; unattended wake is proved separately or explicitly blocks autonomous support.

## Final Summary

Pending implementation, evidence and independent review.

Prototype evidence: tests/team-mcp.test.mjs exercises two credential holders,
UTF-8 framing, argument boundaries, duplicate request replay and stale/foreign
acks through the real CLI. Own CLI probes answered/continued Claude, Codex and
OpenCode contexts; these do not establish desktop delivery. Claude Desktop Code
UI was observed without injecting messages into user conversations. Live desktop
MCP conversation exchange and autonomous wake remain unverified.

Independent fresh-context reviewer (2026-10-01) accepted the cooperative prototype
for a checkpoint after regression checks, with full-story gaps explicitly open.
Findings fixed: compact byte-bounded inbox pages preserve the next unread cursor;
ack ids travel in structured JSON instead of CLI option values; stdout waits for
write completion; request-key schema matches the store; CLI failures expose only
allowlisted safe codes. Regression tests include legal large UTF-8 messages,
output backpressure, ids beginning with dashes and stale-epoch diagnostics.

Configuration prototype (2026-10-02): `team-mcp-config` renders project snippets
for Claude, Codex and OpenCode from registry data. It does not read credentials,
overwrite settings, change approvals or grant native capabilities. A fresh planner
and independent reviewer accepted this scoped increment. Focused heavy checks of
harness registry, MCP exchange, preview and owned runtime passed 123/123 in 96.2s.
These are local fixtures, not live desktop exchange or full-story acceptance.

## Technical Notes

See [[cross-harness-team-coordination-protocol]]. Its acceptance is additive.
No live messaging, model identity or cross-platform proof from document creation.

## Dependencies

- WP-20/story-local-authority-log-and-crash-safe-mutations

## Attachments

- [[model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review]]
