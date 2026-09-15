---
type: story
id: "story-waypost-run-heavy-a-machine-wide-slot-for-heavy-work"
epic: "WP-18"
title: "waypost run --heavy: a machine-wide slot for heavy work"
status: done
priority: p1
assignee: "Ivan Morozov"
created: 2026-09-15
updated: 2026-09-15
external_refs: {}
tags: []
code_refs: ["bin/waypost", "scripts/capacity.mjs", "scripts/lib.mjs", "scripts/presence.mjs", "tests/capacity.test.mjs", "tests/slots.test.mjs", "CHANGELOG.md"]
specs: []
blocked_by: ["WP-18/story-waypost-capacity-the-machines-real-free-resources-measured-by-each-os"]
started_at: "2026-09-15T13:17:33.403Z"
closed_at: "2026-09-15T13:58:47.188Z"
plan_updated_at: "2026-09-15T13:17:33.403Z"
---

# waypost run --heavy: a machine-wide slot for heavy work

| Field | Value |
|---|---|
| **Epic** | [WP-18](../epic.md) |
| **Status** | done |
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

- [x] The slot table in the machine state directory, keyed by host. Each
      record holds the pid, process start time, boot identity, host, session,
      harness, command and start.
- [x] The lock: `mkdir` of a lock directory that holds its owner's pid and
      start time. It is broken only when that owner is dead, or after five
      minutes.
