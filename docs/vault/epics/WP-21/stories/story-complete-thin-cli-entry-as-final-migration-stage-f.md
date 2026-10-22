---
type: story
id: "story-complete-thin-cli-entry-as-final-migration-stage-f"
epic: "WP-21"
title: "Complete thin CLI entry as final migration stage f"
status: in-progress
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-22
updated: 2026-10-22
external_refs: {}
tags: []
code_refs: ["bin/waypost.mjs", "bin/cli/core.mjs", "bin/cli/auto-clean.mjs", "bin/cli/run.mjs", "bin/cli/setup.mjs", "tests/harness.test.mjs", "tests/scripts.test.mjs", "tests/slots.test.mjs", "tests/cleanup.test.mjs", "tests/limit.test.mjs", "docs/how-it-works.md", "docs/vault/adr/setup-asks-the-running-harness-not-only-the-projects-files.md", "docs/vault/adr/the-cli-as-a-thin-entry-with-per-command-modules-each-readable-in-one-pass.md"]
specs: []
started_at: "2026-10-22T04:59:00.682Z"
closed_at: null
plan_updated_at: "2026-10-22T04:59:00.682Z"
---

# Complete thin CLI entry as final migration stage f

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | in-progress |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Execute accepted final cohesion revision f after stage e passed full exact-tree Ubuntu20/22/24 CI39721995520 and independent closure. Extract auto-clean/run/setup, leaving the reviewed thin dispatcher with core as its only statically imported CLI module. Entry13998 under fixed14000bytes,20modules<=24000,exact21CLI files. Preserve17existingmodules inclcorrectedcore14613; bodies/shared state/startup/early routing/cleanup/run/setup behavior remain compatible. Metadatafafb2e52ec062d04b8dd28871a311391da5c631e has same410source inputs as greenac6a0cb. Complete final permanent guards, independent review and full exact-tree matrix before closure; no native pilot/budget or measured savings claim.

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [x] Reconstruct exact stage-f candidate from frozen baseline; install only entry/auto-clean/run/setup, preserving17existingmodules and accepted ownership.
- [x] Enforce final14000/24000caps,21fileinventory and core-only static CLI closure; preserve namespace/state/import/early-routing guards and meaningful run/setup/cleanup regressions.
- [ ] Obtain source-bound local checks, independent prepared review and full exact-tree Ubuntu20/22/24 CI, then independent final acceptance and lifecycle closure.

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

Read-only planner confirmed exact final candidate/DAG,17unchanged modules, inherited/live/private state ownership, run signal/listener/slot/status ordering, auto-clean guards and setup audit behavior. Enforce core-only static CLI closure, explicit21file inventory and hard14000/24000 ceilings. Remove historical synthetic deleter bridges and add one meaningful real early lazy-import syntax failure control. Setup ADR detector forbid follows setup; pin requirements remain in entry/core/brief, never falsely required in delegating setup.

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [ ] Entry and three new modules match accepted final candidate, all17previousmodules/moved bodies/shared state/startup semantics remain unchanged, entry<=14000UTF-8bytes/everymodule<=24000, exact21CLI files with core-only static CLI dependency closure and acyclic ownership graph.
- [ ] Permanent final budgets/inventory/namespace/syntax/import/closure/core-state and meaningful lazy/early dispatch/run/setup/cleanup/limit/slot regressions pass. Documentation/package/shim/root discovery/ADR pointers describe final layout accurately; advisory16000 remains distinct, no private evidence ships.
- [ ] Independent reviewer accepts prepared code, full Ubuntu Node20/22/24 npm-test/bind/doctor CI passes exact prepared tree, and independent closure acceptance verifies final requirements. Primary main isolated; no measured savings/quota attribution or native pilot/allowance change.

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

Prepared local verification: Node25.6.1/macOS eight affected suites exit0:525tests/520pass/0fail/5platform skips,161986.161875ms. All413source and4additional policy/docs inputs stable. Initial heavy admission refused75 before tests (two live Rust/Android jobs), preserved separately; later normal capacity admission succeeded, never forced. Before run,22syntax checks passed;3command parity and packshim+entry+20modules/no privateevidence passed on unchanged source. Final guards enforce13998<=14000,20modules<=24000,exact21files and entry staticCLI closure exactlycore. Direct early-deleter syntax failure and unbound/await/pre-session handler controls pass. All17previousmodules unchanged. Independent review and full Ubuntu20/22/24 CI still pending; no final closure or measured savings yet. Evidence primary .waypost/experiments/wp21-cli-stage-f-20261022/.

## Technical Notes

Authoritative retained candidate primary .waypost/experiments/wp21-cli-layout-20261021/{candidate-manifest.json,patches/stage-f.patch,generator.py.txt}. Complete independentbaseline patch SHA2564d7b78d8e5b46b5d6f7a346553d6f1cfebdcd266d5240a900f6a073fec003a9f; frozen204781byte fixture. Entry13998 SHA256c8239854822cdce6cdc39c1a9276e22993e616d34d965faa0520693a86c644e8, only2bytes headroom: no extra source edits/minification/budget waiver. Newauto-clean16535/run9280/setup12001; auto-clean exceeds advisory16000, accepted under hard24000. Preserve17previousmodules inclcore14613 SHA2362ba34127126bf60d65ee4940ecdae240f124bacf8c11e40375ec9ce95f975. Stage-e full acceptance primary wp21-cli-stage-e-20261022/{ci-analysis,ci-tree-identity,closure-review-verdict}.json. Assess final early-deleter fixture/staticbridge removal and actual requested-module syntax error now that entry is core-only; no false stage-d requested-label expectation.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-22*
