---
type: adr
id: "heavy-work-sized-to-the-machine-waypost-capacity-a-machine-wide-slot-and-a-rule-to-check-first"
title: "Heavy work sized to the machine: waypost capacity, a machine-wide slot, and a rule to check first"
status: proposed
date: 2026-09-14
authors: ["Ivan Morozov"]
tags: []
external_refs: {}
supersedes: null
superseded_by: null
review_status: reviewed
reviewed_at: 2026-09-15
drafted_by: {"harness":"claude","provider":null,"date":"2026-09-14"}
code_refs: ["scripts/capacity.mjs", "bin/waypost", "scripts/agents.mjs", "scripts/presence.mjs", "AGENTS.md", "package.json", "prompts/heavy.md (planned)", "tests/capacity.test.mjs", "tests/slots.test.mjs", "tests/harness.test.mjs"]
related: "ADR-0001, ADR-0004, ADR-0007, ADR-0008, ADR-0010, disk-hygiene-by-discovery-a-toolchain-registry-a-machine-and-project-profile-and-cleanup-only-after-a-yes"
guards: [{"require": "waypost run --heavy", "in": "AGENTS.md", "why": "Waypost's own instructions keep sending heavy work through the machine-wide slot"}]
---

# Heavy work sized to the machine: waypost capacity, a machine-wide slot, and a rule to check first

| Field | Value |
|---|---|
| **Status** | proposed |
| **Date** | 2026-09-14 |
| **Authors** | Ivan Morozov |

---

## Context

On 2026-09-14 the owner's machine (8 cores, 16 GB) froze and had to be
restarted. Several sessions in several harnesses ran heavy work at once:
- builds for several platforms;
- a test framework next to a live build daemon and a running simulator;
- background agents, each running a full test suite.

The load average passed 56 on 8 cores.

The owner's rule, the same day: Waypost is installed by other people on other
machines. It must always take the machine's real free resources into account,
on every machine, and never start more heavy work than the machine can take.

What already exists:
- ADR-0001: no hooks. Waypost cannot intercept what a harness runs. Its
  interface is its commands, plus the routing block it installs into each
  project's instructions. That block is standing context with a budget
  (ADR-0008).
- ADR-0007 and ADR-0010: presence and leases coordinate sessions per project,
  not per machine. `scripts/presence.mjs` already detects a reused process id
  by comparing process start times.
- The disk-hygiene ADR: a machine state directory, per OS and keyed by host.
  It is local and never synced.

The traps, measured on the owner's Mac:
- Node's `os.freemem()` reported 0.18 GB free, while macOS reported 81 % of
  memory available (`kern.memorystatus_level`, the figure `memory_pressure`
  prints). macOS keeps reclaimable memory as cache, so a naive check would
  call every Mac full.
- On Windows, Node's `os.loadavg()` is always zeros.
- In a container, Linux `MemAvailable` describes the host, not the
  container's limit.

"Real free resources" therefore needs each OS's own measure, with its limits
applied.

Decision drivers:
- universal: any OS, any machine, any user;
- real, current resources, never constants tuned on one machine;
- one limit shared by every session, harness and project on the machine;
- no hooks, and a small standing-context cost;
- a heavy job that cannot start says why at once, and never blocks an agent
  past its harness's timeout.

## Decision

