---
type: story
id: "story-the-heavy-work-slot-is-machine-wide-on-windows-not-one-per-packaged-app"
epic: "WP-18"
title: "The heavy-work slot is machine-wide on Windows, not one per packaged app"
status: in-progress
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-13
updated: 2026-10-14
external_refs: {}
tags: []
code_refs: []
specs: []
started_at: "2026-10-14T02:48:32.505Z"
closed_at: null
plan_updated_at: "2026-10-14T02:48:32.505Z"
---

# The heavy-work slot is machine-wide on Windows, not one per packaged app

| Field | Value |
|---|---|
| **Epic** | [WP-18](../epic.md) |
| **Status** | in-progress |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

On Windows, Claude Code and Codex run as MSIX-packaged apps, and AppData is
virtualized per package: from a Claude desktop session
`%LOCALAPPDATA%\Waypost` resolves to
`…\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Local\Waypost`. The heavy-work
slot directory `slots.<host>` lives there, so each packaged harness and the
terminal likely keep their own slot — two heavy jobs from two harnesses would
not see each other, the case the slot exists for.

## Decomposition

- [ ] Measure: a slot claimed from the Claude app, the Codex app and a terminal
      — one directory or three (`realpathSync.native`).
- [ ] `machineStateDir()` → `~/.local/state/waypost` from `os.homedir()` on
      every OS (`%USERPROFILE%\.local\state\waypost` on Windows), as the
      global-rules ADR decides; refuse AppData targets.
- [ ] Migration from **every** old root — the real `%LOCALAPPDATA%\Waypost`,
      each `%LOCALAPPDATA%\Packages\*\LocalCache\Local\Waypost`,
      `$XDG_STATE_HOME/waypost`, `~/Library/Application Support/Waypost` —
      per file, no global "done" marker; old-root lock then new-root lock;
      older duplicates archived; conflicting copies kept under
      `migrated-conflicts/` (run budget: live runs refused until reset;
      cleanup limit: most restrictive wins); a budget anywhere but the new root
      refuses live runs; slots read from every old root for one release.
- [ ] Test isolation: once `machineStateDir()` ignores the environment, every
      test child sets `USERPROFILE` (`tests/env.mjs` `ambientEnv()`,
      `heavyEnv`, `tests/harness.test.mjs`, `tests/capacity.test.mjs`), with
      a guard test that no run touches the real home.
- [ ] Measure whether the Codex app's sandbox can write
      `%USERPROFILE%\.local\state` at all, and whether a packaged app can list
      `%LOCALAPPDATA%\Packages` (if not, package-store budgets are invisible
      to it); record either as a limitation. Required before close.
- [ ] Re-check what the 2026-09-17 Windows pass of
      `story-capacity-verified-on-linux-and-windows-virtual-machines` measured,
      if it ran inside one package.
- [ ] Then re-stage the second real Windows restart from the owner's terminal.

## Implementation Plan

