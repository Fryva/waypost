---
type: story
id: "story-search-source-artifacts-that-share-derived-view-filenames"
epic: "WP-21"
title: "Search source artifacts that share derived view filenames"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-29
updated: 2026-10-29
external_refs: {}
tags: []
code_refs: ["bin/cli/views.mjs", "scripts/lib-resources.mjs", "bin/cli/core.mjs", "scripts/reconcile.mjs", "tests/scripts.test.mjs", "tests/harness.test.mjs", "tests/state-migrate.test.mjs", "docs/cli-reference.md", "docs/vault/adr/0008-token-budget.md"]
specs: []
started_at: "2026-10-29T04:52:43.173Z"
closed_at: "2026-10-29T05:05:11.783Z"
plan_updated_at: "2026-10-29T04:52:43.173Z"
---

# Search source artifacts that share derived view filenames

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Search excludes reserved derived-view basenames at every depth, so legitimate source artifacts such as adr/graph.md are silently absent. Exclude derived views by their exact paths instead, preserving the query-first workflow under accepted ADR-0008.

## Decomposition

- [x] Replace basename exclusions with exact native joined derived paths, including the configured board. — evidence: bin/cli/views.mjs handleSearch; reviewer.json.
- [x] Cover source collisions, real derived paths, layout errors and existing traversal/reporting controls. — evidence: tests/scripts.test.mjs search integration cases; search.tap.
- [x] Retain source-bound baseline/current proof, focused safety checks, independent review and owned cleanup. — evidence: comparison.json; validation.json; diagnostics.json; reviewer.json; cleanup.json.

## Implementation Plan

Keep the three root exclusions. Resolve an optional configured board with withRegistryHome(() => loadLayout(cfg.layout || "engineering")) in a local try/catch, pinned to the executable ROOT like core.run; layout failure retains the old search availability and default exclusions. Only layout.kanban truthiness permits the board path, joined identically to reconcile with its default filename. Compare the walked native absolute path to this Set. No manual separator normalization, realpath/target inspection, traversal rewrite or new flags. Preserve matching/rendering/order/limits/metadata/iCloud behavior. Integration coverage includes typed source artifacts with all reserved basenames, root views, a nested custom board beside a same-name source artifact, missing/malformed layouts, foreign WAYPOST_HOME/CLAUDE_PLUGIN_ROOT regression and existing symlink/limit/literal/line controls. Custom-board/layout fixtures run a real owned CLI copy with their own canonical ROOT. Frozen actual handler on the same owned fixture demonstrates baseline no-match/current pointer and unchanged existing-path output. Run all search tests and focused CLI/module/routine/subprocess guards through heavy admission; bind binary/source/log identities, independent review and owned scratch cleanup.

## Acceptance Criteria

- [x] Nested source artifacts with reserved view basenames are searchable; exact root views and configured custom board remain excluded, using generator-equivalent native paths. — evidence: bin/cli/views.mjs; bin/cli/core.mjs withRegistryHome; search.tap.
- [x] Missing/malformed layouts preserve search availability; matching/metadata/line/rendering/order/limit/iCloud and traversal contracts pass focused regression and safety checks with source identities. — evidence: validation.json (12 search +4 guards pass); diagnostics.json.
- [x] Baseline false-negative/current exact pointer is reproduced on the same owned fixture; independent review accepts, Doctor has no issues/warnings and owned temporary data is removed. No measured native-token/quota/net savings claimed. — evidence: comparison.json (three pointers, eight byte-identical controls); reviewer.json (accepted, no findings); diagnostics.json; cleanup.json (10,278 logical bytes removed).

## Final Summary

Search excludes exact native joined root-view paths and the optional board from the executable ROOT, using withRegistryHome like CLI children. Nested source artifacts sharing those filenames are returned normally; layout failures retain search availability. Source-bound Node 24.22.1: all 12 search tests and four CLI/module/routine/subprocess guards passed without failures/skips; 575 source identities and runtime binary stayed stable. Custom-board and invalid-layout tests use owned real CLI files with their own ROOT; foreign WAYPOST_HOME/CLAUDE_PLUGIN_ROOT cannot hide source documents. Actual baseline/current handler replay on the same owned fixture changes no-match to three exact source pointers; eight existing-output controls remain byte-identical. Initial review rejected an ambient-root mismatch despite passing tests; pre-review-fix/ retains that implementation and evidence, superseded by current validation. The initial runner-only failure before tests ($& replacement expansion) is also retained. All owned runner/fixture data removed; cleanup.json counts both phases. Repeat independent review accepted all criteria without open findings; source-bound Doctor issue/warn/warning counts are zero. No native-token/quota/net savings measured. Local verification is macOS/Node24; full Node20/22/24 CI follows publication.

## Technical Notes

Local bugfix under ADR-0008; no new ADR/API/dependency/native model run or allocation. Root triad remains excluded even in a layout without a board. Symlinked file aliases keep existing lexical traversal behavior; symlink directories remain skipped. Custom layout read errors intentionally do not disable search.

## Dependencies

-

## Attachments

- Local retained evidence: `.waypost/experiments/wp21-search-derived-paths-20261029/`.

-

---

*Last updated: 2026-10-29*
