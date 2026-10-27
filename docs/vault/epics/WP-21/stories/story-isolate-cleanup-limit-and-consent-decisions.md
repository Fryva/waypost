---
type: story
id: "story-isolate-cleanup-limit-and-consent-decisions"
epic: "WP-21"
title: "Isolate cleanup limit and consent decisions"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-27
updated: 2026-10-27
external_refs: {}
tags: []
code_refs: ["scripts/cleanup.mjs", "scripts/cleanup-limit.mjs", "tests/cleanup-limit.test.mjs", "tests/cleanup.test.mjs", "tests/limit.test.mjs", "scripts/doctor-guards.mjs", "docs/how-it-works.md", "docs/vault/adr/disk-hygiene-by-discovery-a-toolchain-registry-a-machine-and-project-profile-and-cleanup-only-after-a-yes.md"]
specs: []
started_at: "2026-10-27T17:31:43.702Z"
closed_at: "2026-10-27T17:44:23.127Z"
plan_updated_at: "2026-10-27T17:31:43.702Z"
---

# Isolate cleanup limit and consent decisions

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Make pure cleanup-limit grammar, owner gating, consent and reporting readable without item classification. Mechanical source split under existing WP-21/ADR-0008 boundaries; preserve the accepted cleanup safety policy and its executable guards.

## Decomposition

- [x] Freeze source/API and pure before/after decisions/formatting baseline.
- [x] Validate leaf before atomic owner wiring; carry removal guards to both files.
- [x] Verify existing consumers and non-vacuous guard controls, review and cleanup.

## Implementation Plan

Move literal7646B EOF machine-wide-limit cohort (parseLimit/limitChange/limitDecision/shortfallOf/consent/logLine/formatLimit/formatOutcome) plus original private GB line to cleanup-limit.mjs, no imports or module state. GB has no other executable consumer; remove from owner. Leaf ceiling12000B. Owner only directly re-exports eight bindings, no local imports or other edits; public namespace24 and function-source/name/arity remain. Owner stays around26.7KB; no forced threshold split. Preserve grammar/Number and String coercion/errors, property/getter order, gate precedence, reason whitespace/non-string permissiveness, log spread overrides, at/time/array/count/deadline formatting; do not fix misleading legacy comments by changing behavior.

Two accepted disk-hygiene forbid guards currently select only scripts/cleanup.mjs. Change ONLY their in selectors to scripts/cleanup*.mjs, matching existing sizes*.mjs convention; currently this selects exactly cleanup.mjs and cleanup-limit.mjs. Regex/why/policy and writing layer unchanged. Add permanent owned-fixture controls: both guards must specifically detect inert forbidden source strings in each selected file, not merely any issue or a selects-no-file finding; bin writer fixture remains outside guard selection. No fixture code is executed. Existing doctor guard check retained with updated family description. No removal operation on user/project artifacts.

Freeze whole owner/API24 plus pure decision/format matrix and getter/conversion/error traces. Exact inverse restores GB/EOF chunk/removes wiring; compare guard objects to original apart from two selector additions. Create/syntax-load leaf before atomic owner replacement. Focused alias/arity/budget and guard controls, existing cleanup/limit and doctor-guards tests through heavy with source/runtime/runner/log receipts. Package/syntax/diff-check/Doctor issue/warn/warning0; independent finalreview and owned-temp cleanup before CLI-close. ADR edits only code_refs and guard coverage maintenance, no decision/status changes. Local files only, no external Codegraph/native workload or measured token/runtime savings.

## Acceptance Criteria

- [x] Literal EOF/GB move and inverse/API24/name/arity/function sources preserved, eight direct aliases, leaf<=12000B with no imports/I/O/state; pure baseline matches values/order/errors - evidence: `comparison.json`, exact source/API snapshots and `pure-before.json`/`pure-after.json` in `.waypost/experiments/wp21-cleanup-limit-20261027/`.
- [x] Both unchanged removal regex guards select owner AND leaf, non-vacuous inert-fixture negative controls pass; focused/existing tests, package/syntax/Doctor pass with source-bound receipts - evidence: `guard-coverage.json`, four concrete match-path controls, `validation.json`, full `tests.tap`, `pack.json`, `doctor.json`.
- [x] Independent review accepts diff/evidence; docs identify pure boundary; owned-temp cleanup before CLI close - evidence: `review-final.json`, thirteen matched input hashes and `cleanup.json` removal confirmed.

## Final Summary

Literal7646B EOF limit/consent/report cohort and original GB moved to7669B leaf (ceiling12000); owner34241->26709B, still>24KB, combined+137B. Eight direct aliases/API24/function-source/name/arity and exact inverse preserved; valid leaf loaded before atomic owner wiring. Pure99case baseline/current with14getter/coercion events matches values/order/errors. Both original disk-hygiene removal regex/why objects unchanged apart from two in selectors to cleanup*.mjs, currently exactly owner+leaf. Four inert-fixture controls verify concrete match paths; CLI writer remains outside selector, no fixture code executed. Existing doctor guard check retained. Source-bound4file run151pass0fail/skip,49918.878958ms Node24.22.1 wrapper/child0,405input identities/stable binary. CPU gate waited before admission alongside foreign build; no bypass. Package/syntax/diff-check/Doctor issue/warn/warning0; independent reviewer no findings. Cleanup before close removed1621274logicalB own runner/npmcache; retained proof `.waypost/experiments/wp21-cleanup-limit-20261027/`. No setting/sweep/user-artifact removal, policy/status change, native pilot or measured token/runtime/net saving. New Node20/22/24 CI follows publication.

## Technical Notes

parseLimit comment says never throws, but a hostile String conversion can throw; preserve that existing direct-call behavior. No setting, automatic cleanup sweep or user-artifact deletion is performed. Helper fixtures only write inert text and remove their own temporary directories.
