---
type: story
id: "story-group-unchanged-file-rows-in-cli-handoff-inspection"
epic: "WP-24"
title: "Group unchanged file rows in CLI handoff inspection"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-04
updated: 2026-11-04
external_refs: {}
tags: []
code_refs: ["scripts/handoff.mjs", "bin/cli/handoff.mjs", "tests/handoff.test.mjs", "docs/handoffs.md"]
specs: []
started_at: "2026-11-04T05:24:22.141Z"
closed_at: "2026-11-04T05:40:49.675Z"
plan_updated_at: "2026-11-04T05:24:22.141Z"
---

# Group unchanged file rows in CLI handoff inspection

| Field | Value |
|---|---|
| **Epic** | [WP-24](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Compact human/agent-facing handoff show output by grouping adjacent ordinary unchanged-file rows. Preserve every path, status, warning, description and order. Canonical delivery context must remain byte-identical so old checkpoints resume.

## Decomposition

- [x] Separate display formatting from the unchanged canonical formatInspection entry; compact only CLI show.
- [x] Pin statuses/order/absence/reasons/evidence plus JSON/exits and pre-change delivery/checkpoint compatibility.
- [x] Measure exact CLI text in two token encodings, run focused tests/guards, Doctor and independent review.

## Implementation Plan

Add explicit formatInspectionForDisplay wrapper using a shared private formatter; preserve formatInspection(report) signature/default output exactly. CLI show non-JSON calls the display entry. Adjacent runs >=5 results with status unchanged/current_state file/no reason/no evidence description may use '  unchanged files:' with indented exact paths, only when candidate text is strictly shorter than the legacy rows. Missing/appeared/changed/unreadable/evidence rows break groups and retain exact legacy text; do not reorder or group across them. Narrative/header/scope remain unchanged. No new CLI flags/schema/limits/model calls. Canonical delivery/retrieval still use original formatInspection and preserve prepared contexts, binding, request keys and old checkpoints. Related handoff ADRs remain proposed; no permanent protocol decision.

Tests cover default canonical parity against baseline, empty/single/small and mixed runs, absent/reason/evidence boundaries, original input immutability and exact display paths/order. Actual CLI show/JSON capture with matching, stale and unchecked snapshots, and baseline-created prepared context/replay must remain valid. Retain source/runtime/baseline/dirty identities and logs; measure full CLI output o200k_base/cl100k_base with pinned tokenizer, not native token use or workflow savings. Focused handoff/delivery/retrieval and module/routine/state guards through heavy admission after role completion; Doctor and fresh reviewer before close.

## Acceptance Criteria

- [x] CLI groups eligible adjacent rows without losing any information; JSON/exits and canonical delivery/retrieval context/checkpoint replay remain unchanged. — evidence: tests/handoff.test.mjs; comparison.json; compatibility.json.
- [x] Source-bound full CLI measurements show fewer text tokens for representative multi-file runs; focused tests/guards pass, Doctor clean and independent review accepts. — evidence: tokens.json; validation.json; doctor-receipt.json; review.json.

## Final Summary

Added a separate formatInspectionForDisplay entry for non-JSON CLI show only. Adjacent runs of at least5 ordinary unchanged-file rows may share a label when strictly shorter. Original paths/order/narrative/scope and individual missing/changed/appeared/unreadable/reason/evidence rows remain. Canonical formatInspection signature/text stays byte-identical, preserving delivery/retrieval binding and replay. Empty group flush returns before creating temporary arrays.

Confirmed local Node25.6.1/macOS: 48 focused handoff/delivery/retrieval + 4 CLI/state guards pass, zero failures/skips. 442 source hashes stable before/after; exact inverse matches30d1b35. 645 baseline canonical comparisons, 12 actual CLI pairs (including exact JSON/exits), plus delivery AND retrieval checkpoints created by actual prepatch modules and replayed by current modules with no extra surrogate inference. Explicit Doctor1003 input hashes stable,exit0,0issues/warnings6info; independent reviewer accepts.

Pinned tiktoken0.14.0 full actual CLI stdout counts:8short files o200k_base 92→88, cl100k_base 93→89;128files o200k_base 692→568, cl100k_base 693→569;5files o200k_base 77→76, cl100k_base 78→77. Empty/1/2/3/4-file controls unchanged; all measured final cases non-increasing in both encodings. First threshold3 attempt passed functional tests but added1token on3-file/Unicode/mixed cases; retained under attempt1 and raised threshold to5 based on that evidence. Grouped bytes are not a universal token guarantee for arbitrary paths/tokenizers. Raw text measurements only: no model mapping/framing/caching/native usage/net-workflow/weekly quota savings measured. Canonical native delivery context unchanged;0native calls BY RUNNER,operator/reviewer spend unmeasured; no allocation/model/policy change.

Evidence `.waypost/experiments/wp24-inspection-text-20261104/` binds baseline/source/runtime/review identities, original and final actual CLI stdout/JSON, old checkpoints, commands/full logs/Doctor, tokenizer package/table hashes, offline network-denied counting and owned cleanup. Full npm/cross-Node/OS/native benchmark unrun; remote CI follows publication.

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-11-04*
