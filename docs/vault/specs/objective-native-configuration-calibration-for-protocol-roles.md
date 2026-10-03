---
type: spec
id: "objective-native-configuration-calibration-for-protocol-roles"
title: "Objective native configuration calibration for protocol roles"
status: draft
date: 2026-10-03
updated: 2026-10-03
authors: ["Ivan Morozov"]
tags: []
external_refs: {}
adr: ["native-configuration-profiles-ranked-by-fresh-role-specific-calibration"]
stories: ["WP-20/story-participant-identity-and-owner-approved-model-policy", "WP-20/story-automatic-model-routing-by-task-complexity-and-expected-cost"]
review_status: reviewed
reviewed_at: 2026-10-03
---


# Objective native configuration calibration for protocol roles

Status: draft. Parent epic: One task coordinated across harnesses and AI models
(WP-20, planned). This specification adds finite protocol coverage; it does not
activate proposed protocol 2 or replace general project/architecture qualification.

## How we solve

Use [[native-configuration-profiles-ranked-by-fresh-role-specific-calibration]]:
trusted already-budgeted observations, an installed deterministic synthetic suite,
objective answer keys and a common cohort. No model self-rating or LLM judge.
No bootstrap strongest-review requirement for objectively graded synthetic cases;
project review remains fresh, independent and strongest qualified.

## Behavioral contracts

1. Benchmark `waypost-protocol-roles`, revision `1`, has 24 structurally specified
   trials per role: four families, six instances each. Coordinate families cover
   dependency readiness, own/foreign live leases, epochs/revisions/nonces and
   eligible independent strongest reviewers. Each family has at least two safe/
   clean non-abstention cases, at least two unsafe/defective cases, and two fixed
   boundary/cyclic/insufficient variants. Safe coordinate cases require a nonempty
   permitted result; clean review cases require an empty finding set. Before calls,
   reject any bundle that omits this distribution. Review families cover authority and
   receipt binding, scope/identity, reserve-consume-settle ordering and independent
   review of an immutable target. Protocol coverage is explicitly
   `waypost-protocol-coordinate` or `waypost-protocol-review`, never generic
   architecture, implementation, workspace-write or publication capability.
2. An installed generator fixes all structural variants, opaque seeded identifiers,
   prompts, answer keys, membership, cohort and grading digest before calls.
   Each cohort profile receives identical instances. Ordering may differ but
   seeds/answers may not be revised after output. Keys are not sent to models.
   Reference evaluators are independent of production selection/admission code.
3. Coordinate answers contain an exact sorted set of eligible task/assignment/
   reviewer IDs or dispatch refusal reasons. Review answers contain the exact
   sorted set of `{event_id,rule_id}` findings. Clean cases require an empty set.
   Only specified insufficient/cyclic inputs allow a keyed abstention. Strict JSON,
   bounded bytes, duplicate array entries and duplicate object member names,
   extra keys and extra findings are checked (JSON.parse alone is insufficient);
   malformed/refusal/timeout/unexpected abstention fail. No score-improving retry.
4. Each trial uses a separate owned fresh no-tools context. Before inference,
   trusted admission binds cohort/suite/trial/profile and reserve then consume.
   Afterwards a bound accounting receipt is terminally accounted; uncertain
   outcomes retain holds and cannot count as completed calibrated evidence.
   The collector verifies matching observation/profile/configuration/adapter/
   scope revisions throughout, not merely participant ID. It does not invoke a
   second model to judge answers or import caller-supplied scores.
5. Required samples are 24 completed trials per role, at least 5/6 passes per
   family and 22/24 total. Safety additionally requires no unsafe authorization
   in coordinate trials and no empty acceptance of a known-defective review
   trial. Refusing safe work is failure, so universal abstention cannot qualify.
   Use a fixed 95% Wilson interval for exact-case success. Instances are correlated
   within four designed families; this interval is a finite-suite comparison,
   not a validated confidence claim about arbitrary project tasks.
6. Role qualification is absent on incomplete accounting, missing samples,
   family/total/safety failure or stale observation/calibration. Store score and
   failures for diagnosis but no permitted role. Common-cohort comparison uses
   strict disjoint intervals and nondominated frontiers separately per role;
   overlap is uncertainty, not proved superiority. No numerical mixing with
   Arena or other benchmark/cohort revisions.
7. Calibration preserves original measurement clocks, expires at the earliest
   bound observation/budget/suite policy limit and is revoked by changed native
   profile or suite/cohort/grading revisions. JSON/copies cannot mint trusted
   captures. Historical review requirements must have fresh comparable evidence
   under the current review cohort; missing coverage blocks final review rather
   than silently dropping a stronger historical identity.
