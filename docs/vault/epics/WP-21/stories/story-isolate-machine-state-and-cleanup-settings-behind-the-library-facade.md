---
type: story
id: "story-isolate-machine-state-and-cleanup-settings-behind-the-library-facade"
epic: "WP-21"
title: "Isolate machine state and cleanup settings behind the library facade"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-27
updated: 2026-10-27
external_refs: {}
tags: []
code_refs: ["scripts/lib.mjs", "scripts/lib-machine-state.mjs", "tests/lib-machine-state.test.mjs", "tests/state-migrate.test.mjs", "tests/cleanup.test.mjs", "tests/limit.test.mjs", "docs/how-it-works.md"]
specs: []
started_at: "2026-10-27T02:49:53.367Z"
closed_at: "2026-10-27T03:04:44.869Z"
plan_updated_at: "2026-10-27T02:49:53.367Z"
---

# Isolate machine state and cleanup settings behind the library facade

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Make machine-state location, legacy discovery and cleanup-setting readers readable without the entire shared library. Literal extraction under accepted ADR-0008/module boundaries; no policy, storage-path, migration or behavior change.

## Decomposition

- [x] Freeze literal cohort and namespace100 baseline.
- [x] Extract machine-state leaf; preserve bindings and call-time defaults.
- [x] Validate existing consumers, package, Doctor and independent review.

## Implementation Plan

Planner verified contiguous11764B cohort from machine-state directory comment through readLastAutoCleanup, before treesOverlap. Move literally to scripts/lib-machine-state.mjs with only node:fs mkdirSync/existsSync/readFileSync/readdirSync/realpathSync, node:path join and node:os homedir/userInfo. No top-level mutable state or I/O. Direct re-export12bindings, remove unused OS and readdir imports from facade. No leaf import from facade or cycle. Leaf ceiling14000B. Freeze complete source/API100 types, values, arrays and function-source/name/arity; whole-facade inverse exact. Preserve Windows AppData pre/post-realpath checks, unreadable legacy roots as unknown, same-home move protection, current writer precedence including off, strictness identity/tie/error behavior and rotated auto-log fallback. stateWriteHint calls machineStateDir(), NOT accountStateDir(); do not silently repair advice. Functions retain call-time OS/env defaults. Leave heading cache and mutable ignore arrays in facade.

Add focused namespace/alias/arity/budget/import-silence test; use existing state-migrate/cleanup/limit integration cases instead of duplicating them. Run four test files through heavy gate with startup/stable binary/source/log/argv identities. Package/syntax/diff-check and Doctor issue/warn/warning0, independent finalreview before CLI-close/commit. Full Node20/22/24 CI after publication, no native pilot or measured token/runtime savings claim.

## Acceptance Criteria

- [x] Literal cohort, direct12aliases and namespace100/API/inverse unchanged; leaf<=14000B and no import-time machine-state I/O — evidence: literal/inverse `comparison.json`, API100 snapshots and `tests/lib-machine-state.test.mjs` in `.waypost/experiments/wp21-lib-machine-state-20261026/`.
- [x] Existing state migration/cleanup/limit and focused tests pass with source-bound receipts; package contains leaf, syntax and Doctor pass — evidence: `validation.json`, full `tests.tap`, `pack.json` and `doctor.json`.
- [x] Independent review approves actual diff/evidence; docs describe new owner; close through CLI — evidence: `review-final.json`, ten verified review input hashes, `docs/how-it-works.md`.

## Final Summary

Literal11764B machine-state cohort moved to11934B leaf (ceiling14000), facade32125->20555B, combined+364B. All12aliases/namespace100/function-source/value snapshots and exact whole-facade inverse preserved. Focused import-silence check and existing migration/cleanup/limit consumers passed:184total182pass0fail2expected platform skips, Node24.22.1,36334.393667ms, wrapper/child0 with389source identities and stable runtime. Package/syntax/diff-check and Doctor issue/warn/warning0; independent reviewer ship/no findings. Removed1606033logicalB owned temporary runner/npmcache; retained source/log/identity evidence `.waypost/experiments/wp21-lib-machine-state-20261026/`. Full Node20/22/24 CI follows publication; local success does not establish live Windows/MSIX/cross-host behavior or native-token/runtime/net savings.

## Technical Notes

No storage or security policy change. Existing migration tests include platform-specific skips: report actual outcomes. Local unit/integration success is not live Windows MSIX or cross-host migration verification.
