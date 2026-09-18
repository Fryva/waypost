---
type: adr
id: "cleanup-to-a-machine-wide-limit-set-by-the-owner-idle-artifacts-oldest-first"
title: "Cleanup to a machine-wide limit: set by the owner, idle artifacts oldest first"
status: accepted
date: 2026-09-18
authors: ["Ivan Morozov"]
tags: []
external_refs: {}
supersedes: null
superseded_by: null
review_status: reviewed
reviewed_at: 2026-09-18
drafted_by: {"harness":"claude","provider":null,"date":"2026-09-18"}
code_refs: ["scripts/cleanup.mjs", "scripts/sizes.mjs", "scripts/capacity.mjs", "scripts/presence.mjs", "scripts/agents.mjs", "scripts/doctor.mjs", "toolchains/system.json", "toolchains/generic.json", "toolchains/terraform.json", "scripts/toolchains.mjs", "bin/waypost", "docs/toolchains.md", "tests/cleanup.test.mjs"]
related: "disk-hygiene-by-discovery-a-toolchain-registry-a-machine-and-project-profile-and-cleanup-only-after-a-yes, heavy-work-sized-to-the-machine-waypost-capacity-a-machine-wide-slot-and-a-rule-to-check-first, ADR-0001, ADR-0006, ADR-0007, ADR-0010, ADR-0011"
guards: []
---

# Cleanup to a machine-wide limit: set by the owner, idle artifacts oldest first

| Field | Value |
|---|---|
| **Status** | accepted |
| **Date** | 2026-09-18 |
| **Authors** | Ivan Morozov |

---

## Context

The accepted ADR [Disk hygiene by discovery](disk-hygiene-by-discovery-a-toolchain-registry-a-machine-and-project-profile-and-cleanup-only-after-a-yes.md)
decides how build output is found, classified and removed. Its
`waypost clean` story is still planned, so nothing below changes shipped
behaviour. This ADR revisits three of its decisions:

- **Decision 4** makes *any* regenerable project artifact `should` while the
  project exceeds its limit. Applied, that removes the whole project's
  build output at once, the incremental cache included.
- **Decision 5** asks for a yes before every removal.
- **Decision 7** takes the limit from vault policy
  (`build_artifacts_limit_gb`, default 5) or from `WAYPOST_BUILD_LIMIT_GB`.

The owner's requests of 2026-09-18:

