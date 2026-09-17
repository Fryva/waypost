---
type: story
id: "story-capacity-verified-on-linux-and-windows-virtual-machines"
epic: "WP-18"
title: "Capacity verified on Linux and Windows virtual machines"
status: in-progress
priority: p1
assignee: "Ivan Morozov"
created: 2026-09-15
updated: 2026-09-17
external_refs: {}
tags: []
code_refs: ["scripts/capacity.mjs", "bin/waypost", "scripts/lib.mjs", "scripts/presence.mjs", "tests/capacity.test.mjs", "tests/presence.test.mjs", "tests/slots.test.mjs", "CHANGELOG.md"]
specs: []
blocked_by: ["WP-18/story-the-heavy-work-rule-in-every-project-and-wayposts-own-heavy-work"]
started_at: "2026-09-17T00:18:14.608Z"
closed_at: null
plan_updated_at: "2026-09-17T00:18:14.608Z"
---

# Capacity verified on Linux and Windows virtual machines

| Field | Value |
|---|---|
| **Epic** | [WP-18](../epic.md) |
| **Status** | in-progress |
| **Priority** | p1 |
| **Assignee** | Ivan Morozov |

---

## Description

Decision 5 of the ADR
[Heavy work sized to the machine](../../../adr/heavy-work-sized-to-the-machine-waypost-capacity-a-machine-wide-slot-and-a-rule-to-check-first.md):
the per-OS probes and the shared slot are verified on real machines, not
assumed. That means the owner's Linux and Windows virtual machines, which
share this checkout, and the macOS host.

## Decomposition

- [x] Linux (`debian-13-6`, Debian 13 arm64, 4 cores, 3.8 GB), 2026-09-16:
      - `waypost capacity --json` against `/proc/meminfo`, `/proc/loadavg`
        and `nproc` — every figure matches exactly (table below);
      - the VM has no container engine, so the cgroup v2 limits were applied
        through a systemd scope entered with its own cgroup namespace, which
        is the same view a container gets: `CPUQuota=50%` → `cores 1` (probe
        `cgroup v2 cpu.max`), `CPUQuota=200% -p MemoryMax=256M` → `cores 2`
        and `available 250 MB` (probe `cgroup v2 memory.max`);
      - two sessions claim one slot — twice: once constructed, once for real
        between two unrelated Claude sessions on this machine;
      - a restart leaves no stale holder: `boot_id` is the identity, and a
        record carrying a foreign one is ignored even while its pid is alive.
- [ ] Windows:
      - the CPU sample against Task Manager;
      - `tasklist` liveness;
      - two sessions (PowerShell and Git Bash) share one slot;
      - the lowered priority is visible in Task Manager.
- [ ] Sleep and wake on each machine, the macOS host included: a live holder
      stays a holder.
      - Linux, 2026-09-16: **failed, fixed, and confirmed by a second real
        suspend on the same machine.** Details and both measurements under
        Technical Notes.
      - The macOS host and Windows are still to do, and what has to be
        watched there is not what was watched here: the evidence differs per
        platform (`boot_id` + ticks on Linux, `kern.boottime` + `lstart` on
        macOS, the epoch identity + `tasklist` on Windows). See "Still open
        after the Linux pass" — the boot identity, not the process, is what
        those two passes have to prove.
- [ ] Record the evidence. Fix what breaks, each fix with a hermetic test.

## Implementation Plan

Verification, not construction: each OS is exercised with its own tools, and
whatever breaks is fixed with a hermetic test before the next OS is started.

1. **Linux — done 2026-09-16.** Compare every figure of `waypost capacity
   --json` with `/proc/meminfo`, `/proc/loadavg` and `nproc`. Race the slot
   from two independent processes. Kill a holder, give one a foreign
   `boot_id`, give one a reused pid, and keep one genuinely alive — the four
   cases `slotLive()` decides between. Apply cgroup limits through a systemd
   scope plus a cgroup namespace, since no container engine is installed.
