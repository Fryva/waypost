---
type: story
id: "story-waypost-capacity-the-machines-real-free-resources-measured-by-each-os"
epic: "WP-18"
title: "waypost capacity: the machine's real free resources, measured by each OS"
status: done
priority: p1
assignee: "Ivan Morozov"
created: 2026-09-15
updated: 2026-09-15
external_refs: {}
tags: []
code_refs: ["scripts/capacity.mjs", "scripts/lib.mjs", "bin/waypost", "tests/capacity.test.mjs", "CHANGELOG.md"]
specs: []
started_at: "2026-09-15T03:14:34.602Z"
closed_at: "2026-09-15T13:11:23.069Z"
plan_updated_at: "2026-09-15T03:14:34.602Z"
---

# waypost capacity: the machine's real free resources, measured by each OS

| Field | Value |
|---|---|
| **Epic** | [WP-18](../epic.md) |
| **Status** | done |
| **Priority** | p1 |
| **Assignee** | Ivan Morozov |

---

## Description

Decision 1 of the ADR
[Heavy work sized to the machine](../../../adr/heavy-work-sized-to-the-machine-waypost-capacity-a-machine-wide-slot-and-a-rule-to-check-first.md):
measure the machine now, with each OS's own means, and compute how many more
heavy jobs it can take. The holders come from the slot table of the next
story; until then there are none.

## Decomposition

- [x] `scripts/lib.mjs`: `machineStateDir({ platform, env, home })`, as the
      disk-hygiene ADR defines it:
      - `$XDG_STATE_HOME/waypost` (default `~/.local/state/waypost`);
      - `~/Library/Application Support/Waypost`;
      - `%LOCALAPPDATA%\Waypost`.
- [x] `scripts/capacity.mjs` (compute only, no writes):
      - **cores:** `os.availableParallelism()`, capped by the cgroup CPU
        quota;
      - **busy:** the load average, or on Windows two `os.cpus()` samples;
      - **available memory:**
        - macOS: `kern.memorystatus_level`, then `vm_stat`;
        - Linux: `MemAvailable`, capped by the cgroup v2 or v1 limit minus
          usage;
        - Windows: `os.freemem()`;
        - anything else: `os.freemem()`, as a lower bound.

      Each figure records the probe that produced it.
- [x] `canStart(...)`, with the owner's defaults: one slot per four cores,
      and a job share of a quarter of the cores and the smaller of 2 GB and a
      quarter of the memory. `WAYPOST_HEAVY_MAX` only lowers the slot count,
      and the reason names the binding limit.
- [x] Every probe is injectable: platform, file reads (`/proc`, cgroup),
      `sysctl` and `vm_stat` output, the `os` functions. Tests never depend on
      the host.
- [x] `bin/waypost capacity [--json]`: one human line. `--json` gives every
      figure, its probe, the holders, `can_start` and the reason.
- [x] Tests for each acceptance criterion below.

## Implementation Plan

Written by the lead on 2026-09-15, from the ADR and the patterns of
`scripts/sizes.mjs` and `handleSize`.

1. **`scripts/lib.mjs`:** `machineStateDir({ platform, env, home })`. It is
   pure, with no `mkdir`:
   - darwin: `<home>/Library/Application Support/Waypost`;
   - win32: `<LOCALAPPDATA or home/AppData/Local>/Waypost`;
   - otherwise: `<XDG_STATE_HOME or home/.local/state>/waypost`.
2. **`scripts/capacity.mjs`** (new, compute only). `bin/waypost` reaches it
   with a dynamic `import()`, as it reaches `sizes.mjs`. Every function takes
   its probes as parameters: `platform`, an `os`-like object, `readFile`, and
   `run(cmd, args)`, which executes without a shell and with a timeout.
   - `readCores`: `availableParallelism()`. On Linux it is capped by
     cgroup v2 `cpu.max` (`<quota> <period>`, or `max`), or by v1
     `cpu.cfs_quota_us` / `cpu.cfs_period_us`. A quota rounds up to whole
     cores.
   - `readBusy` (async):
     - macOS and Linux: `loadavg()[0]`;
     - win32: two `cpus()` snapshots about 250 ms apart, with the busy
       share × cores.
   - `readMemory`:
     - darwin: `sysctl -n kern.memorystatus_level` × total. If that fails,
       `vm_stat`: (free + inactive + speculative + purgeable) × the page size
       from its header line.
     - linux: `MemAvailable` from `/proc/meminfo`, capped by v2
       `memory.max` − `memory.current` unless the limit is `max`, or by v1
       `memory.limit_in_bytes` − `memory.usage_in_bytes`. A v1 limit above
       total memory means unlimited.
     - win32: `freemem()`.
     - anything else: `freemem()`, with the probe named as a lower bound.
   - `canStart({ cores, busy, available, total, holders, max })`:
     - slots = max(1, ⌊cores/4⌋), lowered by `WAYPOST_HEAVY_MAX` when that
       is a smaller positive integer;
     - one job's share is max(1, cores/4) cores and min(2 GiB, total/4) of
       memory;
     - `can_start` = min(slots − holders, ⌊(cores − busy) / job cores⌋,
       ⌊available / job memory⌋), never below 0;
     - `reason` names the first limit that binds.
   - `measure(probes)` returns `{ cores, busy, memory: { available, total },
     probes: { cores, busy, memory }, holders: 0, slots, can_start, reason }`.
     Holders come from the next story.
3. **`bin/waypost`:**
   - `case "capacity"` → `handleCapacity(rest)`, in `QUIET_COMMANDS` like
     `size`;
   - one human line: cores and load, available memory of total with its
     probe, and `can_start` with the reason when it is 0;
   - `--json` prints `measure()` as is;
   - a help line.
