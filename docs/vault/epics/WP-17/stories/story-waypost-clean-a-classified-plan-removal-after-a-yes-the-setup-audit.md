---
type: story
id: "story-waypost-clean-a-classified-plan-removal-after-a-yes-the-setup-audit"
epic: "WP-17"
title: "waypost clean: a classified plan, removal after a yes, the setup audit"
status: in-progress
priority: p2
assignee: "Ivan Morozov"
created: 2026-09-14
updated: 2026-09-18
external_refs: {}
tags: []
code_refs: ["scripts/cleanup.mjs (planned)", "scripts/sizes.mjs", "scripts/presence.mjs", "bin/waypost", "prompts/cleanup.md (planned)", "skills/waypost-doctor/SKILL.md", "tests/cleanup.test.mjs (planned)"]
specs: []
blocked_by: ["WP-17/story-discovery-and-the-profile-the-scheme-of-what-waypost-works-with"]
started_at: "2026-09-18T16:41:47.645Z"
closed_at: null
plan_updated_at: "2026-09-18T16:41:47.645Z"
---

# waypost clean: a classified plan, removal after a yes, the setup audit

| Field | Value |
|---|---|
| **Epic** | [WP-17](../epic.md) |
| **Status** | in-progress |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Classify what the scans find and remove only after a yes, as the ADR
[Disk hygiene by discovery](../../../adr/disk-hygiene-by-discovery-a-toolchain-registry-a-machine-and-project-profile-and-cleanup-only-after-a-yes.md)
decides (Decisions 4–6), as amended by
[Cleanup to a machine-wide limit](../../../adr/cleanup-to-a-machine-wide-limit-set-by-the-owner-idle-artifacts-oldest-first.md)
(Decision 3 there: over the limit, only idle items, oldest first):
- a compute-only plan in `scripts/cleanup.mjs`;
- `waypost clean` in `bin/waypost`, which removes exactly what was agreed and
  logs it;
- the audit as the last step of `waypost setup`.

## Decomposition

- [ ] `scripts/sizes.mjs`: a read-only age per item — the newest of `mtime`
      and `ctime` over its entries, ignoring the OS metadata names of the
      `system` entry, ties by path.
- [ ] ~~Tool versions in the machine profile~~ — deferred with the detectors
      to a follow-up story (planning pass, 2026-09-18).
- [ ] `scripts/cleanup.mjs` computes keep / should / can, each with a reason:
      - in use — the registry's process names, plus 10-minute recency (recency
        alone where the process table is unavailable);
      - leases and live peers;
      - `regenerable`, which defaults to false;
      - `stale_days`; over the project limit, only the idle items oldest
        first, as many as bring it under (never every regenerable item);
      - detectors, with their evidence.

      The project root is never an item. Machine-wide garbage collection is at
      most `can`, and manual only.
- [ ] `bin/waypost clean`:
      - the plan, `--json`, and `--apply <id…>|should`;
      - the yes: on a terminal without a harness, `[y/N]`, answering no after
        60 s; otherwise `--yes --reason`;
      - re-classification and an `lstat` right before each removal; removal
        as the ADR decides, never of anything holding a tracked file or a
        nested repository; verification;
      - one item's failure reported without stopping the rest, and a
        non-zero exit if any failed;
      - free space per filesystem;
      - the log in the machine state directory.
- [ ] `waypost setup`: the audit as its last step, under the same rules for
      the yes.
- [ ] `prompts/cleanup.md`, and one body line in the `waypost-doctor` skill
      pointing to `waypost prompt cleanup`; its `description` stays as it is.
- [ ] The ADR's guards on `scripts/cleanup.mjs` select it and pass.
- [ ] Tests for each acceptance criterion below, removing only inside
      temporary directories.

## Implementation Plan

From a `waypost-planner` pass (2026-09-18), grounded in the code, with the
lead's answers to its open questions.

**Shape** (as the registry and discovery stories landed): `scripts/cleanup.mjs`
is pure — no filesystem, no spawn; `bin/waypost` gathers every fact (scan, git,
process table, leases, peers) and passes it in, so classification is tested
without git or `ps`. Tool knowledge stays in `toolchains/*.json`.

