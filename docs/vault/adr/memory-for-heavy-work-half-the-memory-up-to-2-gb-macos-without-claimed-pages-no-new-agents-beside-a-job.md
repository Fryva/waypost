---
type: adr
id: "memory-for-heavy-work-half-the-memory-up-to-2-gb-macos-without-claimed-pages-no-new-agents-beside-a-job"
title: "Memory for heavy work: half the memory up to 2 GB, macOS by pressure level, no agents beside a job"
status: proposed
date: 2026-09-28
authors: ["Ivan Morozov"]
tags: []
external_refs: {}
supersedes: null
superseded_by: null
review_status: pending
reviewed_at: null
drafted_by: {"harness":"claude","provider":null,"date":"2026-09-28"}
code_refs: ["scripts/capacity.mjs", "scripts/capacity-admission.mjs", "scripts/capacity-memory.mjs", "bin/cli/run.mjs", "bin/cli/slots.mjs", "tests/capacity.test.mjs", "tests/capacity-memory.test.mjs", "tests/capacity-admission.test.mjs", "tests/slots.test.mjs", "templates/agents-block.md.tmpl", "scripts/agents-registry.mjs", "prompts/heavy.md", "tests/harness.test.mjs", "AGENTS.md"]
related: "heavy-work-sized-to-the-machine-waypost-capacity-a-machine-wide-slot-and-a-rule-to-check-first, ADR-0001, ADR-0008"
guards: [{"require": "no agents beside it", "in": "AGENTS.md", "why": "the routing block keeps background agents and a heavy job from running side by side, in either order"}]
---

# Memory for heavy work: half the memory up to 2 GB, macOS by pressure level, no agents beside a job

| Field | Value |
|---|---|
| **Status** | proposed |
| **Date** | 2026-09-28 |
| **Authors** | Ivan Morozov |

---

## Context

The heavy-work-sized-to-the-machine ADR (Decision 1, Owner's decisions item
1) admits a heavy job when available memory covers one job's share, "the
smaller of 2 GB and a quarter of the memory". On macOS it measures available
memory as `kern.memorystatus_level` × total.

**The incident, 2026-09-27, the owner's Linux VM** (Parallels, Debian, 4
cores, 3.8 GB RAM, 3.3 GB swap). An agent in another project built and linked
a Rust test binary (`-j 2`) through the slot while background agents (critic,
reviewer, explorer) were working in the same session. The build was killed
(exit 137) and the harness with it. That agent's record says the build must
not run "while background agents are working" and "wait for the agents, then
build (or the other way round)". It concluded "`waypost capacity` checks only
the cores and does not see the harness agents' memory", with a manual rule:
wait until `free -m` shows 2 GB or more available.

Not recorded: MemAvailable at admission, which agents started before the
build and which after. The kill log was recovered on 2026-10-13 from the VM's
persistent journal (boot `fd300454…`): the **kernel OOM killer**, not
systemd-oomd, which is not installed there. At 21:41:32 it killed `rustc`
(anon-rss 2.9 GB, swap 252 kB free) — already its first choice, every
process in the list at `oom_score_adj` 100. The harness died anyway, 90 s
later and by a different hand: `rustc` ran inside the desktop app's own
systemd scope (`app-com.anthropic.Claude-2808.scope`), and with
`DefaultOOMPolicy=stop` systemd stops a unit one of whose processes the OOM
killer took — "Stopping timed out. Killing", then `Failed with result
'oom-kill'`. See Verification.

What the code shows:
1. **The share was a quarter.** On 3.8 GB, a job's share was 0.95 GB, so the
   memory check passed almost always and slots and cores decided. Hence "only
   the cores".
2. **Memory is sampled once, at admission.** `MemAvailable` counts the
   agents running then, not their growth, and not an agent spawned after.
3. **Slots do not reserve memory.** `canStart` divided available memory by
   the share and ignored live holders; a second job claimed seconds after the
   first saw the first's memory as still free.
4. **Nothing steered the OOM killer.** `waypost run --heavy` is the job's
   parent for its whole life, yet left the job and the harness equally likely
   to be killed.

