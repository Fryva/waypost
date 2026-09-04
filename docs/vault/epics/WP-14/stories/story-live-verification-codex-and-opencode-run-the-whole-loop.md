---
type: story
id: "story-live-verification-codex-and-opencode-run-the-whole-loop"
epic: "WP-14"
title: "Live verification: Codex and OpenCode run the whole loop"
status: planned
priority: p1
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

# Live verification: Codex and OpenCode run the whole loop

| Field | Value |
|---|---|
| **Epic** | [WP-14](../epic.md) |
| **Status** | planned |
| **Priority** | p1 |
| **Assignee** | Ivan Morozov |

---

## Description

Run the whole loop for real in Codex CLI and OpenCode against a throwaway project: setup, brief, draft a story, claim it, commit through `waypost commit`, a role pass, sessions and leases. Record what worked, fix what did not, and set both registry entries to `verified` with the date.

## Decomposition

- [ ] OpenCode is installed here (1.18.25); Codex needs installing
- [ ] Script the scenario so it is repeatable; note each harness's quirks in the registry `notes`
- [ ] Fix defects found; set confidence `verified`
- [ ] README: a compatibility matrix with dates

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

## Acceptance Criteria

- [ ] harnesses/codex.json and harnesses/opencode.json read `verified` with a 2026-09 date and a note of what was exercised
- [ ] README has the matrix
- [ ] Any defect found has a test

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

The heaviest defects so far were found by running the CLI as a harness would; expect more.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-09-04*
