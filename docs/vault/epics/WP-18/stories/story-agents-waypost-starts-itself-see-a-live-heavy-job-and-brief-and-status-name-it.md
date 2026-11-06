---
type: story
id: "story-agents-waypost-starts-itself-see-a-live-heavy-job-and-brief-and-status-name-it"
epic: "WP-18"
title: "Agents waypost starts itself see a live heavy job, and brief and status name it"
status: planned
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-05
updated: 2026-11-05
external_refs: {}
tags: []
code_refs: []
specs: []
started_at: null
closed_at: null
plan_updated_at: null
---

# Agents waypost starts itself see a live heavy job, and brief and status name it

| Field | Value |
|---|---|
| **Epic** | [WP-18](../epic.md) |
| **Status** | planned |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

The routing block's "no agents beside it" reaches only agents a harness
starts and reads the block. Agents Waypost starts itself — `waypost team`
peers (`processPeer` in `scripts/team-transport.mjs` spawns claude,
`codex app-server`, opencode) — never look at the heavy-work slot, and a
session in another project has no way to know a heavy job is running: `brief`
and `status` do not show live slots. On the 3.8 GB VM that is the
2026-09-27 incident again, started by Waypost.

Found by the second critic pass on ADR "Memory for heavy work: half the
memory up to 2 GB, macOS by pressure level, no agents beside a job"; the
owner chose to warn and show (2026-11-05).

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [ ] `team` reads live holders (`readHolders`) before it starts peers and
      warns, naming the job; it starts them only when told to go ahead
- [ ] `brief` and `status` name a live heavy slot: command, host, since when
- [ ] tests for both

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [ ] with a live heavy slot, starting team peers warns and does not start
      them without confirmation
- [ ] without one, `team` behaves as before
- [ ] `brief` and `status` show a live heavy slot, and nothing when there is
      none

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

## Dependencies

- ADR "Memory for heavy work: half the memory up to 2 GB, macOS by pressure
  level, no agents beside a job" (proposed)

## Attachments

-

---

*Last updated: 2026-11-05*
