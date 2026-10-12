---
type: adr
id: "subscription-cli-token-accounting-with-separate-strict-billing-enforcement"
title: "Subscription CLI token accounting with separate strict billing enforcement"
status: accepted
date: 2026-10-02
authors: ["Ivan Morozov", "Codex (OpenAI)"]
tags: ["models", "routing", "subscription"]
external_refs: {}
supersedes: null
superseded_by: null
review_status: reviewed
reviewed_at: 2026-10-12
drafted_by: {"harness":"codex","provider":null,"date":"2026-10-02"}
guards: []
code_refs: ["scripts/team-host.mjs", "scripts/team-cli.mjs", "scripts/team-workflow.mjs", "scripts/team-transport.mjs", "scripts/team-quota-native.mjs", "scripts/team-subscription.mjs", "tests/team-subscription.test.mjs", "scripts/team-evidence.mjs", "scripts/team-native-quota.mjs", "scripts/team-native-action.mjs", "scripts/team-native-work.mjs", "scripts/team-native-delivery.mjs", "scripts/team-role-calibration.mjs", "tests/native-protocol-work-host.test.mjs", "tests/native-protocol-host.test.mjs"]
---

# Subscription CLI token accounting with separate strict billing enforcement

| Field | Value |
|---|---|
| **Status** | accepted for inherited-native v2 token accounting in protocol-2 teams; owner decision 2026-10-12 |
| **Date** | 2026-10-02 |
| **Authors** | Ivan Morozov |

---

## Owner acceptance

The owner accepted this ADR on 2026-10-12 after a fresh-context waypost-critic pass
(verdict revise; every required edit applied below) and narrowed it to what is
implemented:

- Inherited-native v2 token accounting for protocol-2 teams (owner-assigned and
  automatic-calibration).
- v1 events stay replayable, and new v1 events are still accepted (stricter).
  Strict mode is unchanged.
- A crashed Host permanently blocks its counter. This is a known limit; recovery is
  a new team.
- Two code deviations are documented here and are planned fixes: the Host
  auto-raise of the allocation, and the missing reservation for later stages (see
  Decision).
- Owner session caps across teams are not enforced by the ledger. The owner wants
  that enforced; the choice is open in
  [[enforce-the-owners-token-budget-for-live-runs-across-teams]] (proposed).

## Scope

Inherited-native v2 token accounting for protocol-2 teams, as implemented. Out of
scope: choosing executors by token cost (economical routing), a team driver and
periodic refresh of calibration. Strict-mode enforcement is unchanged.

## Context

The installed subscription CLIs provide native token telemetry and some authenticated
availability observations, but no verified invocation liability quote or invoice
binding. Current strict host dispatch requires those unavailable callbacks. Mock
callbacks in end-to-end tests do not make the real CLI usable.

On 2026-10-02 the owner explicitly chose token and available-quota accounting for
subscription CLIs, with strict monetary enforcement kept separately. This is independent of
[[automatic-task-aware-model-routing-with-capability-floors-and-cost-budgets]], which
excludes this mode. It follows [[cross-harness-team-coordination-protocol]] and does
not replace strongest-role, fresh-context review or immutable publication
requirements.

## Decision

Expose two explicit, versioned accounting modes. Existing strict routes retain
their current quote/allocation/invoice requirements and never silently downgrade.
Subscription v2 inherits the native CLI's existing billing policy. Waypost does not
enable purchased credits, change billing settings, inject API credentials or
implement a paid-route fallback. Native auth/account/origin/SKU/credit observations
are recorded with provenance; missing fields stay null/unknown. OAuth or a UI badge
cannot establish an actual execution billing route or `paid_fallback:false`.
Absence of that monetary guarantee does not prevent owner-authorized bounded
synthetic token measurement. Strict monetary guarantees belong to strict mode.

The initial implemented subscription v1 required verified account/origin/mode and
no-credit-fallback evidence. Independent critique found this reintroduced strict
monetary enforcement into the advisory mode and blocked the owner's CLI workflow.
Keep those historical v1 events replayable; use separate v2 events for inherited
native policy. V2 token allocations are explicitly local to a team and native
counter schema. Unknown accounts are never forged or pooled as provider accounts.
Provider quota aggregation still requires independently verified account/pool/model
scope; local token allocation cannot establish it.
Mode, allocation and counter-schema revisions bind every admission and receipt.
Mode changes require an owner event and no unfinished prepared/consumed/uncertain
operations, active work or unreconciled reviews; never reinterpret a strict
invocation as token-accounted. Preserve historical ledger units and reservations.
Changing a revision invalidates unused admissions but cannot erase consumed attempts
or their terminal accounting. Allocation increases were meant to be explicit owner
events. That is false today: the Host auto-raises the allocation (see Budget layers).

Subscription mode accounts native usage as tokens, with the coverage and counter
semantics stated per adapter. It never reports a monetary invoice or claims a hard
provider-enforced spend cap. Missing/partial usage remains unknown; it is not zero.
Do not apply API token prices to subscription usage. Tokens from different vendors
or buckets are not automatically equivalent measures of quota consumption.

