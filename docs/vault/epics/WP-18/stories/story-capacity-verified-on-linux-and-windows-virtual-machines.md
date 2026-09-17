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
plan_updated_at: "2026-09-17T13:19:05.603Z"
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
- [x] Windows (`FROSTBEBE`, Windows 11 Pro 26200, 4 cores, 6.0 GB),
      2026-09-17:
      - the CPU sample read against Windows' own processor counters — the
        ones Task Manager draws — under a load of 0, 1, 2 and 3 spinning
        cores, rather than against whatever the machine happened to be doing;
      - `tasklist` liveness: twelve cases against the real machine, every
        probe the real one;
      - two sessions share one slot: PowerShell held it, Git Bash exited 75;
      - the lowered priority, read back through the Win32 priority class
        Task Manager displays, for the wrapper AND the command it started.
      - Capacity and the slot needed no fix here. What this pass found
        instead was a family of path checks that no path on Windows can
        satisfy — see "What the Windows pass actually broke on".
- [ ] Sleep and wake on each machine, the macOS host included: a live holder
      stays a holder.
      - Linux, 2026-09-16: **failed, fixed, and confirmed by a second real
        suspend on the same machine.** Details and both measurements under
        Technical Notes.
      - Windows, 2026-09-17: **failed, fixed, and confirmed by a second
        real suspend on the same machine** — the same shape the Linux pass
        took. First suspend, 534 s, before the fix: the boot epoch moved
        +535 s, the record went stale, and a second heavy job was let through
        and deleted the first one's record while it was still running.
        Second suspend, 1603 s, after it: the epoch moved +1603 s and the
        authority did not move at all, so the holder stayed a holder and the
        second job was refused. Both under Technical Notes.
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
      - [x] Windows — evidence: "Windows figures, 2026-09-17" under
        Technical Notes. `total` is exact against `TotalVisibleMemorySize`;
        `available` sits a steady −15 MB from WMI's own figure, which is the
        measuring process's own footprint; and `busy` tracks
        `% Processor Time` within 1–5 points under a held load.
      - [ ] macOS host.
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
      - [x] Windows, the refusal — evidence: PowerShell held the slot
        (`run --heavy -- node -e "setTimeout(…,45000)"`, session
        `ps-holder-1`, harness `powershell`); Git Bash was refused with
        "slots: 1 of 1 heavy job slot(s) already held" and **exit 75**; a
        third reader listed the holder with its session, harness and command;
        the record was gone from `%LOCALAPPDATA%\Waypost\slots.FROSTBEBE\`
        the moment the holder exited.
      - [ ] Windows, after a restart — **by a real restart, 2026-09-17, and
        not yet a pass.** A running holder's record survived the restart
        (unlike Linux, a clean Windows restart does not let the wrapper
        release it) and was pruned correctly, its pid being dead. A planted
        previous-boot record naming a process that exists again (pid 4) was
        judged stale once the authority answered — but for the first
        minutes after boot that read takes 4–9 s against a 2 s timeout, so
        it came back unconfirmable and pinned the slot until the machine
        calmed down. The one written without an authority field needed
        `--release --force`, as designed. Details, and the change they argue
        for, under Technical Notes: "A real Windows restart".
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
      - [x] Windows — **failed, then passed after the fix**, both by real
        host suspends on 2026-09-17. Before: 534 s of suspend, a live holder
        (pid 5728), `waypost capacity` reporting "can start 1 heavy job"
        while that job ran, and the second `run --heavy` starting AND
        deleting the live holder's record. After: 1603 s of suspend, a live
        holder (pid 2328), the epoch moved +1603 s while the authority moved
        0, `capacity` still "can start 0 — slots: 1 of 1 already held" with
        the holder listed, the second `run --heavy` refused with exit 75, and
        the record still on disk. Evidence: both tables under Technical
        Notes.
      - [ ] macOS host — not attempted.
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
      - [x] Windows — evidence: `waypost doctor` on this machine, 0 issues
        and 0 warnings, where before the fix it carried a standing `vault-git`
        warning it was wrong about.
      - [x] The path family (`pathUnder`) — evidence: ten cases in
        `tests/predicates.test.mjs` ("pathUnder: inside, the same path, and
        outside", "…Windows spells those same paths with a backslash",
        "…case folds where the filesystem folds it", "isInsideVault: the
        guard `story plan|close --write` writes behind"), two in
        `tests/scripts.test.mjs` for doctor's pair, two in
        `tests/commits.test.mjs` for the lease guard and the merge driver
        (board and folder index), and two more in `tests/scripts.test.mjs`
        for the driver's own spelling. Every one of them red with the fix
        reverted and the tests kept — checked, not assumed.

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

### Windows figures, 2026-09-17

`FROSTBEBE`, Windows 11 Pro 26200, x64, 4 cores, 6.0 GB, Node 24.19.0, booted
09:51:19 local (UTC−3). The checkout is the same one the Mac host and the
Linux VM share, reached as `Y:` — a Parallels share that `waypost storage`
reads as a UNC network path with a 3 s lag budget.

**Memory.** `os.freemem()` against `Win32_OperatingSystem.FreePhysicalMemory`,
read immediately before and after each node call and interpolated to the
instant node took its own reading (five rounds):

| round | OS at node's instant | node `os.freemem()` | difference |
|---|---|---|---|
| 1 | 1258.3 MB | 1242.1 MB | −16.2 MB |
| 2 | 1262.4 MB | 1248.9 MB | −13.4 MB |
| 3 | 1259.9 MB | 1244.0 MB | −15.9 MB |
| 4 | 1257.2 MB | 1240.9 MB | −16.4 MB |
| 5 | 1257.2 MB | 1242.6 MB | −14.7 MB |

A steady −15 MB, which is the measuring node process's own footprint: the
figure is read from inside the process whose existence lowers it. `total`
is exact — 6435831808 B both sides (`TotalVisibleMemorySize` 6284992 kB ×
1024).

**CPU.** Not "compared to whatever the machine happened to be doing" but
against a known load: N spinning cores, then `capacity --json` read at the
same moment as `\Processor(_Total)\% Processor Time` and `\Processor
Information(_Total)\% Processor Utility` (the counter Task Manager draws).

| spinners | capacity busy | capacity % | `% Processor Time` | `% Processor Utility` |
|---|---|---|---|---|
| 0 | 0.54 cores | 13.6 | 14.7 | 14.7 |
| 1 | 1.26 cores | 31.5 | 32.0 | 33.5 |
| 2 | 2.27 cores | 56.7 | 58.5 | 58.6 |
| 3 | 3.06 cores | 76.6 | 90.3 | 90.3 |

The 3-spinner row is the sample catching a load still ramping, not a
systematic under-read: held steady at 3 spinners and read five times, the
250 ms `os.cpus()` sample tracks the counter within 1–5 points —
92.1/93.9/100/88.6/100 against 93.4/94.9/99.2/94.1/100 — and `can_start`
refused all five times with "cpu: 0.0–0.5 idle core(s) available, a heavy job
needs 1.0". Unlike Linux's load average, this probe is a true busy share: it
refuses on the evidence the CPU itself shows.

**Boot identity.** `bootIdentity()` returns `{kind: "epoch", value: 1789649479}`
— the same second as `Win32_OperatingSystem.LastBootUpTime` converted to Unix
time (1789649479, 09:51:19 local). Eight reads 400 ms apart spread by 1 s,
which is `os.uptime()`'s integer truncation, against a tolerance of 120.

**Slot liveness**, twelve cases against the real machine — real `tasklist`,
real signal-0, real boot identity, only the record constructed:

    ok  live node holder, same boot, under 24h            true
    ok  live pid, other image (reused pid)                false
    ok  live pid, image matches its own                   true
    ok  foreign boot epoch (+500s)                        false
    ok  epoch within the 120s tolerance (+119)            true
    ok  epoch just outside it (+121)                      false
    ok  a Linux boot_id on a Windows machine              false
    ok  live holder, record 25h old                       false
    ok  live holder, record 23h old                       true
    ok  tasklist fails, pid alive                         true
    ok  holder killed: signal-0 and tasklist agree        false
    ok  killed holder, tasklist unavailable               false

One thing the fakes could not have told us: on a localized Windows
`tasklist /FI "PID eq <dead pid>" /FO CSV /NH` exits **0** and prints a
localized "no tasks" sentence (here Russian), not an empty output. It does not
start with a quote, so the parse returns null and the caller falls back to
signal-0 and the 24-hour cap — the documented fallback, reached on this
machine for a reason the English-locale reading of that code would not
predict. The consequence is worth stating plainly: on Windows `tasklist` can
only ever *reject* a holder by naming a different image; it never confirms
one is gone.

**Two sessions, one slot.** PowerShell (`WAYPOST_SESSION_ID=ps-holder-1`,
harness `powershell`) held it with `run --heavy -- node -e "setTimeout(…,45000)"`.
Git Bash (harness `claude-code`) was refused: `slots: 1 of 1 heavy job slot(s)
already held`, exit **75**, with the retry line quoted for cmd. A third reader
listed the holder with its session, harness and command. The record —
`{"proc":{"pid":5420,"started":null,"ticks":null,"comm":"node.exe"},
"boot":{"kind":"epoch","value":1789649479}}` — was gone from
`%LOCALAPPDATA%\Waypost\slots.FROSTBEBE\` the moment the holder exited.

**Lowered priority.** Both the wrapper and the command it starts read
`BelowNormal` / base priority 6 through `Get-Process` — the value Task
Manager shows in its Details tab — so the Windows half of "Node maps
PRIORITY_BELOW_NORMAL to below-normal" is measured, not assumed. The
inheritance is real: the child was never set, it was started by a wrapper that
already was. `tests/slots.test.mjs` skips its priority assertion on win32;
this is the machine evidence that skip was waiting for.

**A previous boot's record.** With the slot free, a record naming a genuinely
live process (explorer.exe, its own image name, so the process half says
"alive") and an epoch 600 s before this boot's: `slotLive()` false,
`readHolders()` live=0 stale=1, `waypost capacity` "can start 1 heavy job",
and the next `run --heavy` pruned it and ran. The constructed case only —
this machine has not been restarted with a record on disk yet.

### What the Windows pass actually broke on, and it was not capacity

The capacity and slot machinery came through this pass without a single fix.
What the pass found instead is a family none of its own checks are about: five
places that ask "is this path inside that directory?" and spell the question
`p.startsWith(base + "/")`. No path on Windows answers yes to that. The five,
each measured on this machine with its own real values before anything was
changed:

| Where | What it decides | What Windows got |
|---|---|---|
| `isInsideVault()` (`scripts/lib.mjs`) | the guard `story plan\|close --write` writes behind | `waypost: refusing to write outside the vault: Y:\…\docs\vault\epics\WP-18\stories\story-capacity-verified….md` — the lifecycle gates could not run at all |
| `checkVaultGit()` (`scripts/doctor.mjs`) | is the vault already versioned by the repo around it | a standing `vault-git` warning, and `doctor --fix` answers that warning with `git init docs/vault` — a nested repository inside the project's own |
| `checkMergeDriver()` (same) | is the vault versioned WITH the code | returns `[]` before it looks at anything: a Windows session is never told its merge driver is missing or has drifted |
| `merge-derived.mjs` | is this file a derived view | `waypost merge-derived: kanban.md is not a derived view; leaving the conflict`, exit 1 — git keeps the conflict markers in exactly the file ADR-0006 exists to keep out of conflict resolution |
| `leasesOverStaged()` (`scripts/commit.mjs`) | is a staged file one another session has leased | the repo-relative prefix never matches, so `waypost commit` stops seeing lease collisions on this OS |

Two more of the same shape, found by reading rather than by a symptom: the
empty-directory cleanup in `agents uninstall` (`scripts/agents.mjs`) never
walks up, and `relOf()` in `merge-derived.mjs` splits an absolute path on `/`
to identify a folder index.

The fix is one predicate — `pathUnder(p, base)` in `scripts/lib.mjs` — that
compares on `/` and folds case only where the filesystem itself does, and
returns the path from `base` to `p` (`""` for the same path, `null` for
outside) so the callers that need the relative form get it `/`-spelled. The
two that were already right (`vaultRelPath`, presence's `vaultRel`) had each
grown their own private copy of the normalisation; `vaultRelPath` now uses the
shared one.

Afterwards, on the same machine: `story plan --write` stamps and claims,
`doctor` reports 0 issues and 0 warnings, and the merge driver answers
`regenerated kanban.md from the vault instead of merging it`.

**This was never a Windows-only risk that Windows happened to expose.** Every
one of these is a `startsWith` on an absolute path, and the suite that would
have caught them has only ever been run where that spelling is correct.

### The merge driver's own path, and the shell git runs it through

Found by the suite, not by reading: two merge tests failed with

    Error: Cannot find module 'Y:\DocumentsSwiftProjectsWaypostscriptsmerge-derived.mjs'

git does not run a merge driver itself — it hands the command line to a shell,
and on Windows that is git's own `sh`, where a backslash escapes whatever
follows it. Measured directly: `sh -c` turns
`node Y:\Documents\Swift\x.mjs %A` into `node Y:DocumentsSwiftx.mjs %A`, and the
same line spelled with `/` arrives intact. (`git config` itself is innocent: it
escapes the value on the way in and returns it byte-for-byte.)

So on Windows `waypost doctor --fix` wrote a driver git could never run, and
the failure surfaces only during a merge — as a conflict in a generated file,
which is the one thing ADR-0006 asks this driver to prevent. `doctor` could not
notice either: with its separators eaten the value still ends in
`merge-derived.mjs %A %O %B %P`, which the "another machine's own path" rule
accepted. The path written into `.git/config` is now `/`-spelled, and that rule
now requires the value to LOOK like a path — one with no separator left in it
names nothing on any machine and is drift to repair.

### The suite on Windows, 2026-09-17: 54 failures, and what they were

This is the first time this project's own suite has been run on a Windows
machine, and the number to keep is the one before anything was touched:
**561 tests, 500 passing, 54 failing, 7 skipped** (344 s at concurrency 1,
through the slot like any heavy job). After the path family was fixed and its
tests added: **571 tests, 523 passing, 41 failing** — 13 of the 54 flipped
red to green, ten new tests, and nothing that had been passing broke.

The remaining 41 are a different job, and mostly not the code:

| Where | How many | What they are |
|---|---|---|
| `toolchains`, `discovery`, `scripts` (profile), `sizes` | 23 | the fixtures are a POSIX machine: fake tools are shell scripts with a shebang, and a path like `/home/x/.nuget` is not absolute on Windows, so the code correctly refuses it |
| `tokens` | 4 | the fixture points HOME at a temp directory; Windows reads USERPROFILE, so the transcripts it wrote are not where the code looks |
| `harness` | 6 | diagnosed and fixed, below: the test's side, both causes |
| `presence` | 3 | the same, below |
| `predicates` | 4 | one `endsWith("…/README.md")` in the assertion itself; a `chmod` that does not restrict on Windows; a hang staged by POSIX means |
| `slots` | 1 | `run --heavy: a signal exits 128 + the signal number` — POSIX signals |

The first two groups and the `predicates` three are the tests describing a
machine they are not running on, and fixing them is editing tests.

### The `harness` six and the `presence` three, read

They were the nine that could have been code, so they were read rather than
assumed. All nine are the test's own side, from two causes, and in every one of
them the code under test was right.

**A path asserted with a `/` in it.** `r.path.split("/").pop()` for a role's
filename (`basename()` now); `/\.opencode\/agents\/waypost-critic\.md/` against
the CLI's own output, which is native; `adr\/only-a-draft\.md` in the draft
preview; and three `endsWith("/.git/waypost/vault")`-shaped assertions on the
coordination directories. Each is about the SHAPE of a path — which directory
it lands in — so the separator is now normalised before the comparison
instead of being asserted.

**A dynamic `import()` of a bare absolute path.** Three tests run
`node -e "import(<path>).then(...)"` against `scripts/agents.mjs`. On Windows
that path begins `Y:`, which an ESM import reads as an unsupported URL scheme:
the child printed nothing at all, and the assertions were left matching an
empty string (one of them parsed it as JSON and threw). They take a `file://`
URL now, like the production code always has.

