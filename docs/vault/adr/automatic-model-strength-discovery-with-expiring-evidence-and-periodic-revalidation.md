---
type: adr
id: "automatic-model-strength-discovery-with-expiring-evidence-and-periodic-revalidation"
title: "Automatic model strength discovery with expiring evidence and periodic revalidation"
status: proposed
date: 2026-09-30
authors: ["Ivan Morozov", "Codex (OpenAI)"]
tags: ["models", "coordination"]
external_refs: {}
supersedes: null
superseded_by: null
code_refs: ["scripts/team.mjs", "scripts/model-strength.mjs", "scripts/team-state.mjs", "scripts/team-cli.mjs", "models/strength-sources.json", "tests/model-strength.test.mjs"]
review_status: reviewed
reviewed_at: 2026-09-30
drafted_by: {"harness":"codex","provider":null,"date":"2026-09-30"}
guards: []
---

# Automatic model strength discovery with expiring evidence and periodic revalidation

| Field | Value |
|---|---|
| Status | proposed; the owner chose automatic discovery, implementation details await independent review |
| Date | 2026-09-30 |
| Deciders | Ivan Morozov: automatically discover changing model strength, including free models; periodically recheck actuality |
| Supersedes / Superseded by | none / none |
| Related | [[model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review]], WP-20 |

## Context

The initial team design supported owner-approved priority data. During implementation
on 2026-09-30 the owner explicitly required automatic determination because models
change continuously and sessions may use free models from different providers.
The owner also required periodic freshness checks. Approval now applies to the
selection algorithm/source policy, not a manually maintained list of model priorities.
The accepted task authority/independent-review architecture is unchanged.

## Decision drivers

- No manual model-strength ordering for normal operation.
- Discover new exact model identities without a vendor-specific ranking branch.
- Price, free access and vendor do not imply capability.
- Sources and evaluation dates must be visible; uncertainty must survive selection.
- Current model identity and published strength evidence are separate observations.

## Considered options

| Option | Consequence |
|---|---|
| Hard-coded model family tiers | Stale immediately and excludes new/free models; rejected |
| Ask owner to sort models every time | Contradicts explicit automatic requirement; rejected as normal mode |
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
Larger priority means stronger evidence. Agentic overall scores are a
proxy for coordination/implementation/review, not proof of any one role; expose
that limit. Do not numerically combine unrelated leaderboard scales. Source choice
is deterministic and reported. Exact model/provider/reasoning identity matching
allows unique spelling normalization preserving all letters, digits and version
suffixes; no fuzzy family/date truncation. Evidence-backed aliases can extend
coverage. Unknown models require a bound calibration/evaluation result, never a
participant's unverified self-reported score. A calibration collector is a future
integration capability, not implemented by accepting arbitrary JSON.

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
the task authority and future Git publication fence.

## Consequences

Publicly measured models, including free/open models, can be ranked without
operator intervention. Ties and unknowns can delay selection, and external source
outages reduce availability. Credential/model introspection and native delivery
remain separate adapter evidence. One public source cannot claim universal model
coverage or definitive reviewer quality. Manual policy is optional explicit override,
not the normal workflow. Calibration execution and autonomous native identity
inspection must be implemented before claiming those capabilities.

## Verification and follow-up

- Tests cover stale/future/malformed data, row totals, pagination, exact identities,
  uncertainty ties, free models, proxy limitations and periodic cache expiry.
- Live read-only discovery retrieved the official latest agent JSON rows and
  matched GPT 6 Astra/Claude Fable 5.1/DeepSeek V4.1 Flash; this is not runtime
  model observation or a direct model performance measurement.
- Fresh critic returned revise for untrusted action time, transitive interval ties,
  unconfirmed reasoning and daily freshness invalidating work. After corrections
  returned ship for the automatic evidence/freshness foundation. No full-story or
  native-delivery acceptance follows from this scoped review.
- Focused regression run: 55/55 passed on macOS, including CLI inbox isolation,
  periodic freshness, failed refresh, authority replay/concurrency and crash recovery.
- Runtime native identity inspections and unknown-model calibration remain distinct
  acceptance items; the CLI must not label source refresh as completion of them.

## References

- https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset (official dataset, CC-BY-4.0)
- https://arena.ai/blog/arena-leaderboard-dataset (source methodology/publication)
- [[cross-harness-team-coordination-protocol]]
