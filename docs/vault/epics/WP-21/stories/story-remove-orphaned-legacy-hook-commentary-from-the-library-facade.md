---
type: story
id: "story-remove-orphaned-legacy-hook-commentary-from-the-library-facade"
epic: "WP-21"
title: "Remove orphaned legacy hook commentary from the library facade"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-27
updated: 2026-10-27
external_refs: {}
tags: []
code_refs: ["scripts/lib.mjs"]
specs: []
started_at: "2026-10-27T02:35:26.056Z"
closed_at: "2026-10-27T02:40:27.836Z"
plan_updated_at: "2026-10-27T02:35:26.056Z"
---

# Remove orphaned legacy hook commentary from the library facade

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Remove orphaned legacy Claude hook commentary from the shared library so an agent reading the facade does not pay for instructions about absent mechanisms. Mechanical cleanup under accepted ADR-0001 and ADR-0008; no behavior or interface change.

## Decomposition

- [x] Freeze source/API baseline and historical provenance.
- [x] Remove only the orphan comment block.
- [x] Prove exact remainder/API, syntax and Doctor; independent review and close.

## Implementation Plan

Read-only planner verified the 2093B block between openStoryFrom and askYesNo re-export has contained only comments/blank lines since initial fork866a7f0. Emitter election, efficacy/reminder and session-name anchor have no implementation in this block; their hook interface was replaced under ADR-0001. Remove precisely that block, no import/export/function edits and no new module. Preserve historical content in Git. Freeze complete before source and API100 signatures/function-source hashes in ignored evidence. Assert removed lines are exclusively // or empty, exact whole-file inverse and 34218->32125B. Check node syntax and independently compare API100 before/after; Doctor issue/warn/warning0. No new tests or full test run for comment-only change. Independent final reviewer before close/commit; report latest CI status honestly and do not call this a token-saving measurement.

## Acceptance Criteria

- [x] Only the 2093B orphan comment block is removed; exact remainder and inverse prove no executable change — evidence: `comparison.json`, `before.txt`, `removed.txt`, `provenance.json` in `.waypost/experiments/wp21-lib-orphan-comments-20261026/`.
- [x] API100 types/names/arities/function sources preserved; syntax and Doctor pass — evidence: byte-equal `api-before.json`/`api-after.json`, syntax exit0, `doctor.json` issue/warn/warning0.
- [x] Independent review accepts actual diff, provenance and evidence; task closes through CLI — evidence: `review-final.json`, five matched review input hashes.

## Final Summary

Removed2093B of comments inherited unchanged from initialfork866a7f0 about absent legacyhook implementations. Facade34218->32125B with no executable bytes/import/export changes, no new module. Exact whole-file inverse, removed-line comment-only assertion and API100 function-source/value replay match. Syntax/diff-check and Doctor issue/warn/warning0; independent reviewer ship/no findings. New tests/full run intentionally omitted for comment-only change. No temporary fixtures/build artifacts created or deleted; retained proof in `.waypost/experiments/wp21-lib-orphan-comments-20261026/`. Previous executable baseline642fd3d full Node20/22/24 CI40438123896 remains in_progress; no completed full-suite claim. No native-token/runtime/net-saving measurement.

## Technical Notes

SOURCE_IGNORE/ENTRY_IGNORE mutable ownership and heading cache remain unchanged. No native pilot, standing instruction change, runtime or net token-savings claim. Source byte reduction is a read-volume proxy only.
