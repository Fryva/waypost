---
type: story
id: "story-participant-identity-and-owner-approved-model-policy"
epic: "WP-20"
title: "Participant identity and owner-approved model policy"
status: planned
priority: p1
assignee: "Ivan Morozov"
created: 2026-09-30
updated: 2026-09-30
external_refs: {}
tags: []
code_refs: ["scripts/lib.mjs", "scripts/agents.mjs", "harnesses/codex.json", "harnesses/opencode.json", "agents/critic.md"]
specs: ["cross-harness-team-coordination-protocol"]
started_at: null
closed_at: null
plan_updated_at: null
blocked_by: []
---

# Participant identity and owner-approved model policy

| Field | Value |
|---|---|
| Epic | [One task coordinated across harnesses and AI models](../epic.md) (WP-20) |
| Status | planned |
| Priority | p1 |

## Description

Separate task participants from inherited session ids and declare exact model/provider/reasoning identity with an auditable owner-approved task-domain ranking.

Architecture/backlog only. No work claim or implementation is asserted.

## Decomposition

- [ ] Define descriptor/policy schemas and evidence floor; no shipped unsubstantiated worldwide ranking.
- [ ] Mint unique participant/incarnation and native-locator separation, with scoped enrollment/revocation.
- [ ] Implement role-specific eligibility, stable tie behavior, identity/policy revision validation.

## Implementation Plan

A fresh planner fills this at the work-start gate after owner ADR approval and
spec activation. Route through spec contracts 2, 3.1, 6.1.

## Acceptance Criteria

- [ ] Parent and child with one legacy session id have different participants and inboxes; restart cannot inherit old addressed work.
- [ ] Unknown/alias/self-declared models cannot lead or satisfy strongest review under default policy; owner attestation is explicitly labelled.
- [ ] Equal ranks retain eligible incumbent; stronger qualified identity is selected; provider/harness/price never implies strength.
- [ ] Model/reasoning/policy changes invalidate protected privileges and unaccepted attestations; unit tests cover changes and malformed descriptors.

## Final Summary

Pending implementation, evidence and independent review.

## Technical Notes

See [[cross-harness-team-coordination-protocol]]. Its acceptance is additive.
No live messaging, model identity or cross-platform proof from document creation.

## Dependencies

- Owner approval of ADR and activation of draft spec.

## Attachments

- [[model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review]]
