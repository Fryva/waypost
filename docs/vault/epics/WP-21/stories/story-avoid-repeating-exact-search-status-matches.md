---
type: story
id: "story-avoid-repeating-exact-search-status-matches"
epic: "WP-21"
title: "Avoid repeating exact search status matches"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-04
updated: 2026-11-04
external_refs: {}
tags: []
code_refs: ["bin/cli/views.mjs", "tests/scripts.test.mjs", "docs/cli-reference.md"]
specs: []
started_at: "2026-11-04T19:43:20.198Z"
closed_at: "2026-11-04T19:53:02.285Z"
plan_updated_at: "2026-11-04T19:43:20.198Z"
---

# Avoid repeating exact search status matches

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

An exact status search hit repeats the status already displayed by the path. Retain its original line number once with the status, removing only the redundant snippet.

## Decomposition

- [x] Add a private statusLine only for the first exact canonical status scalar within parsed frontmatter; retain status value and locator on the path.
- [x] Preserve all matching, ordering, limits/counts/iCloud, snippets for body/ambiguous metadata, title handling, flags/errors and read contracts.
- [x] Verify actual baseline/current CLI output and raw-text tokens; run search/CLI guards/state migration, Doctor and fresh independent review.

## Implementation Plan

In bin/cli/views.mjs handleSearch, mirror existing exact titleLine eligibility locally for status (no parser/helper/export change). First hit only, inside parsed header, nonempty string fm.status; reject status values containing parentheses, semicolon or CR/LF. Scalar must exactly equal JSON.stringify(status), canonical YAML single-quoted spelling or a non-quoted/non-block bare scalar equal to parsed status. Comments/junk/malformed quotes/duplicate-key mismatch/body/path hits keep old snippet. Store private searchStatusLine in bounded retained hit; render `path  (status; line N)` only when eligible, retain title row and suppress only redundant status snippet. Existing titleLine guards and search logic unchanged. Search has no JSON branch; --json keeps current text behavior. Extend tests/scripts.test.mjs and CLI reference. Source-bound old/current real CLI pairs on identical fixtures and frozen real vault prove scoped differences plus metadata/path/line facts, limit/remainder/late iCloud and fallback controls. Pinned offline tiktoken0.14.0 full stdout in o200k_base/cl100k_base. No native pilot/model/allocation/API or architecture decision.

## Acceptance Criteria

- [x] Exact eligible hits show status and original locator once; all other search facts/behavior and fallback controls match baseline. — evidence: comparison.json (31CLI pairs); search-tests.stdout (21pass); tests/scripts.test.mjs status/fallback regressions.
- [x] Actual complete eligible CLI outputs save text tokens in both named encodings; focused checks, Doctor and fresh review pass. — evidence: tokens.json; commands.json; Doctor stdout; outer-heavy-original-records.jsonl; independent search_status_reviewer: story closed / commit, no findings.

## Final Summary

Added only a private exact status locator and display deduplication, analogous to existing titleLine. Canonical first header matches render `(status; line N)` and retain title; redundant status snippet omitted. Unsafe delimiters, null/empty, comments/junk, noncanonical escaping/quotes, unequal duplicate keys and body/path/earlier-title hits keep previous output. Matching, traversal, retention/count/limit/iCloud, excerpts, error/flag behavior, parser/exports/schema unchanged. Search --json remains text.

Confirmed Node24.22.1/macOS:21search+14CLI namespace/module/size/routine+37state-migration=72pass,2state skips,0fail. Doctor exit0,0issues/warnings; heavy26389exit0. Checked source/runtime identities stable.31actual old/current CLI pairs over frozen real vault, canonical bare/quoted/Unicode/0/false/whitespace/long status, BOM/CRLF and fallback/unsafe/null/comment/junk/dups/body/path/title/kind/no-match/invalid-limit controls, mixed limit/remainder/lateiCloud and --json behavior. Eligible path/status/locator source facts and raw snippet reconstruction match baseline full stdout; unchanged controls byte-identical; stderr/status preserved. Decoder is source-bound to these canonical source/known-prefix-query fixtures, not universal parsing of mixed human output.

Pinned offline tiktoken0.14.0 full real search `status: done --kind story --limit20`:1103→1023o200k_base and1099→1019cl100k_base(-80,7.253%/7.279%). Bare18→14 both; BOM/CRLF untitled16→11 both; mixed-limit71→59/70→58. All measured changed outputs save text tokens in both encodings; controls exact. Package/table/input/runtime hashes, UTF-8/token roundtrip/repeat, denied socket/DNS and0network attempts during counting retained.0native inference calls BY RUNNER; operator/reviewer usage unmeasured. No model mapping/framing/cache/reasoning/reread/native/quota/net workflow saving claim.

Evidence `.waypost/experiments/wp21-search-status-20261104/` retains baseline, frozen real vault/limit fixture, full stdout/stderr/status, exact runner/counter/commands/full logs, tokenizer proof and cleanup. Attempt1 heavy99110exit1 before tests: decoder mistook unchanged unsafe literal `(done; line7)` for new locator; only probe corrected to compare unchanged controls byte-for-byte and expand changed outputs. Production/tests unchanged between attempts; failed evidence retained. Final owned scratch tool/venv/encodings/fixture and first scratch removed without following symlink targets. Fresh independent search_status_reviewer accepted all AC/decomposition items: story closed / commit, no findings;7review SHA match,1006inputs match except later story prose,31pairs(12changed/19exact). Four original call/output JSONL records bind heavy26389 initial and exit0 completion without rerunning tests. Previousee3bee3 full CI41898843257 remained in_progress at last check; no unobserved full cross-version/platform/native proof.

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-11-04*