1. A command to choose when temporary build output is removed. The owner
   first asked for a time cadence. The same day they replaced it with a
   size limit chosen from a few options: 5 GB (today's value), larger
   amounts, and "keep 30 % of the disk free", because an SSD should keep
   30 % of its capacity free.
2. The pain behind it: removing *all* artifacts forces a from-scratch
   rebuild of a large native core, several times slower than an
   incremental one. The owner's global agent rule "clean the build after
   every task" did exactly that; with their approval it was rewritten the
   same day to "the Waypost limit cleans".
3. Over the limit, cleanup happens by itself, with no yes each time.
4. One setting for the whole machine.
5. Only project build output is cleaned; machine caches stay manual.

Three facts about the owner's own monorepo shaped the design:

- Its Cargo output is already split by `.gitignore` into separate top-level
  directories, one per platform family: `target/`, `target-tunnel/`,
  `target-check/`, `target-android/`, `target-android-host/`. Each is
  one item of the scan, tagged with `CACHEDIR.TAG`.
- Its Apple build runs six triples one after another in one heavy run.
  Four of them share `target/release` as their host directory, for build
  scripts and proc-macros; the two tunnel triples share
  `target-tunnel/release`.
- Its git-ignored `build/` holds the signed, notarized installer and its
  `.xcarchive` with the dSYMs. Android modules' `build/` holds the R8
  mapping of a shipped release. Both are kept on purpose and are rarely
  rewritten.

## Decision

1. **One limit per machine.** `waypost clean --limit <choice>`:
   - `5`, `10`, `20`, `50` or any positive number: gigabytes of build
     output **per project**, so N projects may together hold N × the limit;
   - `free:30%`: keep at least 30 % of the disk free. Any `free:<P>%` with
     P from 5 to 50 is accepted, and 30 is the choice on offer;
   - `off`: no automatic cleanup.

   Without a value, the command prints the current setting and the choices.
   The setting is stored in the machine state directory (disk-hygiene ADR,
   Decision 2) as `cleanup-limit.<host>.json`: the limit, when it was set,
   and how the gate in Decision 2 saw the caller. A renamed host reads as
   "no limit", so nothing is removed.

   Vault policy `build_artifacts_limit_gb` is dropped: a limit stored in the
   vault would travel to every clone and override the owner's machine
   choice. `WAYPOST_BUILD_LIMIT_GB` stays, only as the GB threshold for
   `doctor`/`next` warnings (in CI, for example). When it is set it takes
   precedence there, in every mode. It never enables automatic removal and
   never changes what the automatic path removes.

2. **Setting a limit is the standing yes, so the gate asks for a person.**
   - **Changes that need the gate:**
     - setting a limit where none is set;
     - tightening it: a smaller GB value or a larger P;
     - switching between a GB limit and `free:`.

     Each needs a terminal and a preview of what the new limit would remove
     now in the current project ("no project here" outside one), answered
     with `[y/N]`, which means no after 60 s. There is no `--yes --reason`
     path.
   - **What the gate checks.** It refuses when any of these finds a
     harness:
     - The ancestor chain. The gate walks the whole chain from the live
       process table and refuses if any ancestor is a known harness.
     - The environment markers the harness registry names. A harness hosted
       in Node or Electron, which shows up in the process table as `node` or
       a helper, is caught only by these.

     `WAYPOST_HARNESS` and `WAYPOST_PROC` are ignored for this check: they
     could claim that there is no harness, and a marker may only add a
     reason to refuse. Where there is no process table (Windows today), the
     markers alone decide, and the setting records that.
   - **What this does and does not stop.** An agent that follows Waypost's
     rules cannot set or tighten the limit. An agent that sets out to evade
     the gate can: a double fork escapes the ancestor chain, and a
     pseudo-terminal can answer `[y/N]`. Evasion is not prevented, but it
     shows: the setting records how it was made, and `brief`, `status` and
     `doctor` show the active setting — the value, when it was set, and the
     gate's view.
   - `off` and loosening (a larger GB value, a smaller P) are accepted from
     anywhere and need no yes.
   - Setting a limit removes nothing by itself. Removal happens only on the
     path in Decision 4.
   - Every change is logged in `cleanup.<host>.jsonl`.

3. **What may be removed automatically, and what counts towards the limit.**
   An item qualifies only when all of these hold:
   - **Inside the project root.** A locator match outside it, such as
     another tool's global build cache, never qualifies.
   - **Output identified exactly.** It is an outermost `CACHEDIR.TAG`
     directory, or a registry name with `match: "sure"`, and git ignores it
     (`git check-ignore`).
     - Names with `match: "generic"` never qualify: `build`, `dist`, `out`,
       `bin`, `obj`, `target`, `coverage`. Projects keep release output in
       them on purpose. They stay on the manual path: `waypost clean` lists
       them, and `doctor` reports them.
     - A Cargo target directory qualifies by its tag, whatever its name.
   - **Regenerable, and not marked manual.** Its shipped registry entry
     says `regenerable: true` and does not carry `auto: false`. A
     `CACHEDIR.TAG` directory is regenerable by the tag's own convention.
     `.terraform` carries `auto: false`, because it holds working-directory
     state: the selected workspace lives in `.terraform/environment`. Like
     `split` in the earlier draft, `auto` is read only from the shipped
     registry, and the project-entry loader drops it.
   - **No distributable package inside.** The age walk visits every entry,
     so an item holding one whose name ends with a suffix from the `system`
     entry's `auto_keep_suffixes` list is skipped at no extra cost. The
     list: `.dmg`, `.pkg`, `.msi`, `.msix`, `.AppImage`, `.deb`, `.rpm`,
     `.ipa`, `.xcarchive`, `.whl`. `.dSYM` is not on it, because debug
     builds write those routinely. This keeps packages found in tagged or
     `sure` output (Tauri's `target/release/bundle/`, cargo-dist's
     `target/distrib`, CPack output in `cmake-build-*`, `zig-out`) on the
     manual path.
   - **Nothing tracked or nested.** It holds no tracked file and no nested
     repository or worktree (a `.git` file or directory). On this path the
     walk never enters a directory that holds `.git`.
   - **Idle.** It has been idle for longer than max(7 days, the entry's
     `stale_days`). That makes it class `should`, so the automatic path
     never removes `can` items in bulk, and owner decision 2 of the
     disk-hygiene ADR holds.
   - **Not leased.** No other session holds a lease on it, with leases
     resolved against the root.

   **Age** is the newest of `mtime` and `ctime` over every entry in the
   item. OS metadata files named by the `system` registry entry are
   ignored: `.DS_Store`, `Thumbs.db`, `desktop.ini`. Ties go by path in
   code-unit order.

   **What counts towards a GB limit.** Only items of the qualifying kinds
   inside the root, idle or not: tagged directories and ignored `sure`
   names. Generic names and matches outside the root are reported
   separately and never count. Otherwise a limit could never hold because
   of output the automatic path may not touch.

   **Order.** Qualifying items are removed oldest first, and removal stops
   as soon as the limit holds:
   - **GB:** the counted total is at or under the limit.
   - **`free:<P>%`:** the shortfall is computed once, from `fs.statfsSync`
     on the root's filesystem: P % of the size minus the available bytes.
     Items on that filesystem are removed until their allocated bytes cover
     the shortfall. `statfs` is read again only for the report, because
     snapshots can keep freed space from showing at once. `bavail` excludes
     APFS purgeable space, and the report says so.

   When the qualifying items run out, nothing more is removed. The report
   names what stayed and the real repair:
   - the working set exceeds the limit → raise the limit;
   - the disk is full outside this project → `waypost size --global`.

   This replaces Decision 4's rule "any regenerable project artifact is
   `should` while the project exceeds its limit". Over the limit, removal
   takes only the idle items this order picks.

4. **When it runs: at the end of `waypost run --heavy`, when it is safe.**
   - **Conditions.** It runs under the slot the run still holds, and only
     when all of these hold:
     - A limit is set.
     - The wrapped command exited on its own, whatever its exit status. A
       command ended by a signal (Ctrl-C, SIGTERM) triggers no cleanup.
     - The root is the git top level of the wrapped command's working
       directory, computed before the slot lock is taken (nothing spawns
       inside that critical section). It is not the home directory, an
       ancestor of it, a filesystem root or a drive root.
     - The root is on local storage (`storageOf(root).kind === "local"`).
       Known gaps: a Windows mapped drive letter, and `~/Documents` under
       iCloud Desktop & Documents, both read as local today.
     - **No heavy job overlaps the tree.** No other live slot holder works
       in the root, in an ancestor of it, or in a descendant of it.
       - The slot record (heavy-work ADR, Decision 2) gains the working
         directory and root it was claimed from.
       - Paths are compared as canonical real paths, case-insensitively on
         macOS and Windows.
       - A live record without a root (from an older Waypost or another
         install) blocks the cleanup.
       - The holders are read again before each item.
     - **No shared checkout.** No live session from another host works in
       this checkout: the shared-checkout case ADR-0007 already detects
       (`sharedTree`), with containment in both directions. The binding
       checked is the one resolved from the root, which a linked worktree
       inherits (ADR-0010). Without a vault this check has nothing to read.
       Sessions on the same host do not block: the 7-day rule protects what
       they build, and the slot check protects their builds in progress.
   - **One deadline.** The whole cleanup — scan, age, checks and renames —
     has one 60 s deadline, checked between items, with the timeouts of its
     `git` calls inside it. Past the deadline it stops where it is.
   - **Rename, then delete in the background.** Right before its removal,
     each item is classified again and checked with `lstat`, as in
     Decision 5 of the disk-hygiene ADR. Then it is renamed under a unique
     name into `<git common dir>/waypost-removing/`:
     - The name `waypost-removing` is reserved: it sits outside ADR-0010's
       `waypost/<vault>/` coordination tree.
     - If the rename fails, the item is skipped with the reason. A file
       open inside on Windows fails it; so does a git directory on another
       filesystem, where cleanup then does nothing, and the report says so.
     - The renamed items are deleted by a detached low-priority `waypost`
       process. So the heavy run returns without waiting for the deletion,
       and a signal during it can leave nothing half-removed inside the
       project.
     - That deletion runs outside any slot. It is disk work, not CPU or
       memory, so this is accepted.
     - Each entry records its deleter's pid.
     - Any cleanup, manual or automatic, first purges what an interrupted
       run left in `waypost-removing/`, whatever the conditions above: an
       entry whose deleter is gone can no longer be in use. An entry whose
       deleter is alive is left to that deleter, because worktrees share
       the common dir. `waypost size` and `doctor` report the directory's
       size.
   - **Exit status and reporting.**
     - `run --heavy` exits with the wrapped command's status. A signal
       that arrives during the cleanup ends the process at once, with
       128+n; renaming first keeps that safe.
     - The cleanup reports briefly on stderr: items renamed for removal and
       their size, what stayed and why, or why it was skipped.
     - Its failures are reported and logged, and never change the command's
       exit status.
     - The last outcome — ran or skipped, with the reason and the date —
       shows in `status` and `doctor`. So a cleanup that is always skipped
       or always hits the deadline is visible.
     - The log rotates at 1 MB, keeping one previous file.
   - **Nothing else removes automatically.** `waypost clean` stays the
     manual path, with a yes each time, and shows which items the limit
     would pick.

5. **`doctor` and `next`.**
   - **The warning.** The disk-hygiene ADR's check `build-artifacts` warns
     when the project's build output exceeds a threshold. The output is all
     of it, measured as that ADR's Decision 7 does; the counted total from
     Decision 3 governs only the automatic stopping rule. The threshold is
     the first of these that applies:
     - `WAYPOST_BUILD_LIMIT_GB`;
     - the GB limit that is set;
     - 5 GB, while no limit is set.

     The message splits the output into two parts: what the automatic path
     counts, and what only `waypost clean` can remove — generic names,
     matches outside the root, items holding a package. It names
     `waypost clean` for the second part. Under `free:` without the
     variable, the check gives no GB warning.
   - **Stopped scans.** The check keeps its fixed entry budget. When the
     scan stops, it warns with `≥ N GB` and says that the idle share cannot
     be decided.
   - **Free share and outcome are `info` only.** The disk's free share, the
     `waypost-removing/` size and the last automatic outcome are `info`
     lines, outside the verdict. The verdict therefore depends on the tree
     and the machine's setting, not on how full the disk happens to be.
   - **Hints.** With no limit set, the hint says the owner can set one in
     their own terminal. Over the limit with nothing idle, it names the real
     repair from Decision 3 rather than `waypost clean`.

## Rationale

1. **It is what the owner asked for:** a chosen limit, the 30 % SSD
   headroom, removal without a yes each time, one setting per machine.
2. **The working set survives.** Protecting everything used within 7 days
   protects a working set spread over several items, such as a six-triple
   build and its host directories. Oldest first then frees space from what
   nobody builds any more.
3. **Release output stays off the automatic path.** Only exactly
   identified output is removed automatically. The rest stays manual:
   generic names, items holding a distributable package, and state that
   only looks like cache (`.terraform`). A person sees it before it goes.
   The residue is a package with a suffix the list lacks, inside tagged
   output.
4. **Consent stays with a person** and every setting records how it was
   made. An agent following the rules cannot turn automatic removal on or
   widen it. One evading the gate leaves a trace in the log and in the
   status surfaces.
5. **No new trigger is needed.** Build output grows when something builds,
   and builds already go through `run --heavy` under the heavy-work rule.
   There is no hook or daemon (ADR-0001), and the scan runs under the slot
   the build held.

## Alternatives Considered

### Alternative A: a time cadence (after a build, daily, weekly, monthly)

**Cons**:
- Each tick removes everything regenerable, so the next build starts from
  scratch.
- A calendar does not follow disk pressure.

**Rejected because**: the owner replaced it with a size limit on
2026-09-18.

### Alternative B: remove everything over the limit (Decision 4 as accepted)

**Rejected because**: it is the full rebuild the owner wants to stop.

### Alternative C: warn only, with a yes per removal

**Rejected because**: the owner chose automatic removal. A warning can be
put off indefinitely, and that is how the disk filled.

### Alternative D: keep only the single freshest item

**Rejected because**: the critic pass showed it fails on the owner's
monorepo. A multi-triple build's first triples and their shared host
directory would go at the end of the very run that built them.

### Alternative E: split a Cargo target directory into profile and triple items

**Cons**:
- The host directory `target/<profile>` holds build scripts and proc-macros
  for every triple. It is rewritten rarely, so it looks oldest and would go
  first, and every triple would then rebuild almost from scratch.
- `target/` also holds non-profile children: `criterion/` baselines,
  `doc/`, `package/`, `tmp/`.
- `.rustc_info.json` is not a reliable marker.

**Rejected because**: the owner's platforms already live in separate
top-level target directories. Revisit it with an allowlist, and with host
directories aging together with their triples, only if a real project needs
it.

### Alternative F: generic ignored names in the automatic set

**Rejected because**: they hold release archives, notarized installers and
symbol maps kept on purpose, and rarely rewritten. An idle rule removes
exactly those first.

### Alternative G: a limit per project

**Rejected because**: the owner chose one machine-wide setting.

### Alternative H: `30 %` as "build output above 30 % of the free space"

**Rejected because**: the owner meant a floor of free disk space.

### Alternative I: an agent may set the limit after the owner agrees in the conversation

**Rejected because**: the reason is text the agent writes itself, so it
cannot prove consent. The owner chose the terminal on 2026-09-18.

### Alternative J: live sessions on the same host block the cleanup

**Rejected because**: during multi-session work the limit would almost
never act. The 7-day rule, the slot check and the walk stopping at `.git`
already protect those sessions' output. Other hosts in a shared checkout
still block.

### Alternative K: check on every `waypost` command

**Rejected because**: it would put a full project scan in commands that
should answer in milliseconds, while output grows only when something
builds.

### Alternative L: a protection window of 1 or 3 days

**Rejected because**: the owner chose 7 days. It matches the accepted
`stale_days`, and a project put aside for a few days keeps its cache.

## Consequences

**Positive**:
- Disk use follows a limit the owner picked, and the SSD headroom, without
  a conversation each time.
- Whatever was built in the last week keeps its incremental cache. Stale
  platforms and abandoned configurations go first.
- Release output under generic names, items holding a distributable
  package and Terraform working state are never removed automatically.
- Every automatic removal, and every setting, is logged with how it was
  made.

**Negative / trade-offs**:
- If the working set of the last 7 days exceeds the limit, the limit does
  not hold; Waypost warns and removes nothing more. The same happens when
  most of the output sits under generic names.
- Age is the last write: a cache only read, or only no-op built, for 7 days
  counts as idle.
- A registry mistake can be removed without a person seeing the list, and
  in projects other than the one previewed the first automatic removal
  comes without a preview. The risk is bounded: project scope, tagged or
  `sure` output only, no package inside, idle for 7 days, re-checked right before removal,
  logged.
- An agent determined to evade the gate can set the limit. That is
  visible, not prevented.
- Nothing is removed automatically:
  - by builds that bypass `run --heavy`, such as an IDE's;
  - in build directories outside the project (`CARGO_TARGET_DIR` elsewhere,
    a cache under the home directory);
  - under `free:`, in any project except the one being built — abandoned
    projects stay;
  - outside git, on network or synced storage, or when a git directory
    sits on another filesystem;
  - while another heavy job works in the same tree, or another host shares
    the checkout.

  `doctor`, `next`, `status` and `waypost size --global` show these cases.
- A heavy run takes longer by the cleanup, at most 60 s. The deletion
  itself runs in the background.

**What changes in code / process**:
- `scripts/cleanup.mjs` (clean story): the qualifying set, the counted
  total and the order, as pure functions.
- `scripts/sizes.mjs`: age per item, and a walk mode that stops at `.git`.
- `toolchains/system.json`: the OS metadata names and `auto_keep_suffixes`.
- `toolchains/terraform.json`: `auto: false` on `.terraform`.
- `scripts/toolchains.mjs`: `auto` and `auto_keep_suffixes` read from the
  shipped registry only; the project-entry loader drops them.
- `scripts/capacity.mjs`: the slot record's working directory and root.
- `scripts/agents.mjs`: the gate's check (ancestor chain plus registry
  environment markers).
