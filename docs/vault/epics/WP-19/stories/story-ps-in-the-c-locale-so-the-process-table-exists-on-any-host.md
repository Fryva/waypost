---
type: story
id: "story-ps-in-the-c-locale-so-the-process-table-exists-on-any-host"
epic: "WP-19"
title: "ps in the C locale, so the process table exists on any host"
status: done
priority: p1
assignee: "Ivan Morozov"
created: 2026-09-30
updated: 2026-09-30
external_refs: {}
tags: []
code_refs: ["scripts/presence.mjs", "scripts/agents.mjs", "scripts/doctor.mjs", "tests/presence.test.mjs", "tests/harness.test.mjs", "tests/limit.test.mjs"]
specs: []
started_at: "2026-09-30T16:17:51.269Z"
closed_at: "2026-09-30T17:15:02.761Z"
plan_updated_at: "2026-09-30T16:17:51.269Z"
---

# ps in the C locale, so the process table exists on any host

| Field | Value |
|---|---|
| **Epic** | [WP-19](../epic.md) |
| **Status** | done |
| **Priority** | p1 |
| **Assignee** | Ivan Morozov |

---

## Description

`processTable()` reads `ps axo pid=,ppid=,lstart=,comm=` and matches `lstart`
against a regex written for the English spelling. `ps` formats that field per
`LC_TIME`, so on a host with any other time locale the whole table fails to
parse and `processTable()` returns `null`.

The user is anyone whose shell is not in English — a large share of Waypost's
audience, and every host this fork is installed on by someone other than its
author. For them the process layer is off. The consumers are wider than
liveness: every one of these is restored by the same one-line fix, and none of
them is named in the epic as it stands.

- a presence record carries `"proc": null`, so "on this host a record whose
  harness process is gone is reaped by `--prune` at once" is false and every
  session waits out the 24h age threshold (41 records here: 23 with a process,
  18 without, and the 18 are the recent ones);
- `harnessProcess()` returns `null`, so `detectHarness()` falls back to env
  markers alone and the process-first rule from f2dfe91 stops applying in
  production;
- `gateCheck()` degrades to `process_table: false` and the machine-wide-limit
  consent gate runs on env markers alone;
- cleanup's `inUseSignal` drops to `recency-only`, so a running tool stops
  protecting its cache directory;
- the detached deleter's pid-reuse guard falls back to the 24h cap, and its own
  comment warns that a wrong-but-present `started`/`ticks` would make a live
  deleter read as a reused pid;
- heavy-slot liveness falls back to signal-0 plus the 24h cap.

The failure is silent from the product's side. `waypost doctor` reports a
healthy vault, because nothing about the vault is wrong.

## Decomposition

- [x] `processTable()` spawns `ps` with `LC_ALL=C` in the **child's** environment
      only — the user's own locale is never mutated, and the parser keeps reading
      the one spelling it knows
- [x] A test with a fake `ps` on `PATH` that answers in a non-English spelling of
      `lstart` **iff `$LC_ALL` is not `C`**, and in the C spelling when it is —
      the fake has to read its own environment, because a `ps` that ignores the
      locale cannot be made to speak English. Skipped on `win32` (there is no
      table to have). `process.env.PATH` restored in a `finally`: `node --test`
      shares one process per file and the rest of `presence.test.mjs` spawns
      `git` and `node`
- [x] A negative test pinning the intent: a localized `ps` answer must yield
      `null`, never a partial table. Without it, a later "widened" regex that
      happens to accept one more spelling would parse *some* rows and pass
      everything
- [x] `harnessOfProcess()` takes the table (or the resolved `proc`) as a
      parameter beside `env`, so the process-first rule is testable without
      `WAYPOST_PROC` and without a real ancestor chain. Test: a synthetic table
      naming `opencode` plus `{OPENCODE:"1", CLAUDECODE:"1"}` must answer
      `opencode`
- [x] `waypost doctor` says so when there is no process table, instead of
      reporting a healthy vault — the locale axis is only the first cause, and
      the next one is silent in exactly the same way

