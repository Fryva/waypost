---
type: story
id: "story-waypost-capacity-the-machines-real-free-resources-measured-by-each-os"
epic: "WP-18"
title: "waypost capacity: the machine's real free resources, measured by each OS"
status: in-progress
priority: p1
assignee: "Ivan Morozov"
created: 2026-09-15
updated: 2026-09-15
external_refs: {}
tags: []
code_refs: ["scripts/capacity.mjs", "scripts/lib.mjs", "bin/waypost", "tests/capacity.test.mjs", "CHANGELOG.md"]
specs: []
started_at: "2026-09-15T03:14:34.602Z"
closed_at: null
plan_updated_at: "2026-09-15T03:14:34.602Z"
---

# waypost capacity: the machine's real free resources, measured by each OS

| Field | Value |
|---|---|
| **Epic** | [WP-18](../epic.md) |
| **Status** | in-progress |
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

- [ ] `scripts/lib.mjs`: `machineStateDir({ platform, env, home })`, as the
      disk-hygiene ADR defines it:
      - `$XDG_STATE_HOME/waypost` (default `~/.local/state/waypost`);
      - `~/Library/Application Support/Waypost`;
      - `%LOCALAPPDATA%\Waypost`.
- [ ] `scripts/capacity.mjs` (compute only, no writes):
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
- [ ] `canStart(...)`, with the owner's defaults: one slot per four cores,
      and a job share of a quarter of the cores and the smaller of 2 GB and a
      quarter of the memory. `WAYPOST_HEAVY_MAX` only lowers the slot count,
      and the reason names the binding limit.
- [ ] Every probe is injectable: platform, file reads (`/proc`, cgroup),
      `sysctl` and `vm_stat` output, the `os` functions. Tests never depend on
      the host.
- [ ] `bin/waypost capacity [--json]`: one human line. `--json` gives every
      figure, its probe, the holders, `can_start` and the reason.
- [ ] Tests for each acceptance criterion below.

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

- [ ] With injected macOS probes, available memory is
      `kern.memorystatus_level` × total. When the sysctl is refused, it is
      `vm_stat`'s free + inactive + speculative + purgeable pages.
      `os.freemem()` is never used on macOS while a probe works.
- [ ] With injected Linux probes, `MemAvailable` is capped by a cgroup v2 and
      by a v1 memory limit, and the cores by a cgroup CPU quota.
- [ ] With injected Windows probes, busy comes from two `os.cpus()` samples
      and memory from `os.freemem()`.
- [ ] `can_start` follows the ADR's rules (a), (b) and (c) with the owner's
      defaults, on a 2-core, an 8-core and a 32-core machine, idle and
      loaded. `WAYPOST_HEAVY_MAX` lowers it but never raises it, and the
      reason names the binding limit.
- [ ] `waypost capacity --json` on this machine returns every figure with
      its probe, well within a second.
- [ ] `npm test` is green at capped concurrency, and `waypost doctor` reports
      0 issues.

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

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
