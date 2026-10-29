---
type: story
id: "story-retain-only-requested-search-results-while-counting-every-match"
epic: "WP-21"
title: "Retain only requested search results while counting every match"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-29
updated: 2026-10-29
external_refs: {}
tags: []
code_refs: ["bin/cli/views.mjs", "tests/scripts.test.mjs", "tests/harness.test.mjs", "tests/state-migrate.test.mjs", "docs/cli-reference.md", "docs/vault/adr/0008-token-budget.md"]
specs: []
started_at: "2026-10-29T11:40:07.904Z"
closed_at: "2026-10-29T11:47:22.426Z"
plan_updated_at: "2026-10-29T11:40:07.904Z"
---

# Retain only requested search results while counting every match

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Search retains and formats every matching result before displaying only the requested limit, and stores iCloud paths only to print their count. Bound these retained collections without changing the report or cutting traversal short.

## Decomposition

- [x] Separate total matches from the limited retained result prefix; count iCloud placeholders without storing paths. — evidence: bin/cli/views.mjs handleSearch; reviewer.json.
- [x] Verify exact prefix/remainder and notices after the limit; preserve all existing search/safety contracts. — evidence: search.tap (14 passed); guards.tap (4 passed).
- [x] Record source-bound before/after work and byte parity, independent acceptance and owned cleanup. — evidence: comparison.json; validation.json; diagnostics.json; reviewer.json; cleanup.json.

## Implementation Plan

After the existing kind/content/path match succeeds, increment matched exactly once, then continue if the retained prefix already reaches limit. Only retained matches compute titleLine/excerpt and build a result object. Continue the entire walk, including recursion and placeholder accounting; never return or break at the limit. Render the retained prefix directly and derive remainder from matched-limit. Replace the unused placeholder path array with a scalar count. Keep validation, native ordering, canonical layout root, exclusions, symlink traversal and existing output bytes unchanged. Integration test a multi-directory fixture with matching/nonmatching kinds, late matches/placeholders, path-only matches and several limits. Source-bound old/current actual handler replay on the same owned fixture must preserve bytes and reads; instrument the result-array insertion and excerpt helper to count retained objects and formatting calls (not physical heap measurements). Run all search and focused CLI/module/routine/subprocess guards through heavy admission, freeze source/binary/log identities, independent review and remove owned runners/fixtures. No new API/ADR/native pilot.

## Acceptance Criteria

- [x] Retained result objects and title/excerpt formatting are bounded by the requested positive limit, total matches remain exact, and iCloud accounting stores only a count. — evidence: bin/cli/views.mjs; comparison.json (200 ->3 retained objects/excerpts, 25 ->0 cloud paths).
- [x] Full traversal, ordering, filtering, path-only matches, remainder, notices, layout-root/exclusion/symlink contracts and output bytes remain correct under source-bound search/safety regression checks. — evidence: validation.json (14+4 passed); comparison.json (stdout/error/202-read-list parity).
- [x] Same-fixture old/current replay shows exact output/read parity and lower retained-object/format-call counts for a broad query; independent review accepts, Doctor is clean and owned scratch data removed. No native-token/quota/physical-heap/latency/net saving is inferred from these counts. — evidence: comparison.json; reviewer.json (accepted, no findings); diagnostics.json (Doctor clean); cleanup.json (159,107 logical bytes removed).

## Final Summary

Search now counts all matching documents while retaining and formatting only the requested prefix; iCloud paths become a scalar count. Traversal/reads/filtering/rendered bytes remain unchanged. Source-bound Node 24.22.1/macOS: all 14 search tests and four CLI/module/routine/subprocess guards passed without failures/skips; 575 source identities and runtime binary stayed stable. Actual handler replay, instrumented only with equivalent result/path-array insertion wrappers and an excerpt-call counter: 200 matching documents at limit 3 retain 200 ->3 result objects and make 200 ->3 excerpt calls; stored iCloud path records 25 ->0, same 25-file notice. Exact stdout/error/read-list parity on this fixture plus 13 additional cases, including invalid limits, zero results, path-only/kind/literal/default/exact/above-limit requests. No physical heap/latency/native-token/quota/net saving is measured or inferred from these work counts. Owned runner/fixtures removed (cleanup.json); full evidence in attachment directory. Source-bound Doctor issue/warn/warning counts are zero; independent reviewer accepted all criteria with no findings. Current full CI follows publication; prior4215e04 CI40821385204 succeeded on Node20/22/24.

## Technical Notes

The entire vault is still read to count all matches and iCloud placeholders. Metadata parsing and current-file memory remain; this only bounds the retained result prefix and avoids formatting hidden results. Limits above the number of matches retain every result as before. Existing limit validation is unchanged.

## Dependencies

-

## Attachments

- Local retained evidence: `.waypost/experiments/wp21-search-retention-20261029/`.

-

---

*Last updated: 2026-10-29*
