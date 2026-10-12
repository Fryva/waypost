---
type: adr
id: "native-configuration-profiles-ranked-by-fresh-role-specific-calibration"
title: "Native configuration profiles ranked by fresh role-specific calibration"
status: accepted
date: 2026-10-03
authors: ["Ivan Morozov", "Codex (OpenAI)"]
tags: ["models", "calibration", "identity"]
external_refs: {}
supersedes: null
superseded_by: null
review_status: reviewed
reviewed_at: 2026-10-12
drafted_by: {"harness":"codex","provider":null,"date":"2026-10-03"}
guards: []
code_refs: ["scripts/team.mjs", "scripts/team-evidence.mjs", "scripts/model-strength.mjs", "scripts/team-cli.mjs", "scripts/team-state.mjs", "scripts/team-host.mjs", "scripts/team-transport.mjs", "models/strength-sources.json", "scripts/native-model-profile.mjs", "scripts/team-role-suite.mjs", "scripts/team-role-calibration.mjs", "scripts/team-native-action.mjs", "scripts/team-model-inventory.mjs", "scripts/team-implement-suite.mjs", "tests/native-model-profile.test.mjs", "tests/calibration-policy.test.mjs", "tests/native-policy-state.test.mjs", "tests/native-action-profile.test.mjs", "tests/team-role-suite.test.mjs", "tests/team-role-calibration.test.mjs", "tests/team-model-inventory.test.mjs"]
---

# Native configuration profiles ranked by fresh role-specific calibration

| Field | Value |
|---|---|
| **Status** | accepted |
| **Date** | 2026-10-03 |
| **Authors** | Ivan Morozov, Codex (OpenAI) |

---

## Scope

Identity rules apply to every protocol-2 team. Ranking by calibration applies
only to `automatic-calibration` teams. Owner-assigned teams take priorities from
the owner's order
([[owner-assigned-team-roles-by-default-with-calibration-as-an-optional-check]]).

## Owner acceptance

The owner accepted this ADR on 2026-10-12 after a fresh-context waypost-critic pass
(verdict accept-with-edits; every edit applied below) and decided its scope:

- One ADR, slug unchanged. Identity rules cover every protocol-2 team; ranking by
  calibration covers only `automatic-calibration` teams.
- Rebaseline means a new team.
- The `unqualified-...-baseline` labels (see Decision) are the current arrangement.
  A per-task-class coverage gate is a possible future, not a requirement.
- The parent ADRs
  [[automatic-model-strength-discovery-with-expiring-evidence-and-periodic-revalidation]]
  and [[subscription-cli-token-accounting-with-separate-strict-billing-enforcement]]
  stay proposed and get their own critic pass later.

## Amends (protocol 2 only)

This ADR changes three clauses of the accepted team ADR
([[model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review]])
for protocol 2. Protocol 1 keeps them as written.

- "An owner-approved policy ranks exact model/provider/reasoning descriptors":
  protocol 2 also admits typed `native-configuration` profiles whose author and
  effective reasoning may be unknown.
- "Unknown models stay unclassified": an unknown configuration is classified by its
  own observed profile, never by borrowing a published model's rank. Legacy
  `unknown` descriptors stay unclassified.
- "Old proposals/results cannot advance state without explicit adoption": a policy
  change in protocol 2 happens only on an idle team (see Decision).

The accepted tool-surface ADR
([[harness-tool-surfaces-bound-by-evidence-instead-of-an-empty-tool-list]])
extends this ADR's execution scope: a native profile's tools and permissions are the
bounded surface observed under that ADR (for Codex, `codex-no-exec-r1`).

## Context

The owner requires automatic changing model-strength discovery, including free
models from different providers, periodic revalidation and economical workers
with strongest independent oversight. Installed native clients do not always
expose an exact provider/model/effective-reasoning tuple. Claude 2.1.286 can silently
clamp requested effort; the inspected streaming schema does not prove actual
effort. OpenCode 1.18.33 reports routing IDs; its selected variant is not proof of
backend reasoning or model authorship. Missing identity is a real observation,
not permission to borrow a published known-effort model's rank.

