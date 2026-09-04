---
type: story
id: "story-skills-registry-a-skillsdir-per-harness-with-evidence"
epic: "WP-14"
title: "Skills registry: a skills.dir per harness, with evidence"
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

# Skills registry: a skills.dir per harness, with evidence

| Field | Value |
|---|---|
| **Epic** | [WP-14](../epic.md) |
| **Status** | planned |
| **Priority** | p1 |
| **Assignee** | Ivan Morozov |

---

## Description

Each harness entry in `harnesses/*.json` learns where that tool discovers project-level Agent Skills, with the same confidence discipline as roles: `verified` when exercised, `documented` with the vendor URL, `inferred` with the assumption stated. A harness with no skills support says so (`skills: null`).

## Decomposition

- [ ] Read each client's skills documentation (agentskills.io client list links) for the 21 harnesses
- [ ] Add `skills: { dir, confidence, docs }` to each registry entry; `null` where unsupported
- [ ] Extend the registry loader and `waypost harnesses --all` to show the skills directory
- [ ] Tests: every entry has the field; a `documented` entry has a URL

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

## Acceptance Criteria

- [ ] `waypost harnesses --all --json` shows a `skills` object or `null` for all 21 entries
- [ ] No entry claims `verified` without a live run recorded in its notes
- [ ] `npm test` green

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

Discovery paths differ per tool; the standard does not define them. Never invent a path — `inferred` with the assumption is the fallback.

## Dependencies

- ADR-0005 (registry is data)

## Attachments

-

---

*Last updated: 2026-09-04*
