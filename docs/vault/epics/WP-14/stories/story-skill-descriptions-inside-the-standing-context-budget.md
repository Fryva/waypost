---
type: story
id: "story-skill-descriptions-inside-the-standing-context-budget"
epic: "WP-14"
title: "Skill descriptions inside the standing-context budget"
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

# Skill descriptions inside the standing-context budget

| Field | Value |
|---|---|
| **Epic** | [WP-14](../epic.md) |
| **Status** | planned |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Skill descriptions load at startup in every tool that supports skills, so they are paid for on every turn. A test pins the total like the routing block test does, and the 1.0 bar (≤800 tokens standing context with skills) is measured, not assumed.

## Decomposition

- [ ] Measure: routing block + role descriptions + skill descriptions in characters
- [ ] Add the budget to tests/harness.test.mjs next to the existing standing-context test
- [ ] Trim descriptions to their trigger where needed

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

## Acceptance Criteria

- [ ] `npm test` fails if skills' descriptions together exceed the budget
- [ ] how-it-works.md states the new standing-context total

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

Characters stand in for tokens, as in the existing test.

## Dependencies

- story-bundled-skills-and-loop-procedures-rendered-as-agent-skills

## Attachments

-

---

*Last updated: 2026-09-04*
