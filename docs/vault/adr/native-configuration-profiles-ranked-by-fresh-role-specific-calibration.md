---
type: adr
id: "native-configuration-profiles-ranked-by-fresh-role-specific-calibration"
title: "Native configuration profiles ranked by fresh role-specific calibration"
status: proposed
date: 2026-10-03
authors: ["Ivan Morozov", "Codex (OpenAI)"]
tags: ["models", "calibration", "identity"]
external_refs: {}
supersedes: null
superseded_by: null
review_status: reviewed
reviewed_at: 2026-10-03
drafted_by: {"harness":"codex","provider":null,"date":"2026-10-03"}
guards: []
code_refs: ["scripts/team.mjs", "scripts/team-evidence.mjs", "scripts/model-strength.mjs", "scripts/team-cli.mjs", "scripts/team-state.mjs", "scripts/team-host.mjs", "scripts/team-transport.mjs", "models/strength-sources.json"]
---

# Native configuration profiles ranked by fresh role-specific calibration

| Field | Value |
|---|---|
| **Status** | proposed |
| **Date** | 2026-10-03 |
| **Authors** | Ivan Morozov, Codex (OpenAI) |

---

## Context

The owner requires automatic changing model-strength discovery, including free
models from different providers, periodic revalidation and economical workers
with strongest independent oversight. Installed native clients do not always
expose an exact provider/model/effective-reasoning tuple. Claude 2.1.286 can silently
clamp requested effort; the inspected streaming schema does not prove actual
effort. OpenCode 1.18.33 reports routing IDs; its selected variant is not proof of
backend reasoning or model authorship. Missing identity is a real observation,
not permission to borrow a published known-effort model's rank.

The existing model identity gates consistently leave these configurations
unclassified. Simply removing their checks would create unverified privileges.
Subscription token bootstrap now measures usage separately from identity/rank;
that does not itself solve coordinator/critic selection.

## Decision drivers

- Automatically measure usable native configurations without inventing identity.
- Keep legacy exact-tuple, review independence and authority fencing unchanged.
- Keep strength, advertised price/free access, native quota and usage separate.
- Compare one benchmark revision and cohort; preserve uncertainty and expiry.
- Bootstrap grading must not depend on an already elected strongest critic.

## Considered options

| Option | Consequence |
|---|---|
| Treat requested effort/route ID as effective reasoning/authored provider | Invents runtime facts; rejected |
| Permanently exclude every unknown configuration | Blocks the owner's multi-provider workflow despite measurable outcomes |
| Weaken the existing exact identity gate | Reinterprets previous evidence and privileges; rejected |
| Add independently calibrated native configuration profiles | Proposed additive contract; measures the configuration without claiming hidden identity |

## Decision

Add a versioned identity kind `native-configuration`, explicitly enabled by owner
policy. Preserve old descriptors and their exact matching; never reinterpret
legacy `unknown` as a known model or apply an Arena row through a wildcard.
The proposed contract is not activated by drafting this ADR.

The new descriptor/policy/action schema uses protocol 2 with typed identity keys,
an immutable profile revision and canonical digest. Protocol 1 continues to
accept only exact tuples; new fields cannot bypass its validation. Policy 2
records allowed roles and benchmark coverage separately from numeric priorities.
A role without current qualified coverage returns null, even if a row has a zero
or positive score. Every protected action, grant and immutable review binds the
current observation, profile, calibration and policy revisions plus its action
nonce; changes invalidate outstanding permissions through existing fences.


A profile has a separate `profile_id`, harness and observed version, adapter
revision, native routing/model IDs, execution scope (tools, permissions, context and observable environment), requested configuration
digest and separately observed fields. Backend author and effective reasoning
may remain unknown. Caller nonce, owned native context/message and manifest bind
each observation. Only trusted installed collectors mint observations; participant
JSON cannot mint identity, scores or eligibility.

Requested settings never become observed settings. Version, route/model ID,
configuration or observable environment changes invalidate profile evidence and
unused permissions. An unchanged requested digest does not detect a remote alias
replacement or silent clamp. Transfer to another scope needs a fresh bound
observation; equivalence means the same observed configuration, not proof of an
unchanged hidden backend. State this limitation in every policy's provenance.

Profiles acquire priorities only from their own fresh common cohort calibration,
never by transferring a published model's unknown effort or authorship. Compare
only one role-specific benchmark, revision and grading scale. Reuse the existing
confidence-interval partial order; overlapping intervals remain an uncertainty
frontier. Do not combine Arena and local scores numerically or equate ties with
identical ability. Selection means strongest measured eligible configuration in
that cohort, with limitations exposed.