One of them was worth the reading on its own. `git rev-parse --git-common-dir`
answers with forward slashes on every OS, Windows included, while `join()`
there builds the same path with backslashes — so `dirname(commonDir)` and the
project root are one path in two spellings, and a plain `===` between them is
false. Nothing was broken by it, because `pathUnder()` (committed earlier the
same day) normalises both sides wherever that comparison actually decides
something. It is a good example of the class: the mixed spellings are real and
they are everywhere, and what matters is that no decision is taken by comparing
them raw.

### Sleep and wake, Windows, 2026-09-17: the predicted failure, measured

This story predicted it in "Still open after the Linux pass" — "a host suspend
longer than two minutes therefore invalidates every slot record on a Windows
guest" — and the ADR asked for it to be checked rather than assumed. Checked:
the owner suspended the VM from the Mac host with a live holder on the slot.

| | before the suspend | after the resume |
|---|---|---|
| wall clock (unix s) | 1789652936 | 1789653563 (+627 s) |
| `os.uptime()` | 3456.8 s | 3549.4 s (+93 s) |
| `bootIdentity()` → `epoch` | 1789649479 | 1789650014 (**+535 s**) |
| `Win32_OperatingSystem.LastBootUpTime` | 1789649479 | 1789649479 at +6 min, **1789650014 at +20 min** |
| the holder (pid 5728, child 8928) | running | **still running** |
| `readHolders()` | live 1, stale 0 | **live 0, stale 1** |
| `waypost capacity` | "slots: 1 of 1 already held" | **"can start 1 heavy job"** |
| a second `run --heavy` | exit 75, refused | **exit 0, it ran** |
| the holder's record on disk | there | **deleted by that claim** |

