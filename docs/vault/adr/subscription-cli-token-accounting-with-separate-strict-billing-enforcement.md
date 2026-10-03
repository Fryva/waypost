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
reviewed_at: 2026-10-02
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
New subscription mode requires an owner choice and adapter-observed subscription
route/account binding. User JSON, a UI badge, a model's name or a successful MCP
handshake cannot establish that binding. It must describe the actual execution
context before and after its call, including effective origin and auth mode.
A separate quota observer is not execution-route proof. API credentials,
paid-credit fallback or rerouting require separate owner authorization; an
unchanged model id cannot conceal a billing-mode change. Unsupported routes
return named blockers.

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
account/route fingerprint, epoch, purpose, evidence revisions and attempt nonce
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
reconciliation proof. Actual-model fallback requires new admission.

Provider quota observations remain independent of token budgets. Confirmed
exhaustion drives the existing safe role handover. Expiry or a reset timestamp does
not restore availability; fresh positive proof is required. Missing model/pool
scope stays unknown. Local accounting cannot reserve global quota against unrelated
clients or other machines. Never claim an exclusive provider quota reservation.

Break the bootstrap cycle with an owner-authorized bounded read-only admission
for identity inspection and fixed synthetic calibration only. It pins the owned
endpoint, authenticated execution account/mode, purpose, suite digest, local token
estimate, call/attempt ceiling and timeout before the call. Missing strongest rank
or task-class qualification cannot block this measurement admission, but it grants
no coordination, execution, review or publication privilege. Unknown model-scope
quota is labelled unknown and permits only an explicitly authorized bootstrap probe;
known exhaustion still refuses. Preserve uncertain outcomes and compare pre/post
route/account. Only actual receipts and trusted grading can promote the observed tuple.

An adapter receipt states its native counter schema, execution context and invocation,
coverage, observed model, pre/post route/account and counter boundaries. Cumulative
counters need a verified baseline and terminal snapshot from the same context;
subtract once, reject decreases and do not add cached/reasoning subsets twice.
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

*Last updated: 2026-10-02*

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
