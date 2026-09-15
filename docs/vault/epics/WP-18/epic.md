---
type: epic
id: "WP-18"
title: "Heavy work sized to the machine"
status: planned
priority: p1
created: 2026-09-15
updated: 2026-09-15
external_refs: {}
tags: []
code_refs: ["scripts/capacity.mjs", "scripts/lib.mjs", "scripts/presence.mjs", "scripts/agents.mjs", "bin/waypost", "AGENTS.md", "package.json", "prompts/heavy.md (planned)", "tests/capacity.test.mjs", "tests/slots.test.mjs", "tests/harness.test.mjs", "README.md", "CHANGELOG.md"]
review_status: pending
reviewed_at: null
---

# WP-18: Heavy work sized to the machine

| Field | Value |
|---|---|
| **Status** | planned |
| **Priority** | p1 |
| **Created** | 2026-09-15 |
| **Updated** | 2026-09-15 |

---

## Goal

Waypost, on any machine and for any user, never starts more heavy work than
the machine's real free resources allow:
- `waypost capacity` measures them with each OS's own means;
- `waypost run --heavy` gives heavy work from every session, harness and
  project one machine-wide slot table;
- the routing block tells every agent to use it.

## Context

On 2026-09-14 the owner's machine (8 cores, 16 GB) froze under parallel heavy
work from several sessions and harnesses, and had to be restarted. The load
average had passed 56. The owner's rule the same day: Waypost is installed by
other people on other machines, so it must always take the machine's real
free resources into account, on every machine.

The decision is the ADR
[Heavy work sized to the machine](../../adr/heavy-work-sized-to-the-machine-waypost-capacity-a-machine-wide-slot-and-a-rule-to-check-first.md).
Three critic passes reviewed it, and the owner approved it on 2026-09-15. It
becomes `accepted` with the implementation.

## Stories

Each story is blocked by the one above it.

| Story | Status | Description |
|-------|--------|-------------|
| `story-waypost-capacity-the-machines-real-free-resources-measured-by-each-os` | planned | `scripts/capacity.mjs`, `waypost capacity`, and the machine state directory in `scripts/lib.mjs` |
| `story-waypost-run-heavy-a-machine-wide-slot-for-heavy-work` | planned | the lock, the slot records, liveness, `run --heavy`, `--release`, and a stress test |
| `story-the-heavy-work-rule-in-every-project-and-wayposts-own-heavy-work` | planned | the routing-block line, `waypost prompt heavy`, `AGENTS.md`, Waypost's own test suite under the limit, and the ADR accepted |
| `story-capacity-verified-on-linux-and-windows-virtual-machines` | planned | the per-OS probes, the shared slot, restart and sleep on the owner's machines |

## Expected Results

- [ ] `waypost capacity` answers in the same shape on macOS, Linux and
      Windows, from each OS's own measures, with container limits applied.
- [ ] Two sessions starting heavy work in the same second never both pass
      the cap, and a stale slot never blocks after a restart.
- [ ] A refused heavy job says why, and how to retry, at once.
- [ ] Every project's routing block carries the one-line rule within the
      ADR-0008 budget, and Waypost's own test suite obeys the limit.
- [ ] The owner's personal fallback rule (`pgrep`, strictly one) can be
      retired wherever this Waypost is installed.

## Dependencies

- The ADR above. ADR-0001, ADR-0007, ADR-0008, ADR-0010.
- The machine state directory of the disk-hygiene ADR. Resolving it lands
  here, in `scripts/lib.mjs`, and WP-17's paused discovery story reuses it.

## Open Questions

- [x] The ADR's open questions were answered by the owner on 2026-09-15:
      - a quarter of the cores and the smaller of 2 GB and a quarter of the
        memory per heavy job, and one slot per four cores;
      - nice +10, or below-normal on Windows;
      - the safety bounds as written.

## Related

- WP-17, whose discovery story is paused until this epic lands.
- The owner's global instructions: the section on heavy processes now routes
  everything through Waypost.

---

*Last updated: 2026-09-15*
