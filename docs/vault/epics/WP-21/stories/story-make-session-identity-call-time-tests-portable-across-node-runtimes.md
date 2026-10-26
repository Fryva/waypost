---
type: story
id: "story-make-session-identity-call-time-tests-portable-across-node-runtimes"
epic: "WP-21"
title: "Make session identity call-time tests portable across Node runtimes"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-26
updated: 2026-10-26
external_refs: {}
tags: []
code_refs: ["tests/lib-session-identity.test.mjs", "scripts/lib-session-identity.mjs", "tests/commits.test.mjs"]
specs: []
started_at: "2026-10-26T05:27:28.815Z"
closed_at: "2026-10-26T06:07:08.823Z"
plan_updated_at: "2026-10-26T05:27:28.815Z"
---

# Make session identity call-time tests portable across Node runtimes

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Restore the Node20/22/24 CI matrix after the session identity call-time test observed native parent PID instead of its data-property override on Node20/22. Production session derivation stays unchanged.

## Decomposition

- [x] Retain failed CI diagnostics and verify a portable parent-PID accessor on real supported runtimes.
- [x] Replace only the test mock, add readback/read-count controls and captured-PID mutation negative control.
- [x] Verify focused runtime matrix, independent review and successful full CI matrix.

## Implementation Plan

CI40267309102: Node20/22 fail only defaults/hostname/ppid test; Node24 passes. Replace Object.defineProperty(process,ppid,{...descriptor,value}) with explicit JS accessor on the real process object, configurable/enumerable/get only, installed BEFORE importing the leaf. Closure parent starts at sentinel7, switches to123/456; direct readback proves mock works, record getter reads excluding those controls. Keep real process object, current argv/env replacements and hostname mock; no production changes, skip or native-PID expectation fallback. Explicit/env paths and import must not read ppid, each fallback reads once. Temporary copied-source mutant captures ppid at import; guarded exact substitution must make it fail the same expectations while positive controls still work. Use actual Node20/22/24 temporary runtimes, record versions/binary hashes/argv/source/log identities, prove old test fails20/22 where reproducible and repaired test passes all. Install runtimes only in owned temp dirs, no repo/global dependency change. Fresh reviewer before close/commit. Publish the reviewed test fix with this story still in-progress; close only after the full GitHub matrix passes, in a documentation-only follow-up with identical tested sources. Push fix, await full GitHub matrix; do not call CI green until all three pass. No new ADR/native model pilot/savings claim.

## Acceptance Criteria

- [x] Production files/API behavior unchanged; test uses real process accessor with two readback controls, expected call-time values and getter counts, no skip/fallback weakening. — evidence: `production-before.json`, `production-after.json`, focused source/receipts.
- [x] Import-time captured-ppid mutant is rejected while controls work; focused tests pass on real Node20/22/24 with retained source/runtime evidence. — evidence: `after-runtime-results.json`, `after-node20.log`, `after-node22.log`, `after-node24.log`.
- [x] Independent reviewer approves, Doctor0/0 and full GitHub Node20/22/24 CI passes; prior failure retained and Memory corrected. — evidence: `review-final.json`, `doctor.json`, `ci-final.json` (CI40274963836), shared Memory topic.

## Final Summary

Fixed the test-only native ppid mock in ad61e03; production code/API unchanged (all121 scripts/bin hashes exact). Old test fails on actual Node20.20.2/22.23.4 and passes24.22.1. Explicit JS accessor installed before module import now provides two working readbacks123/456, zero early PID reads and one per fallback call. Temporary source-copy mutant captures sentinel7 at import and is rejected by the same expectations while its readback controls still work; load errors cannot pass as the negative control.

Focused8/8 pass0fail/skip on each actual20.20.2/22.23.4/24.22.1, with binary version/SHA/stability and source/log identities retained. Full GitHub CI [40274963836](https://github.com/Fryva/waypost/actions/runs/40274963836) at ad61e0336097a559871f5cb0759a180f9dd9a257 completed/success on Node20/22/24, including npm test and vault checks. Independent reviewer verified live CI and unchanged tested source, allAC met, no findings; Doctor0/0. Prior failed CI40267309102 and initial collector reporter-format gap remain documented. Story closed only after complete CI acceptance; administrative closure changes documentation only.

Evidence: `.waypost/experiments/wp21-ci-session-identity-20261026/` (failure excerpts, before/after runtime results, production/source manifests, validation.json, ci-final.json and review-final.json). Shared Memory corrected. Temporary runtime installations/npmcache/raw diagnostics removed601601398 logical bytes; selected logs, hashes, scripts and package locks retained. No project/global runtime dependency change, native pilot or token/runtime/net-saving measurement.

## Technical Notes

Do not copy native descriptor value/writable fields into the accessor descriptor. Do not replace expected123/456 with the actual process parent PID or suppress a failed mock with a platform skip. Runtime installations and mutation copies are temporary test artifacts only.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-26*