- `bin/waypost`:
  - `clean --limit`;
  - the cleanup at the end of `run --heavy`;
  - the detached deletion;
  - the setting and last outcome in `brief` and `status`.
- `scripts/doctor.mjs`: the threshold order and the `info` lines.
- `docs/toolchains.md`, `README.md`, `AGENTS.md`, `CHANGELOG.md`.
- WP-17, on acceptance:
  - The clean and doctor stories follow Decisions 1, 3 and 5: no
    `build_artifacts_limit_gb`, and the "same result on repeated runs"
    criterion is scoped to the verdict.
  - A new story, "The machine-wide limit", blocked by the clean story, has
    criteria for:
    - a working set spread over several items;
    - a generic `build/` holding release output left untouched;
    - a tagged directory holding a `.pkg` left untouched;
    - a nested worktree left untouched;
    - a concurrent heavy job in the same tree;
    - Ctrl-C during the build and during the cleanup;
    - free space that does not move after a removal;
    - non-local storage;
    - a harness trying to set or tighten the limit, including through
      `WAYPOST_HARNESS`;
    - the deadline;
    - leftovers in `waypost-removing/`.
- On acceptance, one-line pointers to this ADR go into the disk-hygiene ADR
  (at Decisions 4, 5 and 7) and the heavy-work ADR (at Decision 2, for the
  slot record's new fields).

## Owner's decisions

On 2026-09-18 the owner decided:

1. A size limit instead of a time cadence. The choices are 5 GB (today's
   value), larger amounts, and keeping 30 % of the disk free.
2. `30 %` is a floor of free disk space.
3. Over the limit, cleanup is automatic.
4. One limit for the whole machine.
5. Only project build output is cleaned.
6. Anything built within the last 7 days is protected from automatic
   removal.
7. Only the owner, in their own terminal, sets or tightens the limit. An
   agent may only loosen it or turn it off.

Accepted by the owner on 2026-09-18, after the third critic pass.

## Review history

- **First critic pass (2026-09-18): reject.** Blockers:
  - "keep the single freshest item" removed the rest of a working set at
    the end of the run that built it;
  - splitting Cargo's target directory would remove the shared host
    directory first;
  - automatic removal could reach nested worktrees and same-host builds;
  - `--yes --reason` let an agent grant itself standing consent.

  Owner decisions 6 and 7, Decisions 2–4 and Alternatives D, E and I answer
  them.
- **Second critic pass (2026-09-18): accept with changes.** Blockers:
  - generic ignored names, the owner's notarized release in `build/`
    included, qualified for automatic removal;
  - the consent claims overstated a gate the environment could fool.

  Should-fix items:
  - the removal route: invisible leftovers, name collisions, a clash with
    ADR-0010's layout, other filesystems;
  - a deadline that covered only the scan;
  - wrong signal wording;
  - slot-record details;
  - an equality-based session check;
  - a GB total that included items the path cannot remove;
  - invisible skips;
  - stale story references.

  This revision answers each: Decision 3's exact-output rule and counted
  total, Decision 2's gate and wording, and Decision 4's route, deadline,
  signals, slot and shared-checkout checks and last outcome. Alternatives F
  and J record the choices. The story edits wait for acceptance.
- **Third critic pass (2026-09-18): accept with changes.** Both blockers
  resolved. Two small issues were new:
  - `doctor` would stop warning about generic output;
  - tagged and `sure` output can hold distributable packages, and
    `.terraform` holds workspace state.

  Also noted: the detached deleter needs a pid per entry and runs outside
  any slot, and harnesses hosted in Node or Electron are recognised only by
  their environment markers. Decisions 2, 3, 4 and 5 now answer all of
  these.

## References

- [Disk hygiene by discovery](disk-hygiene-by-discovery-a-toolchain-registry-a-machine-and-project-profile-and-cleanup-only-after-a-yes.md),
  Decisions 1–5, 7 and owner decision 2.
- [Heavy work sized to the machine](heavy-work-sized-to-the-machine-waypost-capacity-a-machine-wide-slot-and-a-rule-to-check-first.md),
  Decision 2 and its amendments.
- ADR-0001, ADR-0006, ADR-0007, ADR-0010, ADR-0011.
- Cargo book, [Build Cache](https://doc.rust-lang.org/cargo/reference/build-cache.html).

---

*Last updated: 2026-09-18*
