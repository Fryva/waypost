---
type: story
id: "story-the-limits-loose-ends-picked-in-the-text-plan-the-terminal-gate-under-test-git-inside-the-deadline"
epic: "WP-17"
title: "The limit's loose ends: picked in the text plan, the terminal gate under test, git inside the deadline"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-06
updated: 2026-11-06
external_refs: {}
tags: []
code_refs: ["bin/cli/clean.mjs", "bin/cli/clean-plan.mjs", "bin/cli/auto-clean.mjs", "bin/cli/remove.mjs", "bin/cli/size.mjs", "bin/cli/status.mjs", "scripts/cleanup.mjs", "scripts/cleanup-limit.mjs", "scripts/sizes-git.mjs", "tests/limit.test.mjs", "tests/cleanup-limit.test.mjs", "tests/cleanup.test.mjs", "tests/sizes.test.mjs"]
specs: []
blocked_by: ["WP-17/story-the-machine-wide-limit-automatic-cleanup-at-the-end-of-a-heavy-run"]
started_at: "2026-11-06T04:14:17.459Z"
closed_at: "2026-11-06T05:33:41.701Z"
plan_updated_at: "2026-11-06T04:14:17.459Z"
---

# The limit's loose ends: picked in the text plan, the terminal gate under test, git inside the deadline

| Field | Value |
|---|---|
| **Epic** | [WP-17](../epic.md) |
| **Status** | done |
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

- [x] `printCleanPlan` marks the items the active limit would take, and says
      so when a limit is set but nothing qualifies; the wording stays inside
      the context budget the plan's own output already has.
- [x] An end-to-end test of the chain: a setting in a temp machine state
      directory, a fixture over it, `waypost clean` in text and `--json`,
      asserting `picked` in both.
- [x] A test of the refusal path with a stubbed prompt: a false answer leaves
      the setting file untouched and prints "not set"; the 60 s timeout is
      read from one named constant the test can assert.
- [x] A test that the preview above the question names the counted total and
      what would be taken.
- [x] Tests for `status`: the setting line, the `none` fallback, and one of
      each outcome (`ran`, `skipped`, `failed`).
- [x] A test for `size --project`'s `waypost-removing/` line, in text and
      `waypost_removing_bytes` in `--json`.
- [x] `clean-plan.mjs` and `remove.mjs` pass the time left to `gitFacts`; a
      test with a probe-shortened deadline shows the git call bounded by it.

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

1. **`picked` in the text plan** (`bin/cli/clean-plan.mjs`, `bin/cli/clean.mjs`).
   `formatPlan` takes the active limit and carries it as `limit` in the
   result (additive in `--json`). `printCleanPlan(result, formatLimit)`
   prints one `limit` line under `root` — the limit, and either how many
   items / GB it would take now or that nothing qualifies — and a
   `<- limit` mark on each picked item's line. No line at all without a
   limit (or with `off`), so today's output is unchanged there.
2. **The prompt's seams** (`bin/cli/clean.mjs`, `scripts/cleanup-limit.mjs`).
   The 60 s becomes `LIMIT_PROMPT_TIMEOUT_MS` in `scripts/cleanup-limit.mjs`
   (a scripts module, so the bin/cli namespace inventory does not move).
   `handleCleanLimit` gains a last `io = {}` parameter — `isTTY`, `ask`,
   `gate` — defaulting to `process.stdin.isTTY`, `askYesNo` and the real
   `gateCheck`. Deliberately a function parameter and not an environment
   probe: anything reachable from the command line would let an agent
   fake a terminal and a harness-free ancestry and walk through the very
   gate this tests. Tests call it in-process with a temp state directory.
3. **git inside the deadline** (`scripts/sizes-git.mjs`, `scripts/sizes.mjs`,
   `bin/cli/clean-plan.mjs`, `bin/cli/remove.mjs`). One helper,
   `gitTimeoutFor(deadline)` — `min(15000, time left)`, 15000 with no
   deadline — replaces scanProject's inline one and is used by
   `gatherCleanContext`'s `gitFacts` (from `walk.deadline`) and by
   `freshFactsFor` (from `ctx.deadline`, which `gatherCleanContext` now
   records). The manual `clean`/`--apply` path has no deadline and keeps
   15 s per call; the automatic path's recheck inherits the deadline
   through ctx, so `auto-clean.mjs` needs no change.
