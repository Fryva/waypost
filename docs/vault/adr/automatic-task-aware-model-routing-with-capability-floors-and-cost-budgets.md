---
type: adr
id: "automatic-task-aware-model-routing-with-capability-floors-and-cost-budgets"
title: "Automatic task-aware model routing with capability floors and cost budgets"
status: accepted
date: 2026-10-01
authors: ["Ivan Morozov", "Codex (OpenAI)"]
tags: ["models", "routing", "cost"]
external_refs: {}
supersedes: null
superseded_by: null
review_status: reviewed
reviewed_at: 2026-10-12
drafted_by: {"harness":"codex","provider":null,"date":"2026-10-01"}
guards: []
code_refs: ["scripts/model-routing.mjs", "models/routing.schema.json", "scripts/team-evidence.mjs", "scripts/team-workflow.mjs", "scripts/team-state.mjs", "scripts/team-host.mjs", "scripts/team-cli.mjs", "bin/waypost", "tests/team-routing.test.mjs", "tests/team-evidence.test.mjs", "tests/team-end-to-end.test.mjs", "tests/team-host.test.mjs"]
---

# Automatic task-aware model routing with capability floors and cost budgets

| Field | Value |
|---|---|
| Status | accepted for protocol-1 teams with strict, provider-bounded billing; owner decision 2026-10-12 |
| Date | 2026-10-01 |
| Deciders | Ivan Morozov |
| Supersedes / Superseded by | none / none |
| Related | [[automatic-model-strength-discovery-with-expiring-evidence-and-periodic-revalidation]], [[model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review]], [[owner-assigned-team-roles-by-default-with-calibration-as-an-optional-check]], [[subscription-cli-token-accounting-with-separate-strict-billing-enforcement]], [[native-configuration-profiles-ranked-by-fresh-role-specific-calibration]], [[cross-harness-team-coordination-protocol]], [[story-automatic-model-routing-by-task-complexity-and-expected-cost]], WP-20 |

## Owner acceptance

The owner accepted this ADR on 2026-10-12 after a fresh-context waypost-critic pass
(verdict revise; every required edit applied below) and narrowed it:

- Scope is protocol-1 teams with strict, provider-bounded billing
  (`routing-enable`/`-v2`). Protocol-2 teams (owner-assigned or
  automatic-calibration) and subscription-token accounting are out of scope.
  Extending routing there needs a new ADR.
- Economical routing is no longer a WP-20 release gate.
- The parent ADRs
  [[automatic-model-strength-discovery-with-expiring-evidence-and-periodic-revalidation]]
  and [[subscription-cli-token-accounting-with-separate-strict-billing-enforcement]]
  stay proposed and get their own critic pass later.

## Context

The owner wants automatic selection of models for agents: simple tasks may use
cheaper models to reduce token spend; complex computation and architectural choices
need stronger models. Using the strongest model for every edit wastes resources.
The earlier requirement still holds: the coordinator and final reviewers are
selected by the team's policy, at or above its review floor.

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

### Scope

Applies to protocol-1 teams with strict, provider-bounded billing
(`routing-enable`/`-v2`). Protocol-2 teams (owner-assigned or automatic-calibration)
and subscription-token accounting are out of scope; routing is refused there.
Extending it requires a new ADR defining the interplay with
[[owner-assigned-team-roles-by-default-with-calibration-as-an-optional-check]].
Today the refusal is not a named blocker: `team route` on a protocol-2 policy throws
`routing-task-domain-mismatch` (`scripts/model-routing.mjs`). See Implementation
status.

### Role and task boundaries

Separate model strength discovery from assignment routing. Coordinator and final
independent critics are the participants selected by the team's policy, at or above
its review floor. A cheap preparatory check cannot substitute for final
review. Architecture/security decisions, migrations, broad uncertain changes and
complex reasoning route to the strongest qualified execution cohort in the team's
policy. Routine, bounded, reversible work may use a lower-cost capable executor.

