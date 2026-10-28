---
type: story
id: "story-deduplicate-standing-role-and-harness-instructions"
epic: "WP-21"
title: "Deduplicate standing role and harness instructions"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-28
updated: 2026-10-28
external_refs: {}
tags: []
code_refs: ["AGENTS.md", "tests/harness.test.mjs", "tests/state-migrate.test.mjs", "scripts/agents.mjs", "templates/agents-block.md.tmpl", "docs/harnesses.md"]
specs: []
started_at: "2026-10-28T09:44:01.576Z"
closed_at: "2026-10-28T09:56:01.548Z"
plan_updated_at: "2026-10-28T09:44:01.576Z"
---

# Deduplicate standing role and harness instructions

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Remove repeated role descriptions and static vendor/harness enumeration from project standing context under accepted ADR-0008. Keep the canonical managed routing block and every behavioral/safety requirement. The initial read-only team-suite investigation found source-digest/private-state coupling, so those runtime modules remain unchanged.

## Decomposition

- [x] Freeze instructions/managed block and map every removed statement to retained authority.
- [x] Compact only three role/harness prose regions; tighten budget and protect canonical block.
- [x] Run focused standing-context/isolation checks, review and remove own runner.

## Implementation Plan

AGENTS.md currently17075 characters. Replace only three prose regions in Agent roles: (1) static harness-name enumeration with the existing CLI/registry/docs pointers; (2) duplicate freshness/critic/reviewer/librarian/archaeologist descriptions with the original planner-before-implementation/code_refs requirement; (3) vendor/tool/model enumeration with the retained separate-registry-entry distinction, docs pointer and roles.shape:none routing/show/fresh-subagent fallback. Role freshness and purpose remain in the unchanged managed block. Skills, late-harness installation, read-only contract, model selection commands and all text outside these three regions remain byte-identical. docs/harnesses.md and registry already carry vendor facts; do not create another reference or change supported harnesses.

Expected standing text16024 chars, saving1051 (~6.2% character proxy), not measured native tokens. Keep generated block byte-for-byte and exact inverse reconstructing original file. No new architecture decision or policy; accepted ADR0003/0005/0008 remain unchanged. Map each removed condition/fact to retained block/planner line/docs/registry for independent equivalence review.

Extend existing project standing-context test in tests/harness.test.mjs: lower ceiling17100->16100, require exactly one root managed block equal to existing renderBlock({}).trim(). This guards the canonical rules now carrying formerly duplicate descriptions. Reuse existing role registration/standing-context test and existing child-env roster guard; no new test helper/source or runtime changes. Focused admitted run selects project standing context, the standing context stays small, and every test file that spawns a child. Distinguish filtered skips from failures or platform coverage; no broad suite success claim.

Retain source/runtime/runner/log identities, syntax/diff/Doctor issue/warn/warning0, fresh critic before implementation and independent reviewer before close/commit. Include AGENTS.md in validation snapshot. Own temp runner deleted before close; evidence .waypost/experiments/wp21-standing-roles-20261028/. No model/native pilot, runtime/public API change, security weakening or net-token saving claim. Existing model-independent character budget is the metric.

## Acceptance Criteria

- [x] Only the three documented AGENTS prose substitutions occur; canonical managed block and all other instructions unchanged; exact inverse and authority map preserve role semantics/safety, no registry/role/runtime changes. - evidence: `substitutions.json`, `authority-map.json`, exact inverse and managed-block SHA in `comparison.json` under `.waypost/experiments/wp21-standing-roles-20261028/`.
- [x] Standing instructions<=16100 characters (strict test uses <16100), budget tightened and canonical block tested; focused tests and child-env guard pass with source-bound receipts, syntax/diff/Doctor pass. - evidence: existing test cap16100 and canonical-block equality, focused `validation.json`/`tests.tap`, `static-checks.json` and `doctor.json`.
- [x] Independent reviewer accepts semantic equivalence/evidence; own runner removed before CLI close, character saving reported separately from unmeasured native tokens. - evidence: `review-final.json`, seven reviewed hashes, `cleanup.json` and measured character counts.

## Final Summary

AGENTS17075->16024characters,1051fewer/6.155% character proxy. Only three prose substitutions remove duplicate role purposes/freshness and static harness/vendor enumeration, retaining CLI/registry/docs pointers, separate tool/model entries and shape:none fallback. Manual planner-before-implementation/code_refs requirement retained literally. Managed block and all text outside the three regions byte-identical; exact inverse restores Git base. Skills/install/read-only/model commands and safety instructions remain; runtime/modules/roles/templates/registry unchanged. Existing project context cap17100->16100; root must contain exactly one block equal to renderBlock({}).trim(). Source/data-bound focused three-check run3pass0fail/skip,487.175417ms Node24.22.1 wrapper/child0,574input identities including templates/roles/registry/AGENTS. This is the named focused subset, not full suite verification. Syntax/diff/Doctor issue/warn/warning0; independent reviewer accepted semantic equivalence and all evidence. Removed1690logicalB own runner before close, identities reverified. Proof `.waypost/experiments/wp21-standing-roles-20261028/`. Previousbb46119 CI40621864681 verified completed/success Node20/22/24. No runtime/API/policy change or native/model pilot; character reduction is not measured net-token/quota saving. New full CI follows publication.

## Technical Notes

The managed block remains mandatory: removing manual duplicates must not allow it to disappear. This is why the existing project budget test also compares the actual root block to the renderer. No generated block is edited by hand.
