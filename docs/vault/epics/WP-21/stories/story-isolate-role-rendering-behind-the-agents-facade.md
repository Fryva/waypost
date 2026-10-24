---
type: story
id: "story-isolate-role-rendering-behind-the-agents-facade"
epic: "WP-21"
title: "Isolate role rendering behind the agents facade"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-24
updated: 2026-10-24
external_refs: {}
tags: []
code_refs: ["scripts/agents.mjs", "scripts/agents-render.mjs", "tests/agents-render.test.mjs", "scripts/agents-registry.mjs", "tests/agents-registry.test.mjs", "tests/harness.test.mjs", "tests/limit.test.mjs", "tests/state-migrate.test.mjs", "docs/harnesses.md", "docs/vault/adr/0003-agent-roles-across-harnesses.md", "docs/vault/adr/0005-harness-registry.md"]
specs: []
started_at: "2026-10-24T05:54:17.189Z"
closed_at: "2026-10-24T14:29:18.699Z"
plan_updated_at: "2026-10-24T05:54:17.189Z"
---

# Isolate role rendering behind the agents facade

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

A role-rendering task currently reads the 61,625-byte agents facade alongside
installation, detection and CLI. Expose the existing pipeline in a focused module.

## Decomposition

- [x] Move literal maps/scalar/tools/model resolution/provenance/render blocks.
- [x] Keep four facade bindings, private fill, the 44-name API and shared state.
- [x] Verify shape/security/model/hash contracts, frozen parity, tests and review.

## Implementation Plan

Fresh planner at a869200 selects original lines 41–56, 63–101, 230–254,
261–425 and 461–465 (11,753 bytes). agents-render.mjs imports createHash and
PREFIX/harness/roleSpec/harnessTakesModel directly from agents-registry.mjs.
Append export { fill } for the unchanged targetPath caller. Facade imports four
old public functions plus private fill and re-exports ONLY resolveModel,
installedRoleOf, renderHashOf and renderFor. No backimport/cycle/new registry or
cache. Keep createHash in facade for role parsing. TOOL_VOCABULARY, role cache,
reading, harnessesNamingModels, paths/install/status/detection/CLI remain.
Preserve unused PROV_RE, ordered fields/escaping/newlines, tool-denial/read-only
contract, model policy, prompts, provenance removal and both hashes. Aggregate
entry arrays keep object identity. No changes to role/harness data or permissions.
No new ADR, dependency, policy, pilot or budget. Update docs and ADR code_refs only.

Retain complete baseline and exact reverse reconstruction. Freeze all bundled and
local role renders, namespace, CLI output/errors, install/register/model writes
and resulting contents at fixed physical paths/env. New env-first tests cover
four binding identities/no private fill leak, lazy import, synthetic all shapes,
empty fields/YAML scalars/TOML triple quotes, tools/deny/effort/models, unknown
shape/provenance/drift/aggregate array identity. Keep existing regression checks
unchanged. Heavy-gated targeted tests include child-env protection. Syntax/package,
source-bound log and fresh independent review before close/commit. Measure source
sizes, without inferring native-token/runtime/workflow savings.

## Acceptance Criteria

- [x] Literal extraction reverses to baseline exactly, four bindings/44-name namespace and one shared registry/cache preserved; no private fill leak/backimport. — evidence: move-edits.json, blocks-before.json, measurement.json, tests-attempt-2.log; independent reviewer ship.
- [x] All shapes, model/tool/read-only/escaping/hash/error contracts preserved; frozen renders/CLI/writes match; new direct regressions pass. — evidence: cli-before.json/cli-after.json, files-before.json/files-after.json, all eight new tests in tests-attempt-2.log; independent reviewer ship.
- [x] Relevant regression/protection checks pass through heavy admission, module packaged; independent reviewer accepts source/log identities and honest size report. — evidence: validation.json (158 passed, 0 failed/skipped, exit 0), pack-proof.json; reviewer verified 50 source and 11 dirty hashes plus manifest/full-log SHA.

## Final Summary

Implemented: agents.mjs 61,625 -> 50,066 UTF-8 bytes, focused module 11,979
bytes, combined +420 bytes. Five literal blocks and complete baseline reverse
reconstruction are exact. Four public function bindings and the 44-name facade
namespace are preserved; fill is private to facade. All 90 bundled / 95 local
renders, CLI outputs/errors, install/register/model writes and resulting files
match. Syntax/package checks pass. Heavy-gated targeted checks: 158 passed,
0 failed/skipped, exit 0, 72.049 seconds on Node 25.6.1/macOS, including eight new
regressions and child-process env protection. Earlier five-minute CPU admission
refusal exit75 did not start tests and remains in the evidence.
Independent reviewer: ship, no findings; verified all source/dirty/log identities.
Doctor: 0 issues and two existing WP-18 warnings. Baseline a869200 full CI40067242161
passed Node 20/22/24; full CI for this change is a follow-up. No native-token,
runtime or workflow savings measured; no new pilot or budget allocation.

## Technical Notes

Mechanical extraction under accepted ADR0003/0005/0008 and WP21. Baseline a869200;
previous full CI40067242161 passed Node20/22/24 during verification. Evidence is local to
.waypost/experiments/wp21-agents-render-module-20261024/.

## Attachments

- .waypost/experiments/wp21-agents-render-module-20261024/

---

*Last updated: 2026-10-24*
