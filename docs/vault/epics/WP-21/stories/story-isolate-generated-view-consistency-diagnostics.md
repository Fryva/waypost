---
type: story
id: "story-isolate-generated-view-consistency-diagnostics"
epic: "WP-21"
title: "Isolate generated view consistency diagnostics"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-23
updated: 2026-10-23
external_refs: {}
tags: []
code_refs: ["scripts/doctor.mjs", "scripts/doctor-generated.mjs", "tests/doctor-generated.test.mjs", "tests/scripts.test.mjs", "docs/how-it-works.md", "docs/vault/adr/0006-commit-protocol.md"]
specs: []
started_at: "2026-10-23T19:07:49.941Z"
closed_at: "2026-10-23T19:14:24.236Z"
plan_updated_at: "2026-10-23T19:07:49.941Z"
---

# Isolate generated view consistency diagnostics

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Generated-view diagnostics live inside the 69159-byte Doctor. Give kanban,
README indexes, code-map and graph consistency checks one focused module while
preserving subprocess generators and the existing error/repair behavior.

## Decomposition

- [x] Move the three literal blocks and exact private finding factory.
- [x] Preserve five public bindings, callers/error boundaries and source pointers.
- [x] Verify real-generator states, frozen read-only CLI, targeted checks and review.

## Implementation Plan

Fresh planner at 2fc7d95 identified three blocks: status-kanban plus checkIndexes,
folder README header check, and code-map/graph checks. Stop before fence comments,
lifecycle gates and runners respectively. Create scripts/doctor-generated.mjs
with exact bodies/comments and private finding copy. Imports: existsSync/readFileSync,
join/basename, spawnSync, existing lib pluginRoot/projectRoot/indexHeaderRe/unescCell.
Doctor imports/re-exports five original bindings; remove only basename,
indexHeaderRe and unescCell imports. Preserve existing unused escCell. Keep
scanArtifacts, orchestration order, guarded-loop boundaries and every repair.

Keep subprocess command/env/timeout/error text; do not import generators directly
or combine the three local normalizers. Missing codemap stays quiet, missing
kanban/graph info. Preserve timestamps, escaped pipes, localized/header parsing,
severity, index order, read failures and moment of indexHeaderRe evaluation.
New env-first tests cover five binding identities, complete index findings/frozen
inputs, escaped pipes and supported/extra-column headers. Exercise isolated actual
generators across missing/healthy/stale/regenerated states and timestamp-only
changes, plus generator error branches without reading the user's vault.
Preserve existing reconcile/idempotence/localized/index/graph tests. Capture literal
blocks/factory; reverse every edit to recover complete baseline Doctor. Frozen
CLI JSON/text/stderr/exits and all fixture file hashes must match before/after;
diagnostics never mutate. Bind selected heavy validation to source/log hashes and
check package inclusion. ADR-0006 code_refs only and docs/parent pointers updated;
ADR-0011 glob already covers new module. No new policy/caps/dependencies/pilot.

## Acceptance Criteria

- [x] Literal blocks/factory, five identical public bindings and unchanged callers/error boundaries; entire baseline Doctor reconstructs byte-for-byte. — evidence: blocks-before.json, factory-before.txt, measurement.json, tests/doctor-generated.test.mjs.
- [x] Missing/healthy/stale/regenerated/timestamp-only views, index parsing and generator errors retain behavior; frozen CLI matches and diagnostics leave fixture unchanged. — evidence: cli-before/after.json, readonly-before/after.json, tests.log.
- [x] Heavy targeted/protection checks, packaging and independent review pass; focused/combined bytes reported without native-token/runtime savings claims. — evidence: validation.json, pack-proof.json, Final Summary.

## Final Summary

Doctor shrank from 69159 to 61955 UTF-8 bytes; focused module is 7849 bytes,
combined production growth is 645 bytes. Three blocks/private finding match
literally; entire baseline Doctor reconstructs byte-for-byte. — evidence: blocks-before.json, factory-before.txt, measurement.json, tests/doctor-generated.test.mjs. Five public ESM
bindings, subprocess generators/env/timeouts and caller/error boundaries retained.

Frozen actual-generator missing/healthy/timestamp-only/stale/regenerated fixtures
match full JSON/text/stderr/exits (4/0/0/4/0 findings). All fixture-file hashes
remain unchanged during every diagnostic pass before/after extraction. Existing
reconcile/idempotence/index/localized/graph expectations remain unchanged.
Heavy selected validation across eleven files: 111 passed, zero failed/skipped,
including six new tests and existing integration/env-protection checks. Package
contains all eight Doctor modules. Doctor0issues/three known warnings; next0.
Baseline CI40007488936 pending at verification; earlier51eddb2 full CI passed
Node20/22/24. New full CI is separate. No native-token/runtime/workflow savings
measured. Independent reviewer: ship, no findings. Verified18baseline/20current/10review
hashes, exact reconstruction, five binding identities, 52 fixture-file hashes,
full CLI snapshots, log and package manifest.

## Technical Notes

Mechanical extraction under ADR-0008. Preserve actual subprocess generators and
read-error boundaries, especially graph's import of walkVaultFiles via Doctor.

## Dependencies

- Accepted ADR-0006, ADR-0008 and ADR-0011; existing link-graph/index contracts.

## Attachments

- Evidence: .waypost/experiments/wp21-doctor-generated-module-20261023/
(source-before/after.json, blocks-before.json, factory-before.txt, measurement.json,
cases-inputs.json, cli-before/after.json, readonly-before/after.json, tests.log,
validation.json, pack.json, pack-proof.json, baseline-ci.json, doctor.log, next.log).
Owned replay fixture and npm cache removed.

---

*Last updated: 2026-10-23*
