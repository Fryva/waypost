---
type: story
id: "story-find-the-first-search-line-without-splitting-the-entire-document"
epic: "WP-21"
title: "Find the first search line without splitting the entire document"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-29
updated: 2026-10-29
external_refs: {}
tags: []
code_refs: ["bin/cli/views.mjs", "tests/scripts.test.mjs", "tests/harness.test.mjs", "tests/state-migrate.test.mjs", "docs/cli-reference.md", "docs/vault/adr/0008-token-budget.md"]
specs: []
started_at: "2026-10-29T12:40:27.157Z"
closed_at: "2026-10-29T12:49:48.833Z"
plan_updated_at: "2026-10-29T12:40:27.157Z"
---

# Find the first search line without splitting the entire document

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Search splits every document into an array of all lines before finding its first matching line. A match near the beginning still materializes the unused suffix. Scan lines lazily without changing search semantics or output.

## Decomposition

- [x] Add a private LF scanner and use its first line/index in handleSearch. — evidence: bin/cli/views.mjs firstSearchLine and handleSearch; reviewer.json.
- [x] Verify scanner equivalence and actual CLI edge cases; preserve all search and safety contracts. — evidence: search.tap (16 passed, including 240 helper cases); guards.tap (4 passed).
- [x] Record source-bound before/after byte/read parity and line-materialization counts, independent acceptance and owned cleanup. — evidence: comparison.json; validation.json; diagnostics.json; reviewer.json; cleanup.json.

## Implementation Plan

Private firstSearchLine(text, re) near searchExcerpt uses indexOf LF and slice, returning the first {index,line} or null. Preserve CR/BOM/raw UTF-16, empty text and trailing empty lines exactly as split("\n"); do not match across LF. Use its index and line instead of full lines array and lines[hitLine]. Keep existing regexp, titleLine header-boundary split, parseFrontmatter, excerpt and path fallback unchanged. Existing findIndex already stops regex checks at the first hit: the measured gain is removing eager whole-document splitting, not fewer matching checks. Tests compile the actual private helper from the source and compare against split/findIndex over edge cases; actual CLI verifies early title hits with a long suffix, late hits, empty input/query and multiline literals/alternation. Run all search tests and focused CLI/module/routine/subprocess guards via heavy admission. Frozen actual-handler replay on the same owned fixture must preserve stdout/errors/read sequence; label equivalent instrumentation counting split-array elements versus scanner candidates, without physical heap/latency/I/O/native-token claims. Freeze source/binary/log identities; independent review and owned cleanup.

## Acceptance Criteria

- [x] First matching raw line/index exactly matches the prior LF split/findIndex semantics across empty/trailing LF/CRLF/BOM/Unicode/multiline cases; no whole-document lines array remains in search matching. — evidence: tests/scripts.test.mjs scanner/CLI regressions; bin/cli/views.mjs; search.tap.
- [x] Pointer/line/title/excerpt bytes, path fallback, counts/limits, canonical layout/exclusions/symlinks/iCloud and full vault traversal/read contracts pass source-bound regression and safety checks. — evidence: validation.json (16+4 passed); comparison.json (stdout/error/read parity).
- [x] Same-fixture before/after replay is byte/error/read equivalent and records the avoided unused line materialization for an early hit; independent review accepts, Doctor is clean and owned scratch data removed. No native-token/quota/physical-heap/latency/I/O/net savings claimed. — evidence: comparison.json (100,007 matching-split elements avoided, regex checks 3 ->3); reviewer.json (accepted, no findings); diagnostics.json (Doctor clean); cleanup.json (1,407,088 logical bytes removed).

## Final Summary

A private LF scanner now returns the first raw matching line/index without creating an array of every document line. Title/excerpt/path/count/layout/traversal behavior is unchanged. Source-bound Node 24.22.1/macOS: 16 search tests and four CLI/module/routine/subprocess guards passed, fail/skip zero; 575 source identities and runtime binary stayed stable. Actual source helper matches split/findIndex in 240 edge-case combinations; CLI cases include long early/late hits, CRLF/BOM, empty input/query and multiline literals/alternation. Frozen actual-handler replay on a 100,007-line early-hit document: whole-document matching split arrays 1 ->0 (100,007 elements ->0); regex checks remain exactly 3 in both versions. Header-boundary splitting remains and is deliberately outside that counter. Stdout/error/read-list parity holds there and in 16 additional scenarios. No physical heap/latency/I/O/native-token/quota/net savings measured or inferred. Owned runner/fixtures removed (cleanup.json). Source-bound Doctor issue/warn/warning counts are zero; independent reviewer accepted all criteria without findings; full current CI follows publication. Prior ce9be29 CI40868138375 verified success on Node20/22/24.

## Technical Notes

Full document reads and frontmatter parsing remain. Matching with no hit or a late hit may examine every line. The title guard still splits the parsed header; this change only removes the whole-document lines array in search matching. No new API/flag/ADR/dependency/native model run.

## Dependencies

-

## Attachments

- Local retained evidence: `.waypost/experiments/wp21-search-lines-20261029/`.

-

---

*Last updated: 2026-10-29*
