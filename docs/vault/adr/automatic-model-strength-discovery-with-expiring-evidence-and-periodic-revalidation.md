---
type: adr
id: "automatic-model-strength-discovery-with-expiring-evidence-and-periodic-revalidation"
title: "Automatic model strength discovery with expiring evidence and periodic revalidation"
status: accepted
date: 2026-09-30
authors: ["Ivan Morozov", "Codex (OpenAI)"]
tags: ["models", "coordination"]
external_refs: {}
supersedes: null
superseded_by: null
code_refs: ["scripts/model-strength.mjs","models/strength-sources.json","models/policy.schema.json","scripts/team.mjs","scripts/team-state.mjs","scripts/team-store.mjs","scripts/team-cli.mjs","tests/model-strength.test.mjs","tests/team-periodic.test.mjs"]
review_status: reviewed
reviewed_at: 2026-10-12
drafted_by: {"harness":"codex","provider":null,"date":"2026-09-30"}
guards: [{"check": "node --test tests/model-strength.test.mjs tests/team-periodic.test.mjs", "why": "source bounds, partial order, freshness-only refresh"}]
---

# Automatic model strength discovery with expiring evidence and periodic revalidation

| Field | Value |
|---|---|
| Status | accepted for protocol-1 teams in `mode: automatic`; owner decision 2026-10-12 |
| Date | 2026-09-30 |
| Deciders | Ivan Morozov: automatically discover changing model strength, including free models; periodically recheck actuality |
| Supersedes / Superseded by | none / none |
| Related | [[model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review]], [[owner-assigned-team-roles-by-default-with-calibration-as-an-optional-check]], [[native-configuration-profiles-ranked-by-fresh-role-specific-calibration]], WP-20 |

## Owner acceptance

The owner accepted this ADR on 2026-10-12 after a fresh-context waypost-critic pass
(verdict revise; every required edit applied below) and narrowed it:

- Scope is protocol-1 teams with `mode: automatic`. The slug stays.
- Protocol-1 `manual` policy remains equally valid.
- It is not a WP-20 release gate.
- Rebaseline means a new team.
- Follow-ups, not done here: delete the unwired `parseCalibration`
  (`scripts/model-strength.mjs`), which accepts unauthenticated JSON; throttle the
  watch writes only if protocol-1 automatic gets real use; give the placeholder
  source a distinct id.

## Scope

Only protocol-1 `automatic` policies. Not the default way to fill roles: protocol-2
teams use owner assignment by default or automatic calibration
([[owner-assigned-team-roles-by-default-with-calibration-as-an-optional-check]],
[[native-configuration-profiles-ranked-by-fresh-role-specific-calibration]]); protocol-1
`manual` stays valid. Arena never ranks a protocol-2 profile; refresh/watch runs no
discovery for protocol 2. The interval partial order is shared with protocol-2
calibration (`tiers`). Not a WP-20 release gate.

Amends [[model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review]]:
its "An owner-approved policy ranks..." now allows an automatic alternative in protocol 1.

## Context

The initial team design supported owner-approved priority data. During implementation
on 2026-09-30 the owner explicitly required automatic determination because models
change continuously and sessions may use free models from different providers.
The owner also required periodic freshness checks. Approval now applies to the
selection algorithm/source policy, not a manually maintained list of model priorities.
The accepted task authority/independent-review architecture is unchanged.

## Decision drivers

- In a protocol-1 automatic team, no manual ordering.
- Discover new exact model identities without a vendor-specific ranking branch.
- Price, free access and vendor do not imply capability.
- Sources and evaluation dates must be visible; uncertainty must survive selection.
- Current model identity and published strength evidence are separate observations.

## Considered options

| Option | Consequence |
|---|---|
| Hard-coded model family tiers | Stale immediately and excludes new/free models; rejected |
| Ask owner to sort models every time | Contradicts the automatic requirement; rejected for protocol-1 automatic teams. Owner assignment is the default for protocol-2 teams since 2026-10-10; in protocol 1, `manual` remains an alternative |
| Rank model price or vendor claims | No defensible capability evidence; rejected |
| Public evaluator registry, exact matching, bounded expiring cache, calibration when unknown | Chosen; transparent incomplete coverage rather than invented certainty |

## Decision

Use registry-defined public evaluator feeds, starting with the official Arena
leaderboard dataset's agent subset. Bounded HTTPS requests have timeout, payload,
row/pagination and redirect restrictions. Preserve publication date, source URL,
retrieval time and row digests. Data newer than allowed clock bounds or older than
publication TTL cannot qualify. Cached retrieval has a separate refresh interval.