On 2026-10-10 the owner decided that owner assignment is the default way to fill
team roles and calibration is an optional check
([[owner-assigned-team-roles-by-default-with-calibration-as-an-optional-check]]).
This ADR therefore keeps its identity rules for every protocol-2 team and limits
calibration ranking to teams that choose `automatic-calibration`.

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
accept only exact tuples; new fields cannot bypass its validation. In an automatic-calibration team, policy 2
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
unchanged hidden backend. State this limitation in every observation's
`limitations` and every calibrated policy's.

In an automatic-calibration team, profiles acquire priorities only from their own fresh common cohort calibration,
never by transferring a published model's unknown effort or authorship. Compare
only one role-specific benchmark, revision and grading scale. Reuse the existing
confidence-interval partial order; overlapping intervals remain an uncertainty
frontier. Do not combine Arena and local scores numerically or equate ties with
identical ability. Selection means strongest measured eligible configuration in
that cohort, with limitations exposed. This holds for coordinate and review. Implement
is a gate, not a rank: its priority stays null (`scripts/team.mjs`). Ties within an
overlapping frontier fall back to participant-id order
(`scripts/team-native-work.mjs`), which is not a strength order.

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

In an automatic-calibration team, bounded measurement admission may precede ranking. It uses the existing owned
read-only native bootstrap, reserve/consume/terminal accounting and uncertainty
rules. It grants no task execution, review or publication permission. Failure or
incomplete accounting retains holds. No strongest reviewer is needed to grade
an objective synthetic answer key. Review of project work still needs a separate
fresh context and immutable target evidence. Until task-class qualification
exists, the current arrangement is a labelled baseline: execution and review
carry the labels `unqualified-strongest-baseline`
(`scripts/team-native-work.mjs`) and
`unqualified-strongest-protocol-review-baseline`
(`scripts/team-native-work-review.mjs`), by owner decisions of 2026-10-06 and
2026-10-07. A label states that the choice is not backed by task-class
qualification. A per-task-class coverage gate is a possible future, not a
requirement.

Periodically discover native available model candidates, then refresh observations,
the model inventory and quota separately. Enrollment/checkpoints may request a due
refresh; only an actually running driver/watch supplies background execution.
Re-reading unchanged evidence does not renew its measurement time. Source outage,
native failure or budget exhaustion cannot silently keep a stale profile eligible.
Calibration is never renewed automatically: once it expires the team is blocked
(`native-calibration-expired-new-measurement-required`) until the owner opens and
approves a new cohort (`scripts/team-cli.mjs`).
A policy changes only on an idle team with no leader, no unfinished work and no
pending runtime, and a team keeps one mode for life (`assertNativeIdle` and the
mode-switch refusals in `scripts/team-state.mjs`).
In an automatic-calibration team, historical independent-review floors are preserved by versioned typed review
identities/admissions, not fabricated provider/model/reasoning tuples. A new policy
must cover every historical strongest requirement with fresh comparable review
calibration in its current benchmark/cohort. Missing, stale or incomparable
coverage blocks final review. Numeric priorities cannot transfer across scales.
Changing suite, cohort or identity kind does not remove a historical requirement;
removal requires explicit action-bound owner rebaseline, never automatic refresh.
Rebaseline means a new team.
Public exact tuples and local profiles can share a ranking only through a common
calibration. Otherwise the transition remains blocked.


Price/free availability are separately sourced, expiring observations. Unknown
billing remains unknown under inherited-native accounting; catalog zero price is
not a provider-enforced invoice or unlimited quota. Economical routing needs
comparable whole-cycle estimates and task qualification before choosing a cheaper
worker. In an automatic-calibration team, strongest coordination and independent
verification remain required.

## Consequences

This permits empirical comparison of usable routes while preserving the meaning
of unknown identity. Hidden backend configuration remains partly unobservable;
measurements are conditional evidence, not an identity certificate. Discovery,
role-specific calibration and evidence transfer are installed code.

