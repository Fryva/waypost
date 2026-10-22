---
type: story
id: "story-avoid-duplicate-title-snippets-in-vault-search"
epic: "WP-21"
title: "Avoid duplicate title snippets in vault search"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-22
updated: 2026-10-22
external_refs: {}
tags: []
code_refs: ["bin/cli/views.mjs", "tests/scripts.test.mjs", "tests/harness.test.mjs", "docs/cli-reference.md"]
specs: []
started_at: "2026-10-22T23:52:55.100Z"
closed_at: "2026-10-22T23:56:34.574Z"
plan_updated_at: "2026-10-22T23:52:55.100Z"
---

# Avoid duplicate title snippets in vault search

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Search prints each artifact title, then often repeats that same title in the
first matched frontmatter line. For exact title-field matches, print the title
once with the matching line number. Preserve all result paths/statuses and all
other matching snippets. This is compact presentation under accepted ADR-0008.

## Decomposition

- [x] Recognize only exact title-field duplicates within parsed frontmatter.
- [x] Combine their line locator with the existing full title.
- [x] Verify preserved search semantics and measure frozen fixture output.

## Implementation Plan

Update only `handleSearch` in bin/cli/views.mjs. Reuse parsed frontmatter and
body boundary to distinguish metadata from body text. Compact only an exact
plain/JSON-quoted/YAML-single-quoted scalar representation of the parsed string
title; comments, other fields, body lines, missing/malformed titles and unusual
representations retain the existing snippet. Keep literal matching, traversal,
first-hit selection, ordering, limit/more indicator and iCloud warnings unchanged.
The compact title gains `(line N)` and its duplicate snippet is omitted.

Add integration controls using existing makeVaultProject/runBinRaw, including
CRLF/BOM, quoting, body and comment fallbacks, paths/status and limit behavior.
Measure identical fixture inputs with before/after source hashes; record chars
and bytes without a native-token or weekly-quota claim. Run targeted tests via
heavy gate, then fresh-context review before lifecycle close.

## Acceptance Criteria

- [x] Exact duplicate title-field matches print the full title once and retain the original line number, path and status, including BOM/CRLF and supported quotes. — evidence: exact-title integration test, 12 format/line-ending cases.
- [x] Other matches preserve the existing snippets and matching/traversal/order/limit/iCloud behavior; body and comment text is never suppressed as a title duplicate. — evidence: 11 exact fallback-output controls; limit/literal/iCloud/symlink regressions.
- [x] Source-bound targeted tests pass; a frozen before/after fixture records actual text reduction with no claim of native-token savings. — evidence: verification.json and measurement.json in the retained experiment directory.

## Final Summary

Search now combines an exact matching title scalar with its line locator, so
path/status/title/line remain available without repeating the title as a snippet.
Recognition uses the parsed-header boundary and full raw scalar, before snippet
truncation. Canonical JSON escaping and YAML doubled quotes are compared exactly;
other representations, comments, duplicate unequal keys, malformed quotes, block
scalars, empty/missing titles, body and path-only hits use the original output.
No changes to search selection, traversal, ordering, limits or diagnostics.

A fixed real-vault query for ADR-0008's full title, filtered to ADRs, decreased
from **159 to 101 characters and UTF-8 bytes (36.48%)**. The source artifact SHA256
was unchanged; path/status/title/line4 survived. This is one title-match example,
not a universal reduction or native-token/quota/product-savings measurement.

Heavy-gated targeted checks: **13/13 passed** on Node25.6.1/macOS, including CLI
migration module ceilings, namespace/closure checks and context budgets. Full
suite/Node20/22/24matrix not run locally. Previous commit4d58d39's GitHub CI passed;
that does not validate this new patch. Fresh-context `waypost-reviewer`: story closed / commit, no actionable findings.
Reviewer independently checked source/log hashes, live query and measurement.
Doctor: 0 issues, two pre-existing WP-18 code-ref warnings.

## Technical Notes

No changes to role prompts, quality gates, native pilots or closed experiment
budgets. Keep title-less/malformed records on the old output path.

## Dependencies

- Accepted ADR-0008.

## Attachments

- `.waypost/experiments/wp21-search-title-20261022/`: before/after stdout, artifact/source hashes, measurement, full test log and verification manifest (local evidence).

---

*Last updated: 2026-10-22*
