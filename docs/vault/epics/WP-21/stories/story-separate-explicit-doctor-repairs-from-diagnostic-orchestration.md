---
type: story
id: "story-separate-explicit-doctor-repairs-from-diagnostic-orchestration"
epic: "WP-21"
title: "Separate explicit Doctor repairs from diagnostic orchestration"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-24
updated: 2026-10-24
external_refs: {}
tags: []
code_refs: ["scripts/doctor.mjs", "scripts/doctor-repairs.mjs", "scripts/doctor-coordination.mjs", "tests/doctor-repairs.test.mjs", "tests/harness.test.mjs", "tests/presence.test.mjs", "tests/commits.test.mjs", "tests/scripts.test.mjs", "tests/state-migrate.test.mjs", "docs/how-it-works.md", "docs/vault/adr/0003-agent-roles-across-harnesses.md", "docs/vault/adr/0006-commit-protocol.md", "docs/vault/adr/0007-shared-vault-presence.md", "docs/vault/epics/WP-21/stories/story-isolate-repository-and-runtime-diagnostics-behind-the-doctor-facade.md"]
specs: []
started_at: "2026-10-24T04:45:39.805Z"
closed_at: "2026-10-24T04:59:46.326Z"
plan_updated_at: "2026-10-24T04:45:39.805Z"
---

# Separate explicit Doctor repairs from diagnostic orchestration

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Separate explicit mechanical writes from the 21036-byte Doctor facade/runners/CLI
so a repair task can read only the existing repair implementation.

## Decomposition

- [x] Move the literal Repairs header/comment/applyFixes block.
- [x] Preserve public binding, direct driver dependency, predicates and repair order.
- [x] Verify actual repairs, reporting-only JSON, regressions, packaging and review.

## Implementation Plan

Fresh planner at986cf1b selects Repairs header/comment through applyFixes, before
layoutFolderIn comment. New doctor-repairs.mjs imports fs exists/read/write, path
join/resolve/dirname/relative, child spawn, lib pluginRoot/pathUnder, agents
 detectHarnesses, mergeDriverCommand directly from doctor-coordination. No new
helpers and no import of Doctor. Doctor imports/re-exports applyFixes; remove
moved-only writeFileSync/dirname/relative/spawnSync/pathUnder/detectHarnesses and
local mergeDriverCommand import, retaining its public re-export. Runners/CLI and
all other diagnostics remain unchanged. Expected focused about7.6KB; facade about
13.8KB after import cleanup. These are measured sizes, not new caps.

Keep every literal branch, level predicate, command/env/args, error/output string,
conditional write and done ordering. No new policy/dependency/model/budget/pilot.
ADR0003/0006/0007 gain relevant source/test code_refs only; guards unchanged.

Capture whole baseline, block and import edits for byte-for-byte reconstruction.
Frozen retained Git fixtures compare diagnostics/startup and reporting-only
--fix --json with no writes, then TRUE text --install --fix outputs and resulting
all-file/config content. Restore original files/directories/mtimes after repair.
Cover unwired/drift, Claude imports/bridge, routing, stale roles/skills, standalone
vault Git init. New env-first tests directly snapshot all branches, public binding,
immutable findings, conditional no-ops/info/foreign/no-harness, idempotent file
writes and real temporary repositories. Preserve existing repair assertions.
Run targeted/protection checks through heavy gate, syntax/package checks, retain
source and log hashes; independent reviewer before close/commit. Report focused
size and total growth separately, without native-token/runtime savings inference.

## Acceptance Criteria

- [x] Literal repair block and public binding preserved; complete baseline reconstructs byte-for-byte, runners/CLI unchanged and driver imported directly without cycle. — evidence: independent reviewer verified move-edits.json/block-before.txt; binding assertion passed in tests-attempt-2.log.
- [x] Real repairs preserve predicates/order/messages/errors and resulting files/config; reporting-only JSON and no-op controls make no writes; frozen comparisons and direct branch regressions pass. — evidence: seven frozen true-fix scenarios in cli/files-before/after.json and nine new regressions in tests-attempt-2.log; independent reviewer accepted.
- [x] Targeted regression/protection tests pass through heavy admission, package includes new module, independent reviewer accepts and sizes/limitations are recorded. — evidence: validation.json (162 passed, zero failed/skipped,exit0), pack-proof.json; reviewer ship verified41source identities plus manifest/full-log SHA.

## Final Summary

Doctor21036 ->13819UTF8bytes, focused7578, combined+361. Literal repair block/full
baseline reconstruction exact; seven reporting/true text-fix/rediagnosed-fix
scenarios match all outputs and resulting files/Git config. Reporting-only
--fix --json made no writes, while true fix changed every fixture; repeat after
rediagnosis was idempotent. Historical coordination report corrected explicitly.

Heavy-gated target passed162/162, zero failures/skips,exit0,51.282seconds on
Node25.6.1/macOS, including nine new direct branch regressions and existing
repair/protection tests. Earlier5m CPU admission refusal exit75 happened before
test start, retained. Independent reviewer ship,no findings/open questions,
verified41source identities and manifest/full-log SHA. Syntax/package passes,
13Doctor modules included. Doctor0issues/two oldWP18warnings. Post-run cleanup
reported free-space deficit and two nested repositories never entered; tests
exit0. No native-token/runtime/workflow savings measured.

## Technical Notes

Mechanical source extraction under ADR0008, not a new architectural choice.
Baseline full CI40054689374 at986cf1b and40053786173 ata7d21eb passed Node20/22/24.

Correction to historical fixture interpretation: previous coordination replay used
--install --fix --json. Current CLI returns JSON before applyFixes, so that receipt
proves reporting parity and unchanged config, not applied-repair parity. Existing
commit/harness/presence tests exercised actual repairs. This story adds frozen
TRUE text --fix and direct full branch controls; CLI semantics stay unchanged.

## Attachments

- Evidence: .waypost/experiments/wp21-doctor-repairs-module-20261024/
  (source-before/after.json, block-before.txt, move-edits.json, measurement.json,
  fixture-inputs.json, cli/files-before/after.json, fixture/move runner source,
  validation.json, validation-pending.json, tests-attempt-1/2.log, review-inputs.json, pack-proof.json,
  doctor.log, fixture-cleanup.json and cleanup.json).
- Owned temporary fixtures/cache/scratch removed1787247bytes; retained reports
  are diagnostic evidence.

---

*Last updated: 2026-10-24*
