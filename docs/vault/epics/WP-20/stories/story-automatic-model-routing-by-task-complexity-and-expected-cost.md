---
type: story
id: "story-automatic-model-routing-by-task-complexity-and-expected-cost"
epic: "WP-20"
title: "Automatic model routing by task complexity and expected cost"
status: planned
priority: p1
assignee: "Ivan Morozov"
created: 2026-10-01
updated: 2026-10-01
external_refs: {}
tags: ["models", "routing", "cost"]
code_refs: ["scripts/model-routing.mjs", "models/routing.schema.json", "scripts/team-state.mjs", "scripts/team-cli.mjs", "tests/team-routing.test.mjs", "tests/team-cli.test.mjs", "docs/team-coordination.md", "scripts/team-evidence.mjs", "scripts/team-host.mjs", "scripts/team-workflow.mjs", "tests/team-evidence.test.mjs", "tests/team-end-to-end.test.mjs", "scripts/team-subscription.mjs", "tests/team-subscription.test.mjs"]
specs: ["cross-harness-team-coordination-protocol"]
started_at: null
closed_at: null
plan_updated_at: null
blocked_by: ["WP-20/story-participant-identity-and-owner-approved-model-policy", "WP-20/story-local-authority-log-and-crash-safe-mutations", "WP-20/story-assignments-supervision-and-stronger-model-handover", "WP-20/story-independent-strongest-model-review-of-immutable-evidence", "WP-20/story-reviewed-integration-and-team-aware-story-gates"]
---

# Automatic model routing by task complexity and expected cost

| Field | Value |
|---|---|
| Epic | [One task coordinated across harnesses and AI models](../epic.md) (WP-20) |
| Status | planned |
| Priority | p1 |

## Description

Automatically allocate a capable economical executor for each assignment while
retaining strongest coordinator and independent final critics. Use the task-aware
routing ADR and spec contracts, not vendor-name or price heuristics.

## Decomposition

- [ ] Task/routing/pricing/quota schemas and trusted manifest classification.
- [ ] Trusted task-class evaluation collector: versioned fixed suite, exact isolated
      invocations, strongest independent criteria checks, provenance/CI/expiry.
- [ ] Capability-constrained deterministic route and fresh automatic tariff collectors.
- [ ] Serialized cost reservation, actual usage collector and timeout reconciliation.
- [ ] Periodic freshness, queued rerouting and bounded stronger-model escalation.

## Implementation Plan

Pending the fresh-planner gate after dependencies. Ground the plan in current
team authority/model evidence, provider adapters and existing heavy-job budgets.

Owner-selected extension (2026-10-02): separate subscription native-token/quota
accounting from provider-enforced strict monetary mode. Two independent design
passes reviewed the new ADR and bootstrap contract. First implement versioned
subscription ledger/normalizers in the existing authority, then same-context native
account/route collectors and a bounded owner-authorized identity/calibration probe.
Do not weaken legacy strict proof or claim worker routing from this foundation.

## Acceptance Criteria

- [ ] A bounded routine task chooses the cheapest qualified authorized executor;
      a complex architecture task chooses the strongest execution cohort.
- [ ] Cheap/free models with unknown capability, identity, price or quota never
      inherit qualification; a configured free capable model can be selected.
- [ ] Task authors cannot lower their classification; changed scope/criteria and
      failures escalate without weakening final strongest independent review.
- [ ] Official price refresh handles unit/currency/execution mode and expiry;
      unchanged price freshness preserves leader/work/review revisions.
- [ ] Classification cache is invalidated by classifier/calibration/evidence
      changes; untrusted worker text cannot lower floors.
- [ ] Endpoint/account/SKU identity separates proxy/free/subscription pricing;
      shared account/quota pool cannot be reserved independently per participant.
- [ ] Hard invocation/liability bounds include hidden reasoning/tool charges and
      coordinator/final-review stages; strict budget blocks unbounded providers.
- [ ] Project-wide shared budget/pool races across teams are refused; cross-authority
      quota guarantees require a verified shared/provider reservation, not stale observations.
- [ ] Consume invocation attempts before provider dispatch; crash after send before
      invocation-id receipt cannot redispatch/rebill the same attempt. Tariff
      increase before dispatch re-reserves or pauses; strict mode blocks unbounded
      in-flight price changes.
- [ ] Concurrent dispatch cannot double spend a budget; timeout keeps uncertain
      usage reserved; model fallback requires a new bound grant.
- [ ] Live isolated sessions demonstrate routine/complex routes, actual selected
      models with collector-measured task-class qualification (no fixture-only
      forged qualification), bounded escalation and observed whole-cycle cost
      versus equal-quality baseline; tests
      alone are not claimed as savings or runtime enforcement.

Additional subscription-mode acceptance (additive to strict requirements above):

- [ ] Owner opt-in pins mode/allocation/counter revisions; unfinished strict or
      subscription operations cannot be reinterpreted during migration.
- [ ] Bounded read-only bootstrap records requested vs observed identity without
      granting coordinator/worker/reviewer privileges; unknown quota is not available.
- [ ] Same inference context proves pre/post account/origin/auth mode and refuses
      unauthorized API/credit fallback. A separate quota observer cannot substitute.
- [ ] Native coverage/cumulative counters account each span once; missing/partial
      usage retains uncertain reservations, and observed overshoot records truthfully.
- [ ] Terminal accounting after epoch/allocation/quota changes grants no new calls;
      strongest final review is replenished or waits, never omitted.
- [ ] Whole-cycle native-token estimates are scoped comparably; unlike counters
      are not monetary invoices or exclusive provider quota reservations.

## Final Summary

Pending implementation and independent review. No runtime cost savings claimed.

## Dependencies

Participant evidence, serialized authority and reconciled assignments/handover.

## Attachments

- [[automatic-task-aware-model-routing-with-capability-floors-and-cost-budgets]]
- [[subscription-cli-token-accounting-with-separate-strict-billing-enforcement]]
- [[automatic-model-strength-discovery-with-expiring-evidence-and-periodic-revalidation]]

## Prototype and planner evidence

A fresh planner grounded the narrow classifier/proposal/CLI foundation in the
existing team model/reducer/authority seams. The story remains planned because
its lifecycle dependencies are not completed. The first executable prototype
validates/digests manifests, conservatively classifies risks, proposes qualified
model/cost choices with integer ceilings, and exposes read-only route diagnostics.
A new routing-enable transition prevents legacy assignment bypass; versioned
routed assignment refuses dispatch without collector/reservation installation.
No synthetic evidence is loaded by the runtime CLI. Actual collector, reservations,
invocation recovery, escalation and live savings remain acceptance work.

Fresh reviewer found legacy work.routing metadata could break old work-ack replay;
the guard was restricted to explicitly enabled routing and a legacy assign/ack
regression added. Proposal cache now binds actual evidence fingerprints/expiry;
malformed records block one candidate. These changes await test results and the
reviewer's scoped confirmation; they do not close the full story.
