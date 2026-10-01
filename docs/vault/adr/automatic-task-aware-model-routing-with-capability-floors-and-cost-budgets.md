---
type: adr
id: "automatic-task-aware-model-routing-with-capability-floors-and-cost-budgets"
title: "Automatic task-aware model routing with capability floors and cost budgets"
status: proposed
date: 2026-10-01
authors: ["Ivan Morozov", "Codex (OpenAI)"]
tags: ["models", "routing", "cost"]
external_refs: {}
supersedes: null
superseded_by: null
review_status: reviewed
reviewed_at: 2026-10-01
drafted_by: {"harness":"codex","provider":null,"date":"2026-10-01"}
guards: []
---

# Automatic task-aware model routing with capability floors and cost budgets

| Field | Value |
|---|---|
| Status | proposed; owner requires automatic economical execution, mechanism under review |
| Date | 2026-10-01 |
| Deciders | Ivan Morozov |
| Supersedes / Superseded by | none / none |
| Related | [[automatic-model-strength-discovery-with-expiring-evidence-and-periodic-revalidation]], [[model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review]], [[cross-harness-team-coordination-protocol]], WP-20 |

## Context

The owner requires automatic selection of models for agents: simple tasks may use
cheaper models to reduce token spend; complex computation and architectural choices
need stronger models. Using the strongest model for every edit wastes resources.
The earlier requirement still holds: the strongest eligible participant coordinates
and independently strongest qualified fresh contexts review work.

## Decision drivers

- Allocate models per assignment, not once for an entire epic.
- Price and free access are separate from demonstrated capability.
- Save total expected task cost, including retries and verification overhead.
- Capability, runtime identity, pricing and quota evidence expire independently.
- Preserve authority, review floor, publication fences and explicit cost ceilings.

## Considered options

| Option | Consequence |
|---|---|
| Strongest model for every operation | Simple but wastes cost on mechanical edits |
| Cheapest model by default, escalate after failure | Can expose irreversible/high-risk work before detection |
| Static cheap/strong vendor tiers | Stale, excludes new/free models and conflates price with quality |
| Capability-constrained routing with fresh costs and bounded escalation | Chosen; explicit uncertainty, budget and protected-role invariants |

## Decision

### Role and task boundaries

Separate model strength discovery from assignment routing. Coordinator and final
independent critics always satisfy the strongest qualified role requirement and
historical review floor. A cheap preparatory check cannot substitute for final
review. Architecture/security decisions, migrations, broad uncertain changes and
complex reasoning route to the strongest qualified execution cohort. Routine,
bounded, reversible work may use a lower-cost capable executor.

A task manifest pins goal, acceptance criteria, concrete scope, domain, risk flags,
estimated input/output tokens, tool needs, execution isolation and dependencies.
The acknowledged coordinator approves the manifest using trusted authority events.
Cheap workers cannot lower their own complexity/capability floor. Initial deterministic
rules permit routine classification only for explicit bounded reversible work with
no architectural/security/data-loss/publication flags; missing/conflicting information
is complex/unknown, not routine. File count alone never proves low complexity.
Classification cache binds immutable manifest hash, classifier/routing policy
revision, task-class calibration and evaluation evidence revision/expiry. A policy
or evidence change reclassifies even unchanged text. Worker-supplied descriptions
are untrusted signals; the coordinator records evidence references and can raise
the floor. Changed scope/criteria, new risk or failure invalidates classification.
Account for classification cost too.

### Candidate eligibility and objective

Filter to enrolled available exact model/provider/reasoning identities with fresh
runtime evidence, fresh comparable capability evidence in the task domain, required
tools/isolation and usable provider quota. For complex tasks require the strongest
eligible execution level; routine work still needs an explicit demonstrated
capability floor approved by the coordinator. Unknown capability fails admission;
unknown models require verified calibration. A generic overall leaderboard cannot
prove a task-specific capability or justify a numerical floor by itself. Initial
cheaper-task qualification requires a trusted collector over a pinned versioned
task-class suite: isolated exact invocations, independent strongest acceptance
of fixed criteria, collector-owned unedited outputs/usage and confidence evidence
with expiry. Do not create qualification by accepting hand-written JSON. Until
this collector/evidence is available, the economical router must return a named
capability blocker or the authorized strongest baseline, never fabricate a cheap
qualification. The routing story owns this collector and live proof.

Among eligible executors minimize expected total task cost within the existing
owner budget, rather than per-token sticker price. Estimate input/output, measured
retry risk, context overhead and required strongest verification; disclose estimation
uncertainty. Unsupported reliability data cannot fabricate a success probability:
use a conservative bounded attempt reservation or leave expected cost unknown.
For the initial implementation reserve the full permitted attempts at observed
rates; refinement uses audited task-class outcomes, never self-reported worker scores.
Tie-break deterministically by adequate capability then participant id. Free models
are candidates when identity, quality, quota and tools qualify; zero advertised price
alone cannot qualify them.

Pricing records bind an execution route separately from model authorship: verified
endpoint/origin, opaque billing-account id, product/SKU, API/subscription/free mode,
actual provider/model/configuration and shared quota-pool id. Never log credentials.
One model through different proxies/accounts can have different costs and quotas;
one account used by multiple participants shares the same reservation pool. Rates
carry currency, input/output units, billable reasoning/cache/tool/request charges,
source, observed_at and expires_at. Recheck endpoint tariff/quote and quota before
dispatch; higher liability requires a larger approved reservation or pause. A
tariff snapshot is not a provider guarantee against future in-flight price changes;
strict mode needs a valid quote/maximum-liability guarantee for the invocation.
Use conservative upward rounding and integer
money units rather than float equality for budget ceilings. Discounts/caching/subscription credits
are used only when actual execution mode and rate evidence support them. Unknown
price is not zero and not claimed as economical. Normalize costs to one approved
currency using fresh conversion evidence or avoid cross-currency comparison.
Fresh provider tariffs and local usage history are independent sources; API price
is not silently applied to subscription CLI usage. Deterministic rate parsers and
runtime accounting are adapter capabilities, not arbitrary participant JSON.

