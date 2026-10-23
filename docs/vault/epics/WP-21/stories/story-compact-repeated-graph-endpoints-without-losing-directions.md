---
type: story
id: "story-compact-repeated-graph-endpoints-without-losing-directions"
epic: "WP-21"
title: "Compact repeated graph endpoints without losing directions"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-23
updated: 2026-10-23
external_refs: {}
tags: []
code_refs: ["bin/cli/views.mjs", "tests/scripts.test.mjs", "tests/harness.test.mjs", "docs/cli-reference.md"]
specs: []
started_at: "2026-10-23T01:51:53.606Z"
closed_at: "2026-10-23T01:56:36.525Z"
plan_updated_at: "2026-10-23T01:51:53.606Z"
---

# Compact repeated graph endpoints without losing directions

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

A graph query prints its target path once in the header, then repeats that same
path in every adjacent edge. Use in/out/self direction labels relative to the
header so the same edge facts cost less context, without dropping displayed rows.

## Decomposition

- [x] Compact only canonical rows with an endpoint equal to the full query key.
- [x] Preserve exact triples, both directions, self loops and conservative fallbacks.
- [x] Measure frozen output and independently review the result.

## Implementation Plan

In handleGraphQuery's edge presentation loop, recognize an unambiguous three-cell
row. If both endpoints equal the query, print `self KIND`; if only the source
matches, print `out KIND: TARGET`; if only the destination matches, print
`in KIND: SOURCE`. The full query path remains the header. Keep the original full
arrow representation for malformed/ambiguous table shapes and rows where neither
endpoint equals the query (including substring/candidate-only matches).

Do not change selection, normalization, section grouping, order, node metadata,
edge count, sixty-row cap, remainder or errors. Preserve every shown edge's full
other endpoint and kind. No graph schema/generator changes. Document that labels
are relative to the query path. Extend existing generated/overflow regressions
and add self-loop/fallback/long-path controls. Retain a frozen actual graph and
before/after stdout; reconstruct and compare all sixty original directed triples.
Run targeted graph/search/CLI/context checks via heavy gate, then independent
review before lifecycle close.

## Acceptance Criteria

- [x] Compact edge rows retain the original kind, both endpoint identities and direction, including self loops, long paths and future kinds. — evidence: independent round-trip regression with self/in/out, Unicode and long paths on LF/CRLF.
- [x] Conservative fallbacks and all selection, node, count, order, cap/remainder and error behavior remain unchanged. — evidence: overflow and normalization/error regressions, exact fallback strings for six ambiguous/noncanonical shapes.
- [x] Source-bound targeted checks pass; frozen before/after output preserves all shown triples and records actual size reduction without a native-token/quota claim. — evidence: measurement.json and verification.json, 22/22 checks passed.

## Final Summary

Canonical exact-endpoint edges now use in/out/self relative to the unchanged
query header. The complete other endpoint and kind remain visible. Self loops
remain explicit. Noncanonical rows, delimiter-bearing kinds and matches without
an exact endpoint keep the previous full-arrow representation. Selection, node
metadata, count/order/cap/remainder, diagnostics and graph schema are unchanged.

Frozen actual graph SHA256
`c6a529cc57da0ce7379460f82b827fad11a93f1e73bde929f392cc605bdf89ae`,
query `epics/WP-21/epic.md`: 98 total edges, same 60 shown and 38 remaining.
Before **7505 characters/7750 UTF-8 bytes**, after **6365/6370** (17.81% fewer
bytes). All sixty ordered directed triples were independently reconstructed and
matched the baseline; node/header and remainder matched byte-for-byte. This is
lossless edge presentation on one frozen example, not native-token/quota savings.

Heavy-gated targeted checks: **22/22 passed** on Node25.6.1/macOS, covering graph,
search, round-trip/fallback/overflow, query/context budgets and CLI guards. No
local fullsuite or Node20/22/24matrix. Fresh-context reviewer: story closed / commit, no actionable findings. Independently
verified source/log hashes and replayed all sixty ordered triples against baseline
and graph input. Doctor: zero issues, two pre-existing WP-18 code-ref warnings.

## Technical Notes

Accepted ADR-0008 covers compact default presentation. No new flags, schemas,
role/model changes, native pilot or historical budget changes.

## Dependencies

- Existing bounded graph query and canonical three-cell edge table.

## Attachments

- `.waypost/experiments/wp21-graph-endpoints-20261023/`: frozen graph, before/after stdout, source hashes, measurement, test log and verification manifest (local evidence).

---

*Last updated: 2026-10-23*
