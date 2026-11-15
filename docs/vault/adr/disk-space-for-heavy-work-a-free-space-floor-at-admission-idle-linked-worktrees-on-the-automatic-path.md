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
  refusal, the exempted commands, the env switches and Decision 2. These
  are **already implemented and running** on main and on this machine
  (Decision 2 since 2026-11-06, 61 automatic runs walking 11–12 worktrees
  each; 23 cleanups on a disk refusal), ahead of this review and without a
  story. Decision 2 cannot be switched off alone, only with the whole
  automatic cleanup (`clean --limit off`). If the owner declines it, the
  way back is a code revert (`b25c306`), not a text change; the owner's
  explicit decision on Decision 2 is therefore a separate item of the
  acceptance.

## What this amends in accepted ADRs

This replaces only the passages below; everything else in those ADRs
stands. On acceptance each gets an "Amended by" note pointing here.

- **cleanup-limit ADR**: Owner's decision 6 and Decision 3 "Idle" (7 days
  → 1 day), and the premise "the 7-day rule protects what they build" of
  Decision 4 and Alternative J; Alternative L, which rejected a 1- or
  3-day window, is now the owner's choice. Decision 4 "it runs under the
  slot the run still holds", "nothing else removes automatically" and
  Rationale 5 "no new trigger is needed" gain one exception: the cleanup
  on a disk refusal (Decision 1), which runs with no slot held (the refused
  job has none yet; it starts in this same tree right after the cleanup).
  Decision 2 below replaces Decision 1's
  "per project, N projects may hold N × the limit" with one limit per
  repository, and reverses the answer to the first critic pass's blocker
  "automatic removal could reach nested worktrees" (a nested worktree was
  never entered): idle output inside a nested or linked worktree is now
  removed by the same item rules. Decision 4's "`waypost clean` shows which
  items the limit would pick" now holds for the job's own tree only
  (Known limits).
- **WP-17 story "The machine-wide limit: automatic cleanup at the end of a
  heavy run"**: the acceptance criterion "A nested worktree inside the root
  is never entered or removed" holds for the walk of one tree only; the
  automatic path walks every work tree of the repository.
- **disk-hygiene ADR**: Owner's decision 1, "7 days for project
  artifacts" (`DEFAULT_PROJECT_STALE_DAYS`), becomes 1 day.
- **heavy-work ADR**: Decision 1's conditions (a)–(c) gain the disk
  dimension, and Decision 2's "exits at once" gains the one cleanup (up to
  its 60 s deadline, announced on stderr before it starts) and a wait of up
  to 30 s for that cleanup's deleter. Also affected: its promise to say why
  at once and never block an agent past its harness's timeout, "a small CI
  container is not refused forever" (CI now needs `WAYPOST_DISK_CHECK=off`)
  and "refuses new heavy work at once" in the consequences.
- **Every other mention of the 7-day rule** in the cleanup-limit ADR (its
  Rationale 2 "protecting everything used within 7 days", the "built in the
  last week keeps its incremental cache" passage and the working-set
  discussion of Alternatives J and L), and in the disk-hygiene ADR the
  Decision 4 default "7 for project artifacts" (not only its Owner's
  decision 1), read as 1 day.
- **cleanup-limit ADR, the walk and the session checks**: "the walk never
  enters a directory that holds `.git`" holds for the tree being walked;
  the other work trees are walked as separate trees. Alternative J's
  rejection of blocking on live sessions of the same host is reversed for
  the other trees (a live session over a tree skips it). The `free:<P>%`
  exception "except the one being built" now also counts the other work
  trees, and the shared-checkout check (`sharedTree`) still covers the
  job's own tree only.
- **WP-17 story "The machine-wide limit…"**: besides the nested-worktree
  criterion, its criterion that output used within 7 days "is left whole"
  (proof: three items 2 days idle) no longer holds; `tests/limit.test.mjs`
  (idle 12 hours) is the current proof. On acceptance the story gets an
  "Amended by" note, not a rewrite.

## Decision

