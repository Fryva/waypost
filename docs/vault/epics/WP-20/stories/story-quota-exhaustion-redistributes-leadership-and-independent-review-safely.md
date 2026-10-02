---
type: story
id: "story-quota-exhaustion-redistributes-leadership-and-independent-review-safely"
epic: "WP-20"
title: "Quota exhaustion redistributes leadership and independent review safely"
status: planned
priority: p1
assignee: "Ivan Morozov"
created: 2026-10-01
updated: 2026-10-01
external_refs: {}
tags: []
code_refs: ["scripts/team-quota.mjs", "scripts/team-state.mjs", "scripts/team-workflow.mjs", "scripts/team-host.mjs", "tests/team-quota.test.mjs", "tests/team-quota-state.test.mjs", "tests/team-host.test.mjs"]
specs: []
started_at: null
closed_at: null
plan_updated_at: null
---

# Quota exhaustion redistributes leadership and independent review safely

## Description

The strongest provider account can run out of quota while other models remain
available. Continue under the strongest available coordinator and independent
critic with verified quota evidence and safe handover.

## Implementation Plan

Trusted provider observations and pure quota eligibility live in team-quota.mjs.
Versioned collector events apply them under the existing journal/publication
fence. Model ranking remains in team.mjs; team-state derives the quota-adjusted
review floor without deleting historical identities. Host failures/watch update
confirmed quota availability and trigger existing acknowledged handover.

## Acceptance Criteria

- [ ] Only exact current collector/provider records can exhaust or restore quota.
- [ ] Exhausted coordinator yields to the strongest available remaining model.
- [ ] Independent critic selection preserves historical strength except verified
      quota exhaustion; revocation, silence or price cannot lower the floor.
- [ ] A healthy same-model peer retains the strongest review requirement.
- [ ] Returning stronger models require acknowledged handover and fresh review.
- [ ] Reset/expiry alone cannot restore quota; no eligible models produces pause.
- [ ] Consumed work/charges remain quarantined until stopped/invoice evidence.
- [ ] Live provider refusal/recovery and desktop behavior are verified separately.

## Technical Notes

ADR automatic-role-redistribution-on-verified-model-quota-exhaustion is proposed.
The owner explicitly requested automatic quota redistribution; fresh criticism
and runtime evidence must precede claiming this story complete.