Persist each operation's participant/incarnation, exact model and configuration,
owned context and available account/route observations, epoch, purpose, evidence revisions and attempt nonce
before invoking the provider. Bootstrap pins requested configuration separately
from observed execution identity; requested aliases cannot authorize protected work.
Account for coordinator, worker, calibration and
review calls. Local estimates are estimates, not maximum provider liability.
Terminal accounting and local stop/reconciliation remain permitted despite overshoot,
stale epoch or unavailable quota, only for the exact stored invocation and its
authorized collector. They grant no new native calls or protected actions.
Unknown outcomes retain their
reservation; a consumed attempt is never replayed without no-dispatch or provider
reconciliation proof. A consumed call reconciled from owned stop evidence without a
receipt is charged its reservation and blocks admission on its counter until the
owner accepts a charge of at least that reservation for that call (owner decision
2026-10-06); accepting one call moves no allocation revision. Actual-model fallback requires new admission.

### Budget layers

What the code does (`scripts/team-subscription.mjs`, `scripts/team-native-action.mjs`,
`scripts/team-native-work.mjs`, `scripts/team-host.mjs`):

- Two layers. The team allocation is set per counter schema. Each owner policy
  (control, delivery, work) adds its own cap with call ceilings and a per-call
  estimate ceiling.
- No reservation for later stages. The work budget adds only the current call's
  estimate. If the cap is exhausted before review, the work is cancelled. There is
  no replenish path: the per-policy cap is fixed, `native-work-enable-v2` refuses
  while work is unfinished, and raising the team allocation does not raise that cap.
  Planned fix: reserve the review estimate at execution time.
- An allocation raise invalidates control policies pinned to the old allocation
  revision.
