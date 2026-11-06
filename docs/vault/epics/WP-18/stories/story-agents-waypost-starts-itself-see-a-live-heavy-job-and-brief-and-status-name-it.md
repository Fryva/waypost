---
type: story
id: "story-agents-waypost-starts-itself-see-a-live-heavy-job-and-brief-and-status-name-it"
epic: "WP-18"
title: "Agents waypost starts itself see a live heavy job, and brief and status name it"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-05
updated: 2026-11-06
external_refs: {}
tags: []
code_refs: ["scripts/heavy-jobs.mjs", "scripts/team-transport.mjs", "scripts/team-quota-native.mjs", "scripts/brief.mjs", "bin/cli/status.mjs", "bin/cli/run.mjs", "tests/heavy-job-visibility.test.mjs", "tests/harness.test.mjs", "scripts/team-host.mjs"]
specs: []
started_at: "2026-11-06T02:58:08.678Z"
closed_at: "2026-11-06T04:10:35.491Z"
plan_updated_at: "2026-11-06T02:58:08.678Z"
---

# Agents waypost starts itself see a live heavy job, and brief and status name it

| Field | Value |
|---|---|
| **Epic** | [WP-18](../epic.md) |
| **Status** | done |
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

- [x] `team` reads live holders (`readHolders`) before it starts peers and
      warns, naming the job; it starts them only when told to go ahead
- [x] `brief` and `status` name a live heavy slot: command, host, since when
- [x] tests for both

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

1. `scripts/heavy-jobs.mjs` (new; `capacity.mjs` keeps its pinned export surface) — `liveHeavyJobs()`: the machine's live slot
   holders (`readHolders` over the slot table and the legacy ones) minus the
   job this process runs inside — its id in `WAYPOST_HEAVY_SLOT`, or on POSIX
   a holder whose wrapper pid is one of our ancestors. `heavyJobLine()` says
   one in a sentence: command, host, since.
2. `bin/cli/run.mjs` — `run --heavy` exports its slot id to the job as
   `WAYPOST_HEAVY_SLOT` (comma-joined when nested).
3. `scripts/team-transport.mjs` — `assertNoHeavyJob()` at the top of every
   peer factory (`createNativeEndpoint`, `startManagedOpenCodeServer`,
   `createNativeModelInventoryEndpoint`) and of the Codex metadata session
   in `scripts/team-quota-native.mjs`: refuses with `heavy-job-live`, naming
   the job, unless `WAYPOST_BESIDE_HEAVY=1` says go ahead. The machine is
   read only when the real process would start (no injected spawn/fetch).
4. `scripts/brief.mjs` and `bin/cli/status.mjs` — one line per live job, a
   `heavy_jobs` fact in `brief --json`; nothing when there is none.
5. `tests/heavy-job-visibility.test.mjs`.

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [x] with a live heavy slot, starting team peers warns and does not start
      them without confirmation — evidence: tests/heavy-job-visibility.test.mjs
      "assertNoHeavyJob: a live job refuses and names it…", "createNativeEndpoint
      and the inventory endpoint never spawn a peer beside a live job"; live:
      `waypost run --heavy -- sleep 25` beside `createNativeEndpoint` → heavy-job-live
      naming `sleep 25`; reviewer's real-path check over every factory
- [x] without one, `team` behaves as before — evidence: "without a live job the
      factories behave as before"; npm test 2524 pass / 0 fail on the final tree
- [x] `brief` and `status` show a live heavy slot, and nothing when there is
      none — evidence: tests/heavy-job-visibility.test.mjs "status: …", "status
      inside `run --heavy` does not report the job it runs in", "brief: …"; live
      `waypost status`/`brief`/`brief --json` beside `sleep 25`

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

`scripts/heavy-jobs.mjs` reads the machine's live heavy slots minus the job
the caller runs inside (`WAYPOST_HEAVY_SLOT`, now exported by `run --heavy`,
or an ancestor wrapper/job pid). Every peer factory, the Codex quota session,
and `inspect`/`dispatchRouted` before their first journal write refuse with
`heavy-job-live` naming the job; the owner's go-ahead is
`WAYPOST_BESIDE_HEAVY=1`, and the job is still named on stderr then. `brief`
(text and `heavy_jobs` fact) and `status` print one line per job, the command
cut to 80 characters, nothing when none. The process table is read only when
some record is live. The brief budget test now runs on its own state root.

Tests: tests/heavy-job-visibility.test.mjs (9); npm test 2524 pass, 0 fail.
Fresh-context waypost-reviewer: all criteria met; its fixes F1–F3, F5, F7,
F8 applied. Left open: the reason is reduced to an exit code on the handoff
surfaces (F4); the quota-session gate has no test seam (F6); a heavy job that
starts after peers are already running is not covered ("in either order") —
a follow-up story; the env go-ahead is advisory, not a consent token.

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

## Dependencies

- ADR "Memory for heavy work: half the memory up to 2 GB, macOS by pressure
  level, no agents beside a job" (accepted 9044ce6)

## Attachments

-

---

*Last updated: 2026-11-06*