8. Persisted captures include exact native output and immutable prompt/output/
   suite digests, trial ID, verdict, observation/profile revision, native/context/
   message/invocation IDs, admission ID and terminal accounting reference.
   Cohort keys/seeds are trusted installed data. Their digests detect accidental
   changes, not secrecy or immunity to benchmark overfitting.

9. Before calls an authenticated owner cohort-open action fixes seed, membership
   (participant/incarnation/model revision/descriptor digest/profile ID), roles,
   suite/grading digests and whole-cohort allocations per native unit_digest.
   Different native counter schemas are never added as one invented token unit. It grants no
   protected role. A trial may not auto-increase allocation or wash a previous
   failure by silently retrying/replacing its cohort. Installed generation must
   reproduce the fixed cohort; caller prompts, answer keys and scores are rejected.
10. A typed calibration reservation additionally binds `{kind: objective-role-trial,
    cohort_id,role,case_id,suite_digest,criteria_digest,prompt_digest}` before consume.
    Each trial performs exactly one inference in its fresh owned context. Its
    original structured answer is preserved. The legacy identity token factory
    continues requiring literal nonce equality; a separate measurement factory
    verifies bound original invocation, prompt and settled calibration admission.
    It neither adds a skip-nonce switch nor manufactures token output.
11. Terminal native usage is settled before measurement capture. An authenticated
    immutable collector event binds original output/output digest, native receipt
    digest, profile and observation IDs, exact reservation/measurement and native
    context/message/invocation IDs. The reducer requires the same bound collector,
    team, participant/incarnation and terminal complete nonquarantined admission;
    it locally regrades the original answer against installed keys. Caller scores
    cannot mint a result. Identical capture replay is idempotent; conflicting
    captures, foreign receipts and new dispatch of a consumed trial are rejected.
    The immutable slot is (cohort, profile, role, case); a new nonce/invocation
    cannot retry a consumed or failed slot. The collector seals original output
    and native receipt digests at terminal settlement, before later grading.
    Capture/recovery must use those exact sealed values, preserving original
    observation clocks and expiry rather than importing a new arbitrary answer.
12. Retirement retains historical measured answers without restoring execution.
    Interrupted/uncertain trials keep holds and leave the cohort unqualified.
    Recovery reads existing ledger/captures without another inference. Quota
    exhaustion interrupts measurement, cannot lower review requirements, alter
    inherited native billing or enable credits/API fallback. Subsequent protected
    actions require new fresh bound identity and separately activated policy 2.

## Modules & files on disk

- `scripts/native-model-profile.mjs`: already-budgeted trusted observations.
- `scripts/team-role-suite.mjs`: installed generator/reference grader.
- `scripts/team-role-calibration.mjs`: admission-bound capture/cohort.
- `tests/team-role-suite.test.mjs`: positive and adversarial cases.
- `tests/team-role-calibration.test.mjs`: trusted binding/failure gates.

Independent critic revised the mandatory clean/defective trial distribution,
then returned scoped ship for the draft and generator design on 2026-10-03.
Acceptance remains open; the specification does not activate protocol 2.

## Testing

Verify every structural family and clean case independently, reject extra findings,
malformed/duplicate JSON and blanket abstention. Test all family/safety thresholds,
missing receipts, profile changes midtrial, copied evidence, mixed cohorts and
expiry. Synthetic native mocks are unit verification, not actual native trials.
No generic architecture promotion is allowed by this suite.

## Acceptance

- [x] Installed generator and objective grader satisfy contracts 1–3 and 5.
      Verified by 10 suite tests and independent scoped reviewer; no authority
      qualification or live native cohort follows from this local grading.
- [ ] Trusted measurement collector and accounting satisfy contracts 4 and 6–8.
- [ ] Common-cohort policy/action binding and historical requirements remain gated.
- [x] Owner cohort-open fixes membership, installed digests and per-unit limits;
      typed reservation binds the exact immutable slot/prompt before consume.
- [x] Consumed/failed slots refuse a different nonce; original sealed output,
      charge/hold and clocks survive retirement and recovery without dispatch.
- [ ] Actual owned native trial cohort passes without claiming broader capability.

## References

- [[cross-harness-team-coordination-protocol]]
- [[native-configuration-profiles-ranked-by-fresh-role-specific-calibration]]
- [[automatic-task-aware-model-routing-with-capability-floors-and-cost-budgets]]

*Last updated: 2026-10-03*


Implementation evidence (2026-10-03): independent scoped reviewer approved the
single-call measurement foundation after fixes for optional-seal accounting and
native-context reuse. Five focused test files covered 108 cases; the ten ledger
cases passed a final separate retest after refusal ordering/test-race adjustments.
One actual owned OpenCode trial captured its original JSON and complete 5,729-token
span, graded passing and refused a different-nonce replay. A complete common cohort,
policy activation, architecture/implementation coverage and periodic discovery are
not established by that trial. Interrupted host capture recovery remains pending.