4. **Tests** (`tests/limit.test.mjs`): picked end to end in text and JSON;
   the prompt refused, timed out and accepted, with the preview asserted;
   `status`'s setting line, `none` and `ran`/`skipped`/`failed`;
   `size --project`'s `waypost-removing/` line and `waypost_removing_bytes`;
   a passed deadline making `gitFacts` answer conservatively without git
   in both call sites, and (POSIX) a fake slow `git` on PATH under a short
   `deadline_ms` probe finishing well inside its 15 s per-call budget.

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [x] With a limit set, `waypost clean`'s text plan names the items the limit
      would take now, and a person can tell them from the rest without
      reading `--json`. — evidence: bin/cli/clean-plan.mjs printCleanPlan
      (`limit` line, `<- limit` mark); test "picked end to end: setting -> plan…"
- [x] The setting → `picked` chain is covered end to end, in text and JSON.
      — evidence: tests "picked end to end: setting -> plan…" and "picked: a
      limit that takes nothing says so; no setting, or off, prints no limit line at all"
- [x] A refused `[y/N]` answer and a silent timeout each leave the setting
      file byte for byte unchanged, asserted by a test rather than by reading
      the code. — evidence: tests "gate prompt refused ('n')…" (the real
      askYesNo answering "n") and "gate prompt left unanswered until the timeout…"
- [x] The preview printed above the question is asserted by a test.
      — evidence: tests "gate prompt accepted…" (preview on stderr before the
      question is asked) and "gate prompt preview: a limit that takes nothing…"
- [x] `status`'s setting line, its `none` fallback and all three outcomes are
      asserted by tests. — evidence: tests "status: no setting reads 'cleanup
      none'…", "status: a setting prints its limit…", "status: the last
      automatic run is named — ran, skipped and failed…"
- [x] `size --project`'s `waypost-removing/` line is asserted in text and in
      `--json`. — evidence: test "size --project: items already handed to the
      deleter are reported in text and as waypost_removing_bytes in --json"
- [x] On the automatic path no git call outlives the deadline it was started
      under, shown by a test with a shortened deadline; the manual path has
      no deadline and keeps 15 s per call. (Reworded 2026-11-06 with the
      owner: the manual `clean`/`--apply` path is unbounded by design, and
      giving it a deadline would be a change to removal behaviour.)
      — evidence: tests "git inside the deadline: …" (four: gatherCleanContext,
      freshFactsFor, a hanging git under a 1500 ms deadline_ms probe — record
      `deadline: true` —, and the check-ignore + ls-files pair); each fails
      when its bound is removed (15.6 s and 3.6 s)
- [x] `npm test` is green and `waypost doctor` reports 0 issues.
      — evidence: npm test 2558 tests, 0 fail, 10 skipped; doctor 0 issues, 0 warnings (2026-11-06)

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

Landed in 4698078. `waypost clean`'s text plan now shows what the active
limit would take (a `limit` line and `<- limit` marks; `limit` in `--json`),
keeping the ADR's Decision 4 promise to a person, not only to a machine.
On the automatic path every git call takes only the time left before the
60 s deadline (`gitTimeoutFor`), `gitFacts`' budget covers check-ignore and
ls-files together, and a run whose git calls were cut is logged as stopped
by the deadline rather than as "ran, nothing to do" — the last two came from
the waypost-reviewer pass. `handleCleanLimit` takes an `io` parameter
(isTTY, ask, gate) for in-process tests — a function parameter, never an
environment probe an agent could set to walk through the owner's gate.
`LIMIT_PROMPT_TIMEOUT_MS` lives in the cleanup-limit leaf; new names stay off
the pinned sizes/cleanup facades. 17 tests added in tests/limit.test.mjs.

Follow-ups, not part of this story: the `interrupted`/SIGINT branches and
AC9 on Windows stay with `story-verified-on-linux-and-windows-virtual-machines`;
the fake-slow-git tests skip on win32. `status.mjs`'s outer `catch` (an
exception while reading the setting) is still unexercised — readCleanupSetting
itself returns null on a broken file.

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
