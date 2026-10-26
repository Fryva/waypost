---
type: story
id: "story-isolate-read-only-vault-file-discovery-behind-the-library-facade"
epic: "WP-21"
title: "Isolate read-only vault file discovery behind the library facade"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-25
updated: 2026-10-26
external_refs: {}
tags: []
code_refs: ["scripts/lib.mjs", "scripts/lib-vault-files.mjs", "tests/lib-vault-files.test.mjs", "tests/lib-frontmatter.test.mjs", "tests/predicates.test.mjs", "tests/commits.test.mjs", "docs/how-it-works.md"]
specs: []
started_at: "2026-10-25T21:32:24.043Z"
closed_at: "2026-10-26T01:19:00.104Z"
plan_updated_at: "2026-10-25T21:32:24.043Z"
---

# Isolate read-only vault file discovery behind the library facade

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Move the cohesive read-only vault discovery/ref/path/activity domain into one readable leaf, retaining the library facade and every caller. This continues the incremental WP-21 split without changing filesystem or containment policy.

## Decomposition

- [x] Freeze100API metadata, filesystem corpus/read traces and consumer previews/files.
- [x] Move three literal chunks and wire ten shared bindings with direct Node read-only imports.
- [x] Pin import purity/read-only behavior/shapes/paths/activity/budget; run admitted consumer tests and independent review.

## Implementation Plan

Planner finds Story discovery+refs/privatevaultRelPath5344B, realPath/pathUnder/isInsideVault2503B, listVaultStoryFiles/lastVaultActivityMs1496B,total9343B. Literal move to lib-vault-files.mjs, imports only fs existsSync/readdirSync/statSync/realpathSync and path join/resolve. No caches/writes/probes/import-time I/O/facade dependency. Facade imports listEpicStories/listVaultStoryFiles/pathUnder for remaining callers and directly re-exports all10, preserving namespace100/name/arity/identity and all existing caller aliases. Other config/process/state/collector/emitter code stays literal. Preserve stat-following-symlinks, README exists-only acceptance, distinct directory filters, sorted stories-before-standalone order, catch boundaries, hardcoded epics/, extra ref-segment handling, lexical OR realpath containment and call-time platform(win32ONLYfold)/cwd. Do not tighten any grammar/filter/path rule. Before edits freeze API/function sources and actual ownedfilesystem cases incl three shapes, hidden/underscore epics, invalidREADME types, acyclic symlinks, missing/non-directory paths, refs, separator/platform cases and fixedmtime activity; trace read calls with child-only builtin wrappers and deny writes/probes, compare returns/errors/type/code/order and file identities. Real consumer ready/graph/codemap/doctor/brief/story-preview/containment refusal on separate validvault. Newtests bindings/importpurity/no writes/probes/fssemantics/calltimecwd+platform and leaf<=12000B; existing predicates/commits/doctor-artifacts/script/harness/ready plus facade-namespace checks through heavy slot with startupversion/binarySHA. Inverse fullfacade exact, package/docs/code_refs, fresh reviewer beforeclose. No native pilot or savings inference.

## Acceptance Criteria

- [x] Three chunks literal; ten bindings/name/arity and namespace100/caller aliases preserved, no cycles/new external dependency/shared cache copies. — evidence: `chunks.json`, `wiring.json`, `source-after.json`.
- [x] Return/error/read-operation sequence, discovery shapes/order/filter differences, symlinks, refs, containment/platform/cwd and activity preserve filesystem corpus, consumer results and file identities. — evidence: `api-before.json`/`api-after.json`, `consumers-before.json`/`consumers-after.json`.
- [x] Import adds no own I/O/probes and calls add no writes/probes/cache; leaf<=12000B, whole-facade inverse and source-size measurements retained without native-token/runtime savings claims. — evidence: `comparison.json`, `tests/lib-vault-files.test.mjs`.
- [x] Meaningful API/filesystem/purity/budget and relevant existing consumer tests pass through heavy admission; leaf packaged,doctor0/0 and independent reviewer approves. — evidence: `validation.json`, `tests-attempt-3.log`, `pack.json`, `doctor-final.json`, `review-final.json`.

## Final Summary

Independent reviewer: ship, no findings; AC1–AC4 met, 25 current source and 10 final dirty-file hashes independently verified. Three literal chunks preserve all 100 facade exports, ten function bindings/names/arities and caller imports. Frozen comparison matches 103 filesystem cases, 491 read operations, 39 API entries, nine consumer modes and 13 unchanged files, including outside-vault write refusal. Whole-facade inverse is exact.

Leaf 9533 B (budget 12000); facade 80237 → 71173 B; combined +469 B. Import purity, call-time reads/no writes or probes, shapes/filters/order/symlinks/errors/refs/containment/platform/cwd/activity verified. Ten-file admitted test run: 389 passed, zero failed/skipped, 127769.6855 ms, Node 24.22.1 logged at launch with stable binary SHA. Earlier admission refusals exited 75 before tests and remain in the receipt. Package includes leaf, syntax/diff-check clean and Doctor zero issues/warnings.

Evidence: `.waypost/experiments/wp21-lib-vault-files-20261025/` (`comparison.json`, `validation.json`, `tests-attempt-3.log`, `review-final.json`, source manifests and frozen replay receipts). Owned temporary fixtures/cache/runner removed: 1619095 B; replay sources retained as text. No native-token, quota, runtime or net savings measured; simulated platform checks are not native Windows coverage.

## Technical Notes

This leaf intentionally performs read-only filesystem operations at call time. Do not replace stat with lstat, validate README type, unify discovery filters or tighten existing ref/containment behavior during extraction. Simulated platform tests are not native Windows runtime coverage. Remaining facade stays large; wiring may increase total code.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-26*
