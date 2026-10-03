---
type: story
id: "story-participant-identity-and-owner-approved-model-policy"
epic: "WP-20"
title: "Participant identity and automatic model strength discovery"
status: in-progress
priority: p1
assignee: "Ivan Morozov"
created: 2026-09-30
updated: 2026-10-01
external_refs: {}
tags: []
code_refs: ["scripts/team.mjs", "scripts/model-strength.mjs", "scripts/team-state.mjs", "scripts/team-store.mjs", "scripts/team-cli.mjs", "models/strength-sources.json", "models/policy.schema.json", "models/descriptor.schema.json", "tests/team-models.test.mjs", "tests/team-store.test.mjs", "tests/model-strength.test.mjs", "tests/team-periodic.test.mjs", "tests/team-cli.test.mjs", "scripts/team-transport.mjs", "scripts/team-host.mjs", "scripts/team-evidence.mjs", "tests/team-transport.test.mjs", "tests/team-host.test.mjs", "scripts/native-model-profile.mjs", "tests/native-model-profile.test.mjs", "scripts/team-role-suite.mjs", "tests/team-role-suite.test.mjs", "scripts/team-role-calibration.mjs", "tests/team-role-calibration.test.mjs", "scripts/team-subscription.mjs", "tests/team-subscription.test.mjs", "tests/calibration-policy.test.mjs"]
specs: ["cross-harness-team-coordination-protocol", "objective-native-configuration-calibration-for-protocol-roles"]
started_at: "2026-10-01T02:15:04.752Z"
closed_at: null
plan_updated_at: "2026-10-01T02:15:04.752Z"
blocked_by: []
---

# Participant identity and automatic model strength discovery

| Field | Value |
|---|---|
| Epic | [One task coordinated across harnesses and AI models](../epic.md) (WP-20) |
| Status | in-progress |
| Priority | p1 |

## Description

Separate task participants from inherited session ids and declare exact model/provider/reasoning identity with an auditable automatically discovered task-domain ranking with fresh evaluator provenance.

Implementation in progress. Identity/policy core, automatic source discovery and
authority/inbox integration are being validated; no final delivery claim.

## Decomposition

- [ ] Define descriptor/policy schemas and evidence floor; no shipped unsubstantiated worldwide ranking.
- [ ] Mint unique participant/incarnation and native-locator separation, with scoped enrollment/revocation.
- [ ] Implement role-specific eligibility, stable tie behavior, identity/policy revision validation.

## Implementation Plan

Fresh planner validated seams against WP-17/18/19. Implement scripts/team.mjs
with exact identity policy and deterministic selection; models schemas and
model-strength.mjs fetch public evidence with confidence ties/TTL. Integrate
team-state/store/CLI so participant/inbox isolation is tested through real
commands. Route through spec contracts 2, 3.1, 6.1. Native identity/unknown-model
calibration are separately reported pending; do not close from reducer tests alone.

## Acceptance Criteria

- [ ] Parent and child with one legacy session id have different participants and inboxes; restart cannot inherit old addressed work.
- [ ] Unknown/alias/self-declared models cannot lead or satisfy strongest review under default policy; owner attestation is explicitly labelled.
- [ ] Equal ranks retain eligible incumbent; stronger qualified identity is selected; provider/harness/price never implies strength.
- [ ] Model/reasoning/policy changes invalidate protected privileges and unaccepted attestations; unit tests cover changes and malformed descriptors.

- [ ] Automatically discover priorities from fresh sources, including free models; unknown identity never inherits a family rank.
- [ ] Periodically check ranking and execution identity separately; expiry/change suspends stale authority and review.

## Final Summary

Pending implementation, evidence and independent review.

## Technical Notes

See [[cross-harness-team-coordination-protocol]]. Its acceptance is additive.
No live messaging, model identity or cross-platform proof from document creation.

## Dependencies

- Owner approval of ADR and activation of draft spec.

## Attachments

- [[model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review]]
