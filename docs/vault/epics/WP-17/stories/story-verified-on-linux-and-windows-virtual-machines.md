---
type: story
id: "story-verified-on-linux-and-windows-virtual-machines"
epic: "WP-17"
title: "Verified on Linux and Windows virtual machines"
status: planned
priority: p2
assignee: "Ivan Morozov"
created: 2026-09-14
updated: 2026-09-14
external_refs: {}
tags: []
code_refs: ["toolchains/", "docs/toolchains.md"]
specs: []
blocked_by: ["WP-17/story-doctor-and-next-surface-build-artifacts-the-cleanup-prompt"]
started_at: null
closed_at: null
plan_updated_at: null
---

# Verified on Linux and Windows virtual machines

| Field | Value |
|---|---|
| **Epic** | [WP-17](../epic.md) |
| **Status** | planned |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Run what the epic built on the owner's Linux and Windows virtual machines
(Parallels, sharing this checkout) and record the evidence, as the ADR
[Disk hygiene by discovery](../../../adr/disk-hygiene-by-discovery-a-toolchain-registry-a-machine-and-project-profile-and-cleanup-only-after-a-yes.md)
decides (Decision 8). A registry entry becomes `verified` for an OS only from
these runs.

## Decomposition

- [ ] Linux: `npm test`, `waypost profile --refresh --json`,
      `waypost size --project --json`, `waypost size --global --json`, and a
      `waypost clean --json` plan; record the OS and Node versions and the
      outputs.
- [ ] Windows: the same, from PowerShell and from Git Bash; plus a directory
      junction inside a scanned tree and swapped in for a planned item, and a
      path longer than 260 characters in a scanned and in a removed tree.
- [ ] Time `waypost doctor` with the fixed entry budget on each machine; if
      one is too slow, lower the constant for all.
- [ ] Windows cache paths: a `$LOCALAPPDATA` value joined with a template's
      `/` gives mixed separators; check the output and the trailing-`*`
      expansion, and normalize if needed.
- [ ] Fix what breaks, each fix with a hermetic test that reproduces it.
- [ ] Set `confidence: verified` for linux or win32 only on entries whose
      paths these runs found; the rest keep `documented` or `inferred`.
- [ ] Offer the owner the retirement of the personal script and Stop hook.

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan). -->

## Acceptance Criteria

- [ ] `npm test` is green on both virtual machines; the Final Summary records
      the OS and Node versions and the commands run.
- [ ] Every entry marked `verified` for linux or win32 has a recorded run that
      found its path.
- [ ] `waypost clean` on both machines prints a plan and removes nothing
      without a yes.
- [ ] On Windows the scan never follows a junction, `clean` never removes
      through one, and a long path is measured and removed or reported.
- [ ] `doctor`'s time with the fixed budget is recorded for each machine.
- [ ] Fixes found on the machines land with hermetic tests; `waypost doctor`
      reports 0 issues.

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

- The checkout is shared with the macOS host. While a macOS session is live,
  presence shows it as a peer, so the plan on the virtual machines must keep
  project artifacts at most `can` — a check in itself.
- Guest-host setup: shared Memory symlink, CLI symlink, local skills.
- Known from the discovery story (2026-09-15), unverified until these runs:
  - its tests fake tools as `#!/bin/sh` scripts, 16 of them in
    `tests/discovery.test.mjs`, `tests/toolchains.test.mjs` and
    `tests/scripts.test.mjs`, with no `win32` skip;
  - the hermetic `setup` env in `tests/harness.test.mjs` and
    `tests/scripts.test.mjs` finds git with `which` and symlinks it.

  Neither runs on Windows as written. Expect to skip the shell fakes on
  `win32` or give them a Windows fake, and to find git with `findOnPath` and
  put its own directory on `PATH` instead of a symlink.
- Asking a tool, to check live:
  - the python `ask` looks for `pip`, and some Linux distributions ship only
    `pip3`;
  - deno's `ask` reads the `denoDir` key of `deno info --json`, a key the
    docs page does not show;
  - `pnpm store path` and `yarn cache dir` (v1) may print a version
    subdirectory (`store/v3`, `Yarn/v6`), which would leave older versions
    unmeasured;
  - time `conda info --json` and a first `dotnet` run against the 3 s ask
    timeout.

## Dependencies

- `story-doctor-and-next-surface-build-artifacts-the-cleanup-prompt`.

## Attachments

-

---

*Last updated: 2026-09-14*
