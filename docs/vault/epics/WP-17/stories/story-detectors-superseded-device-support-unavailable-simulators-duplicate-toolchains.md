---
type: story
id: "story-detectors-superseded-device-support-unavailable-simulators-duplicate-toolchains"
epic: "WP-17"
title: "Detectors: superseded device support, unavailable simulators, duplicate toolchains"
status: planned
priority: p2
assignee: "Ivan Morozov"
created: 2026-09-18
updated: 2026-09-18
external_refs: {}
tags: []
code_refs: ["scripts/toolchains.mjs", "scripts/discovery.mjs", "toolchains/", "tests/toolchains.test.mjs"]
specs: []
blocked_by: ["WP-17/story-waypost-clean-a-classified-plan-removal-after-a-yes-the-setup-audit"]
started_at: null
closed_at: null
plan_updated_at: null
---

# Detectors: superseded device support, unavailable simulators, duplicate toolchains

| Field | Value |
|---|---|
| **Epic** | [WP-17](../epic.md) |
| **Status** | planned |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

The detectors the ADR [Disk hygiene by discovery](../../../adr/disk-hygiene-by-discovery-a-toolchain-registry-a-machine-and-project-profile-and-cleanup-only-after-a-yes.md) names in Decisions 1
and 4, deferred from the clean story (2026-09-18): named, small pure checks
that prove a machine cache item dead, with their evidence, so the plan can
class it `should` inside a directory of versions that stays `manual` as a
whole. Also the tool versions in the machine profile the duplicate-toolchain
detector needs.

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [ ] `DETECTOR_IMPLS`, `applicableDetectors`, `runDetector` beside the
      locators in `scripts/toolchains.mjs`; each spawns only its shipped
      query, by absolute path, no shell, with a timeout.
- [ ] Device support folders whose OS version matches no device the platform
      tool reports as paired (without that report, at most `can`).
- [ ] Simulators the platform tool reports unavailable.
- [ ] Tool versions in the machine profile; a toolchain that duplicates
      another at the same version.
- [ ] Each detector's query documented (URL) and run live on its OS before
      its confidence is `verified`.

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [ ] Each detector's item is `should` with its evidence, and nothing it
      cannot prove is more than `can`.
- [ ] A detector whose query fails or times out yields nothing, with a note.
- [ ] `npm test` is green and `waypost doctor` reports 0 issues.

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-09-18*