An exhausted strongest participant may trigger the existing handover mechanism,
but this ADR does not lower stored review requirements or silently accept weaker
critique. Changes to that accepted invariant require a separate owner decision.

## Implementation status (2026-10-12)

Protocol 2 is live. The contract is implemented in `scripts/native-model-profile.mjs`
(profiles and observations), `scripts/team-role-suite.mjs` and
`scripts/team-implement-suite.mjs` (fixed suites), `scripts/team-role-calibration.mjs`
(trusted calibration matching), `scripts/team-model-inventory.mjs` (inventory),
`scripts/team-native-action.mjs` (action profiles) and the policy install in
`scripts/team-state.mjs`.

- Cohort of 2026-10-07: first complete live cohort (Claude Code, OpenCode, 24 cases
  per role). No profile qualified as coordinator, so `native-policy-install` refused.
- Cohorts of 2026-10-08/09: a three-harness team went through calibration, policy
  install, leader acknowledgement, execution, independent review and a pinned
  publication. Calibration spent about 2.25M tokens; the team's own work about 21K.
- Joint cohort of 2026-10-09: all three roles, 72 trials per member, 216/216 settled
  (Claude Code, OpenCode, Codex under `codex-no-exec-r1`).
- Results swing between days: Claude opus-5-5 qualified for review at 22/24 on
  2026-10-08 and scored 21/24 (not qualified) in the joint cohort the next day.
  Calibration measures a finite, correlated suite. It separates qualified from not;
  it does not rank finely.

Facts and commits are in the live record of
[[story-participant-identity-and-owner-approved-model-policy]]. Owner-assigned teams
(2026-10-11) run without any calibration.

Tests cover legacy unknown-unranked behavior, unminted profiles, score borrowing,
changed profiles, stale calibration, edit-only promotion, admission before native
calls and unknown usage retention (`tests/native-model-profile.test.mjs`,
`tests/calibration-policy.test.mjs`, `tests/native-policy-state.test.mjs`,
`tests/native-action-profile.test.mjs`, `tests/team-role-suite.test.mjs`,
`tests/team-role-calibration.test.mjs`, `tests/team-model-inventory.test.mjs`).

Out of scope here: economical qualified dispatch
([[automatic-task-aware-model-routing-with-capability-floors-and-cost-budgets]]).

## Open questions

- Codex `effective_reasoning` is observed from `thread.reasoningEffort`
  (`scripts/team-transport.mjs`, `scripts/native-model-profile.mjs`). The thread may
  echo the requested `model_reasoning_effort` that the transport itself sets. That
  strains "requested settings never become observed settings".
- "Trusted collector" means whoever holds the collector credential
  (`collector.json`, `scripts/team-cli.mjs`). The ADR defines no stronger trust root.

## Independent review record

- 2026-10-03: fresh independent critique revised the protocol/action and
  historical-floor contracts, then returned scoped ship (design review only).
- 2026-10-12: fresh-context waypost-critic pass, verdict accept-with-edits. Edits
  applied: scope split between identity rules and calibration ranking, the owner
  decision of 2026-10-10 in Context, automatic-calibration prefixes, labelled
  baselines, expiry and policy-change rules, amended team-ADR clauses and the
  implementation status above. The owner then accepted the ADR.

## References

- [[model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review]]
- [[automatic-model-strength-discovery-with-expiring-evidence-and-periodic-revalidation]]
- [[subscription-cli-token-accounting-with-separate-strict-billing-enforcement]]
- [[owner-assigned-team-roles-by-default-with-calibration-as-an-optional-check]]
- [[harness-tool-surfaces-bound-by-evidence-instead-of-an-empty-tool-list]]
- [[objective-native-configuration-calibration-for-protocol-roles]]
- [Claude effective effort limitations](https://code.claude.com/docs/en/model-config)
- [OpenCode selected configuration](https://github.com/anomalyco/opencode/blob/v1.18.33/packages/opencode/src/session/prompt.ts)
- [OpenCode model variants](https://opencode.ai/docs/models/)
- [OpenCode model discovery endpoints](https://opencode.ai/docs/server/)

---

*Last updated: 2026-10-12*
