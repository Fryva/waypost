---
type: adr
id: "disk-space-for-heavy-work-a-free-space-floor-at-admission-idle-linked-worktrees-on-the-automatic-path"
title: "Disk space for heavy work: a free-space floor at admission, idle linked worktrees on the automatic path"
status: proposed
date: 2026-11-06
authors: ["Ivan Morozov"]
tags: []
external_refs: {}
supersedes: null
superseded_by: null
review_status: pending
reviewed_at: null
drafted_by: {"harness":"claude","provider":null,"date":"2026-11-06"}
code_refs: ["scripts/capacity-admission.mjs", "scripts/capacity.mjs", "bin/cli/capacity.mjs", "bin/cli/run.mjs", "bin/cli/slots.mjs", "bin/cli/clean.mjs", "bin/cli/size.mjs", "bin/cli/setup.mjs", "bin/cli/auto-clean.mjs", "bin/cli/help.mjs", "scripts/lib-machine-state.mjs", "tests/disk-floor.test.mjs", "scripts/cleanup-selection.mjs", "prompts/heavy.md", "docs/cli-reference.md", ".github/workflows/ci.yml", "tests/capacity-admission.test.mjs", "tests/capacity.test.mjs", "tests/cleanup.test.mjs", "tests/cleanup-selection.test.mjs", "tests/limit.test.mjs"]
related: "heavy-work-sized-to-the-machine-waypost-capacity-a-machine-wide-slot-and-a-rule-to-check-first, memory-for-heavy-work-half-the-memory-up-to-2-gb-macos-without-claimed-pages-no-new-agents-beside-a-job, cleanup-to-a-machine-wide-limit-set-by-the-owner-idle-artifacts-oldest-first, disk-hygiene-by-discovery-a-toolchain-registry-a-machine-and-project-profile-and-cleanup-only-after-a-yes"
guards: []
---

# Disk space for heavy work: a free-space floor at admission, idle linked worktrees on the automatic path

| Field | Value |
|---|---|
| **Status** | proposed |
| **Date** | 2026-11-06 |
| **Authors** | Ivan Morozov |

---

## Context

On 2026-11-06 the owner found the machine with under 8 GB free on a 460 GB
disk, heavy builds of tens of gigabytes still being admitted, and a cleanup
limit of 20 GB per project that had never held. Measured the same day:

- **Admission never looks at the disk.** `canStart` (heavy-work ADR,
  memory ADR) weighs slots, idle cores and memory. `waypost capacity`
  answered "can start 1 heavy job" with 14 GB free.
- **The limit ran and could not act.** The automatic cleanup log on this
  host holds 434 records; in all of them 3.6 GB was ever removed. The last
  run in P2PMessenger's main checkout counted 99.2 GB against 20 GB,
  `need` 77.8 GB, `renamed` 0, `stayed` 0: no item qualified.
- **The working set itself was over the limit under the 7-day rule.** Every tagged directory
  there (`target`, `target-check`, `target-tunnel`, `target-android*`),
  every child of each (triples, profiles), and every single file older
  than 7 days summed to 0 GB. Splitting a tagged directory into smaller
  units would free nothing; the 7-day rule (cleanup-limit ADR, Owner's decision 6 and Decision 3 "Idle")
  protects all of it, as that ADR's own trade-off says it would.
- **Linked worktrees escape the limit.** The main checkout's walk stops at
  a nested repository (`nested_skipped: 12`), and a linked worktree is
  cleaned only after a `run --heavy` inside it. Ten linked worktrees held
  63 GB; five of them, 12.8 GB, had not been written to for over 7 days
  and were never examined at all. Each linked worktree is also counted as
  its own project with its own 20 GB.

The two problems are distinct: the floor stops new damage whatever the
limit can do; the worktree change lets the limit reach output that is
already idle by its own rule.

## Owner's decisions (2026-11-06)

- The idle floor is 1 day instead of 7 (Decision 3).
- Disk admission is a system reserve of 30 GB plus 20 GB per job
  (Decision 1), each capped for small disks at 15 % and 20 % of the
  filesystem (confirmed by the owner, 2026-11-06).
- The owner may set the reserve and the share per machine, lowering them
  included, with `waypost capacity --disk <reserve>,<share>` (the owner,
  2026-11-06).
- The author's proposal, open to the owner's review: the cleanup on a disk
  refusal, the exempted commands, the env switches and Decision 2.

## What this amends in accepted ADRs

This replaces only the passages below; everything else in those ADRs
stands. On acceptance each gets an "Amended by" note pointing here.

- **cleanup-limit ADR**: Owner's decision 6 and Decision 3 "Idle" (7 days
  → 1 day), and the premise "the 7-day rule protects what they build" of
  Decision 4 and Alternative J; Alternative L, which rejected a 1- or
  3-day window, is now the owner's choice. Decision 4 "it runs under the
  slot the run still holds", "nothing else removes automatically" and
  Rationale 5 "no new trigger is needed" gain one exception: the cleanup
  on a disk refusal (Decision 1), which runs with no slot held because no
  job is about to run in that tree. Decision 2 below, once implemented,
  replaces Decision 1's "per project, N projects may hold N × the limit"
  with one limit per repository.
