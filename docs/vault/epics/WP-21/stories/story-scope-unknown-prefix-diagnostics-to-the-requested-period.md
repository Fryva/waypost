---
type: story
id: "story-scope-unknown-prefix-diagnostics-to-the-requested-period"
epic: "WP-21"
title: "Scope unknown-prefix diagnostics to the requested period"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-19
updated: 2026-10-19
external_refs: {}
tags: []
code_refs: ["scripts/token-codex.mjs", "tests/token-codex.test.mjs", "docs/how-it-works.md"]
specs: []
started_at: "2026-10-19T00:49:14.358Z"
closed_at: "2026-10-19T00:57:49.256Z"
plan_updated_at: "2026-10-19T00:49:14.358Z"
---

# Scope unknown-prefix diagnostics to the requested period

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

The report counts unknown first prefixes across all discovered histories, which can be mistaken for prefixes affecting the selected UTC period. Add precise period-overlap diagnostics using the existing completeness condition, without assigning missing tokens or changing spans, totals, attribution or completeness. Count unique reduced contexts after replay deduplication; explicitly exclude quarantined contexts from this diagnostic subset. No live pilot, quota conversion, authority or budget mutation.

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [x] Add period-overlap prefix diagnostics at the existing completeness guard. — evidence: scripts/token-codex.mjs:200; boundary fixtures
- [x] Aggregate unique-context counts and document their non-exhaustive scope in JSON/detailed output. — evidence: post-dedup/quarantine aggregation; detailed/legacy/compact checks
- [x] Cover boundaries, replay/quarantine, empty/zero/gapped histories and unchanged accounting; bind fixtures/offline evidence and independent review. — evidence: 100/100 fixtures; source-bound old/new comparison; fresh reviewer acceptance

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

The fresh planner placed this additive change in the existing reducer guard and post-quarantine reduction branch. Add per-context `unknown_prefixes_overlapping_period` only where the existing unknown-prefix rule sets complete=false. Aggregate unique trusted reductions after replay deduplication; quarantined contexts keep an unclassified empty coverage object. Explain the non-exhaustive scope in metadata, detailed text and the existing documentation section; missing fields in older reports render as unknown. Preserve compact text byte-for-byte and every native counter/span/completeness decision. Fixtures cover closed-prefix boundaries, late first snapshots, replay/quarantine and zero diagnostics with other gaps; source-bound affected suites and an offline old/new accounting comparison precede fresh review.

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [x] Per-context unknown-prefix period overlap uses exactly the existing frame.time >= from && created < to condition. All native spans/counters/totals/shares/completeness and first-baseline rules remain unchanged. — evidence: exact existing completeness guard; native totals/shares comparison; reviewer AC1 met
- [x] Report unique reduced-context counts across retained history and overlapping the requested period after replay deduplication; quarantined contexts are explicitly excluded, with zero diagnostics never claiming full coverage. Detailed text and documentation explain scope; compact output is unchanged. — evidence: replay/quarantine/zero/gap/legacy output fixtures; reviewer AC2 met
- [x] Boundary, unknown-late-first-snapshot, replay, quarantine, zero-anchor/no-observation and other-gap fixtures pass with source-bound evidence and fresh independent acceptance. Offline comparison verifies unchanged native totals/shares; no model pilot or budget/authority mutation, author/reviewer costs remain unisolated. — evidence: 154 source hashes; 100 passed; independently verified reports; reviewer AC3 met

## Final Summary

Added per-context unknown-prefix overlap diagnostics at the existing completeness guard and unique-context aggregates after replay deduplication/quarantine. JSON and detailed output distinguish corpus-wide prefix uncertainty from the requested period; quarantined histories are explicitly excluded and zero diagnostics cannot establish complete coverage. Native counter/span/completeness decisions and compact output are unchanged.

All100 affected fixtures passed;154 source hashes remained unchanged through testing and offline comparison. Independent reviewer accepted AC1–AC3 with no findings. Of140 reduced contexts with observed unknown first prefixes,13 may affect Oct8–15 UTC and47 Oct16–18. Old/new totals, shares, per-context accounting and compact output match exactly; one live historical input changed only raw lifetime snapshot counts, disclosed and retained with the initial comparison failure. Full totals, missing tokens, savings and weekly quota remain unknown. No native pilot or budget mutation; author/reviewer cost remains unisolated. Node25.6.1/macOS verified; Node20/full suite/other OS untested.

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

### Verification

Three affected accounting suites passed100/100,0 failed/0 skipped on Node25.6.1/macOS. All154 source hashes stayed unchanged through tests and offline comparison; source manifest SHA256 `398d8fc1d63c36456224d77ecf63da5dcad8e80a03748e0cfd84c8fea1d85f3c`, full log SHA256 `6bd15f0b55c5885c010ecb472f1e37d0f12c45d6fee74fa9f939a7eaa2ac558a`. Private evidence `.waypost/experiments/wp21-prefix-period-20261018/{source-before.json,tests.log,verification.json,baseline-summary.json,historical-before.json,historical-after.json,recent-before.json,recent-after.json}`. Node20/other OS/full npm suite not exercised.

The first real-history comparison was overly strict about raw lifetime snapshot counts: one active input gained a snapshot while read. That assertion failure is retained in initial-baseline-live-count-mismatch.log. The completed comparison requires exact native totals/shares/per-context accounting and compact output; all old coverage diagnostics agree for unchanged sources, with only snapshots/current_snapshots allowed to grow for changed inputs. This is a sequential read, not an atomic snapshot.

### Period diagnostics on retained history

140 reduced contexts have observed unknown initial prefixes across retained history. Only13 may overlap [2026-10-08,2026-10-16) UTC and47 may overlap [2026-10-16,2026-10-19) UTC under the existing conservative guard; quarantined contexts0. Empty/gapped/unidentifiable histories are not proven complete by zero diagnostics. These counters do not estimate missing tokens.

Both windows retain exact native totals/shares/per-context accounting and byte-identical compact output versus38fa3b3. Historical observed total19,366,260/explicit Waypost4,076,805 (21.051070%); recent159,107,953/35,565,113 (22.352819%). Full retained-source totals/shares remain null. The historical comparison has one changing active input (raw snapshot counts); recent input hashes match. The retained corpus can grow, so these counts identify this read only. Role totals include useful work, not pure overhead or savings; no subscription-quota conversion. No native pilot, authority/budget mutation or historical protocol/receipt rewrite; author/planner/reviewer costs remain unisolated/unknown.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-19*
