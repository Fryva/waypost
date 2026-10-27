---
type: story
id: "story-restore-isolated-environments-for-extracted-module-tests"
epic: "WP-21"
title: "Restore isolated environments for extracted module tests"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-27
updated: 2026-10-27
external_refs: {}
tags: []
code_refs: ["tests/model-strength-fetch.test.mjs", "tests/toolchain-locators.test.mjs", "tests/state-migrate.test.mjs", "tests/env.mjs", "README.md"]
specs: []
started_at: "2026-10-27T23:12:18.820Z"
closed_at: "2026-10-27T23:18:10.187Z"
plan_updated_at: "2026-10-27T23:12:18.820Z"
---

# Restore isolated environments for extracted module tests

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

CI40595686092 atfbada45 failed on all Node20/22/24 solely because two newly extracted-module test files spawn children without importing tests/env.mjs. Their helper processes are mocked, but the existing repository-wide safety invariant still requires the environment guard. Prior targeted suites omitted state-migrate.test.mjs and did not reveal this. Restore the invariant before further source optimization.

## Decomposition

- [x] Retain full failed CI logs and identify exact offending files.
- [x] Add side-effect env imports and document the existing scoped-validation dependency.
- [x] Verify original tests plus isolation guard, review and own-temp cleanup.

## Implementation Plan

Add import "./env.mjs" before other imports in tests/model-strength-fetch.test.mjs and tests/toolchain-locators.test.mjs. No production or helper changes, new exception/allowlist, or weakened guard. tests/env.mjs sets WAYPOST_NO_STATE_MIGRATION=1 so spawned children inherit it. README development instructions explain that child-spawning tests import env and scoped validation includes tests/state-migrate.test.mjs, whose existing test checks the complete test roster. Do not expand standing AGENTS.md near its17100-character budget. No new tests that mirror imports; reuse the original safety invariant and both affected suites.

Compare both tests against frozen before sources allowing ONLY one env import each; preserve every existing test assertion and child invocation. Run state-migrate, model-strength-fetch and toolchain-locators through heavy admission with source/runtime/runner/log identities. Keep existing platform skips distinguished from failures. Syntax/diff/Doctor checks, fresh critic and independent reviewer; remove own temporary runner before CLI close. The prior CI remains failed evidence; new full Node20/22/24 matrix follows publication. Evidence .waypost/experiments/wp21-test-env-20261027/. No source extraction, actual model/network run, new native budget, production setting or measured token saving.

## Acceptance Criteria

- [x] Two existing tests gain only the env import; production and helper inputs equal fbada45; isolation guard unchanged and README identifies mandatory env/scoped-check contract. - evidence: `comparison.json`, frozen before sources and README development section.
- [x] Original affected tests and state-migrate safety invariant pass with source-bound receipts; syntax/diff/Doctor issue/warn/warning0, historical failed CI retained. - evidence: `validation.json`, `tests.tap`, `static-checks.json`, `doctor.json`, `failed-ci.json` and full `failed.log` in `.waypost/experiments/wp21-test-env-20261027/`.
- [x] Independent review accepts fix/evidence; own temporary files removed before CLI close. - evidence: `review-final.json`, eight reviewed input hashes and `cleanup.json`.

## Final Summary

Added only import "./env.mjs" to each of model-strength-fetch.test.mjs and toolchain-locators.test.mjs; original test bodies/assertions/child invocation bytes preserved. Production, helpers, tests/env.mjs and repository-wide safety guard unchanged. README documents existing env requirement and including state-migrate.test.mjs in scoped validation, without growing standing AGENTS context. Prior CI40595686092 atfbada45 failed on all Node20/22/24 solely on this guard; full logs retained. After normal resource wait (CPU admission initially0), source-bound three-file run44total42pass0fail2existing platformconditional skips,5479.287042ms Node24.22.1 wrapper/child0, stable binary/runner/log and413input identities. Syntax2/2,diff/Doctor issue/warn/warning0; independent reviewer no findings verified8dirty/413source hashes. Removed1568logicalB own temporary runner before close; source identities reverified. Evidence `.waypost/experiments/wp21-test-env-20261027/`. No observed user-state migration, weakened invariant, production/source extraction, native/model/network run or measured token saving. New full Node20/22/24 CI follows publication.

## Technical Notes

The failed invariant does not demonstrate that user state was moved. The mocked helper tests did not invoke the CLI; this change restores the required defense and prevents omissions in future scoped validation.
