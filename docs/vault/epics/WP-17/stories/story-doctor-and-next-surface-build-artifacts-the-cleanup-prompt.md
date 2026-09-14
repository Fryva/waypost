---
type: story
id: "story-doctor-and-next-surface-build-artifacts-the-cleanup-prompt"
epic: "WP-17"
title: "doctor and next surface build artifacts"
status: planned
priority: p2
assignee: "Ivan Morozov"
created: 2026-09-14
updated: 2026-09-14
external_refs: {}
tags: []
code_refs: ["scripts/doctor.mjs", "bin/waypost", "README.md", "AGENTS.md", "CHANGELOG.md"]
specs: []
blocked_by: ["WP-17/story-waypost-clean-a-classified-plan-removal-after-a-yes-the-setup-audit"]
started_at: null
closed_at: null
plan_updated_at: null
---

# doctor and next surface build artifacts

| Field | Value |
|---|---|
| **Epic** | [WP-17](../epic.md) |
| **Status** | planned |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Put the scan where agents already look, as the ADR
[Disk hygiene by discovery](../../../adr/disk-hygiene-by-discovery-a-toolchain-registry-a-machine-and-project-profile-and-cleanup-only-after-a-yes.md)
decides (Decision 7): a `build-artifacts` warning in `waypost doctor`, the
matching item in `waypost next` pointing at `waypost clean`, and the docs.
No hook and no new standing-context text. The cleanup procedure
(`prompts/cleanup.md`) lands with `waypost clean`.

## Decomposition

- [ ] `scripts/doctor.mjs`: the `build-artifacts` check in `runVaultChecks`,
      beside the one `readVaultConfig` read; limit `build_artifacts_limit_gb`
      (default 5), overridden by `WAYPOST_BUILD_LIMIT_GB`, a value that is not
      a positive number itself a `warn`; always the fixed entry budget;
      `warn` above the limit
      (`≥ N GB` when the scan stopped), `info` when it stopped below.
- [ ] `scripts/doctor.mjs`: a `toolchains` `warn` for each field the loader
      dropped from a project's `.waypost/toolchains/` entry (ADR Decision 1).
- [ ] `bin/waypost`, `handleNext`: `repairFor` gains
      `"build-artifacts": "waypost clean"`; `build-artifacts` joins the `info`
      forwarding beside `agent-roles` and `agents-block`.
- [ ] `README.md` and `AGENTS.md`: the `profile`, `size` and `clean` rows in
      the command table (told apart from `storage`), the policy key, the
      environment variable; `CHANGELOG.md`.
- [ ] Tests for each acceptance criterion below.

## Implementation Plan

From a `waypost-planner` pass (2026-09-14), grounded in the code; the repair
pointer and the budget source updated for the ADR:

1. `scripts/doctor.mjs` — a static `import` of the scan beside the sibling
   imports: `runVaultChecks` is synchronous, so a dynamic `import()` could not
   be awaited there. A pure `checkBuildArtifacts(scan, vaultCfg)` after
   `checkGuards`, wired in `runVaultChecks` after the guards with its own
   try/catch, outside the stop-on-throw `guarded` loop, using the one
   `vaultCfg` already read. Messages:
   - over the limit: "Build artifacts and dev caches use N GB, over the L GB
     limit — `waypost clean` for the plan."
   - stopped over it: "… use ≥ N GB, over the L GB limit (stopped after M
     entries) — `waypost clean` for the plan."
   - stopped under it (`info`): "Build-artifact scan stopped after M entries,
     still under the L GB limit — `waypost clean` for the full figure."
2. `bin/waypost` — `repairFor["build-artifacts"] = "waypost clean"`, and
   `build-artifacts` joins the `info` forwarding in `handleNext`.
3. `AGENTS.md` — the rows beside `storage`, `build_artifacts_limit_gb` among
   the policy keys, `WAYPOST_BUILD_LIMIT_GB` among the environment variables;
   `README.md` — the command-table rows only; `CHANGELOG.md` — `### Added`
   under `[Unreleased]`.
4. Tests: `checkBuildArtifacts` fed a real small stopped scan; end to end on a
   bound fixture with a `.build/` and `build_artifacts_limit_gb: 0.000001`;
   the environment override across `bin/waypost` → `doctor`; the `next`
   output.

## Acceptance Criteria

- [ ] On a bound fixture project whose artifacts exceed the limit,
      `waypost doctor --json` has a `warn` with check `build-artifacts` in the
      `vault` group; below the limit there is no such finding.
- [ ] With a budget smaller than the tree, a scan above the limit warns with
      `≥`, and a scan stopped below it yields an `info` naming `waypost clean`.
- [ ] The limit comes from `<vault>/.projectstore.json`
      (`build_artifacts_limit_gb`), `WAYPOST_BUILD_LIMIT_GB` overrides it, and
      a value that is not a positive number is a `warn`.
- [ ] Repeated `waypost doctor --json` runs on the same tree give the same
      `build-artifacts` result.
- [ ] A project toolchain entry carrying `ask` gives a `toolchains` warning
      naming the file and the field.
- [ ] `waypost next` lists the warning and the stopped-scan `info` with
      `waypost clean` as the command.
- [ ] `README.md` and `AGENTS.md` name `waypost profile`, `waypost size` and
      `waypost clean`, the policy key and the environment variable;
      `CHANGELOG.md` has the entry.
- [ ] `npm test` is green (the standing-context budget test included) and
      `waypost doctor` reports 0 issues on Waypost itself.

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

- `doctor` is deterministic: the budget is a fixed count, never a clock, the
  same on every machine.
- `next` already forwards every `warn` at priority 4; only the `repairFor`
  entry and the `info` forwarding change.

## Dependencies

- `story-waypost-clean-a-classified-plan-removal-after-a-yes-the-setup-audit`
  (the command the warning points to).

## Attachments

-

---

*Last updated: 2026-09-14*