Measured first (2026-10-13, `FROSTBEBE`, from inside the Claude desktop
package): a file created and renamed under `%USERPROFILE%\.local\state\`
resolves to its real path (`realpathSync.native`) and leaves no copy in
`…\Packages\Claude_pzs8sxrjxfjjc\LocalCache`; the old
`%LOCALAPPDATA%\Waypost` resolves into that package store.

1. **`scripts/lib.mjs`** — `machineStateDir({ home = homedir() })` returns
   `<home>/.local/state/waypost` on every OS. `legacyStateDirs()` lists every
   old root that exists (the macOS `Library/Application Support/Waypost`; on
   win32 the real `%LOCALAPPDATA%\Waypost` and every
   `Packages\*\LocalCache\Local\Waypost`; `$XDG_STATE_HOME/waypost` on Linux);
   `legacyDirsToMove()` keeps only those under this process's own home, or all
   when that home is the account's (`os.userInfo()`) — a command run with a
   fake HOME/USERPROFILE never carries the real state into it.
   `ensureMachineStateDir()` creates the root and refuses the profile's
   AppData and any package store, before and after creation.
   `readCleanupSetting()`: a limit this version wrote (`written_by`) is the
   owner's latest choice and wins; otherwise the stricter of the new and any
   old copy.
2. **`scripts/state-migrate.mjs`** (new; revised after two code critic
   passes) — per old root, under its lock and then the new root's:
   - the run budget is **copied**, and its old copy overwritten in place
     (open the existing file, no truncation, padded to its old length) with a
     version-0 tombstone an older Waypost rejects, so an old process refuses
     instead of reading "no budget"; an empty or torn old copy counts as moved;
   - other files reach the new root by copy to a temp file then hard link
     (an exclusive copy where the filesystem has no hard links), so nothing
     a newer writer put there is ever replaced; then the old copy goes;
   - identical copies collapse; a file that cannot be read is never deleted;
   - different budgets: a conflict marker is written first, every copy is
     archived under `migrated-conflicts/` and named in the marker (merged
     across conflicts), live runs refused until the owner sets the budget
     again; different cleanup limits: one written by this version stays,
     otherwise the more restrictive one is kept; the
     machine profile: the newer `generated_at`; anything else: the new
     root's copy;
   - slot records, `.lock`, temp files never move; a failure in one root
     never stops the others, and is retried on the next run.
3. **`bin/waypost`** — the migration runs once per process before every
   command but help/version, only when a movable legacy root has pending
   entries (4–13 ms on `FROSTBEBE`); `WAYPOST_NO_STATE_MIGRATION=1` (set by the
   test suite) skips it, which never opens anything since the budget refuses
   on its own. Slot readers merge the new root's slot directory with every
   legacy one's for this release (`readHolders` takes `dirs`, one record
   counted once); `capacity --release` finds a record in either; new claims
   and the lock go to the new root through `ensureMachineStateDir()`.
4. **`scripts/run-budget.mjs`** — fail closed, read fresh on every call: any
   budget still in an old root (unreadable counts as present) refuses
   (`run-budget-migration-pending`), and so does a conflict marker
   (`run-budget-conflict`); the marker is checked before and after reading
   the file, so a reader racing either the move or `team budget set` never
   reads "no budget". `team budget set` carries the kept copies' admitted
   entries over (a copy that is gone or not JSON is named in the event; an
   I/O error refuses with the way out) and `clear` logs and removes the
   marker; both fail with `run-budget-still-blocked` while live runs stay
   refused. Advice names the account's own state root, never this
   process's.
5. **Tests** — `tests/state-migrate.test.mjs`; every spawning test file
   imports `tests/env.mjs`, which sets `WAYPOST_NO_STATE_MIGRATION=1` for its
   children (a guard test enforces the import); unit tests for
   `machineStateDir` and `legacyStateDirs` updated.
6. **Docs** — `CHANGELOG.md`.

The Codex-sandbox measurement and the 2026-09-17 re-check need the owner's
Codex app and terminal; the restart re-stage follows this story. Tombstones
and legacy slot reads are for one release: their removal is a follow-up.

## Acceptance Criteria

- [ ] A slot held from the Claude app refuses a heavy job from the Codex app
      and from a terminal, and the other way round, on `FROSTBEBE`.
- [ ] No Waypost machine state resolves under AppData.
- [ ] After the upgrade the run budget, the cleanup limit and a live slot are
      all still in force; a budget left only in the old root refuses live runs.
- [ ] Hermetic tests for the move from two package-store fixtures, a
      conflicting budget, the fallback and the AppData refusal.

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

- 2026-10-13: a restart test staged from a Claude desktop session wrote its
  planted record into the Claude package store; a terminal would not have seen
  it. The holder (`run --heavy`, 2 h) also expired before the restart. The
  test must be staged from the owner's terminal, after this story.
- 2026-10-13, live on `FROSTBEBE`, with this change in the working tree:
  - a slot claimed from inside the Claude desktop package wrote its record to
    `C:\Users\frost\.local\state\waypost\slots.FROSTBEBE\` — its
    `realpathSync.native` is the same path, and no copy is in the package store;
  - the other way round: the owner held a slot from an elevated PowerShell
    (`run --heavy -- node -e "setTimeout(…,1200000)"`, holder
    `9952-1791933551329-soa6rf`); from inside the Claude package
    `waypost capacity` reported "slots: 1 of 1 heavy job slot(s) already held"
    with that holder listed, and `run --heavy` was refused with exit 75;
  - not yet measured: the Codex app (its sandbox and its own package).
- Full suite on `FROSTBEBE` with this change: 1721 tests, 1529 pass, 123 fail,
  69 skipped. None of the failures is this change: the seven cleanup/limit tests
  (AC8, AC12, AC 3) and the team/native tests (git "unable to access 'NUL'")
  fail at HEAD too (checked per file), and the capacity speed test passes alone.
- Known limit (third code critic pass, S5): inside a packaged app (MSIX)
  the old `%LOCALAPPDATA%\Waypost` shows that app's own copy first, so a
  budget an older version set from a terminal can stay hidden from it; one
  waypost command from a terminal finishes the move. In the CHANGELOG.
- Deferred to a follow-up (third code critic pass): removing tombstones and
  legacy slot reads one release later; the old-root `.lock` taken from inside
  a package is redirected and does not exclude writers in other packages
  (only the conflict path catches a lost update); `copyFileSync` carries the
  READONLY attribute on win32; a permanently failing move is retried by every
  command; `WAYPOST_NO_STATE_MIGRATION` is undocumented; the disk-hygiene ADR
  text still names the old roots; whether an AppContainer can list
  `%LOCALAPPDATA%\Packages`; a test-wide guard that no child touches the real
  home (today: every spawning test file imports `tests/env.mjs`).
- Departure from the ADR's wording (fourth code critic pass, S-4): Decision 1
  says "for the cleanup limit, the most restrictive value wins". Applied on
  every read, that kept the owner from loosening or switching off a limit
  while an older copy survived, and `clean --limit` still printed success.
  Now a record this version writes (`written_by: "waypost-state-v2"`) is the
  owner's latest explicit choice and wins; "most restrictive" decides only
  between copies older versions left. Accepted by the owner on 2026-10-14 as
  an amendment to the ADR.
- 2026-10-14: `tests/run-budget.test.mjs` "concurrent admission" failed 4 of 5 runs on `FROSTBEBE` with EPERM: on Windows a rename over the budget fails while an unlocked reader has it open. Not caused by this change: that test passes an explicit path, so the legacy scan never runs, and HEAD fails it too (2 of 6 runs, fifth code critic pass). Fixed in `writeBudget` (`renameOver`: EPERM/EACCES/EBUSY retried on win32 with a bounded backoff, anything else still throws): 10 of 10 runs pass.
- 2026-10-14, the owner: the macOS host had no run budget and no cleanup limit before the move there on 2026-10-13 (run by an earlier revision of this change through the shared checkout) — nothing was lost.
- 2026-10-14, the Codex app on `FROSTBEBE` (Store `OpenAI.Codex` 26.1007.2314.0,
  `CODEX_VERSION` 0.162.0-alpha.17.2, default permission profile `:workspace`),
  measured with a probe run from inside it while the owner held a slot from a
  terminal (holder `11788-1791943111825-7bqnln`):
  - **reads** `~/.local/state/waypost`: it listed the terminal's holder record —
    the new root is one place for Codex too, no package copy;
  - **cannot write** there: `mkdir ~/.local/state/waypost-probe` → EPERM. So
    `run --heavy` from inside Codex cannot claim a slot under the default
    sandbox;
  - **cannot list** `%LOCALAPPDATA%\Packages` → EPERM, so `legacyStateDirs()`
    sees no package store from inside Codex (today read as "none");
  - `%LOCALAPPDATA%\Waypost` → ENOENT from inside Codex (Claude's view
    resolves it into the Claude package store);
  - the checkout is **not reachable**, neither `Y:` nor `\\Mac\frost\…`
    (`CODEX_SANDBOX_NETWORK_DISABLED=1`), so Waypost cannot run from the
    Codex app at all under the default profile;
  - environment markers present: `CODEX_THREAD_ID`, `CODEX_SESSION_ID`,
    `CODEX_SHELL`, `CODEX_CI`, `CODEX_PERMISSION_PROFILE`,
    `CODEX_SANDBOX_NETWORK_DISABLED`, `CODEX_WINDOWS_SANDBOX_PACKAGE_FAMILY`
    (`OpenAI.Codex_2p2nqsd0c76g0`) — usable by the owner gate on Windows.
  - Consequence for this story: AC1's Codex direction holds for reading (a
    terminal holder is visible from Codex), not for claiming. Follow-ups: (a)
    when the state root is not writable, `run --heavy` says so — the sandbox
    and the `writable_roots` entry it needs — instead of a raw EPERM; (b) an
    unlistable `Packages` should not read as "no legacy roots" for the budget
    check; (c) the owner decides whether Codex gets `~/.local/state/waypost`
    and the checkout as writable roots.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-14*