1. `scripts/sizes.mjs` (read-only): per item `newest_ms` (max of mtime and
   ctime, `metadata_names` of the `system` entry ignored), `nested_git`,
   `unreadable` (today swallowed), `dev`/`ino`, `match`
   (`tag`/`sure`/`generic`/`locator`) and the owner entry; `rootItem: false`
   for the plan; `inspectDir(abs)` for the per-item re-check; `gitFacts(root,
   rels)` (`--literal-pathspecs`; outside git nothing is tracked);
   `scanGlobal` split into `cacheCandidates` + `measureCaches`, policy always
   from the current registry.
2. `scripts/toolchains.mjs`: shipped-only fields pass through — entry
   `processes`, `metadata_names`; cache `manual`, `clean_argv`, `clean_docs`,
   `stale_days`; artifact `clean_argv`; `origin: shipped|project`. The project
   allowlist already drops them.
3. `scripts/cleanup.mjs`: `itemId` (sha256 of the path, `p-`/`m-`),
   `runningTools`, `refusePath` (filesystem/drive root, home, the project
   root, any ancestor of home/root/state dir; case-folded on darwin/win32),
   `routeFor`, `classifyItem`, `classify`, `orderOldestFirst`, `countedBytes`,
   `pickUnderLimit`, `recheck`, `consent`, `logLine`. Two removal guards join
   the disk-hygiene ADR's frontmatter in the same commit.
4. Classification, in order: `keep` by policy (refused path, `regenerable`
   not true — a `CACHEDIR.TAG` directory is regenerable by convention —,
   inside a nested repository, no route); `keep` in use (10-minute recency;
   a registry process of the item's tool; another session's lease
   overlapping it; recency only where there is no process table, and the
   plan says so); then `should` past `stale_days` (7 project / 30 machine),
   else `can`; unknown age at most `can`. Caps at `can`: `manual` items
   (machine-wide garbage collection, directories of versions), generic names
   (`build/`, `dist/`, … — release output lives there; removed only by id),
   and project items in a shared checkout (another host's live session,
   `sharedTree`). A limit, when given, marks `picks` among `should` items of
   the counted kinds, oldest first; the CLI passes none until the limit
   story.
5. Removal (`recheckItem` + `removeItem`, one per item, each in its own
   try/catch, ancestors first): re-check `refusePath`, `lstat` (a directory,
   not a link or junction), the same `dev`/`ino`, fresh facts, classify
   again. Routes, always `git -C <root>`: the shipped `clean_argv` when the
   whole directory is the tool's output with no tracked file or nested
   repository (none shipped for project artifacts yet); else `git clean -X -d
   -f` for an ignored directory (what stays is named); else Waypost itself
   for a tag or a shipped `sure`/locator match with no tracked file and no
   nested repository; else no route, with the reason. Machine caches:
   `manual` never touched; `clean_argv` by absolute path, no shell, a
   timeout, `.cmd`/`.bat` shims refused, an asked path re-asked first; else
   Waypost removes the path — an asked path differing from the default only
   through `clean_argv`. Prose is only shown. Verify each result; free space
   per filesystem with `statfsSync` before/after; exit 0 only when all
   selected items were removed, 1 otherwise, 75 when the slot is refused.
6. The yes: `--yes --reason` anywhere; else a TTY with no harness (the
   detection `waypost commit` uses, hardened so `WAYPOST_HARNESS` cannot hide
   the markers) gets `[y/N]`, no after 60 s (`askYesNo` in `scripts/lib.mjs`,
   reused by the limit story); else refuse and name the flags and `waypost
   prompt cleanup`. `waypost clean` holds a machine-wide slot.
7. Log: one line per `--apply` in `<machine state>/cleanup.<host>.jsonl`
   (`v`, `kind: "apply"`, time, host, session, harness, source, root, yes,
   selection, items with route/result/reason/freed, filesystems, exit).
8. Setup: the audit as the last step, under a slot, in a try/catch; the
   machine part only when discovery just refreshed the profile; totals per
   class and the five largest; `[y/N]` for `should` only on a TTY with no
   harness, otherwise it names `waypost clean`.