1. **Free disk is an admission dimension.** `canStart`
   gains (d) disk, after (a) slots, (b) cores and (c) memory, named in
   that order in `reason`:
   - Free space is read with `fs.statfsSync` (`bavail × bsize` free of
     `blocks × bsize` total) on **every filesystem a job usually writes
     to** (amended 2026-11-15, the owner: the working directory alone
     missed the disk a VM's build fills when its checkout lies on the
     host's disk, and a `CARGO_TARGET_DIR` on another volume):
     - the **working directory** — always read, even on `tmpfs`; an
       unreadable reading counts as "cannot start", as memory does;
     - the **system root** (`/`; `%SystemDrive%\` on Windows), the **home
       directory**, the **temporary directory**, and `CARGO_TARGET_DIR`,
       `CARGO_HOME`, `RUSTUP_HOME` and `GRADLE_USER_HOME` when set — a path
       that does not exist yet is read at its nearest existing ancestor.
       Such an additional path is **skipped**, with its error recorded,
       when it cannot be resolved or read, when it is not local storage
       (`storageOf`: a network or cloud mount), or when it is RAM-backed
       (`tmpfs`, `ramfs`; detected on Linux only). It never refuses a job
       by being unreadable.
     - Paths on one filesystem (the same `st_dev`) are read once, under the
       first path's role. On the owner's Mac every path is one volume, so
       admission reads one filesystem, as before.
     - All readings happen before the machine-wide slot lock.
   - The reserve, the share and the holders' shares below are checked on
     each filesystem read, with its own size; `byDisk` is the smallest
     result. The **tightest** filesystem is the one with the smallest
     margin in bytes (`free − reserve − (holders + 1) × share`); it is the
     one the reason, `disk` in JSON and the refusal cleanup speak about.
     Each holder reserves a share on every filesystem, including those it
     does not write to — strict on purpose, as memory is.
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
   - The reason names the free figure, the filesystem by its first path and
     role, the share and the next step:
     `disk: 48.0 GB free at /Users/frost/… (working directory), a heavy job
     needs 50.0 GB free (30.0 GB system reserve + 20.0 GB for this job) —
     waypost clean, waypost size --global`. The `disk: <digit>` prefix is
     kept. When the tightest filesystem is not the working directory's, the
     next step is `waypost size --global` alone.
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
     JSON carries `disk: { free, total, share, reserve, path }` for the
     tightest filesystem and `disks: [...]` with the same fields plus
     `role` (and `error` for a skipped path) for each one read.
   - The owner's setting and `WAYPOST_DISK_SHARE_GB` apply to the working
     directory's filesystem as written. On every other filesystem they are
     capped at 15 % and 20 % of its size, as the defaults are, so a small
     volume under `CARGO_TARGET_DIR` never refuses every job.
   - A `run --heavy` refused for a measured shortage on the **working
     directory's filesystem** (not for "free space unknown"; a shortage
     there triggers it even when another filesystem is tighter) says so on
     stderr, runs the automatic cleanup of its repository (Decision 2) once, with no slot held, and asks again; when that cleanup renamed
     anything, it waits up to 30 s for the deleter before the final
     refusal. Without this a full disk refuses every job, and the cleanup
     that runs only after a job never runs at all. The cleanup frees what
     the owner's limit allows, not what the floor needs: with no limit set
     it frees nothing. The job's environment is restored after it
     (`WAYPOST_PROJECT_DIR`). A shortage only on another filesystem is
     refused at once: the repository's cleanup frees nothing there.
   - `WAYPOST_DISK_CHECK=off` is the owner's switch, like
     `WAYPOST_BESIDE_HEAVY=1`: CI sets it, because a hosted runner is
     disposable and has about 25–30 GB free, near the floor. Unlike
     `WAYPOST_BESIDE_HEAVY=1` it is **not** announced by `run --heavy`, is
     not in the slot record and is not named in `prompts/heavy.md` (reviewed
     2026-11-07), and any environment can set it, so "an agent can make the
     floor stricter, never weaker" holds for `--disk` only. Closing that
     gap — a stderr line, a slot-record field, a line in `prompts/heavy.md`
     — is required before acceptance or accepted as a known limit by the
     owner.
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

**Implementation state (2026-11-06):** Decisions 1, 2 and 3 are
implemented (the several-filesystems amendment of 2026-11-15 to Decision 1
is not yet). Two readings fixed while implementing Decision 2: "the
repository's linked worktrees" means every work tree but the job's own, so
a job in a linked worktree walks the main one too; and a live session
"overlaps" a worktree when its project root is that tree or lies inside it
— a session rooted in the main checkout, an ancestor of a nested worktree,
works on its own tree, whose walk already stops short of the worktree —
unless it holds a live lease, which then skips the worktree (Known limits).
`locked` worktrees are walked: git's lock guards against `prune`, not
against removing ignored build output.

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
  directory (`WAYPOST_CAPACITY_PROBE` gains optional `free`/`disk_total`);
  from the 2026-11-15 amendment, of every filesystem in Decision 1, and the
  probe gains an optional `disks` list.
- `bin/cli/capacity.mjs`: the disk figure in text and JSON.
- `bin/cli/run.mjs`: the cleanup on a disk refusal; `bin/cli/slots.mjs`:
  `claimSlot(..., { disk: false })` for clean, size and setup.
- `scripts/cleanup-selection.mjs`: `DEFAULT_PROJECT_STALE_DAYS` 7 → 1.
- `bin/cli/auto-clean.mjs`: linked worktrees on the automatic path;
  the log record carries `trees` (each walked or skipped, with why).
- `prompts/heavy.md`: the refusal reason list names disk.

## Known limits

- `waypost clean` previews the limit's picks (`<- limit`) for the tree it
  runs in only: with several work trees the automatic path can pick items
  the preview does not mark, and an item the manual plan shows as `keep —
  inside a nested repository` (a nested worktree) can be removed by the
  automatic path.
- The limit's `counted` total covers the trees actually walked; a tree
  skipped (a live session, the deadline) is not counted, so the limit is
  under-, never over-, enforced then.
- The other work trees' walks get two thirds of the time left before the
  60 s deadline, the rest stays for the re-checks and renames; a tree the
  walk did not reach is recorded as `deadline` and its items wait for the
  next run.
- A lease key is relative to its holder's root and is matched against
  item keys computed from the job's root, so it may not match an item in
  another work tree; a live session whose root lies above such a tree and
  that holds any lease therefore skips that tree whole. A lease by a
  session unrelated to the tree is still not matched there (the same limit
  as before Decision 2).

- Only the usual places are read (Decision 1): a job writing to another
  path (a Docker data root, a build directory set in its own config, an
  external drive) is still admitted by disks it does not fill. DerivedData
  and `~/.gradle` live under the home directory and are covered.
- `statfsSync` is synchronous: a hung network mount as the **working
  directory** still hangs admission, as before; additional paths on network
  mounts are skipped by `storageOf`, not timed out.
- A network home reads the export's free space, not the user's quota; a VM
  or WSL2 virtual disk reads its virtual size, not the host's free space.
- A shortage on a filesystem other than the working directory's has no
  automatic cleanup: the refusal points at `waypost size --global`.
- A share raised by `WAYPOST_DISK_SHARE_GB` is not written into the slot
  record, so the next admission reserves the default share for that job.
- On a checkout shared with a VM over a network mount, the working
  directory's reading is the host's disk while the VM counts only its own
  holders; the VM's own disk is now read through `/` and its home
  (2026-11-15: Debian VM, checkout on the Mac's disk with 102 GB free, VM
  root 24 GB free of 59; Debian 13 `/tmp` is `tmpfs` and is skipped).
- One day is seven times sooner for content inside a tagged directory that
  is not regenerable (`target/package`, benchmark baselines).
- Verification on Linux and Windows is still to be done, as for the memory
  ADR.

Found by the critic pass of 2026-11-07 (not yet fixed in code):

- **Sessions on the owner's VMs are not recognised.** "A live session on any
  host" compares `project_root` as a local real path; a VM reports
  `/media/psf/…` or `Y:\…`, which never matches `/Users/…`, and a VM's heavy
  jobs are not in this machine's slot table. Build output in any worktree
  idle for over a day is removed with no skip while a VM session works
  there. Without a bound vault there is no session check at all (the log
  carries a note). Fix options: match sessions of other hosts by the common
  dir and the offset inside the repository (as `vault_rel`), or skip a tree
  while any other host's session is live in the repository.
- **The refusal's advice points the wrong way**: the log text "raise it:
  `waypost clean --limit <N>`" on a disk refusal would free less. An item
  can also stay `keep` for other reasons (10 minutes old, a running tool, a
  lease, a partial read) and the log does not say which.
- **Holders of commands exempt from the disk check still reserve a share**:
  while `waypost size --global` runs, every `run --heavy` needs 20 GiB more.
- **`--disk` is labelled "owner's setting" even when an agent raised it**,
  the file records no gate kind, and a raise up to 1 000 000 GB can shut
  heavy work until the owner returns; `brief`, `status` and `doctor` do not
  show it. Checking reserve + share ≤ total is open.
- **The 60 s deadline is soft**: the re-check before a rename measures an
  item without the deadline, and the 30 s deleter wait comes on top.
- **Refusal cleanups are not rate-limited**: of 23, only the first renamed
  anything (46.55 GiB); the other 22 spent 0.3–8 s each. Taking the job's own
  tree last on that path would keep the refused job's warm cache.
- **Units**: "GB" in this text and in messages means GiB; a "460 GB" disk
  is 460 GiB (about 494 GB in Finder).
- **Tool-running rule is machine-wide**: a running ecosystem tool keeps all
  of that ecosystem's output, and the ecosystem is detected from manifests at
  the root, so in a repository with a root `Cargo.toml` any cargo process on
  the machine can make the refusal cleanup empty. Not measured here.
- **No way to exempt one worktree** (`locked` ones are walked on purpose); a
  release or benchmark worktree has no protection other than a lease.
- **Not covered by tests**: the 30 s deleter wait, restoring
  `WAYPOST_PROJECT_DIR` when the job starts after the cleanup, skipping a
  tree on another filesystem / protected / non-local / past the deadline, a
  session of another host in a foreign tree.

Not considered, open to the owner: removing merged worktrees whole, and a
build cache shared between worktrees (the cause on this machine is twelve
agent worktrees, each with its own full build output).

## References

- The cleanup log `~/.local/state/waypost/cleanup.MacBook-Pro-FroST.jsonl`
  and the measurements above, 2026-11-06.
- heavy-work-sized-to-the-machine-waypost-capacity-a-machine-wide-slot-and-a-rule-to-check-first
- memory-for-heavy-work-half-the-memory-up-to-2-gb-macos-without-claimed-pages-no-new-agents-beside-a-job
- cleanup-to-a-machine-wide-limit-set-by-the-owner-idle-artifacts-oldest-first

## Review history

- 2026-11-07, fresh-context `waypost-critic`: verdict **accept with fixes**,
  no blockers. Focused tests 19/19 and 9/9, `waypost doctor` 0 issues.
  Four important findings (the incomplete amends list, sessions of other
  hosts, the silent `WAYPOST_DISK_CHECK=off`, Decision 2 running before its
  review) are recorded in the amends list, Decision 1 and Known limits
  above; the text was corrected, **code is unchanged**. Still open before
  acceptance: the owner's explicit decision on Decision 2, a story with
  acceptance criteria and a `waypost-reviewer` pass over the code, and the
  `review_status` change (`acceptance_gate` is on).
- 2026-11-15, the owner: Decision 1 amended — free space is read on every
  filesystem a job usually writes to, not only the working directory's
  (found on the Debian VM, where the checkout is the Mac's disk).
- 2026-11-15, fresh-context `waypost-critic` on the amendment: **revise**,
  no blockers. Seven findings, all taken: the refusal cleanup only for a
  shortage on the working directory's filesystem; an unreadable or
  non-local additional path is skipped, not refusing; the owner's absolute
  values capped by percentage off the working directory's filesystem; the
  system root added; the reason names the filesystem, the tightest is the
  smallest margin; stale text marked; the working directory is never
  skipped as `tmpfs`. `CARGO_HOME`/`RUSTUP_HOME` added; quota and virtual
  disks recorded in Known limits. Code not yet changed.

---

*Last updated: 2026-11-15*
