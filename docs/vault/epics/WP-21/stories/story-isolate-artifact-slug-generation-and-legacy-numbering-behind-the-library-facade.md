---
type: story
id: "story-isolate-artifact-slug-generation-and-legacy-numbering-behind-the-library-facade"
epic: "WP-21"
title: "Isolate artifact slug generation and legacy numbering behind the library facade"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-26
updated: 2026-10-26
external_refs: {}
tags: []
code_refs: ["scripts/lib.mjs", "scripts/lib-artifact-names.mjs", "tests/lib-artifact-names.test.mjs", "scripts/draft.mjs", "tests/predicates.test.mjs", "tests/scripts.test.mjs", "docs/how-it-works.md"]
specs: []
started_at: "2026-10-26T14:48:16.015Z"
closed_at: "2026-10-26T15:00:09.988Z"
plan_updated_at: "2026-10-26T14:48:16.015Z"
---

# Isolate artifact slug generation and legacy numbering behind the library facade

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Move artifact slug generation and the legacy numeric allocator into one small naming leaf behind unchanged public bindings. This continues WP-21 without changing filename policy or modern artifact creation.

## Decomposition

- [x] Freeze namespace, slug returns/errors/coercion traces, filesystem numbering corpus and draft previews.
- [x] Move literal naming chunk and direct re-export; leave dates and other state unchanged.
- [x] Pin focused contracts/import/budget, run relevant tests and independent review.

## Implementation Plan

Move Slug/numbering through nextNumber, before today (1630 B), to scripts/lib-artifact-names.mjs; direct existsSync/readdirSync import only. Keep CYRILLIC private and literal, no copies/exports/freeze. Facade directly re-exports slugify/nextNumber; no internal callers/import changes needed. Preserve original .toLowerCase call/errors rather than adding String coercion, Russian transliteration, other Unicode letters/digits, punctuation/combining removal, hyphen/whitespace collapse and untitled fallback; no normalization. Preserve numbering exists-before-prefix and prefix-before-listing order, case-insensitive escaped prefix, beginning-only match, unfiltered entries/directories/extensions, parseInt/max+1/padding and thrown errors. Freeze full namespace100/function metadata, slug/error/custom-method corpus, real temporary-directory numeric cases and read/coercion traces, fixed-clock actual draft previews with English/Russian/CJK titles. Protect file identities. Prove full inverse facade and literal chunk. Focused exports/name/arity/import-no-actions/no writes/budget<=3000 B tests plus existing predicates/scripts/harness through heavy gate with runtime/source/log SHA. Package/Doctor0/0 and reviewer. Dates/headings/caches/state/atomic writes unchanged; no new ADR/native pilot or saving claim.

## Acceptance Criteria

- [x] Naming chunk literal, two bindings/name/arity and namespace100/callers preserved; private dictionary and other facade code unchanged, no cycle/new dependency. — evidence: `chunks.json`, `wiring.json`, `source-after.json`.
- [x] Slug returns/errors/coercion behavior and numbering returns/errors/read order/filter semantics match baseline; draft previews and protected file identities unchanged. — evidence: `api-before.json`, `api-after.json`, `tests/lib-artifact-names.test.mjs`.
- [x] Import adds no own I/O/probes/writes/timers/cache; leaf<=3000 B, exact inverse/source-size/package proof retained. — evidence: `comparison.json`, `pack.json`, focused import tests.
- [x] Focused and relevant consumer tests pass through heavy admission, Doctor0/0 and independent reviewer approves. — evidence: `validation.json`, `tests-attempt-1.log`, `doctor.json`, `review-final.json`.

## Final Summary

Independent reviewer: ship, no findings; all four acceptance criteria met. Literal1630 B naming chunk, including private CYRILLIC table, moved behind two direct re-exports. Bindings/names/arities, namespace100 and all callers preserved; dates/headings/cache/state/atomic writes unchanged.

Frozen replay matches29slug cases,128numbering cases,5custom getter/coercion cases and205read operations. Five actual draft previews (English/Russian/CJK/digit-leading/emoji) all return0 and match exactly;13protected live file identities unchanged. Modern draft still does not call nextNumber. Full inverse facade proof exact. Leaf1682 B (budget3000), facade45962→44396 B, combined+116 B.

Six-file admitted run408pass,0fail/skip,96258.7165ms Node24.22.1 logged at startup with stable binary SHA. Package includes leaf, syntax/diff-check clean and Doctor0issues/0warnings. Reviewer verified16current/11baseline/10dirty hashes and source-bound log/runner/argv. Evidence: `.waypost/experiments/wp21-lib-artifact-names-20261026/` (comparison/validation/review-final, before/after replay, source manifests and tests-attempt-1.log). Owned fixtures/npmcache/replay removed:1598943 B; sources retained as text. No native-token, quota, runtime or net-saving measurement; new full CI matrix not claimed by this local acceptance.

## Technical Notes

nextNumber is legacy API and stays outside modern artifact creation. Missing directories return padded1 before examining prefix. Existing directories examine prefix before readdir; numeric-looking directories and non-Markdown entries still count. Do not fix these behaviors in an extraction.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-26*
