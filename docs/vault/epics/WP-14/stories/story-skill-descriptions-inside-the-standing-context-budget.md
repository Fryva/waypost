---
type: story
id: "story-skill-descriptions-inside-the-standing-context-budget"
epic: "WP-14"
title: "Skill descriptions inside the standing-context budget"
status: in-progress
priority: p2
assignee: "Ivan Morozov"
created: 2026-09-04
updated: 2026-09-04
external_refs: {}
tags: []
code_refs: []
specs: []
started_at: "2026-09-04T16:24:44.218Z"
closed_at: null
plan_updated_at: "2026-09-04T16:24:44.218Z"
---

# Skill descriptions inside the standing-context budget

| Field | Value |
|---|---|
| **Epic** | [WP-14](../epic.md) |
| **Status** | in-progress |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Skill descriptions load at startup in every tool that supports skills, so they are paid for on every turn. A test pins the total like the routing block test does, and the 1.0 bar (≤800 tokens standing context with skills) is measured, not assumed.

## Decomposition

- [x] Measured: routing block < 1400 chars, role descriptions < 700, skill descriptions ≤ 2100 — about 4200 chars, or roughly 600 tokens at the ~7 chars/token the routing block measured (197 tokens for ~1400 chars) — evidence: tests/harness.test.mjs
- [x] Budget test next to the standing-context test — evidence: test "every bundled skill is a valid Agent Skill, and their descriptions fit the standing-context budget"
- [x] Descriptions trimmed to their trigger (all ≤ 224 chars) — evidence: skills/*/SKILL.md

## Implementation Plan

Characters stand in for tokens, as in the routing-block test. Budget constants live in scripts/skills.mjs (`DESCRIPTION_MAX` 230, `DESCRIPTIONS_TOTAL_MAX` 2100) and `validateSkill` enforces the per-skill one, so `waypost skills validate` fails before a test does.

## Acceptance Criteria

- [x] `npm test` fails if skills' descriptions together exceed the budget — evidence: `DESCRIPTIONS_TOTAL_MAX` assertion
- [x] how-it-works.md states the new standing-context total — evidence: "Agent Skills (WP-14)" section says descriptions are triggers pinned by a test; the Context spend section's figure is updated when a real tokenizer measurement is taken (open)

## Final Summary

Pinned by test. The exact token figure for the whole standing context with skills is still a character estimate; a tokenizer measurement is a follow-up under the 1.0 bar.

## Technical Notes

Characters stand in for tokens, as in the existing test.

## Dependencies

- story-bundled-skills-and-loop-procedures-rendered-as-agent-skills

## Attachments

-

---

*Last updated: 2026-09-04*
