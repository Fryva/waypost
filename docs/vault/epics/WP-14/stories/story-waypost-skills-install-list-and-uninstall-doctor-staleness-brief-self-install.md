---
type: story
id: "story-waypost-skills-install-list-and-uninstall-doctor-staleness-brief-self-install"
epic: "WP-14"
title: "waypost skills install, list and uninstall; doctor staleness; brief self-install"
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

# waypost skills install, list and uninstall; doctor staleness; brief self-install

| Field | Value |
|---|---|
| **Epic** | [WP-14](../epic.md) |
| **Status** | planned |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

`waypost skills install [--harness <id>|all]`, `list`, `uninstall` copy the standard skills into each harness's skills directory the way `agents install` renders roles; doctor reports absent, stale and foreign skill files; `brief` installs the running harness's skills when they are missing, as it does roles.

## Decomposition

- [ ] Install/uninstall with the provenance marker; skip files not ours
- [ ] doctor: `agent-skills` findings mirroring `agent-roles`
- [ ] brief self-install extended to skills; `--no-install` honoured
- [ ] `waypost setup` installs skills for detected harnesses

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

## Acceptance Criteria

- [ ] Fresh project + `setup` → skills present for detected harnesses
- [ ] A hand-edited skill file is reported stale, never overwritten by --fix
- [ ] `brief` from a harness with no skills installs them and says so

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

Reuse the role install machinery; the skill file is identical for every harness, only the directory differs.

## Dependencies

- story-bundled-skills-and-loop-procedures-rendered-as-agent-skills

## Attachments

-

---

*Last updated: 2026-09-04*