- Overshoot is counted per call (actual above the call's own estimate), not against
  the allocation. It blocks the counter until the owner raises the allocation.
- Any uncertain call blocks the team counter. A crashed Host leaves no closure, so
  the counter stays blocked. Recovery is a new team.
- The Host auto-raises the allocation when a bootstrap call's `--max-tokens` exceeds
  it. This also clears a measured-overshoot latch and invalidates control policies
  pinned to the old revision. Planned fix: raises only through an explicit
  `allocation-update`.
- Owner session caps across teams are tracked by the operator, not enforced by the
  ledger. See [[enforce-the-owners-token-budget-for-live-runs-across-teams]].

Provider quota observations remain independent of token budgets. Confirmed
exhaustion drives the existing safe role handover. Expiry or a reset timestamp does
not restore availability; fresh positive proof is required. Missing model/pool
scope stays unknown. Local accounting cannot reserve global quota against unrelated
clients or other machines. Never claim an exclusive provider quota reservation.

Break the bootstrap cycle with an owner-authorized bounded read-only admission
for identity inspection and fixed synthetic calibration. `reserve-v2` also admits
protocol-control, delivery and work calls, each under its own owner policy. The
admission pins the owned
endpoint, native counter schema, available metadata, purpose, suite digest, local token
estimate, call/attempt ceiling and timeout before the call. Missing strongest rank
or task-class qualification cannot block this measurement admission, but it grants
no coordination, execution, review or publication privilege. Unknown model-scope
quota is labelled unknown. It permits identity and calibration probes, plus any call
whose owner policy allows unknown quota: required for control (leader-ACK, audit,
handover-ACK) and delivery, optional for work (owner decision 2026-10-06 for
delivery). Known exhaustion still refuses. Claude billing is always unavailable
(`scripts/team-transport.mjs`). Only Codex has a quota observer; Claude and OpenCode
quota is unknown today. Preserve uncertain outcomes and compare pre/post
route/account observations. Unknown fields permit measurement but never invent
model identity or a protected-role rank. Only actual receipts can promote the
observed tuple. Trusted grading ranks profiles only in automatic-calibration teams;
in owner-assigned teams the owner's assignment binds roles to the admitted identity.

An adapter receipt states its native counter schema, execution context and invocation,
coverage, observed model, pre/post available metadata and counter boundaries. Cumulative
counters need a verified baseline and terminal snapshot from the same context;
subtract once, reject decreases and do not add cached/reasoning subsets twice.
Complete native-span telemetry is not a provider-exhaustive billing invoice.
Billing/model changes preserve terminal tokens and quarantine the context for
subsequent admission; they must not erase already consumed usage. Refining an
initial unknown model is an observation, not evidence of a model switch.
A last-response counter is not whole-turn usage when tools or retries caused other
model calls. Partial or absent coverage remains unknown. Replay cannot account the
same provider/context span twice; malformed receipts retain uncertain reservation.

Choosing executors by token cost is not decided here; it needs a new ADR.

Collectors are installed adapters. No team driver exists; Hosts are run by CLI
steps. `team watch` renews Codex quota leases only. Identity probes and cohorts are
run by the owner; calibration is never renewed automatically.

## Rationale

This permits the owner's actual subscription workflow while describing its limits
honestly. A hard monetary guarantee remains available only where the provider
supports it. Weakening review or forging billing evidence solves neither problem.

## Alternatives Considered

| Option | Consequence |
|---|---|
| Require strict invoices for every subscription invocation | Blocks the installed CLI workflow without evidence that such APIs exist |
| Treat subscription/free as zero cost with unlimited quota | Conceals quota consumption and unknown paid fallback |
| Separate observed token/quota accounting from strict monetary enforcement | Selected by owner; preserves truthful evidence and protected-role invariants |

## Consequences

Subscription accounting is advisory with respect to money and provider-global
quota. Stop/timeout can leave unknown usage; local admission cannot prevent every
overshoot. Native counter formats and authorization capabilities differ by harness.
Unsupported identity/quota/billing routes remain explicit blockers. Desktop MCP
participation remains cooperative until native binding and wake are separately proved.

Owner session caps across teams are tracked by the operator, not enforced by the
ledger. A crashed Host blocks its team counter for good; recovery is a new team.
See [[enforce-the-owners-token-budget-for-live-runs-across-teams]].

## Implementation status (2026-10-12)

- Counter semantics per adapter (`COUNTER_SCHEMA` in `scripts/team-host.mjs`):
  Codex `codex-thread-cumulative-total-v1`, OpenCode
  `opencode-native-normalized-step-total-v1`, Claude
  `claude-native-first-turn-total-v1`. All three adapters exist.
- Claude billing is unknown. Only Codex has a quota observer
  (`scripts/team-quota-native.mjs`).
- Live runs: calibration and a full reviewed three-harness task on 2026-10-08/09 and
  2026-10-11. Facts are in the WP-20 stories.
- Deviations listed under Budget layers are planned fixes. Stale labels remain in
  code: `bootstrap_only` (`scripts/team-subscription.mjs`) and
  `protected_native_actions:false` (`scripts/team-cli.mjs`). Fixing them is a
  follow-up.
- Desktop MCP participation remains cooperative until native binding and wake are
  separately proved.

## Verification and follow-up

Test strict-mode replay/no downgrade,
native counter validation, bounded bootstrap without role promotion, missing usage,
model/account/mode switches, unauthorized paid fallback, stale quota,
uncertain attempts, concurrent reservations, actual overshoot, whole-cycle accounting
and preserved strongest review. Live tests must use owned synthetic contexts before
claiming subscription adapters verified.

## References

- [[automatic-task-aware-model-routing-with-capability-floors-and-cost-budgets]]
- [[automatic-model-strength-discovery-with-expiring-evidence-and-periodic-revalidation]]
- [[automatic-role-redistribution-on-verified-model-quota-exhaustion]]
- [[model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review]]
- [[enforce-the-owners-token-budget-for-live-runs-across-teams]]

---

*Last updated: 2026-10-12*

## Independent design review

Two separate read-only passes first returned revise for bootstrap, execution-route
binding, migration and terminal accounting. After correction both returned ship
for the design and proposed scope of the first ledger increment. Those were design
reviews, not code verification. The subsequent implementation review found and
corrected context-alias duplicate accounting and overshoot reconciliation gaps;
its scoped ship verdict was followed by a focused regression run: 86/86 passed
(ledger, CLI, host, workflow and native transport fixtures).

## Inherited-native correction (2026-10-03)

A separate independent design critique returned revise: requiring proof of
`paid_fallback:false` before advisory bootstrap contradicted the owner's selected
token/quota mode. The v2 correction preserves native billing policy and honest
unknown metadata; it introduces no monetary guarantee or API fallback. Bootstrap
still requires an owned read-only context, fixed synthetic suite, bounded attempt,
consume-before-dispatch, retained uncertainty and unchanged protected-role gates.
Only known native schema counters can settle the local token span. Model identity
and strength promotion, worker dispatch and final review remain separate work.

The first owned Codex CLI v2 synthetic probe passed on 2026-10-03: 18,516 observed
native tokens, effective `gpt-6.1-sol / low`, replay refused and no protected-role
promotion. Owned-runtime closure confirmed child stop and callback drain. A native
account initialization notification during the initial metadata read was retained
as inconsistency and quarantined that context without discarding usage. One
bounded nonbillable recapture is now permitted before admission; it makes no
execution billing or account-global quota guarantee.

After the recapture correction, a second owned synthetic probe settled 19,207
native tokens with consistent metadata and no quarantine. Replay again refused;
no model/role was promoted and its native context was retired. A separate actual
diff reviewer returned scoped ship for this v2 bootstrap increment, with the full
routing story explicitly left open. Regression evidence: 134/136 passed on the
first seven-suite run; the two failures exposed an incarnation-envelope conflict,
then 67/67 affected tests passed after correction. The subsequent recapture
addition passed all 32 host tests. These checks do not establish a full team driver.

## Acceptance pass (2026-10-12)

A fresh-context waypost-critic returned revise. Edits applied: scope narrowed to
inherited-native v2 for protocol-2 teams, routing relationship corrected, economical
selection removed, collector and driver claims corrected, unknown-quota and grading
rules restated, budget layers rewritten from the code, two deviations documented as
planned fixes, capability table replaced by implementation status, stale gates
removed, code references corrected. The owner then accepted the narrowed ADR.