**The same check on the owner's Mac** (16 GB) was blind in a different way:

| Measure | Available |
|---|---|
| `kern.memorystatus_level` (50 %), what `capacity` reported | 8.0 GB |
| `vm_stat` free + inactive + speculative + purgeable (the fallback) | 4.0 GB |
| `vm_stat` free + file-backed + purgeable | 2.7 GB |
| swap | 8.1 of 9.2 GB in use |

`kern.memorystatus_level` tracks free + active + inactive + speculative
pages (49.3 % of the fixture's pages against 50 % reported), so it counts
resident anonymous memory — every live process's own — as available. The
agents' memory there was largely compressed: 0.6 GB resident, 9.7 GB
footprint by `top`. Linux (`MemAvailable`) and Windows (`os.freemem()`) do
not count a process's own memory as available.

## Decision

This replaces two parts of the heavy-work-sized-to-the-machine ADR's Decision
1 — the memory share in rule (c) and the macOS memory probe — and extends its
Decision 2 slot and Decision 3 rule. Everything else there stands. On
acceptance, these passages there get an "Amended by" note, as its Decision 2
already carries one: Decision 1's macOS probe and rule (c); Decision 2's
"Running" (the scope, `oom_score_adj`, the job's pid in the record); the
budget note "about 20 characters"; the trap list's "which is why the
fallback exists"; the "81 %" figures; Owner's decisions item 1.

1. **A heavy job's memory share is the smaller of 2 GB and half the memory**
   (was a quarter). A 3.8 GB VM needs 1.9 GB available; a 16 GB Mac still
   2 GB; a 256 MB container 128 MB.
2. **Each live slot holder reserves one share.** Memory for a new job is
   available − holders × share. A job that has already allocated is then
   counted twice: strict on purpose, and it only matters on machines with two
   or more slots (8 cores and up).
3. **macOS memory follows the kernel's pressure level**
   (`kern.memorystatus_vm_pressure_level`: 1 normal, 2 warning, 4 critical):
   - normal: `vm_stat` free + inactive + speculative + purgeable pages;
   - warning: free + file-backed + purgeable — the pages the kernel can
     reclaim without compressing or swapping any process's own memory
     (file-backed pages include mapped executables, so reclaiming them costs
     page-ins). This is XNU's own definition of available pages off macOS,
     and Activity Monitor's Free + Cached Files;
   - level unreadable: the smaller of the two formulas — neither is
     stricter by construction — labelled "memory pressure unknown";
   - critical: 0, and the refusal reason says "memory pressure critical".
   - When `vm_stat` fails or lacks a count: `kern.memorystatus_level` ×
     total, labelled an upper bound; then `os.freemem()`, a lower bound.
4. **Linux cgroups:** a limit's usage excludes inactive file pages
   (`inactive_file` in v2 `memory.stat`, `total_inactive_file` in v1), as the
   kubelet computes a working set. Page cache left by a clone or an install
   does not refuse a job forever.
5. **Linux: the job is the OOM killer's first choice, in a scope of its
   own.** `waypost run --heavy` raises `/proc/self/oom_score_adj` to 1000
   for the spawn only: the job inherits it at fork, and the wrapper writes
   its own earlier value back at once. The wrapper stays in the harness's
   unit, so were it the victim, systemd would stop that unit — the
   incident again. Neither write needs privilege: an unprivileged process
   may lower the value down to the last one a privileged process set.
   Under a reachable systemd user manager the job starts through
   `systemd-run --user --scope --collect`, so the unit systemd stops after
   an OOM kill is the job's, not the harness's; a probe decides, and
   without a manager the job runs as before. A command not on `PATH` is not
   wrapped, so it still exits 127, not systemd-run's 1. The slot record
   names the job's pid, and stays live while either the wrapper or the job
   runs: a job that outlives a killed wrapper keeps its slot. If the kernel
   OOM killer has to act, the build dies, not the harness. (Owner,
   2026-10-13 after the Linux VM pass, and 2026-11-05 after the second
   critic pass.)
6. **No agents beside a heavy job, in either order.** The routing block's
   rule becomes "Heavy work: `waypost run --heavy -- <cmd>`; no agents beside
   it." (block v3; the line is unchanged in v4). `prompts/heavy.md` step 6
   gives the reason: let the
   agents finish, then start the job, or the other way round; check
   `waypost capacity` before launching several agents at all.

## Rationale

1. Half the memory up to 2 GB matches the one figure there is for heavy work
   on a small machine: the VM agent's manual 2 GB after the crash. The 2 GB
   cap leaves large machines as they were.
2. A reserve is the one way admission can see a job that has not allocated
   yet on every OS; slots already stop two jobs in one minute on cores, not
   on memory. (On Linux the job's scope would let the reserve be measured —
   share − the scope's `memory.current` — not taken, for one rule
   everywhere.)
3. At normal pressure the kernel gives up inactive memory before anything
   else, so the looser formula keeps an unloaded Mac — an 8 GB one with a
   browser and an IDE — from being refused for nothing. Under warning, memory
   claimed by live processes is no longer free for a new job. Only critical
   overrides the pages: the owner's Mac hosting a VM sat at warning for over
   half an hour with 2.6 GB reclaimable, and zeroing at warning refused all
   heavy work there — too strict, the owner said.
4. Waypost cannot see or stop what a harness spawns (ADR-0001: no hooks),
   but it is the job's parent: it can make sure the job, not the harness, is
   what the kernel OOM killer takes. Agents a harness starts beside a job
   only the rule each agent reads every turn reaches, which is why it goes
   into the routing block and not only into `prompts/heavy.md`. Agents
   Waypost starts itself (`waypost team` peers) it can see: warning there,
   and showing a live slot in `brief` and `status`, is a separate story
   (owner, 2026-11-05).

## Alternatives Considered

### A fixed 2 GB share everywhere

**Pros**:
- the simplest, and exactly the VM agent's manual rule

**Cons**:
- a machine or container with under 2 GB available never runs heavy work

**Rejected because**: the owner chose half the memory up to 2 GB.

### Reserve only for holders admitted in the last few minutes

**Pros**:
- does not count a job's memory twice once it has allocated

**Cons**:
- a ramp-up constant tuned on nothing

**Rejected because**: the owner chose one share per holder.

### macOS: the physical formula at every pressure level

**Pros**:
- stricter, one formula

**Cons**:
- the owner's Mac read 36–190 MB above the 2 GB share while sampled; an idle
  8 GB Mac is likely below it most of the time

**Rejected because**: the owner chose the formula by pressure level.

### macOS: zero available memory from warning pressure up

**Pros**:
- stops heavy work at the kernel's first sign of strain

**Cons**:
- a Mac hosting a VM sits at warning for hours; nothing heavy starts there

**Rejected because**: the owner found it too strict after it refused every
heavy job, Waypost's own `npm test` included, for over half an hour.

### macOS: overcommit as debt, total − (wired + anonymous + all compressed pages)

**Pros**:
- the strictest

**Cons**:
- below zero on the loaded Mac: while the agents live nothing heavy starts,
  even when their compressed memory is cold

**Rejected because**: the owner chose the pressure-level formula.

### Run the job in its own systemd scope

**Pros**:
- systemd-oomd, which ignores `oom_score_adj`, would not kill the harness's
  cgroup along with the job

**Cons**:
- `systemd-run --user --scope` is not everywhere; more moving parts

**Rejected because**: the owner chose `oom_score_adj` alone; revisit if the
next kill log shows systemd-oomd. **Revisited 2026-10-13 and taken into
Decision 5** for a reason this entry did not foresee: the 2026-09-27 kill log
shows the kernel OOM killer, and systemd's `DefaultOOMPolicy=stop` stopping
the scope the victim shared with the harness. "Not everywhere" is handled by
the probe: no user manager, no scope.

### A memory limit on the job's scope (`-p MemoryHigh=` / `MemoryMax=`)

**Pros**:
- an out-of-memory condition stays inside the job's scope, whatever the
  kernel would pick globally and whatever systemd-oomd does

**Cons**:
- a limit at the share kills or throttles builds that legitimately need more
  while memory is free; a limit at what was free at admission moves with
  every reading

**Rejected because**: the owner chose the scope and `oom_score_adj` without a
limit (2026-11-05).

### "No agents beside it" only when `waypost capacity` says the machine is small

**Rejected because**: the routing block has no budget left for a condition
(ADR-0008), and an agent would have to run `capacity` before every spawn.

### Only the rule, no rule, or "no new agents during it"

**Rejected because**: the rule alone leaves the harness as likely a victim as
the build; no rule leaves agents growing beside a job; "no new agents" does
not cover a build started while agents already run — the incident's likely
order.

## Consequences

**Positive**:
- the 3.8 GB VM refuses a heavy job below 1.9 GB available, with the memory
  reason
- a second job cannot be admitted into the first job's not-yet-allocated
  memory
- a Mac at warning with 2.7 GB available takes one 2 GB job, not two, and
  none under critical pressure
- on Linux a kernel OOM kill takes the build, and the session survives —
  verified on the VM under a systemd user manager by hand before the scope
  was in code; the code path itself awaits the run in Verification

**Negative / trade-offs**:
- with two jobs running, the reserve counts the first one's memory twice
- on a large machine, critic and reviewer wait for every build to finish
- at normal pressure macOS still counts inactive anonymous memory as
  available (4.0 GB on the loaded Mac when it read normal)
- mapped executables of running apps are file-backed and count as available
  under warning; reclaiming them costs page-ins
- a sandbox that refuses `vm_stat` gets the optimistic fallback
- systemd-oomd (on by default on desktop Ubuntu 22.04 and later) ignores
  `oom_score_adj` and kills whole cgroups by memory pressure; it may still
  pick the harness's scope, and then the job survives it
- the job leaves the cgroup of whoever started it: stopping the harness's
  unit, or a `MemoryMax=` set on it on purpose, no longer reaches the job
- a nested `run --heavy` puts its job in a sibling scope, outside the outer
  job's; every run creates two transient units in the journal (the probe and
  the job)
- when the scope probe fails, nothing says the protection is missing
- block v3 made `waypost doctor` report an issue in every project until
  `waypost agents register` was re-run; it is v4 since, within its ADR-0008
  budget

**What changes in code / process**:
- `scripts/capacity-admission.mjs`: `JOB_MEMORY_DIVISOR` 2, the holder
  reserve in `canStart`; `scripts/capacity-memory.mjs`: the pressure-level
  formula, the inactive-file subtraction; `scripts/capacity.mjs`: the
  critical-pressure reason, a record live while its job runs
- `bin/cli/run.mjs` `runHeavy`: `oom_score_adj` for the job only, the job's
  own scope, a missing command unwrapped; `bin/cli/slots.mjs` `recordJob`
- `templates/agents-block.md.tmpl`, `scripts/agents-registry.mjs`
  (`AGENT_BLOCK_VERSION`), `AGENTS.md`; `prompts/heavy.md` step 6
- tests: `tests/capacity.test.mjs` and `tests/capacity-memory.test.mjs` on
  the measured Mac and VM figures; `tests/slots.test.mjs` for the job's pid
  (any POSIX), `oom_score_adj` of job and wrapper, the real scope, and a
  stand-in `systemd-run` pinning the argv, the exit status and a missing
  command (Linux only, the stand-in with or without a user manager);
  `tests/harness.test.mjs` for the rule

## Verification

Before acceptance:
- on the Linux VM: `waypost capacity` refuses below 1.9 GB available; the
  `oom_score_adj` test passes there; read the 2026-09-27 kill log
  (`journalctl -k`, `journalctl -u systemd-oomd`) and record which killer it
  was;
- on the owner's Mac: sample `waypost capacity --json` over a working session
  at normal and warning pressure.

Linux VM, 2026-10-13 (Debian 13.6 arm64, 4 cores, now 5.9 GB RAM and 3.3 GB
swap, so the share is 2 GB, not 1.9):
- refusal — passes: with 3.6 GB held by another process, MemAvailable
  1.69 GB, `capacity --json` gave `can_start: 0`, "memory: 1.6 GB available, a
  heavy job needs 2.0 GB", and `run --heavy` exited 75; `can start 1` again
  once it was freed;
- `oom_score_adj` test — passes, `tests/slots.test.mjs` 69 of 69 on the VM,
  `tests/capacity.test.mjs` 62 of 62 (at 9231ade, before the scope was in
  code);
- the kill log — the kernel OOM killer; Context has the record;
- **`oom_score_adj` alone, Decision 5 as first written, did not deliver its
  consequence.** A real global OOM, driven
  twice from a stand-in harness scope (`systemd-run --user --scope`, holding
  a `sleep`): with the job started by `run --heavy` inside that scope, the
  kernel chose the job (`oom_score_adj:1000`), and systemd then failed the
  whole scope with `oom-kill` — harness dead, the wrapper with it. With the
  job in a scope of its own (`run --heavy -- systemd-run --user --scope …`),
  the job's scope failed, `run --heavy` reported exit 137, and the harness
  lived. `oom_score_adj` picks the victim; the cgroup the victim sits in
  decides what else systemd takes down. The rejected alternative "Run the
  job in its own systemd scope" is the one that keeps the session — for this
  reason, not systemd-oomd's.

Owner's Mac, 2026-11-05 (16 GB, 8 cores), 45 readings 20 s apart over 15
minutes while the Debian VM booted:
- normal (31 readings): 6.4 GB available falling to 3.5 as the VM came up;
  `can_start` 2 above 4 GB, 1 below;
- normal → warning at 19:52:49: available stepped from 3.46 GB (normal
  formula) to 2.54 GB (warning formula), `can_start` 1 — the switch works as
  decided;
- warning (14 readings): 2.80 to 1.98 GB; `can_start` 1 above 2 GB; five
  refusals, each naming the cores (0.0–1.9 idle while the VM booted), one of
  them with memory also below the share (1.98 GB) — cores are checked first;
- critical never occurred; swap 4.2–4.5 of 6 GB.

Linux VM, 2026-11-05, at 02d2e34 (Debian 13.6 arm64, kernel 6.12.115): no
one was logged in at the greeter, so the user manager was started by hand
(`systemctl start user@1000.service`, stopped afterwards) and the suite run
as that user with its `XDG_RUNTIME_DIR` — `systemd-run --user --scope`
reachable. `node --test tests/slots.test.mjs`: 75 of 75 pass, 0 skipped,
among them:
- the real scope — the job's cgroup is a `.scope` of its own, and the
  command's own exit status comes back;
- `oom_score_adj` — the job 1000, the wrapper its own value (0);
- the stand-in `systemd-run` — the scope argv, exit status 3 passed through,
  a missing command 127 and never wrapped;
- the job's own pid in the slot record while it runs;
- without `systemd-run` the job runs where it was started.

## Review history

- 2026-09-28, waypost-critic: accept after fixes — eight findings, each
  addressed in c5ebf4c.
- 2026-11-05, waypost-critic: accept after fixes — the wrapper itself became
  the OOM victim inside the harness's unit (fixed: the job alone gets 1000);
  the scope path unverified in code on Linux (stand-in test added, VM run
  pending); Waypost's own `team` peers outside the rule (separate story);
  stale text, `code_refs` and the title (fixed); a missing command exiting 1
  (fixed); "unreadable is stricter" (fixed: the minimum); systemd-oomd, the
  orphaned job (fixed: the job's pid in the record) and nested runs recorded
  in Consequences.

## References

- heavy-work-sized-to-the-machine-waypost-capacity-a-machine-wide-slot-and-a-rule-to-check-first,
  Decisions 1–3
- ADR-0001 (no hooks), ADR-0008 (token budget)
- XNU `doc/vm/memorystatus.md` (available pages), `kern_memorystatus_notify.c`
  (pressure levels); `system_cmds` `vm_stat.c` (page counts)

---

*Last updated: 2026-11-05*