The machine was frozen for 534 s — 627 s of wall clock minus 93 s of uptime,
the two measured from the same process. `GetTickCount64`, which is what
`os.uptime()` reads on Windows, does not advance while the guest is frozen; the
wall clock is corrected forward by the host on resume; and `now − uptime` is the
difference between the two. A native Windows S3 sleep is a different case (that
tick count is biased and includes sleep) — what was measured here is the case
the owner's machines actually live in.

The step is permanent for the rest of the boot, not a settling transient: two
readings 82 s apart both show +534/535 (the ±1 s is `os.uptime()`'s integer
truncation). So one suspend invalidates **every** slot record written before it,
for as long as the machine stays up.

Two things this pass adds that the Linux one could not.

**Windows looked as though it had kept the answer, and it had not.** Six
minutes after the resume `LastBootUpTime` still read the true boot second and
`epoch_vs_wmi` was 0 — which is what the first version of this section, and
the first version of the ADR amendment, were written on. Read again twenty
minutes after the resume it gave **1789650014**, the drifted value, and stayed
there. It is the same biased tick count behind a cache. A check built on it
would have passed every test taken right after a wake and failed later, for a
reason no test was looking at. Worth stating plainly: the first reading was
not wrong, it was early, and early is the more dangerous kind of wrong.

