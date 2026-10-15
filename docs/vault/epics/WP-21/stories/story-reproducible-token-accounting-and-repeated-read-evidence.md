---
type: story
id: "story-reproducible-token-accounting-and-repeated-read-evidence"
epic: "WP-21"
title: "Reproducible token accounting and repeated-read evidence"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-15
updated: 2026-10-15
external_refs: {}
tags: []
code_refs: ["scripts/tokens.mjs", "scripts/token-navigation.mjs", "tests/tokens.test.mjs", "tests/token-navigation.test.mjs", "docs/how-it-works.md"]
specs: []
started_at: "2026-10-15T22:04:48.325Z"
closed_at: "2026-10-15T22:21:33.508Z"
plan_updated_at: "2026-10-15T22:04:48.325Z"
---

# Reproducible token accounting and repeated-read evidence

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

The current report measures attributed Claude roles, not total Waypost overhead or subscription quota. Add reproducible totals, coverage and conservative navigation/repeated-read evidence before changing module boundaries or claiming savings. This is the measurement slice of the owner's token optimization plan; it does not approve the proposed CLI split or launch live model benchmarks.

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [x] Add explicit native token shares and provenance/coverage without breaking existing JSON fields. — evidence: `tests/tokens.test.mjs`, legacy and native report fixtures.
- [x] Implement opt-in offline navigation and unchanged-read evidence, with no inferred token savings. — evidence: `scripts/token-navigation.mjs`, `tests/token-navigation.test.mjs`.
- [x] Cover deduplication, missing/invalid usage, cache semantics, changed content and context isolation with fixtures. — evidence: focused run 49 passed / 0 failed.
- [x] Document interpretation and record an offline baseline from retained transcripts. — evidence: parent epic baseline and `docs/how-it-works.md`.

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

The independent planner placed accounting in `scripts/tokens.mjs`, with a pure optional `scripts/token-navigation.mjs` classifier and adjacent fixtures. Existing native evidence reducers have no offline history importer; keep this increment Claude-only and expose Codex/OpenCode as unsupported coverage instead of importing the live team graph or creating a second ledger.

1. Preserve legacy totals; add nullable complete native totals/shares and API estimates, explicit missing/conflicting counters and retained-history limits.
2. Inventory JSONL independently of agent metadata, fingerprint input bytes and analyzer sources, record project/analyzer revisions and UTC period boundaries (`--since` inclusive, `--until` exclusive).
3. Feed tool calls/results into the optional classifier once per context. Report usage of requests that initiate navigation, not the cost of returned content or subsequent context reuse. Deduplicate requests independently of tool calls.
4. Detect identical returned text only for matching successful read calls and scope within a context. Edits/compaction invalidate repeat tracking. Shell syntax outside the supported subset remains unclassified.
5. Run focused fixtures, record an offline baseline, and obtain a fresh-context reviewer before the lifecycle close gate.

Design critique corrections: a navigation-initiating request precedes its tool result, so it is not an upper bound on the cost of reading that result; orphan subagent JSONL must be counted with unknown attribution. Analyzer hashes also cover dirty working copies. No token savings or subscription quota conversion is inferred.

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [x] Existing totals and callers remain compatible; observed token shares include cache exactly once, and unknown pricing is explicitly distinguished from a free call. — evidence: `tests/tokens.test.mjs` cache, unknown-price, TTL conflict and selected-run regressions; independent reviewer met.
- [x] Reports identify source harness/schema, requested time boundaries, observed range, revision and source fingerprints; unreadable/malformed/missing usage is visible. — evidence: `tests/tokens.test.mjs` provenance, orphan, corruption, missing-only and midnight fixtures; independent reviewer met.
- [x] Optional navigation analysis attributes initiating request usage once, distinguishes bounded and unbounded read requests, and explicitly excludes returned-content cost, later context reuse and inferred savings. — evidence: `tests/token-navigation.test.mjs` dedup, bounded read and large-result/future-request fixtures; independent reviewer met.
- [x] Repeated-read evidence requires identical returned content and scope within the same context; missing results, edits and independent contexts do not establish a safe skip. — evidence: `tests/token-navigation.test.mjs` context, invalidation and excluded-mutation fixtures; inline CLI regression in `tests/tokens.test.mjs`.
- [x] Focused regression tests and an independent reviewer pass succeed; offline baseline and limitations are recorded without committing transcript contents. — evidence: root-observed combined run 49/49 (exec session 60882, final chunk 29761f); fresh-context reviewer returned commit after fixes; parent epic baseline/hash verification.

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

Added an additive version-2 report: native totals/shares, nullable incomplete estimates, source coverage, per-file/analyzer hashes and whole-request UTC period selection. Dedicated agent runs are counted after filtering; orphan transcripts are retained with unknown attribution. `--summary` avoids detailed tables for routine queries; `--navigation` provides conservative offline evidence without invoking a model.

Implemented the pure navigation classifier with context isolation, successful-result hashing, edit/compaction invalidation, timestamp-window exclusions that preserve known mutations, and explicit unsupported-shell gaps. No transcript text is emitted, no new ledger was introduced, and no proposed architectural decision was accepted by this implementation.

Validation: `node --test tests/tokens.test.mjs tests/token-navigation.test.mjs` passed 49/49; `git diff --check` clean; normal CLI summary smoke passed; `npm pack --dry-run` contains both analyzer modules; `waypost doctor` reports 0 issues and the 3 existing warnings. Independent fresh-context reviewer checked the actual diff, the five fixes, fixtures and baseline hashes and found no remaining actionable gaps.

Observed baseline: 14.6910% explicit role attribution in retained Claude history for the documented period. Summary output was 88.99% shorter in characters, not a measured task-token saving. Codex/OpenCode offline history import, broader navigation coverage, paired live task benchmarks and the proposed CLI split remain follow-ups. No live LLM benchmark, full test suite or Windows/Linux runtime verification was performed in this slice.

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

Baseline and interpretation are recorded in the parent epic's "Offline measurement baseline (2026-10-15)" section. Full JSON fingerprint manifests remain in local scratch storage; no raw transcript bodies are committed. The offline run measured 2,661 requests / 744,710,130 tokens / 14.6910% explicit Waypost attribution for `[2026-10-08, 2026-10-15)` UTC. The compact output was 241 versus 2,188 characters; no task-level token reduction has been measured.

The first reviewer found midnight clipping, inline context mixing and conflicting TTL splits; the recheck found out-of-period run counts and invalidation lost through request exclusion. Regressions cover each scenario. Whole-request selection occurs after deduplication; excluded mutations inside the navigation event window still invalidate repeat evidence. Unknown inline identities never share retained-context evidence with the main thread.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-15*
