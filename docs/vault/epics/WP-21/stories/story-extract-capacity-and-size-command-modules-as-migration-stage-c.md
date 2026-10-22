---
type: story
id: "story-extract-capacity-and-size-command-modules-as-migration-stage-c"
epic: "WP-21"
title: "Extract capacity and size command modules as migration stage c"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-22
updated: 2026-10-22
external_refs: {}
tags: []
code_refs: ["bin/waypost.mjs", "bin/cli/core.mjs", "bin/cli/slots.mjs", "bin/cli/capacity.mjs", "bin/cli/size.mjs", "tests/harness.test.mjs", "tests/slots.test.mjs", "tests/sizes.test.mjs", "tests/cleanup.test.mjs", "docs/how-it-works.md", "tests/limit.test.mjs"]
specs: []
started_at: "2026-10-22T01:51:35.516Z"
closed_at: "2026-10-22T02:29:30.728Z"
plan_updated_at: "2026-10-22T01:51:35.516Z"
---

# Extract capacity and size command modules as migration stage c

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Execute only accepted cohesion revision c after stage b passed full exact-tree Ubuntu20/22/24 CI39705071490 and independent closure. Extract shared slot infrastructure and capacity/size handlers without changing command behavior, startup order or canonical core. Entry expected117968bytes with fixed118000ceiling, modules<=24000,13CLI files. Current metadata base1503859 has the same402source inputs as green68c4ec5. Preserve all nine current modules byte-identical. Stage d waits for a new full successful matrix and acceptance. No native pilot/budget change.

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [x] Reconstruct complete stage-c candidate over the frozen baseline; install entry and only slots/capacity/size, preserving existing modules.
- [x] Update fixed inventory/budget and intermediate documentation; preserve namespace/import/closure/loader/state guards and verify slot/capacity/size/run/cleanup fixtures.
- [x] Obtain source-bound local checks, independent prepared review and full exact-tree Ubuntu20/22/24 CI before closure or stage d.

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

Read-only planner confirmed exact candidate ownership, unchanged core cache/clock and nine current modules, intermediate bridge imports, slot path-before-lock and authority-after-release ordering, fixed inventory/caps, existing meaningful regressions and no ADR changes. Parent epic includes slots/cleanup fixture refs; no fixture code edit is implied.

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [x] Entry and three new modules match the reviewed stage-c candidate with unchanged existing nine modules, command bodies, shared state ownership and startup/early dispatch semantics. Entry<=118000UTF-8bytes, every module<=24000, exact13-file inventory.
- [x] Permanent inventory/byte/namespace/syntax/import/early-closure/core-state/lazy-dispatch guards and affected slot/capacity/size/run/cleanup regressions pass. Documentation describes stage c; shim/package/root discovery and no private evidence dependency remain compatible.
- [x] Independent reviewer accepts prepared code and full Ubuntu Node20/22/24 npm-test/bind/doctor CI succeeds on the exact prepared tree before closure or stage d. Primary main stays isolated; no measured savings/quota or native pilot/allowance claim.

## Final Summary

Published stage c as1b7eb94f71989d0e80028ccdd9dd96a625a7d59d on codex/cli-modularization/PR#2. Entry117968<=118000bytes; newslots8815/capacity4410/size7737 match reviewed candidate,18moved declarations unchanged, all9previous modules byte-identical. Fixed13-file inventory/24000module caps and existing guards remain. Shared authority ownership, slotWhere-before-lock, authority-after-release and finally release are preserved.

Full Ubuntu [CI39708914803](https://github.com/Fryva/waypost/actions/runs/39708914803) SUCCESS: Node20.20.2 1949tests/1946pass/0fail/3skip; Node22.23.3 and24.22.0 each1952tests/1949pass/0fail/3skip. Every npm-test/bind/doctor step succeeds; doctor0issues2existing unrelated WP18warnings. Checkoutmerge9deb11e11082720b331fda82f802cd0eebcc8faa and head share treec7e807833f8db347859f3bed888cfe563a40104b. All405source hashes unchanged. Local eight-suite523tests/518pass/0fail/5skip,13syntaxchecks, parity and package evidence remain source-bound.

Independent closure reviewer verifies11prepared/405source/12closure-evidence identities, all3AC met, no findings; verdict story closed/commit. Private retained evidence primary .waypost/experiments/wp21-cli-stage-c-20261022/{closure-inputs,closure-review-verdict,ci-analysis,ci-tree-identity}.json plus per-node full logs and REST receipts. Own candidate211332bytes/packcache1247159bytes removed. Three later stages remain; primary main isolated. Final14000entry, actual token savings/quota attribution and native pilot are not claimed; budget unchanged.

Prepared local verification: Node25.6.1/macOS, eight affected suites exit0:523tests/518pass/0fail/5platform skips,132231.3065ms. All405source hashes stable. Help/version/unknown command exit/stdout/stderr parity against stage b passed. npm pack includes shim,117968byte entry and12modules; existing core14613 and all8stage-b modules unchanged. Doctor after reconciliation0issues2existing unrelated WP18warnings. Historical prepared-state note: review and full matrix were pending at that local checkpoint; successful full CI and independent closure acceptance above supersede that pending state. Private source-bound logs/argv/identities in primary .waypost/experiments/wp21-cli-stage-c-20261022/.

## Technical Notes

Reviewed source primary .waypost/experiments/wp21-cli-layout-20261021/{candidate-manifest.json,patches/stage-c.patch,generator.py.txt}. Patch SHA256f2e33c8a900f1e8daa284141130fb43682f9bd032ce4f7476dfe93a9f4155c57 is a complete independent patch over frozen204781byte baseline, not a delta from stage b. Expected entry SHA2564023b31e79c96ef6b04f9080d1a2079d7d45890cf092a15386ee11bdc7a278d7,117968bytes. New capacity4410/size7737/slots8815bytes. Preserve corrected core14613bytes/SHA2362ba34127126bf60d65ee4940ecdae240f124bacf8c11e40375ec9ce95f975 and all eight stage-b modules. Canonical lazy authority stays in core; slot extraction must not duplicate it. Static bridges are legal at this intermediate stage; finalcore-only closure comes later. Full stage-b acceptance evidence in primary wp21-cli-stage-b-20261022/{ci-analysis,ci-tree-identity,closure-review-verdict}.json.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-22*
