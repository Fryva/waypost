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

### Same-leader recovery implementation plan (2026-10-04)

Add an explicit optional owner policy for recovery after confirmed exhaustion.
Pin the original old coordinator binding and account exhaustion when freezing.
Require a fresh ordered positive provider proof, all enrolled scope stops, idle
accounting and unchanged strongest independent review before a new target epoch
ACK. Preserve default pause and historical event shapes without the opt-in.
Bind recovery evidence in the prepared transition and fixed request, recheck at
consume/capture, and recover interrupted publication without another inference.
Equivalent refresh must not extend pinned positive expiry. Independent criticism
and reducer/registered Host tests precede implementation claims or completion.

The implementation now keeps an immutable first-freeze basis and binds it with
the original ordered positive account proof in the new-epoch ACK. An epoch-wide
consumed latch prevents a second ACK across candidates/nonces. Independent review
found and corrected account-alias refresh cases that could hide a newer provider
exhaustion; the guard also covers opted-in transfers to another coordinator.

The first six-file run passed 54/60 in 425.513 seconds. Four new alias fixtures
used ACK output for an audit and were corrected to the exact audit response.
Two new registered Host cases correctly refused recovery when authority replay
CPU time exceeded the original 30-second proof age. Their positive-path rerun
uses a controlled Date clock, with a separate tick between exhaustion and recovery;
production expiry checks are unchanged. The seven existing Host cases retain
real wall clocks. Original proof-age rejection at reserve, consume and capture
passed. The complete affected reducer file then passed 17/17 in 9.454 seconds;
the two controlled-time Host cases passed 2/2 in 113.417 seconds. The other 41
cases passed unchanged in the initial run. Independent code and fixture review
returned scoped ship; there is no demonstrated wall-clock recovery within the
original 30-second bound on this ledger. Doctor reported 0 issues/0 warnings;
`next` and `git diff --check` showed no consistency failures. The quota story
and WP-20 remain in progress.
Provider transport remains mocked; this is not live provider recovery evidence.
