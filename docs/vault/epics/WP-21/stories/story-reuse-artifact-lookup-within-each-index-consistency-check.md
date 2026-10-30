---
type: story
id: "story-reuse-artifact-lookup-within-each-index-consistency-check"
epic: "WP-21"
title: "Reuse artifact lookup within each index consistency check"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-30
updated: 2026-10-30
external_refs: {}
tags: []
code_refs: ["scripts/doctor-generated.mjs", "tests/doctor-generated.test.mjs", "docs/vault/adr/0008-token-budget.md"]
specs: []
started_at: "2026-10-30T11:42:33.771Z"
closed_at: "2026-10-30T11:47:05.204Z"
plan_updated_at: "2026-10-30T11:42:33.771Z"
---

# Reuse artifact lookup within each index consistency check

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Index checking repeats a linear artifact search for every README row. Prepare a private path lookup once per synchronous check without changing diagnostics.

## Decomposition

- [x] Replace repeated find with lazy first-wins path lookup. — evidence: scripts/doctor-generated.mjs:64
- [x] Verify duplicate paths, freshness, cold input and complete findings. — evidence: tests/doctor-generated.test.mjs:66; .waypost/experiments/wp21-index-lookup-20261030/comparison.json
- [x] Run focused suites, logical-work comparison, Doctor and independent review. — evidence: .waypost/experiments/wp21-index-lookup-20261030/{validation,admission,doctor,reviewer}.json

## Implementation Plan

In scripts/doctor-generated.mjs checkIndexes only, initialize a Map on the first parsed row. Populate in original artifact order and retain the first object per rel, preserving Array.find semantics for the string rel constructed from README rows. Store artifact objects, not copied frontmatter. Use get for subsequent rows across folders in this invocation; no global cache. Leave indexed sets, row parsing, unlisted scan, all finding fields/order and other checks unchanged. Inputs are Doctor stable artifact snapshots, not mutable getters/proxies within a call. Add persistent tests for duplicate first-wins and same-array edits between calls. Compare baseline/current full findings and logical row-search work for a large valid fixture, with no wall-clock/token claim. Check lazy no-row behavior, missing rows, cross-folder/order and existing read errors. Run focused generated-view tests and CLI/module guards through heavy admission; preserve source/log hashes; Doctor and fresh acceptance before closing.

## Acceptance Criteria

- [x] One lazy path lookup per invocation preserves first matching artifact, full ordered findings and input immutability; no rows require no lookup; later calls observe changed same-array objects. — evidence: tests/doctor-generated.test.mjs:66; tests/doctor-generated.test.mjs:96; .waypost/experiments/wp21-index-lookup-20261030/comparison.json
- [x] Source-bound baseline/current comparison preserves full diagnostics and shows fewer row-search operations; focused suites/guards pass, Doctor is clean and independent reviewer accepts. No text-token/native-token savings claimed. — evidence: .waypost/experiments/wp21-index-lookup-20261030/{comparison,validation,doctor,reviewer}.json

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

No new dependencies, API, JSON or output format. Map equality differs from === for NaN, but every queried rel is a string. Public callers supply the normal stable artifact object snapshot; malformed getters and mutation during a synchronous invocation are outside this cache contract.

## Dependencies

-

## Attachments

- Local evidence: `.waypost/experiments/wp21-index-lookup-20261030/`.

---

*Last updated: 2026-10-30*
