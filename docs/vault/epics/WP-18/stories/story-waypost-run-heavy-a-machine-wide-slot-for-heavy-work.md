---
type: story
id: "story-waypost-run-heavy-a-machine-wide-slot-for-heavy-work"
epic: "WP-18"
title: "waypost run --heavy: a machine-wide slot for heavy work"
status: planned
priority: p1
assignee: "Ivan Morozov"
created: 2026-09-15
updated: 2026-09-15
external_refs: {}
tags: []
code_refs: ["bin/waypost", "scripts/capacity.mjs", "scripts/presence.mjs", "tests/capacity.test.mjs"]
specs: []
blocked_by: ["WP-18/story-waypost-capacity-the-machines-real-free-resources-measured-by-each-os"]
started_at: null
closed_at: null
plan_updated_at: null
---

# waypost run --heavy: a machine-wide slot for heavy work

| Field | Value |
|---|---|
| **Epic** | [WP-18](../epic.md) |
| **Status** | planned |
| **Priority** | p1 |
| **Assignee** | Ivan Morozov |

---

## Description

Decision 2 of the ADR
[Heavy work sized to the machine](../../../adr/heavy-work-sized-to-the-machine-waypost-capacity-a-machine-wide-slot-and-a-rule-to-check-first.md):
one slot table per machine. Every session, harness and project shares it, so
two heavy jobs that start in the same second cannot both pass the cap, and a
stale slot never blocks after a restart.

## Decomposition

- [ ] The slot table in the machine state directory, keyed by host. Each
      record holds the pid, process start time, boot identity, host, session,
      harness, command and start.
- [ ] The lock: `mkdir` of a lock directory that holds its owner's pid and
      start time. It is broken only when that owner is dead, or after five
      minutes.
- [ ] Liveness:
      - **boot identity:** Linux `boot_id`, macOS `kern.boottime`, and
        otherwise now − uptime within two minutes;
      - **POSIX:** the process table and start time, as `presence.mjs` does;
      - **Windows:** signal-0 plus the image name `tasklist` reports (no
        shell, a few seconds' timeout), and a 24-hour cap.
- [ ] `waypost run --heavy [--wait <duration>] -- <argv…>`:
      - claims under the lock, against `can_start` with the live holders;
      - refuses at once, with a distinct exit code, the reason and the retry
        command;
      - `--wait` retries until the deadline, repeating the reason;
      - runs without a shell, with stdio inherited, after lowering
        Waypost's own priority (nice +10, below-normal on Windows);
      - forwards SIGINT and SIGTERM, releases the slot on exit, and returns
        the command's exit code.
- [ ] `waypost capacity` lists the holders.
      `waypost capacity --release <id> [--force]` is the recovery path.
- [ ] Tests, including the stress test.

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan). -->

## Acceptance Criteria

- [ ] Several claims start at once against a cap of one, each with a trivial
      command, in a temporary state directory. Exactly one holds the slot;
      the rest are refused with the reason.
- [ ] Records that are not holders:
      - one from an earlier boot;
      - one whose pid now belongs to a process with another start time;
      - on injected Windows, one whose pid is alive under another image
        name.

      A Windows record older than 24 hours is released.
- [ ] A lock whose owner is dead is broken at once. A live owner's lock is
      kept for up to five minutes.
- [ ] A refused `run --heavy` exits with its distinct code within a second
      and prints why and the retry command. `--wait 2s` retries, then gives
      up at the deadline. Nothing starts without a slot.
- [ ] The command:
      - runs at lowered priority, with its niceness read back on POSIX;
      - inherits stdio and receives interrupts;
      - releases the slot and passes on its exit code, including when it
        crashes.
- [ ] `--release` refuses a live-looking record without `--force`, and prints
      what it released.
- [ ] `npm test` is green at capped concurrency, and `waypost doctor` reports
      0 issues.

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

- The slot table is local and never synced, so a real `mkdir` lock works.
  Leases (ADR-0007) need settle-and-re-read only because they live in a
  synced vault.
- The stress test uses trivial commands (`node -e ""`) in a temporary state
  directory. It is the one place a test starts several processes on purpose,
  and it keeps them tiny.
- The owner's rule applies to this work itself: one heavy job at a time, and
  tests at capped concurrency.

## Dependencies

- `story-waypost-capacity-the-machines-real-free-resources-measured-by-each-os`.

## Attachments

-

---

*Last updated: 2026-09-15*
