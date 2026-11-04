---
type: story
id: "story-compare-continuation-quality-and-native-tokens-with-and-without-a-packet"
epic: "WP-24"
title: "Compare continuation quality and native tokens with and without a packet"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-02
updated: 2026-11-04
external_refs: {}
tags: []
code_refs: ["scripts/handoff-delivery.mjs", "scripts/team-host.mjs", "scripts/run-budget.mjs", "docs/handoffs.md", "docs/handoff-experiment-2026-11-02.md", "scripts/native-usage.mjs", "tests/native-usage.test.mjs", "docs/handoff-experiment-2026-11-04.md"]
specs: []
blocked_by: ["WP-24/story-deliver-portable-packets-through-existing-cross-harness-inboxes"]
started_at: "2026-11-02T21:04:31.485Z"
closed_at: "2026-11-04T04:58:56.747Z"
plan_updated_at: "2026-11-03T00:37:11.421Z"
---

# Compare continuation quality and native tokens with and without a packet

| Field | Value |
|---|---|
| **Epic** | [WP-24](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Compare continuation quality and native tokens with and without a packet, the next ordered slice of the owner-authorized WP-24 experiment.

## Implementation Plan

Run a small frozen analytical continuation comparison through the existing counted native delivery wrapper after capture/delivery are verified. Owner explicitly allocated 500000 total native tokens including input,cached input,output in this chat on 2026-11-02. Preserve/archive the old machine budget/receipts before configuring this experiment, never count unknown usage as zero. Aim for two paired cases in AB/BA order, same receiver native profile and task/snapshot, deterministic JSON quality oracle, count full measured setup/delivery/receiver usage including any LLM preparation. No inference before owner ceiling/admission is valid. Pins may refuse Codex/Claude current versions; do not bypass them. Use a supported installed harness/profile or report a concrete blocker. Analytical no-tools scope is explicitly smaller than coding quality/general performance. Record all failures and no positive saving claim unless data supports it.

## Acceptance Criteria

- [x] Owner 500000 allocation is configured with preserved prior accounting evidence; every measured native call is admitted and settled or unknown/blocked. — evidence: final authority replay revision48: five settled complete calls,32187 new tokens, historical17520 preserved; current restored policy/reserved0 verified independently.
- [x] Baseline and packet conditions use frozen equal tasks/snapshots and the same actual receiver profile with deterministic quality scoring. — evidence: all four payload hashes/facts/answers independently matched frozen inputs and oracle; anthropic/claude-sonnet-5-5 with reasoning unknown, distinct retired native contexts.
- [x] Report native input/cache/output totals, preparation/delivery overhead and missing coverage separately; no tokenizer counts substituted for native usage. — evidence: docs/handoff-experiment-2026-11-04.md;17 new complete native bucket diagnostics, fresh ABBA18414vs11671, timing and missing historical buckets separately retained.
- [x] Paired outcomes, numerical token differences and limitations are independently reviewed; unfavorable or inconclusive results are retained. — evidence: independent final review verified18478 vs11682 (6796/36.778872%), all answers correct, both pre-inference refusals retained; docs/handoff-experiment-2026-11-02.md.

## Final Summary

Frozen six-case ABBA comparison completed after owner login. Actual anthropic/claude-sonnet-5-5, reasoning unknown; five complete settled native receipts, distinct retired contexts, verified isolation. Full-history arms9266+9212=18478; packet5877+5805=11682; reduction6796 (36.78%). All four answers matched the deterministic six-case oracle. Control2027, total32187 of owner500000. Prior17520 ledger and events preserved, total49707/reserved0 after policy restoration. Both earlier refusals cost0. Operational sender preparation made0 model calls; development/driving chat excluded. Historical raw input/cache/output remains unavailable and is not reconstructed. The approved continuation now closes the measurement gap with17 new complete diagnostic receipts and a separate fresh ABBA repeat18414vs11671. All4 new analytical answers are correct. See docs/handoff-experiment-2026-11-04.md for complete buckets/timings, coding outcomes, retained failures and cumulative130706/500000 owner spend. Independent final acceptance of the combined report precedes lifecycle close.

## Frozen live protocol

Owner allocation500000 includes measured native input/cached input/output. Existing
machine ledger17520 remains; preserve it and set total517520 while preserving previous schema caps and adding a Claude cap,
so new remaining is500000. This is estimate-based admission, not a hard provider
spend guarantee. No unknown receipt is treated as zero. No clear/reset/history loss.

Prepare six actual captured cases: A unchanged passing, B inputs changed during
command, C command failed, D truncated capture, E no selected source identity,
F source changed after capture. Put their historical receipts inside a freshly
observed checkpoint; stale primary packets are never delivered. Extract exactly
the same decision facts from full history and compact facts JSON; freeze equality,
source/payload digests and oracle before analytic calls. Correct classifications
remain only in the separate oracle, not in either arm.

Use actual native Claude2.1.296 Sonnet read-only/no-tools. First-party claude.ai
Max login and metadata-only isolation/owned closure confirmed outside sandbox;
Host must recheck every fresh arm. One counted synthetic control plus up to four
analytical calls (baseline,packet,packet,baseline), max4delivery ceiling, conservative
30000estimate each,120000delivery unit ceiling. Stop on incomplete/unknown usage,
profile drift or failed control. Fresh receiver profile/version and raw native
counts must match scope; no model judge. Sender fixture preparation/hydration is
deterministic and makes zero additional model requests; one-time implementation
and driving-chat usage are outside this operational comparison and not savings.


## Approved continuation: native details and timing

Owner approved completing the remaining measurement gap before preparation,
recovery, real coding comparison, bounded retrieval and deltas. Preserve optional
versioned native_usage inside the authoritative receipt and its native seals,
not a second spending ledger. Adapter-specific complete before/after/delta counters
must agree with the existing scalar usage span. Missing diagnostics do not erase
known actual spending or become zero. Historical events remain replay-compatible.
Record monotonic prepare/send/relay/poll/total milliseconds per handoff attempt,
with absent measurements null. Resume timings describe the new attempt, not
provider total. Add focused counter/Host/replay/seal/timing regressions and an
independent review before a new native check. Historical32187 calls cannot gain
missing buckets retrospectively; keep old results honestly missing.
