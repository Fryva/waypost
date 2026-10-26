---
type: story
id: "story-make-session-identity-call-time-tests-portable-across-node-runtimes"
epic: "WP-21"
title: "Make session identity call-time tests portable across Node runtimes"
status: in-progress
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-26
updated: 2026-10-26
external_refs: {}
tags: []
code_refs: ["tests/lib-session-identity.test.mjs", "scripts/lib-session-identity.mjs", "tests/commits.test.mjs"]
specs: []
started_at: "2026-10-26T05:27:28.815Z"
closed_at: null
plan_updated_at: "2026-10-26T05:27:28.815Z"
---

# Make session identity call-time tests portable across Node runtimes

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | in-progress |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Restore the Node20/22/24 CI matrix after the session identity call-time test observed native parent PID instead of its data-property override on Node20/22. Production session derivation stays unchanged.

## Decomposition

- [x] Retain failed CI diagnostics and verify a portable parent-PID accessor on real supported runtimes.
- [x] Replace only the test mock, add readback/read-count controls and captured-PID mutation negative control.
- [ ] Verify focused runtime matrix, independent review and successful full CI matrix.

## Implementation Plan

CI40267309102: Node20/22 fail only defaults/hostname/ppid test; Node24 passes. Replace Object.defineProperty(process,ppid,{...descriptor,value}) with explicit JS accessor on the real process object, configurable/enumerable/get only, installed BEFORE importing the leaf. Closure parent starts at sentinel7, switches to123/456; direct readback proves mock works, record getter reads excluding those controls. Keep real process object, current argv/env replacements and hostname mock; no production changes, skip or native-PID expectation fallback. Explicit/env paths and import must not read ppid, each fallback reads once. Temporary copied-source mutant captures ppid at import; guarded exact substitution must make it fail the same expectations while positive controls still work. Use actual Node20/22/24 temporary runtimes, record versions/binary hashes/argv/source/log identities, prove old test fails20/22 where reproducible and repaired test passes all. Install runtimes only in owned temp dirs, no repo/global dependency change. Fresh reviewer before close/commit. Publish the reviewed test fix with this story still in-progress; close only after the full GitHub matrix passes, in a documentation-only follow-up with identical tested sources. Push fix, await full GitHub matrix; do not call CI green until all three pass. No new ADR/native model pilot/savings claim.

## Acceptance Criteria

- [x] Production files/API behavior unchanged; test uses real process accessor with two readback controls, expected call-time values and getter counts, no skip/fallback weakening.
- [x] Import-time captured-ppid mutant is rejected while controls work; focused tests pass on real Node20/22/24 with retained source/runtime evidence.
- [ ] Independent reviewer approves, Doctor0/0 and full GitHub Node20/22/24 CI passes; prior failure retained and Memory corrected.

## Final Summary

Local matrix verified: old test fails Node20.20.2/22.23.4 and passes24.22.1; fixed test and captured-PID mutation negative control pass8/8 with0fail/skip on all three. All scripts/ and bin/ file hashes unchanged. Independent reviewer approves the test-only commit, no findings; full CI gate pending; story remains in-progress. Evidence: `.waypost/experiments/wp21-ci-session-identity-20261026/` (failed CI excerpts, before/after runtime results, production manifests and source identity).

## Technical Notes

Do not copy native descriptor value/writable fields into the accessor descriptor. Do not replace expected123/456 with the actual process parent PID or suppress a failed mock with a platform skip. Runtime installations and mutation copies are temporary test artifacts only.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-26*
