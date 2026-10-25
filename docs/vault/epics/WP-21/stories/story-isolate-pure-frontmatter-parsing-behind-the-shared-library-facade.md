---
type: story
id: "story-isolate-pure-frontmatter-parsing-behind-the-shared-library-facade"
epic: "WP-21"
title: "Isolate pure frontmatter parsing behind the shared library facade"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-25
updated: 2026-10-25
external_refs: {}
tags: []
code_refs: ["scripts/lib.mjs", "scripts/lib-frontmatter.mjs", "tests/lib-frontmatter.test.mjs", "tests/predicates.test.mjs", "tests/scripts.test.mjs", "tests/harness.test.mjs", "docs/how-it-works.md"]
specs: []
started_at: "2026-10-25T18:20:36.260Z"
closed_at: "2026-10-25T18:25:23.326Z"
plan_updated_at: "2026-10-25T18:20:36.260Z"
---

# Isolate pure frontmatter parsing behind the shared library facade

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

The shared library is97966UTF8bytes. Isolate the pure three-function frontmatter/list domain into an independently readable ~4KB leaf while preserving the common facade and every caller. This implements the existing WP-21 incremental lib-split plan, not a parser redesign.

## Decomposition

- [x] Freeze complete facade namespace, function identities/source/corpus and consumer outputs.
- [x] Move only two literal chunks to a pure leaf and wire direct imports/re-exports; preserve facade behavior.
- [x] Pin import purity/API/budget, run consumer checks through heavy admission and independent review.

## Implementation Plan

Planner found two independent literal chunks: Frontmatter list fields section (listOf/refsOf,1883B) and Frontmatter parsing section (parseFrontmatter,2069B), total3952B. Move their exact text/comments into scripts/lib-frontmatter.mjs, with a small descriptive header, no imports/I/O/env/time/cache. refsOf calls local listOf. Facade imports parseFrontmatter for internal buildNodeIndex/gatherVaultFacts and directly re-exports all3; no wrappers/aliases/caller changes or circular imports. Preserve full runtime namespace (baselineexpected100exports), names/arities1/2/2, function source and existing BOM/CRLF/body/quote/comment/null/malformed/list semantics including comma-split fallback. Only other allowed facade delta: remove stale single-file wording from header while retaining no external dependencies. Before edits capture source/chunks/hash/API corpus and real fixture graph/codemap/doctor/default+fullbrief JSON/text facts and file identities. New tests pin identity/namespace/arity/leaf<=6000B(no more than24000), isolated import with delegated source-loader reads and counted denied I/O/probes plus positive controls. Existing predicates/locales/integrity/scripts/harness/ready consumer tests through heavy gate with matching source/log manifest. Reverse wiring/header/moves to reproduce entire baseline exactly; verify newleaf packaging. Docs/code_refs update, reviewer before close/commit. No native experiment or measured savings claim.

## Acceptance Criteria

- [x] Literal chunk/function text preserved; facade exports/bindings/names/arities and all existing caller imports unchanged, no cycle or new external dependencies. — evidence: literal chunks/inverse proof; tests/lib-frontmatter.test.mjs:10.
- [x] Frontmatter/list/bare-ref corpus and real consumer outputs/files are identical, including established malformed-input behavior and exceptions. — evidence: api-before.json/api-after.json; consumers-before.json/consumers-after.json.
- [x] Leaf is pure and <=6000UTF8B; measured facade/leaf/combined sizes and exact inverse whole-source proof recorded without native-token/runtime savings claims. — evidence: comparison.json; tests/lib-frontmatter.test.mjs size/purity checks.
- [x] API/import/size regressions and relevant consumer tests pass through heavy admission; packaging includes leaf,doctor0/0 and independent reviewer approves. — evidence: validation.json; tests-attempt-1.log; independent reviewer ship.

## Final Summary

Pure frontmatter/list parsing is in scripts/lib-frontmatter.mjs. Both original chunks and all3function texts/comments are literal; facade imports parseFrontmatter for internal callers and directly re-exports3bindings. Full namespace100/names/arities preserved, caller imports unchanged. Leaf has no imports/I/O/env/time/cache or cycle; only remaining facade change removes stale single-file wording.

Evidence: .waypost/experiments/wp21-lib-frontmatter-20261025/ retains baseline/current identity manifests, chunks/wiring, exact whole-facade inverse proof,100namespace records and49corpus cases including5exceptions (same names/messages),8consumer modes and13live file contents/inode/dev identities. All match baseline. Leaf4026B<=6000;facade97966->94141B;combined+201B. The rest of facade remains large. These are source/readability measurements, not native-token/runtime/quota/workflow savings.

Admitted Node24.21.0 seven-file run406/406pass,0fail/skip,exit0,88.787s; API/binding/namespace/pure-import positive controls and existing consumer checks pass. Syntax/package pass, leaf included;doctor0issues/0warnings. Independent reviewer ship/no findings verified21current/19baseline/10dirty hashes and manifest/log/package receipts. Own fixture/cache removed after review, receipts retained. BaselineCI40216249860 passed; follow-up CI checked after publication. No native pilot/allocation or parser-policy change.

## Technical Notes

Mechanical extraction within existing WP-21 plan and established presence/doctor facade pattern. The remaining library will still be large; total code may grow slightly through wiring. Do not improve the deliberately minimal YAML/flow parser or change error normalization. No new native pilot or budget change.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-25*
