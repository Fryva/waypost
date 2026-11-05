---
type: story
id: "story-bare-link-resolution-import-failures-and-help-answer-without-needless-work"
epic: "WP-21"
title: "Bare-link resolution, import failures and help answer without needless work"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-05
updated: 2026-11-05
external_refs: {}
tags: []
code_refs: ["scripts/lib-links.mjs", "bin/waypost.mjs", "bin/cli/core.mjs", "tests/lib-links.test.mjs", "tests/harness.test.mjs"]
specs: []
started_at: "2026-11-05T05:37:12.838Z"
closed_at: "2026-11-05T06:18:35.684Z"
plan_updated_at: "2026-11-05T05:37:12.838Z"
---

# Bare-link resolution, import failures and help answer without needless work

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Three leftovers of the post-optimization audit: bare-link resolution still scanned every file (ring 2) and every node (legacy tier 3) per link — 10–13 s for graph/doctor on 3000 ADRs; a lazy CLI import failing on a SyntaxError in a dependency named the wrong file and no line; and `help`/`version` paid for harness detection and session-id derivation.

## Decomposition

- [x] Per-list lookup tables (stem → files, stem prefix → nodes) built once per array, used only for plain data objects; any getter or patched filter keeps the original scan.
- [x] `importFailure()` re-imports the failed module in a child on the error path only and appends `(at <file>:<line>)`.
- [x] `printInfo()` answers help/version before state migration, harness detection, session id and heartbeat.

## Implementation Plan

Lookup tables live in a WeakMap keyed by the list and rebuilt on a length change; both helpers live in core.mjs so the entry shrinks (13960 → 13699 bytes).

## Acceptance Criteria

- [x] graph and doctor JSON are byte-identical on the real vault and a 3000-ADR synthetic vault; wall-clock 10.16 s → 0.35–0.49 s (graph), 12.94 s → 0.54–0.86 s (doctor) on a loaded machine. — evidence: tests/lib-links.test.mjs "bare-link lookup tables match the plain scans"; cmp of outputs minus generated_at.
- [x] A syntax error in scripts/handoff.mjs reports `(at …/scripts/handoff.mjs:<line>)`. — evidence: tests/harness.test.mjs "a lazy import failure names the file".
- [x] help/version touch no session or machine state; median 127 → 84 ms. — evidence: tests/harness.test.mjs "version and help answer before harness detection, process probes and state work".

## Final Summary

Focused 314/314 (lib-links, harness, scripts, doctor-vault, doctor-integrity). mjs is 9990 of its 10000-byte budget: the next change there needs a split. The tables assume a node's stem is not mutated in place without a length change (true for buildNodeIndex). Full suite on the combined tree after all review fixes: 2509 tests, 2500 pass, 0 fail, 9 skipped (macOS, Node 25, `npm test` in the heavy slot). Fresh waypost-reviewer pass over all four stories; its blocker and should-fixes are applied.

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-11-05*
