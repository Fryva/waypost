---
type: story
id: "story-keep-search-matches-visible-within-the-existing-excerpt-budget"
epic: "WP-21"
title: "Keep search matches visible within the existing excerpt budget"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-25
updated: 2026-10-25
external_refs: {}
tags: []
code_refs: ["bin/cli/views.mjs", "tests/scripts.test.mjs", "tests/harness.test.mjs", "docs/cli-reference.md"]
specs: []
started_at: "2026-10-25T04:54:41.622Z"
closed_at: "2026-10-25T05:00:45.508Z"
plan_updated_at: "2026-10-25T04:54:41.622Z"
---

# Keep search matches visible within the existing excerpt budget

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Search previews can show only the beginning of a long code_refs/body line while hiding the actual matched term, forcing additional reading. Keep the useful match visible within the existing preview budget under accepted ADR-0008.

## Decomposition

- [x] Add a private match-aware excerpt helper without changing search selection.
- [x] Preserve legacy previews whenever the match is already visible.
- [x] Verify bounded Unicode-safe new windows and independent review.

## Implementation Plan

Independent planner located handleSearch in bin/cli/views.mjs (not evaluation-source). Retain the same escaped case-insensitive OR regexp, first hit line, trim, result/status/title/line/limit/order/iCloud semantics. If the existing first120UTF16units already contain a full regexp match (or the line is short), keep those bytes. If trim removes the match (significant leading/trailing whitespace in the query), fall back to the original120-unit prefix. Otherwise use the first surviving match position in trimmed text and a bounded window with truncation markers inside120units. Do not split surrogate pairs at NEW window boundaries. Long matches that cannot fit with required markers show an explicitly clipped fragment. No public helper/export, new flag or JSON interface. Add body/code_refs, literal/mixed/OR/indent/CRLF/Cyrillic and whitespace-sensitive fallback,119-121/long-query/surrogate boundary regressions; preserve existing search cases and CLI budgets. Freeze owned fixture and actual ADR-0001/0003 outputs; prove only hidden-match snippets change, then source-bound heavy tests and fresh review.

## Acceptance Criteria

- [x] Hidden late matches surviving trim become visible in bounded120-unit excerpts; long matches show bounded marked fragments and new boundaries do not split valid surrogate pairs.
- [x] Short lines and already-visible matches remain byte-identical; selection/first-hit/title/status/path/line/order/limit/iCloud and flags unchanged.
- [x] Frozen fixture and real ADR outputs preserve all non-snippet text; inverse source proof leaves only the helper/call edit.
- [x] Meaningful regressions and existing search/CLI character/namespace/byte budgets pass through heavy admission; doctor zero issues/warnings.
- [x] Independent reviewer verifies acceptance; no native-token/quota savings claim without measurement.

## Final Summary

Private searchExcerpt now keeps late body/code_refs matches visible within the existing 120 UTF-16-unit budget including truncation markers. Short/already-visible previews and trim-sensitive fallback stay exact; selection/title/path/status/locator/order/limit/iCloud semantics remain unchanged. Long queries can show marked fragments; new boundaries do not split surrogate pairs.

Evidence: .waypost/experiments/wp21-search-match-excerpts-20261025/ contains source-bound validation, full log, baseline/current manifests, frozen input/output pairs and inverse-source proof. Twenty-one replay cases: twelve change only snippets, nine byte-identical; real ADR-0001 preview unchanged and ADR-0003 now exposes scripts/doctor.mjs, with non-snippet output unchanged. Node24.21.0 heavy run: 237/237 passed, zero failures/skips, exit0,104.462s; syntax/package and existing CLI budgets/namespace pass; doctor0issues/0warnings. Independent reviewer ship, no findings, verified12source/12baseline hashes,8dirty inputs and log/pack identities. No native-token/quota/workflow saving measured. Baseline CI40159971344 passed; follow-up CI is checked after publication.

All decomposition and acceptance criteria verified by the independent reviewer. Temporary owned fixture and npm cache removed after review; receipts retained. No new native pilot or budget change.

## Technical Notes

The budget is120UTF16units, including ellipsis markers. This is search quality within an existing context bound, not measured workflow/token savings. No native pilot/budget change. Remove owned fixture/scripts/cache after review and retain receipts.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-25*
