---
type: story
id: "story-the-machine-wide-limit-automatic-cleanup-at-the-end-of-a-heavy-run"
epic: "WP-17"
title: "The machine-wide limit: automatic cleanup at the end of a heavy run"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-09-18
updated: 2026-11-06
external_refs: {}
tags: []
code_refs: ["bin/waypost", "bin/cli/clean.mjs", "bin/cli/clean-plan.mjs", "bin/cli/clean-apply.mjs", "bin/cli/auto-clean.mjs", "bin/cli/deleter.mjs", "bin/cli/remove.mjs", "bin/cli/run.mjs", "bin/cli/slots.mjs", "bin/cli/size.mjs", "bin/cli/status.mjs", "scripts/cleanup.mjs", "scripts/cleanup-limit.mjs", "scripts/cleanup-selection.mjs", "scripts/sizes.mjs", "scripts/sizes-measure.mjs", "scripts/sizes-git.mjs", "scripts/capacity.mjs", "scripts/presence.mjs", "scripts/agents.mjs", "scripts/agents-detection.mjs", "scripts/lib.mjs", "scripts/lib-machine-state.mjs", "scripts/brief.mjs", "scripts/toolchains.mjs", "toolchains/system.json", "toolchains/terraform.json", "docs/toolchains.md", "prompts/cleanup.md", "tests/limit.test.mjs", "tests/cleanup.test.mjs", "tests/cleanup-limit.test.mjs", "tests/cleanup-selection.test.mjs", "tests/sizes.test.mjs", "tests/toolchains.test.mjs", "tests/slots.test.mjs", "tests/harness.test.mjs", "CHANGELOG.md"]
specs: []
blocked_by: ["WP-17/story-waypost-clean-a-classified-plan-removal-after-a-yes-the-setup-audit"]
started_at: "2026-09-18T21:10:42.411Z"
closed_at: "2026-11-06T03:23:41.888Z"
plan_updated_at: "2026-09-18T21:10:42.411Z"
---

# The machine-wide limit: automatic cleanup at the end of a heavy run

| Field | Value |
|---|---|
| **Epic** | [WP-17](../epic.md) |
| **Status** | done |
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

- [x] `waypost clean --limit [<N>|free:<P>%|off]`: print the setting and the
      choices; parse and validate (P 5–50); `cleanup-limit.<host>.json` in
      the machine state directory; log every change.
- [x] The gate (ADR Decision 2) in `scripts/agents.mjs`: the ancestor chain
      from the process table plus the registry's environment markers,
      ignoring `WAYPOST_HARNESS`/`WAYPOST_PROC`; a terminal; a preview; `[y/N]`
      answering no after 60 s. Set, tighten and switch go through it; `off`
      and loosening do not.
- [x] Registry data: `auto_keep_suffixes` and the OS metadata names in
      `toolchains/system.json`; `auto: false` on `.terraform`; the loader
      keeps both only from the shipped registry.
- [x] `scripts/cleanup.mjs`: the qualifying set, the counted total and the
      oldest-first selection for GB and `free:<P>%` (the shortfall computed
      once), as pure functions.
- [x] `scripts/sizes.mjs`: a walk mode that stops at any `.git` below the
      root; package suffixes seen during the age walk.
- [x] `scripts/capacity.mjs`: the slot record's working directory and root,
      computed before the lock; a live record without a root blocks.