A task manifest pins goal, acceptance criteria, concrete scope, domain, risk flags,
estimated input/output tokens, tool needs and execution isolation. Pinning
dependencies is intended but not implemented (see Implementation status).
The acknowledged coordinator approves the manifest using trusted authority events.
Cheap workers cannot lower their own complexity/capability floor. Initial deterministic
rules permit routine classification only for explicit bounded reversible work with
no architectural/security/data-loss/publication flags; missing/conflicting information
is complex/unknown, not routine. File count alone never proves low complexity.
The proposal emits a cache key that binds immutable manifest hash, classifier/routing
policy revision, task-class calibration and evaluation evidence revision/expiry; no
cache is stored yet. A policy or evidence change changes the key, so unchanged text
is reclassified. Worker-supplied descriptions
are untrusted signals; the coordinator records evidence references and can raise
the floor. Changed scope/criteria, new risk or failure invalidates classification.
Classification is deterministic and free; task-class qualification is the cost that
can exceed savings.

### Candidate eligibility and objective

Filter to enrolled available exact model/provider/reasoning identities with fresh
runtime evidence, fresh comparable capability evidence in the task domain, required
tools/isolation and usable provider quota. For complex tasks require the strongest
eligible execution level; routine work still needs an explicit demonstrated
capability floor approved by the coordinator. Unknown capability fails admission;
in protocol-1 routing, unknown models require verified calibration. A generic overall leaderboard cannot
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
remains reserved until reconciled. The reducer rejects a second reservation of the same grant digest, but a retried
mint creates a new grant: the grant id is random (`scripts/team-evidence.mjs`) and the
request key is random per call (`scripts/team-host.mjs`). Duplicate grants are not
deduplicated; spend stays capped by the shared-pool allocation and the task
budget checked at reservation. Each attempt additionally has
a persisted invocation nonce and prepared -> dispatching -> settled/
uncertain/aborted state (the code has no separate `running` state). Consume/reserve the attempt under authority before network
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
quality/pricing/quota evidence can block cheaper candidates. Classification is
deterministic and free, so short tasks do not pay for it; the cost that can exceed
savings is task-class qualification.
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
independent review and reviewed integration. By owner decision of 2026-10-12
economical routing is not a WP-20 release gate: the final live
Claude/Codex/OpenCode story does not depend on it.

Cost-saving baseline pins the same task suite, exact acceptance criteria,
strongest supervision/review, execution route and tariff dates; compare the whole
cycle including classification, retries and escalation, with uncertainty reported.
Reduced token price alone is not measured task savings.

Fresh-context critics must review the design before acceptance. Current core tests
and the partial team CLI prove neither real model routing nor billed cost savings.

## Implementation status (2026-10-12)

Done: manifest validation, the classifier from declared risk flags, the proposal
(`proposeModelRoute`), the protocol-1 grant/reserve/consume/settle reducer path, the
task-class collector, and host dispatch with injected adapters.

Missing: real billing and usage adapters, escalation, watch schedules, retry and
uncertainty estimation, dependency pinning (absent from `validateManifest` and
`models/routing.schema.json`), reasoning/cache/request charges (the price record has
only input, output and tool units), grant deduplication, and protocol-2 support.
`team route` on a protocol-2 policy throws `routing-task-domain-mismatch` rather than
returning a named blocker; this is a known gap.

Capability floor: `min_passes` is an absolute pass count set by the manifest author,
and Wilson confidence is ignored (`scripts/model-routing.mjs`). The router
therefore does not yet implement the confidence evidence this ADR describes.

Follow-up: `routingDigest` is a shared digest used by about 20 unrelated modules.
Moving it to a neutral module is a possible later cleanup.

## Independent review record

Two fresh-context critics examined architecture/backlog. Both first returned revise.
After correction model_transport_critic returned ship; cost_routing_critic reported
all blockers closed and architecture/backlog shippable, with an epic table numeric
reference correction. That table correction was applied; its final response was
interrupted by a usage limit, so no second completed final-verdict message is
claimed. This review does not demonstrate runtime routing, budget enforcement or
measured savings. The decision remained proposed until the second pass below.

Corrections include execution-route/account/shared-pool identity, invocation liability
and full-cycle reservations, classifier cache revision binding, consume-before-
dispatch recovery, task-class collector ownership, compatible capability floors and
an integrated three-harness live acceptance dependency (dropped as a release
gate on 2026-10-12).

Second pass, 2026-10-12: a fresh-context waypost-critic returned revise. Edits
applied: scope narrowed to protocol-1 strict billing, "strongest" wording tied to the
team's policy, release-gate language replaced by the owner decision, classification
cache described as a key only, implementation status added, the idempotent-retry and
state-machine claims corrected, and code references added. The owner then accepted
the narrowed ADR.
