---
type: story
id: "story-isolate-vault-artifact-discovery-and-identity-diagnostics"
epic: "WP-21"
title: "Isolate vault artifact discovery and identity diagnostics"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-23
updated: 2026-10-23
external_refs: {}
tags: []
code_refs: ["scripts/doctor.mjs", "scripts/doctor-artifacts.mjs", "tests/doctor-artifacts.test.mjs", "tests/predicates.test.mjs", "docs/how-it-works.md"]
specs: []
started_at: "2026-10-23T17:22:52.761Z"
closed_at: "2026-10-23T17:29:27.450Z"
plan_updated_at: "2026-10-23T17:22:52.761Z"
---

# Isolate vault artifact discovery and identity diagnostics

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Vault discovery and artifact identity/name checks live inside the 92793-byte
Doctor file. Give these related functions a focused module while preserving
all existing behavior, public imports and graph's shared-walk consumer.

## Decomposition

- [x] Move the exact walk/identity/name blocks and private factory.
- [x] Preserve public bindings/callers, package coverage and source pointers.
- [x] Verify frozen CLI/graph behavior, focused tests and independent review.

## Implementation Plan

Reuse the read-only placement plan from unchanged Doctor at 31f2fae. Create
scripts/doctor-artifacts.mjs containing walkVaultFiles, INFRA_NAMES,
checkArtifactIdentity, checkExternalRefsForm and checkArtifactNames with literal
bodies/comments, plus an exact private copy of finding. Import only stdlib
readdirSync/statSync/join/dirname and existing lib folderByKind/slugIdentity/
isLegacyNumberedId/legalArtifactName. Doctor imports/re-exports the same four
bindings and removes only unused isLegacyNumberedId/legalArtifactName imports.
Keep checkWikilinks and its comment, every existing caller and graph.mjs's import
through Doctor unchanged. Preserve order, case-sensitive .md, dotfile skipping,
statSync/symlink behavior, read errors, era classification, scopes and severities.

Add source/test paths to parent footprint and a small docs source pointer.
Existing ADR-0011 already protects doctor*.mjs; no policy/selectors change.
New tests import ./env.mjs first. Cover nested/loose/README walk, dotfiles/.MD,
missing-root error and skipped failed stat, complete findings, immutable inputs
and infrastructure names. Keep existing predicate expectations and add four
public-export identity assertions. Capture exact blocks/factory and recover
all baseline Doctor bytes by reversing extraction/imports. Compare separate
before/after CLI JSON/text/stderr/exit on one frozen temporary vault, plus graph
consumer output with only generated_at normalized. Remove owned temp fixture.
Run affected predicates/graph/Doctor/CLI checks and the existing child-process
protection scan through heavy admission with source/log hashes. Verify packaging.

## Acceptance Criteria

- [x] Blocks/factory move literally, old public bindings/callers remain compatible and complete baseline Doctor is recoverable byte-for-byte. — evidence: measurement.json, blocks-before.json, source-before/after.json.
- [x] Vault discovery and all findings preserve semantics/order/inputs, including shared graph consumer, errors, era classification and external-ref forms; frozen CLI/graph outputs match. — evidence: cli-before/after.json, walk-before/after.json, tests/doctor-artifacts.test.mjs.
- [x] Focused/integration/protection checks, packaging and independent review pass; report focused/combined bytes without claiming native-token/runtime savings. — evidence: validation.json, tests.log, pack-proof.json, Final Summary.

## Final Summary

Extracted the exact discovery/identity/name blocks and private finding factory.
Reversing the extraction recovers baseline 8e1cc03 Doctor byte-for-byte. Frozen
CLI JSON/text/stderr/exits and walk ordering match exactly; graph matches with
only generated_at normalized. All five Doctor modules ship in package dry-run.

Doctor: 92793 -> 84046 bytes; focused module: 9340 bytes; combined growth: 593
bytes. This improves focused source access; native-token/runtime savings are
not measured. Heavy selected validation: 84 passed, zero failed/skipped, including
existing child-process environment protection. Baseline full CI passed Node
20/22/24; the new commit's full CI is separate. Independent reviewer: ship, no findings; independently checked literal reconstruction,
17 baseline/19 current hashes, public bindings, snapshots, log and packaging.

## Technical Notes

Mechanical extraction under ADR-0008. No sorting, symlink/cycle fix, new nested
identity scope behavior, schema/CLI/policy/dependency/model/pilot/budget changes.

## Dependencies

- Accepted ADR-0008; existing SPEC-002 identity predicates; ADR-0011 coverage.

## Attachments

- Evidence: .waypost/experiments/wp21-doctor-artifacts-module-20261023/
(source-before/after.json, blocks-before.json, measurement.json, cli-before/after.json,
walk-before/after.json, tests.log, validation.json, pack.json, pack-proof.json,
baseline-ci.json, doctor.log, next.log). Owned replay fixture/cache removed.

---

*Last updated: 2026-10-23*
