---
type: story
id: "story-quota-exhaustion-redistributes-leadership-and-independent-review-safely"
epic: "WP-20"
title: "Quota exhaustion redistributes leadership and independent review safely"
status: in-progress
priority: p1
assignee: "Ivan Morozov"
created: 2026-10-01
updated: 2026-10-02
external_refs: {}
tags: []
code_refs: ["scripts/native-model-profile.mjs", "scripts/team-host-registry.mjs", "scripts/team-host.mjs", "scripts/team-native-action.mjs", "scripts/team-native-quota.mjs", "scripts/team-owned-runtime.mjs", "scripts/team-quota-native.mjs", "scripts/team-quota.mjs", "scripts/team-state.mjs", "scripts/team-subscription.mjs", "scripts/team-transport.mjs", "scripts/team-workflow.mjs", "scripts/team.mjs", "tests/helpers/native-calibration.mjs", "tests/helpers/native-protocol-host.mjs", "tests/native-protocol-handover-host.test.mjs", "tests/native-protocol-handover.test.mjs", "tests/native-protocol-quota.test.mjs", "tests/team-host-registry.test.mjs", "tests/team-host.test.mjs", "tests/team-owned-runtime.test.mjs", "tests/team-quota-native.test.mjs", "tests/team-quota-state.test.mjs", "tests/team-quota.test.mjs", "tests/team-transport.test.mjs"]
specs: ["cross-harness-team-coordination-protocol"]
started_at: "2026-10-02T00:57:09.984Z"
closed_at: null
plan_updated_at: "2026-10-02T00:57:09.984Z"
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


### Native protocol-only quota handover (2026-10-04)

An additive owner policy now accepts provider-confirmed quota observations bound
to an authority-owned settled action, its admitted native profile and an exact
known billing route/account generation. Source method, code, scope, status and
interpretation documentation must match the installed collector rule. Unknown
billing, generic HTTP 429, timeouts, busy state and local token ceilings cannot
establish provider exhaustion. Negative observations remain sticky; expiry or
reset clocks do not restore eligibility. Separate positive provider evidence is
required. Advertised model authorship and hidden reasoning remain unknown.

The protocol transition freezes new identity/calibration/control admission, stops
all enrolled old-epoch native scopes and requires callback-drained, process-group
closure evidence from each participant's own runtime collector. Consumed
subscription calls remain in stop coverage even after terminal accounting;
historical calls without operation journals block handover. Preparation refuses
outstanding generic work or unresolved usage and retains the historical typed
review floor. Missing an independent current critic at that floor pauses transfer.
A separately bounded fixed ACK executes in a provisional target runtime epoch,
while accounting remains bound to the old authority epoch. Atomic capture checks
current policy/quota/frontier/transition, actual settled profile and own closure.
Recovery reads the original seal without new inference. Generic execution,
review and integration permissions are not granted. Account-wide exhaustion also
excludes verified aliases and actual new billing contexts on the same account.
Only account scope is supported. Same-meaning refresh retains the prepared
election sample; material changes after consumption pause with charges retained.
Automatic old-leader reactivation remains explicitly unsupported.

Independent fresh-context criticism returned scoped ship after fixing Host
bindings, account-wide exhaustion, expiry and interrupted-capture refresh.
The gated 16-file regression initially passed 202/210 cases in 128.674 seconds.
Seven Host cases exposed a registered-fixture vault binding omission, and one
quota case exposed missing comparison against the original billing context.
Both fixes passed another independent critic. The final affected three-file
run passed 23/23 in 280.207 seconds; the other 187 cases passed unchanged.
Owned-runtime/authority tests use mocked provider transport, not live inference. Provider collection is an installed trusted Host capability; the
current CLI has no verified typed provider observer and returns an explicit
unsupported blocker. Hermetic provider fixtures are not live provider refusal
or live cross-harness/desktop transfer. Full story acceptance remains open.
