---
type: epic
id: "WP-16"
title: "Decisions that check themselves"
status: planned
priority: p2
created: 2026-09-04
updated: 2026-09-04
external_refs: {}
tags: []
code_refs: []
review_status: pending
reviewed_at: null
---

# WP-16: Decisions that check themselves

| Field | Value |
|---|---|
| **Status** | planned |
| **Priority** | p2 |
| **Created** | 2026-09-04 |
| **Updated** | 2026-09-04 |

---

## Goal

Release 0.16: an accepted decision can be violated only loudly — doctor checks its guards without a model — and agent-drafted decisions carry their provenance.

## Context

code_refs prove that files exist, not that they still follow the decision. The market answers drift with hosted platforms; Waypost answers with frontmatter in the ADR and the doctor it already has. Three more harnesses join the verified matrix.

## Stories

| Story | Status | Description |
|-------|--------|-------------|
| `story-adr-0011-accepted-guards-and-draftedby-in-adr-frontmatter` | planned | critic pass, owner decision, status accepted, template and docs updated |
| `story-doctor-evaluates-regex-guards-of-accepted-adrs` | planned | flow-form `guards`, `forbid`/`require`/`not_in` over globs, whole-file matching, bounds, `adr-guard` findings |
| `story-command-guards-opt-in-behind-vault-config-never-run-by-fix` | planned | `check` names the project's fitness command; printed, never executed |
| `story-live-verification-cursor-gemini-cli-and-copilot` | planned | three more `verified` entries; matrix updated |

## Expected Results

- [ ] A vault ADR with a failing guard is a doctor issue naming ADR, file and line
- [ ] `draft adr --write` records drafted_by
- [ ] Five harnesses verified in total

## Dependencies

- ADR-0011 accepted before the second story starts
- ADR-0009 (integrity checks)

## Open Questions

- [ ] (none open at planning time)

## Related

- ADR-0011 (proposed): ../../../decisions/0011-decisions-that-check-themselves.md
- [Concept: Waypost 1.0](../../concepts/waypost-10-the-projects-memory-every-tool-shares-checked-without-a-model.md)

---

*Last updated: 2026-09-04*
