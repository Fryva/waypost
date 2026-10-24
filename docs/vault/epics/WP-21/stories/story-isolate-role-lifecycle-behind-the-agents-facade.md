---
type: story
id: "story-isolate-role-lifecycle-behind-the-agents-facade"
epic: "WP-21"
title: "Isolate role lifecycle behind the agents facade"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-24
updated: 2026-10-24
external_refs: {}
tags: []
code_refs: ["scripts/agents.mjs", "scripts/agents-roles.mjs", "tests/agents-roles.test.mjs", "scripts/agents-registry.mjs", "scripts/agents-render.mjs", "scripts/agents-detection.mjs", "tests/harness.test.mjs", "tests/agents-registry.test.mjs", "tests/agents-render.test.mjs", "tests/agents-detection.test.mjs", "tests/predicates.test.mjs", "tests/state-migrate.test.mjs", "tests/limit.test.mjs", "docs/harnesses.md", "docs/vault/adr/0003-agent-roles-across-harnesses.md", "docs/vault/adr/0005-harness-registry.md"]
specs: []
started_at: "2026-10-24T16:31:20.823Z"
closed_at: "2026-10-24T16:39:25.727Z"
plan_updated_at: "2026-10-24T16:31:20.823Z"
---

# Isolate role lifecycle behind the agents facade

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Reading or installing roles currently requires the 39,742-byte agents facade
alongside routing and CLI. Move the connected definitions/lifecycle into one
focused module, keeping all state and safety contracts.

## Decomposition

- [x] Move literal definitions/cache/metadata/paths/install/uninstall/status block.
- [x] Preserve fifteen public bindings, the 44-name facade and one shared role cache.
- [x] Verify parsing/cache/roster/status/foreign-file contracts, parity, tests and review.

## Implementation Plan

Fresh planner at9f5d222 selects lines45–413 (16,841 bytes): comment before
TOOL_VOCABULARY through before Routing block. One agents-roles.mjs owns definitions,
shared role cache, metadata/roster/paths, aggregate helpers and install/uninstall/
status. Imports fs existsSync/readFileSync/readdirSync/mkdirSync/writeFileSync/
unlinkSync/rmdirSync/statSync; path join/dirname; createHash; lib pluginRoot/
projectRoot/readConfig/parseFrontmatter/loadLayout/pathUnder; registry PREFIX/TIERS/
registry/harness/CONFIDENCE/harnessIds/roleSpec; render installedRoleOf/renderHashOf/
renderFor/fill. Export only the original fifteen public bindings: rolesDir,
roleNames,readRole,listRoles,skillsOf,rosterFor,harnessesNamingModels,targetDir,
harnessOwnedPaths,targetPath,isAggregate,hasRoleFiles,install,uninstall,status.
Facade imports/re-exports these unchanged, no wrappers/private helpers/backimport.
Remove only newly unused imports: crypto; fs readdirSync/unlinkSync/rmdirSync/
statSync; lib parseFrontmatter/loadLayout/pathUnder; local registry TIERS/registry/
CONFIDENCE; local render import (public re-export stays). Routing/CLI unchanged.

Preserve sole cache keyed path+mtime+size and returned mutable role-object identity;
old cache entries accumulate as before. Keep sorting, errors, parsing defaults,
source hashes, closed tool/tier vocabulary, summary limits and roster fallback.
Preserve skills reads-array identity/validation, paths, metadata/model policy.
Preserve lifecycle result/write order, provenance foreign-file guards, nested
cleanup, aggregate ownership and user fields. Malformed aggregate install/uninstall
throws; status reports absent. Absent/foreign status must not read/render role
body. No code/data/policy/security/dependency/ADR-status change beyond extraction;
no new pilot/budget. One lifecycle module is preferable to a tiny cache module.

Retain baseline and exact reverse reconstruction, frozen 44-name namespace,
90bundled/95local role renders, CLI/errors/install/register/model files. Add frozen
lifecycle install->repeat->drift->status->uninstall results/files, aggregate foreign/
malformed cases and routing/renderBlock. New env-first tests verify fifteen
bindings/lazy import/shared cache/invalidation, parsing defaults/errors/roster,
metadata/paths and lifecycle/provenance/foreign/aggregate/nested/status behavior.
Existing harness/standing-context/skill/consent/child-env assertions remain.
Run syntax/package and affected heavy-gated regression contour; bind full logs
and tested sources. Independent reviewer before close/commit. Measure focused and
combined bytes without inferring native-token/runtime/workflow savings.

## Acceptance Criteria

- [x] Literal extraction reverses exactly; fifteen bindings/44-name namespace and one shared cache preserved; no private API expansion/backimport. — evidence: move-edits.json, block-before.txt, measurement.json, tests-attempt-1.log; independent reviewer ship.
- [x] Parsing/cache/roster/metadata/lifecycle/status/error/foreign-file contracts preserved; frozen outputs/files match and new direct regressions pass. — evidence: cli-before.json/cli-after.json, lifecycle-before.json/lifecycle-after.json and matching files snapshots; ten new tests in tests-attempt-1.log; independent reviewer ship.
- [x] Relevant regression/protection checks pass through heavy admission; module packaged; independent reviewer accepts source/log identities and honest source-size limits. — evidence: validation.json (177 passed, 0 failed/skipped, exit 0), pack-proof.json; reviewer verified 56 current, 54 baseline and 11 dirty hashes plus manifest/full-log SHA.

## Final Summary

Implemented: agents.mjs 39,742 -> 23,077 UTF-8 bytes, focused roles module
17,439 bytes, combined +774 bytes. Literal 16,841-byte block and entire baseline
reverse reconstruction are exact. Fifteen public bindings, 44-name facade and
single mutable role cache are preserved. Role parsing, roster, metadata, paths,
foreign guards, aggregate ownership, cleanup and status behavior are unchanged.
All 185 role renders and CLI/install/register/model files/errors match. Full
lifecycle install/repeat/drift/status/uninstall, foreign/malformed aggregate and
renderBlock snapshots match. Syntax/package checks pass. Heavy-gated targeted
checks: 177 passed, 0 failed/skipped, exit 0, 75.188 seconds on Node 25.6.1/macOS,
including ten new regressions. Independent reviewer: ship, no findings; verified
56 current/54 baseline/11 dirty hashes and full log/manifest SHA, seven CLI and
four lifecycle fixture files. Doctor: 0 issues, 0 warnings. All five agents
source modules now fit below 24,000 bytes; full CI for this change is a follow-up.
Baseline full CI40103868926 passed Node20/22/24. No native-token, runtime or
workflow saving measured; no new pilot or budget allocation.

## Technical Notes

Mechanical extraction under accepted ADR0003/0005/0008. Baseline full CI40103868926
at9f5d222 passed Node20/22/24. No new architecture/policy choice.

## Attachments

- .waypost/experiments/wp21-agents-lifecycle-module-20261024/

---

*Last updated: 2026-10-24*