1. **`waypost capacity` measures the machine now**, on every call, never
   cached.
   - **Cores:** `os.availableParallelism()`. On Linux it is capped by the
     cgroup CPU quota when one is set (`cpu.max` in v2;
     `cpu.cfs_quota_us / cpu.cfs_period_us` in v1).
   - **Busy share:** the 1-minute load average on macOS and Linux. On
     Windows, where Node reports none, a short sample of `os.cpus()` times.
   - **Memory available to new work**, by each OS's own measure:
     - macOS: `kern.memorystatus_level` × total. It is an undocumented
       field, so if the sysctl fails or is refused (a sandbox), `vm_stat` is
       used instead: free + inactive + speculative + purgeable pages.
     - Linux: `MemAvailable`, capped by the cgroup limit minus usage when a
       limit is set (`memory.max` / `memory.current` in v2;
       `memory.limit_in_bytes` / `memory.usage_in_bytes` in v1).
     - Windows: `os.freemem()`, which is available physical memory there.
     - Anything else, or when every probe fails: `os.freemem()`, reported as
       a lower bound.
   - **The heavy jobs holding slots** (Decision 2).

   From these, `can_start` says how many more heavy jobs the machine takes
   now. A new one may start only when all of these hold:
   - (a) fewer jobs hold slots than the hardware allows: one slot per four
     cores, at least one;
   - (b) the cores not already busy cover one job's share: a quarter of the
     cores, at least one;
   - (c) available memory covers one job's share: the smaller of 2 GB and a
     quarter of the memory, so a small container is not refused forever.

   Load averages lag, so (a) — enforced under the lock of Decision 2 — is
   what stops two jobs starting in the same minute. (b) and (c) are what make
   a machine already loaded by anything else wait. `WAYPOST_HEAVY_MAX` can
   only lower the slot count.

   The output is one human line, or `--json` with every figure, the probe
   that produced it, the holders, `can_start`, and the reason when it is zero.
2. **A machine-wide slot for heavy work:
   `waypost run --heavy [--wait <duration>] -- <argv…>`.**
   - **Claiming a slot.** Waypost takes an exclusive local lock: a lock
     directory created with `mkdir`, atomic on every OS. The lock directory
     holds its owner's pid and start time. It is broken only when that owner
     is dead by the liveness check below, or after five minutes. Under the
     lock it reads the live holders,
     checks `can_start`, and writes its own record: pid, process start time,
     boot time, host, session, harness, command and start. Then it releases
     the lock. Two processes starting in the same second cannot both pass
     the cap.
   - **Liveness.** A record from an earlier boot is stale on every OS. The
     boot is identified by what the OS offers: Linux's
     `/proc/sys/kernel/random/boot_id`, macOS's `kern.boottime`. Elsewhere
     it is now minus `os.uptime()`, compared with a tolerance of two
     minutes, and the verification runs check it across sleep and wake.
     Within one boot:
     - on POSIX, the process-table and start-time comparison that
       `presence.mjs` uses, so a reused pid is not mistaken for the holder;
     - on Windows, where Node has no process table, a signal-0 probe, plus
       the image name that `tasklist` reports for that pid (run without a
       shell), compared with the recorded command. A record older than 24
       hours is released regardless. If `tasklist` fails, or takes longer
       than a few seconds, the signal-0 probe and that 24-hour cap decide.

     `waypost capacity --release <id>` is the recovery path. It runs the
     same liveness check first and refuses a record that still looks alive,
     unless `--force` is given. It prints what it released.
   - **No waiting by default.** When `can_start` is zero, it exits at once
     with a distinct code, the reason (load, memory, who holds the slots) and
     the command to retry. `--wait <duration>` waits instead, repeating the
     reason at intervals, and exits with the same code at the deadline. It
     never starts anyway. Harness tool calls time out (Claude Code's shell
     tool after about two minutes by default), so an agent must never be
     left blocking on a slot it cannot get.
   - **Running.** The argv runs without a shell, with stdio inherited.
     Waypost lowers its own priority first (nice +10 on POSIX, below-normal
     on Windows), so the command and everything it starts inherit it. It
     passes interrupts and termination on, releases the slot on exit, and
     exits with the command's code.
   - **One table per machine.** The table lives per host in the machine
     state directory, and every session in any harness and any project,
     Waypost's own jobs included, shares it.
   - **What counts as heavy:** builds, full test suites, simulator or
     emulator boots, whole-disk scans, and any background agent that builds
     or tests.
