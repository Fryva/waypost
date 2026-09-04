---
type: story
id: "story-adr-0011-accepted-guards-and-draftedby-in-adr-frontmatter"
epic: "WP-16"
title: "ADR-0011 accepted: guards and drafted_by in ADR frontmatter"
status: done
priority: p1
assignee: "Ivan Morozov"
created: 2026-09-04
updated: 2026-09-04
external_refs: {}
tags: []
code_refs: []
specs: []
started_at: "2026-09-04T16:48:03.923Z"
closed_at: "2026-09-04T16:48:04.768Z"
plan_updated_at: "2026-09-04T16:48:03.923Z"
---

# ADR-0011 accepted: guards and drafted_by in ADR frontmatter

| Field | Value |
|---|---|
| **Epic** | [WP-16](../epic.md) |
| **Status** | done |
| **Priority** | p1 |
| **Assignee** | Ivan Morozov |

---

## Description

Take ADR-0011 from proposed to accepted: a fresh-context critic pass, the owner's decision, the ADR template updated with `guards` and `drafted_by`, the index and docs updated.

## Decomposition

- [x] Critic pass, findings folded into the ADR — evidence: ADR-0011 "Verification and follow-up", commit 2744366
- [x] Owner decision — evidence: delegated 2026-09-04; `deciders` in the ADR frontmatter
- [ ] Template and how-it-works gain `guards`/`drafted_by` — lands with the doctor story that reads them

## Implementation Plan

Critic pass (Opus, fresh context) on 2026-09-04: verdict revise; `run` guards cut, flow-form frontmatter, bounds and semantics named (2744366). Owner's decision the same day by delegation. The open question — Waypost's own ADRs outside a vault — was resolved by moving the log into docs/vault/adr/ with frontmatter (a71e283).

## Acceptance Criteria

- [x] The ADR index shows 0011 accepted — evidence: docs/vault/adr/README.md
- [ ] templates/*/adr.md.tmpl carries the optional fields — deferred to the guards story, so the template and the reader land together

## Final Summary

Accepted as revised; the template change is deliberately left to the story that implements the reader, so a field never ships before the code that checks it.

## Technical Notes

-

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-09-04*