- [x] `bin/waypost run --heavy`: after a normal exit, the conditions of
      Decision 4 (root, local storage, overlapping slot holders re-read per
      item, another host's session on the checkout), one 60 s deadline,
      re-classification and `lstat`, rename into
      `<git common dir>/waypost-removing/` under a unique name, the
      detached low-priority deleter with its pid per entry, the stderr
      report, the log with rotation at 1 MB; the wrapped command's exit
      status unchanged.
- [x] Any `waypost clean` first purges `waypost-removing/` entries whose
      deleter is gone.
- [x] The active setting and the last automatic outcome in `brief` and
      `status`.
- [x] Tests for each criterion below, removing only inside temporary
      directories and a temporary machine state directory.

## Implementation Plan

From a `waypost-planner` pass (2026-09-18) at a2dacab, with the lead's
answers. No new runtime module: pure decisions in `scripts/cleanup.mjs`, walk
facts in `scripts/sizes.mjs`, reads in `capacity`/`presence`/`agents`/`lib`,
every write, rename and removal in `bin/waypost`.

1. **Pure (`scripts/cleanup.mjs`)**: `parseLimit` (`N` GiB, `free:P%` 5–50,
   `off`); `limitChange(cur, next)` → same / set / tighten / loosen / switch /
   off, with `gated` for set, tighten and switch; `limitDecision`;
   `shortfallOf({size, avail}, P)`; `limitNeed(classified, limit, now,
   {shortfall, dev})` → counted, need, eligible (oldest first; under `free:`
   only items on the root's device); `pickUnderLimit` rebuilt on it;
   `qualifiesForLimitKind` also requires `auto !== false` and no package, so
   those leave the counted total and are reported apart; `recheck` merges the
   fresh package facts and returns the merged item; `formatLimit`,
   `formatOutcome`; `logLine` with `kind: limit|auto|purge`.
2. **Walk (`scripts/sizes.mjs`)**: `keepSuffixesOf(entries)` from the
   `system` entry (the suffixes are never spelled in this file — guards);
   the owner carries `auto` (shipped only); `dirBytes`/`inspectDir`/
   `scanProject` gain `stopAtGit` (never enter a directory holding `.git`
   below the root; `nested_skipped`), `holds_package`/`package`, a
   `deadline` checked every 512 entries (`stopped_by: "deadline"`) and
   `locators: false`; git calls take the time left.
3. **Reads**: `capacity.blockingHolder(holders, {self, root, platform,
   canon})` — own id skipped; a record lacking both `root` and `cwd` (older
   Waypost) blocks; otherwise `root`, or `cwd` when `root` is null, blocks
   when it overlaps ours; `lib.treesOverlap` (case-folded on darwin and
   win32), `REMOVING_DIR`, `readCleanupSetting`, `readLastAutoCleanup` (last
   `kind: auto` line, then `.1`); `presence.sharedTree({contain: true})`;
   `agents.gateCheck` — the whole ancestor chain from the live process table
   (as `harnessOfProcess` matches) plus every harness's env markers, never
   `WAYPOST_HARNESS`/`WAYPOST_PROC`, providers skipped, reading the shipped
   `harnesses/` beside the executable plus the project's (which may only add
   markers); env markers alone where there is no table, recorded.
4. **Data**: `auto_keep_suffixes` on `toolchains/system.json`; `auto: false`
   on `.terraform`; `docs/toolchains.md`.
5. **`waypost clean --limit [<v>]`** (no slot; refuses `--apply` with it):
   without a value prints the setting, the last automatic outcome and the
   choices; a gated change needs no harness by `gateCheck` and a TTY, a
   preview of what the limit would take now (or "no project here"), and
   `[y/N]` (no after 60 s); refused changes write and log nothing; the
   setting `cleanup-limit.<host>.json` (limit, set_at, change, previous,
   gate: required/checked/harness/via/ancestors/markers/tty/answer, session)
   is written atomically and one `kind: limit` line is logged; `off` and
   loosening are written from anywhere with the gate's view recorded.
6. **Slot record**: `slotWhere(dir)` (one `git rev-parse --show-toplevel
   --git-common-dir`, realpath, null outside git) is computed before the
   lock; `claimSlot(..., where)` stores `cwd` and `root` and returns `id`;
   callers in setup, `size --global`, `clean` and `run`.
7. **`run --heavy`**: `where` from `process.cwd()` before the retry loop;
   `runHeavy` records a signal (also a trapped Ctrl-C) and a spawn failure,
   removes its signal handlers after the child exits (default handling
   again), keeps the command's status, runs `autoCleanup` in try/catch and
   releases the slot in `finally`; nothing on this path may call `fail()` or
   `readConfig()`.
8. **`autoCleanup`**, in order: setting absent or off → silent; signal or
   spawn failure → skip; no git root → skip; pin `WAYPOST_PROJECT_DIR` to the
   root and the registry to the executable's own tree; hand leftovers to the
   deleter whatever follows; `refusePath` (home via realpath); local storage;
   git common dir on the root's filesystem; no overlapping live holder; no
   other host sharing the checkout (vault read by hand, never `fail()`); one
   60 s deadline over the scan, checks and renames; the plan with `stopAtGit`
   and no locators; under `free:` the shortfall computed once; oldest first
   while short: deadline, holders re-read, `recheckItem` +
   `qualifiesForLimit`, rename; then the detached deleter; a short stderr
   report naming the repair ("raise it: `waypost clean --limit <N>`" /
   "`waypost size --global`", with the APFS note) and one `kind: auto` log
   line (result ran/skipped/failed, reason, counted, need, shortfall,
   renamed, skipped, stayed, excluded, nested_skipped, deadline, elapsed,
   deleter pid, adopted, clock).
9. **Rename and deleter**: `selfMarker()` factored out of `claimSlot`
   (liveness decided by `capacity.slotLive`, boot rules included);
   `renameForRemoval` writes `<unique>.json` first, then renames into
   `<git common dir>/waypost-removing/<unique>` (EXDEV → another
   filesystem, EPERM/EBUSY → a file open inside: skipped with the reason);
   `spawnDeleter` runs `waypost __waypost-delete <dir> <names…>` detached,
   low priority; the internal command is dispatched first in `main()` and
   validates the directory name, a real directory, the name shape and a
   marker for each; `leftoversOf(common)` adopts entries with no marker or a
   dead same-host owner, leaves live and other-host ones; `waypost clean`
   hands leftovers over right after its claim (`kind: purge` logged only
   when something was handed over); `--limit` never purges.
10. **Log rotation** at 1 MiB into `.1` in `appendCleanLog`; `waypost size
    --project` reports the size of `waypost-removing/`; the manual plan marks
    `picked` from the active setting.
11. **`status` and `brief`**: one or two lines — the setting and the last
    automatic outcome — within the standing-context budget tests.
12. **Test seam**: `WAYPOST_AUTOCLEAN_PROBE` (`deadline_ms` only shorter,
    `pause_ms` after each rename, `statfs`), honoured only under
    `NODE_TEST_CONTEXT`, announced on stderr.

**Tests**: a new `tests/limit.test.mjs` end to end (temp HOME,
XDG_STATE_HOME, LOCALAPPDATA; `WAYPOST_CLEAN_NOW`; the setting written into
the temp state dir; fixtures in temp git repos), one or more per criterion;
units in the existing test files; the slot record's new fields in
`tests/slots.test.mjs`. A harness ancestor is simulated by a symlink named
after a harness running Waypost as its child, with env markers stripped.

**Commits**: A — data, walk and pure decisions (units); B — `clean --limit`,
the slot record's fields, rotation, markers, deleter and leftovers, status
and brief; C — the automatic path in `run --heavy`, the probe, the end-to-end
tests, CHANGELOG and one line in `prompts/cleanup.md`.

**Lead's answers**: package and `auto: false` items leave the counted total;
a record with `root: null` is compared by its `cwd` (only one lacking both
blocks — otherwise any heavy job outside git would switch the limit off
machine-wide); one log line per heavy run only while a limit is set; refused
`--limit` attempts are not logged; the registry is pinned to the
executable's own tree on the automatic path and in the gate;
`WAYPOST_HARNESS` is ignored by the gate; leftovers go to the background
deleter from both paths; `size` reports `waypost-removing/`; the terminal
`[y/N]` is covered as units; the manual plan marks `picked`.

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [x] Setting, tightening or switching the limit from under a harness is
      refused — also with `WAYPOST_HARNESS` set to claim none — and nothing
      is written; `off` and loosening are accepted from anywhere.
      — evidence: tests/limit.test.mjs:365 (an ancestor process named after a
      harness, matched through a symlink; the message names its pid), :335
      (a lying `WAYPOST_HARNESS`/`WAYPOST_PROC` changes nothing — the gate
      never reads them), :404 and :416 (tighten and switch refused, the
      setting file byte for byte unchanged), :430/:446/:462 (`off`, a looser
      GB limit and a looser `free:` accepted under a harness marker, one
      `kind: limit` line each); code bin/cli/clean.mjs, scripts/agents-detection.mjs.
- [x] On a terminal with no answer before the timeout, the limit is not set.
      — evidence, at unit level only, which is what this story's plan chose
      ("the terminal `[y/N]` is covered as units"): tests/cleanup.test.mjs:1033
      (silence past the timeout resolves false), :1041 (EOF resolves false),
      and bin/cli/clean.mjs:151-159, where a false answer prints "not set" and
      returns before the write at :176-179. No end-to-end test drives a real
      terminal, so neither the 60 s constant nor the preview printed above the
      question is asserted anywhere — see Technical Notes.
- [x] A working set spread over several tagged items, all written within 7
      days, is left whole over the limit; the report says to raise it.
      — evidence: tests/limit.test.mjs:592 (three items 2 days idle, a tiny
      limit: all three survive, stderr says to raise it, nothing renamed);
      units tests/cleanup.test.mjs:467, :481.
- [x] Over a GB limit, idle qualifying items go oldest first and removal
      stops as soon as the counted total fits.
      — evidence: tests/limit.test.mjs:609 (of three idle items only the
      oldest is renamed), :791 (holders re-read between items); unit
      tests/cleanup.test.mjs:567 (`limitNeed`).
- [x] Under `free:<P>%`, removal covers the shortfall computed once, even
      when free space does not move after a removal.
      — evidence: tests/limit.test.mjs:628 (a frozen `statfs` probe: exactly
      the two oldest items cover the shortfall; recomputing it per item would
      have taken all three); unit tests/cleanup.test.mjs:590.
- [x] A git-ignored generic `build/` holding release output, a tagged
      directory holding a `.pkg`, and `.terraform` are never removed
      automatically.
      — evidence: tests/limit.test.mjs:648 (all three survive; `excluded`
      names each reason: generic name, distributable package, `auto: false`);
      tests/toolchains.test.mjs:164, :299; toolchains/system.json,
      toolchains/terraform.json.
- [x] A nested worktree inside the root is never entered or removed.
      — evidence: tests/limit.test.mjs:685 (a linked worktree and a nested
      repository, each holding an idle tagged directory: `nested_skipped`
      names them, nothing renamed); tests/sizes.test.mjs:560, :577.
- [x] With another live heavy job in the same tree (or an ancestor or
      descendant), or a live record without a root, nothing is removed.
      — evidence: tests/limit.test.mjs:711 (the same root), :728 (an
      ancestor), :749 (a descendant), :764 (a record naming neither root nor
      cwd blocks unconditionally), :777 (an unrelated holder does not block),
      :791 (holders re-read before each item), :817 (another host on this
      checkout). Narrowed as the plan's own answers state: a record with
      `root: null` but a `cwd` is compared by that `cwd`, so only a record
      lacking both blocks unconditionally. The filesystem root was an
      exception until this close — `treesOverlap("/", …)` was false, so a
      heavy job started at `/` blocked nothing; fixed in scripts/lib.mjs:76
      with tests/cleanup.test.mjs:788-790.
- [x] A wrapped command ended by a signal triggers no cleanup; a signal
      during the cleanup leaves nothing half-removed inside the project.
      — evidence: tests/limit.test.mjs:848 (the child ends itself by SIGTERM:
      exit 143, nothing renamed), :862 (a signal to the wrapper mid-sweep:
      the item already renamed is outside the project, the next is untouched,
      one marked entry in `waypost-removing/`). The `interrupted` branch (a
      tool trapping Ctrl-C and exiting itself) and SIGINT are not covered.
- [x] Past the deadline nothing more is renamed, and the outcome says so in
      `status`.
      — evidence: tests/limit.test.mjs:896 (a 1 s deadline probe with a 1.5 s
      pause: the first item is renamed, the second is not, the record says
      `deadline`, and `waypost status` prints it); the scan-phase deadline as
      a unit, tests/sizes.test.mjs:621.
- [x] On non-local storage, outside git, or at the home directory, nothing
      is removed.
      — evidence: tests/limit.test.mjs:917 (a root under a Dropbox path),
      :941 ("not in a git work tree"), :953 (HOME equal to the root — a
      protected path); unit tests/cleanup.test.mjs:102 (`refusePath`).
- [x] Leftovers in `waypost-removing/` whose deleter is gone are purged by
      the next `waypost clean`; an entry whose deleter is alive is left.
      — evidence: tests/limit.test.mjs:512 (a dead pid is adopted and gone
      within 10 s, a live one is left), :561 (an entry that lost its marker is
      re-marked and removed; a name of another shape is left and counted).
- [x] `run --heavy` exits with the wrapped command's status whatever the
      cleanup did; each run appends one log line.
      — evidence: tests/limit.test.mjs:966 (exit 3 passes through after a
      rename), :977 (a cleanup failure does not change it), :1011 (a deleter
      that cannot be spawned at all: the child keeps its own exit code 7 and
      reports no pid — before this close the missing `'error'` listener made
      that an uncaught exception and exit 1, see Technical Notes), :991 (the
      log grows by exactly one line per run). Narrowed as the plan's own
      answers state: one line per heavy run only while a limit is set; with
      no limit or `off` the cleanup exits silently and logs nothing.
- [x] `npm test` is green and `waypost doctor` reports 0 issues.
      — evidence: `npm test` on macOS 27 (Darwin 27.2.0), in a detached
      worktree holding this close's two fixes and nothing else uncommitted:
      2525 tests, 0 failures, 10 skipped (Linux-only and sleep-only), exit 0.
      `waypost doctor`: 0 issues, 0 warnings.

## Final Summary

The limit landed in the three commits the plan proposed — 21487d5 (registry
data, walk facts, pure decisions), 4ff15dc (`clean --limit`, the slot
record's location, rename-and-detach removal) and a4f1790 (the automatic path
in `run --heavy`) — and the story then stayed open for seven weeks while the
feature ran on the owner's machine. This close is the verification pass, not
new work: every criterion was re-checked against the current tree (the pure
decisions have since moved into scripts/cleanup-limit.mjs and
scripts/cleanup-selection.mjs, and the CLI into bin/cli/) by a fresh-context
`waypost-reviewer` run, which found two real defects. Both are fixed here:

- **bin/cli/deleter.mjs** — the detached deleter was spawned with no
  `'error'` listener. A failed spawn (the node binary moved mid-run, or the
  machine out of processes or descriptors) arrives as an asynchronous event,
  and with no listener it is an uncaught exception: the process would have
  died with code 1 and replaced the wrapped command's own exit status — the
  one thing `run --heavy` promises never to touch. The event is swallowed
  now, a spawn with no pid reports none, and the entries stay in
  `waypost-removing/` for the next `waypost clean` to adopt. Reproduced
  before the fix (exit 1 instead of 7) and covered by
  tests/limit.test.mjs:1011.
- **scripts/lib.mjs** — `treesOverlap` appended a separator unconditionally,
  so the filesystem root compared as `"//"` and overlapped nothing: a live
  heavy job whose root was `/` blocked no project under it, against AC8.
  Covered by tests/cleanup.test.mjs:788-790.

Everything else was already closed by code and tests; the evidence is on each
criterion above. Verification run: `npm test` 2525 passed, 0 failed, 10
skipped, exit 0 on macOS 27, in a detached worktree carrying only these two
fixes (the shared checkout had another session's in-flight WP-18 work in
bin/cli/run.mjs, bin/cli/status.mjs, scripts/capacity.mjs and
scripts/brief.mjs, which is why the suite was not run in place);
`waypost doctor` 0 issues, 0 warnings. Live evidence beyond the tests: the
owner's own log holds 1277 automatic runs since 2026-09-19 (1200 of them
`ran`, one `failed`, logged without taking the wrapper down with it), three
real removals under the limit — a 63 MB `target`, a 3.65 GB
`target-android`, a 39 MB `.gradle` — and three gated changes of the setting
from a terminal.