2. **Windows — not started.** Needs the Windows VM: the `os.cpus()` sample
   against Task Manager, `tasklist` liveness, PowerShell and Git Bash sharing
   one slot, and the lowered priority visible in Task Manager.
3. **Sleep and wake — done on Linux 2026-09-16, and the reason this story
   exists.** It cannot be driven from inside a session: the owner suspends the
   machine while a holder is live. Two suspends from the host, 368 s and
   429 s: the first found the defect, the second confirmed the fix. Neither the
   macOS host nor Windows has been through it, and the boot identity they use
   is still unverified across a sleep — the open item below.
4. Each fix lands with a hermetic test. Three so far: `--id` precedence, the
   sleeping machine, and a job's share inside a container — all under
   Technical Notes.

## Acceptance Criteria

- [ ] On each machine, `waypost capacity` figures match the OS's own tools
      within a small margin, and the numbers are recorded.
      - [x] Linux — evidence: the table under Technical Notes. Read in the
        same second as `/proc/meminfo`, `/proc/loadavg` and `nproc`, the four
        figures are not within a margin of the OS's own, they are equal.
      - [ ] Windows. - [ ] macOS host.
- [ ] On each OS, a slot held in one session refuses the second session.
      After a restart the slot is free.
      - [x] Linux — evidence: session A (`harness claude-code`) held the slot
        with `waypost run --heavy -- sleep 6`; session B (`harness codex`)
        exited 75 with "slots: 1 of 1 heavy job slot(s) already held"; a third
        reader listed A's record with its session, harness and command; the
        record was gone once A exited. Repeated unplanned the same day, which
        is the better evidence: this story's own test run waited for the slot
        while an unrelated Claude session on this machine held it for
        `./packaging/native/build-packages.sh DEB`.
      - [x] Linux, after a restart — **by a real reboot**, 2026-09-17: the VM
        was restarted with the slot held, `boot_id` went from
        `a3bb45b2-…` to `d0bb28f8-…`, and on the other side `waypost capacity`
        reported "can start 1 heavy job" with the pre-reboot record still on
        disk; the next claim pruned it. Two things the reboot taught that the
        constructed version could not — see "What a real reboot showed" under
        Technical Notes. Constructed cases still cover what a reboot cannot
        stage: a SIGKILLed holder and a reused pid (same pid, other start
        time) are ignored, a genuinely live holder still refuses.
      - [ ] Windows.
- [ ] After sleep and wake, a live holder stays a holder.
      - [x] Linux — **passes after the fix**, evidence: the VM was suspended
        from the host a second time, 429 s with a live holder (pid 110031,
        `waypost run --heavy -- sleep 5400`), and checked only once the clock
        correction had landed (`btime` +429 s, `ps -o lstart` for the holder
        moved 23:29:08 → 23:36:17 — the old evidence broken exactly as
        before). The recorded tick count and `/proc` still agreed, `waypost
        capacity` still listed the holder, and a second `run --heavy` was
        refused. Before the fix the same sleep gave the opposite result: pid
        64336 alive, record pruned as stale, "can start 1 heavy job", and a
        second heavy job let through.
      - [ ] Windows, [ ] macOS host — not attempted; worth doing after the fix.
- [ ] Fixes land with hermetic tests, and `waypost doctor` reports 0 issues.
      - [x] The container's memory share (Technical Notes, "Open") — evidence:
        `tests/capacity.test.mjs`, the four `readMemory` total cases and
        "measure: inside a small container a job is sized to the container,
        and can start".
      - [x] The sleep defect — evidence: `tests/presence.test.mjs`, "a live
        process is not gone because the machine slept: lstart moves, the tick
        count does not" (red against the old comparison, with the very
        assertion the VM produced), and `tests/slots.test.mjs`, "run --heavy:
        the slot record names a start time a sleep cannot move", which reads
        the number back from `/proc` while the wrapper still holds the slot.
      - [x] `--id` precedence (Technical Notes) — evidence:
        `tests/presence.test.mjs`, "`sessions --touch --id` outranks an
        inherited WAYPOST_SESSION_ID: one session, not two"; red with the fix
        stashed, green with it applied.
      - [x] Linux — evidence: `waypost doctor` — 0 issues, 0 warnings.

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

