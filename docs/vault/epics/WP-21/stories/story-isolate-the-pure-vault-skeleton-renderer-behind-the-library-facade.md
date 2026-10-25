---
type: story
id: "story-isolate-the-pure-vault-skeleton-renderer-behind-the-library-facade"
epic: "WP-21"
title: "Isolate the pure vault skeleton renderer behind the library facade"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-25
updated: 2026-10-25
external_refs: {}
tags: []
code_refs: ["scripts/lib.mjs", "scripts/lib-skeleton.mjs", "tests/lib-skeleton.test.mjs", "tests/lib-frontmatter.test.mjs", "tests/predicates.test.mjs", "tests/harness.test.mjs", "scripts/brief.mjs", "docs/how-it-works.md"]
specs: []
started_at: "2026-10-25T20:58:08.179Z"
closed_at: "2026-10-25T21:11:10.238Z"
plan_updated_at: "2026-10-25T20:58:08.179Z"
---

# Isolate the pure vault skeleton renderer behind the library facade

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Move the pure vault navigation skeleton renderer and its bounded helpers/constants into one readable leaf while keeping file collection, deadlines, appenders and the common facade unchanged. This continues the existing incremental WP-21 split.

## Decomposition

- [x] Freeze namespace/constants/function/corpus and real brief consumer outputs/files.
- [x] Move two literal pure chunks and directly re-export nine names without imports or wrappers.
- [x] Pin bindings, constants, frozen-input purity and read budget; run admitted consumer checks and independent review.

## Implementation Plan

Planner identifies two literal chunks: Vault navigation skeleton section through before Contract5 countFolder (3409B) and renderVaultSkeleton through before Session identity (4306B), total7715B. Move exact text/comments/literals into lib-skeleton.mjs without additional helpers/dependencies. Leaf exports4functions (truncEnd2,truncFront2,folderPurpose2,renderVaultSkeleton1) and5constants(PURPOSE_CELL160,TITLE_CELL80,PATH_CELL200,INFLIGHT_CAP5,ERROR_CELL500); private renderCount/descentOrder remain local. Facade has no remaining local uses, so add ONLY one direct re-export9, no import/wrapper; namespace100 and all callers unchanged. countFolder/gatherVaultFacts/timer/deadline/state and previous leaves stay literal. Preserve default options/allfour folderPurposes/folderList combinations/LF/order/fallback/counts/truncation/escaping/inflightcap/remainder/timeout-vs-empty and malformed-input behavior. Freeze100API metadata+constantvalues, facts/options/helper corpus and inputs, consumer default/full/JSON brief plus graph/codemap/doctor/ready on isolated fixed-clock vault and seeded cleanup appender/state. Newtests exact9namespace/bindings/name/arity/constantvalues, recursive frozenfacts acrossfourmodes, import/call I/O and clock guards with positive controls and delegated loader source reads, leaf<=10000B. Existing predicates collection/deadline/render contracts, harness/scripts and oldleaf tests through heavy slot; runtime logger records process.version at launch. Reverse re-export/moves to restore entire baseline;package/docs/code_refs and reviewer before close. No text/collection-policy changes or native pilot.

## Acceptance Criteria

- [x] Both chunks preserved literally; nine shared bindings/constants, function names/arities and complete namespace100/caller imports unchanged without cycles/new dependencies. — evidence: literal chunks/inverse proof; tests/lib-skeleton.test.mjs:10.
- [x] Default/allfour render modes, helpers, truncation/escaping/counts/inflight states and input immutability preserve corpus and real consumer outputs/files, including nonempty cleanup appender. — evidence: api-before.json/api-after.json; consumers-before.json/consumers-after.json.
- [x] Leaf <=10000UTF8B and no own I/O/probes/clock/env/cache; collection/deadline remain unchanged, exact inverse whole-facade and source sizes recorded without native-token/runtime savings claims. — evidence: comparison.json; byte-budget/import/clock guards.
- [x] API/purity/frozenfacts/budget and existing render/collection/CLI checks pass through heavy admission; package includes leaf,doctor0/0 and independent reviewer approves. — evidence: validation.json; tests-attempt-1.log; independent reviewer ship.

## Final Summary

Pure vault navigation rendering now lives in lib-skeleton.mjs. Two chunks3409+4306B, all comments/literals, four functions, five public constants and two private helpers moved literally. Facade has only one direct re-export9; complete namespace100/bindings/name/arity/constants and caller imports preserved. countFolder/gatherVaultFacts/files/timer/deadline/state and prior leaves untouched.

Evidence: .waypost/experiments/wp21-lib-skeleton-20261025/ retains baseline/current manifests, chunks/wiring and inverse entire-facade proof.215renderer/helper cases acrossallfourmodes and errors, input immutability and constant values identical;8consumer modes and18file content/inode/dev identities match including2cleanup-state files. Nonempty removed/stayed/deadline appenders retained. Leaf7715B<=10000;facade87794->80237B;combined+158B. Remaining facade stays large. These are source/readability measurements, not native-token/runtime/quota/workflow savings.

Admitted eight-file Node24.22.1 run386/386pass,0fail/skip,exit0,129.850s after CPU wait. Version recorded at launcher start and executable SHA stable before/after; runner identity retained. NewAPI/constants/frozenfacts/IO+DateProxy positivecontrols and existing render/collection/CLI checks pass. Syntax/package/doctor0/0. Independent reviewer ship/no findings verified22current/20baseline/10dirty identities and manifest/log/package/runner receipts. Ownfixture/cache removed after review,receipts retained. BaselineCI40230505575success; follow-upCI checked after publication. No new renderer/collection policy or native allocation.

## Technical Notes

No new flags, renderer option, facts field, clock/deadline rule, cache owner or native allocation. Historical SessionStart-spec comment remains literal. ERROR_CELL is currently unused in renderer but must remain public. Facade remains large and combined code may grow slightly through wiring.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-25*