Two sources did survive the same suspend, because the kernel stores them as
absolute times and never recomputes them from the tick count:

| source | read ~20 min after the resume | vs the true boot |
|---|---|---|
| System process (pid 4) creation time, via CIM | 1789649481, five reads agreeing | **+2 s** (the process starts just after boot) |
| kernel boot event (System log, Kernel-General id 12) | 1789649479 | **+0 s** |
| `LastBootUpTime` | 1789650014 | +535 s |

The pid-4 read costs ~0.4 s as node actually spawns it (409 ms median of
five; 850 ms for the first call in a cold process; the ~310 ms first
measured was PowerShell calling PowerShell, which is not what runs). For
scale, the `tasklist` call this command already makes per record on Windows
is ~60 ms. `wmic` is not an alternative:
it is absent from this Windows 11 26200. So an authority exists on Windows,
it is just not the obvious one — and the obvious one lies for the first
handful of minutes, which is exactly when someone verifying a fix would look.

**The damage is not "a holder is ignored", it is a record destroyed.**
`claimSlot()` prunes what it judges stale before it measures, so the second
heavy job did not merely start alongside the first — it removed the first one's
record on the way in. The slot directory was left empty with a 3-hour heavy job
still running on the machine: nothing to prune later, nothing to report, and
the slot advertised as free to every session from here on.

