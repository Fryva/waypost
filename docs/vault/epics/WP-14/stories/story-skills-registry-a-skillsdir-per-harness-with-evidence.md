---
type: story
id: "story-skills-registry-a-skillsdir-per-harness-with-evidence"
epic: "WP-14"
title: "Skills registry: a skills.dir per harness, with evidence"
status: done
priority: p1
assignee: "Ivan Morozov"
created: 2026-09-04
updated: 2026-09-04
external_refs: {}
tags: []
code_refs: []
specs: []
started_at: "2026-09-04T16:06:07.026Z"
closed_at: "2026-09-04T16:09:15.005Z"
plan_updated_at: "2026-09-04T16:06:07.026Z"
---

# Skills registry: a skills.dir per harness, with evidence

| Field | Value |
|---|---|
| **Epic** | [WP-14](../epic.md) |
| **Status** | done |
| **Priority** | p1 |
| **Assignee** | Ivan Morozov |

---

## Description

Each harness entry in `harnesses/*.json` learns where that tool discovers project-level Agent Skills, with the same confidence discipline as roles: `verified` when exercised, `documented` with the vendor URL, `inferred` with the assumption stated. A harness with no skills support says so (`skills: null`).

## Decomposition

- [x] Read each client's skills documentation for the 21 harnesses — evidence: `docs` URL in every `harnesses/*.json` skills object
- [x] Add `skills: { dir, reads, confidence, docs, notes }` to each registry entry; `null` + `skills_note` where unsupported (qm) — evidence: harnesses/*.json
- [x] Registry reader `skillsOf(id)` validates shape and evidence; `waypost harnesses` shows the directory, `--json` carries the object — evidence: scripts/agents.mjs
- [x] Tests: every entry has the field; `documented` has a URL; the shared directory is the install target wherever it is read — evidence: tests/harness.test.mjs "every bundled harness says where it discovers Agent Skills, with evidence"

## Implementation Plan


Sources read for all 21 harnesses on 2026-09-04 (vendor pages; two via their
search index where the page renders client-side). Registry entries gain
`skills: { dir, reads, confidence, docs, notes }` or `null` + `skills_note`
(qm). `dir` prefers `.agents/skills` wherever the harness reads it — eleven do —
so one copy serves many tools; brand directories otherwise. `skillsOf(id)` in
scripts/agents.mjs validates the shape and the evidence rules and is the one
reader; `waypost harnesses` prints the directory, `--json` carries the object.
docs/harnesses.md documents the field. Tests enumerate every entry.

## Acceptance Criteria

- [x] `waypost harnesses --all --json` shows a `skills` object or `null` for all 21 entries — evidence: test "`waypost harnesses` shows the skills directory and --json carries the object"; `npm test` 347 green
- [x] No entry claims `verified` without a live run recorded in its notes — evidence: all 20 entries are `documented`; none is `verified` yet (WP-14 live-verification story)
- [x] `npm test` green — evidence: 347 tests, 2026-09-04

## Final Summary

Twenty of twenty-one harnesses discover project-level Agent Skills; eleven of
them read the shared `.agents/skills/` (codex, cursor, gemini, copilot, opencode,
pi, roo, windsurf, kimi, dsh, antigravity), which is therefore the install
target wherever a harness reads it — one copy for many tools. Brand
directories for the rest (`.claude/skills`, `.cline/skills`, `.qwen/skills`,
`.codebuddy/skills`, `.iflow/skills`, `.qoder/skills` for Lingma, `.trae/skills`,
`.zcode/skills`, `.grok/skills`). QM has no project-level discovery. Two pages
(Trae, Windsurf) could only be read through their search index or a redirected
host; both are noted in the entries. iFlow requires a `license` field, so every
waypost skill will carry one. Follow-ups: the next story renders the skills.

## Technical Notes

Discovery paths differ per tool; the standard does not define them. Never invent a path — `inferred` with the assumption is the fallback.

## Dependencies

- ADR-0005 (registry is data)

## Attachments

-

---

*Last updated: 2026-09-04*
