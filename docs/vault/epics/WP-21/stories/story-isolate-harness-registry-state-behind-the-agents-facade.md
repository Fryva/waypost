---
type: story
id: "story-isolate-harness-registry-state-behind-the-agents-facade"
epic: "WP-21"
title: "Isolate harness registry state behind the agents facade"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-24
updated: 2026-10-24
external_refs: {}
tags: []
code_refs: ["scripts/agents.mjs", "scripts/agents-registry.mjs", "tests/agents-registry.test.mjs", "tests/harness.test.mjs", "tests/limit.test.mjs", "tests/state-migrate.test.mjs", "docs/harnesses.md", "docs/vault/adr/0003-agent-roles-across-harnesses.md", "docs/vault/adr/0005-harness-registry.md"]
specs: []
started_at: "2026-10-24T05:26:25.180Z"
closed_at: "2026-10-24T05:41:03.178Z"
plan_updated_at: "2026-10-24T05:26:25.180Z"
---

# Isolate harness registry state behind the agents facade

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

A registry task currently reads the 69515-byte agents module including renderers,
installation and CLI. Isolate the existing lazy registry state and metadata.

## Decomposition

- [x] Move literal registry block/cache/constants/Proxy and expose only internal roleSpec to its remaining caller.
- [x] Preserve fourteen public bindings, namespace and single cache/Proxy/regexp identity.
- [x] Verify cache/override/error contracts, rendered output, CLI/files, tests, package and independent review.

## Implementation Plan

Fresh planner atb8fe677 selects Harness registry header through before const
CLAUDE_TOOLS. New agents-registry.mjs imports readFileSync/readdirSync, join,
pluginRoot/projectRoot; no backimport of agents. Append export{roleSpec} without
changing literal block. Agents imports fourteen old exports plus private roleSpec
and re-exports ONLY the old fourteen. Existing stdlib/lib/presence imports remain
needed by remaining functions. Tool vocabulary/scalar/render/install/detection/
consent/routing/CLI stay unchanged. Expected focused about8.6KB.

Preserve one Map cache/Proxy/globalregexp object and mutable constants. Cache key
is ONLY pluginRoot; changing projectRoot alone does not invalidate it, and A-B-A
reloads A because the cache has one slot. Keep lazy import/no registry I/O, four
directory precedence, sorted files/id-overwrite behavior, provider separation,
confidence sort and all errors/defaults/model metadata. Do not fix cache policy or
change harness data/models/permissions. No new ADR/policy/cap/dependency/pilot.
ADR0003/0005 gain relevant code_refs and docs pointer only.

Capture whole baseline, literal block and import edits for exact reconstruction.
Freeze public namespace, all bundled role-render shapes/provenance/target paths,
CLI harnesses(default/all/JSON), agents list/show and owned install/register/model
mutations under the same physical fixture paths/env. Include local override and
broken registry errors; compare full stdout/stderr/exits and resulting files.
New env-first regressions use subprocess isolation without cache-busting imports:
fourteen identities/no roleSpec leak, lazy import, same-key Map/no reread, unchanged
project-only key behavior, plugin-root invalidation, A-B-A reload, Proxy/regexp
sharing, four-dir precedence/id fallback/ordering/provider/model metadata and
mandatory/optional directory/malformed JSON errors. Keep existing all-harness
render/install/foreign-file/standing-context/consent/protection assertions.
Run affected checks through heavy gate, syntax/package checks; retain source and
log hashes; independent review before close/commit. Measure focused/combined size
without inferring native-token/runtime/workflow savings.

## Acceptance Criteria

- [x] Literal block and exact baseline reconstruction, unchanged public namespace/fourteen bindings, unique cache/Proxy/regexp, no backimport or changed remaining callers. — evidence: move-edits.json, block-before.txt, measurement.json, tests-attempt-1.log; independent reviewer ship.
- [x] Lazy/cache/root/precedence/provider/confidence/error behavior preserved; old/new all-shape renders, CLI outputs and mutation file snapshots match; direct regressions pass. — evidence: cli-before.json/cli-after.json, files-before.json/files-after.json, eight new tests in tests-attempt-1.log; independent reviewer ship.
- [x] Targeted regression/protection checks pass through heavy admission; package includes module; independent reviewer accepts with source/log identities and honest size/limits. — evidence: validation.json (150 passed, 0 failed/skipped, exit 0), pack-proof.json, source-after.json; reviewer verified 49 source and 11 dirty hashes plus full log SHA.

## Final Summary

Implemented: agents.mjs 69,515 -> 61,625 UTF-8 bytes; focused registry
module 8,583 bytes; combined +693 bytes. Literal block and complete baseline
reconstruction are exact. The original 44-name public facade is preserved;
90 bundled / 95 local-overlay role renders, CLI install/register/model mutations,
error outputs and resulting files match on four retained projects. Syntax and
package checks pass. Heavy-gated targeted checks: 150 passed, 0 failed/skipped,
exit 0, 117.131 seconds on Node 25.6.1/macOS, including eight new regressions.
Independent reviewer: ship, no findings; verified all source/dirty/log identities.
Doctor: 0 issues and two existing WP-18 warnings. Full CI for this change remains
a follow-up; baseline b8fe677 passed Node 20/22/24. No native-token, runtime or
workflow savings measured; no new pilot or budget allocation.

## Technical Notes

Mechanical source extraction under ADR0008 and existing ADR0003/0005, not a new
registry design. lib.mjs explicitly carries a single-file constraint and is not
changed. Baseline b8fe677 full CI40064545732 passed Node20/22/24 during implementation.

## Attachments

- Evidence: .waypost/experiments/wp21-agents-registry-module-20261024/

---

*Last updated: 2026-10-24*