Use installed fixed synthetic suites and objective local grading, not model
self-ratings or an uncalibrated LLM judge. Coordination/review coverage needs its
own benchmark: bounded edit qualification cannot authorize those roles. Initial
coordination cases should check dependency ordering, leases, authority epochs and
independent reviewer choice. Initial review cases should detect seeded defects
and reject clean/irrelevant findings against a trusted answer key. Seeds, suite,
cohort, role coverage, samples and grading digest are fixed before native calls.
Publish finite-suite, correlated-trial and overfitting limitations; do not claim
open-ended architectural ability merely from small fixture success. Required
coverage and capability floors remain explicit gates for each actual task class.
Read-only synthetic qualification does not confer workspace-write capability.
The installed suite specification must fix minimum independent samples, confidence
calculation and treatment of failures/abstentions before calls; no caller can
choose those values after seeing answers.

Bounded measurement admission may precede ranking. It uses the existing owned
read-only native bootstrap, reserve/consume/terminal accounting and uncertainty
rules. It grants no task execution, review or publication permission. Failure or
incomplete accounting retains holds. No need for a strongest reviewer to grade
an objective synthetic answer key; review of project work still requires a
separate fresh strongest qualified context and immutable target evidence.

Periodically discover native available model candidates, then refresh observations,
calibration and quota separately. Enrollment/checkpoints may request a due refresh;
only an actually running driver/watch supplies background execution. Re-reading
unchanged evidence does not renew its measurement time. Source outage, native
failure or budget exhaustion cannot silently keep a stale profile eligible.
Policy changes use existing quiescence, epoch, handover and adoption fences.
Historical independent-review floors are preserved by versioned typed review
identities/admissions, not fabricated provider/model/reasoning tuples. A new policy
must cover every historical strongest requirement with fresh comparable review
calibration in its current benchmark/cohort. Missing, stale or incomparable
coverage blocks final review. Numeric priorities cannot transfer across scales.
Changing suite, cohort or identity kind does not remove a historical requirement;
removal requires explicit action-bound owner rebaseline, never automatic refresh.
Public exact tuples and local profiles can share a ranking only through a common
calibration. Otherwise the transition remains blocked.


Price/free availability are separately sourced, expiring observations. Unknown
billing remains unknown under inherited-native accounting; catalog zero price is
not a provider-enforced invoice or unlimited quota. Economical routing needs
comparable whole-cycle estimates and task qualification before choosing a cheaper
worker. Strongest coordination and independent verification remain required.

## Consequences

This permits empirical comparison of usable routes while preserving the meaning
of unknown identity. Hidden backend configuration remains partly unobservable;
measurements are conditional evidence, not an identity certificate. Discovery,
role-specific calibration and evidence transfer need installed code. Existing
bounded-edit calibration and CLI refresh do not yet implement this new contract.

An exhausted strongest participant may trigger the existing handover mechanism,
but this ADR does not lower stored review requirements or silently accept weaker
critique. Changes to that accepted invariant require a separate owner decision.

## Verification and follow-up

Fresh independent critique revised the protocol/action and historical-floor
contracts, then returned scoped ship on 2026-10-03. This is design review, not
owner acceptance or an implementation claim.

Fresh independent critique precedes implementation. Tests must preserve legacy
unknown-unranked behavior, reject unminted profiles, prevent known-effort score
borrowing, invalidate changed profiles and stale calibration, reject edit-only
coordinator/reviewer promotion, keep admission before native calls and retain
unknown usage. Verify exact separate reviewer contexts and existing review floors.

Implementation stages: versioned profile/schema and collector; objective common
role suites and grading; trusted calibration matching; native model inventory;
CLI enrollment/checkpoint/watch integration; economical qualified dispatch and
full cross-harness immutable review/integration. Live tests use owned synthetic
contexts first. This ADR and these stages remain proposed/pending; no story closes.

## References

- [[model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review]]
- [[automatic-model-strength-discovery-with-expiring-evidence-and-periodic-revalidation]]
- [[subscription-cli-token-accounting-with-separate-strict-billing-enforcement]]
- [Claude effective effort limitations](https://code.claude.com/docs/en/model-config)
- [OpenCode selected configuration](https://github.com/anomalyco/opencode/blob/v1.18.33/packages/opencode/src/session/prompt.ts)
- [OpenCode model variants](https://opencode.ai/docs/models/)
- [OpenCode model discovery endpoints](https://opencode.ai/docs/server/)

---

*Last updated: 2026-10-03*
