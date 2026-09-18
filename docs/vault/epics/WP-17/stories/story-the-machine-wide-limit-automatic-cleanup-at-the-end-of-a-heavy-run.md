---
type: story
id: "story-the-machine-wide-limit-automatic-cleanup-at-the-end-of-a-heavy-run"
epic: "WP-17"
title: "The machine-wide limit: automatic cleanup at the end of a heavy run"
status: in-progress
priority: p2
assignee: "Ivan Morozov"
created: 2026-09-18
updated: 2026-09-18
external_refs: {}
tags: []
code_refs: ["bin/waypost", "scripts/cleanup.mjs", "scripts/sizes.mjs", "scripts/capacity.mjs", "scripts/presence.mjs", "scripts/agents.mjs", "scripts/lib.mjs", "scripts/brief.mjs", "scripts/toolchains.mjs", "toolchains/system.json", "toolchains/terraform.json", "docs/toolchains.md", "prompts/cleanup.md", "tests/limit.test.mjs (planned)", "tests/cleanup.test.mjs", "tests/sizes.test.mjs", "tests/toolchains.test.mjs", "tests/slots.test.mjs", "CHANGELOG.md"]
specs: []
blocked_by: ["WP-17/story-waypost-clean-a-classified-plan-removal-after-a-yes-the-setup-audit"]
started_at: "2026-09-18T21:10:42.411Z"
closed_at: null
plan_updated_at: "2026-09-18T21:10:42.411Z"
---

# The machine-wide limit: automatic cleanup at the end of a heavy run

| Field | Value |
|---|---|
| **Epic** | [WP-17](../epic.md) |
| **Status** | in-progress |
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
