---
type: story
id: "story-isolate-item-measurement-behind-the-sizes-facade"
epic: "WP-21"
title: "Isolate item and cache measurement behind the sizes facade"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-24
updated: 2026-10-24
external_refs: {}
tags: []
code_refs: ["scripts/sizes.mjs", "scripts/sizes-measure.mjs", "tests/sizes-measure.test.mjs", "scripts/toolchains.mjs", "scripts/cleanup.mjs", "scripts/doctor-guards.mjs", "tests/sizes.test.mjs", "tests/limit.test.mjs", "tests/cleanup.test.mjs", "tests/toolchains.test.mjs", "tests/discovery.test.mjs", "tests/state-migrate.test.mjs", "tests/doctor-guards.test.mjs", "docs/toolchains.md", "docs/vault/adr/disk-hygiene-by-discovery-a-toolchain-registry-a-machine-and-project-profile-and-cleanup-only-after-a-yes.md", "docs/vault/adr/cleanup-to-a-machine-wide-limit-set-by-the-owner-idle-artifacts-oldest-first.md"]
specs: []
started_at: "2026-10-24T16:52:13.791Z"
closed_at: "2026-10-24T16:59:16.413Z"
plan_updated_at: "2026-10-24T16:52:13.791Z"
---

# Isolate item and cache measurement behind the sizes facade

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

An item or cache measurement task currently reads the 53,545-byte sizes scanner.
Isolate the existing measurement/global projection without changing scan or cleanup.

## Decomposition

- [x] Move literal item/global measurement and metadata blocks with shared defaults.
- [x] Preserve five public bindings, namespace11 and internal dirBytes; carry guards.
- [x] Verify bytes/age/identity/error/budget/policy behavior, parity, tests and review.

## Implementation Plan

Fresh planner at6d4d3a6 selects literal lines74,76–84,274–405,851–962 (13,224B).
sizes-measure.mjs imports readdirSync/lstatSync/statSync, basename/join, homedir,
and loadRegistry/resolveCachePaths directly from toolchains. No backimport.
Facade imports/re-exports metadataNamesOf,inspectDir,cacheCandidates,measureCaches,
scanGlobal with original identities. Export dirBytes internally for scanProject,
never via facade; EMPTY_SET stays private. Remove only resolveCachePaths from
original facade toolchains import. Other imports/callers unchanged.

Preserve platform allocated-byte rule (HOST process.platform, not injected cache
platform), dev/ino hardlink dedup, one seen across caches, root/nested symlink
handling, age metadata exclusions, read errors, other_fs/nested_git/package flags,
root identity, budget checks/deadline cadence and inspectDir result shape.
inspectDir rejects root symlink; measureCaches permits top-level symlink through
stat, without following recursive symlinks. Keep global candidate/profile/current
registry policy, ordering, array .dropped properties and clean_argv identity.
Do not execute tools or remove anything. No policy/budget/consent change.

Preserve architectural guards: in disk-hygiene ADR widen only three scanner
selectors sizes.mjs->sizes*.mjs; forbid regexes and two cleanup selectors unchanged.
Update source/parent/ADR code_refs and docs only. No new ADR/dependency/pilot.
Capture full baseline and exact reverse reconstruction. Frozen complete JS facts,
project/global JSON/CLI and cleanup plans use same owned paths/inodes/clock;
serialization must retain Sets and array .dropped. New env-first regressions cover
binding/namespace, hardlinks/metadata/errors/symlinks/nested/package/budget/deadline,
global profile/current policy/identity and positive/negative guard selection.
Keep existing sizes/limit/cleanup/toolchain/discovery/child-env assertions unchanged.
Run syntax/package and heavy-gated affected checks with source-bound full log;
independent reviewer before close/commit. Measure source sizes without inferring
native-token/runtime/workflow savings or new permission to clean caches.

## Acceptance Criteria

- [x] Literal extraction reverses exactly; five public bindings/namespace11 and shared measurement defaults/state preserved; no private dirBytes leak/backimport. — evidence: move-edits.json, blocks-before.json, measurement.json, tests-attempt-1.log; independent reviewer ship.
- [x] Measurement/global/cleanup-plan facts and CLI/errors match frozen baseline; native safety/budget/profile contracts and all three widened guards verified. — evidence: facts-before.json/facts-after.json, files-before.json/files-after.json, nine new tests in tests-attempt-1.log; reviewer verified current inode identities and guard regex/selector preservation.
- [x] Relevant new/existing regression and protection checks pass through heavy gate; module packaged; independent reviewer accepts source/log identities and honest size/limits. — evidence: validation.json (312 passed, 0 failed, two existing platform skips, exit 0), pack-proof.json; reviewer verified 70 current/68 baseline/11 dirty hashes and manifest/full-log SHA.

## Final Summary

Implemented: sizes.mjs 53,545 -> 40,534 UTF-8 bytes, focused measurement module
13,536 bytes, combined +525 bytes. Literal 13,224-byte extraction and complete
baseline reconstruction are exact. Five public bindings and namespace11 preserved;
private default Set and internal dirBytes remain correctly shared. Full JS facts,
Sets, array .dropped, argv identity, project/global CLI, cleanup plans/rechecks and
fixture contents match on the same paths/inodes. Three scanner guard selectors
now cover both files; regexes and two cleanup guards unchanged. Syntax/package
checks pass. Heavy eight-file contour: 312 passed, 0 failed, two existing platform
skips (314 total), exit 0, 26.413 seconds on Node25.6.1/macOS. All nine new tests
passed. Independent reviewer: ship, no findings; verified source/dirty/log and
current fixture identities. Doctor: 0 issues, 0 warnings. Full CI for this change
is a follow-up. No native-token/runtime/workflow saving measured; no new pilot,
budget, cleanup policy or removal authority.

## Technical Notes

Mechanical extraction under accepted disk-hygiene/cleanup-limit ADRs and ADR0008.
No cleanup execution or policy choice is part of this story.

## Attachments

- .waypost/experiments/wp21-sizes-measure-module-20261024/

---

*Last updated: 2026-10-24*
