---
type: adr
id: "subscription-cli-token-accounting-with-separate-strict-billing-enforcement"
title: "Subscription CLI token accounting with separate strict billing enforcement"
status: proposed
date: 2026-10-02
authors: ["Ivan Morozov", "Codex (OpenAI)"]
tags: ["models", "routing", "subscription"]
external_refs: {}
supersedes: null
superseded_by: null
review_status: reviewed
reviewed_at: 2026-10-03
drafted_by: {"harness":"codex","provider":null,"date":"2026-10-02"}
guards: []
code_refs: ["scripts/team-host.mjs", "scripts/team-cli.mjs", "scripts/team-workflow.mjs", "scripts/team-transport.mjs", "scripts/team-quota-native.mjs", "scripts/model-routing.mjs", "scripts/team-subscription.mjs", "tests/team-subscription.test.mjs", "scripts/team-evidence.mjs", "models/routing.schema.json"]
---

# Subscription CLI token accounting with separate strict billing enforcement

| Field | Value |
|---|---|
| **Status** | proposed; owner selected subscription token/quota accounting, implementation details under review |
| **Date** | 2026-10-02 |
| **Authors** | Ivan Morozov |

---

## Context

The installed subscription CLIs provide native token telemetry and some authenticated
availability observations, but no verified invocation liability quote or invoice
binding. Current strict host dispatch requires those unavailable callbacks. Mock
callbacks in end-to-end tests do not make the real CLI usable.

On 2026-10-02 the owner explicitly chose token and available-quota accounting for
subscription CLIs, with strict monetary enforcement kept separately. This supplements
[[automatic-task-aware-model-routing-with-capability-floors-and-cost-budgets]] and
[[cross-harness-team-coordination-protocol]]; it does not replace strongest-role,
fresh-context review or immutable publication requirements.

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
Allocation increases are explicit owner events; changing a revision invalidates
unused admissions but cannot erase consumed attempts or their terminal accounting.

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
review calls. Local estimates reserve room for remaining stages, but are estimates,
not maximum provider liability. Actual overshoot is recorded and blocks further
admission until the owner updates the allocation. Terminal accounting and local
stop/reconciliation remain permitted despite overshoot, stale epoch or unavailable
quota, only for the exact stored invocation and its authorized collector. They
grant no new native calls or protected actions. Final model review pauses until
its remaining allocation is explicitly replenished; it is never omitted.
Unknown outcomes retain their
reservation; a consumed attempt is never replayed without no-dispatch or provider
reconciliation proof. A consumed call reconciled from owned stop evidence without a
receipt is charged its reservation and blocks admission on its counter until the
owner accepts a charge of at least that reservation for that call (owner decision
2026-10-06); accepting one call moves no allocation revision. Actual-model fallback requires new admission.

Provider quota observations remain independent of token budgets. Confirmed
exhaustion drives the existing safe role handover. Expiry or a reset timestamp does
not restore availability; fresh positive proof is required. Missing model/pool
scope stays unknown. Local accounting cannot reserve global quota against unrelated
clients or other machines. Never claim an exclusive provider quota reservation.

Break the bootstrap cycle with an owner-authorized bounded read-only admission
for identity inspection and fixed synthetic calibration only. It pins the owned
endpoint, native counter schema, available metadata, purpose, suite digest, local token
estimate, call/attempt ceiling and timeout before the call. Missing strongest rank
or task-class qualification cannot block this measurement admission, but it grants
no coordination, execution, review or publication privilege. Unknown model-scope
quota is labelled unknown and permits only an explicitly authorized bootstrap probe
or, under an explicit owner delivery ceiling, an addressed peer delivery in a fresh
owned stand-in context (owner decision 2026-10-06); known exhaustion still refuses. Preserve uncertain outcomes and compare pre/post
route/account observations. Unknown fields permit measurement but never invent
model identity or a protected-role rank. Only actual receipts and trusted grading
can promote the observed tuple.

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

Automatic economical selection filters candidates by unchanged capability floors,
exact runtime identity, tools/isolation, measured task-class qualification and usable
quota first. Within a comparable subscription accounting scope it minimizes
estimated whole-cycle token usage, including retries and strongest verification.
Unknown estimates cannot be labelled cheapest. Cross-route monetary comparisons need
fresh trustworthy pricing; otherwise expose incomparable objectives and blockers.
Strongest coordinators and independent strongest critics are never replaced merely
to reduce token usage. Free access does not imply capability or zero task cost.

Collectors and a team driver must be installed code. Preserve one authority/reducer
and owned-process supervision, not a second coordination state machine. Periodic
refresh services identity, strength/calibration, usage estimates and provider quota
separately; no successful leaderboard refresh conceals a missing collector.

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

Current capability evidence (before this implementation):

| Installed harness | Known observation | Remaining accounting blocker |
|---|---|---|
| Codex CLI | Effective model/reasoning and native token telemetry; nonbillable account/quota observer exists | Same inference-context billing origin/auth continuity and complete cumulative span collector not yet installed |
| Claude CLI | Native modelUsage and usage; reasoning remains unknown | Execution-account/effort evidence and subscription counter scope not verified |
| OpenCode CLI | Native token fields and billing provider id | Authored provider/variant and execution billing mode not independently verified |
| Claude Desktop Code | Cooperative MCP round trip observed | MCP credential holder is not native account/model/wake proof |

Implementation adds versioned accounting events, installed native provider
collectors, task-class measurement and a driver over existing work/review/integration.
The active spec and routing story need corresponding contracts and acceptance cases.

## Verification and follow-up

Fresh design critics precede implementation. Test strict-mode replay/no downgrade,
native counter validation, bounded bootstrap without role promotion, missing usage,
model/account/mode switches, unauthorized paid fallback, stale quota,
uncertain attempts, concurrent reservations, actual overshoot, whole-cycle accounting
and preserved strongest review. Live tests must use owned synthetic contexts before
claiming subscription adapters verified. A complete cross-harness reviewed task,
including revision and role redistribution, remains required for WP-20 completion.

## References

- [[automatic-task-aware-model-routing-with-capability-floors-and-cost-budgets]]
- [[automatic-model-strength-discovery-with-expiring-evidence-and-periodic-revalidation]]
- [[automatic-role-redistribution-on-verified-model-quota-exhaustion]]
- [[model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review]]

---

*Last updated: 2026-10-03*

## Independent design review

Two separate read-only passes first returned revise for bootstrap, execution-route
binding, migration and terminal accounting. After correction both returned ship
for the design and proposed scope of the first ledger increment. Those were design
reviews, not code verification. The subsequent implementation review found and
corrected context-alias duplicate accounting and overshoot reconciliation gaps;
its scoped ship verdict was followed by a focused regression run: 86/86 passed
(ledger, CLI, host, workflow and native transport fixtures). No native
subscription adapter or full dispatch capability is verified by those reviews. Owner chose the two-mode
direction; detailed implementation remains proposed until its review is complete.

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
execution billing or account-global quota guarantee. Calibration and a full
reviewed multi-harness task remain pending.

After the recapture correction, a second owned synthetic probe settled 19,207
native tokens with consistent metadata and no quarantine. Replay again refused;
no model/role was promoted and its native context was retired. A separate actual
diff reviewer returned scoped ship for this v2 bootstrap increment, with the full
routing story explicitly left open. Regression evidence: 134/136 passed on the
first seven-suite run; the two failures exposed an incarnation-envelope conflict,
then 67/67 affected tests passed after correction. The subsequent recapture
addition passed all 32 host tests. These checks do not establish a full team driver.