### What the fix has to do, and what the critic pass changed about it

Three options, differing in what they cost on every `capacity` call:

1. **Ask the OS every time.** Correct, and a process spawn (~0.4 s measured
   here) on a command whose whole point is to be cheap enough to run before
   every heavy job.
2. **Confirm only on mismatch.** Keep `now − uptime` as the cheap answer, and
   when it says "different boot" — rare, and the only case where a record is
   deleted — pay for the authoritative read before acting on it.
3. **Carry something non-drifting in the record** and compare that instead of
   a boot time computed at read time.

**Decided 2026-09-17: option 2**, and then **revised the same day after a
fresh-context critic pass**, which found two holes in it. Both were real, and
one of them was mine to have caught:

- The named authority was wrong. The amendment said "ask
  `LastBootUpTime`" on the strength of a reading taken six minutes after the
  resume. Re-measured at twenty minutes it had drifted to the biased value
  (table above). The authority is the System process's creation time (pid 4),
  or the kernel's boot event; not that.
- Option 2 alone does not survive the *second* suspend. The record carries the
  epoch, which is already drifted once the machine has slept, so comparing it
  against a true boot time reproduces exactly the deletion this is meant to
  stop. The record has to carry the authoritative value, written at claim time
  — which is option 3's write side. What landed is 2 and 3 together: the epoch
  stays the cheap first answer, the record carries the authority, and the
  mismatch path compares the two authoritative values.

The critic also asked what "kept rather than pruned" means for the cap (it
counts as a holder, bounded by the 24-hour cap, released with `--release
--force`, which the refusal message must name), where the spawn must not land
(the lock path, whose whole retry budget is two seconds), and what the rule
degrades to where no authority exists (keep, never prune). All of that is in
the amendment now.

The rule itself survived unchanged: **a mismatch on the epoch is a reason to
ask, never a reason to delete.**

**The code landed the same day** — see "The fix, as built" below. macOS is
still not covered by it: `os.uptime()` there is computed from `kern.boottime`, so the cheap
answer and the authority are one number, and `kern.bootsessionuuid` has to be
measured across a real sleep on the host before it can be written down as the
answer.

