---
type: story
id: "story-isolate-repository-and-runtime-diagnostics-behind-the-doctor-facade"
epic: "WP-21"
title: "Isolate repository and runtime diagnostics behind the Doctor facade"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-24
updated: 2026-10-24
external_refs: {}
tags: []
code_refs: ["scripts/doctor.mjs", "scripts/doctor-coordination.mjs", "tests/doctor-coordination.test.mjs", "tests/presence.test.mjs", "tests/launcher.test.mjs", "tests/commits.test.mjs", "tests/scripts.test.mjs", "tests/harness.test.mjs", "tests/state-migrate.test.mjs", "docs/how-it-works.md", "docs/vault/adr/0006-commit-protocol.md", "docs/vault/adr/0007-shared-vault-presence.md"]
specs: []
started_at: "2026-10-24T02:26:51.816Z"
closed_at: "2026-10-24T02:33:13.468Z"
plan_updated_at: "2026-10-24T02:26:51.816Z"
---

# Isolate repository and runtime diagnostics behind the Doctor facade

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

The 30863-byte Doctor still mixes repository/runtime diagnostics with orchestration
and repairs. Isolate the remaining checks for focused source reads.

## Decomposition

- [x] Move two literal blocks and exact private finding factory.
- [x] Preserve seven public bindings, shared callers and repair helper identity.
- [x] Verify CLI/results/read-only state, regression tests, package and fresh review.

## Implementation Plan

Fresh planner at a7d21eb selects launcher through checkVaultGit, including private
FOREIGN_MACHINE_DRIVER_RE/driverScript and public driver helpers; separately the
complete process-table comment/check. Keep Runners header and runInstallChecks.
New doctor-coordination.mjs imports fs exists/read, path join, os platform, child
spawn; lib pluginRoot/projectRoot/pathUnder; original presence peers/readLeases/
processTable and launcher inspect/repairCommand. Exact private finding copy.
Doctor imports/re-exports seven functions; applyFixes uses the same imported
mergeDriverCommand. Remove only moved presence/launcher/platform imports; retain
remaining fs/path/spawn/lib dependencies. Expected focused size about10.7KB.

Preserve persist:false for both coordination reads, implicit projectRoot default,
call-time pluginRoot/PATH, whitelist/foreign-driver regex and slash normalization,
command strings and command-v behavior, injected launcher report, null/undefined
process-table semantics, Windows return, errors and finding order. Runners,
startup, CLI and repairs remain unchanged. No policy/model/dependency/cap/budget/
native-pilot changes. ADR0006/0007 gain source/test code_refs only.

Retain whole baseline, literal blocks/helpers and import edits for byte-for-byte
reverse reconstruction. Frozen CLI install/vault JSON/text/exit and startup plus
repair outputs/config must match on retained real-Git projects with owned fixed
clock/records. Diagnostics must not mutate any fixture file; repair differences
are intentional, compared separately, then fixture inputs restored. Add env-first
regressions for seven bindings, actual Git missing/current/foreign/broken driver,
external/nested/linked-worktree vault, default projectRoot, both PATH branches,
read-only shared-state records, frozen launcher reports and process-table cases.
Keep existing scripts/launcher/presence/commit/repair/protection checks unchanged.
Run targeted checks through heavy admission; syntax/package proof; retain source
and log hashes for independent reviewer. Report focused/combined source sizes
without inferring native-token/runtime/workflow savings.

## Acceptance Criteria

- [x] Two literal blocks/private helpers and seven exports preserved; full baseline reconstructs byte-for-byte; no changed callers, repairs or import cycle. — evidence: independent review of move-edits.json/blocks-before.json and binding test in tests-attempt-1.log.
- [x] Repository/runtime findings, defaults/errors/order and coordination read-only behavior match; frozen CLI/startup/repair results and file snapshots verified. — evidence: cli-before/after.json, files-before/after.json; reviewer verified141live fixture files and seven new regressions.
- [x] Targeted regression/protection checks pass through heavy admission; package includes module; independent reviewer accepts, sizes and limits reported honestly. — evidence: validation.json (161passed,zero failures/skips,exit0), pack-proof.json; reviewer ship verifying41source/11dirty hashes and log SHA.

## Final Summary

Implementation complete; independent reviewer ship, no findings/open questions. Doctor30863 ->21036
UTF-8 bytes; focused10632; combined+805. Two literal blocks/helpers and whole
baseline reconstruction exact. Six CLI install/vault/startup/fix cases match
JSON/text/stderr/exits and resulting config; diagnostics preserve all fixture
file hashes, repairs compared separately then inputs/mtimes restored. Targeted
heavy run161passed/0failed/0skipped,exit0,45.178seconds Node25.6.1/macOS; seven new
tests included. Reviewer independently verified41source identities and full log/manifest SHA.
Syntax/package proof passes,12Doctor modules included. Doctor0
issues/two existingWP18warnings. No native-token/runtime/workflow savings measured.

## Technical Notes

Mechanical source extraction under ADR0008; no new architectural choice.
Base a7d21eb full CI40053786173 still running at start; no new savings claim.

## Attachments

- Evidence: .waypost/experiments/wp21-doctor-coordination-module-20261024/
  (source-before/after.json, blocks-before.json, move-edits.json, measurement.json,
  cli/files-before/after.json, fixture-controls.json, fixture/move runner source,
  validation.json, tests-attempt-1.log, review-inputs.json, pack-proof.json,
  doctor.log, fixture-cleanup.json and cleanup.json).
- Owned temporary fixtures/cache/scratch removed: 1712828bytes; retained reports
  are diagnostic evidence.

---

*Last updated: 2026-10-24*