### Reservation, execution and escalation

An enforceable invocation envelope caps all model calls, billable input/output
(including hidden reasoning where charged), tools/requests and permitted retries.
Reserve a proven upper bound on maximum liability of every in-flight request,
including charges that continue after local stop/timeout. Estimated token volume
alone is not a hard bound. Task budgets cover classification, coordinator checks,
worker attempts, escalation and final independent review, with remaining stages
reserved before allocating cheaper workers. If the adapter cannot bound actual
liability or control call limits, it reports advisory estimates and cannot claim
strict budget enforcement; strict-budget dispatch pauses. Local stop does not
prove the provider stopped billing.

The authority serializes route decisions and budget reservations before dispatch,
pinning manifest digest, participant/incarnation, actual model, capability/policy,
price and quota revisions, account/quota pool, invocation envelope, attempt ceiling
and maximum authorized spend. Concurrent
assignments cannot each spend the same remaining budget. Actual invocation collector
records usage and releases only proven unused reservation; ambiguous provider timeout
remains reserved until reconciled. Idempotent retries never create duplicate grants. Each attempt additionally has
a persisted invocation nonce and prepared -> dispatching -> running -> settled/
uncertain/aborted state. Consume/reserve the attempt under authority before network
dispatch. Provider idempotency is used only where verified for that endpoint and
exact request. Crash after sending but before receiving invocation id remains
uncertain; without proven no-dispatch/no-liability or provider reconciliation,
never redispatch the same consumed attempt. A new permitted attempt needs another
full liability reservation and capacity within the attempt ceiling. A ledger
that merely deduplicates grant creation does not deduplicate provider billing.
A model switch/fallback requires fresh identity admission and a new or amended grant;
harness/provider defaults cannot silently reroute an approved action.

Failed acceptance, exhausted bounded attempts, expanded scope or stronger required
capability triggers coordinator escalation. Reuse exact evidence and preserve the
worker's changes; do not redo uncertain shared-checkout work concurrently. Escalation
may only maintain/increase capability floors and must fit the residual budget.
If no capable affordable route exists, pause with a concrete budget/evidence blocker;
never weaken review, choose an unqualified cheap model or invent quota. Budgets
are explicit task allocations, and teams in this project share account/quota-pool
reservations in the project authority. This does not enforce account-wide spending
by unrelated projects, machines or direct provider clients. Cross-authority quota
guarantees require provider-backed reservation or an authenticated shared pool
authority; without one the quota claim is advisory and strict global-pool admission
is unsupported. No two authorities may each claim the same allocated quota as
exclusive. State the budget scope in every route decision. Ranking only
chooses among enrolled/authorized endpoints; installing providers or starting billable
sessions outside the owner budget requires separate authorization.

### Periodic freshness

Extend team watch with independent capability, pricing, quota and native-model
inspection schedules. Check freshness again before every dispatch/protected action.
Unchanged evidence extends only proven freshness metadata. A cost change reroutes
queued work or updates reservations before dispatch; it does not by itself change
coordinator strength or discard accepted reviews. Running work follows its spend cap;
limits require a verified runtime stop/usage mechanism, otherwise the adapter cannot
claim budget enforcement. No timer running means expired grants fail on next use.

## Consequences

Simple work can use cheaper/free capable models while strong models retain control
and independent verification. Routing adds evidence collectors and accounting; scarce
quality/pricing/quota evidence can block cheaper candidates. Short tasks may cost more
to classify than they save, so cached deterministic routine classification is preferred.
Public rankings are useful capability evidence but not a complete task-class evaluator.

## Verification and follow-up

Add the linked WP-20 story for schema/router, trusted classification, official tariff
collectors, usage/reservation ledger, provider quotas, runtime identity, periodic
checks and escalation. Tests must cover routine cheap route, complex strongest route,
cheap unqualified refusal, free model with unknown quota, stale price/capability,
budget races, ambiguous timeout, stronger-model escalation, currency mismatch, shared account/quota pools, hidden reasoning/tool charges,
unbounded in-flight liability, exhausted final-review reservation, policy/evidence
classification cache invalidation, model fallback and invariant strongest final critics. The full feature is not
implemented by a pure routing function or unit tests. This story depends on
independent review and reviewed integration; the final live Claude/Codex/OpenCode
story depends on routing too, so release proof cannot omit economical execution.

Cost-saving baseline pins the same task suite, exact acceptance criteria,
strongest supervision/review, execution route and tariff dates; compare the whole
cycle including classification, retries and escalation, with uncertainty reported.
Reduced token price alone is not measured task savings.

Fresh-context critics must review the design before acceptance. Current core tests
and the partial team CLI prove neither real model routing nor billed cost savings.

## Independent review record

Two fresh-context critics examined architecture/backlog. Both first returned revise.
After correction model_transport_critic returned ship; cost_routing_critic reported
all blockers closed and architecture/backlog shippable, with an epic table numeric
reference correction. That table correction was applied; its final response was
interrupted by a usage limit, so no second completed final-verdict message is
claimed. This review does not demonstrate runtime routing, budget enforcement or
measured savings. The decision remains proposed.

Corrections include execution-route/account/shared-pool identity, invocation liability
and full-cycle reservations, classifier cache revision binding, consume-before-
dispatch recovery, task-class collector ownership, compatible capability floors and
an integrated three-harness live acceptance dependency.
