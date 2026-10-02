---
type: adr
id: "automatic-role-redistribution-on-verified-model-quota-exhaustion"
title: "Automatic role redistribution on verified model quota exhaustion"
status: proposed
date: 2026-10-01
authors: ["Ivan Morozov"]
tags: []
external_refs: {}
supersedes: null
superseded_by: null
review_status: reviewed
reviewed_at: 2026-10-01
drafted_by: {"harness":"codex","provider":null,"date":"2026-10-01"}
guards: []
code_refs: ["scripts/team-quota.mjs", "scripts/team-workflow.mjs", "scripts/team-state.mjs", "scripts/team-host.mjs", "tests/team-quota.test.mjs"]
---

# Automatic role redistribution on verified model quota exhaustion

## Context

The owner requires automatic redistribution when a provider quota is exhausted.
A strongest model may still have the highest measured capability while being
unavailable for a paid invocation. Keeping every historical strongest identity
as a mandatory active critic would then block the whole task. Conversely, busy,
revoked or temporarily silent participants must not become an excuse for cheap
models to approve complex work. A desktop badge rounded to 100% is not sufficient
evidence: the current Claude CLI still answered while that badge was visible.

This proposal extends the accepted team ADR with the explicit quota exception
requested by the owner; it does not rewrite historical rankings or approvals.

## Decision

Enable automatic quota redistribution through an owner-authorized versioned
policy. Newly created teams request this policy; previous event replay retains
its recorded policy. A trusted host usage collector admits an exact provider
observation bound to participant incarnation, model revision, billing account,
SKU and quota pool. Only an explicit provider-quota-exhausted observation with provider account/model or quota-pool scope excludes that participant from
new coordinator, worker and review invocations. Local allocation, task budget, reservations, rate limits, generic 429, unverified UI percentages, model
self-reports and an arbitrary timeout cannot assert exhaustion.

A stronger exhausted coordinator triggers the existing acknowledged handover.
Consumed work stays uncertain until stopped/adopted evidence exists; no automatic
retry or reassignment of potentially running edits. The host driver stops its owned native processes without paid inference, admits collector stop proofs, retains work for acknowledged adoption, and obtains candidate acknowledgement. Unknown stop/adoption capability remains a named blocker, with unsettled liabilities held. Quiescence and publication
fences still order side effects; observations during publishing are deferred until exact acknowledgement or stopped reconciliation. Choose the strongest eligible remaining model
for coordination and a separate strongest available independent critic.

Retain every historical strongest review identity and its base floor. The
effective review floor may exclude a historical identity only when every enrolled
stable admission binding (participant, incarnation, model revision and exact identity) has a confirmed exhausted quota and none was washed away
by revocation/departure. A healthy participant with the same exact identity
preserves that floor. Busy/unavailable without quota proof never lowers it.
A monotonic quota revision binds review requests, grants and publication reservations. Eligibility changes invalidate pending review/integration approvals and late consumed review receipts cannot restore them; integrated
immutable receipts remain historical facts.

Exhaustion remains recorded after a reset time or evidence expiry: neither proves
restored quota. Observations have bounded original timestamps and source observation IDs; older or conflicting observations are rejected for each exact route binding. A fresh positive provider observation explicitly re-enables the
participant and recomputes roles/floors, including safe promotion of a stronger
returning coordinator. If no eligible model remains, pause with a named blocker.

## Alternatives Considered

- Pause every task until the original strongest account resets: prevents progress
  despite other strong available providers; rejected by the owner request.
- Treat 429, UI 100% or missing heartbeat as permanent quota exhaustion: unreliable
  and would weaken review; only structured provider confirmation is admissible.
- Delete exhausted models from history or silently lower their rankings: loses
  auditability and would confuse capability with account availability; rejected.
- Retry on another model immediately: may duplicate uncertain edits or charges;
  stopped-work and invocation reconciliation remain mandatory.

## Consequences

Automatic control continues across other accounts/harnesses without changing model
strength evidence. More provider quota adapters and explicit recovery proofs are
required. Unknown billing/quota capabilities stay blocked; no invented free quota.
The availability exception is separately audited and can be disabled by the owner.

## Verification and follow-up

Test coordinator and independent critic exhaustion; same-model healthy peers;
stronger return; all-model exhaustion; reset without positive proof; old/mismatched
quota records; publication fencing; and outstanding consumed work. Live quota
refusal and desktop delivery remain separate acceptance evidence.

## References

- [Team authority](model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review.md)
- [Automatic strength](automatic-model-strength-discovery-with-expiring-evidence-and-periodic-revalidation.md)
- [Economical routing](automatic-task-aware-model-routing-with-capability-floors-and-cost-budgets.md)

## Independent review

A fresh-context Waypost critic initially requested revision for provider/local
quota separation, stable historical admissions, quota revision fencing,
nonbillable handover, observation ordering and specification consistency.
The follow-up critic approved the architecture/foundation after the fixes,
including resumable adoption and stable inspection nonces. Provider/native
capabilities remain injected and are explicit blockers in the generic CLI;
this verdict does not close the quota story or prove live desktop operation.
Actual store/reducer/Git tests cover retained submitted work and faults before
and after worker acknowledgement. Full regression results are recorded with
the implementation, separately from live provider evidence.
