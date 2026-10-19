---
type: story
id: "story-recognize-explicit-inherited-parent-headers-in-codex-accounting"
epic: "WP-21"
title: "Recognize explicit inherited parent headers in Codex accounting"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-19
updated: 2026-10-19
external_refs: {}
tags: []
code_refs: ["scripts/token-codex.mjs", "tests/token-codex.test.mjs", "docs/how-it-works.md"]
specs: []
started_at: "2026-10-19T00:30:37.377Z"
closed_at: "2026-10-19T00:41:52.868Z"
plan_updated_at: "2026-10-19T00:30:37.377Z"
---

# Recognize explicit inherited parent headers in Codex accounting

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

The collector quarantines contexts containing an explicit inherited parent session_meta, even though copied native counter events before child creation are already ignored. Offline metadata-only diagnosis found27 such contexts: each has one older matching parent header. Recognize only a validated initial parent-header prefix, retain strict identity conflicts elsewhere and preserve native counter/baseline rules. No live inference, provider-quota conversion, pilot replay or ledger mutation.

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [x] Validate explicit parent identity and narrowly recognize a single initial inherited parent header. — evidence: scripts/token-codex.mjs:29,143; independent reviewer AC1 met
- [x] Cover inherited counters/attribution, strict rejection/replay identity and plain/compressed parity. — evidence: 96/96 affected fixtures; tests/token-codex.test.mjs:455,525,537
- [x] Bind affected fixtures and refreshed offline evidence; obtain independent acceptance before closing. — evidence: verified source/log/baseline hashes; fresh fork_accounting_reviewer acceptance

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

Independent planner confirmed27/27 differing parent headers at record position1, before content/counters;26 source hashes match the earlier baseline and1 active history changed. Implement a normalized consensus of present non-null parent hints, rejecting contradictory/empty/non-string/self references. The only exception is record1 after the current header: one valid older same-cwd explicit parent. Bind parent identity in existing discovery/replay signatures; expose a matching-file occurrence count. Keep the native reducer unchanged. Validate both unknown nonzero prefixes and explicit zero anchors, all codecs, replay and negative prefix/identity cases, then independent review and an offline refresh. No new architecture or ledger is introduced.

The first independent review required preserving accepted parent metadata across replay and registering it against discovered first headers before project filtering. Implement this using the existing identity registry; conflicting parent identity quarantines children that used the exception. Ignore only the copied envelope timestamp in this signature, never merge parent counters. Identical current-header repeats retain their existing behavior and do not reopen the parent slot.

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [x] Only one valid older same-project parent header before content/counters may be recognized using consistent explicit parent identity; unrelated, ambiguous, later, duplicate inherited, malformed and conflicting headers remain quarantined, including replay and cross-project identity checks. — evidence: strict prefix/parent identity/replay/foreign-header fixtures; reviewer AC1 met
- [x] Native reducer semantics are unchanged: inherited pre-creation counters ignored, first nonzero baseline uncharged, zero anchor only explicit, child/current role attribution preserved, no counters merged by parent. Plain/compressed fixtures and original-byte hashes remain valid. — evidence: byte-identical reducer; unknown-prefix/zero-anchor/role/codec fixtures; reviewer AC2 met
- [x] Source-bound affected tests and independent review confirm the fix; offline report distinguishes recovered observed spans from unknown prefixes/full usage/savings/quota. Historical frozen pilots, assumed charges and authority/budget are unchanged; author/review costs remain unisolated. — evidence: 154 source hashes; 96 passed; independently verified sequential reports and limitations; reviewer AC3 met

## Final Summary

Recognized one older same-project explicitly linked parent header immediately after a current Codex header. Normalized parent identity is bound across replay and the existing global first-header registry; inconsistent sources quarantine children that used the exception. Later/repeated inherited headers remain strict. Native reducer, source-byte hashing, child role attribution and unknown-prefix rules are unchanged; inherited parent counters are never merged or assigned as a child baseline.

Affected accounting suites96/96 passed,154 source hashes unchanged through offline refresh. Fresh independent reviewer accepted AC1–AC3 after the parent-signature gap was corrected, with no remaining findings. Current retained corpus recognizes28 prefix headers, removes28 false quarantines and retains138 unknown-prefix contexts. Full totals/shares remain null. Closed UTC windows now observe19,366,260 tokens (21.051070% explicit Waypost) for Oct8–15 and159,107,953 (22.352819%) for Oct16–18. These include useful role work and are not measured savings or weekly quota; comparisons are sequential with one changing active source. No native pilot or ledger/budget mutation. Node25.6.1/macOS verified; Node20/full suite/other OS and unisolated author/review cost remain unverified.

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

### Verification and limits

Affected three accounting suites: exit0,96 passed/0 failed/0 skipped on Node25.6.1/macOS. All154 source inputs remained unchanged through tests and offline refresh. Source manifest SHA256 `9b49eb6b63952c880274664002550f9fa86b311cf11f4853624e08159dfa507b`; full log SHA256 `903e18881b8a8648d486a969aeca1828969eb620566342573ad9c7428b92661c`. Evidence `.waypost/experiments/wp21-context-conflicts-20261018/{source-before.json,tests.log,verification.json,diagnosis.json,lineage-diagnosis.json,baseline-summary.json,historical-before.json,historical-after.json,recent-before.json,recent-after.json}`. Initial fixture-only failure used an ambiguous privacy marker; initial source/log retained. First independent review found a missing accepted-parent signature check across replay and discovered parent first headers; this is now bound through the existing identity registry, with conflicts propagated to children using the exception. Additional fixtures cover parent creation/role/cwd differences, both file orders and permissible copied envelope timestamps. Pre-fix93-test logs/identities/reports are retained with pre-parent-signature prefixes. No Node20 runtime or full npm suite was run.

### Offline retained-history results

Sequential comparison with cbe7fbe on current retained sources:175 matching files, including105 fully decoded archives.28 explicit inherited prefix headers are recognized; previous28 identity quarantines reduce to0. This corpus has grown since the original27-file diagnosis.138 contexts still have unknown initial prefixes; full retained-source totals/shares remain null. One active source changed between each before/after read, so the comparison is not an atomic snapshot or an exact controlled cost delta.

- [2026-10-08,2026-10-16) UTC: observed total19,366,260 in194 spans; explicitly attributed Waypost4,076,805 (21.051070%). Previous collector on this corpus:18,949,185/187 spans, same explicit Waypost4,076,805.
- [2026-10-16,2026-10-19) UTC: observed total159,107,953 in1133 spans; explicitly attributed Waypost35,565,113 (22.352819%). Previous collector:158,322,215/1123 spans and34,779,375 explicitly Waypost.

Waypost role totals include useful work, not only overhead. These are recovered observed counter intervals, not a savings experiment, full workflow invoice or subscription quota. No native pilot dispatch or authority/budget mutation occurred. Historical pilots/frozen protocols and owner-assumed17520 remain unchanged; preparation/planner/reviewer session costs remain unisolated/unknown and are not charged to the pilot allowance.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-19*
