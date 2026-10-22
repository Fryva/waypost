---
type: story
id: "story-extract-orientation-and-vault-command-modules-as-migration-stage-b"
epic: "WP-21"
title: "Extract orientation and vault command modules as migration stage b"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-22
updated: 2026-10-22
external_refs: {}
tags: []
code_refs: ["bin/waypost.mjs", "bin/cli/core.mjs", "tests/harness.test.mjs", "tests/scripts.test.mjs", "tests/team-cli.test.mjs", "docs/how-it-works.md", "docs/vault/adr/setup-asks-the-running-harness-not-only-the-projects-files.md", "bin/cli/status.mjs", "bin/cli/help.mjs", "bin/cli/brief.mjs", "bin/cli/bind.mjs", "bin/cli/views.mjs", "bin/cli/artifacts.mjs", "bin/cli/profile.mjs", "bin/cli/mcp-config.mjs"]
specs: []
started_at: "2026-10-22T01:05:26.673Z"
closed_at: "2026-10-22T01:47:27.773Z"
plan_updated_at: "2026-10-22T01:05:26.673Z"
---

# Extract orientation and vault command modules as migration stage b

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Execute only accepted cohesion revision b in the existing isolated worktree: move orientation and vault handlers into status/help/brief/bind/views/artifacts/profile/mcp-config modules. Stage a and both compatibility follow-ups are closed after full successful exact-tree Ubuntu20/22/24 CI at49aac3b. Current metadata base0613311 has the same161source inputs; primary main remains untouched. Preserve canonical core (including its factual comment correction), function bodies and startup order, add only the reviewed literal lazy-dispatch changes/loader diagnostics, and enforce fixed138000entry/24000module ceilings. Stage c must wait for a new successful full matrix. No native pilot/budget change.

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [x] Reconstruct the exact reviewed stage-b candidate from its independent baseline patch and preserve current core.
- [x] Add permanent stage-b inventory/ceilings and meaningful lazy-load failure controls; preserve all existing guards and runtime fixtures.
- [x] Obtain source-bound local checks, fresh review and a full exact-revision Ubuntu20/22/24 matrix before closure or stage c.

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

Read-only stage-b planner confirmed the eight module owners, unchanged core and startup order, requested-module import diagnostics, receiver-free dispatch and fixed stage budgets. Verification covers orientation/setup, vault/race and team early routes, followed by an independent prepared-code review and full Ubuntu20/22/24 CI.

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [x] Entry and eight new modules match the reviewed stage-b candidate with unchanged core and command bodies; only accepted dispatch/header changes occur. Shared state, startup/early command behavior, shim/package and receiver-free calls remain compatible. Entry is at most138000 UTF-8 bytes and every module at most24000.
- [x] Permanent size/inventory/namespace/syntax/import/early-closure guards and meaningful requested-module load-error/handler-error checks pass, along with affected orientation/vault/race/team regression fixtures. Documentation accurately describes the intermediate layout; no private evidence dependency ships.
- [x] Fresh reviewer accepts the prepared code; full Ubuntu Node20/22/24 npm-test/bind/doctor CI passes the exact prepared tree before story closure or stage c. Primary main remains isolated; no token-saving or native pilot/allowance claim.

## Final Summary

Committed and published stage b as68c4ec59420fd7136a0747729afd5c87e73c9043 on codex/cli-modularization, draft PR#2. Entry137200<=138000bytes; eight new command modules exactly match the reviewed candidate,25moved blocks are byte-identical, core14613 unchanged. Fixed inventory/budgets, namespace/module/closure guards, six dispatcher failure/receiver/async controls, setup ADR brief pinning and documentation all pass.

Full Ubuntu [CI39705071490](https://github.com/Fryva/waypost/actions/runs/39705071490) SUCCESS on this exact tree: Node20.20.2 1949tests/1946pass/0fail/3skip; Node22.23.3 and24.21.0 each1952tests/1949pass/0fail/3skip. Every npm-test/bind/doctor step succeeded; doctor0issues2existing unrelated WP18warnings. Checkoutmergee141f9d0e74290f267cd4336192d427bb9a1d3b1 and preparedhead share treea5d7e69e0207c67a464e42bda520b18c09a6e643. All402source hashes unchanged. Prior local seven-suite487tests/482pass/0fail/5skip, independent6lazytests, parity and pack evidence remain retained.

Fresh independent closure reviewer verified input/log/source identities and GitHub tree/status directly, accepted all3AC with no findings and verdict story closed/commit. Private evidence: primary .waypost/experiments/wp21-cli-stage-b-20261022/{closure-inputs,closure-review-verdict,ci-analysis,ci-tree-identity}.json plus full per-node logs. Temporary reconstruction and pack cache removed. Four later stages remain; primary main stays isolated and final14000entry is future. No actual token-savings/quota attribution or native pilot/budget change.

Prepared local verification: Node25.6.1/macOS, seven affected suites exit0:487 tests,482 pass,0 fail,5 platform skips,147892.779875ms. All402 source inputs unchanged across the run. Help/version/unknown-command exit/stdout/stderr parity with stage a passed; npm pack dry-run includes the shim,137200-byte entry and all9 modules (core14613 unchanged). Doctor after reconciliation:0issues,2 existing unrelated WP-18 code_refs warnings. Historical prepared-state note: independent review and full CI were pending at the local checkpoint; the successful full matrix and closure acceptance above supersede that pending status. Retained private source/log identities: primary .waypost/experiments/wp21-cli-stage-b-20261022/.

## Technical Notes

Authoritative reviewed source plan: completed story Bound each CLI migration stage and measure the final layout, accepted split ADR, ownership map and retained primary .waypost/experiments/wp21-cli-layout-20261021/{candidate-manifest.json,patches/stage-b.patch,generator.py.txt,checker.mjs.txt}. Stage-b.patch is a complete independent patch over the frozen204781byte baseline, NOT a delta from current stage a. Reconstruct it in an owned temporary tree, then take only the new entry/eight new modules. Current core14613bytes has an accepted top-level comment correction compared with candidate14698bytes; preserve it unchanged. Expected entry137200bytes, fixed cap138000, total10CLI files including entry/core. Full stage-a evidence and closure verdicts: primary wp21-zstd-compat-20261021/{ci-analysis,closure-review-verdicts,closure-state}.json.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-22*
