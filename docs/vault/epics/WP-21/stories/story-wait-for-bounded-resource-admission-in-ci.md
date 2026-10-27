---
type: story
id: "story-wait-for-bounded-resource-admission-in-ci"
epic: "WP-21"
title: "Wait for bounded resource admission in CI"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-27
updated: 2026-10-27
external_refs: {}
tags: []
code_refs: [".github/workflows/ci.yml", "README.md", "scripts/test.mjs", "tests/test-runner.test.mjs"]
specs: []
started_at: "2026-10-27T04:13:29.639Z"
closed_at: "2026-10-27T04:22:14.645Z"
plan_updated_at: "2026-10-27T04:13:29.639Z"
---

# Wait for bounded resource admission in CI

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

CI2976169 Node22 job122002259295 failed before any tests: resource admission saw zero idle cores and returned75 immediately. Prevent a brief hosted-runner CPU spike from failing the matrix before its test process starts, using the existing explicit bounded-wait option. No bypass or change to admission rules.

## Decomposition

- [x] Retain failed-job evidence and verify existing explicit wait contract.
- [x] Opt only the CI npm-test step into five-minute admission wait; document it.
- [x] Validate bounded refusal/default behavior and unchanged runtime, independent review and close.

## Implementation Plan

Set WAYPOST_HEAVY_WAIT: '5m' only on the npm test step in .github/workflows/ci.yml. Keep Node20/22/24 matrix, fail-fast false and timeout40minutes. scripts/test.mjs already converts this variable to --wait, per accepted heavy-work ADR; no runtime, threshold, concurrency, local default or release-workflow changes. Document the step in README CI sentence. Keep all script/bin/test identities unchanged. Add missing parent epic source refs for workflow/README/runner/test contract.

No new permanent tests for this small configuration change. Reuse existing tests/test-runner.test.mjs through heavy gate. One-off owned HOME with the same injected always-busy capacity fixture: empty wait returns75/refused; explicit1s returns75 after waiting, no actual test suite spawned. Bound subprocess timeout and retain argv/environment/probe/stdout/stderr/status/elapsed receipt, using same runtime with source/binary/log identities. Validate exact workflow diff and existing YAML structure, diff-check and Doctor issue/warn/warning0; independent finalreview before close/commit. Publish and report new CI status distinctly from test success; no speculative green claim. Full local suite is unnecessary because executable scripts and tests are unchanged.

## Acceptance Criteria

- [x] Only CI npm-test step opts into5m wait; thresholds/concurrency/local default/timeout40/matrix/release workflow and all executable source/test identities preserved — evidence: `yaml.json`, `source-unchanged.json`, 395input hashes in `.waypost/experiments/wp21-ci-collector-20261027/`.
- [x] Existing runner tests pass; controlled busy fixture proves immediate refusal without wait and bounded refusal with1s, without spawning the suite; config/Doctor pass with retained source-bound receipts — evidence: `validation.json`, full `tests.tap`, `admission-probe.json` and stdout/stderr; no-wait281ms and1s-wait1312ms both75.
- [x] Independent review accepts actual diff and diagnostic evidence; README explains bounded admission wait, cleanup completes before CLI-close; full GitHub matrix status reported honestly after publication — evidence: `review-final.json`, `cleanup.json`, `ci-after-publication.json`; run40449194998 at a323f01 in_progress on all Node20/22/24 npm-test steps, no completed matrix/admission claim.

## Final Summary

Configured only CI npm-test step with existing WAYPOST_HEAVY_WAIT=5m; README explains bounded admission. Original Node22 startup failure was admission75 before tests, retained node22.log132..134. Matrix/defaults/thresholds/timeout40/release workflow and all395bin/scripts/tests inputs unchanged. Ruby YAML structural comparison permits only that step env. Existing runner tests3pass0fail/skip541.461833ms Node24.22.1, wrapper/child0; controlled busy probes exit75 without wait281.265ms and with1s wait1312.077ms, emptystdout/no suite. Source/config/runtime/runner/log identities retained. Doctor issue/warn/warning0, independent reviewer ship/no findings. Removed3191logicalB owned probe HOME/runner, cleanup receipt retained. Published a323f01; newCI40449194998 recorded after publication: all Node20/22/24 jobs and npm-test steps in_progress, no final success or direct admission-log evidence yet. Explicit cleanup and publication-status conditions are fulfilled before CLI-close; no repeat local tests required.

## Technical Notes

The original red job is a capacity refusal, not a Node22 compatibility test failure. Five minutes does not guarantee resources become available; ongoing exhaustion still refuses. This is CI reliability work under existing policy, not measured native-token/runtime savings or a new pilot.