- One heavy job at a time on each machine, including the verification runs
  themselves.

### Linux figures, 2026-09-16

`debian-13-6`, Debian 13 (trixie), arm64, kernel 6.12.107, 4 cores, 3.8 GB,
vault on `fuse.prl_fsd` (a Parallels share, which `waypost storage` reads as
network with a 3 s lag budget).

| Figure | `waypost capacity --json` | The OS itself |
|---|---|---|
| cores | 4 | `nproc` 4 |
| busy | 1.27 | `/proc/loadavg` first field 1.27 |
| memory.available | 961548288 B | `MemAvailable` 939012 kB × 1024 |
| memory.total | 4102438912 B | `MemTotal` 4006288 kB × 1024 |

Probes named: `availableParallelism`, `loadavg`, `MemAvailable`; inside a
cgroup-limited scope they become `cgroup v2 cpu.max` and `cgroup v2
memory.max`. A heavy job runs at `nice` 10. The suite itself, once it had the
slot: 552 tests, 551 passed, 1 skipped (a macOS-only DerivedData case), 175 s
at concurrency 1 (`cores / 4`) — run with `WAYPOST_SESSION_ID` exported, the
configuration that was red before the fix below.

### Fixed here

- `--id` lost to an inherited `WAYPOST_SESSION_ID` in `bin/waypost`'s main(),
  although `scripts/lib.mjs` documents the precedence the other way round and
  `scripts/sessions.mjs` honours it. Under a harness that exports its own id —
  which this project's own protocol asks for — `waypost sessions --touch --id
  X` registered two live sessions, X and the ambient one, and the suite went
  red from the ambient environment alone. The flag now has its own reader,
  `sessionIdFlag()`, and outranks the variable.

### Sleep and wake, Linux: what actually happens

Guest-side sleep does not exist on a Parallels Linux guest: Parallels Tools
ships `/etc/systemd/sleep.conf.d/prl-nosuspend.conf`, which sets `AllowSuspend`
and its three siblings to `no`. `logind` answers `CanSuspend` with "no", and
`systemctl suspend -i` under sudo fails with "Sleep verb 'suspend' is disabled
by config". The machine sleeps only when the host suspends the VM — which is
also the honest scenario here, since that is what happens when the owner's Mac
sleeps. The resume is visible in the journal: Parallels Tools reruns its
network setup (`prl_nettool`, ~130 lines in one second).

What that does to a live holder, measured on 2026-09-16 with pid 64336 holding
the slot for `sleep 3600`:

| | before the sleep | 22 s after the resume | after the clock settled |
|---|---|---|---|
| `/proc/stat` btime | 1789601312 | 1789601312 | 1789601680 (+368 s) |
| `/proc/<pid>/stat` field 22 | 473996 | 473996 | 473996 |
| `ps -o lstart` | Wed Sep 16 21:47:31 | Wed Sep 16 21:47:31 | Wed Sep 16 21:53:39 |
| holder counted | yes | yes | **no** |

The process never restarted — its start time in clock ticks since boot is
unchanged. What moved is the machine's estimate of when it booted: the guest is
frozen without counting the frozen time (`CLOCK_BOOTTIME` equals
`CLOCK_MONOTONIC` throughout, so the kernel never saw a suspend), and then the
wall clock is corrected forward by the frozen duration. `ps -o lstart` is
btime + starttime, so every live process on the machine appears to have started
368 s later than it did. `processGone()` compares that string for
equality (`processGone()`'s fallback branch, `scripts/presence.mjs:258`), so every one of
them reads as a reused pid.

Two consequences, and the second is the wider one:

- the heavy-work slot is freed under a running job, and the next `run --heavy`
  is let through — demonstrated, not inferred;
- the same comparison decides presence, so after a sleep every live session on
  the machine looked dead to `sessions` — that part the fix closes.

Leases are a third thing, and the fix does **not** close them. A lease is live
while its holder is live *and* its record has been touched inside
`LIVE_WINDOW_MS` (150 s, plus the storage lag); the fix changes the first
condition, not the second, and both measured suspends were longer than the
window. So a lease can still be taken over after a sleep — the same as if the
session had genuinely been quiet that long, which is the design. If that should
change, the field to consult in the lease decision is `process_alive`, and it
wants its own decision rather than being smuggled in here.

The fix compares something that does not move: the start time in clock ticks
from `/proc/<pid>/stat` (field 22), which is measured from boot and survived
this test unchanged, paired with `boot_id`, which already does its job. It
landed the same day — `scripts/presence.mjs` gained `startTicks()`, every
record that names a process now carries the number beside the old string (slot
records, the slot lock's owner, presence through `harnessProcess()`), and
`processGone()` lets it decide wherever both sides have one — reading it from
the process table it was handed, so the whole verdict comes from one snapshot
and stays injectable in tests. Where either side has no tick count — a record
written before the field existed, a platform without `/proc`, a `/proc` this
process may not read (`hidepid`, a foreign pid namespace) — the old string is
still the only evidence there is, and it still moves when the machine sleeps.

The change itself is Linux-only: macOS keeps a real start timestamp per
process, and Windows never uses this path. That is a statement about
`processGone()`, and **not** a statement that the other two machines are safe
across a sleep — see the open item below, which this pass's own numbers are
enough to predict.

The same machine then produced the pass. A second host suspend, 429 s, a live
holder, and the verdict taken only after the clock correction had landed:

| | sleep #1, before the fix (368 s) | sleep #2, after the fix (429 s) |
|---|---|---|
| `btime` moved | +368 s | +429 s |
| holder's `lstart` | 21:47:31 → 21:53:39 | 23:29:08 → 23:36:17 |
| recorded ticks vs `/proc` | not recorded | 1046882 = 1046882 |
| holder still counted | no | **yes** |
| second `run --heavy` | let through | **refused** |

Releasing still works on the ordinary path: the wrapper was stopped and took
its record with it.

Three writers record the tick count — the slot record, the slot lock's owner,
and every presence beat. Tests guard the slot record and the beat directly, and
the lock through its reader (an owner whose string has moved and whose ticks
have not must keep the lock); the lock's own writer is not asserted anywhere,
because the lock exists only for the microseconds of a claim.

One procedural note for whoever repeats this: the check must run *after* the
clock has been corrected, not right after the wake. Twenty-two seconds after
the resume everything still looked perfect.

### Still open after the Linux pass: the boot identity on the other two machines

The fix above is the process half of liveness. The other half is checked first
and was not touched: `slotLive()` (`scripts/capacity.mjs:327`, first line of its body) returns false on
`sameBoot()` before it ever looks at the process — and on the two machines this
story still has open, that identity is the very quantity this pass measured
moving.

- **Windows**, and any platform without a real boot identifier, falls back to
  `epoch = round(now − os.uptime())` with a 120 s tolerance
  (`bootIdentity()`, `scripts/capacity.mjs:268`). That expression *is* Linux's `btime` — the
  number measured at +368 s and +429 s across the two suspends here. A host
  suspend longer than two minutes therefore invalidates every slot record on a
  Windows guest. (A native Windows S3 sleep is a different case:
  `GetTickCount64` is biased and includes sleep.)
- **macOS** uses `kern.boottime`, compared for exact equality. That value is
  boot time relative to the current system clock, so a clock step on wake moves
  it; one second is enough.

The consequence is the one just fixed, and worse than being ignored: a claim
*deletes* records it judges stale (`claimSlot()`, `bin/waypost:1173`), so a live holder's
record is gone for good and the second heavy job starts.

This is also an obligation the ADR hands to this story — the epoch identity is
"compared with a tolerance of two minutes, and the verification runs check it
across sleep and wake" — which the Linux pass cannot discharge, since `boot_id`
never reaches the epoch path. The macOS and Windows passes should read
`sysctl -n kern.boottime` and `now − os.uptime()` before and after a suspend,
not only re-run `capacity`.

### What a real reboot showed

Two things, 2026-09-17, with a live holder (`run --heavy -- sleep 7200`) and a
record planted on pid 1 beside it.

**A clean reboot leaves no record at all.** The holder's own record was gone
after the restart: shutdown signals the wrapper, and it releases on exit like
any other end. So the case this criterion is really about — a record outliving
the machine that wrote it — needs an unclean stop, which is why the planted
record was there.

**The boot identity is carrying this alone, and now it is measured.** The
planted record named pid 1 with the tick count `/proc` gave it before the
reboot: 0. After the reboot systemd is pid 1 again, and its tick count is 0
again. Asked directly:

    processGone() → false   (alive: pid 1 is there, 0 === 0)
    sameBoot()    → false
    slotLive()    → false   (stale, and the slot is free)

So the process half of liveness says "alive" about a process from a previous
boot, and `sameBoot()` is the only thing between that record and a phantom
holder pinning the machine's only slot. On Linux that is fine — `boot_id` is a
real identifier. It is also the sharpest argument for the open item above: on
macOS and Windows that sole guard is the drifting kind, and there is nothing
behind it.

### The suite is not reliably green on this machine, and that is the machine

Worth knowing before the next pass reads a red run as a regression. The suite
spawns the CLI per assertion with a per-command timeout — 15 s in
`tests/slots.test.mjs` and `tests/sizes.test.mjs`, 30 s in
`tests/harness.test.mjs` — which is generous on a quiet machine with a local
disk. This VM is neither: the checkout is on a Parallels share, and two Claude
sessions plus the desktop app produce bursts of 14–23 runnable processes on
4 cores while the CPU still reads 35–85% idle. Four full runs of this story's
work produced 0, 1, 6 and 1 failures, every one of them a killed child
(`status: null`, or an empty stdout that `JSON.parse` chokes on), in a
different test each time, and every single one green when re-run alone.

Note also that `capacity`'s own `busy` probe is the load average, and on this
VM the load average sits at 7–12 while the CPU is mostly idle. `can_start`
refuses for CPU on evidence the CPU does not support. That is not wrong — a
queue of runnable processes is real contention — but it is worth measuring
against `vmstat` on the other two machines before trusting the number.

### Open, from this Linux pass

- ~~`capacity`'s `total` is not capped by a cgroup memory limit~~ — fixed the
  same day. A job's share is a quarter of the machine, and inside a container
  the container is the machine: a cgroup limit (v2 `memory.max`, v1
  `memory.limit_in_bytes`) below the host's own total is now the `total` the
  share is computed from, so the 256 MB scope reports "0.2 of 0.3 GB available"
  and a job sized to it may start, where before it reported the host's 3.8 GB,
  claimed a job needed 1.0 GB of a 256 MB box, and could never start anything.
  The host's total still decides whether a v1 limit is the "unlimited"
  sentinel, and a limit above it is not a box. Evidence:
  `tests/capacity.test.mjs` — four cases pinning the total (v2, v1, a limit
  that bounds the box while the host's MemAvailable binds, and a limit above
  the host's total), plus "measure: inside a small container a job is sized to
  the container, and can start"; all four are red without the change. Confirmed
  on the machine in the same systemd scope the failure was measured in.
- The numbers meet a small machine awkwardly. 1.0 GB per job against the
  0.9 GB this VM has free under the owner's ordinary desktop means waypost's
  own suite cannot start here at all without closing something first. That is
  the rule working, not failing — but it belongs in Decision 1 of the ADR as a
  known consequence rather than as a surprise on a 4 GB machine.

## Dependencies

- `story-the-heavy-work-rule-in-every-project-and-wayposts-own-heavy-work`.

## Attachments

-

---

*Last updated: 2026-09-17*