3. **The rule reaches every project.** The routing block that
   `waypost agents register` installs gains one line of about 45 characters:
   "Heavy work: `waypost run --heavy -- <cmd>`." It fits the existing budget
   test (ADR-0008: the block stays under 1400 characters, and it is 1333
   today) without raising it. That leaves about 20 characters, so any later
   addition to the block has to fit the same test.

   Everything else is on demand. The refusal message says why and how to
   retry. `waypost prompt heavy` gives the procedure:
   - check `waypost capacity` before launching parallel agents that build or
     test;
   - run long work in the harness's background mode;
   - when the machine is busy, report it or retry later, rather than starting
     the work without Waypost.

   Waypost's own `AGENTS.md` says the same, and a guard on this ADR keeps it
   there.

   Waypost has no hooks, so the line and the commands are the mechanism.
   Heavy work started outside `waypost run` still shows in the real load, so
   the next job waits for it.
4. **Waypost's own heavy work obeys the same limit.**
   - Its test suite sizes `--test-concurrency` from `waypost capacity` and
     holds a slot.
   - The machine audit in `waypost setup`, and `waypost size --global`, hold
     a slot too.
   - On a machine that cannot take it, `npm test` says why and stops, and
     `WAYPOST_HEAVY_WAIT=<duration> npm test` waits instead. Because a job's
     memory share scales with the machine (Decision 1 (c)), a small CI
     container is not refused forever.
5. **Verified, not assumed.**
   - Tests inject the platform, the probes' output, cgroup files, the
     process table and the boot time.
   - A stress test starts several claims at once against a cap of one, each
     with a trivial command, in a temporary state directory, and asserts that
     exactly one holds the slot.
   - The owner's Linux and Windows virtual machines check the per-OS probes
     and a slot shared by two sessions.

## Rationale

1. The owner's rule, taken literally: real free resources, on every machine,
   for every user.
2. Only a machine-wide slot coordinates sessions and harnesses that know
   nothing of each other. A rule each agent had to remember did not prevent
   the freeze.
3. Real measures instead of constants. The same defaults fit a 4-core laptop,
   a 32-core workstation and a 2-CPU container, and a machine busy with
   anything else waits.
4. Each OS's own memory measure avoids the trap measured on the owner's Mac:
   0.18 GB "free" against 81 % of 16 GB available.
5. A lock around the check, and liveness by start and boot time, make the cap
   hold in exactly the moment it exists for: several sessions starting at
   once, right after a restart.
6. Failing fast with the reason, instead of blocking or starting anyway,
   leaves an agent able to report to its user within its tool's timeout.

## Alternatives Considered

### Alternative A: a rule only

**Cons**:
- It holds only as long as every agent in every harness remembers it. The
  freeze happened with such a rule in place.

**Rejected because**: the owner chose the command and the slot.

### Alternative B: strictly one heavy job per machine

**Pros**:
- The simplest limit.

**Cons**:
- A large machine idles, and a small machine that is already loaded is still
  allowed one.

**Rejected because**: the owner chose sizing to the machine's real resources.

### Alternative C: hooks that intercept heavy commands

**Rejected because**: ADR-0001.

### Alternative D: `os.freemem()` on every OS

**Rejected because**: on macOS it reports a small fraction of the memory
actually available (measured: 0.18 GB against 81 % of 16 GB). In a container,
the host's figure ignores the limit.

### Alternative E: per-project leases (ADR-0007) for heavy work

**Rejected because**: a lease belongs to one vault, and the machine is shared
by every project.

### Alternative F: a queue daemon

**Rejected because**: no dependencies and no long-running process; a lock
directory, files and pids are enough.

### Alternative G: waiting by default

**Rejected because**: harness tool calls time out long before a useful wait
ends. The agent would read a timeout as a failure and run the work outside the
slot.

### Alternative H: liveness by signal 0 alone

**Rejected because**: after a restart, process ids are reused at once. A
stale record would hold the only slot of a small machine indefinitely.