Within one comparable evaluation scale, confidence intervals define a partial
order: A dominates B only when A.lower > B.upper. Successive non-dominated
frontiers form priority levels; overlap is uncertainty, never transitive equality.
Larger priority means stronger evidence, but priority levels flatten the partial order: overlapping intervals may still get different levels. Agentic overall scores are a
proxy for coordination/implementation/review, not proof of any one role; the source
registry records that limit; policies and checks do not carry it. Do not numerically combine unrelated leaderboard scales. Source choice
is deterministic and reported. Exact model/provider/reasoning identity matching
allows unique spelling normalization preserving all letters, digits and version
suffixes; no fuzzy family/date truncation. Evidence-backed aliases can extend
coverage. Unknown models require a bound calibration/evaluation result, never a
participant's unverified self-reported score. Protocol-1 unknown-model calibration has no
collector; the CLI passes none.

Automatically generated policies have mode automatic, generated_at, expires_at
and source provenance; no fabricated owner approval. The target workflow refreshes on enrollment/checkpoints and by an explicitly
running team watch. The current CLI implements refresh/watch; automatic enrollment
and checkpoint triggers remain implementation work. Default public
feed refresh interval is 24h, publication TTL seven days; CLI polling cadence can
be shorter and reuses cache within source refresh interval. No process running
means no background timer: a stale policy blocks protected selection on next use.
A periodic identity inspector must separately query enrolled native endpoints;
if inspection is unavailable, report unsupported/cooperative identity evidence.
Refreshing a leaderboard does not prove a session kept its execution model.
Store bounded source rows and row proofs in the authority so process restart does
not forget retrieval age. An unchanged rank refresh only updates freshness and
check metadata, retaining policy revision, leader epoch, assignments and reviews.
Changed priorities use the policy transition and handover fences. Network errors
record a failed check without extending expiry; authority contention retries.
The authority stamps accepted event time under its mutex; caller timestamps cannot
backdate protected actions, while replay uses the stored authority timestamp.

Every changed policy/model revision invalidates unaccepted privileges/reviews;
stronger eligible arrival uses acknowledged handover. Review requirement preserves
historically qualified model identities independently of availability. Across
source/policy revisions recompute their score on the new scale; never compare old
raw score to a new metric version. Missing former strongest identity blocks final
review rather than silently lowering it. Acceptance order remains serialized by
the task authority and publication fence.

## Consequences

Publicly measured models, including free/open models, can be ranked without
operator intervention. Ranking needs every identity (joined, revoked, left,
historical) to match one fresh row. One unclassified identity blocks install/refresh
and the policy lapses within the refresh interval. The alias registry is empty;
dotted-version IDs (e.g. `claude-opus-5-5` vs `Claude Opus 5.5`) and `unknown`
reasoning stay unclassified. Overlapping frontier intervals usually form one tier.
External source outages reduce availability. Credential/model introspection and
native delivery remain separate adapter evidence. One public source cannot claim
universal model coverage or definitive reviewer quality. Rebaseline means a new team.

`team create` without `--policy` installs a one-hour placeholder with no profiles;
its `retrieved_at` is creation time, not a retrieval.

## Verification and follow-up

- Tests cover stale/future/malformed data, row totals, pagination (tested on a single
  page), exact identities, uncertainty ties, free models and periodic cache expiry.
- Live read-only discovery on 2026-09-30 retrieved the official latest agent JSON rows and
  matched GPT 6 Astra/Claude Fable 5.1/DeepSeek V4.1 Flash; this is not runtime
  model observation or a direct model performance measurement. No protocol-1
  automatic team has run live.
- Fresh critic returned revise for untrusted action time, transitive interval ties,
  unconfirmed reasoning and daily freshness invalidating work. After corrections
  returned ship for the automatic evidence/freshness foundation. No full-story or
  native-delivery acceptance follows from this scoped review.
- Focused regression run: 26/26 (`node --test tests/model-strength.test.mjs tests/team-periodic.test.mjs`, 2026-10-12, macOS), covering periodic freshness and failed refresh.
- Runtime native identity inspections and unknown-model calibration remain distinct
  acceptance items; the CLI must not label source refresh as completion of them.
- The protocol-1 watch sleeps at most 30-60 s regardless of `--interval` and appends
  an event with the cached rows each pass. Refresh becomes due exactly at expiry, so
  the policy lapses briefly.

## Implementation status (2026-10-12)

Done: registry-defined Arena source with bounds, exact matching, the interval partial
order, cached rows with row proofs, freshness-only refresh, failed-check recording,
and `team refresh`/`team watch` for protocol 1.

Missing: automatic enrollment and checkpoint triggers, any calibration collector for
unknown models in protocol 1, evidence-backed aliases (the registry is empty), and
throttling of the watch writes.

## Independent review record

Second pass, 2026-10-12: a fresh-context waypost-critic returned revise. Edits
applied: scope narrowed to protocol-1 automatic teams, premise reworded for
owner assignment, ranking blockers stated, verification numbers and dates corrected,
placeholder and watch cadence documented, code references corrected. The owner then
accepted the narrowed ADR.

## References

- https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset (official dataset, CC-BY-4.0)
- https://arena.ai/blog/arena-leaderboard-dataset (source methodology/publication)
- [[cross-harness-team-coordination-protocol]]
