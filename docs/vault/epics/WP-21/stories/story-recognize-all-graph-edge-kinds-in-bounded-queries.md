---
type: story
id: "story-recognize-all-graph-edge-kinds-in-bounded-queries"
epic: "WP-21"
title: "Recognize all graph edge kinds in bounded queries"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-23
updated: 2026-10-23
external_refs: {}
tags: []
code_refs: ["bin/cli/views.mjs", "tests/scripts.test.mjs", "tests/harness.test.mjs", "docs/cli-reference.md"]
specs: []
started_at: "2026-10-23T01:27:05.370Z"
closed_at: "2026-10-23T01:32:39.621Z"
plan_updated_at: "2026-10-23T01:27:05.370Z"
---

# Recognize all graph edge kinds in bounded queries

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Graph queries classify edges by an outdated list of relation names. Current
relations such as epic-contains, spec-covers, wikilink, dead and ambiguous fall
into the node list and bypass the existing sixty-edge display cap. A node whose
title is a recognized old relation can also be misclassified. Classify rows by
the generated Nodes/Edges sections instead of guessing from cell contents.

## Decomposition

- [x] Route matching rows through their existing graph section.
- [x] Protect current/future edge types and node titles with regressions.
- [x] Measure bounded output on frozen graph input and review the result.

## Implementation Plan

Update only handleGraphQuery in bin/cli/views.mjs. Walk graph lines retaining
section state; collect matching table rows into node/edge arrays by section.
Do not change substring matching, input path normalization, ordering, row
formatting, missing-graph/query diagnostics or the existing sixty-edge cap and
remaining-count message. Do not enumerate relation kinds or modify graph.md's
schema/generator. Unknown future relation names in Edges must work automatically.

Use integration fixtures through makeVaultProject/runBinRaw. Cover incoming and
outgoing modern/legacy/unknown relations, node titles equal relation names,
escaped pipes, no edges, missing queries/graph, path normalization and overflow.
Retain frozen graph input and source hashes with baseline/after stdout; compare
size and exact preserved first-sixty edges plus named remainder. Run search and
graph regressions/CLI guards via heavy gate, then independent review before close.

## Acceptance Criteria

- [x] All matching edge rows are recognized regardless of kind, while matching node rows remain nodes regardless of title; original types and directions remain visible. — evidence: generated modern-relation regression and exact-output section-identity regression.
- [x] The existing sixty-edge cap and accurate remainder apply to modern/future edge kinds; matching, normalization, ordering and diagnostics are preserved. — evidence: LF/CRLF cases at 0/60/61/65 edges, incoming/outgoing and unknown-kind controls, missing graph/query and path normalization checks.
- [x] Source-bound targeted checks pass and frozen evidence records the actual output change without a native-token/quota saving claim. — evidence: retained verification.json/measurement.json and tests.log, 21/21 passed.

## Final Summary

Matching table rows now use their generated Nodes/Edges section, so every edge
kind follows the same existing sixty-edge bound and node titles cannot masquerade
as relation names. Matching, formatting, directions, file order, normalization and
error text are unchanged. Graph generation and schema are unchanged.

Frozen actual graph SHA256
`f443bbab7e5735e7bd5bce752f4e860ec7e55aa1a18418873bec4c1859e51c38`
contains one matching node and 94 edges for `epics/WP-21/epic.md`. Before: 11426
characters/11617 UTF-8 bytes, all edges incorrectly rendered as nodes. After:
7464 characters/7709 bytes (33.64% fewer bytes), 60 correctly typed edge rows and
an explicit 34-more message. This reduction restores an existing output bound;
it is not an equal-full-output compression or a native-token/quota saving claim.
The remaining rows are retained in the graph input.

Heavy-gated targeted checks: **21/21 passed** on Node25.6.1/macOS, including graph
golden/reconcile/parity, search regressions and CLI/context guards; the separate
one-test query-budget regression also passed (20+1 tests in two logs). No local full
suite or Node20/22/24matrix. Baseline cff3d8c CI39875058244 succeeded; it does not
validate this new patch. Fresh-context reviewer: story closed / commit, no actionable findings. Independently
verified baseline/current source hashes, both logs and frozen replay. Doctor: zero
issues and two pre-existing WP-18 code-ref warnings.

## Technical Notes

This repairs the existing bounded graph query under accepted ADR-0008. No role,
quality gate, graph schema, new native pilot or historical budget changes.

## Dependencies

- Existing generated graph Nodes/Edges sections; accepted ADR-0008.

## Attachments

- `.waypost/experiments/wp21-graph-query-20261022/`: frozen graph, before/after stdout, source hashes, measurement, test log and validation manifest (local evidence).

---

*Last updated: 2026-10-23*
