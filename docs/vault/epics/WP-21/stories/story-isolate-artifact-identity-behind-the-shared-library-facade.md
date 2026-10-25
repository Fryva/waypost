---
type: story
id: "story-isolate-artifact-identity-behind-the-shared-library-facade"
epic: "WP-21"
title: "Isolate artifact identity behind the shared library facade"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-25
updated: 2026-10-25
external_refs: {}
tags: []
code_refs: ["scripts/lib.mjs", "scripts/lib-identity.mjs", "tests/lib-identity.test.mjs", "tests/lib-frontmatter.test.mjs", "tests/predicates.test.mjs", "docs/how-it-works.md"]
specs: []
started_at: "2026-10-25T20:15:06.500Z"
closed_at: "2026-10-25T20:22:32.823Z"
plan_updated_at: "2026-10-25T20:15:06.500Z"
---

# Isolate artifact identity behind the shared library facade

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Isolate the self-contained Artifact identity domain from the94141-byte shared library into a one-pass leaf, preserving facade API, caller imports and legacy identity/collision behavior. This continues the existing incremental WP-21 extraction plan.

## Decomposition

- [x] Freeze namespace/function/corpus and real draft/graph/reconcile/doctor consumer outputs.
- [x] Move the6585-byte Artifact identity chunk literally; preserve bindings and private helper behavior.
- [x] Pin identity/purity/read-budget and meaningful order/collision cases; run admitted tests and independent review.

## Implementation Plan

Planner identifies the contiguous Artifact identity section before Story discovery,6585UTF8B. Move all7exported functions/comments literally to lib-identity.mjs, no imports/I/O/process.env/Date/cache; preserve localeCompare/coercions/regex/parseInt. Only dependency escapeRe: keep existing76B private helper (including trailing LF) for heading registry and copy it literally as private helper in leaf (standard stateless regex escaping; no new regexp module/export). Facade imports isLegacyNumberedId+slugIdentity for internal consumers and directly re-exports all7, no wrappers/aliases; fullnamespace100 stays. Heading registry/cache,slugify,CYRILLIC,date/numbering and other code stay put. Before changes freeze complete100namespace/name/arity/functionsource data, identity/matcher/display/order/collision corpus with input order and exceptions, plus owned real-vault draft collision/control preview, graph/codemap/reconcile/doctor and file identities with fixed clock. New tests focusedbindings/arity/exact7exports,pureimport counted guards+positivecontrols (delegate legitimate Node source reads),leaf<=9000B and first-collision/input preservation. Existing frontmatter test pins facade100; existing predicate/doctor-artifact/spec/script/harness/ready consumers run through heavy admission. Reverse only wiring/move to recover fullbaseline; verify private helper copy independently. Package leaf,docs/code_refs and fresh reviewer before close/commit. No native experiment/token/runtime saving claim.

## Acceptance Criteria

- [x] Original chunk and private escapeRe copy are literal; seven bindings/names/arities and namespace100/caller imports preserved without cycles or new dependencies. — evidence: literal block/helper and inverse proof; tests/lib-identity.test.mjs:10.
- [x] Legacy candidates, digit-leading ambiguity, matcher tiers, conflict blacklist, display numbering, ordering and first collision/input order preserve corpus and consumer results/files. — evidence: api-before.json/api-after.json; consumers-before.json/consumers-after.json.
- [x] Leaf <=9000UTF8B and no own I/O/probes/process.env/clock/cache; inverse entire facade and measured source sizes recorded without native-token/runtime savings claims. — evidence: comparison.json; import-purity and byte-budget tests.
- [x] Focused API/purity/order tests and relevant existing consumers pass through heavy admission; package includes leaf,doctor0/0 and independent reviewer approves. — evidence: validation.json; tests-attempt-1.log; independent reviewer ship.

## Final Summary

Artifact identity now lives in lib-identity.mjs: seven public functions and original6585-byte chunk copied literally, plus the original76-byte private escapeRe helper (including LF). The heading-helper copy remains unchanged in the facade. Facade imports two internal bindings and directly re-exports seven; fullnamespace100/name/arity/binding identity and caller imports preserved. No imports/I/O/process.env/clock/cache/cycle in leaf; legacy ambiguity/matcher/blacklist/display/order/first-collision semantics unchanged.

Evidence: .waypost/experiments/wp21-lib-identity-20261025/ retains fullbaseline/current identities, chunk/helper/wiring and inverse whole-facade proof.100export metadata/source identities,396corpus cases including5exceptions and input-order/nonmutation checks match. Nine consumer modes (including real draft collision/control previews) and16file contents/inode/dev identities match. Leaf6797B<=9000,facade94141->87794B,combined+450B. Remaining facade stays large; these are source/readability sizes, no native-token/runtime/quota/workflow savings measured.

Nine-file admitted Node24.x run417/417pass,0fail/skip,exit0,100.255s; exact patch not logged at launch, executable verifiedv24.22.1after run (timestamps retained). API/purity/positivecontrols/immutablefirstcollision and existing consumers pass. Syntax/package pass, leaf included;doctor0/0. Independent reviewer ship/no findings verified22current/20baseline/10dirty identities and log/manifest/package receipts. Own fixture/cache removed after review, receipts retained. BaselineCI40221186509success; follow-up CI checked after publication. No new native pilot/allocation or identity-policy change.

## Technical Notes

Tiny standard private escapeRe helper is deliberately copied for a self-contained leaf; original heading-helper copy remains unchanged. The leaf does not export it. No parser/identity grammar fixes, renames, new resolver/flags or native budget change. Remaining facade stays large; total code may grow through wiring.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-25*
