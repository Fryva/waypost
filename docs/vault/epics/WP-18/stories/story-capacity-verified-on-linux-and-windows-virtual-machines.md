---
type: story
id: "story-capacity-verified-on-linux-and-windows-virtual-machines"
epic: "WP-18"
title: "Capacity verified on Linux and Windows virtual machines"
status: planned
priority: p1
assignee: "Ivan Morozov"
created: 2026-09-15
updated: 2026-09-15
external_refs: {}
tags: []
code_refs: ["scripts/capacity.mjs (planned)", "bin/waypost"]
specs: []
blocked_by: ["WP-18/story-the-heavy-work-rule-in-every-project-and-wayposts-own-heavy-work"]
started_at: null
closed_at: null
plan_updated_at: null
---

# Capacity verified on Linux and Windows virtual machines

| Field | Value |
|---|---|
| **Epic** | [WP-18](../epic.md) |
| **Status** | planned |
| **Priority** | p1 |
| **Assignee** | Ivan Morozov |

---

## Description

Decision 5 of the ADR
[Heavy work sized to the machine](../../../adr/heavy-work-sized-to-the-machine-waypost-capacity-a-machine-wide-slot-and-a-rule-to-check-first.md):
the per-OS probes and the shared slot are verified on real machines, not
assumed. That means the owner's Linux and Windows virtual machines, which
share this checkout, and the macOS host.

## Decomposition

- [ ] Linux:
      - `waypost capacity --json` against `free` and `/proc/meminfo`;
      - if a container engine is available on the VM, the limits apply
        inside a container with memory and CPU limits;
      - two sessions claim one slot;
      - a restart leaves no stale holder.
- [ ] Windows:
      - the CPU sample against Task Manager;
      - `tasklist` liveness;
      - two sessions (PowerShell and Git Bash) share one slot;
      - the lowered priority is visible in Task Manager.
- [ ] Sleep and wake on each machine, the macOS host included: a live holder
      stays a holder.
- [ ] Record the evidence. Fix what breaks, each fix with a hermetic test.

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan). -->

## Acceptance Criteria

- [ ] On each machine, `waypost capacity` figures match the OS's own tools
      within a small margin, and the numbers are recorded.
- [ ] On each OS, a slot held in one session refuses the second session.
      After a restart the slot is free.
- [ ] After sleep and wake, a live holder stays a holder.
- [ ] Fixes land with hermetic tests, and `waypost doctor` reports 0 issues.

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

- One heavy job at a time on each machine, including the verification runs
  themselves.

## Dependencies

- `story-the-heavy-work-rule-in-every-project-and-wayposts-own-heavy-work`.

## Attachments

-

---

*Last updated: 2026-09-15*
