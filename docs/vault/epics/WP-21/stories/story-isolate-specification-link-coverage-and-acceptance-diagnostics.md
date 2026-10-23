---
type: story
id: "story-isolate-specification-link-coverage-and-acceptance-diagnostics"
epic: "WP-21"
title: "Isolate specification link coverage and acceptance diagnostics"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-23
updated: 2026-10-23
external_refs: {}
tags: []
code_refs: ["scripts/doctor.mjs", "scripts/doctor-specs.mjs", "tests/doctor-specs.test.mjs", "tests/predicates.test.mjs", "docs/how-it-works.md"]
specs: []
started_at: "2026-10-23T18:50:32.004Z"
closed_at: "2026-10-23T18:56:23.370Z"
plan_updated_at: "2026-10-23T18:50:32.004Z"
---

# Isolate specification link coverage and acceptance diagnostics

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Specification link, coverage and acceptance diagnostics live inside the 80638-byte
Doctor. Give this coherent mechanism a focused module while preserving all gates.

## Decomposition

- [x] Move literal spec block and epic identity helper; copy exact private factories.
- [x] Preserve public bindings/callers and update source/parent pointers.
- [x] Verify frozen CLI, spec/lifecycle predicates, packaging and independent review.

## Implementation Plan

Fresh planner at 51eddb2 identified the entire Spec checks block, stopping before
Lifecycle gates, and the separate epicIdOf block (all current consumers are in
the spec block). Move both to scripts/doctor-specs.mjs. Copy exact private
finding and linesOutsideFences; leave the original fence helper for lifecycle.
Import basename/dirname and existing lib folderByKind/listOf/slugIdentity/
storyMatchesEntry/sectionOf/storiesAttributionRe/isLegacyStory. Doctor imports
checkSpecLinks/checkSpecCoverage/checkSpecAcceptance for unchanged guarded loop
and re-exports all four bindings including parseSpecAcceptance. Remove only
unused listOf/slugIdentity/storyMatchesEntry/storiesAttributionRe imports.

Preserve tiered story matches, exact-id/first-wins spec resolution, legacy cutoff,
optional policy, statuses, null versus empty acceptance, fences, full-width colon,
attribution and warning dedup/order/severity. Keep lifecycle/vault-policy and
checkStoriesAndEpics unchanged. No resolver replacement or policy/schema changes.

New env-first tests verify four binding identities, complete findings/frozen
inputs, nested epic paths and three story shapes, shared slug resolver across all
checks, missing/empty/fenced/attributed acceptance. Preserve existing predicate
imports/assertions; selected heavy run includes spec and lifecycle/localization,
Doctor/CLI/context checks and existing child-process env protection. Capture exact
blocks/helpers and restore entire baseline Doctor including four imports; compare
full JSON/text/stderr/exits on frozen optional/required/legacy-cutoff CLI cases,
with broken links, draft/done/in-progress and unchecked/ambiguous attribution.
Bind validation log to exact source hashes. Check package inclusion. Update docs
source pointer/parent footprint; ADR-0011 glob already covers doctor*.mjs. Upstream
ADR-007 comment is unrelated to local ADR-0007; no local ADR change required.

## Acceptance Criteria

- [x] Literal blocks/helpers, four identical public bindings and unchanged callers; whole baseline Doctor reconstructs byte-for-byte. — evidence: blocks-before.json, helpers-before.json, measurement.json, tests/doctor-specs.test.mjs.
- [x] Spec resolution, gates, full findings/order and immutable inputs retain semantics; frozen CLI JSON/text/stderr/exits match and lifecycle behavior remains covered. — evidence: cli-before/after.json, tests/predicates.test.mjs, tests.log.
- [x] Heavy targeted/protection checks, packaging and independent review pass; focused/combined bytes reported without native-token/runtime savings claims. — evidence: validation.json, pack-proof.json, Final Summary.

## Final Summary

Doctor shrank from 80638 to 69159 UTF-8 bytes; focused module is 12224 bytes,
combined production growth is 745 bytes. Both blocks and private helper copies
match literally; reversing the move/import changes restores all baseline bytes.
Original lifecycle fence helper remains. Four public ESM bindings are identical.

Frozen optional/required/legacy-cutoff cases match entire JSON/text/stderr/exits,
with 8/17/10 findings respectively. Existing predicate imports/assertions remain
unchanged. Heavy selected validation across ten files: 92 passed, zero failed or
skipped, including six new tests and spec/lifecycle/localization/env regressions.
Package dry-run includes all seven Doctor modules. Doctor0issues/three known
warnings; next0. Baseline CI40003559458 subsequently passed Node20/22/24 (baseline-ci-latest.json).
New full CI is separate. No native-token/runtime/
workflow savings measured. Independent reviewer: ship, no findings. Verified16baseline/18current/9review
hashes, literal reconstruction, four bindings, snapshots, log and package manifest.

## Technical Notes

Mechanical extraction under ADR-0008. No new policy/decision/dependency/model,
pilot or token-budget allocation. Original lifecycle fence helper remains.

## Dependencies

- Accepted ADR-0008 and ADR-0011; upstream spec contracts already implemented.

## Attachments

- Evidence: .waypost/experiments/wp21-doctor-specs-module-20261023/
(source-before/after.json, blocks-before.json, helpers-before.json, measurement.json,
cli-before/after.json, tests.log, validation.json, pack.json, pack-proof.json,
baseline-ci.json, doctor.log, next.log). Owned replay fixture and npm cache removed.

---

*Last updated: 2026-10-23*