### The fix, as built, 2026-09-17

`bootAuthority()` in `scripts/capacity.mjs` asks the one question that survived
the suspend — pid 4's creation time, through PowerShell's CIM, argv and no
shell, the 2 s timeout every probe in that file already has — and returns
null for anything that is not a run of digits. `authorityOnce()` wraps it in a
thunk that asks at most once and only when asked at all; `readHolders()` makes
one per directory and `bin/waypost` one per invocation, so the claim, the lock
and `--release` share a single read. `confirmBoot()` is the whole rule in three
lines: true, false, or null, and only false may destroy anything.

`slotLive()` was rebuilt around the order the amendment asks for: the free
checks first (a holder whose process is gone is gone whatever boot it names),
then the cheap epoch, then — on the epoch path only — the authority. A real
boot identifier disagreeing still decides on its own, exactly as before, so
Linux's `boot_id` behaviour is untouched. `claimSlot()` records the
authoritative value beside the epoch, and `lockOwnerGone()` takes the same
route, because breaking a live claimant's lock is worse than keeping a stale
record. The refusal now names `waypost capacity --release <id> --force`.

Against the real machine, with the epoch 600 s out (what the suspend did) and
only the record constructed: a suspended-then-resumed holder reads live, a
record from another boot reads stale, an unanswered authority keeps the record,
a record with no authority field keeps it too until the 24-hour cap, and
neither an agreeing epoch nor a dead process asks the authority at all. Twenty
mismatching records cost one read.

The full suite caught one thing none of that did. The first build read the
authority inside the lock, because that is where the record and the lock's own
owner file are written. Five parallel claims against a cap of one then produced
`[0,75,75,0,75]` — **two** winners: a half-second spawn in the critical section
serialises the claimants so slowly that the first job's 1.5 s command finishes
before the last of them is admitted, and the slot is genuinely free by the time
it looks. Mutual exclusion was never broken; the window it defends just got
wider than the job. The read now happens before the lock is taken, where the
five pay it in parallel, and every later call in that process hits the memo.
The stress test the ADR asks for is what found it, three green runs after.

Ten hermetic tests in `tests/slots.test.mjs` cover the same ground with nothing
spawned, plus two CLI tests: the record carries the field, and the refusal
names the recovery. One of them earned its keep immediately — `Number("")` is
0, so an empty stdout from a PowerShell that exited 0 would have produced an
authority of zero, matching no record and deleting every one of them. The probe
now takes digits or nothing.

### Green on Windows, and what is skipped there

**582 tests, 558 passing, 0 failing, 24 skipped**, against 561/500/54/7 that
morning. The remaining thirty-two were worked through after the nine, and they
held two more defects in the code rather than in the tests:

- `checkWorkWithoutStory` asked "is this file inside the vault?" as
  ``vaultAbs.startsWith(`${resolve(proj)}/`)`` — the same question `pathUnder`
  answers everywhere else, written as a template literal, which is why the
  morning's sweep (a grep for `+ "/"`) never saw it. On Windows every file the
  vault owns was therefore reported as untracked source work with no story
  behind it: `doctor` accusing the project of exactly what the vault is for.
- A substituted cache path kept the template's separator: `$HOME/.cargo/registry`
  with a Windows home became `C:\Users\x/.cargo/registry`. One path in two
  spellings, so it failed to dedupe against the same path asked from the tool,
  and was printed to the user that way. It is normalised now — and a test that
  had encoded the mixed spelling as the expected value came with it, which is
  the tidier half of the same lesson.

Twelve were the tests asserting the wrong platform's arrangement: eight of them
`HOME` where Windows reads `USERPROFILE` (`os.homedir()` reads one on each), so
a fixture home redirected nothing — `size --global` was scanning the real
machine's caches for 7.6 s and asserting against someone's actual cargo
registry; two were separators inside an assertion; and one was a `chmod` that
restricts nothing on Windows, where the test then asserted against whatever
finding came back instead. That one now asserts only when the file is in fact
unreadable, and proves it by trying to read it.

Seventeen are skipped, each with its reason in the run's own output rather than
a bare `skip: true`. Sixteen are the ask fixtures: a `#!/bin/sh` file with the
exec bit, found by that bit and spawned directly, which Windows can do neither
of — and does not have to, since waypost refuses to run a `.cmd`/`.bat` shim's
ask at all. What Windows owes there is to find the tool through PATHEXT and
decline to ask it, and that has its own tests, which pass. The seventeenth is
POSIX signals.

