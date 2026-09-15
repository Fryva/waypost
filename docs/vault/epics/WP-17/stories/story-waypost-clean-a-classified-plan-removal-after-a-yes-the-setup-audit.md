---
type: story
id: "story-waypost-clean-a-classified-plan-removal-after-a-yes-the-setup-audit"
epic: "WP-17"
title: "waypost clean: a classified plan, removal after a yes, the setup audit"
status: planned
priority: p2
assignee: "Ivan Morozov"
created: 2026-09-14
updated: 2026-09-14
external_refs: {}
tags: []
code_refs: ["scripts/cleanup.mjs (planned)", "scripts/sizes.mjs", "scripts/presence.mjs", "bin/waypost", "prompts/cleanup.md (planned)", "skills/waypost-doctor/SKILL.md", "tests/cleanup.test.mjs (planned)"]
specs: []
blocked_by: ["WP-17/story-discovery-and-the-profile-the-scheme-of-what-waypost-works-with"]
started_at: null
closed_at: null
plan_updated_at: null
---

# waypost clean: a classified plan, removal after a yes, the setup audit

| Field | Value |
|---|---|
| **Epic** | [WP-17](../epic.md) |
| **Status** | planned |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Classify what the scans find and remove only after a yes, as the ADR
[Disk hygiene by discovery](../../../adr/disk-hygiene-by-discovery-a-toolchain-registry-a-machine-and-project-profile-and-cleanup-only-after-a-yes.md)
decides (Decisions 4–6):
- a compute-only plan in `scripts/cleanup.mjs`;
- `waypost clean` in `bin/waypost`, which removes exactly what was agreed and
  logs it;
- the audit as the last step of `waypost setup`.

## Decomposition

- [ ] `scripts/sizes.mjs`: a read-only `newest_mtime` per item.
- [ ] Tool versions in the machine profile, for the detector that finds a
      toolchain duplicating another at the same version (deferred from the
      discovery story; the ADR's "with versions").
- [ ] `scripts/cleanup.mjs` computes keep / should / can, each with a reason:
      - in use — the registry's process names, plus 10-minute recency (recency
        alone where the process table is unavailable);
      - leases and live peers;
      - `regenerable`, which defaults to false;
      - `stale_days` and the project limit;
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

<!-- Written at the work-start gate (waypost story plan), after the ADR is
     accepted and the discovery story has landed. -->

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

*Last updated: 2026-09-14*
