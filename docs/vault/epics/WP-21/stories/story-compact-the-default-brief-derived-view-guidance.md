---
type: story
id: "story-compact-the-default-brief-derived-view-guidance"
epic: "WP-21"
title: "Compact the default brief derived-view guidance"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-23
updated: 2026-10-23
external_refs: {}
tags: []
code_refs: ["scripts/brief.mjs", "tests/harness.test.mjs"]
specs: []
started_at: "2026-10-23T04:24:37.372Z"
closed_at: "2026-10-23T04:27:18.005Z"
plan_updated_at: "2026-10-23T04:24:37.372Z"
---

# Compact the default brief derived-view guidance

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Default brief repeats a prose-heavy hint about derived views on every orientation.
Shorten only this hint while preserving every instruction; keep full-mode, JSON,
folder/in-flight facts, normalization and dynamic appenders unchanged.

## Decomposition

- [x] Shorten the default derived-view hint without losing its facts.
- [x] Pin the hint and existing compact/full/JSON behavior in the integration test.
- [x] Compare frozen outputs, run targeted checks and obtain independent review.

## Implementation Plan

Replace only the three appended string literals in condense() with:
Regenerated from frontmatter: `kanban.md`, `code-map.md`, `graph.md`. Query:
`waypost graph --for <path>` (vault-relative path); never read graph whole.
Descent: `waypost brief --full`.
The implementation emits this as one line with the same surrounding newlines.

Extend the existing compact/full/JSON integration test with exact hint and bounded
hint length assertions. Retain the 1500-character routine brief ceiling. Capture
actual vault facts once, render the default skeleton with fixed facts, and compare
old/new condense output. Prove source equality after reversing only the literal
replacement, which also preserves full/JSON and appenders. Run targeted brief,
standing context, routine commands and skeleton checks through heavy admission.

## Acceptance Criteria

- [x] Default hint preserves all three derived filenames, regeneration from frontmatter, literal graph command, vault-relative path, whole-graph warning and full descent command. — evidence: exact hint assertion in the existing compact/full/JSON integration test.
- [x] Frozen default output changes only the hint; full/JSON and dynamic appenders remain unchanged. — evidence: measurement.json, complete reverse-source equality, full skeleton equality and unchanged JSON-facts integration assertion.
- [x] Targeted checks pass; report exact UTF-8/character reduction without claiming native token, workflow or subscription savings. — evidence: 10/10 heavy-gated checks, tests.log and verification.json bound to three source hashes; measurement.json.

## Final Summary

Only the default condense hint literals changed. Hint without surrounding newlines:
226 to 185 characters, 228 to 185 UTF-8 bytes. Frozen actual-vault default skeleton:
1039 to 998 characters, 1052 to 1009 UTF-8 bytes. All other output is byte-identical
on these frozen inputs. Replacing the changed condense function with the saved
baseline restores the complete brief source byte-for-byte; lib.mjs is unchanged.
Full skeleton output is byte-identical; JSON equality and default/full selection
remain covered in the existing integration test.

10/10 selected brief, standing-context and routine-command checks passed through
heavy admission on Node 25.6.1/macOS, exit 0. No local full suite or Node 20/22/24
matrix claim. Native-token, runtime, whole-task and subscription savings are not
measured. Independent implementation review: ship, no actionable findings. Reviewer independently reproduced frozen outputs and reverse-source equality and verified baseline/current hashes plus the test log. Doctor exit 0, no issues; two pre-existing WP-18 warnings and the sandbox process-table limitation. Next exit 0.

## Technical Notes

Applies accepted ADR-0008. No public CLI, architecture, model configuration,
native experiment or historical budget changes.

## Dependencies

- Accepted ADR-0008.

## Attachments

- `.waypost/experiments/wp21-brief-guidance-20261023/`: frozen facts/skeleton/full/before/after, old condense, source hashes, measurements, full test log and validation manifest (local retained evidence).

---

*Last updated: 2026-10-23*
