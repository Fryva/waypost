---
type: story
id: "story-bundled-skills-and-loop-procedures-rendered-as-agent-skills"
epic: "WP-14"
title: "Bundled skills and loop procedures rendered as Agent Skills"
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

# Bundled skills and loop procedures rendered as Agent Skills

| Field | Value |
|---|---|
| **Epic** | [WP-14](../epic.md) |
| **Status** | planned |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

The four `skills/*/SKILL.md` and the thirteen `prompts/*.md` become one set of standard Agent Skills named `waypost-*`, grouped so the standing context stays small: `waypost-draft` (adr/spec/epic/story/research/concept/meeting/runbook), `waypost-story` (plan/close), `waypost-review`, `waypost-search`, `waypost-doctor`, plus the four existing skills.

## Decomposition

- [ ] Decide the grouping and write each SKILL.md with a trigger-shaped description (what + when)
- [ ] Frontmatter per spec: name matches the directory, description ≤1024, `metadata.waypost-source` for provenance
- [ ] Move long content to `references/` so each SKILL.md stays under 500 lines
- [ ] Validate with the `skills-ref` rules re-implemented in tests (no new dependency)

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

## Acceptance Criteria

- [ ] Every skill directory validates: name format, description length, body length
- [ ] Each skill's description states when to activate it
- [ ] `waypost skill <name>` keeps printing the same content

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

Roles stay as roles: they carry model, effort and the read-only contract, which a skill cannot express.

## Dependencies

- story-skills-registry-a-skillsdir-per-harness-with-evidence

## Attachments

-

---

*Last updated: 2026-09-04*
