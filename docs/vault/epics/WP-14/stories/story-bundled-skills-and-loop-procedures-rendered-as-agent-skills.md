---
type: story
id: "story-bundled-skills-and-loop-procedures-rendered-as-agent-skills"
epic: "WP-14"
title: "Bundled skills and loop procedures rendered as Agent Skills"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-09-04
updated: 2026-09-04
external_refs: {}
tags: []
code_refs: []
specs: []
started_at: "2026-09-04T16:16:51.267Z"
closed_at: "2026-09-04T16:24:46.354Z"
plan_updated_at: "2026-09-04T16:16:51.267Z"
---

# Bundled skills and loop procedures rendered as Agent Skills

| Field | Value |
|---|---|
| **Epic** | [WP-14](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

The four `skills/*/SKILL.md` and the thirteen `prompts/*.md` become one set of standard Agent Skills named `waypost-*`, grouped so the standing context stays small: `waypost-draft` (adr/spec/epic/story/research/concept/meeting/runbook), `waypost-story` (plan/close), `waypost-review`, `waypost-search`, `waypost-doctor`, plus the four existing skills.

## Decomposition

- [x] Grouping decided and ten SKILL.md written with trigger-shaped descriptions — evidence: skills/*/SKILL.md
- [x] Frontmatter per spec: name = directory, description ≤1024 (ours ≤230), license; provenance goes into the installed copy's `metadata` — evidence: scripts/skills.mjs `validateSkill`, `render`
- [x] Bodies stay far under 500 lines (longest: 97) — evidence: `wc -l skills/*/SKILL.md`
- [x] Validation re-implemented in tests, no dependency — evidence: `waypost skills validate`; test "every bundled skill is a valid Agent Skill…"

## Implementation Plan

Ten skills in `skills/` of the tool root, each `waypost-<name>/SKILL.md` with
`name`, `description` (a trigger, ≤230 chars), `license: MIT` (iFlow requires
one). The four proactive skills were renamed with the prefix and their
descriptions trimmed; six new skills (draft, story, review, search, doctor,
commit) point at the CLI and at `waypost prompt <kind>` for the procedure
instead of copying the thirteen prompts, so a skill stays small and always
matches the installed CLI. `scripts/skills.mjs` validates them against the
standard's rules re-implemented in-tree (no dependency).

## Acceptance Criteria

- [x] Every skill directory validates: name format, description length, body length — evidence: `waypost skills validate` → "10 skill(s) valid"; test in tests/harness.test.mjs
- [x] Each skill's description states when to activate it — evidence: every description opens with "Use when…" or "When the user…"
- [x] `waypost skill <name>` keeps printing the same content — evidence: short and full names both print; test "`waypost skill` prints a bundled skill by short or full name…"

## Final Summary

Implemented together with the install story in one commit (skills sources + scripts/skills.mjs). Procedures are reached through `waypost prompt <kind>` rather than copied, which keeps the standing context small and the content current with the CLI.

## Technical Notes

Roles stay as roles: they carry model, effort and the read-only contract, which a skill cannot express.

## Dependencies

- story-skills-registry-a-skillsdir-per-harness-with-evidence

## Attachments

-

---

*Last updated: 2026-09-04*
