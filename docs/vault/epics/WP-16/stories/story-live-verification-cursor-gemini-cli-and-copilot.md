---
type: story
id: "story-live-verification-cursor-gemini-cli-and-copilot"
epic: "WP-16"
title: "Live verification: Cursor, Gemini CLI and Copilot"
status: planned
priority: p2
assignee: "Ivan Morozov"
created: 2026-09-04
updated: 2026-09-04
external_refs: {}
tags: []
code_refs: []
specs: []
started_at: null
closed_at: null
plan_updated_at: null
---

# Live verification: Cursor, Gemini CLI and Copilot

| Field | Value |
|---|---|
| **Epic** | [WP-16](../epic.md) |
| **Status** | planned |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Run the whole loop in Cursor, Gemini CLI and GitHub Copilot; set the registry entries to `verified` with dates; update the README matrix. Five verified harnesses is part of the 1.0 bar.

## Decomposition

- [ ] Reuse the scenario script from WP-14
- [ ] Fix defects; record quirks in registry notes
- [ ] Matrix update

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

## Acceptance Criteria

- [ ] Three more `verified` entries with dates
- [ ] README matrix lists five verified harnesses

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

-

## Dependencies

- story-live-verification-codex-and-opencode-run-the-whole-loop (WP-14)

## Attachments

-

---

*Last updated: 2026-09-04*
