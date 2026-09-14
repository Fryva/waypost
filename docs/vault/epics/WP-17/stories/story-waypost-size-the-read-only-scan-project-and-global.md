---
type: story
id: "story-waypost-size-the-read-only-scan-project-and-global"
epic: "WP-17"
title: "The toolchain registry and a tool-agnostic waypost size"
status: in-progress
priority: p2
assignee: "Ivan Morozov"
created: 2026-09-14
updated: 2026-09-14
external_refs: {}
tags: []
code_refs: ["toolchains/", "scripts/toolchains.mjs", "scripts/sizes.mjs", "bin/waypost", "package.json", "docs/toolchains.md", "tests/sizes.test.mjs", "tests/toolchains.test.mjs", "CHANGELOG.md"]
specs: []
started_at: "2026-09-14T16:28:58.090Z"
closed_at: null
plan_updated_at: "2026-09-14T16:28:58.090Z"
---

# The toolchain registry and a tool-agnostic waypost size

| Field | Value |
|---|---|
| **Epic** | [WP-17](../epic.md) |
| **Status** | in-progress |
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

- [ ] `toolchains/<id>.json`, one per tool, in the ADR's format: `os`,
      `confidence` per OS with `docs` or `notes`, `detect`, `artifacts`,
      `caches` (environment variable, then a per-OS default), `skip` names
      and named locators; every cache and artifact states `regenerable`.
      `ask`, `clean_argv`, `processes` and `detectors` arrive with the
      stories that run them. The conventional names every ecosystem uses are
      the `generic` entry.
- [ ] Port the 129 entries of `scripts/sizes-global.json` into their tools'
      entries, keeping each OS's confidence, docs and notes; remove the flat
      file and `loadGlobalList`.
- [ ] `scripts/toolchains.mjs`: loader and schema check, shipped entries plus
      `<project>/.waypost/toolchains/` entries as data only (`detect`
      manifests and `artifacts` inside the project; every other field dropped
      and reported); path resolution; the named locators, including the Xcode
      DerivedData match moved out of `scripts/sizes.mjs`.
- [ ] `scripts/sizes.mjs`: names, prefixes, patterns and skip names from the
      registry; `CACHEDIR.TAG`, the git-ignore and tracked-file rules, the
      budget and the accounting unchanged; no tool named anywhere in the file.
- [ ] `bin/waypost size`: same flags; `--global` says where each path came
      from.
- [ ] `docs/toolchains.md`: the entry format and the confidence levels, as
      `docs/harnesses.md` does for harnesses.
- [ ] Tests: the scan fixtures kept, fed by a test registry; a schema pass over
      every shipped entry; override precedence; the ADR's guards on
      `scripts/sizes.mjs` end to end (replacing the test keyed to the removed
      draft, `tests/sizes.test.mjs:506-512`).

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

- [ ] Every shipped `toolchains/*.json` passes the schema test: `os` and a
      `confidence` for each OS listed, `docs` for `documented`, `notes` for
      `inferred`, `regenerable` stated on every cache and artifact.
- [ ] The existing project-scan fixtures pass with names from the registry:
      nested tags counted once, an ignored `build/` counted and a tracked
      `src/build/` not, symlink loops not followed, hard links once, the
      stopped-scan JSON shape, `$HOME` and `/` refused.
- [ ] On macOS the Xcode DerivedData match still finds a project's folder,
      now through the Xcode entry; on other platforms the locator does not run.
- [ ] A `.waypost/toolchains/` entry adds a name the scan then counts, and
      with a shipped entry's `id` extends that entry's project artifacts.
- [ ] A project entry's `ask`, `clean_argv`, project clean command, processes,
      detectors or machine cache fields are dropped and reported, and an
      artifact that resolves outside the project is refused.
- [ ] `waypost size --global` on a temporary home lists only paths that exist
      on this OS, each with its source and clean text.
- [ ] `scripts/sizes-global.json` is gone and nothing refers to it.
- [ ] The ADR's guards on `scripts/sizes.mjs` select it and pass; `npm test`
      and `node --check` are green; `waypost doctor` reports 0 issues.

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

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
