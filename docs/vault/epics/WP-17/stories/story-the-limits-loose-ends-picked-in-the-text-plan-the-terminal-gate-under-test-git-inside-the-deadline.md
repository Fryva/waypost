---
type: story
id: "story-the-limits-loose-ends-picked-in-the-text-plan-the-terminal-gate-under-test-git-inside-the-deadline"
epic: "WP-17"
title: "The limit's loose ends: picked in the text plan, the terminal gate under test, git inside the deadline"
status: planned
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-06
updated: 2026-11-06
external_refs: {}
tags: []
code_refs: ["bin/cli/clean.mjs", "bin/cli/clean-plan.mjs", "bin/cli/auto-clean.mjs", "bin/cli/remove.mjs", "bin/cli/size.mjs", "bin/cli/status.mjs", "scripts/cleanup.mjs", "scripts/cleanup-limit.mjs", "scripts/sizes-git.mjs", "tests/limit.test.mjs", "tests/cleanup.test.mjs", "tests/sizes.test.mjs"]
specs: []
blocked_by: ["WP-17/story-the-machine-wide-limit-automatic-cleanup-at-the-end-of-a-heavy-run"]
started_at: null
closed_at: null
plan_updated_at: null
---

# The limit's loose ends: picked in the text plan, the terminal gate under test, git inside the deadline

| Field | Value |
|---|---|
| **Epic** | [WP-17](../epic.md) |
| **Status** | planned |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

The machine-wide limit was accepted and closed on 2026-11-06 with five loose
ends recorded in that story's Final Summary. One of them is a promise the ADR
makes to a person and the code keeps only to a machine; the other four are
behaviour that exists and works but is asserted by nothing, so the next
refactoring is free to break it silently. None of them blocked the close, and
none is a new feature: this story is the cost of leaving them.

The user is the owner at a terminal reading `waypost clean`'s plan, and every
later session that will trust these paths without re-deriving them.

What is open, from
[The machine-wide limit](story-the-machine-wide-limit-automatic-cleanup-at-the-end-of-a-heavy-run.md):

1. **`picked` is invisible in the text plan.** The manual plan computes it
   from the active setting and carries it in `--json`, but `printCleanPlan`
   never prints it, so a person reading the plan cannot see what the limit
   would take. The amended ADR's Decision 4 says the plan *shows* it. There is
   no end-to-end test of the setting → `activeLimitFor` → `picked` chain
   either.
2. **The gate's terminal branch is never executed by a test.** AC2 ("on a
   terminal with no answer before the timeout, the limit is not set") was
   closed at unit level by the plan's own answer: `askYesNo` has its units,
   and the five linear lines that turn a false answer into "not set" have
   none. The 60 s constant and the preview printed above the question
   (`printLimitPreview`) are asserted nowhere.
3. **`status`'s cleanup lines rest on one regexp.** A single `/deadline/`
   match over the whole of stdout. The setting line, the `cleanup  none`
   fallback and the `ran`/`skipped`/`failed` outcomes it prints are untested,
   although `formatLimit` and `formatOutcome` have their own units.
4. **`waypost size --project`'s `waypost-removing/` line has no test.**
   `waypost_removing_bytes` appears in no test file.
5. **git's own timeouts are not nested inside the 60 s deadline** outside
   `scanProject`: `bin/cli/clean-plan.mjs` and `bin/cli/remove.mjs` call
   `gitFacts` without passing the time left, so on a pathological repository
   the sweep can overrun its deadline before the next item is considered. No
   rename happens past the deadline check, so AC10 itself holds — this is
   about the promise in the plan's step 2 ("git calls take the time left").

Also open, and deliberately not part of this story: the `interrupted` branch
(a tool trapping Ctrl-C and exiting by itself) and SIGINT are untested, and
AC9 is unverified on Windows, where the POSIX-signal tests skip. Both belong
to `story-verified-on-linux-and-windows-virtual-machines`, which is where the
per-OS evidence is collected.

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [ ] `printCleanPlan` marks the items the active limit would take, and says
      so when a limit is set but nothing qualifies; the wording stays inside
      the context budget the plan's own output already has.
- [ ] An end-to-end test of the chain: a setting in a temp machine state
      directory, a fixture over it, `waypost clean` in text and `--json`,
      asserting `picked` in both.
- [ ] A test of the refusal path with a stubbed prompt: a false answer leaves
      the setting file untouched and prints "not set"; the 60 s timeout is
      read from one named constant the test can assert.
- [ ] A test that the preview above the question names the counted total and
      what would be taken.
- [ ] Tests for `status`: the setting line, the `none` fallback, and one of
      each outcome (`ran`, `skipped`, `failed`).
- [ ] A test for `size --project`'s `waypost-removing/` line, in text and
      `waypost_removing_bytes` in `--json`.
- [ ] `clean-plan.mjs` and `remove.mjs` pass the time left to `gitFacts`; a
      test with a probe-shortened deadline shows the git call bounded by it.

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [ ] With a limit set, `waypost clean`'s text plan names the items the limit
      would take now, and a person can tell them from the rest without
      reading `--json`.
- [ ] The setting → `picked` chain is covered end to end, in text and JSON.
- [ ] A refused `[y/N]` answer and a silent timeout each leave the setting
      file byte for byte unchanged, asserted by a test rather than by reading
      the code.
- [ ] The preview printed above the question is asserted by a test.
- [ ] `status`'s setting line, its `none` fallback and all three outcomes are
      asserted by tests.
- [ ] `size --project`'s `waypost-removing/` line is asserted in text and in
      `--json`.
- [ ] A git call on the automatic and the manual path cannot outlive the
      deadline it was started under, shown by a test with a shortened
      deadline.
- [ ] `npm test` is green and `waypost doctor` reports 0 issues.

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

- Nothing here changes what is removed or when. Item 1 changes output a person
  reads, items 2-6 add tests only, item 7 bounds a call that already has a
  timeout of its own. If any of them turns out to require a decision about
  removal behaviour, that is an ADR amendment, not this story.
- The test seams already exist and are honoured only under `NODE_TEST_CONTEXT`:
  `WAYPOST_AUTOCLEAN_PROBE` (`deadline_ms`, `pause_ms`, `statfs`) and
  `WAYPOST_CLEAN_NOW`. Use them rather than adding new ones.
- Every test keeps the hermetic posture tests/limit.test.mjs already has: its
  own temp `HOME`/`XDG_STATE_HOME`/`LOCALAPPDATA`, so the real machine state
  directory and the owner's own cleanup setting are never touched, and real
  removal only ever happens inside a temp `waypost-removing/`.
- The terminal branch is reachable without a real tty: `askYesNo` already
  takes `input`/`output` streams (tests/cleanup.test.mjs:1033 drives it over a
  PassThrough pair). What is missing is a seam for `process.stdin.isTTY` in
  bin/cli/clean.mjs, which is the one piece of production code item 3 may
  need to touch.

## Dependencies

- `story-the-machine-wide-limit-automatic-cleanup-at-the-end-of-a-heavy-run`
  (done 2026-11-06, commit 30ba77a) — every item here comes from its Final
  Summary.
- The amended ADR
  [Cleanup to a machine-wide limit](../../../adr/cleanup-to-a-machine-wide-limit-set-by-the-owner-idle-artifacts-oldest-first.md)
  (accepted), Decision 4 for the plan that *shows* what the limit would take.

## Attachments

-

---

*Last updated: 2026-11-06*
