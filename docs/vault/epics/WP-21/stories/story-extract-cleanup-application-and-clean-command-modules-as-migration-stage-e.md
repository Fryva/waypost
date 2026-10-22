---
type: story
id: "story-extract-cleanup-application-and-clean-command-modules-as-migration-stage-e"
epic: "WP-21"
title: "Extract cleanup application and clean command modules as migration stage e"
status: in-progress
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-22
updated: 2026-10-22
external_refs: {}
tags: []
code_refs: ["bin/waypost.mjs", "bin/cli/core.mjs", "bin/cli/clean-apply.mjs", "bin/cli/clean.mjs", "tests/harness.test.mjs", "tests/scripts.test.mjs", "tests/cleanup.test.mjs", "tests/limit.test.mjs", "tests/slots.test.mjs", "docs/how-it-works.md"]
specs: []
started_at: "2026-10-22T04:13:33.882Z"
closed_at: null
plan_updated_at: "2026-10-22T04:13:33.882Z"
---

# Extract cleanup application and clean command modules as migration stage e

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | in-progress |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Execute only accepted cohesion revision e after stage d passed full exact-tree Ubuntu20/22/24 CI39713413199 and independent closure. Extract cleanup application and clean command orchestration, preserving function bodies, state ownership, consent, removal/slot/clock semantics and early routes. Entry expected50513bytes under fixed51000cap, modules<=24000, exact18CLI files. All15currentmodules including correctedcore14613 stay byte-identical. Metadataaa2a77cbddfdfc402a98ef3abc735a6cb55c87ce has same408source inputs as green269b7e8. Stage f waits for new full matrix and independent acceptance; no native pilot/budget change.

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [x] Reconstruct complete stage-e candidate over frozen baseline; install only entry and clean-apply/clean, preserving15previousmodules.
- [x] Update fixed inventory/budgets/docs and preserve all semantic guards; verify meaningful cleanup/consent/application/auto-clean/slot/deleter regressions.
- [ ] Obtain source-bound local checks, independent prepared review and full exact-tree Ubuntu20/22/24 CI before closure or stage f.

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

Read-only planner confirmed exact ownership/DAG,15unchanged modules, live core imports, consent-before-claim, setup prebuilt plan/source, per-item recheck/removal/verification/log_error and finally release. Keep intermediate clean-apply bridges, fixed18-file inventory with clean-apply/clean-plan/clean filename ordering, existing meaningful fixtures and unchanged ADR scopes.

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [ ] Entry and two new modules exactly match reviewed stage-e candidate;15existingmodules, moved bodies, shared ownership, consent, startup/early deletion/MCP, removal/recheck/slot/finally/clock behavior stay compatible. Entry<=51000UTF-8bytes, modules<=24000, exact18-file inventory.
- [ ] Permanent inventory/byte/namespace/syntax/import/closure/core-state/lazy/early-dispatch guards and meaningful cleanup/limit/slot/application/consent regressions pass. Documentation/package/shim/root discovery remain correct; no private evidence ships.
- [ ] Independent reviewer accepts prepared code, full Ubuntu Node20/22/24 npm-test/bind/doctor CI succeeds on the exact prepared tree before closure or stage f. Main isolated, no measured savings/quota attribution or native pilot/allowance change.

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

Prepared local verification: Node25.6.1/macOS eight affected suites exit0:524tests/519pass/0fail/5platform skips,144292.538875ms. All410source hashes stable. Existing consent/selection/recheck/logging/setup/auto-clean/slot/early-deleter controls pass. Help/version/unknown exit/stdout/stderr parity passed; pack includes shim,50513byte entry and17modules. All15previousmodules unchanged. Doctor0issues2oldWP18warnings. Independent review and full Ubuntu20/22/24 CI pending; no closure/stagef yet. Private source-bound evidence primary .waypost/experiments/wp21-cli-stage-e-20261022/.

## Technical Notes

Authoritative retained candidate primary .waypost/experiments/wp21-cli-layout-20261021/{candidate-manifest.json,patches/stage-e.patch,generator.py.txt}. Independent baseline patch SHA256c2984656bf52f0a48e5780a7da0948f00d96d1d3fa5f5ca513da3e5228266155; not a delta fromd. Frozen204781byte compressedfixture. Entry50513 SHA25629466b372b925a9be3300260ab8376e9b9c04865545c20220a510e05d30ed663; newclean-apply14557/clean15369bytes. Preserve15existingmodules inclcorrectedcore14613 SHA2362ba34127126bf60d65ee4940ecdae240f124bacf8c11e40375ec9ce95f975. Intermediate staticbridges legal; finalcore-only entry isstagef. Stage-d acceptance primary wp21-cli-stage-d-20261022/{ci-analysis,ci-tree-identity,closure-review-verdict}.json.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-22*
