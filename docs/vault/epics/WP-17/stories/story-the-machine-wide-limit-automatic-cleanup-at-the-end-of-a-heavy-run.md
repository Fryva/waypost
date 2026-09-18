---
type: story
id: "story-the-machine-wide-limit-automatic-cleanup-at-the-end-of-a-heavy-run"
epic: "WP-17"
title: "The machine-wide limit: automatic cleanup at the end of a heavy run"
status: planned
priority: p2
assignee: "Ivan Morozov"
created: 2026-09-18
updated: 2026-09-18
external_refs: {}
tags: []
code_refs: ["scripts/cleanup.mjs (planned)", "scripts/sizes.mjs", "scripts/capacity.mjs", "scripts/presence.mjs", "scripts/agents.mjs", "scripts/toolchains.mjs", "toolchains/system.json", "toolchains/terraform.json", "bin/waypost", "tests/cleanup.test.mjs (planned)"]
specs: []
blocked_by: ["WP-17/story-waypost-clean-a-classified-plan-removal-after-a-yes-the-setup-audit"]
started_at: null
closed_at: null
plan_updated_at: null
---

# The machine-wide limit: automatic cleanup at the end of a heavy run

| Field | Value |
|---|---|
| **Epic** | [WP-17](../epic.md) |
| **Status** | planned |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

The owner picks one cleanup limit per machine, and Waypost keeps each
project under it by itself at the end of every `waypost run --heavy`. Only
idle, exactly identified build output is removed, oldest first, so the
incremental cache of whatever was built in the last week survives. The
decision is the ADR
[Cleanup to a machine-wide limit](../../../adr/cleanup-to-a-machine-wide-limit-set-by-the-owner-idle-artifacts-oldest-first.md)
(accepted 2026-09-18), Decisions 1–4; the `doctor` side (Decision 5) is the
doctor story.

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [ ] `waypost clean --limit [<N>|free:<P>%|off]`: print the setting and the
      choices; parse and validate (P 5–50); `cleanup-limit.<host>.json` in
      the machine state directory; log every change.
- [ ] The gate (ADR Decision 2) in `scripts/agents.mjs`: the ancestor chain
      from the process table plus the registry's environment markers,
      ignoring `WAYPOST_HARNESS`/`WAYPOST_PROC`; a terminal; a preview; `[y/N]`
      answering no after 60 s. Set, tighten and switch go through it; `off`
      and loosening do not.
- [ ] Registry data: `auto_keep_suffixes` and the OS metadata names in
      `toolchains/system.json`; `auto: false` on `.terraform`; the loader
      keeps both only from the shipped registry.
- [ ] `scripts/cleanup.mjs`: the qualifying set, the counted total and the
      oldest-first selection for GB and `free:<P>%` (the shortfall computed
      once), as pure functions.
- [ ] `scripts/sizes.mjs`: a walk mode that stops at any `.git` below the
      root; package suffixes seen during the age walk.
- [ ] `scripts/capacity.mjs`: the slot record's working directory and root,
      computed before the lock; a live record without a root blocks.
- [ ] `bin/waypost run --heavy`: after a normal exit, the conditions of
      Decision 4 (root, local storage, overlapping slot holders re-read per
      item, another host's session on the checkout), one 60 s deadline,
      re-classification and `lstat`, rename into
      `<git common dir>/waypost-removing/` under a unique name, the
      detached low-priority deleter with its pid per entry, the stderr
      report, the log with rotation at 1 MB; the wrapped command's exit
      status unchanged.
- [ ] Any `waypost clean` first purges `waypost-removing/` entries whose
      deleter is gone.
- [ ] The active setting and the last automatic outcome in `brief` and
      `status`.
- [ ] Tests for each criterion below, removing only inside temporary
      directories and a temporary machine state directory.

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [ ] Setting, tightening or switching the limit from under a harness is
      refused — also with `WAYPOST_HARNESS` set to claim none — and nothing
      is written; `off` and loosening are accepted from anywhere.
- [ ] On a terminal with no answer before the timeout, the limit is not set.
- [ ] A working set spread over several tagged items, all written within 7
      days, is left whole over the limit; the report says to raise it.
- [ ] Over a GB limit, idle qualifying items go oldest first and removal
      stops as soon as the counted total fits.
- [ ] Under `free:<P>%`, removal covers the shortfall computed once, even
      when free space does not move after a removal.
- [ ] A git-ignored generic `build/` holding release output, a tagged
      directory holding a `.pkg`, and `.terraform` are never removed
      automatically.
- [ ] A nested worktree inside the root is never entered or removed.
- [ ] With another live heavy job in the same tree (or an ancestor or
      descendant), or a live record without a root, nothing is removed.
- [ ] A wrapped command ended by a signal triggers no cleanup; a signal
      during the cleanup leaves nothing half-removed inside the project.
- [ ] Past the deadline nothing more is renamed, and the outcome says so in
      `status`.
- [ ] On non-local storage, outside git, or at the home directory, nothing
      is removed.
- [ ] Leftovers in `waypost-removing/` whose deleter is gone are purged by
      the next `waypost clean`; an entry whose deleter is alive is left.
- [ ] `run --heavy` exits with the wrapped command's status whatever the
      cleanup did; each run appends one log line.
- [ ] `npm test` is green and `waypost doctor` reports 0 issues.

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

## Dependencies

- `story-waypost-clean-a-classified-plan-removal-after-a-yes-the-setup-audit`
  (the plan, the removal checks, the log).

## Attachments

-

---

*Last updated: 2026-09-18*
