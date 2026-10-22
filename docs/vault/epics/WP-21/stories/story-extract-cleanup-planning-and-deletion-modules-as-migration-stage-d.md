---
type: story
id: "story-extract-cleanup-planning-and-deletion-modules-as-migration-stage-d"
epic: "WP-21"
title: "Extract cleanup planning and deletion modules as migration stage d"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-22
updated: 2026-10-22
external_refs: {}
tags: []
code_refs: ["bin/waypost.mjs", "bin/cli/core.mjs", "bin/cli/clean-plan.mjs", "bin/cli/remove.mjs", "bin/cli/deleter.mjs", "tests/harness.test.mjs", "tests/scripts.test.mjs", "tests/cleanup.test.mjs", "tests/limit.test.mjs", "tests/slots.test.mjs", "docs/how-it-works.md", "docs/vault/adr/disk-hygiene-by-discovery-a-toolchain-registry-a-machine-and-project-profile-and-cleanup-only-after-a-yes.md"]
specs: []
started_at: "2026-10-22T02:36:19.435Z"
closed_at: "2026-10-22T04:09:30.427Z"
plan_updated_at: "2026-10-22T02:36:19.435Z"
---

# Extract cleanup planning and deletion modules as migration stage d

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Execute only accepted cohesion revision d after stage c passed full exact-tree Ubuntu20/22/24 CI39708914803 and independent closure. Extract cleanup planning, removal helpers and detached deleter while preserving bodies, shared state, startup and early command semantics. Entry expected78902bytes under fixed79000cap, modules<=24000, exact16CLI files. Preserve all12existing modules, including corrected core14613. Current metadata49eda96 has same405source inputs as green1b7eb94. Stage e requires new full matrix and independent acceptance. No native pilot/budget change.

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [x] Reconstruct complete stage-d candidate against frozen baseline and install only entry plus clean-plan/remove/deleter; preserve12existingmodules.
- [x] Update fixed inventory/budget and intermediate docs, preserve namespace/module/closure/state/loader guards, verify cleanup/limit/slot/deleter/early-route regressions.
- [x] Obtain source-bound local checks, independent prepared review and full exact-tree Ubuntu20/22/24 CI before closure or stage e.

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

Read-only planner confirmed accepted ownership/DAG,12unchanged modules, marker/rename/spawn/adoption/recheck protections, shim-root child spawning and early deletion before session binding. Retain intermediate static deleter bridges; syntax failure occurs before lazy onFail on this stage, so use one valid synthetic early-handler fixture to verify args/this/await/pre-session state without deletion. Disk-hygiene ADR why/source pointers update only; its guard scopes and policy remain unchanged.

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [x] Entry and three new modules match reviewed stage-d candidate; all12existingmodules, moved bodies, shared ownership, startup and early deletion/MCP semantics remain compatible. Entry<=79000UTF-8bytes, modules<=24000, exact16-file inventory; advisory16000 threshold remains distinct from hard ceiling.
- [x] Fixed inventory/byte/namespace/syntax/import/early-closure/core-state/lazy-dispatch guards and meaningful cleanup/limit/slot/deleter/early-route regressions pass. Documentation/package/shim/root discovery remain correct; no private evidence ships.
- [x] Independent reviewer accepts prepared code, then full Ubuntu Node20/22/24 npm-test/bind/doctor CI passes its exact tree before closure or stage e. Main stays isolated; no measured savings/quota attribution or native pilot/allowance change.

## Final Summary

Published stage d as269b7e8b2e2e482bb4d26a665c3a18a95c3f8424 on codex/cli-modularization/PR#2. Entry78902<=79000bytes; newclean-plan18016/remove11661/deleter11465 exactly match reviewed candidate;27moved functions+4constants unchanged, all12previousmodules byte-identical. Exact16-file inventory/modulecap24000, advisory16000 remains distinct. Marker/rename/rollback/shim-rootspawn/adoption/live-marker/recheck/finally protections preserved. New valid synthetic early-deleter fixture verifiesargs/this/await/pre-session state without deletion; intermediate static bridges remain legal.

Full Ubuntu [CI39713413199](https://github.com/Fryva/waypost/actions/runs/39713413199) SUCCESS: Node20.20.2 1950tests/1947pass/0fail/3skip; Node22.23.3 and24.21.0 each1953tests/1950pass/0fail/3skip. Every npm-test/bind/doctor step succeeds; doctor0issues2existing WP18warnings. Checkoutmerge8a6d7101d7d2e2c7864ea47a226dcbb7b3ff8272 and head share tree6ec87a5ac3a7bca3ccebe3882fbab4bca375a443. All408source hashes stable. Local eight-suite524tests/519pass/0fail/5skip plus independent7loader/all16syntaxchecks, parity and package evidence remain source-bound.

Independent closure reviewer verifies13prepared/408source/12closure-evidence identities and GitHub tree/status, all3ACmet/no findings, verdict story closed/commit. Private primary .waypost/experiments/wp21-cli-stage-d-20261022/{closure-inputs,closure-review-verdict,ci-analysis,ci-tree-identity}.json plus full logs/REST receipts. Own candidate213408bytes/packcache1250150bytes removed. Two later stages remain; main isolated. Final14000entry, measured savings/quota attribution and native pilot are not claimed; budget unchanged.

Prepared local verification: Node25.6.1/macOS, eight affected suites exit0:524tests/519pass/0fail/5platform skips,180061.811292ms. All408source hashes stable. New valid synthetic early-deleter fixture proves exact args, unbound receiver, await, no session identity/machine state before early route. Existing detached-leftover/adoption/live-marker, cleanup/recheck and slot regressions pass. Help/version/unknown exit/stdout/stderr parity passed; pack includes shim,78902byte entry and15modules;12previousmodules unchanged. Doctor0issues2oldWP18warnings. Historical prepared-state note: review/full matrix were pending at that local checkpoint; successful full CI and independent closure acceptance above supersede that state. Private source-bound evidence primary .waypost/experiments/wp21-cli-stage-d-20261022/.

## Technical Notes

Authoritative retained candidate primary .waypost/experiments/wp21-cli-layout-20261021/{candidate-manifest.json,patches/stage-d.patch,generator.py.txt}. Independent baseline patch SHA2564781ef96c47da0826e6722bd691080672b8f5b2bacf76ea164f81912444072c4; not a delta on current stagec. Frozen204781byte compressed source fixture. Expected entry78902 SHA256cfe02410ac51b98edba451b3282de8821997b35aae1b177934b488415db68c7e. New clean-plan18016/remove11661/deleter11465bytes; clean-plan exceeds advisory16000, remains below approved hard24000 and must not be minified/split differently. Preserve corrected core14613 SHA2362ba34127126bf60d65ee4940ecdae240f124bacf8c11e40375ec9ce95f975 and all11other currentmodules. Stagec full acceptance primary wp21-cli-stage-c-20261022/{ci-analysis,ci-tree-identity,closure-review-verdict}.json.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-22*
