---
type: story
id: "story-isolate-resource-roots-layouts-and-templates-behind-the-library-facade"
epic: "WP-21"
title: "Isolate resource roots layouts and templates behind the library facade"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-26
updated: 2026-10-26
external_refs: {}
tags: []
code_refs: ["scripts/lib.mjs", "scripts/lib-resources.mjs", "tests/lib-resources.test.mjs", "tests/locales.test.mjs", "tests/predicates.test.mjs", "docs/how-it-works.md"]
specs: []
started_at: "2026-10-26T02:20:04.336Z"
closed_at: "2026-10-26T02:29:04.607Z"
plan_updated_at: "2026-10-26T02:20:04.336Z"
---

# Isolate resource roots layouts and templates behind the library facade

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Move tool-root resolution, layouts and templates into a small resource leaf behind unchanged library bindings. Localized heading registry/cache stays in the facade so independently imported facade instances retain their own cache.

## Decomposition

- [x] Freeze namespace/resource behavior, paths/errors, template rendering and facade cache isolation.
- [x] Move two literal chunks; preserve headings/cache and all callers.
- [x] Verify focused contracts, package, relevant tests and independent review.

## Implementation Plan

Literal pluginRoot comments/body and Layouts/Templates region ending before Heading / keyword registry move into scripts/lib-resources.mjs in the same scripts directory. Direct Node fs/path/url imports only. Facade imports internally used names and re-exports pluginRoot/loadLayout/folderByKind/loadTemplate/renderTemplate unchanged. Keep heading registry, its _headingsCache/private helpers and all consumers literal. Cache-busted lib.mjs?A and ?B remain independently cached; do not move cache into a shared static leaf. Preserve call-time WAYPOST_HOME→CLAUDE_PLUGIN_ROOT→fileURLToPath default root, no path normalization changes, resource reads/errors and template coercions/array JSON/_json/prototype lookup behavior. Freeze before/after namespace/function metadata, root overrides, all shipped layout/template rendering/error cases and representative actual consumer output; compare files and read traces. Prove two chunks and inverse facade exact. Focused tests five bindings/name/arity, no import-time I/O/probes/writes, root path with spaces, fresh reads, template edge cases and query-isolated heading caches; leaf<=4000 B. Run focused/locales/predicates/scripts/harness tests via heavy gate with runtime/source hashes; pack, Doctor0/0 and reviewer. No new ADR/pilot or token-saving claim.

## Acceptance Criteria

- [x] Literal chunks, five bindings/name/arity and namespace100/caller imports preserved; headings/cache remain in facade, no cycles/new dependency. — evidence: `chunks.json`, `wiring.json`, `source-after.json`.
- [x] Roots/resource contents/errors/template rendering/read traces and representative consumers match baseline; independent query-import caches retain identity/isolation. — evidence: `api-before.json`, `api-after.json`, `tests/lib-resources.test.mjs`.
- [x] No new import-time I/O/probes/writes/module cache; leaf<=4000 B, exact inverse/source-size proof and package inclusion retained. — evidence: `comparison.json`, `pack.json`, `tests/lib-resources.test.mjs`.
- [x] Focused and relevant consumer tests pass through heavy gate, Doctor0/0 and independent reviewer approves. — evidence: `validation.json`, `tests-attempt-1.log`, `doctor.json`, `review-final.json`.

## Final Summary

Independent reviewer: ship, no findings, all four acceptance criteria met. Two literal chunks523+1653 B moved to lib-resources.mjs; five bindings/names/arities and namespace100/callers preserved. Heading registry/cache stays literally in facade, preserving independent query-import caches, lazy retry and shared returned-object identity.

Frozen comparison matches4root cases,2layout groups,61template groups,13render cases,136read operations,three actual draft.mjs ADR previews en/ru/zh and11 live file identities. Full inverse facade proof exact. Leaf2314 B (budget4000), facade63911→61875 B, combined+278 B. No import-time I/O/probes/writes/cache added; call-time root precedence, fresh resource reads/errors and template coercions unchanged.

Seven-file admitted test run414pass,0fail/skip,147366.358708ms Node24.22.1 logged at startup with stable binary SHA. Package includes leaf, syntax/diff-check clean and Doctor0issues/0warnings. Reviewer independently verified23current/18baseline/10dirty hashes and source-bound log/runner/argv. Evidence: `.waypost/experiments/wp21-lib-resources-20261026/` (comparison/validation/review-final, before/after replay, source manifests and tests-attempt-1.log). Owned fixture/npmcache/replay runner removed:1590565 B; replay/clock/runtime source retained as text. No native-token, quota, runtime or net-saving measurement.

## Technical Notes

Same-directory module location is required by literal import.meta.url root calculation. Keep the heading cache local to each facade instance; moving it to a static resource dependency would collapse query-import cache isolation.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-26*
