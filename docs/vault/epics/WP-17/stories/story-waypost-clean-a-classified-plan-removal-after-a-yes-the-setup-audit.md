---
type: story
id: "story-waypost-clean-a-classified-plan-removal-after-a-yes-the-setup-audit"
epic: "WP-17"
title: "waypost clean: a classified plan, removal after a yes, the setup audit"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-09-14
updated: 2026-09-18
external_refs: {}
tags: []
code_refs: ["bin/waypost", "scripts/cleanup.mjs", "scripts/sizes.mjs", "scripts/toolchains.mjs", "scripts/lib.mjs", "toolchains/", "prompts/cleanup.md", "skills/waypost-doctor/SKILL.md", "docs/toolchains.md", "tests/cleanup.test.mjs", "tests/sizes.test.mjs", "tests/toolchains.test.mjs", "CHANGELOG.md"]
specs: []
blocked_by: ["WP-17/story-discovery-and-the-profile-the-scheme-of-what-waypost-works-with"]
started_at: "2026-09-18T16:41:47.645Z"
closed_at: "2026-09-18T20:41:47.258Z"
plan_updated_at: "2026-09-18T16:41:47.645Z"
---

# waypost clean: a classified plan, removal after a yes, the setup audit

| Field | Value |
|---|---|
| **Epic** | [WP-17](../epic.md) |
| **Status** | done |
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

- [x] `scripts/sizes.mjs`: a read-only age per item — the newest of `mtime`
      and `ctime` over its entries, ignoring the OS metadata names of the
      `system` entry, ties by path.
- [ ] ~~Tool versions in the machine profile~~ — deferred with the detectors
      to a follow-up story (planning pass, 2026-09-18).
- [x] `scripts/cleanup.mjs` computes keep / should / can, each with a reason:
      - in use — the registry's process names, plus 10-minute recency (recency
        alone where the process table is unavailable);
      - leases and live peers;
      - `regenerable`, which defaults to false;
      - `stale_days`; over the project limit, only the idle items oldest
        first, as many as bring it under (never every regenerable item);
      - detectors, with their evidence.

      The project root is never an item. Machine-wide garbage collection is at
      most `can`, and manual only.
- [x] `bin/waypost clean`:
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
- [x] `waypost setup`: the audit as its last step, under the same rules for
      the yes.
- [x] `prompts/cleanup.md`, and one body line in the `waypost-doctor` skill
      pointing to `waypost prompt cleanup`; its `description` stays as it is.
- [x] The ADR's guards on `scripts/cleanup.mjs` select it and pass.
- [x] Tests for each acceptance criterion below, removing only inside
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

- [x] A non-ignored `CACHEDIR.TAG` directory with no tracked file is removed
      by `--apply <id> --yes --reason "…"`; one that holds a tracked file or a
      nested repository is not, and the report says why. — evidence: test "AC 1 (apply)…" tests/cleanup.test.mjs:880, "AC 1…" tests/cleanup.test.mjs:679
- [x] An ignored build directory inside git is removed, and a tracked file
      inside it survives. — evidence: test "AC 2 (apply)…" tests/cleanup.test.mjs:946 (removal through `git clean -X`), "AC 2: git clean -X -d -f itself never removes a tracked file…" tests/cleanup.test.mjs:983; through Waypost a directory holding a tracked file is not an item at all, so it is left whole
- [x] A tool's output directory holding a force-added tracked file is not
      removed by the tool's clean command either, and the report says why. — evidence: test "AC 3 (apply)…" tests/cleanup.test.mjs:1013 (fake registry; no shipped project artifact carries `clean_argv`)
- [x] A project entry's artifact that git does not ignore is never removed,
      even when it holds no tracked file. — evidence: tests "AC 4 (apply)…" tests/cleanup.test.mjs:1083 and the B1 extension, name, prefix and pattern cases tests/cleanup.test.mjs:1125–1355
- [x] A machine cache without `clean_argv` is removed by Waypost itself; one
      whose clean text is prose is shown as manual and never run. — evidence: tests "AC 5 (apply)…" tests/cleanup.test.mjs:1356, :1386
- [x] When one item fails (a locked or unreadable file), the rest are still
      removed and the exit status is non-zero. — evidence: test "AC 6 (apply)…" tests/cleanup.test.mjs:1488 (POSIX, not as root)
- [x] With a harness detected, `--apply` without `--yes --reason` removes
      nothing and exits non-zero; on a terminal with no answer before the
      timeout, nothing is removed. — evidence: tests "AC 7…" tests/cleanup.test.mjs:801, :815; `askYesNo` timeout/EOF tests/cleanup.test.mjs:831, :839; `consent` units tests/cleanup.test.mjs:549–571 (the terminal path is covered as units, not end to end)
