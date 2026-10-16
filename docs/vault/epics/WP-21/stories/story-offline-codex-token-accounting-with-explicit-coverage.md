---
type: story
id: "story-offline-codex-token-accounting-with-explicit-coverage"
epic: "WP-21"
title: "Offline Codex token accounting with explicit coverage"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-16
updated: 2026-10-16
external_refs: {}
tags: []
code_refs: ["scripts/tokens.mjs", "scripts/token-codex.mjs", "tests/token-codex.test.mjs", "docs/how-it-works.md"]
specs: []
started_at: "2026-10-16T03:15:04.049Z"
closed_at: "2026-10-16T03:39:38.588Z"
plan_updated_at: "2026-10-16T03:15:04.049Z"
---

# Offline Codex token accounting with explicit coverage

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

The offline analyzer currently covers only Claude. Add explicit `waypost tokens --harness codex` for retained plain Codex rollouts, using native cumulative counters and explicit role metadata. Preserve Claude as the default, keep counter schemas separate and make incomplete discovery/history visible. No model calls, prices, subscription-quota conversion, new ledger or live team imports.

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [x] Implement a bounded, project-scoped plain-rollout collector and cumulative-span reducer.
- [x] Add explicit CLI routing, compact reporting and counter/provenance documentation.
- [x] Cover replay, unknown prefixes, fork history, gaps/resets and period boundaries with fixtures; record a read-only local baseline.

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

The independent planner placed the new collector in `scripts/token-codex.mjs`, dynamically imported only in the Codex branch of `scripts/tokens.mjs`. Preserve the current Claude JSON/report and all its tests. Existing live transport counters are camelCase and privately coupled to the team graph; do not import live evidence collectors.

1. Discover only within `CODEX_HOME/sessions` (default `~/.codex/sessions`). Read bounded metadata headers first; exact normalized cwd selects the project. Do not infer worktree membership. Inventory skipped `.jsonl.zst` and unreadable/unidentifiable candidates as unknown discovery coverage; no archive decompression/dependency in this slice.
2. Stream matching plain files with bounded line storage and SHA256. Keep only token events and safe metadata, never prompt/tool bodies. `session_meta.id` owns the native context; the Desktop's `session_id` is retained as an opaque label and can be shared by several subagents. Metadata conflicts within one native id quarantine that context. Same-id files deduplicate only compatible prefix histories; divergent histories remain unknown rather than silently reordered.
3. Ignore copied events timestamped before session creation. The first snapshot is a baseline only: an explicit all-zero snapshot establishes a zero anchor; any nonzero snapshot (even total == last) has an unknown prefix and is never charged as new usage. This avoids assuming a fork cannot re-emit inherited counters. Subagent parent identity alone is not proof of fork. Thereafter count monotonic differences once; repeated snapshots are not requests. Malformed/null events, missing/invalid/decreasing timestamps, decreasing counters, same-total conflicts or optional-schema changes break continuity; next valid snapshot rebases without charging it. Native totals use total_tokens, with cached/reasoning retained as subsets.
4. Build chains before applying UTC period filters. Assign each observed span to its endpoint timestamp, record crossing intervals, and never claim exact per-call timing. Distinguish observed covered-span shares from nullable full-history shares. Attribute Waypost only from consistent explicit agent_role metadata, retaining unknown attribution.
5. Add fingerprints, coverage, clear unsupported flags (`--navigation`, `--runs`), focused fixtures and a local read-only baseline; run an independent reviewer before close/commit.

The independent critic required separate timestamp-order validation and an honest first-span boundary. The implementation uses only explicitly observed zero anchors; no inferred initial charge. "Complete" always means within discovered retained sources and selected observed spans, never provider-exhaustive history.

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [x] Default/explicit Claude output remains compatible; explicit Codex mode reports native observed spans and subset counters without adding Claude totals, dollars or quota percentages.
- [x] Exact project selection, context identity/role validation, prefix replay dedup, archive/header/read errors and source/analyzer fingerprints are visible; no transcript bodies are emitted.
- [x] First-anchor/prefix handling, inherited history, duplicates, conflicts, schema drift, gap/reset rebase and safe counter validation cannot fabricate usage or hide incompleteness.
- [x] Periods use pre-period baselines and endpoint assignment; cached/reasoning subsets are not counted twice; unknown role stays unattributed; incomplete discovery/history prevents full-history claims.
- [x] Focused regression tests, ordinary CLI smoke, a reproducible local baseline and a fresh-context independent reviewer pass are recorded; no live benchmark is launched.

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

Implemented explicit offline Codex accounting with native counter validation, bounded project-scoped discovery, conservative replay handling and visible coverage. Claude remains the default. Documentation explains retained-source limitations and subset counters.

Validation: 74/74 focused regression tests passed, the ordinary CLI was exercised, and a fresh-context Waypost reviewer accepted all five criteria after two identity/period gaps were corrected. The source manifest and analyzer hashes are recorded in the parent epic. The local UTC window [2026-10-08, 2026-10-16) contains 18,949,185 observed tokens, including 4,076,805 explicitly attributed to Waypost roles (21.5144% of covered spans).

This is instrumentation, not demonstrated token savings or subscription-quota accounting. Full retained-history totals remain unknown: 337 compressed files were skipped, 20 contexts have unknown initial prefixes and one context was quarantined. No live model benchmark, full npm suite or Windows/Linux runtime validation was performed. Further optimization and a fixed-cohort savings comparison remain follow-up work.

Acceptance evidence: AC1–AC4 are covered by `tests/token-codex.test.mjs` plus the existing Claude/navigation regression suites; AC5 is recorded in the technical notes and parent epic. Independent reviewer: `codex_accounting_reviewer`, accepted 2026-10-16. Lifecycle status is changed only through `waypost story close`.

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

Local Desktop 0.162.0-alpha.17.2 metadata confirmed that several native `id` values share one `session_id` label. Requiring equality would discard subagents; merging by the label would double-count or combine counters. The native id is the ownership key, and same-id conflicting headers are checked before project filtering, including invalid headers with a visible id.

Independent review found the project-filter identity gap and a late unknown prefix that could falsely produce zero for a preceding window. Both were corrected and regression-tested. Unknown-prefix completeness uses overlap between creation/first-snapshot and the requested window; a wholly pre-period baseline still permits measured later deltas.

Root-observed targeted run: `node --test tests/tokens.test.mjs tests/token-navigation.test.mjs tests/token-codex.test.mjs`, 74 passed / 0 failed; log `/tmp/waypost-token-plan-20261016/targeted-tests.log`. The actual offline baseline ran through the heavy-resource guard after temporary CPU/memory refusal, without bypassing it. The parent epic records the period, values, analyzer hashes and limitations; the full source manifest is `/tmp/waypost-token-plan-20261016/codex-baseline.json` (scratch, not committed).

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-16*
