---
type: story
id: "story-disk-admission-reads-every-filesystem-a-job-writes-to-not-only-the-working-directorys"
epic: "WP-18"
title: "Disk admission reads every filesystem a job writes to, not only the working directory's"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-15
updated: 2026-11-15
external_refs: {}
tags: []
code_refs: ["scripts/capacity.mjs", "scripts/capacity-admission.mjs", "scripts/presence-storage.mjs", "bin/cli/slots.mjs", "bin/cli/run.mjs", "bin/cli/capacity.mjs", "bin/cli/help.mjs", "docs/cli-reference.md", "prompts/heavy.md", "tests/capacity-admission.test.mjs", "tests/capacity.test.mjs", "tests/limit.test.mjs", "tests/capacity-memory.test.mjs", "tests/capacity-probes-boot.test.mjs", "tests/presence-storage.test.mjs"]
specs: []
started_at: "2026-11-15T18:51:08.569Z"
closed_at: "2026-11-15T19:49:12.791Z"
plan_updated_at: "2026-11-15T18:51:08.569Z"
---

# Disk admission reads every filesystem a job writes to, not only the working directory's

| Field | Value |
|---|---|
| **Epic** | [WP-18](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Implements the 2026-11-15 amendment to Decision 1 of the ADR "Disk space for
heavy work: a free-space floor at admission, idle linked worktrees on the
automatic path". Disk admission read only the working directory's
filesystem. On the owner's Debian VM the checkout lies on the Mac's disk
(102 GB free) while builds fill the VM's own root (24 GB free of 59), so
`waypost run --heavy` admitted jobs by a disk they do not fill.

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [x] `readDisks()` in `scripts/capacity.mjs`: roles and paths, nearest existing ancestor, `st_dev` dedup, skip rules (unreadable, non-local, tmpfs/ramfs) for additional paths only
- [x] `canStart` disk dimension over several filesystems: per-filesystem reserve and share (owner values capped off the working directory's), tightest by margin, reason with path and role
- [x] `measure()` / `claimSlot` read all before the lock; probe `disks`; JSON `disk` + `disks`; text line
- [x] `run --heavy`: refusal cleanup only for a shortage on the working directory's filesystem
- [x] help, `docs/cli-reference.md`; tests; live check on the Mac and the Debian VM

## Implementation Plan

1. `scripts/capacity.mjs`: `readDisks(dir, deps)` returns `[{role, path, free, total, error?}]` —
   the working directory first via the existing `readDisk` (NaN when unreadable), then `/`
   (`%SystemDrive%\\`), `os.homedir()`, `os.tmpdir()`, `CARGO_TARGET_DIR`, `CARGO_HOME`,
   `RUSTUP_HOME`, `GRADLE_USER_HOME`; nearest existing ancestor; same `st_dev` as an earlier
   entry → dropped; additional path skipped with `error` when unresolvable/unreadable,
   `storageOf(...).kind !== "local"`, or Linux `statfs.type` tmpfs/ramfs. `measure()` takes
   `readings` (array) and keeps `reading` (single) for callers and tests; the probe gains
   optional `disks`.
2. `scripts/capacity-admission.mjs`: `canStart({..., disks})` — per filesystem reserve/share
   (owner `floor` and `diskRaise` as written on the primary, capped at 15 %/20 % elsewhere),
   `byDisk` = min, tightest = smallest margin, reason `disk: X GB free at <path> (<role>), …`,
   advice `waypost size --global` alone when the tightest is not primary; returns
   `disk_primary_short`. A single `disk` keeps working as a one-entry list.
3. `bin/cli/slots.mjs`: read `readDisks(process.cwd())` before the lock; pass through;
   refusal carries `disk_primary_short`. `bin/cli/run.mjs`: cleanup only when it is true.
4. `bin/cli/capacity.mjs`: text names the tightest and the count; JSON `disks`.
5. Tests in `tests/capacity-admission.test.mjs`, `tests/capacity.test.mjs`,
   `tests/limit.test.mjs` (reason strings); help and `docs/cli-reference.md`.

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <path>#"<test title>" | <command> | <file>:<line> -->

- [x] On one filesystem (the Mac) the admission numbers are unchanged; the reason adds ` at <path> (working directory)` and JSON `disk` adds `role` (Decision 1); `disks` has one entry — evidence: tests/capacity-admission.test.mjs#"one filesystem keeps the old answer; disks has one entry" | tests/limit.test.mjs#"disk refusal: one automatic cleanup with no job behind it, then the refusal names the numbers; the job never runs"
- [x] Paths on one `st_dev` are read once; a missing `CARGO_TARGET_DIR` is read at its nearest existing ancestor — evidence: tests/capacity.test.mjs#"readDisks: one filesystem is read once; another is added; a missing path reads its nearest ancestor"
- [x] An unreadable, non-local or tmpfs additional path is skipped with `error`/reason in `disks` and never refuses; an unreadable working directory still refuses ("unknown"); a tmpfs working directory is still read — evidence: tests/capacity.test.mjs#"readDisks: an unreadable or non-local additional path is skipped with an error; the working directory is never skipped" | tests/capacity.test.mjs#"measure: a list of disks keeps skipped entries, binds on the tightest read one, and names it" | tests/capacity-admission.test.mjs#"an unknown working directory is cannot start; an unknown additional entry never reaches canStart"
- [x] The tightest filesystem (smallest margin) binds; the reason names its path and role, keeps the `disk: <digit>` prefix, and advises only `waypost size --global` when it is not the working directory's — evidence: tests/capacity-admission.test.mjs#"the tightest filesystem binds and the reason names it; no repository cleanup advice off the working directory"
- [x] Owner's `--disk` values and `WAYPOST_DISK_SHARE_GB` apply as written on the working directory's filesystem and are capped at 15 %/20 % elsewhere — evidence: tests/capacity-admission.test.mjs#"the owner's floor applies as written on the working directory's filesystem and is capped elsewhere"
- [x] `run --heavy` runs the refusal cleanup only when the working directory's filesystem is short; a shortage only elsewhere refuses at once — evidence: tests/limit.test.mjs#"disk refusal on another filesystem only: refused at once, no repository cleanup, advice is size --global" | tests/capacity-admission.test.mjs#"a shortage on the working directory's filesystem is primary even when another is tighter"
- [x] Live: `waypost capacity --json` on the Mac reads one filesystem; on the Debian VM it reads the VM root separately from the shared checkout — evidence: `waypost capacity` (2026-11-15: Mac "disk 96.4 of 460.4 GB free at /Users/frost/…/Waypost"; Debian VM "disk 23.7 of 58.5 GB free at / (system root, tightest of 2 filesystems, 1 skipped)", home deduped into /, /tmp tmpfs skipped)

## Final Summary

Disk admission now reads every filesystem a heavy job usually writes to — the working
directory, `/`, home, the temp directory and the cargo/gradle variables — once per
`st_dev`, skipping unreadable, network and tmpfs additional paths; the tightest
(smallest margin) binds and is named in the reason. The owner's floor applies as written
on the working directory's filesystem and capped at 15 %/20 % elsewhere; the refusal
cleanup runs only for a shortage on the working directory's filesystem. On macOS an
external `/Volumes` disk is read when its mount type is local. Critic (ADR) and reviewer
(diff) passes in fresh contexts; all findings fixed. Full `npm test` 2635/0 (10 skipped).
Risks: `statfsSync` on a hung working-directory mount still blocks (unchanged);
additional network paths are skipped, not timed out; the admission module is at
4895 of its 5000-byte budget. Follow-up: none required; `capacity | head -1` hits an
existing EPIPE on Node 20 (not from this change).

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-11-15*
