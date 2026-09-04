---
type: story
id: "story-doctor-evaluates-regex-guards-of-accepted-adrs"
epic: "WP-16"
title: "doctor evaluates regex guards of accepted ADRs"
status: planned
priority: p1
assignee: "Ivan Morozov"
created: 2026-09-04
updated: 2026-09-04
external_refs: {}
tags: []
code_refs: []
specs: []
blocked_by: ["WP-16/story-adr-0011-accepted-guards-and-draftedby-in-adr-frontmatter"]
started_at: null
closed_at: null
plan_updated_at: null
---

# doctor evaluates regex guards of accepted ADRs

| Field | Value |
|---|---|
| **Epic** | [WP-16](../epic.md) |
| **Status** | planned |
| **Priority** | p1 |
| **Assignee** | Ivan Morozov |

---

## Description

doctor reads `guards` from vault ADRs and evaluates `forbid` and `require` over the files their `in` glob selects, at level issue for accepted ADRs and info for proposed ones, naming ADR, file, line and `why`.

## Decomposition

- [ ] Glob + regex evaluation without dependencies; skip git-ignored files
- [ ] `adr-guard` findings; `why` mandatory
- [ ] Tests on fixtures for both levels

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

## Acceptance Criteria

- [ ] A failing forbid guard on an accepted ADR is an issue with file:line
- [ ] A proposed ADR's failing guard is info
- [ ] A guard without `why` is its own finding

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

Line-by-line matching; multi-line patterns are out of scope for v1.

## Dependencies

- story-adr-0011-accepted-guards-and-draftedby-in-adr-frontmatter

## Attachments

-

---

*Last updated: 2026-09-04*
