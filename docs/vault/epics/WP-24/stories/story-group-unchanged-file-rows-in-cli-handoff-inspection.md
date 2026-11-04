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

- [ ] Separate display formatting from the unchanged canonical formatInspection entry; compact only CLI show.
- [ ] Pin statuses/order/absence/reasons/evidence plus JSON/exits and pre-change delivery/checkpoint compatibility.
- [ ] Measure exact CLI text in two token encodings, run focused tests/guards, Doctor and independent review.

## Implementation Plan

Add explicit formatInspectionForDisplay wrapper using a shared private formatter; preserve formatInspection(report) signature/default output exactly. CLI show non-JSON calls the display entry. Adjacent runs >=5 results with status unchanged/current_state file/no reason/no evidence description may use '  unchanged files:' with indented exact paths, only when candidate text is strictly shorter than the legacy rows. Missing/appeared/changed/unreadable/evidence rows break groups and retain exact legacy text; do not reorder or group across them. Narrative/header/scope remain unchanged. No new CLI flags/schema/limits/model calls. Canonical delivery/retrieval still use original formatInspection and preserve prepared contexts, binding, request keys and old checkpoints. Related handoff ADRs remain proposed; no permanent protocol decision.

Tests cover default canonical parity against baseline, empty/single/small and mixed runs, absent/reason/evidence boundaries, original input immutability and exact display paths/order. Actual CLI show/JSON capture with matching, stale and unchecked snapshots, and baseline-created prepared context/replay must remain valid. Retain source/runtime/baseline/dirty identities and logs; measure full CLI output o200k_base/cl100k_base with pinned tokenizer, not native token use or workflow savings. Focused handoff/delivery/retrieval and module/routine/state guards through heavy admission after role completion; Doctor and fresh reviewer before close.

## Acceptance Criteria

- [ ] CLI groups eligible adjacent rows without losing any information; JSON/exits and canonical delivery/retrieval context/checkpoint replay remain unchanged.
- [ ] Source-bound full CLI measurements show fewer text tokens for representative multi-file runs; focused tests/guards pass, Doctor clean and independent review accepts.

## Final Summary

Pending final verification. First actual tokenizer measurement found grouping 3 files adds1 token in BOTH encodings despite fewer bytes; retained attempt1. Tightened grouping threshold to5 and added4/5-file and Unicode controls; no protocol changes.

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-11-04*