Follow-ups, none of them blocking this story:

- `waypost size --project` reports `waypost-removing/` and the manual plan
  carries `picked` in `--json`, but neither has a test, and `picked` is never
  printed in the text plan, so a person reading the plan cannot see what the
  limit would take. (ADR Decision 4 says the plan "shows" it.)
- The gate's terminal branch — the preview and the `[y/N]` question — is
  never executed by a test; AC2 rests on `askYesNo` units plus five lines of
  linear code. Worth a unit with a stubbed prompt.
- `status` is asserted by a single `/deadline/` regexp; the setting line and
  the `ran`/`skipped`/`failed` outcomes it prints are untested.
- git's own timeouts are not nested inside the 60 s deadline outside
  `scanProject` (bin/cli/clean-plan.mjs, bin/cli/remove.mjs call `gitFacts`
  without the time left), so a pathological repository can overrun the
  deadline before the next item is considered. No rename happens past the
  check, so AC10 holds.
- The `interrupted` branch and SIGINT are untested, and AC9 is unverified on
  Windows, where the POSIX-signal tests skip: that belongs to
  `story-verified-on-linux-and-windows-virtual-machines`.

## Technical Notes

- The criteria as written are in two places narrower than the implementation,
  both by the lead's own answers recorded in the Implementation Plan: a holder
  record with `root: null` but a `cwd` is compared by that `cwd` (otherwise
  any heavy job outside git would switch the limit off machine-wide), and the
  one log line per heavy run is written only while a limit is set.
- AC2 is closed at unit level by the same plan's answer. It is a waiver, not
  an end-to-end proof; the follow-up above says what would close it fully.
- The two fixes made at this close are the only code written for it. Both
  were reproduced against the pre-fix code before being fixed: the deleter
  one as exit 1 in place of the child's own 7, the `treesOverlap` one as
  `false` for `("/", "/a/b")`.

## Dependencies

- `story-waypost-clean-a-classified-plan-removal-after-a-yes-the-setup-audit`
  (the plan, the removal checks, the log).

## Attachments

-

---

*Last updated: 2026-11-06*
