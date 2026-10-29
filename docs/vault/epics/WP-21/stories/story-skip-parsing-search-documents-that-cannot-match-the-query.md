---
type: story
id: "story-skip-parsing-search-documents-that-cannot-match-the-query"
epic: "WP-21"
title: "Skip parsing search documents that cannot match the query"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-29
updated: 2026-10-29
external_refs: {}
tags: []
code_refs: ["bin/cli/views.mjs", "tests/scripts.test.mjs", "scripts/lib-frontmatter.mjs", "tests/harness.test.mjs", "tests/state-migrate.test.mjs", "docs/vault/adr/0008-token-budget.md"]
specs: []
started_at: "2026-10-29T18:16:14.564Z"
closed_at: "2026-10-29T18:24:13.482Z"
plan_updated_at: "2026-10-29T18:16:14.564Z"
---

# Skip parsing search documents that cannot match the query

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Search parses frontmatter and scans lines even when its escaped literal query cannot occur anywhere in either document text or path. Reject only these negative candidates before parsing, preserving every existing matching and reporting gate.

## Decomposition

- [x] Add a negative-only text/path prefilter before frontmatter parsing. — evidence: bin/cli/views.mjs handleSearch; reviewer.json.
- [x] Verify mixed positive/negative, literal/multiline/empty/path/kind cases and existing search/safety contracts. — evidence: search.tap (18 passed); guards.tap (4 passed).
- [x] Record source-bound parse/line-call reduction with byte/error/read parity, independent acceptance and owned cleanup. — evidence: comparison.json; validation.json; diagnostics.json; reviewer.json; cleanup.json.

## Implementation Plan

Immediately after successful readFileSync add if (!re.test(text) && !re.test(r)) continue. Existing re is an OR of escaped literals with only flag i: any old line/path match implies a complete text/path match. A whole-text match across LF is only a candidate and must still pass unchanged kind/firstSearchLine/path checks. Do not accept a candidate directly, introduce g/y/anchors, move iCloud counting or break the walk. The pure parseFrontmatter dependency stays unchanged. Integration fixture mixes negatives, body/title/path-only positives, wrong kind, literal metacharacters and late placeholders; existing empty/multiline cases remain. Source-bound actual handler replay wraps the actual parser/scanner to count calls on the same mostly-negative owned fixture and compares stdout/errors/exact reads; include positive-heavy controls and explicit whole-text cross-LF false-positive rejection. Run all search and four CLI/module/routine/subprocess guards through heavy admission with source/binary/log identities, Doctor, independent review and owned cleanup. No new API/helper/ADR/flag/native model run.

## Acceptance Criteria

- [x] Files with neither text nor path query candidate skip frontmatter parsing and line scanning; all positive candidates still pass the unchanged kind/line/path gates with no false negatives or cross-LF acceptance. — evidence: bin/cli/views.mjs; comparison.json selective/cross-LF/empty/path/kind controls.
- [x] Exact output/error/read/traversal order, counts/limits, literal/empty/path/kind and layout/exclusion/symlink/iCloud contracts remain correct under source-bound regression and safety checks. — evidence: validation.json (18+4 passed); comparison.json (stdout/error/read parity).
- [x] Mostly-negative same-fixture replay records fewer actual parser/scanner calls with byte/error/read parity; independent review accepts, Doctor is clean and owned scratch removed. No universal latency/I/O/physical-heap/native-token/quota/net savings inferred. — evidence: comparison.json (parser 201 ->4, scanner 200 ->3; positive test overhead retained); reviewer.json (accepted, no findings); diagnostics.json (Doctor clean); cleanup.json (444,239 logical bytes removed).

## Final Summary

Added only a negative text/path literal prefilter before the unchanged pure parser and line/kind/path gates. Full reads/traversal, reporting and cross-LF rejection remain. Source-bound Node 24.22.1/macOS: all 18 search tests and four CLI/module/routine/subprocess guards passed, fail/skip zero; 575 source identities and runtime binary stable. Same actual-handler selective-query fixture: parser calls 201 ->4, scanner calls 200 ->3, delegated regex test calls 21,797 ->722; stdout/error/exact read-list parity. Positive-heavy empty-query control keeps parser/scanner counts and adds regex test calls 200 ->401: no universal speedup claimed. Sixteen additional parity cases cover path-only, kind, invalid limits, literal flags/metacharacters, cross-LF rejection/OR, BOM/CRLF/CR/Unicode and empty input/query. Equivalent parser/scanner/regex-method wrappers count logical calls, not latency/heap/I/O/native-token/quota/net savings. Owned runner/fixtures removed (cleanup.json). Source-bound Doctor issue/warn/warning counts are zero; independent reviewer accepted all criteria without findings; current full CI follows publication. Prior9c3997f CI40876577438 succeeded on Node20/22/24.

## Technical Notes

Complete file/vault reads remain. Positive candidates pay an additional whole-text regex test, so this is not a universal runtime speedup. Correctness relies on the existing stateless escaped-literal OR regex; do not reuse this proof for anchored/lookaround/global/sticky patterns. Whole-text cross-LF matches must be rechecked at line level.

## Dependencies

-

## Attachments

- Local retained evidence: `.waypost/experiments/wp21-search-prefilter-20261029/`.

-

---

*Last updated: 2026-10-29*