So the honest summary of what a green run on this machine means: the parse
kinds of the ask path (`json`, `kv`, the array shape, the dedup ranking) are
exercised on POSIX only, and everything else in this suite is exercised here.

### Sleep and wake, Windows: the fix, by a second real suspend

The first suspend found the defect; this one was run against the fix, on the
same machine, the same way: the owner suspended the VM from the host with a
live holder on the slot. 1603 seconds frozen this time, three times the first.

| | before the suspend | after the resume | moved |
|---|---|---|---|
| wall clock (unix s) | 1789661289 | 1789663037 | +1748 |
| `os.uptime()` | 11274.9 s | 11420.1 s | +145 |
| `bootIdentity()` — `epoch` | 1789650014 | 1789651617 | **+1603** |
| the authority (pid 4's creation) | 1789649481 | 1789649481 | **0** |
| `sameBoot()` — the cheap answer | true | **false** | |
| `confirmBoot()` — the authority | true | **true** | |
| `slotLive()` | true | **true** | |
| `waypost capacity` | 1 of 1 held | **1 of 1 held**, holder listed | |
| a second `run --heavy` | exit 75 | **exit 75** | |
| the record on disk | there | **there** | |

1603 s frozen = 1748 s of wall clock minus 145 s of uptime, both read from one
process. The cheap answer said "another boot", exactly as it did in the morning
— and exactly as it is now allowed to, because it no longer decides anything
on its own.

One number is worth more than the table. The holder's record was written
*after* the morning's suspend, so its own epoch was already 533 s adrift from
the true boot before this test began, and 2136 s adrift after it — 35 minutes
of error accumulated over two sleeps in one uptime. That is the critic's second
blocker as a measurement rather than an argument: comparing a record's epoch
against a true boot time would have called this holder dead on both counts.
Comparing authority against authority was exact both times, because the number
the kernel stores is the only one here that does not move.

**The cache behind `LastBootUpTime`, measured a second time.** The morning's
suspend is what showed that value drifting late; this one was watched on
purpose, and it behaved identically. 2.1 minutes after the resume it still read
1789650014, the pre-suspend value; 27.4 minutes after it, 1789651617 — drifted
by 1603, exactly the frozen duration and exactly what the epoch had done
immediately. pid 4's creation time was 1789649481 at both readings, and at
every reading all day, across both suspends.

Two independent suspends, then, for the sentence this decision rests on: the
value that looks like an authority is a derived one behind a cache, and in the
first minutes after a resume it is wrong in the flattering direction — it reads
correct exactly when someone verifying a fix would look at it. The value that
is an authority is the one the kernel stores once and never recomputes.

**And keeping a record is not keeping it for ever.** Cleaning up, the holder
was stopped with `Stop-Process -Force`, which is an unclean stop: the wrapper
never released its record, so a record naming a dead pid was left on disk with
the same "another boot" epoch. `slotLive()` read it stale — for the right
reason, the free process check (`alive: false`) settling it before the boot
question arose at all — `capacity` reported the slot free, and the next claim
pruned it and ran. The rule keeps what it cannot disprove; it does not keep
what the process table has already answered.

### A real Windows restart, 2026-09-17: four answers, and a timeout that is wrong

Staged before the restart: a live holder (`run --heavy`, pid 1492), and two
records planted as a previous boot would leave them, both naming pid 4 — the
System process, which exists on every boot, so signal-0 and `tasklist` say
"alive" about them afterwards and only the boot identity is left to decide
(the Windows equivalent of the Linux pass's planted pid 1). One carried the
authority; one did not, as a version before today would have written it. Then
an ordinary Restart from Windows, and a read-only check before anything else.

| | before | after the restart |
|---|---|---|
| `epoch` | 1789651617 | 1789665359 |
| the authority (pid 4's creation) | 1789649481 | **1789665361** |
| `os.uptime()` | ~13 530 s | 2 034 s (a while after logging in) |

**1. The authority does change across a restart.** +15 880 s. The rule has a
real signal to decide with — measured, where until now it was only assumed.
The new boot's epoch and authority agree to 2 s, as they did this morning.

**2. A clean Windows restart does not release a running holder.** Its record
was still on disk afterwards. On Linux shutdown signals the wrapper and it
releases like any other exit; on Windows the restart ends node without its exit
path. So on this platform every restart with a heavy job running leaves a
record behind: the boot identity is not an edge case here, it is the ordinary
path. That record was pruned correctly, and for free — its pid was dead, so the
process check settled it before the boot question arose.

**3. The record whose process exists again, with the authority: stale, but not
at first.** The read-only check (run first, on a quiet machine) got the
authority in time and called it a confirmed other boot. `waypost capacity`, a
minute later, called it a holder — "slots: 2 of 1 already held" — and a claim
was refused. Measured straight after: the authority read was taking **2.0" + "–" + "9.6 s**,
one call **74 s**, against the 2 s timeout the amendment specifies, while the
machine was busy finishing its boot (load 1.18). Every read in that window came
back as "unconfirmable", and unconfirmable keeps the record. A few minutes
later (load 0.70) the same `capacity --release` released it without `--force`,
because the read now fit.

**4. The record without an authority field: a phantom, as designed.** Kept,
counted, refused a heavy job, and released only by `--release --force` — the
residual risk the ADR names, measured rather than asserted, and the recovery
the refusal message names works.

**What 2 and 3 together mean.** The window right after a restart is exactly
when previous-boot records exist — on Windows, always, if a job was running —
and it is exactly when the authority is slowest. A timeout short enough to keep
`capacity` fast turns that window into one where any previous-boot record whose
pid happens to be alive again pins the slot. The pid-4 plant makes that certain
on purpose; in real use it needs a reused pid with the same image name, which
is rare, but "rare, and right after every restart" is not a property a slot
should have.

**The change this argues for: uptime as a free confirmation of another boot.**
`os.uptime()` never decreases within one boot. Across both of today's suspends
it paused and resumed (3456.8 " + "→" + " 3549.4, 11274.9 " + "→" + " 11420.1) and never
went back; across the restart it went from ~13 530 s to 2 034 s. So a record
that carries the uptime it was claimed at, read back when `uptime_now <
uptime_at_claim`, is from another boot with certainty — no spawn, no timeout,
unmoved by any suspend. The converse proves nothing (a new boot can have been
up longer than the record's claim was), so it only ever confirms "another
boot", which is the one direction that is allowed to prune. Every record in
this restart — the holder and both plants, all claimed at ~13 530 s — would
have been settled at once. Only a record claimed very early in its own boot
would still fall through to the authority, and by the time a machine has been
up longer than that, the authority is no longer in its slow first minutes.

This was the critic's option 3, and it was set aside as "needs care about a
reboot that has been up longer than the record's own uptime was". The care is
real, and it is exactly why uptime is proposed only as the confirming half.
Not built: it changes a decision recorded today, so it is the owner's call.

### The uptime rule, as built

Decided and recorded as the ADR second amendment, then built the same day.
`uptimeSaysOtherBoot(rec, uptimeNow)` in `scripts/capacity.mjs` is the whole
rule: a record whose claimed uptime is above the current reading, by more than
a five-second margin, is from another boot. It answers `true` or nothing — there
is no "same boot" answer to give, since a new boot can have been up longer than
the record claim was. `slotLive()` asks it after the free process checks and
the epoch and before the authority; `lockOwnerGone()` takes the same order,
because breaking a live claimant lock is the worst thing either can get wrong.
A claim records `uptime` beside `authority`, on every platform.

Against the real machine, with the restart own numbers (records claimed at
uptime 13 530 in the previous boot, read back in a boot at 2 444 s) and the
authority thunk rigged to throw if anything reached it: a previous boot record
is stale with no spawn; a record from this boot after a suspend is kept,
because uptime declines to confirm and the authority answers; a claim inside
the margin is not confirmed; a record with no uptime field falls through to the
authority; one with neither field is kept. Twenty previous-boot records cost
zero authority reads.

Five hermetic tests carry it (eight assertions in the first alone), and two
directions in them matter most: the restart (settled by uptime, the authority
forbidden) and the suspend (uptime must NOT confirm, and the holder survives).
The margin has its own cases on both sides.

Where the authority is read had to be measured twice more before it was right,
and the suite priced each attempt. Before the lock: a refusal took 2486 ms
against the 2000 ms budget that pins "exits at once", the field came back null
under load anyway, and a claim slipped past a live lock owner. Ten seconds
after the lock: a five-way stress test went from 3 s to 52 s. One second after
the lock, best-effort: the refusal is back to 356 ms and the field is there
whenever the read is cheap. The guarantee is `uptime`; the authority is the
extra. The ADR third amendment carries the reasoning, and the suite is green
at 587 tests, 563 passing, 24 skipped.

What this does not yet have: a second real restart, to watch the rule work on
records the machine itself wrote rather than on the same numbers replayed
through real probes. That is one restart away, and it is what would let the
"after a restart the slot is free" criterion be ticked for Windows.

## Dependencies

- `story-the-heavy-work-rule-in-every-project-and-wayposts-own-heavy-work`.

## Attachments

-

---

*Last updated: 2026-09-17*
