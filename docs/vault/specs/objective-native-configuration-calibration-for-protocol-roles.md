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

13. `native-policy-install-v2` is an atomic owner opt-in with only `cohort_id`,
    `expected_policy_revision` and `scope: waypost-protocol` plus authenticated
    envelope metadata (`team`, `actor`, `at`, `request_key`, `incarnation`, `epoch`).
    The reducer rebuilds
    authenticated summary from its own state and store-supplied revision, compiles
    current qualified role coverage, and installs policy, typed identity
    admissions, historical review requirements and coordinator/independent critic
    candidates together. The critic is a different ready participant on the
    strongest permitted review frontier; missing independent candidate blocks the
    whole installation. Candidate separation is not executable-context isolation.
    Caller policy/summary/score JSON is refused. Publication defers installation.
14. Installation requires no active leader/work, unresolved usage, pending native
    runtime/review/dispatch or unsupported quota-policy migration. Existing v1
    historical review identities without a common typed calibration bridge block
    installation. A separate owner-selected CLI bootstrap may create a team without
    automatic quota redistribution (`--native-policy-bootstrap`); only this new
    creation marker prevents new null-ranked legacy review history. Ordinary create
    behavior and old event replay stay unchanged; existing history is never erased.
    Candidate election is not protected execution or automatic quota recovery.
15. Candidate identity admissions come from authenticated settled measurement
    captures selected by the reducer from the chosen cohort, never imported
    native-profile JSON or participant admission fields. A future separate
    invocation-selector observation transition must remain pending, with no
    eligibility until atomic reinstallation. Installed admissions bind
    participant, incarnation, model/descriptor/collector, immutable typed profile,
    observation ID and original clocks. Retired measurement contexts never become
    executable review contexts. Independent participants may use the same measured
    profile only after their own fresh bound capture/admission.
16. Active policy 2 requires explicit matching protocol coverage. Missing role,
    implementation or architecture coverage, stale observations and action-bound
    requests without new action admission return null. Legacy leader acknowledgements
    and protected workflow cannot turn a protocol candidate into execution/review
    authority. Legacy policy replacement/refresh cannot downgrade active policy 2;
    migration needs an explicit typed bridge. Keep the entire strongest review frontier as typed historical
    requirements; future policy cohorts must freshly cover it on their common scale.
    Missing/incomparable history blocks, and numeric priority never transfers.

17. Periodic native model inventory uses only metadata requests on separately
    owned read-only backends. Codex model/list and OpenCode GET /provider provide
    advertised configurations; metadata-only initialization must work before a
    selected model can start a thread. No turns, personal-session listings or
    provider-auth/config secrets enter collection. Unsupported harnesses, including
    Claude until a verified inventory API exists, remain explicitly unsupported.
18. Inventory records bounded sanitized native route/model IDs, requested options,
    advertised availability/modalities and price hints. Native route is not model
    author; supported reasoning is not observed execution reasoning. Advertised
    zero price is advisory for the stated input/output buckets and grants no
    permission, exclusive quota, role rank or profile identity. Catalog candidates
    require fresh calibration; they cannot enter active policy directly.
19. A bound runtime collector records inventory separately from strength policy
    and calibration, with original collection clocks, nonce and descriptor binding.
    Periodic watch checks inventory freshness independently. A failed/unsupported
    attempt preserves previous observation/expiry, and cache reads do not renew it.
    Capture binds purpose/schema, team, participant/incarnation, runtime collector,
    descriptor and collection nonce, with bounded original TTL and monotonic
    last-success. Out-of-order responses cannot replace newer snapshots. Complete
    means all native pages and allowlisted rows passed validation without limits,
    truncation, missing pages or skipped invalid rows. Errors preserve the previous
    snapshot; only complete success in the identical adapter/schema/descriptor/
    filter scope establishes removal. Connected-route absence is not model removal.
    Raw provider responses, auth/options/env fields and raw errors/logs are never
    stored. Price hints preserve native units/currency when available, else unknown.
    No inventory
    refresh may renew calibration/admission or silently initiate paid trials.

20. A separately enabled bounded `protocol-control` policy may authorize only
    a single-call `protocol-leader-ack` request at this stage. It binds existing
    native-counter unit allocations, explicit token/call ceilings and timeout;
    no automatic allocation expansion, billing change or paid fallback occurs.
    Known exhaustion refuses; unknown quota remains unknown and is allowed only
    by this explicit owner control policy, never by measurement opt-in alone.
    The fixed host request binds candidate/incarnation/descriptor, current and
    target epoch, policy revision/digest, typed profile/calibration and action ID.
    Reservation and immutable slot consumption precede the one fresh owned
    read-only/no-tools turn. Reusing a consumed action under a new nonce cannot
    dispatch again. A separate semantic slot binds team/kind/current and target
    epoch/candidate incarnation/policy revision; changing action ID also cannot
    wash a consumed, failed or uncertain attempt. Prepared abort without dispatch
    is distinct. Failed and uncertain calls count against control ceilings.
    The bounded ACK JSON has exactly ack/action_id/request_digest, requires
    ack:true and original IDs/digest, and rejects decoded duplicate keys or extras.
    No preliminary identity probe shares the action context.
    Terminal accounting separately seals original request/prompt/output/native
    receipt and original clocks against the reserved action. Invalid, failed,
    changed-profile or partial results retain charged usage or uncertain holds.
    Identity and objective-measurement purposes keep their existing semantics.
    A dedicated trusted action-profile collector matches the actual receipt to
    current calibrated identity; it cannot import profile JSON or transfer score.
    ACK effects occur only after whole-operation callback drain and confirmed
    owned child closure, with exact operation/descriptor/native/consumption proof.
    Recovery uses the same sealed source and closure without further inference.
    The authority atomically rechecks original policy/calibration expiry, strongest
    coordinate candidate, current independent critic frontier, epoch, incarnation,
    descriptor, nonquarantined complete settlement and control/allocation limits;
    pending work/handover blocks. Active-incumbent selection recomputes independent
    critic eligibility before any early return; critic revoke, busy status or expiry
    withdraws cached eligibility while preserving the historical review frontier.
    The closure accessor derives its owned path/bindings, never caller proof/path.
    Successful capture marks that action applied and
    acknowledges the coordinator at its exact target epoch. This scoped ACK is
    not a generic action grant: legacy acknowledgements, work/review/integration,
    architecture and implementation actions remain closed until their own tested
    admission contracts. Retired measurement/action contexts never become critic
    contexts and an independent critic candidate is not executable review proof.

## Modules & files on disk

- `scripts/team-model-inventory.mjs`: advisory native catalogue projection and freshness.
- `tests/team-model-inventory.test.mjs`: binding, secrets, partial replies and original clocks.
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


Diagnostic policy proposal evidence (2026-10-03): the installed host reads a
bound authority snapshot, recomputes seals at their original settlement clock,
checks exact charged/counter values, replays capture validation on a clone and
regrades original answers. The process-local authenticated summary cannot be
reconstructed from detached JSON. `compileCalibrationPolicyV2` derives coordinate
and review frontiers separately, with nullable missing/failed role priorities and
no implement coverage. Seven new policy tests and the focused legacy strength,
host, CLI and ledger tests passed (91 cases across the final scoped checks).
Independent reviewer returned scoped ship after original-proof and fixture fixes.
The result is a diagnostic proposal, not activated policy or an action grant;
common-cohort activation and historical review requirements remain open.
