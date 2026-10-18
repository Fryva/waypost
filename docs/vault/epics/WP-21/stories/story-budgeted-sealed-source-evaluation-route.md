---
type: story
id: "story-budgeted-sealed-source-evaluation-route"
epic: "WP-21"
title: "Budgeted sealed-source evaluation route"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-18
updated: 2026-10-18
external_refs: {}
tags: []
code_refs: ["scripts/evaluation-source.mjs", "scripts/codex-evaluation-surface.mjs", "scripts/team-host.mjs", "scripts/team-cli.mjs", "scripts/team-subscription.mjs", "scripts/team-transport.mjs", "scripts/team-native-action.mjs", "tests/evaluation-source.test.mjs", "tests/evaluation-transport.test.mjs", "tests/team-host.test.mjs", "tests/team-subscription.test.mjs"]
specs: []
started_at: "2026-10-18T03:56:50.969Z"
closed_at: "2026-10-18T18:28:25.222Z"
plan_updated_at: "2026-10-18T03:56:50.969Z"
---

# Budgeted sealed-source evaluation route

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Implement the owner-accepted sealed-source evaluation ADR in the existing native v2 path. Preserve protected-role, strict, historical replay and old no-exec behavior. No new ledger or uncounted dispatch. Runtime controls and the paired pilot remain separately gated by verified evidence and the existing 250000 allowance.

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [x] Implement immutable bounded source broker and callback replay/lifecycle contracts.
- [x] Add explicit evaluation admission/binding/CLI/Host and native transport support, with no qualification promotion.
- [x] Verify regression fixtures and independent review; preregister protocol revision before live controls.

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

1. Seal manifest bytes in `evaluation-source.mjs`; expose only bounded read/search, deterministic continuation and bound replay.
2. Extend the existing v2 reducer with a non-authoritative evaluation binding; preserve previous purposes and uncertainty admission.
3. Add explicit owner CLI/Host entry, native supervised lifetime and separate version-specific callback surface; freeze effective configuration from C0 before dispatch.
4. Exercise focused regression fixtures, independent review and recovery. Preregister a separate revision-2 runbook before controls; execution and live quality/cost evidence belong to the execution story.

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [x] Source tools read only verified immutable manifest bytes, reject traversal/symlink/non-manifest and stale callbacks, bound output and deterministic continuation. — evidence: `tests/evaluation-source.test.mjs`, `tests/evaluation-transport.test.mjs`; checked transport 52/52.
- [x] Evaluation v2 reservation binds task/role/source/policy/model/limits, reuses budget/terminal uncertainty and grants no protected authority; old purposes and replay remain compatible. — evidence: `tests/team-subscription.test.mjs`, `tests/team-host.test.mjs`; Host 79/79, reducer fixtures in combined run.
- [x] Separate evaluation surface/transport supports declared callbacks and first-turn early zero anchor through all tool iterations; wrong versions/config/tools/frames fail closed and unknown usage stays unknown. — evidence: `tests/evaluation-transport.test.mjs` and `tests/team-host.test.mjs`, including C3/late-counter/recovery contracts.
- [x] Focused fixtures and independent reviewer demonstrate the contracts; any runtime evidence is separately identified, controls/pilot stay within owner call/budget limits. — evidence: independent waypost-reviewer verdict `story closed / commit`, manifest SHA256 `2143c8a8da43ee837b29ee456b3ad2df7fd78db405f3801bb82fc3cdc3fdcc11`; protocol critic `ship` at revision hash `e9e75219aac9fbd5d0d2d86bfe73387f06e9e72559a960def444fe617e95b2cc`.

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

Implemented an additive v2 evaluation purpose, immutable source broker, explicit owner Host/CLI admission and a separate Codex callback surface. Task/role/source/policy, effective configuration/global inputs, model and limits are pinned; no evaluation promotes protected authority. Known terminal accounting is retained only when the complete stream is verified; late or conflicting traffic retains uncertainty and the reservation. Recovery requires exact owned completion.

Validation on macOS: initial combined nine-suite run 270/271, with one new recovery-fixture failure; after fixture corrections Host 79/79, then affected evaluation/old-surface suites 52/52. Final 385-input manifest `2143c8a8…` pins unchanged production plus the tested deltas. Logs: `/private/tmp/waypost-evaluation-20261018/checked-tests.log`, `checked-host-final.log`, `checked-transport-final.log`. Independent reviewer verified the actual source/manifest and all ACs. Doctor: 0 issues, 3 pre-existing unrelated warnings.

Live C0 non-inference inspection confirmed source-tool configuration and owned stop on CLI 0.163.0-alpha.10.2, model gpt-6.1-sol/low. This is neither C1–C3 proof nor measured savings. The paired execution story owns live controls, catalog evidence registration, eight role calls and quality/cost results under the unchanged 250000 allowance.

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-18*
