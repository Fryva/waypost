---
type: story
id: "story-waypost-size-the-read-only-scan-project-and-global"
epic: "WP-17"
title: "The toolchain registry and a tool-agnostic waypost size"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-09-14
updated: 2026-09-14
external_refs: {}
tags: []
code_refs: ["toolchains/", "scripts/toolchains.mjs", "scripts/sizes.mjs", "bin/waypost", "package.json", "docs/toolchains.md", "tests/sizes.test.mjs", "tests/toolchains.test.mjs", "CHANGELOG.md"]
specs: []
started_at: "2026-09-14T16:28:58.090Z"
closed_at: "2026-09-14T20:34:10.911Z"
plan_updated_at: "2026-09-14T16:28:58.090Z"
---

# The toolchain registry and a tool-agnostic waypost size

| Field | Value |
|---|---|
| **Epic** | [WP-17](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

The first implementation of `waypost size` works (a project scan and a global
audit, measure only) but carries tool knowledge in its core: Xcode's
DerivedData found through `plutil`, a flat list of default cache paths, name
lists in code. The ADR
[Disk hygiene by discovery](../../../adr/disk-hygiene-by-discovery-a-toolchain-registry-a-machine-and-project-profile-and-cleanup-only-after-a-yes.md)
decides that tool knowledge is data (Decision 1) and the scan is tool-agnostic
(Decision 3). This story moves every tool fact into `toolchains/*.json`, keeps
the walk invariants already built and tested, and leaves asking tools for
their paths to the discovery story.

## Decomposition

- [x] `toolchains/<id>.json`, one per tool, in the ADR's format: `os`,
      `confidence` per OS with `docs` or `notes`, `detect`, `artifacts`,
      `caches` (environment variable, then a per-OS default), `skip` names
      and named locators; every cache and artifact states `regenerable`.
      `ask`, `clean_argv`, `processes` and `detectors` arrive with the
      stories that run them. The conventional names every ecosystem uses are
      the `generic` entry.
- [x] Port the 129 entries of `scripts/sizes-global.json` into their tools'
      entries, keeping each OS's confidence, docs and notes; remove the flat
      file and `loadGlobalList`.
- [x] `scripts/toolchains.mjs`: loader and schema check, shipped entries plus
      `<project>/.waypost/toolchains/` entries as data only (`detect`
      manifests and `artifacts` inside the project; every other field dropped
      and reported); path resolution; the named locators, including the Xcode
      DerivedData match moved out of `scripts/sizes.mjs`.
- [x] `scripts/sizes.mjs`: names, prefixes, patterns and skip names from the
      registry; `CACHEDIR.TAG`, the git-ignore and tracked-file rules, the
      budget and the accounting unchanged; no tool named anywhere in the file.
- [x] `bin/waypost size`: same flags; `--global` says where each path came
      from.
- [x] `docs/toolchains.md`: the entry format and the confidence levels, as
      `docs/harnesses.md` does for harnesses.
- [x] Tests: the scan fixtures kept, fed by a test registry; a schema pass over
      every shipped entry; override precedence; the ADR's guards on
      `scripts/sizes.mjs` end to end (replacing the test keyed to the removed
      draft).

## Implementation Plan

Written by the lead from the code on 2026-09-14, after the owner approved
the ADR.

1. `scripts/toolchains.mjs` mirrors the harness loader (`registryDirs()` and
   `registry()` in `scripts/agents.mjs`): shipped `toolchains/` first, then
   `.waypost/toolchains/`, whose entries only add project artifacts and
   manifests (to a shipped entry with the same `id`, or as a new entry).
2. `SURE_NAMES`, `SURE_PREFIXES`, `MAYBE_NAMES` and `MAYBE_PATTERNS` become
   `artifacts` in their tools' entries (unambiguous names count
   unconditionally, the `generic` entry's names only when git ignores them);
   tool-owned `ALWAYS_SKIP` names (`node_modules`, virtual environments) move
   to their entries as skip names, while `.git` stays in the core.
3. `xcodeDerivedDataFor` becomes the locator `xcode-derived-data` in
   `scripts/toolchains.mjs`, named by `toolchains/xcode.json` and run only on
   darwin; the core calls locators generically and charges their subprocess
   calls to the same budget.
4. `scanGlobal` measures the registry's caches for this OS; the output keeps
   its keys and adds each path's source.

## Acceptance Criteria

- [x] Every shipped `toolchains/*.json` passes the schema test: `os` and a
      `confidence` for each OS listed, `docs` for `documented`, `notes` for
      `inferred`, `regenerable` stated on every cache and artifact.
      — evidence: `tests/toolchains.test.mjs#"toolchains/<id>.json: id equals the filename"`, `tests/toolchains.test.mjs#"toolchains/<id>.json: os is a non-empty subset of darwin/linux/win32"`, `tests/toolchains.test.mjs#"toolchains/<id>.json: every cache item's confidence has exactly one"`, `tests/toolchains.test.mjs#"toolchains/<id>.json: a cache with a 'documented' OS carries docs (a"`,
      `tests/toolchains.test.mjs#"toolchains/<id>.json: regenerable is a boolean on every artifact and"`, `tests/toolchains.test.mjs#"toolchains/<id>.json: no docs URL is invented — every docs value is a"`
- [x] The existing project-scan fixtures pass with names from the registry:
      nested tags counted once, an ignored `build/` counted and a tracked
      `src/build/` not, symlink loops not followed, hard links once, the
      stopped-scan JSON shape, `$HOME` and `/` refused.
      — evidence: `tests/sizes.test.mjs#"scanProject: outermost tag only, git-ignored vs. tracked generic"`, `tests/sizes.test.mjs#"scanProject: a generic-named directory that git ignores but that"`, `tests/sizes.test.mjs#"scanProject: a directory symlink loop does not hang the scan and is"`, `tests/sizes.test.mjs#"scanProject: two hard links to one file are counted once, like du"`,
      `tests/sizes.test.mjs#"scanProject: --budget below the tree's entry count stops"`, `tests/sizes.test.mjs#"scanProject: an unbounded scan always reports complete:true and no"`, `tests/sizes.test.mjs#"scanProject: refuses $HOME and / as a project root"`
- [x] On macOS the Xcode DerivedData match still finds a project's folder,
      now through the Xcode entry; on other platforms the locator does not run.
      — evidence: `tests/sizes.test.mjs#"scanProject: Xcode DerivedData outside the project is matched by its"`, `tests/toolchains.test.mjs#"applicableLocators: the shipped darwin-only locator is offered on"`
- [x] A `.waypost/toolchains/` entry adds a name the scan then counts, and
      with a shipped entry's `id` extends that entry's project artifacts.
      — evidence: `tests/toolchains.test.mjs#"scanProject: a project's own toolchain artifact is found and counted"`, `tests/toolchains.test.mjs#"scanProject: a project's own toolchain artifact with match:generic"`, `tests/toolchains.test.mjs#"a project toolchain entry with a shipped id EXTENDS that entry's"`
- [x] A project entry's `ask`, `clean_argv`, project clean command, processes,
      detectors or machine cache fields are dropped and reported, and an
      artifact that resolves outside the project is refused.
      — evidence: `tests/toolchains.test.mjs#"a project toolchain entry: disallowed fields are dropped and"`, `tests/toolchains.test.mjs#"a project toolchain entry: an artifact name with a slash, or '..', is"`, `tests/toolchains.test.mjs#"a project toolchain entry: a pattern is always dropped, even one that"`, `tests/toolchains.test.mjs#"a project toolchain entry: an artifact's clean_argv and path are"`,
      `tests/toolchains.test.mjs#"a project toolchain entry: a manifest outside the project is refused"`
- [x] `waypost size --global` on a temporary home lists only paths that exist
      on this OS, each with its source and clean text.
      — evidence: `tests/sizes.test.mjs#"scanGlobal: with a temp HOME, only fixtures under it are found, and"`, `tests/sizes.test.mjs#"scanGlobal: an unset Windows env var skips that entry instead of"`, `tests/sizes.test.mjs#"scanGlobal: a trailing * is expanded by prefix-matching the parent"`, `tests/sizes.test.mjs#"bin/waypost size --global: human output shows only entries at or"`
- [x] `scripts/sizes-global.json` is gone and nothing refers to it.
      — evidence: absent from b3a6f9a; `rg -n loadGlobalList scripts bin
      tests` finds nothing
- [x] The ADR's guards on `scripts/sizes.mjs` select it and pass; `npm test`
      and `node --check` are green; `waypost doctor` reports 0 issues.
      — evidence: `tests/sizes.test.mjs#"the disk-hygiene ADR's three guards select scripts/sizes.mjs and all"`, `:494`,
      `tests/toolchains.test.mjs#"node --check passes on scripts/toolchains.mjs"`; `npm test` 409/409; `waypost doctor`
      0 issues, 0 warnings with the ADR accepted

## Final Summary

Landed in b3a6f9a with the ADR's acceptance.

**What changed.**
- Tool knowledge moved from code to data. `toolchains/*.json` has 47
  entries:
  - 135 machine caches with per-OS paths and per-OS confidence:
    - darwin: 29 verified, 5 documented, 47 inferred;
    - linux: 24 documented, 39 inferred;
    - win32: 20 documented, 25 inferred.
  - 42 project artifacts, one of them a shipped pattern.
  - Skip names and one locator.

  Every item states `regenerable`. 28 caches are not regenerable: archives,
  crash reports and core dumps, temp directories, simulator devices,
  container data, downloaded models, editor workspace state.
- `scripts/toolchains.mjs` loads the shipped entries, then a project's
  `.waypost/toolchains/` entries as data only: `id`, `name`, single-segment
  `detect.manifests`, and name/prefix artifacts rebuilt field by field. Every
  other field, and any pattern, is dropped with a note. It also resolves cache
  paths with their source and holds the locator that moved out of the
  scanner.
- `scripts/sizes.mjs` names no tool, and the three ADR guards pass. The walk
  invariants are unchanged. Locators run generically after the walk, charged
  to the same budget. The flat `scripts/sizes-global.json` is gone.
- `bin/waypost size` keeps its flags. `--global` shows each path's tool and
  source, and `--json` carries the loader's notes.
- Also new: `docs/toolchains.md`, `toolchains/` in `package.json`'s `files`,
  and a CHANGELOG entry.

**Why.** The owner's rule that Waypost is universal (ADR Decisions 1 and 3):
the first implementation carried Xcode and one machine in its core.

**Tests executed.**
- `npm test` 409/409, `node --check`, and `waypost doctor` 0 issues and 0
  warnings with the ADR accepted.
- Before-and-after runs found the same paths: `waypost size --project` on this
  repository and on a second, larger local project, and `--global`. Byte
  counts moved only with live build activity.

**Review.**
- Two rounds of lead review of the diff:
  - comments naming other projects removed;
  - project artifacts rebuilt field by field;
  - patterns and out-of-project manifests refused from project entries;
  - `os` never empty;
  - models and editor workspace state marked not regenerable;
  - `plutil` dropped from Xcode detection.
- `waypost-reviewer` found all eight criteria met; its four nits are fixed.

**Risks and follow-ups.**
- `ask`, `clean_argv`, `processes` and `detectors` land with the discovery
  and clean stories.
- On Windows, resolved cache paths can mix separators. This is checked in
  the verification story.
- The `clean` texts written for artifacts are prose, unverified against each
  tool's CLI. The clean story never runs prose.
- `regenerable`, `stale_days` and `clean` on a project entry are normalized
  without a note.
- Found in passing: `waypost commit --dry-run` leaves files staged
  (`scripts/commit.mjs:213-236`). It is a separate task.

## Technical Notes

- Pure node, no dependencies; comments and strings in English (`AGENTS.md`).
- This story writes nothing to disk; `scripts/sizes.mjs` only measures.
- `confidence: verified` for an OS only after a run on that OS (the
  verification story); the macOS measurements of 2026-09-14 keep `verified`
  for darwin.

## Dependencies

- The ADR above, accepted.

## Attachments

-

---

*Last updated: 2026-09-14*
