---
type: epic
id: "WP-14"
title: "Skills as the portable layer, and the first verified harnesses"
status: planned
priority: p1
created: 2026-09-04
updated: 2026-09-04
external_refs: {}
tags: []
code_refs: []
review_status: pending
reviewed_at: null
---

# WP-14: Skills as the portable layer, and the first verified harnesses

| Field | Value |
|---|---|
| **Status** | planned |
| **Priority** | p1 |
| **Created** | 2026-09-04 |
| **Updated** | 2026-09-04 |

---

## Goal

Release 0.14: Waypost's procedures reach every harness as standard Agent Skills, and the first two harnesses beyond Claude Code are verified live.

## Context

Four SKILL.md files and thirteen loop procedures ship in the package but no tool discovers them. Agent Skills is an open standard read by 40+ tools, with progressive disclosure that fits ADR-0008. Only Claude Code has run the whole loop live; the README promises 21 tools.

## Stories

| Story | Status | Description |
|-------|--------|-------------|
| `story-skills-registry-a-skillsdir-per-harness-with-evidence` | planned | `skills.dir` per harness in the registry, confidence levels with URLs |
| `story-bundled-skills-and-loop-procedures-rendered-as-agent-skills` | planned | one `waypost-*` skill set from skills/ and prompts/, standard frontmatter, provenance marker |
| `story-waypost-skills-install-list-and-uninstall-doctor-staleness-brief-self-install` | planned | install/list/uninstall, stale detection in doctor, brief installs the running harness's skills |
| `story-skill-descriptions-inside-the-standing-context-budget` | planned | descriptions pinned by a token-budget test |
| `story-live-verification-codex-and-opencode-run-the-whole-loop` | planned | two `verified` entries with dates; README matrix |
| `story-doctor-agentsmd-hygiene-size-duplicate-block-claude-bridge` | planned | doctor warns on oversized AGENTS.md, duplicate blocks, missing Claude bridge |

## Expected Results

- [ ] A codex or opencode session activates `waypost-story` without being told the skill exists
- [ ] `npm test` pins the skills' description budget
- [ ] Registry entries for codex and opencode read `verified` with a 2026-09 date
- [ ] README carries a compatibility matrix

## Dependencies

- ADR-0003 (roles), ADR-0005 (registry), ADR-0008 (token budget)

## Open Questions

- [ ] (none open at planning time)

## Related

- [Concept: Waypost 1.0](../../concepts/waypost-10-the-projects-memory-every-tool-shares-checked-without-a-model.md)
- Agent Skills specification: https://agentskills.io/specification

---

*Last updated: 2026-09-04*
