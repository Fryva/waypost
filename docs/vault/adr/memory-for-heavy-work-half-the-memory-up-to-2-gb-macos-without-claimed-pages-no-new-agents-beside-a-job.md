---
type: adr
id: "memory-for-heavy-work-half-the-memory-up-to-2-gb-macos-without-claimed-pages-no-new-agents-beside-a-job"
title: "Memory for heavy work: half the memory up to 2 GB, macOS without claimed pages, no agents beside a job"
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
code_refs: ["scripts/capacity.mjs", "bin/waypost", "tests/capacity.test.mjs", "tests/slots.test.mjs", "templates/agents-block.md.tmpl", "scripts/agents.mjs", "prompts/heavy.md", "tests/harness.test.mjs", "AGENTS.md"]
related: "heavy-work-sized-to-the-machine-waypost-capacity-a-machine-wide-slot-and-a-rule-to-check-first, ADR-0001, ADR-0008"
guards: [{"require": "no agents beside it", "in": "AGENTS.md", "why": "the routing block keeps background agents and a heavy job from running side by side, in either order"}]
---

# Memory for heavy work: half the memory up to 2 GB, macOS without claimed pages, no agents beside a job

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

Not recorded, and not recoverable here (the VM was shut down before the
journal was read): the kill log — the kernel OOM killer or systemd-oomd —
MemAvailable at admission, which agents started before the build and which
after, and the build's peak memory.

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
acceptance, the replaced passages there get an "Amended by" note, as its
Decision 3 already carries one.

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
   - warning, or the level unreadable: free + file-backed + purgeable — what
     a job can take without squeezing a running process. This is XNU's own
     definition of available pages off macOS, and Activity Monitor's Free +
     Cached Files;
   - critical: 0, and the refusal reason says "memory pressure critical".
   - When `vm_stat` fails or lacks a count: `kern.memorystatus_level` ×
     total, labelled an upper bound; then `os.freemem()`, a lower bound.
4. **Linux cgroups:** a limit's usage excludes inactive file pages
   (`inactive_file` in v2 `memory.stat`, `total_inactive_file` in v1), as the
   kubelet computes a working set. Page cache left by a clone or an install
   does not refuse a job forever.
5. **Linux: the job is the OOM killer's first choice.** `waypost run
   --heavy` raises `/proc/self/oom_score_adj` to 1000 before it spawns the
   job; the job and everything it starts inherit it. Raising needs no
   privilege. If memory runs out anyway, the build dies, not the harness.
6. **No agents beside a heavy job, in either order.** The routing block's
   rule becomes "Heavy work: `waypost run --heavy -- <cmd>`; no agents beside
   it." (block v3). `prompts/heavy.md` step 6 gives the reason: let the
   agents finish, then start the job, or the other way round; check
   `waypost capacity` before launching several agents at all.

## Rationale

1. Half the memory up to 2 GB matches the one figure there is for heavy work
   on a small machine: the VM agent's manual 2 GB after the crash. The 2 GB
   cap leaves large machines as they were.
2. A reserve is the only way admission can see a job that has not allocated
   yet; slots already stop two jobs in one minute on cores, not on memory.
3. At normal pressure the kernel gives up inactive memory before anything
   else, so the looser formula keeps an unloaded Mac — an 8 GB one with a
   browser and an IDE — from being refused for nothing. Under warning, memory
   claimed by live processes is no longer free for a new job. Only critical
   overrides the pages: the owner's Mac hosting a VM sat at warning for over
   half an hour with 2.6 GB reclaimable, and zeroing at warning refused all
   heavy work there — too strict, the owner said.
4. Waypost cannot see or stop what a harness spawns (ADR-0001: no hooks),
   but it is the job's parent: it can make sure the job, not the harness, is
   what the OOM killer takes. What remains — agents started beside a job —
   only the rule each agent reads every turn reaches, which is why it goes
   into the routing block and not only into `prompts/heavy.md`.

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
next kill log shows systemd-oomd.

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
- on Linux an OOM kill takes the build, and the session survives

**Negative / trade-offs**:
- with two jobs running, the reserve counts the first one's memory twice
- on a large machine, critic and reviewer wait for every build to finish
- at normal pressure macOS still counts inactive anonymous memory as
  available (4.0 GB on the loaded Mac when it read normal)
- mapped executables of running apps are file-backed and count as available
  under warning; reclaiming them costs page-ins
- a sandbox that refuses `vm_stat` gets the optimistic fallback
- systemd-oomd ignores `oom_score_adj`
- the routing block is 1394 of its 1400 characters (ADR-0008); the budget
  note in the parent ADR ("about 20 characters") is now 6; block v3 makes
  `waypost doctor` report an issue in every project until `waypost agents
  register` is re-run
- the feature-sized definition in the block reads "about to change several
  files" (was "about to write across several files") to fit the budget

**What changes in code / process**:
- `scripts/capacity.mjs`: `JOB_MEMORY_DIVISOR` 2, the holder reserve in
  `canStart`, the pressure-level formula, the inactive-file subtraction, the
  critical-pressure reason
- `bin/waypost` `runHeavy`: `oom_score_adj` on Linux
- `templates/agents-block.md.tmpl`, `AGENT_BLOCK_VERSION` 3, `AGENTS.md`;
  `prompts/heavy.md` step 6
- tests: `tests/capacity.test.mjs` on the measured Mac and VM figures,
  `tests/slots.test.mjs` for `oom_score_adj` (Linux only),
  `tests/harness.test.mjs` for the rule

## Verification

Before acceptance:
- on the Linux VM: `waypost capacity` refuses below 1.9 GB available; the
  `oom_score_adj` test passes there; read the 2026-09-27 kill log
  (`journalctl -k`, `journalctl -u systemd-oomd`) and record which killer it
  was;
- on the owner's Mac: sample `waypost capacity --json` over a working session
  at normal and warning pressure.

## References

- heavy-work-sized-to-the-machine-waypost-capacity-a-machine-wide-slot-and-a-rule-to-check-first,
  Decisions 1–3
- ADR-0001 (no hooks), ADR-0008 (token budget)
- XNU `doc/vm/memorystatus.md` (available pages), `kern_memorystatus_notify.c`
  (pressure levels); `system_cmds` `vm_stat.c` (page counts)

---

*Last updated: 2026-09-28*
