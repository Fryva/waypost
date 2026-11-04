---
type: story
id: "story-preserve-lazy-capture-dependencies-under-the-cli-namespace-guard"
epic: "WP-24"
title: "Preserve lazy handoff commands under the CLI namespace guard"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-04
updated: 2026-11-04
external_refs: {}
tags: []
code_refs: ["bin/cli/handoff-capture.mjs", "bin/cli/handoff-prepare.mjs", "bin/cli/handoff-process.mjs", "tests/harness.test.mjs", "tests/handoff-capture.test.mjs"]
specs: []
started_at: "2026-11-04T14:39:33.573Z"
closed_at: "2026-11-04T15:09:53.490Z"
plan_updated_at: "2026-11-04T14:39:33.573Z"
---

# Preserve lazy handoff commands under the CLI namespace guard

| Field | Value |
|---|---|
| **Epic** | [WP-24](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Full CI41780817418 on562f335 stops at one namespace-guard failure on Node20/22/24: handoff-capture uses former monolith names projectRoot/handleRun as local callbacks and property identifiers without module-level bindings. Preserve capture lazy loading and injected dependency behavior while satisfying accepted thin-CLI ADR §6. A direct unchanged-inspector pass additionally found opt in handoff-prepare and resolve in handoff-process. Rename those private locals to prepareOptions/resolveCommandResult with no behavior change. Restore the guard to routine validation; no output/token-saving claim for this compatibility fix.

## Decomposition

- [x] Express dependency/export names as literal data keys and use capture-specific local callback names, preserving exact selection/call phases.
- [x] Pin computed-key versus real free-identifier guard behavior and capture DI/getter/receiver/refusal semantics.
- [x] Validate actual namespace and capture/CLI guards on Node20/22/24, Doctor and fresh review; publish and inspect remote CI.

## Implementation Plan

Rename private prepareOptions/resolveCommandResult locals in prepare/process by exact alpha substitution; run existing prepare/recovery regressions. Rename private newDestination parameter relative to relativeDestination (same frozen-U collision; no path logic change). Otherwise only handleCapture selection/calls change: resolveCaptureRoot=(dependencies['projectRoot'] ? dependencies : await import('./core.mjs'))['projectRoot']; and runCaptureCommand=(dependencies['handleRun'] ? dependencies : await import('./run.mjs'))['handleRun']. Call each bare as before. Preserve truthy ternary and number/order of property reads, await only fallback, preflight before run import, root/cwd/args/refusal/exit/finally semantics. Literal external keys are data under the accepted namespace guard's explicit strings exclusion; actual capture callback bindings have capture-specific names. Do not edit scanner/decoder/frozen U, add dummy module bindings, eager imports, caches/wrappers, budgets or new CLI API.

Regression: computed import/DI key strings alone are outside frozen-identifier scope, while a real missing bare call with the same name still fails; full actual command namespace check must pass. Extend capture injection regression to getter read order/count, bare receiver, preflight/refusal and cwd restoration. Run focused capture/namespace/module/routine/state tests through heavy admission, preserving initial remote failure and pre/post source/runtime identities. Use installed or private pinned Node20/22/24 runtimes without modifying system install; full remote suite follows publication. Related handoff ADR remains proposed; accepted thin-CLI guard unchanged. Independent critic before edit and reviewer before close. No native model calls or allocation changes.

## Acceptance Criteria

- [x] Actual CLI namespace guard passes without weakening its frozen-name coverage; real missing identifiers still fail and capture lazy/DI semantics remain unchanged. — evidence: tests/harness.test.mjs; tests/handoff-capture.test.mjs; node*-namespace.json; node*-import.json.
- [x] Source-bound capture/namespace/module/state checks pass on Node20/22/24, Doctor clean and independent review accepts; original CI failure retained and remote follow-up status reported honestly. — evidence: validation.json; counts.json; doctor-receipt.json; review.json; ci-source.json after publication.

## Final Summary

Capture now uses capture-specific callback names and literal DI/export keys; getter count/order, fallback-only await, bare receiver, preflight-before-runner, heavy argv, refusal/exit and cwd restoration stay unchanged. Private relative/opt/resolve locals become relativeDestination/prepareOptions/resolveCommandResult. Exact inverses restore all three production files at562f335. No eager imports, wrappers, caches, CLI/API/authority/model/budget changes. Scanner/decoder/frozen U and all existing negative fixtures are unchanged.

Confirmed macOS on Node20.20.2,22.23.4,24.22.1:41capture/prepare/recovery+15namespace/module/routine/state checks per runtime=168selected pass0fail. Node20 reports173unmatched test-name-pattern skips, not platform skips; capture has0skips. Actual original capture source reproduces the old guard failure; ALL current CLI modules pass on all3 engines. Import-only before/after probes pass and intentional filesystem/process/eager-import controls fail. Actual default CLI capture completes on all3,command exit0. Private20/22 archives verified against official SHASUMS256; binary/version identities retained; bundled24 separately hashed.442source hashes stable before/after; explicit Doctor1004inputs stable,exit0/0issues/warnings6info. Independent review accepts code.

Original remote CI41780817418 on562f335:one namespace failure per Node20/22/24. Local attempts retained: first found remaining relative in capture; second preflight reached opt in prepare; an unchanged-inspector per-file diagnostic also identified resolve in process. All resolved by private alpha renames, not guard exclusions. This fixes validation compatibility, with no token/output/latency saving claim and0native model calls BY RUNNER; operator/reviewer usage unmeasured. Full local npm/Windows/Linux runtime not run. Evidence `.waypost/experiments/wp-ci-compatibility-20261104/` retains failures, baselines/inverses, source/runtime/review identities, commands/full logs, default capture/import probes, official checksums, Doctor and owned cleanup. Future CLI-focused validation MUST include the full CLI namespace test family, not just module link/size checks.

Published source commit 7192a4d5078650654db959659e5534a0d6dae7ce; remote CI 41854261726 inspected: in_progress/pending. This is not a remote-suite success claim.

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-11-04*