4. **`tests/capacity.test.mjs`:**
   - injected probes for macOS (the sysctl, then a refused sysctl falling
     back to `vm_stat`), Linux (cgroup v2 and v1, memory and CPU) and
     Windows (the `cpus()` sample);
   - a `canStart` matrix: 2, 8 and 32 cores, idle and loaded, with
     `WAYPOST_HEAVY_MAX`;
   - `machineStateDir` per OS;
   - one real `waypost capacity --json` on this host, for its shape and speed.
5. **Test runs:**
   - the new file alone while working;
   - the full suite once at the end, with `--test-concurrency=2`;
   - never alongside another heavy job.

## Acceptance Criteria

- [x] With injected macOS probes, available memory is
      `kern.memorystatus_level` × total. When the sysctl is refused, it is
      `vm_stat`'s free + inactive + speculative + purgeable pages.
      `os.freemem()` is never used on macOS while a probe works.
      — evidence: `tests/capacity.test.mjs:192`, `:201`, `:220`. On this Mac
      the forced `vm_stat` fallback gave 4.7 GB against 9.0 GB through the
      sysctl.
- [x] With injected Linux probes, `MemAvailable` is capped by a cgroup v2 and
      by a v1 memory limit, and the cores by a cgroup CPU quota.
      — evidence: `tests/capacity.test.mjs:94`, `:102`, `:109`, `:116`,
      `:126`, `:233`, `:245`, `:259`, `:271`
- [x] With injected Windows probes, busy comes from two `os.cpus()` samples
      and memory from `os.freemem()`.
      — evidence: `tests/capacity.test.mjs:150`, `:170`, `:289`
- [x] `can_start` follows the ADR's rules (a), (b) and (c) with the owner's
      defaults, on a 2-core, an 8-core and a 32-core machine, idle and
      loaded. `WAYPOST_HEAVY_MAX` lowers it but never raises it, and the
      reason names the binding limit.
      — evidence: `tests/capacity.test.mjs:308`–`:366` (the matrix), `:374`,
      `:381`, `:387` (`WAYPOST_HEAVY_MAX`), `:395`, `:402`, `:409`, `:416`
      (the edges)
- [x] `waypost capacity --json` on this machine returns every figure with
      its probe, well within a second.
      — evidence: `tests/capacity.test.mjs:465`, `:489`. `waypost capacity`
      ran in 0.14 s and printed "8 cores, load 2.80; 8.5 of 16.0 GB
      available (kern.memorystatus_level)".
- [x] `npm test` is green at capped concurrency, and `waypost doctor` reports
      0 issues.
      — evidence: `node --test --test-concurrency=2 tests/*.test.mjs` passed
      456/456 in 89 s, at load 2.5 with nothing else heavy running.
      `waypost doctor`: 0 issues, 0 warnings.

## Final Summary

Landed in b5676d9.

**What changed.**
- `scripts/capacity.mjs` (new, compute only):
  - `readCores`: `availableParallelism`, capped by a cgroup v2 `cpu.max` or
    v1 CFS quota, rounded up;
  - `readBusy`: the load average, or on Windows two `os.cpus()` samples
    250 ms apart;
  - `readMemory`:
    - macOS: `kern.memorystatus_level` × total, then `vm_stat`;
    - Linux: `MemAvailable` capped by cgroup v2 or v1 limits;
    - Windows: `os.freemem()`;
    - elsewhere: `os.freemem()`, as a lower bound;
  - `canStart`, with the owner's defaults; an unknown figure means "cannot
    start";
  - `measure`.

  Every probe is injectable. `sysctl` and `vm_stat` run through `spawnSync`
  without a shell and with a 2-second timeout.
- `scripts/lib.mjs`: `machineStateDir`, pure.
- `bin/waypost capacity [--json]`, a help line, and a `CHANGELOG.md` entry.

**Why.** After the freeze of 2026-09-14 the owner ruled that Waypost always
takes the machine's real free resources into account, on every machine (ADR
Decision 1).

**Tests executed.**
- `tests/capacity.test.mjs`: 46/46.
- The full suite, run once at `--test-concurrency=2`: 456/456 in 89 s, at
  load 2.5.
- `node --check`.
- `waypost doctor`: 0 issues, 0 warnings.

On this Mac, available memory reads 8.5 of 16 GB by `kern.memorystatus_level`,
4.7 GB by the `vm_stat` fallback, and 0.2 GB by `os.freemem()`.

**Review.**
- Lead review of the diff:
  - only the four expected files changed;
  - nothing writes, spawns a shell or touches the network;
  - the WP-17 stash is untouched.
- `waypost-reviewer` found all six criteria met. Its should-fix (a zero total
  made `canStart` return NaN) and its nit (tests for the edge cases) are
  fixed.

**Risks and follow-ups.**
- The `vm_stat` fallback is conservative, 4.7 against 9.0 GB here, because it
  leaves out compressible memory.
- Holders stay at 0 until the slot table arrives in the next story.
- The probes are verified on macOS only. The Linux and Windows runs belong to
  the verification story.

## Technical Notes

- Compute only. Each probe is one cheap call: a sysctl, a file read, or a
  short CPU sample on Windows. Nothing is cached.
- The owner's rule applies to this work itself: one heavy job at a time.
  Tests run per file or with `node --test --test-concurrency=2`, never as two
  full suites at once.

## Dependencies

- The ADR above, approved.

## Attachments

-

---

*Last updated: 2026-09-15*
