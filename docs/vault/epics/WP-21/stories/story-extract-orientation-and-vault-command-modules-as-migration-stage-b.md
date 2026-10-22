---
type: story
id: "story-extract-orientation-and-vault-command-modules-as-migration-stage-b"
epic: "WP-21"
title: "Extract orientation and vault command modules as migration stage b"
status: in-progress
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-22
updated: 2026-10-22
external_refs: {}
tags: []
code_refs: ["bin/waypost.mjs", "bin/cli/core.mjs", "tests/harness.test.mjs", "tests/scripts.test.mjs", "tests/team-cli.test.mjs", "docs/how-it-works.md", "docs/vault/adr/setup-asks-the-running-harness-not-only-the-projects-files.md", "bin/cli/status.mjs", "bin/cli/help.mjs", "bin/cli/brief.mjs", "bin/cli/bind.mjs", "bin/cli/views.mjs", "bin/cli/artifacts.mjs", "bin/cli/profile.mjs", "bin/cli/mcp-config.mjs"]
specs: []
started_at: "2026-10-22T01:05:26.673Z"
closed_at: null
plan_updated_at: "2026-10-22T01:05:26.673Z"
---

# Extract orientation and vault command modules as migration stage b

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | in-progress |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Execute only accepted cohesion revision b in the existing isolated worktree: move orientation and vault handlers into status/help/brief/bind/views/artifacts/profile/mcp-config modules. Stage a and both compatibility follow-ups are closed after full successful exact-tree Ubuntu20/22/24 CI at49aac3b. Current metadata base0613311 has the same161source inputs; primary main remains untouched. Preserve canonical core (including its factual comment correction), function bodies and startup order, add only the reviewed literal lazy-dispatch changes/loader diagnostics, and enforce fixed138000entry/24000module ceilings. Stage c must wait for a new successful full matrix. No native pilot/budget change.

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [x] Reconstruct the exact reviewed stage-b candidate from its independent baseline patch and preserve current core.
- [x] Add permanent stage-b inventory/ceilings and meaningful lazy-load failure controls; preserve all existing guards and runtime fixtures.
- [ ] Obtain source-bound local checks, fresh review and a full exact-revision Ubuntu20/22/24 matrix before closure or stage c.

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

Read-only stage-b planner confirmed the eight module owners, unchanged core and startup order, requested-module import diagnostics, receiver-free dispatch and fixed stage budgets. Verification covers orientation/setup, vault/race and team early routes, followed by an independent prepared-code review and full Ubuntu20/22/24 CI.

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [ ] Entry and eight new modules match the reviewed stage-b candidate with unchanged core and command bodies; only accepted dispatch/header changes occur. Shared state, startup/early command behavior, shim/package and receiver-free calls remain compatible. Entry is at most138000 UTF-8 bytes and every module at most24000.
- [ ] Permanent size/inventory/namespace/syntax/import/early-closure guards and meaningful requested-module load-error/handler-error checks pass, along with affected orientation/vault/race/team regression fixtures. Documentation accurately describes the intermediate layout; no private evidence dependency ships.
- [ ] Fresh reviewer accepts the prepared code; full Ubuntu Node20/22/24 npm-test/bind/doctor CI passes the exact prepared tree before story closure or stage c. Primary main remains isolated; no token-saving or native pilot/allowance claim.

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

Prepared local verification: Node25.6.1/macOS, seven affected suites exit0:487 tests,482 pass,0 fail,5 platform skips,147892.779875ms. All402 source inputs unchanged across the run. Help/version/unknown-command exit/stdout/stderr parity with stage a passed; npm pack dry-run includes the shim,137200-byte entry and all9 modules (core14613 unchanged). Doctor after reconciliation:0issues,2 existing unrelated WP-18 code_refs warnings. Independent review and full Ubuntu20/22/24 CI are pending; these local results do not close the story or permit stage c. Retained private source/log identities: primary .waypost/experiments/wp21-cli-stage-b-20261022/.

## Technical Notes

Authoritative reviewed source plan: completed story Bound each CLI migration stage and measure the final layout, accepted split ADR, ownership map and retained primary .waypost/experiments/wp21-cli-layout-20261021/{candidate-manifest.json,patches/stage-b.patch,generator.py.txt,checker.mjs.txt}. Stage-b.patch is a complete independent patch over the frozen204781byte baseline, NOT a delta from current stage a. Reconstruct it in an owned temporary tree, then take only the new entry/eight new modules. Current core14613bytes has an accepted top-level comment correction compared with candidate14698bytes; preserve it unchanged. Expected entry137200bytes, fixed cap138000, total10CLI files including entry/core. Full stage-a evidence and closure verdicts: primary wp21-zstd-compat-20261021/{ci-analysis,closure-review-verdicts,closure-state}.json.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-22*