## Implementation Plan

1. `scripts/presence.mjs` `processTable()` — pass an explicit `env` to
   `spawnSync`: `{ ...process.env, LC_ALL: "C" }`. Nothing else changes: the
   regex, the `platform() === "win32"` early return, `startTicks()` and the
   `table.size ? table : null` contract all stay. This is deliberately not a
   wider change — `ps -o lstart=` is the only field whose format is
   locale-defined, and the alternatives (`-o start=`, `-o etimes=`) trade a
   locale problem for a portability one, since those spellings differ between
   macOS and Linux `ps`. The existing C format is also what `processGone()`'s
   string comparison already assumes, so keeping it changes no contract.
2. `scripts/agents.mjs` `harnessOfProcess()` — take the table as an argument.
   Note that `detectHarness()`'s own `env === process.env` guard (agents.mjs:693)
   is deliberate: a caller passing a synthetic env wants env-only behaviour, and
   that is what makes the f2dfe91 case testable. A test that asserts
   `detectHarness({OPENCODE:"1", CLAUDECODE:"1"})` is `opencode` is **not** a
   test of the regression and never will be — see Technical Notes.
3. `tests/presence.test.mjs` — the fake-`ps` test and the negative test.
4. `scripts/doctor.mjs` — a finding when `processTable()` returns `null` on a
   platform that is not `win32`, naming `ps` and the locale as the things to
   check. Informational or a warning, not an issue: on a host without `ps` the
   tool is behaving correctly by falling back.
5. `waypost doctor` runs `processTable()` — check the cost before shipping it
   there; if a full `ps axo` per doctor run is not acceptable, cache the verdict
   per process rather than per call.
   — measured 2026-09-30: **54 ms per call**, 271 ms for five, so caching is
   not premature; a `doctor` run costs well under a second and the check is
   ordered with the other `install` checks, whose own `git` calls dominate it.
   Left uncached, because the alternative is a per-process cache with an
   invalidation rule of its own — one more thing to be wrong about, for 54 ms.

## Acceptance Criteria

- [x] `processTable()` returns a non-empty table on a host with a non-English
      `LC_TIME`, and the child `ps` runs with `LC_ALL=C` while the caller's own
      `process.env` is unchanged — evidence: the fake-`ps` test, and
      `node -e 'import("./scripts/presence.mjs").then(m=>{const t=m.processTable();console.log(t?t.size:0)})'`
      printing a number here
      — measured 2026-09-30 under `LANG=ru_RU.UTF-8`: `718`, and
      `harnessProcess()` → `{"pid":72835,"comm":"opencode"}`
- [x] The fake-`ps` test fails against the pre-fix code and passes after it; a
      fake that ignores its locale yields `null`, not a partial table —
      evidence: `npm test`
      — pre-fix re-run with only the child `env` removed from `processTable()`:
      "the process table exists whatever LC_TIME…" and "a record's liveness is
      decided by that table" both fail, the negative control stays green