- [x] Liveness:
      - **boot identity:** Linux `boot_id`, macOS `kern.boottime`, and
        otherwise now − uptime within two minutes;
      - **POSIX:** the process table and start time, as `presence.mjs` does;
      - **Windows:** signal-0 plus the image name `tasklist` reports (no
        shell, a few seconds' timeout), and a 24-hour cap.
- [x] `waypost run --heavy [--wait <duration>] -- <argv…>`:
      - claims under the lock, against `can_start` with the live holders;
      - refuses at once, with a distinct exit code, the reason and the retry
        command;
      - `--wait` retries until the deadline, repeating the reason;
      - runs without a shell, with stdio inherited, after lowering
        Waypost's own priority (nice +10, below-normal on Windows);
      - forwards SIGINT and SIGTERM, releases the slot on exit, and returns
        the command's exit code.
- [x] `waypost capacity` lists the holders.
      `waypost capacity --release <id> [--force]` is the recovery path.
- [x] Tests, including the stress test.

## Implementation Plan

Written by the lead on 2026-09-15, from the ADR's Decision 2 and the code in
`scripts/presence.mjs` (`processTable`, `processGone`, `hostSlug`).

1. **`scripts/presence.mjs`:** `export` `hostSlug`. That is one word and no
   behaviour change. The paused WP-17 stash makes the same change, so the
   conflict there will be trivial.
2. **Record shape:** `{ id, host, proc: { pid, started, comm }, boot,
   session, harness, command, started_at }`.
   - `host` and `proc` have exactly the shape `processGone(rec, table)`
     reads, so on POSIX it decides liveness unchanged: gone, alive, or
     `null` for "no table".
   - `proc` is the `waypost run` process itself. It lives as long as the
     command it waits for.
3. **`scripts/capacity.mjs`** (read and compute only):
   - `bootIdentity(probes)`:
     - Linux: `/proc/sys/kernel/random/boot_id`;
     - macOS: the `sec` of `sysctl -n kern.boottime`;
     - otherwise: round(now − `os.uptime()`), with the kind recorded so that
       comparison uses a 120-second tolerance.
   - `slotLive(rec, { table, platform, bootNow, tasklist, now, kill })`. A
     record is stale when:
     - it belongs to another boot;
     - POSIX: `processGone` is true. If it is `null`, a signal-0 probe
       decides;
     - win32: signal-0 finds nothing (ESRCH); or `tasklist /FI "PID eq N"
       /FO CSV /NH` (no shell, 3-second timeout) reports another image name
       than `proc.comm`; or the record is older than 24 hours. When
       `tasklist` fails, signal-0 and the 24-hour cap decide.
   - `readHolders({ dir, ...probes })` reads the records and returns
     `{ live, stale }`. It writes nothing.
   - `measure({ holders })` counts the live ones.
   - `WAYPOST_CAPACITY_PROBE` (JSON: cores, busy, available, total) replaces
     the machine probes when set. This is for hermetic CLI tests only, and
     the docs say so.
4. **`bin/waypost`** (all writes live here, as the ADR says). The slot
   directory is `<machineStateDir()>/slots.<hostSlug>/`.
   - **Lock:** `mkdirSync(<dir>/.lock)`, holding `owner.json` with
     `{ pid, started }`. On `EEXIST`, the lock is broken only when its owner
     is gone by the same liveness check, or when its mtime is more than five
     minutes old. The claim retries a few times within about 2 seconds, then
     reports busy.
   - **`waypost run --heavy [--wait <30s|10m>] -- <argv…>`:**
     - Take the lock, remove the stale records, and call
       `measure({ holders })`.
     - If `can_start > 0`: write our own record, release the lock and run.
     - Otherwise: release the lock and print the reason and the retry
       command. Without `--wait`, or past the deadline, exit **75**
       (EX_TEMPFAIL). With `--wait`, retry every 5 seconds, printing the
       reason every 30.
   - **Running:**
     - `os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL)` on the
       waypost process itself before spawning: nice +10 on POSIX,
       below-normal on Windows, and the command's children inherit it.
     - `spawn(argv[0], argv.slice(1), { stdio: "inherit", shell: false })`.
       A `.cmd` or `.bat` target on Windows is the exception (see Technical
       Notes).
     - Pass SIGINT and SIGTERM on to the child.
     - On exit, remove our own record and exit with the child's code, or
       128 + the signal number.
   - **`waypost capacity`:** lists the live holders (session, harness,
     command, since).
   - **`waypost capacity --release <id> [--force]`:** runs `slotLive` first.
     It refuses a live-looking record unless `--force` is given, and prints
     what it released.
5. **`tests/slots.test.mjs`** (new):
   - liveness: another boot; a reused pid with another start time; on
     injected win32, an image-name mismatch, a failing `tasklist`, and the
     24-hour cap;
   - the lock: a dead owner is broken, a live owner is kept, a lock older
     than five minutes is broken;
   - refusal: exit 75 within a second, with the reason and the retry command;
   - `--wait 2s` retries until the deadline;
   - the exit code passes through, including a crash (exit 3) and a signal;
   - the priority read back in the child (`os.getPriority()` → 10 on POSIX);
   - the `--release` guard;
   - **the stress test:** 5 parallel `waypost run --heavy -- node -e
     "setTimeout(()=>{},1500)"`, with `WAYPOST_HEAVY_MAX=1`, an idle
     `WAYPOST_CAPACITY_PROBE`, and `HOME`/`XDG_STATE_HOME` in a temporary
     directory. Exactly one runs; four exit 75.
6. **Test runs:** the new file alone while working; the full suite once at
   the end with `--test-concurrency=2`, after checking the load.

Technical notes for this plan:
- Windows starts a batch file (`npm.cmd`, `gradlew.bat`) only through
  `cmd.exe`. For such a target `run --heavy` uses Node's `shell: true`. The
  argv is the caller's own command, not data from a registry. Every other
  target runs without a shell. The verification story checks it.
- If the `waypost run` process is killed outright (SIGKILL), its record is
  released as stale, but the child may keep running untracked. Its load still
  shows in rule (b).

## Acceptance Criteria

- [x] Several claims start at once against a cap of one, each with a trivial
      command, in a temporary state directory. Exactly one holds the slot;
      the rest are refused with the reason.
      — evidence: `tests/slots.test.mjs:532`
- [x] Records that are not holders:
      - one from an earlier boot;
      - one whose pid now belongs to a process with another start time;
      - on injected Windows, one whose pid is alive under another image
        name.

      A Windows record older than 24 hours is released.
      — evidence: `tests/slots.test.mjs:141`, `:147`, `:152`, `:177`,
      `:182`, `:188`
- [x] A lock whose owner is dead is broken at once. A live owner's lock is
      kept for up to five minutes.
      — evidence: `tests/slots.test.mjs:346`, `:359`, `:383`, and `:406`
      (an owner from another boot)
- [x] A refused `run --heavy` exits with its distinct code within a second
      and prints why and the retry command. `--wait 2s` retries, then gives
      up at the deadline. Nothing starts without a slot.
      — evidence: `tests/slots.test.mjs:242`, `:256`, `:267`, `:359`
      (nothing starts)
- [x] The command:
      - runs at lowered priority, with its niceness read back on POSIX;
      - inherits stdio and receives interrupts;
      - releases the slot and passes on its exit code, including when it
        crashes.
      — evidence: `tests/slots.test.mjs:300` (priority 10), `:309`
      (interrupt), `:282`, `:292` (exit codes), `:333` (release)
- [x] `--release` refuses a live-looking record without `--force`, and prints
      what it released.
      — evidence: `tests/slots.test.mjs:438`, `:457`, `:469`, `:485`
- [x] `npm test` is green at capped concurrency, and `waypost doctor` reports
      0 issues.
      — evidence: `node --test --test-concurrency=2 tests/*.test.mjs` passed
      497/497 in 136 s, started at load 3.3. `waypost doctor`: 0 issues,
      0 warnings.

## Final Summary

Landed in e0d9c27.

**What changed.**
- `bin/waypost`:
  - `run --heavy [--wait <Ns|Nm>] -- <argv…>`;
  - the lock and the slot records;
  - `capacity`, which lists the holders, and
    `capacity --release <id> [--force]`.

  Every write to the slot table lives here.
- `scripts/capacity.mjs`: `bootIdentity`, `sameBoot`, `slotLive`,
  `readHolders` (read only), `measure({ holders })`, and
  `WAYPOST_CAPACITY_PROBE` for hermetic tests.
- `scripts/presence.mjs`: `hostSlug` is exported.
- `tests/slots.test.mjs`: 41 tests.
- `CHANGELOG.md`.

**Why.** ADR Decision 2: sessions and harnesses that know nothing of each
other must queue behind one limit per machine. The freeze of 2026-09-14
happened with only a rule in place.

**Tests executed.**
- `tests/slots.test.mjs`: 41/41.
- The full suite, once, at `--test-concurrency=2`: 497/497 in 136 s,
  started at load 3.3.
- `node --check`.
- `waypost doctor`: 0 issues.
- Manual checks with a temporary `HOME`:
  - the priority reads back 10;
  - a second claim against a cap of one exits 75 with the reason and the
    retry line;
  - `waypost capacity` lists the holder.

`~/Library/Application Support/Waypost` never existed during the work.

**Review.**
- The stress test caught a race in the first lock: a claimant broke a lock
  whose owner had not yet written `owner.json`. Now only a confirmed-dead
  owner, or the five-minute cap, may break a lock.
- Lead review of the diff found two defects, both now fixed with tests:
  - `capacity --release <id>` joined an unchecked id into a path, so it
    could delete any `.json` next to the slot directory;
  - the retry line was not quoted.
- `waypost-reviewer` found the diff fit to commit. Its should-fix items are
  done:
  - the lock owner carries the boot identity;
  - a test proves an interrupt reaches the command;
  - stderr says so whenever `WAYPOST_CAPACITY_PROBE` is honoured.

  The probe stays a full replacement. A conservative clamp would make the
  cross-process stress test depend on the host's load.

**Risks and follow-ups.**
- Windows is covered by injected tests only: `tasklist`, signal 0, and
  `.cmd`/`.bat` targets run through `cmd.exe`. The verification story runs
  it for real.
- If the `waypost run` process is killed outright, its command may keep
  running untracked. Its load still counts.
- On Windows, a retry line with an argument that ends in backslashes may not
  paste back exactly. This is cosmetic.
- The routing-block line, and Waypost's own test suite under the limit, are
  the next story.

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
