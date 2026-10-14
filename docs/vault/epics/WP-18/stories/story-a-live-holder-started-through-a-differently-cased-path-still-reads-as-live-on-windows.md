---
type: story
id: "story-a-live-holder-started-through-a-differently-cased-path-still-reads-as-live-on-windows"
epic: "WP-18"
title: "A live holder started through a differently cased path still reads as live on Windows"
status: planned
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-14
updated: 2026-10-14
external_refs: {}
tags: []
code_refs: ["scripts/capacity.mjs", "bin/waypost", "tests/slots.test.mjs"]
specs: []
started_at: null
closed_at: null
plan_updated_at: null
---

# A live holder started through a differently cased path still reads as live on Windows

| Field | Value |
|---|---|
| **Epic** | [WP-18](../epic.md) |
| **Status** | planned |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

On win32 `slotLive()` → `processStillThere()` (`scripts/capacity.mjs`) treats a
holder as gone when `tasklist`'s image name differs from the record's
`proc.comm` — compared with `!==`, case-sensitively. `bin/waypost` records
`comm: basename(process.execPath)`, and `process.execPath` keeps the casing of
the path node was started through, while `tasklist` reports the file's own name.

Reproduced on the Windows 11 VM, 2026-10-13:
`"c:\program files\nodejs\NODE.EXE" -e …` → `basename(process.execPath)` is
`NODE.EXE`, and `tasklist /FI "PID eq <pid>" /FO CSV /NH` reports `"node.exe"`.
So a `waypost run --heavy` launched through such a path (a shim, a script, a
hand-typed path) records a holder every other Waypost reads as stale: its slot
is not counted, and the automatic cleanup can rename artifacts under a job that
is still running — the failure the fixture story below exposed in tests.

The same holds for the waypost-removing/ markers (`bin/waypost` adoption,
`isAlive` → `slotLive`).

Checked and ruled out: truncation. `tasklist` cuts image names to 25 characters
only in its table output; with `/FO CSV`, which `defaultTasklist()` uses, a
44-character image name came back whole (same VM, same day).

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [ ] compare the image name case-insensitively on win32 in `processStillThere()`
- [ ] a unit test in `tests/slots.test.mjs`: `comm: "NODE.EXE"`, `tasklist: () => "node.exe"` → live; a different name stays gone
- [ ] run `tests/slots.test.mjs` on Windows, macOS and Linux

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [ ] On win32 a record whose `comm` differs from `tasklist`'s image name only in case is live
- [ ] A record whose image name differs in more than case is still gone (the reused-pid protection is unchanged)
- [ ] `tests/slots.test.mjs` green on Windows, macOS and Linux

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

- Only the win32 branch changes; POSIX decides by the process table and never
  compares `comm`.
- Folding case is safe there: NTFS names are case-insensitive, so two images
  differing only in case are the same file name.

## Dependencies

- Found while closing "Cleanup tests prove a live holder on Windows: fixtures record the comm tasklist reports, and the fake clean tool is a real executable" (WP-18).

## Attachments

-

---

*Last updated: 2026-10-14*