- [x] `processGone()` answers from a live record on a localized host, so
      `waypost sessions --prune` reaps a record whose harness process is gone
      without waiting 24h — evidence: a test on `processGone` with a record
      built from the table the fake-`ps` fixture yields (deliberately the fake,
      not the real one — see the note in the test), and the live presence record
      for this session carrying a `proc.pid`
      — the new test prunes `gone` at once while keeping `alive` (its pid is in
      the table) and `silent` (no `proc` at all, so still the age rule's business);
      the live record `.git/waypost/docs-vault/presence/opencode-C-4608-….json`
      carries `"proc": {"pid": 72835, "comm": "opencode"}`; `waypost sessions
      --prune` reaped 48 records that had been waiting out the 24h threshold
- [x] `detectHarness()` prefers the process over the env markers with no
      `WAYPOST_PROC` injection: a table naming `opencode` plus
      `{OPENCODE:"1", CLAUDECODE:"1"}` answers `opencode` — evidence: the new
      test in `tests/harness.test.mjs`
      — "the same rule, through the process table itself rather than a pinned
      WAYPOST_PROC": the chain `node → zsh → opencode` answers `opencode` while
      both env markers are set, a dead-end chain falls back to env, and an
      explicit `WAYPOST_HARNESS` still wins
- [x] `waypost doctor` reports the missing process table by name instead of a
      clean vault — evidence: the doctor finding, and a test
      — `checkProcessTable()` in the `install` group, level `warn` (there is no
      repair to offer), naming the `ps axo` format and the C locale; the test
      asserts both injectable branches, and the review verified the third
      (`win32` → no findings) and a `PATH` without `ps` on this host. The
      **`install` group is clean here** because the table now parses — which is
      the point: the same group on the pre-fix host said clean while saying
      nothing about why. (`doctor` as a whole still reports a `code-map` issue
      until the derived view is regenerated; unrelated to this check.)
- [x] `tests/presence.test.mjs` and `tests/harness.test.mjs` green — evidence:
      `npm test -- tests/presence.test.mjs tests/harness.test.mjs` (measured
      pre-fix under `LC_ALL=C`: 40 pass, 2 skip, 0 fail)
      — full suite 2026-09-30 after the fix: **806 tests, 801 pass, 0 fail,
      5 skipped** (the 5 skips are the pre-existing `platform() !== "linux"`
      tick cases). One red test was found and fixed on the way: `tests/limit.
      test.mjs` "AC1 (a)" asserted `/claude/i` and had been passing only
      because the table was empty; it now differences two runs instead, which
      is what a negative claim about un-read variables can actually assert
- [x] The user's shell locale is untouched: the fix sets `LC_ALL` on the child's
      `env` object only — evidence: the diff, and the fake-`ps` test asserting
      `process.env.LC_ALL` is what it was
      — the diff is one `env:` argument on the existing `spawnSync`; the test
      asserts `LC_ALL` and `LANG` both

## Final Summary

`ps axo pid=,ppid=,lstart=,comm=` is now spawned with `LC_ALL=C` on the child's
`env` object only, so the one field whose format is locale-defined comes back in
the spelling the parser knows on every host, and the user's own shell locale is
untouched. On the host that found this, `processTable()` went from 0 of 784 rows
to a full table, and with it came back everything that had silently degraded:
presence liveness, harness attribution by process, the machine-wide-limit
consent gate, cleanup's in-use signal, the detached deleter's pid-reuse guard
and heavy-slot liveness.

Three seams came with it, because each of those rules could not otherwise be
tested on the machine that broke it: `harnessProcess(table, ppid)` and
`detectHarness(env, {table, ppid})` make the process-first harness rule — which
had no test exercising the table walk at all — assertable against a synthetic
chain, and `checkProcessTable()` in doctor says out loud when there is no table
at all, since a vault that is healthy while its process layer is off is exactly
what went unreported here.

Tests run: `npm test` — **807 tests, 802 pass, 0 fail, 5 skipped** (the 5 skips
are the pre-existing `platform() !== "linux"` tick cases). Re-running the two
new locale cases against the pre-fix `processTable()` fails both, which is the
diagnosis held in place rather than a claim about it.

Risks and follow-ups, none of them blockers:

- The busybox/minimal-container axis is untouched and still returns `null`; it is
  named in Technical Notes, and doctor now reports it instead of hiding it.
- A host with no usable `ps` at all gets a permanent, un-suppressible warning
  from every `brief`/`next`/`doctor`. Accepted knowingly: the alternative is the
  silence this story exists to remove.
- `scripts/agents.mjs` and `tests/harness.test.mjs` each carry one hunk from the
  unrelated routing-block workstream; the commit shape for those two files is a
  decision for the author, not something this story resolved.

## Technical Notes

- `LC_ALL=C` alone. Do not also set `LANG=C`: `LC_ALL` is consulted first, so
  the "host consults `LANG` when `LC_ALL` is empty" case cannot arise once it is
  set. (The first draft of this story said otherwise; a critic pass showed it
  was false.)
- **Do not** make the regex accept a localized spelling. The parser must never
  learn a language — which is why the negative test above exists.
- A test that runs a real `harnessProcess()` cannot work in CI: under
  `node --test` the nearest non-shell ancestor of the test process is `node`
  itself, which is in no registry entry, so no real-table assertion can ever
  resolve to `opencode`. Hence the injected table in item 4.
- The epic's original demonstration of the regression —
  `detectHarness({OPENCODE:"1", CLAUDECODE:"1"})` answering `claude` — is **not
  evidence**: `harnessOfProcess` reads the process only when `env === process.env`,
  so a literal env object is env-only by construction, and that call answers
  `claude` on an English host too. The regression is real in production
  (`detectHarness()` on `process.env`) and this AC tests it through a seam that
  exists. The epic's Context says so, not this.
- The pre-existing red test is the diagnosis, not the goal: "a beat records the
  harness process; on this host a gone process ends the session at once" is
  right, and its assertion message ("our own ancestor, alive right now") is
  what made the cause findable. Keep the assertion as it is.
- **Residual gap, named rather than hidden.** `processTable()` also returns
  `null` when `ps` rejects the `axo pid=,ppid=,lstart=,comm=` format outright —
  busybox `ps` in an Alpine container, a minimal devcontainer, a stripped
  `PATH`. This story closes the locale axis only; the epic's and this story's
  titles promise more than one fix delivers, which is why item 5 (doctor) is in
  scope. Closing the busybox axis is a separate call about degrading to `ps -ef`
  or accepting a partial table, and it is not taken here.
- A `ppid` passed without a `table` is read against the real table rather than
  discarded, because a synthetic `env` fails the `env === process.env` guard that
  keeps `detectHarness({...})` env-only — so reading only when a table is present
  would turn "look here" into a silent no-op indistinguishable from a host that
  genuinely has none. No caller does this today and no hermetic test can cover it
  (the answer depends on the real table, which is the thing that cannot be faked
  from here); the branch exists so the trap is closed rather than left documented.
- `checkProcessTable()` may be the second `ps axo` in a `doctor` run, since
  `peers()` calls `processTable()` again through its own `tableOnce()`. Measured
  `doctor --install --json` at 323 ms total, so no cache; the story's cost figure
  above is per call, not per run.
- Records written before this fix carry a null `proc` and degrade safely: a
  reader with no table has no opinion and the 24h rule applies. Records written
  after carry a C-locale `started`, which is the same string a pre-fix reader on
  an English host already compared against. No migration.

## Dependencies

- none

## Attachments

- live evidence, 2026-09-30: 0/784 rows parsed with `LANG=ru_RU.UTF-8`, 784/784
  with `LC_ALL=C`; the record
  `.git/waypost/docs-vault/presence/opencode-C-4608-…json` holds `"proc": null`;
  `tests/presence.test.mjs:798` fails with `actual: null`
- critic pass 2026-09-30: `revise` — the fake-`ps` test as first written was
  unpassable, and AC4's evidence could not exist; both corrected above
- post-fix, 2026-09-30: `processTable()` → 718 rows under `LANG=ru_RU.UTF-8`,
  `harnessProcess()` → `{pid: 72835, comm: "opencode"}`, the live record holds
  that `proc`, and `waypost sessions --prune` reaped 48 records the 24h rule had
  been holding. `waypost doctor` reports 0 issue, 0 warning — including nothing
  about the process table, which is now something it can see.
- the fix exposed one more thing, which is in the diff as
  `harnessProcess(table, ppid)` and `detectHarness(env, {table, ppid})`: the
  process-first rule from f2dfe91 had **no test at all**. The existing test
  injected the already-resolved `proc` as `WAYPOST_PROC`, which is the
  same-process call bin/waypost makes — it can pass on a host where the table
  never parses, and did. The pre-existing red test is that gap showing itself.

---

*Last updated: 2026-09-30*