- **disk-hygiene ADR**: Owner's decision 1, "7 days for project
  artifacts" (`DEFAULT_PROJECT_STALE_DAYS`), becomes 1 day.
- **heavy-work ADR**: Decision 1's conditions (a)–(c) gain the disk
  dimension, and Decision 2's "exits at once" gains the one cleanup (up to
  its 60 s deadline, announced on stderr before it starts) and a wait of up
  to 30 s for that cleanup's deleter.

## Decision

1. **Free disk is an admission dimension.** `canStart`
   gains (d) disk, after (a) slots, (b) cores and (c) memory, named in
   that order in `reason`:
   - Free space is one `fs.statfsSync` reading of the job's working
     directory: `bavail × bsize` free of `blocks × bsize` total, read
     before the machine-wide slot lock, so a hung network mount cannot
     hold the lock.
   - The system keeps an untouchable **reserve**, the smaller of **30 GiB**
     and **15 %** of the filesystem: swap, OS updates and caches need it
     whatever Waypost runs (the owner, 2026-11-06).
   - On top of it a job needs a **share**, the smaller of **20 GiB** and
     **20 %** of the filesystem.
   - Each live holder reserves one share, as with memory: a job admitted
     seconds ago has not written its output yet.
     `byDisk = floor((free − reserve − holders × share) / share)`.
     On this 460 GB disk the first job starts at 50 GB free, a second
     beside it at 70 GB.
   - An unreadable figure counts as "cannot start", as memory does.
   - The reason names the free figure, the share and the next step:
     `disk: 48.0 GB free, a heavy job needs 50.0 GB free (30.0 GB system
     reserve + 20.0 GB for this job) — waypost clean, waypost size --global`.
   - `WAYPOST_DISK_SHARE_GB` may only **raise** the share, the same
     posture as `WAYPOST_HEAVY_MAX` only lowering the slot count; a smaller
     or invalid value changes nothing.
   - **The owner's setting.** `waypost capacity --disk <reserve>,<share>`
     (GB) replaces both default values on this machine, with no percentage
     cap; `--disk default` returns to the defaults, and `--disk` alone shows
     what is in force. It lives in the machine state directory,
     `disk-floor.<host>.json`; each value is 0–1 000 000 GB (the share at
     least 1), and a file outside that range reads as no setting. Raising
     either value works from anywhere; lowering either below what is in
     force (the nominal 30/20 when no setting exists), and `default` over
     an existing setting (the real defaults shrink with the disk), take the
     same gate as `clean --limit`: the owner's own terminal, no harness
     detected, a [y/N] that reads silence as no. An agent can make the
     floor stricter, never weaker. Every change is logged in
     `cleanup.<host>.jsonl` (`kind: "disk-floor"`, with what the harness
     check found).
   - `waypost capacity` prints the disk figure next to memory, and its
     JSON carries `disk: { free, total, share, reserve, path }`.
   - A `run --heavy` refused for a measured shortage (not for "free space
     unknown") says so on stderr, runs the automatic cleanup of its tree
     once, with no slot held, and asks again; when that cleanup renamed
     anything, it waits up to 30 s for the deleter before the final
     refusal. Without this a full disk refuses every job, and the cleanup
     that runs only after a job never runs at all. The cleanup frees what
     the owner's limit allows, not what the floor needs: with no limit set
     it frees nothing. The job's environment is restored after it
     (`WAYPOST_PROJECT_DIR`).
   - `WAYPOST_DISK_CHECK=off` is the owner's switch, like
     `WAYPOST_BESIDE_HEAVY=1`: CI sets it, because a hosted runner is
     disposable and has about 25–30 GB free, near the floor.
   - `waypost clean`, `size --global` and `setup --audit` take the slot
     without the disk dimension: they free or measure space, and a refusal
     that says "run `waypost clean`" must not refuse `waypost clean`.
2. **A repository is one project for the limit.** The automatic path at
   the end of `run --heavy` lists the repository's linked worktrees
   (`git worktree list --porcelain` against the common dir) and, after
   the job's own tree, walks each one with the same rules, under the same
   60 s deadline:
   - skipped: a worktree that is missing or `prunable`, on another
     filesystem than the common dir, a protected path, not local storage,
     overlapped by a live heavy-job holder, or overlapping the project
     root of a live session on any host;
   - counted together: a GB limit compares the sum over all trees with
     its value, so N worktrees no longer multiply it (an amendment of the
     cleanup-limit ADR's Decision 1, above);
   - picked oldest first across all trees, by the unchanged rule: tagged
     or `sure` output, git-ignored, no package inside, idle for
     max(1 day, `stale_days`), re-checked just before the rename;
   - renamed into the common dir's `waypost-removing/` and deleted by the
     same detached deleter;
   - the log record names each tree it walked and why it skipped one.
   The worktree itself, its sources and its branch are never touched:
   only build output inside it, by the same item rules as the main tree.

3. **The idle floor is 1 day, not 7** (the owner, 2026-11-06). It replaces
   the 7 days of the cleanup-limit ADR's Owner's decision 6 and the default
   `stale_days` of a project item, so `waypost clean` also calls output
   idle for over a day `should`. A registry entry's longer `stale_days`
   still wins. Measured the same day: on P2PMessenger this let the limit
   pick 50 GB (`target` idle 2 days, `target-tunnel`, `target-android*`)
   where the 7-day rule picked nothing; the first run renamed 46.5 GB and
   took the disk from 13.6 to 48 GB free.

Not decided here, and unchanged: generic names staying off the automatic
path, `free:<P>%` semantics.

**Implementation state (2026-11-06):** Decisions 1 and 3 are implemented;
Decision 2 (linked worktrees) is not yet.

## Rationale

1. **The disk is the resource that actually ran out.** Memory and cores
   recover when a job ends; a full disk breaks the job, the harness and
   every other session's writes, and does not recover on its own.
2. **A floor needs no estimate of the job's size.** Waypost cannot know
   how much a build will write. A share per job, reserved per holder,
   mirrors the memory rule the owner already accepted, so the two read
   the same way.
3. **A reserve under the share.** A share alone lets a job start at 20 GB
   free and write the disk to zero; the reserve is what the system keeps
   when a job uses its whole share. Caps keep a large disk from demanding
   161 GB free on this disk; the percentages keep a small VM from being locked out
   forever (a 40 GB disk: 6 GB reserve + 8 GB share).
4. **The worktree change reaches output nothing else reaches.** Item by
   item it uses the cleanup-limit ADR's rule; counting the repository as
   one project is new, and can pick idle output in a worktree that was
   under the limit on its own.
5. **Splitting tagged directories was measured and rejected** (below):
   on the very disk that prompted this, it frees 0 bytes.

## Alternatives Considered

### Split a tagged directory into its children, or sweep files by age

**Pros**: stale triples and profiles inside a hot `target` would go.
**Cons**: measured on P2PMessenger on 2026-11-06, every child and every
file was newer than 7 days.
**Rejected because**: it frees nothing on the case that prompted the ADR
and adds a registry concept; revisit if a measurement shows otherwise.

### Shorten the idle floor only while the disk is below the floor

**Pros**: keeps the week-long working set while the disk is roomy.
**Cons**: two rules to explain; a disk that hovers at the floor flips
between them.
**Rejected because**: the owner chose 1 day outright (Decision 3).

### A fixed floor (for example 10 GB) for any number of jobs

**Pros**: simplest.
**Cons**: two jobs admitted together each see the same free space and
both start; on a 30 GB disk it is a third of everything.
**Rejected because**: the per-holder reserve is the lesson of the memory
ADR, and a fixed value fits neither disk size.

### Stop or pause a running job when free space drops

**Pros**: catches a job that writes more than its share.
**Cons**: killing a build mid-write leaves a corrupt cache; Waypost does
not own the job's I/O.
**Rejected because**: admission plus cleanup is the boundary Waypost
already owns; deferred until there is evidence it is needed.

### Refuse for disk without cleaning

**Pros**: no removal outside the end of a job.
**Cons**: with the floor binding, no job runs, so the cleanup after a job
never runs either; the machine stays refused until a person cleans.
**Rejected because**: the cleanup at refusal is the same automatic path,
under the same rules, that the owner's limit already authorises.

## Consequences

**Positive**:
- No heavy job starts unless the system reserve stays free after every
  live job and this one use their whole share.
- Idle linked worktrees no longer accumulate output outside the limit
  (12.8 GB on this machine on 2026-11-06).
- A repository with N worktrees is held to one limit, not N.

**Negative / trade-offs**:
- A build idle for one day starts cold the next time: the 1-day floor
  trades rebuild time for disk, by the owner's choice.
- Right after a disk refusal's cleanup the deleter is still running, so
  the immediate retry can still refuse; the next attempt sees the space.
- `bavail` on APFS excludes purgeable space, so Finder may show more free
  space than the refusal names.
- The automatic path walks more trees inside the same 60 s deadline; a
  slow disk may reach the deadline before the last worktree, which the
  log records.
- The limit still cannot hold when the last day's working set exceeds
  it; the floor is what protects the disk then.

**What changes in code / process**:
- `scripts/capacity-admission.mjs`: the disk dimension in `canStart`.
- `scripts/capacity.mjs`: `measure()` reads `statfsSync` of the working
  directory (`WAYPOST_CAPACITY_PROBE` gains optional `free`/`disk_total`).
- `bin/cli/capacity.mjs`: the disk figure in text and JSON.
- `bin/cli/run.mjs`: the cleanup on a disk refusal; `bin/cli/slots.mjs`:
  `claimSlot(..., { disk: false })` for clean, size and setup.
- `scripts/cleanup-selection.mjs`: `DEFAULT_PROJECT_STALE_DAYS` 7 → 1.
- `bin/cli/auto-clean.mjs`: linked worktrees on the automatic path
  (planned).
- `prompts/heavy.md`: the refusal reason list names disk.

## Known limits

- The disk is the working directory's: a job writing elsewhere
  (`CARGO_TARGET_DIR`, DerivedData, `~/.gradle`, Docker) is admitted by a
  disk it does not fill, and the reserve is checked on that disk, not on
  the system volume when they differ.
- A share raised by `WAYPOST_DISK_SHARE_GB` is not written into the slot
  record, so the next admission reserves the default share for that job.
- On a checkout shared with a VM over a network mount, `statfs` reads the
  host's disk while the VM counts only its own holders.
- One day is seven times sooner for content inside a tagged directory that
  is not regenerable (`target/package`, benchmark baselines).
- Verification on Linux and Windows is still to be done, as for the memory
  ADR.

## References

- The cleanup log `~/.local/state/waypost/cleanup.MacBook-Pro-FroST.jsonl`
  and the measurements above, 2026-11-06.
- heavy-work-sized-to-the-machine-waypost-capacity-a-machine-wide-slot-and-a-rule-to-check-first
- memory-for-heavy-work-half-the-memory-up-to-2-gb-macos-without-claimed-pages-no-new-agents-beside-a-job
- cleanup-to-a-machine-wide-limit-set-by-the-owner-idle-artifacts-oldest-first

---

*Last updated: 2026-11-06*
