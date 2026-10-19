---
type: story
id: "story-prepare-dependency-and-loader-guards-for-the-cli-split"
epic: "WP-21"
title: "Prepare dependency and loader guards for the CLI split"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-19
updated: 2026-10-19
external_refs: {}
tags: []
code_refs: ["tests/helpers/cli-static-closure.mjs", "tests/harness.test.mjs", "tests/sizes.test.mjs"]
specs: []
started_at: "2026-10-19T16:43:33.268Z"
closed_at: "2026-10-19T17:09:57.474Z"
plan_updated_at: "2026-10-19T16:43:33.268Z"
---

# Prepare dependency and loader guards for the CLI split

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Implement the first test-only prerequisite of the accepted CLI split ADR: replace the entry-only team-import regex with a transitive static dependency guard. It must follow imports/re-exports using the Node engine parser without evaluating the CLI. Frozen-U namespace, per-module loading/syntax guards and module moves are subsequent prerequisites; this slice does not claim them complete.

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [x] Add a dependency-free, parse-only child-process graph inspector with fail-closed diagnostics.
- [x] Replace the direct-entry check with a real closure check and meaningful mutation fixtures.
- [x] Verify affected checks/source identity and independent acceptance without moving production code.

## Implementation Plan

Fresh planner selected a standalone test helper invoked once per graph under --experimental-vm-modules. SourceTextModule.dependencySpecifiers supplies the engine-parsed static edges; never link/evaluate. Canonicalize paths under the requested root, skip only Node builtins and reject unresolved syntax/path/package cases. A visited set terminates cycles; report the chain to a forbidden team node. Add the permanent real-entry check and fixtures in harness token-economy, replacing the weaker sizes regex. Child JSON and exit status both gate success. No production module moves. Follow with the frozen-U guard (candidate names plus appended unique exports checked by the engine), mapping/state owners/freeze and per-module checks before migration.

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [x] The current entry static closure excludes canonical scripts/team.mjs and scripts/team-*.mjs, including intermediate modules, side-effect imports and re-exports. Cycles terminate; dynamic imports and import-like text do not create static edges. No checked module is linked or evaluated. — evidence: tests/harness.test.mjs CLI static closure tests; four bound runtime logs.
- [x] Missing/syntactically invalid/out-of-root/unresolved-package dependencies and malformed child reports fail closed with import-path diagnostics. Fixtures prove forbidden edges behind cycles and symlinks cannot escape detection, while top-level throwing source is parsed without execution. — evidence: canonical/syntax/path/package/report fixtures,8 selected checks pass on20/22/24/25.
- [x] Affected tests and independent review pass with bound source/log identities. Production code and pilot/budget unchanged; local Node25 checks do not replace the accepted Node20/22/24 migration gate. Frozen-U and actual module-load/move steps remain explicitly pending. — evidence: verification.json156 source identities; final cli_static_guard_reviewer accepted5 review identities and all3AC.

## Final Summary

Added dependency-free engine-parsed transitive early CLI isolation without linking/evaluating inspected modules. Replaced the entry-only team import regex; covered indirect imports/re-exports/side effects/cycles, dynamic/text exclusions, canonical symlinks, syntax/missing/path/package errors and bad child results.8 selected checks passed on official Node20.20.2/22.23.3/24.22.0 and existing25.6.1 on macOS arm64; Node20 reports111 filter-excluded skips.156 code hashes stayed fixed. Final independent reviewer accepted all3AC without findings. Removed temporary runtimes325603804bytes; retained provenance/logs. Production unchanged; frozen-U/actual loader checks/mapping/freeze remain before migration, full npm/UbuntuCI/other OS and token savings unverified. No native pilot/budget mutation.

## Technical Notes

Implemented test-only closure inspector and5 mutation/real-entry/report tests; production files unchanged. Three syntax checks/diff whitespace passed. Heavy-gated selected checks:8 passed/0 failed on Node25.6.1; the same8 checks passed on official Node20.20.2,22.23.3,24.22.0 on macOS arm64. Node20 reports111 additional filter-excluded tests as skipped;22/24/25 report0 skips. Full npm suite/Ubuntu CI and other OS not exercised; those migration gates remain required before production moves.

All156 checked source hashes matched before/after every run. Evidence `.waypost/experiments/wp21-cli-static-closure-20261019/`: source-before.json, tests-resumed.log, runtime-matrix.json/per-version logs, verification.json. Official runtimes downloaded from nodejs.org; archive SHA256 matched retained official SHASUMS, observed versions and binary hashes in runtime-provenance.json. Removed all owned temporary runtime files (325603804 bytes); runtime-cleanup.json proves the unique temporary root was removed. No project dependency added.

Earlier30s/3m capacity refusals ran no tests; retained tests.log/tests-retry.log and verification-capacity-*.json are historical. Fresh static reviewer found no code defects and verified156 source/5 review identities; final cli_static_guard_reviewer independently accepted all3AC/decomposition,156/156 source and5/5 review identities, all four log hashes/official SHASUMS and runtime cleanup. Verdict story closed / commit; no findings. Subsequent lifecycle metadata and derived views record this accepted snapshot. Frozen-U, actual module loading/syntax enumeration, dependency/state ownership mapping/freeze and module moves remain subsequent prerequisites. No native pilot/budget mutation; no savings claim.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-19*
