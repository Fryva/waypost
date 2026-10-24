---
type: story
id: "story-isolate-harness-installation-diagnostics-from-doctor-orchestration"
epic: "WP-21"
title: "Isolate harness installation diagnostics from Doctor orchestration"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-24
updated: 2026-10-24
external_refs: {}
tags: []
code_refs: ["scripts/doctor.mjs", "scripts/doctor-install.mjs", "tests/doctor-install.test.mjs", "tests/harness.test.mjs", "tests/predicates.test.mjs", "tests/locales.test.mjs", "tests/scripts.test.mjs", "tests/state-migrate.test.mjs", "docs/how-it-works.md", "docs/vault/adr/0003-agent-roles-across-harnesses.md"]
specs: []
started_at: "2026-10-24T00:59:43.626Z"
closed_at: "2026-10-24T02:20:26.278Z"
plan_updated_at: "2026-10-24T00:59:43.626Z"
---

# Isolate harness installation diagnostics from Doctor orchestration

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

The 45146-byte Doctor mixes harness installation diagnostics with orchestration
and repairs. Isolate the existing detection logic for focused source reads.

## Decomposition

- [x] Move two literal blocks and exact private finding factory.
- [x] Preserve ten function bindings, the instruction ceiling and shared regexp.
- [x] Verify CLI, repair regressions, package inclusion and independent review.

## Implementation Plan

Fresh planner at 1dd4770 selects config through checkAgentRoles (before launcher
comment) plus the complete skills comment/checkAgentSkills (before process-table
comment). New scripts/doctor-install.mjs imports fs exists/read/readdir/access/
constants; path join/relative; lib loadLayout/folderByKind/pluginRoot; original
agents routing/detection/status imports; original skills status/skillNames.
Copy private finding exactly. Reuse AGENT_BLOCK_MARKER from agents, never clone
its regexp. Doctor imports/re-exports ten checks and INSTRUCTIONS_MAX_LINES;
remove moved-only imports while retaining detectHarnesses for repairs and lib
layout/path dependencies. All launcher/driver/shared-state/process/vault-git,
runners, CLI and repairs stay unchanged. Expected focused size about 15.2 KB.

Preserve early config/path failures, template registry semantics, per-file block
count/order, regex resets, instruction threshold and Claude relative imports,
raw environment overrides, exact ignore-line matching, running-harness evidence,
foreign-role/skill identities, relevance/grouping/order and errors. No new policy,
model, dependency, cap, budget or native pilot. ADR-0003 gains code_refs only.

Keep full baseline and moved spans/helpers/import edits to reconstruct Doctor
byte-for-byte. Nine retained real-Git CLI install fixtures cover unbound/missing
vault, plain with env overrides, bad layout/language, duplicate/stale routing,
broken Claude imports/long instructions, foreign role/skill; JSON/text/stderr/
exits and all fixture file hashes must match. Add focused binding/full-finding/
immutable-input/threshold/regexp-state regressions with env.mjs first. Existing
harness role/skill/repair, localization, template, graph/reconcile and child-env
checks remain unchanged. Run affected tests through heavy gate, syntax/package
checks; retain source and log hashes for independent review. Record total source
growth separately from focused size, without inferring measured token savings.

## Acceptance Criteria

- [x] Two literal blocks/private factory and all eleven public exports remain identical; complete baseline reconstructs byte-for-byte, shared regexp/callers/repairs unchanged. — evidence: independent reviewer verified move-edits.json/blocks-before.json; runtime binding assertions passed in tests-attempt-3.log.
- [x] Config/path/template/instruction/env/ignore/roles/skills findings preserve values, ordering and errors; fixed CLI outputs and read-only hashes match. — evidence: cli-before/after.json and files-before/after.json; reviewer verified all 184 retained fixture files.
- [x] Focused and existing regression/protection checks pass through heavy admission, package contains new module and independent reviewer accepts; sizes and limits reported honestly. — evidence: validation.json (163 passed, zero failed/skipped, exit 0), pack-proof.json and independent reviewer ship verifying source/log hashes.

## Final Summary

Doctor45146 ->30863 UTF-8 bytes; focused15168; combined+885. Two literal blocks
and finding factory moved; complete baseline reconstruction exact. Nine CLI
install scenarios match JSON/text/stderr/exits and all184fixture file hashes.
All eleven public bindings, shared regexp and existing repair behavior preserved.

Heavy-gated targeted validation passed:163 tests, zero failed/skipped, exit0,
51.186seconds, Node25.6.1/macOS. Includes eight new regressions and existing
role/skill/repair/template/instruction/graph/reconcile/child-env protection checks.
Two earlier CPU admission refusals (exit75 before tests) retained. Syntax and
package proof pass,11Doctor modules included. Independent reviewer ship, no
findings/open questions, verified36source hashes plus manifest/full-log SHA.
Doctor0issues/two oldWP18warnings. No native-token/runtime/workflow saving measured.

## Technical Notes

Mechanical source extraction under ADR-0008, not a new architectural choice.
Full baseline CI40044948658 at1dd4770 passed Node20/22/24. This change passed the
local targeted contour; its own full CI remains pending until publication.
No workflow/native-token savings established.

## Attachments

- Evidence: .waypost/experiments/wp21-doctor-install-module-20261024/
  (measurement.json, blocks-before.json, move-edits.json, source-before/after.json,
  review-inputs.json, cli-before/after.json, files-before/after.json, fixture/move
  runner source, validation.json, validation-pending.json, tests-attempt-1/2/3.log, pack-proof.json,
  fixture-cleanup.json, doctor.log). Temporary fixtures/cache/scratch scripts
  removed: 1792746 bytes; retained reports are diagnostic evidence.

---

*Last updated: 2026-10-24*
