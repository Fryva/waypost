---
type: runbook
slug: "proposed-revision-3-of-the-sealed-source-token-pilot"
title: "Proposed revision 3 of the sealed-source token pilot"
status: draft
date: 2026-10-18
authors: ["Ivan Morozov"]
tags: []
---

# Proposed revision 3 of the sealed-source token pilot

## State and purpose

**Proposal only; budget-blocked for a full paired pilot. No new inference is
permitted by this document or by the owner's acceptance of the previous assumed
charge.** The owner asked to continue the implementation; this proposal makes
the next protocol and its resource trade-offs reviewable before a new decision.

Revision 2 remains frozen at SHA256
`8df690fa0080a26e669508b88f2df4f63887f737bbedeebb2b2395973142836e`:
[[paired-token-economy-experiment-revision-2-over-a-sealed-read-only-source]].
Its only C1 failed on `turn/moderationMetadata`. The owner accepted 7520 as an
assumed budget charge, the team is closed, and the partial receipt is retained.
That outcome is not repaired, reused as identity, omitted from cost or retried
under its old invocation/nonce. Current cap 250000, counted 7520, reserved 0,
remaining 242480; authoring/review cost remains unknown outside that counter.
See the execution story and report commit `22b9f78`.

## Exact proposed compatibility delta

The local experimental schema for installed CLI 0.163.0-alpha.10.2 declares
`turn/moderationMetadata` with required metadata/threadId/turnId; metadata has
schema `true` (any JSON, not just an object). The adapter accepts only that
notification on its separate evaluation surface, after thread/turn binding and
before terminal. Params are closed; metadata is opaque data, never instructions,
a tool request, callback result or token observation. No new tool is offered.

Caps are policy choices, not measured native requirements: at most 65536 UTF-8
bytes for the received UTF-8 JSON line before its LF delimiter, 262144 bytes
across the invocation, and 16 frames. The hashed byte metric is
`wire-json-line-bytes-excluding-lf-v1`: whitespace, JSON escapes and any CR before
LF count. The parser supplies actual Buffer length, not normalized reserialization;
missing or invalid byte evidence withdraws accounting without fallback. Identical repeats consume the budgets. Method and caps are part of the
surface definition digest, so previous C0 configuration identity is invalid for
this definition. Foreign/unbound, malformed, server-request, late or over-limit
frames withdraw accounting; the sticky accounting flag must also fail after an
expected C3 forbidden-tool violation. An old first violation cannot mask this.

Old no-exec definition, existing ledger/schema, counters and zero-anchor rule,
broker paths/callback limits, qualification rules and historical receipts stay
unchanged. Schema evidence and fixtures alone do not prove live compatibility.
Production probed-catalog registration remains empty until the new controls pass.

## Inputs inherited without modification

This is a delta protocol: **every normative requirement of frozen revision 2
remains in force unless explicitly changed below**. The exhaustive changes are
the bounded moderation-notification method/caps and new definition identity,
new proposed control estimates/schedule, and the owner's eventual budget/phase
selection. In particular inherit the complete blind-acceptance procedure,
per-call admission worksheet, reporting/accounting and stop/rollback rules; the
input list below does not replace them. For an explicitly authorized control-only
phase, worker/judge execution is inapplicable rather than silently dropped from
a claimed comparison. Historical cost, receipts, uncertainty and no-retry rules
still apply in every phase.


Import the following exact content from frozen revision 2, not from a mutable
summary: N1/A1 original task blocks, their acceptance rubrics, common baseline
246ba861a8fa66a7fd3c8e18ab1c92088d7a693b, treatment
0baae601a56e9aae014890b7c640de44215adabe and the four allowed role/skill overlays,
AB/BA order, four task workers, four blinded judges, neutral source tools and
source selection, all broker caps and 125000 future-judge reserve. The common
manifest at preparation is 562 UTF-8 files / 5857827 bytes, digest
`c9d9485f229d2f54078c12a280a3c0a37a781c9980a98200580755d1f19c83d9`;
reconstruct and verify it before launch. Recorded omissions are identical.

The revision-2 exact neutral control role and C1/C2/C3 prompt blocks are imported
verbatim. No hidden task in identity instructions, no calibration/model search,
no warmups, no substitute task/judge or weakened rubric. All judges use the same
treatment critic/review-skill policy and configuration. Keep global instruction
and effective configuration identity, role/task/source hashes, blinded candidate
mapping and substitution rules frozen before any new model call.

## Proposed next control schedule and call accounting