9. `prompts/cleanup.md`; one body line in the `waypost-doctor` skill, then
   `waypost skills install` so the tracked copies stay current;
   `docs/toolchains.md`; `CHANGELOG.md`. `AGENTS.md` is left to the doctor
   story.

**Tests**: `tests/cleanup.test.mjs`, one test (or more) per acceptance
criterion, end to end with a hermetic `HOME`, `PATH`, `WAYPOST_HOME` holding
fake registry entries only, and `WAYPOST_CLEAN_NOW` as the clock (ctime cannot
be backdated; it warns and is logged). Never `--apply` against the real
registry. Plus pure units, registry schema checks in
`tests/toolchains.test.mjs`, walk facts in `tests/sizes.test.mjs`.

**Commits**: A — the plan (walk facts, loader, registry data, `cleanup.mjs`
and its guards, `waypost clean [--json]`); B — removal after a yes; C — the
setup audit, the prompt and the skill line.

**Deferred**: detectors (superseded device support, unavailable simulators,
duplicate toolchains) and tool versions — a follow-up story; their evidence
sources need a live run on each OS.

## Acceptance Criteria

- [ ] A non-ignored `CACHEDIR.TAG` directory with no tracked file is removed
      by `--apply <id> --yes --reason "…"`; one that holds a tracked file or a
      nested repository is not, and the report says why.
- [ ] An ignored build directory inside git is removed, and a tracked file
      inside it survives.
- [ ] A tool's output directory holding a force-added tracked file is not
      removed by the tool's clean command either, and the report says why.
- [ ] A project entry's artifact that git does not ignore is never removed,
      even when it holds no tracked file.
- [ ] A machine cache without `clean_argv` is removed by Waypost itself; one
      whose clean text is prose is shown as manual and never run.
- [ ] When one item fails (a locked or unreadable file), the rest are still
      removed and the exit status is non-zero.
- [ ] With a harness detected, `--apply` without `--yes --reason` removes
      nothing and exits non-zero; on a terminal with no answer before the
      timeout, nothing is removed.
- [ ] An entry that does not state `regenerable: true` is `keep` and refused
      by id.
- [ ] An item modified within 10 minutes, or leased by another session, is
      `keep`; with a live peer on the project, project artifacts are at most
      `can`.
- [ ] A project root carrying `CACHEDIR.TAG` never appears in the plan.
- [ ] Given a limit, the plan picks from the idle (`should`) items, oldest
      first, those that bring the counted total under it; items used within
      `stale_days` stay `can` and are never picked.
- [ ] An item that changed between plan and apply (now in use, now tracked,
      replaced by a symlink) is skipped with the reason.
- [ ] Each apply appends one log line with the reason given, the items and
      their results; the report gives the space freed per filesystem.
- [ ] `waypost setup` with no terminal, or under a harness, names
      `waypost clean` and removes nothing.
- [ ] `npm test` is green and `waypost doctor` reports 0 issues.

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

- `scripts/cleanup.mjs` only computes; removal lives in `bin/waypost` alone.
- A `clean_argv` is a literal argv run without a shell; prose stays manual.
- From the discovery story's review (2026-09-15):
  - An asked cache path is only checked to be absolute. Before removing
    anything, refuse the filesystem root, a drive root, the home directory,
    and any ancestor of the home directory or the project.
  - Policy (`regenerable`, `clean`) comes from the current registry at scan
    time, never from the machine profile, which holds facts only.
  - A successful `ask` replaces the default path. After a tool's cache has
    moved, data left at the old location is not measured. Decide whether the
    plan also looks at the default when it differs from the asked path.
  - A trailing `*` is expanded when the profile is built. A newer tool
    version (Android Studio's `AndroidStudio*`) is not measured until the
    profile is refreshed.
  - The audit in `waypost setup` holds a machine-wide slot (the heavy-work
    ADR, Decision 4). Discovery, the step before it, does not.

## Dependencies

- `story-discovery-and-the-profile-the-scheme-of-what-waypost-works-with`.

## Attachments

-

---

*Last updated: 2026-09-18*
