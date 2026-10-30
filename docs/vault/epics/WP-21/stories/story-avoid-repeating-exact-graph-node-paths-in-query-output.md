---
type: story
id: "story-avoid-repeating-exact-graph-node-paths-in-query-output"
epic: "WP-21"
title: "Avoid repeating exact graph node paths in query output"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-30
updated: 2026-10-30
external_refs: {}
tags: []
code_refs: ["bin/cli/views.mjs", "scripts/graph.mjs", "tests/scripts.test.mjs", "tests/harness.test.mjs", "tests/state-migrate.test.mjs", "docs/cli-reference.md", "docs/vault/adr/0008-token-budget.md"]
specs: []
started_at: "2026-10-30T00:06:29.743Z"
closed_at: "2026-10-30T00:20:16.894Z"
plan_updated_at: "2026-10-30T00:06:29.743Z"
---

# Avoid repeating exact graph node paths in query output

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

A graph query prints the full query path in its header and repeats it in the exact node row. Omit only that repeated canonical node cell, retaining all metadata, directions, edges and fallback rows, and measure the resulting text token counts.

## Decomposition

- [x] Compact only exact four-cell rows from the canonical Nodes section, preserving all other query output and documenting the header context. — evidence: bin/cli/views.mjs:28; bin/cli/views.mjs:35; docs/cli-reference.md:15
- [x] Verify reconstruction of node fields, exact edge/fallback/error output and caps for LF/CRLF, Unicode/long/partial/malformed/extra-column cases. — evidence: tests/scripts.test.mjs:678; tests/scripts.test.mjs:740; .waypost/experiments/wp21-graph-node-output-20261029/comparison.json
- [x] Record source-bound actual frozen graph before/current text and offline token counts with semantic controls, focused tests/guards, Doctor, independent review and owned cleanup. — evidence: .waypost/experiments/wp21-graph-node-output-20261029/{tokens.json,tokenizer-proof.json,validation.json,diagnostics.json,reviewer.json,cleanup.json}

## Implementation Plan

Keep the original graph matching, line order, section detection, header normalization and edge pipeline. Store each non-edge row with whether it came from exact ## Nodes. In node rendering parse only the canonical four-cell form Path|Title|Type|Status with standard spaces, no embedded pipe and no `·` character anywhere in metadata; if its Path is exactly the normalized header needle, display only Title · Type · Status with the former whitespace normalization. The canonical table header always keeps its full display, including --for Path. All other rows retain the old full display, including same row text in an unknown section. No type registry, row-count limit, graph-generator/schema/JSON or search changes. Source-bound tests reconstruct canonical rows only; no universal decoder of malformed mixed stdout is promised. Tests reconstruct all four fields using the unchanged header and preserve all fallback and edge text byte-for-byte. Frozen actual graph replay compares baseline/current node semantics, all other lines/status/stderr; measure representative full command output under o200k_base and cl100k_base in an owned temporary pinned tokenizer runtime with offline counting/roundtrip/repeat checks. No native inference or subscription mapping. Run targeted graph/query/CLI guards through heavy admission; record source/runtime/input/log hashes, Doctor, independent acceptance and owned cleanup. Update CLI reference to explain node metadata inherits the path header.

## Acceptance Criteria

- [x] Exact canonical node rows omit only the duplicate header path, preserving title/type/status order and full node identity via the unchanged normalized header; selection, edges/cap/remainder, graph schema/JSON and errors unchanged. — evidence: bin/cli/views.mjs:28; bin/cli/views.mjs:35; tests/scripts.test.mjs:678
- [x] Partial/substring, unknown-section, noncanonical/embedded-pipe/extra-column/metadata-delimiter-character rows remain full; source-bound semantic reconstruction and LF/CRLF/Unicode/long-path cases prove unchanged shown facts and fallback/edge bytes. — evidence: tests/scripts.test.mjs:740; .waypost/experiments/wp21-graph-node-output-20261029/comparison.json
- [x] Actual frozen graph before/current outputs have measured lower raw-text token counts in named offline encodings with roundtrip/repeat controls; relevant tests/guards pass, independent reviewer accepts, Doctor clean, owned scratch removed. Do not infer whole-task/native-token/quota savings. — evidence: .waypost/experiments/wp21-graph-node-output-20261029/{tokens.json,tokenizer-proof.json,validation.json,diagnostics.json,reviewer.json,cleanup.json}

## Final Summary

Exact canonical node metadata inherits the unchanged header path; fallback/edge/header/error behavior is unchanged. Source-bound frozen actual graph replay reconstructs canonical Path/Title/Type/Status and compares every other output line. Mixed duplicates, partial/title matches, unknown section with identical row, missing/extra columns, raw/escaped pipe, metadata delimiter including cell-boundary variants, table header and LF/CRLF with 0/60/61/65 edges pass. Actual before/current CLI matches extracted functions. Offline tiktoken 0.14.0 o200k_base full-output counts: actual ADR 77 to 69 (-10.39%); actual longest node 155 to 112 (-27.74%); long Unicode mixed fixture 551 to 467 (-15.25%). cl100k_base:75 to 67,151 to 110,554 to 470. All encode/decode roundtrip and repeat controls pass; network attempts while counting0, native inference calls by runner0; installation/cache warm used public package/assets separately. Initial harness failure from script tokenize.py shadowing Python stdlib was retained, corrected by renaming count-output-tokens.py; production unchanged. Graph/query suite12/12 and module/routine/subprocess guards4/4 passed, fail/skip/cancelled0. Source/runtime hashes stable; own temporary tokenizer/runtime/cache/tools removed. Initial independent review found a canonical Title/Type trailing-middle-dot ambiguity; tightened fallback to ANY middle dot and added boundary regressions. Repeated source-bound replay and both suites pass; all six measured input hashes remain identical to original tokenizer run, so original exact counts are reused with a separate binding proof. Fresh corrected-snapshot reviewer accepted all criteria without findings;651 SHA checks/579 union identities match, pre-close Doctor0issues/warnings. These are raw-text encoding counts for these fixed inputs, not whole-task/native-model/quota savings or a universal decoder of malformed output.

## Technical Notes

Canonical generated node schema is Path | Title | Type | Status, without an id column. Escaped/raw embedded pipes are ambiguous to this lens and keep full fallback. Preserve existing trim behavior on the three retained cells. A matching node row outside ## Nodes must not be compacted even if the same row text occurs within Nodes. No changes to graph generation, reads or query coverage.

## Dependencies

-

## Attachments

- Local retained evidence: `.waypost/experiments/wp21-graph-node-output-20261029/`.

---

*Last updated: 2026-10-30*