## Consequences

**Positive**:
- On one machine, heavy work from any session, harness or project queues
  behind one limit.
- A loaded machine refuses new heavy work at once, and says why.
- Nothing is tuned to one machine, and containers see their own limits.

**Negative / trade-offs**:
- Only work launched through `waypost run --heavy` holds a slot. Other heavy
  work is seen only through its load, once the load average catches up.
- The per-OS probes need upkeep and verification on each OS: a sysctl with a
  `vm_stat` fallback on macOS, `/proc` and cgroup files on Linux, a CPU
  sample on Windows. `kern.memorystatus_level` is undocumented, which is why
  the fallback exists.
- WSL and native Windows on one computer keep two slot tables: WSL is a Linux
  virtual machine with its own state directory. Each side sees the other only
  as load. This is a known limitation, not in scope.
- At lowered priority a heavy job runs slower on a busy machine. That is the
  point.
- It needs the machine state directory of the disk-hygiene ADR. Resolving it
  lands with this work, in `scripts/lib.mjs`, and the paused discovery story
  reuses it.

**What changes in code / process**:
- New: `scripts/capacity.mjs`, which measures and computes but never writes,
  and `tests/capacity.test.mjs`.
- Changed:
  - `bin/waypost`: `capacity`, `run --heavy`, the lock and the slot files;
  - the routing block, and a new `prompts/heavy.md`;
  - `AGENTS.md`;
  - Waypost's test runner;
  - docs;
  - `CHANGELOG.md`.

## Owner's decisions

On 2026-09-15 the owner answered the open questions and approved this ADR:

1. One heavy job's share is a quarter of the cores (at least one) and the
   smaller of 2 GB and a quarter of the memory. There is one slot per four
   cores, at least one.
2. Heavy work runs at lowered priority: nice +10 on POSIX, below-normal on
   Windows.
3. The safety bounds stand as written:
   - a lock is broken only when its owner is dead, or after five minutes;
   - on Windows, a slot older than 24 hours is released;
   - `--release` refuses a live-looking record unless `--force` is given.

The status becomes `accepted` in the commit that lands the implementation,
when the guard on `AGENTS.md` passes.

## Review history

- A fresh-context critic pass (2026-09-14) returned "revise", with three
  blockers:
  - the claim was a check followed by a write, so two jobs started in one
    second could both pass the cap;
  - liveness by signal 0 alone would mistake a pid reused after a restart for
    the holder;
  - a ten-minute default wait collided with harness tool timeouts.

  It also raised three should-fix items (cgroup limits, an undocumented
  sysctl without a fallback, WSL) and one nit (when the priority is lowered).
  Decisions 1, 2, 3 and 5 answer them, and WSL is recorded as a limitation.
- A second fresh-context pass (2026-09-14) returned "accept with changes". It
  found the first pass's blockers closed, and raised two new blockers:
  - the routing-block text would have overflowed ADR-0008's budget of 1400
    characters (1333 today, plus about 300);
  - `--release` could defeat the throttle.

  It also raised four should-fix items: boot time across sleep, fencing the
  stale lock, the Windows pid check, and the test suite on a small machine.
  Decisions 1–4 answer them, and the owner settled the safety bounds (Owner's
  decisions, item 3).
- A third check of those answers (2026-09-15) found all six closed and no
  blockers. Its three nits (the block's remaining headroom, a fallback when
  `tasklist` fails, an unquantified tolerance) are answered in Decisions 2
  and 3.

## References

- ADR-0001, ADR-0004, ADR-0007, ADR-0008, ADR-0010; the disk-hygiene ADR (the
  machine state directory); `scripts/presence.mjs` (start-time liveness).
- The owner's directive, 2026-09-14.
- The owner's personal rule "Тяжёлые процессы — строго по одному" in the
  global instructions, which this generalizes.

---

*Last updated: 2026-09-14*