- [x] An entry that does not state `regenerable: true` is `keep` and refused
      by id. — evidence: test "AC 8…" tests/cleanup.test.mjs:194; refusal by id through the shared keep path, e.g. "AC 4 (apply)…" tests/cleanup.test.mjs:1083
- [x] An item modified within 10 minutes, or leased by another session, is
      `keep`; with a live peer on the project, project artifacts are at most
      `can`. — evidence: tests "AC 9…" tests/cleanup.test.mjs:207, :213, :252, :264, "AC 9 (e2e)…" :741 (a peer is another host sharing the checkout)
- [x] A project root carrying `CACHEDIR.TAG` never appears in the plan. — evidence: test "AC 10…" tests/cleanup.test.mjs:705
- [x] Given a limit, the plan picks from the idle (`should`) items, oldest
      first, those that bring the counted total under it; items used within
      `stale_days` stay `can` and are never picked. — evidence: tests "AC 11…" tests/cleanup.test.mjs:402, `qualifiesForLimit` tests/cleanup.test.mjs:448–493 (pure; the CLI passes a limit with the next story)
- [x] An item that changed between plan and apply (now in use, now tracked,
      replaced by a symlink) is skipped with the reason. — evidence: tests "AC 12…" tests/cleanup.test.mjs:1540, :1569, :1601; `recheck` units tests/cleanup.test.mjs:494–548
- [x] Each apply appends one log line with the reason given, the items and
      their results; the report gives the space freed per filesystem. — evidence: test "AC 13…" tests/cleanup.test.mjs:1636
- [x] `waypost setup` with no terminal, or under a harness, names
      `waypost clean` and removes nothing. — evidence: tests "AC 14…" tests/cleanup.test.mjs:1720, :1742, :1765, :1778
- [x] `npm test` is green and `waypost doctor` reports 0 issues. — evidence: command `WAYPOST_HEAVY_WAIT=30m npm test` at 4660794: 707 tests, 703 pass, 0 fail, 4 skipped; `waypost doctor`: 0 issues

## Final Summary

**What changed.** `waypost clean [--json]` classifies every project artifact
and machine cache as `keep` / `should` / `can`, with its reason and route;
`--apply <ids…>|should` removes exactly that after a yes (`--yes --reason`, or
a `[y/N]` on a terminal with no harness), re-checking each item right before
its removal, verifying the result, measuring free space per filesystem and
logging every apply to `cleanup.<host>.jsonl`. `waypost setup` audits last.
`scripts/cleanup.mjs` is pure and carries the ADR's removal guards; removal
lives in `bin/waypost` only. The registry gained `processes`,
`metadata_names`, `manual` and documented `clean_argv`. Commits 3baa526,
0478c74, 9dc3a1c, then three review rounds (df30032, 1e3b8ba, 4660794).

**Review.** A fresh-context reviewer found, over three rounds, two blocker
classes — a project toolchain entry reaching Waypost's own removal for a
non-ignored directory (by extending a shipped id, reusing a name, promoting a
generic name or taking over a pattern), and registry caches holding
non-regenerable data (SwiftPM configuration, Stack, gems, Maven, Conan, Bazel,
Deno, Poetry, pub-cache) — plus a git failure read as "no repository",
tests writing the owner's real log, and tests not hermetic across OSes. All
fixed; ownership and match kind now come from the shipped owner first, a
failing git inside a repository reads as "everything tracked".

**Tests.** `WAYPOST_HEAVY_WAIT=30m npm test`: 707 tests, 703 pass, 0 fail,
4 skipped. One earlier full run had a single unidentified failure; reruns
were clean.

**Not covered.**
- Detectors and tool versions (a follow-up story).
- No shipped project artifact has `clean_argv`; that route is tested through
  a fake registry only, and a tool's own clean can reach beyond the item.
- Generic names are removed only by id; only another host's live session
  caps project items.
- In use: per-tool process names only where unambiguous; tag and generic
  items fall back to any live process of an ecosystem found at the project
  root's top level; Node, Python, Gradle, Maven and Windows rely on the
  10-minute rule; a build that writes nothing for 10 minutes reads idle.
- The terminal `[y/N]` path and a harness on a terminal are unit-tested only;
  the per-item re-check is unit-tested, the end-to-end change tests are
  caught by the fresh plan at apply start.
- Windows: `.cmd`/`.bat` shims are refused, so npm's cache cannot be removed
  there; junctions, long paths and the missing process table belong to the
  verification story.
- Age is the last write; `statfs` excludes APFS purgeable space; a removal
  can hold the machine-wide slot for up to 30 minutes; a leftover at an old
  default path is routed to Waypost only with a fresh machine profile; mount
  points are detected by device id (overlay and btrfs can keep more).
- The limit is not wired into the CLI; `auto: false`, `auto_keep_suffixes`,
  the walk that stops at `.git` and log rotation belong to the limit story.
- The owner's real cleanup log holds 21 lines written by tests before the
  second review round.

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