A new owner decision must explicitly authorize the revised definition and this
schedule, then this document and a complete launch manifest must be frozen by
hash before inference. Use a new team/invocation namespace; never reopen the
closed team or erase its assumed charge. This is not permission to silently use
the old fourth setup slot as a retry.

- C0, no inference: freeze new definition/executable/version/catalog/global-input
  and effective configuration identity, verify source seals, current fixtures,
  timeout and owned close/drain. Require the new expectedSurfaceDigest on every
  call; changing only a descriptor label cannot preserve the old pin.
- C1, one call, proposed estimate 10000: the unchanged identity/accounting
  control, fresh native context, no tools, exact C1_READY, clean verified
  terminal span and owned closure. Accept no evidence from the previous C1.
- C2, one call, proposed estimate 40000: unchanged sequential read/search,
  continuation and denied non-manifest path over harmless files. Require the
  earliest native zero anchor across all iterations and complete terminal
  accounting; neither freshness nor late partial counters prove a full span.
- C3, one call, proposed estimate 10000: unchanged actual forbidden probe,
  refusal before side effect, complete terminal accounting and permanent
  quarantine. Subsequent late/invalid metadata makes usage unknown, even when
  the first violation remains the expected forbidden-tool reason.

Only these three new controls are proposed. Count the old failed C1 as well:
one historical plus three proposed controls, four across both attempts. A new
owner decision is required; this is not an assertion that the previously frozen
three-call schedule permits a replacement. Never repurpose a worker/judge call.
Any failed control, unknown span/stop or unexpected frame stops new admissions;
there is no retry/substitution under this proposal. Record failures and preserve
uncertainty. A further changed definition would need another protocol decision.

Catalog evidence registration remains the exact data-only mechanism from
revision 2: after C1-C3 pass, compare C0/all complete receipts and append only the
proved catalog digest. Changing behavior after a failed control cannot count as
registration or rehabilitate that control. No env/in-memory bypass.

## Budget feasibility before asking for launch

The current full comparison does not fit even its old optimistic estimates:

| Future component | Old estimate/reserve | Proposed planning value |
|---|---:|---:|
| C1 | 5000 | 10000 |
| C2 | 20000 | 40000 |
| C3 | 5000 | 10000 |
| Four workers | 90000 | 90000 |
| Protected future-judge reserve | 125000 | 125000 |
| Required before full launch | 245000 | 275000 |
| Existing remaining allowance | 242480 | 242480 |
| Planning deficit | 2520 | 32520 |

These are soft admission estimates/reserves, not provider caps or verified
future costs. The only observed C1 counter was 7520 against an estimate 5000,
with incomplete coverage; it does not establish a distribution or justify
reducing any worker/judge estimate. Even a simple 1.504 scaling of old control
estimates yields a 17640 planning deficit. The proposed larger control estimates
are a planning assumption, not a measurement of C2/C3 or a guarantee of fit.

**Do not start full-cohort controls or workers while this deficit is unresolved.**
Do not auto-raise the cap, lower estimates to pass admission, count past control
spend toward future judge reserves, or leave a partially judged comparison as a
successful result. Preserve the original 125000 future-judge reserve after
controls and until judging starts, then release only completed judge allocation.

## Owner choices; none selected by this proposal

1. Keep the full fixed comparison. Owner must set an allocation with adequate
   planning room: current counted 7520 + proposed future requirement 275000 =
   at least 282520 total before additional overshoot allowance. This arithmetic
   is not a recommendation to auto-set that cap or a promise that it suffices.
2. Keep cap 250000 and authorize only the three compatibility controls as a
   separately declared phase (estimates total 60000). They fit the displayed
   remaining allowance, but are not a paired savings experiment. No workers or
   judges may follow automatically; exact observed control costs would inform
   a separate later cohort/budget decision.
3. Keep cap and defer model calls. Retain the compatibility implementation (fixture verification is still required)
   and failed-pilot evidence; no claim of measured quality parity or savings.

No option has been selected here. Final launch eligibility needs owner decision,
fresh C0, reviewed source hashes, current budget readback and a frozen complete
launch manifest. Every estimate may overshoot; native accounting/uncertainty and
owned-stop gates remain in force.

## Evidence and limits

Prior failure and owner resolution are retained locally (ignored by Git) under
`.waypost/experiments/wp21-smoke-20261018/`. New code/test evidence belongs to the
moderation-metadata story, not the old failed invocation. No native loop,
quality/savings result, weekly quota conversion or whole-workflow cost is proved
by this proposal. Preparation/review sessions remain real unknown cost.
