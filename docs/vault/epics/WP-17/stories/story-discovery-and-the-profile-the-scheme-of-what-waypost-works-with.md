---
type: story
id: "story-discovery-and-the-profile-the-scheme-of-what-waypost-works-with"
epic: "WP-17"
title: "Discovery and the profile: the scheme of what Waypost works with"
status: planned
priority: p2
assignee: "Ivan Morozov"
created: 2026-09-14
updated: 2026-09-14
external_refs: {}
tags: []
code_refs: ["scripts/toolchains.mjs", "toolchains/", "scripts/sizes.mjs", "bin/waypost", "docs/toolchains.md", "tests/toolchains.test.mjs"]
specs: []
blocked_by: ["WP-17/story-waypost-size-the-read-only-scan-project-and-global"]
started_at: null
closed_at: null
plan_updated_at: null
---

# Discovery and the profile: the scheme of what Waypost works with

| Field | Value |
|---|---|
| **Epic** | [WP-17](../epic.md) |
| **Status** | planned |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

After installation Waypost gathers what the machine and the project use and
keeps it as a profile — the scheme it works with, as the ADR
[Disk hygiene by discovery](../../../adr/disk-hygiene-by-discovery-a-toolchain-registry-a-machine-and-project-profile-and-cleanup-only-after-a-yes.md)
decides (Decision 2): which registry tools are present, where their caches
really are (asked from the tool, then the environment, then the default), and
the project's ecosystems. `waypost size --global` then measures what the
profile found instead of a fixed list.

## Decomposition

- [ ] Detection: each entry's `detect` — executables looked up (never run) on
      `PATH`, through `PATHEXT` on Windows, and project manifests.
- [ ] Asking: each present tool's `ask` argv from the shipped registry (a
      project entry cannot carry one), run without a shell and with a timeout,
      its output parsed as the entry says; then the environment variable,
      then the per-OS default; every path records its source.
- [ ] The machine state directory per OS: `$XDG_STATE_HOME/waypost` (default
      `~/.local/state/waypost`), `~/Library/Application Support/Waypost`,
      `%LOCALAPPDATA%\Waypost`.
- [ ] Profiles: `machine.<host>.json` there, and
      `.waypost/state/project.<host>.json`; both refreshed when missing, older
      than 30 days, or on `--refresh`.
- [ ] `waypost profile [--refresh] [--json]`; `waypost setup` runs discovery,
      and `setup --dry-run` says what it would discover.
- [ ] `scanGlobal` measures the profile's paths; `scanProject` takes the
      project's artifact locations from it.
- [ ] Tests, hermetic: fake tools on an injected `PATH`, injected platform,
      environment, home and host name.

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), after the ADR is
     accepted and the registry story has landed. -->

## Acceptance Criteria

- [ ] A fake tool on `PATH` that reports a moved cache puts that path in
      `waypost profile --json` with source `asked`; without the tool, the
      environment variable and then the default are used, each with its
      source.
- [ ] A fake tool that hangs or fails is reported, and discovery continues
      within its timeout.
- [ ] With an injected `win32` platform an executable is found through
      `PATHEXT`.
- [ ] The machine state directory resolves per OS from the injected platform
      and environment; two host names sharing one home keep two machine
      profiles, and sharing one checkout keep two project profiles.
- [ ] `waypost setup --dry-run` names the discovery and writes nothing;
      `waypost setup` writes both profiles; a profile older than 30 days is
      refreshed.
- [ ] `waypost size --global` measures the profile's paths.
- [ ] `npm test` is green and `waypost doctor` reports 0 issues.

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

- Profiles hold facts, not policy; `.waypost/state/` is machine-local and
  never committed.
- Discovery runs only the shipped registry's `ask` argv, so `--refresh` needs
  no confirmation.

## Dependencies

- `story-waypost-size-the-read-only-scan-project-and-global` (the registry).

## Attachments

-

---

*Last updated: 2026-09-14*
