---
type: story
id: "story-share-adjacent-graph-edge-labels-in-query-output"
epic: "WP-21"
title: "Share adjacent graph edge labels in query output"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-04
updated: 2026-11-04
external_refs: {}
tags: []
code_refs: ["bin/cli/views.mjs", "tests/scripts.test.mjs", "docs/cli-reference.md"]
specs: []
started_at: "2026-11-04T18:31:08.356Z"
closed_at: "2026-11-04T19:37:26.591Z"
plan_updated_at: "2026-11-04T18:31:08.356Z"
---

# Share adjacent graph edge labels in query output

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Graph queries repeat direction and relation kind for adjacent equivalent edge rows. Share only that label, retaining every complete endpoint and diagnostic fact.

## Decomposition

- [x] Group adjacent canonical out/in edges by exact direction and RAW kind, only for runs of at least five and strictly shorter UTF-8 text.
- [x] Preserve order, duplicate rows, self/fallback boundaries, 60-row cap, total/remainder, metadata, errors and generator/JSON behavior.
- [x] Verify source-bound old/new CLI facts and full-output token counts; run graph/CLI guards, state migration, Doctor and independent review.

## Implementation Plan

Modify only bin/cli/views.mjs handleGraphQuery display after existing selection. Classify each of the first60edges with existing canonical eligibility unchanged. Record old full text; out/in records additionally retain exact direction, kind and other endpoint. Emit adjacent equal-RAW-direction/kind runs under `  out kind:` or `  in kind:` with every exact endpoint prefixed by four spaces. Require at least5rows and shorter UTF-8 than old run. Any fallback or self row breaks the group; no sorting/deduplication or normalization. Preserve raw endpoint spaces and colons/kind punctuation; decode group header by removing final added colon and exactly4spaces from endpoint rows. Count/cap before grouping. Existing node metadata and noncanonical fallbacks remain unchanged. Update CLI reference and tests/scripts.test.mjs for threshold, LF/CRLF, directions/kinds, self/fallback boundaries, Unicode/colon/space endpoints and cap/remainder. Frozen actual CLI baseline/current comparisons and pinned offline tiktoken o200k_base/cl100k_base quantify full text; tests include full namespace/module/routine/size/state families. No new architecture/API/native pilot or allocation.

## Acceptance Criteria

- [x] Source-bound complete directed facts, order/duplicates, node/fallback/error text and cap/remainder match baseline; groups are strictly shorter UTF-8 and unique/small controls unchanged. — evidence: comparison.json (21actual CLI pairs); tests/scripts.test.mjs graph-query regressions.
- [x] Full actual CLI output saves text tokens on representative grouped cases in both named encodings; focused tests/Doctor and fresh independent review pass. — evidence: tokens.json; commands.json; Doctor stdout; independent edge_groups_reviewer: story closed / commit, no findings.

## Final Summary

Only graph-query text rendering changed: adjacent canonical out/in edges with exact direction and RAW kind share one label when at least5selected rows and strictly shorter UTF-8. Every full endpoint remains, including spaces, punctuation and duplicates. Self/fallback/type/direction boundaries, metadata, selection, first60cap, full count/remainder and error behavior preserved. CLI reference documents indented endpoints. Existing graph generation and JSON preview schema remain unchanged.

Confirmed Node24.22.1/macOS:12graph/JSON-preview+14CLI namespace/module/size/routine+37state-migration tests passed (63total),2state-migration skips,0fail. Doctor exit0,0issues/warnings. Heavy3632exit0. Source manifest and runtime hashes stable across all validation.21actual old/current CLI pairs over frozen real graph, LF/CRLF, in/out0/1/4/5/60/61/65, raw-space Unicode/colon endpoints, trailing-colon kind, duplicates, fallback/self/type boundaries, cap boundary, missing node and --for--json precedence. New group expansion recreates exact old stdout; stderr/status match. Changed complete outputs strictly shorter; unchanged controls byte-identical.

Pinned offline tiktoken0.14.0 full real WP21epic query:1812→1518o200k_base(-294,-16.225%);1787→1493cl100k_base(-294,-16.452%). Same result with --for--json (query precedence unchanged). Real ADR control69→69/67→67. Package/table/input/runtime hashes and UTF-8/token roundtrip/repeated counts retained, socket/DNS blocked during counting,0network attempts,0native inference calls BY RUNNER. No model mapping/native framing/cache/reasoning/reread/quota/net workflow saving claim; operator/reviewer usage unmeasured.

Evidence `.waypost/experiments/wp21-graph-edge-groups-20261104/`: frozen graphs/full stdout/stderr, baseline and checked source identities, exact commands/full logs, tokenizer proof, scratch cleanup. Owned scratch tool copies/venv/encoding cache removed using lstat without following symlink targets. Fresh independent edge_groups_reviewer accepted all AC/decomposition items: story closed / commit, no findings;7/7current review hashes match,1005validation inputs match except documented later story prose. Previous3f0cb26 CI status checked separately; no unobserved full cross-version/platform success claimed.

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-11-04*
