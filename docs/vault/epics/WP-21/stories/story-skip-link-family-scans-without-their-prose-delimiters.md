---
type: story
id: "story-skip-link-family-scans-without-their-prose-delimiters"
epic: "WP-21"
title: "Skip link-family scans without their prose delimiters"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-05
updated: 2026-11-05
external_refs: {}
tags: []
code_refs: ["scripts/lib-links.mjs", "tests/lib-links.test.mjs"]
specs: []
started_at: "2026-11-05T01:02:00.880Z"
closed_at: "2026-11-05T01:11:57.895Z"
plan_updated_at: "2026-11-05T01:02:00.880Z"
---

# Skip link-family scans without their prose delimiters

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

The shared parser starts both regex matchAll scans even when stripped prose lacks the family's required literal opener. Skip only impossible families after stripping, preserving every extracted link and all existing preparation/error behavior.

## Decomposition

- [x] Guard existing wiki/markdown loops independently after stripCodeSpans, only for primitive-string prose lacking [[ or ]( respectively.
- [x] Preserve regex/bodies/order/duplicates/exclusions, delimiter joining during stripping, custom replace/matchAll and exception contracts.
- [x] Verify actual raw-output parity, delegated scan counts and controlled timing; focused parser/graph consumers, CLI/Doctor and independent review.

## Implementation Plan

Only scripts/lib-links.mjs extractLinks: after unchanged stripCodeSpans/out initialization, prefix wiki loop with typeof prose !== string || prose.includes([[); prefix markdown loop similarly with ](. Keep actual regex/bodies and loop order literal. Use non-string fallback so custom replace returns/prose.matchAll/errors stay on old path; no coercion/new helper/export/cache/state. Never test contiguous delimiters on raw text: stripping code/comments can join separate characters into links. Test empty/wiki/md/both/hidden and code/comment/fence-joined openers, null/numeric/String/custom object/error paths; retain aliases/fragments/order existing tests. Source-bound actual-module old/current extraction compares actual vault plus corpus and custom method/error traces; count delegated actual matchAll iterator starts, with separate guards/includes overhead. Complete graph/ready/codemap CLI JSON at fixed clock/same paths/scaffold and focused link/graph/predicates/CLI namespace/module/routine/state guards via heavy admission, Doctor/reviewer. Preflight in-memory candidate on270real nodes/2263336UTF8B had equal outcomes and median of16alternating paired samples (3 corpus passes each)10.709→9.494ms; this is preliminary controlled extractLinks-only timing, not total CLI latency. Retain timing source/input identities, repeat final candidate on matched frozen inputs if changed; do not infer native/model/quota/net saving. Pure leaf10000B and accepted ADR0008 unchanged; no new architecture or native pilot.

## Acceptance Criteria

- [x] Complete ordered extraction results, preparation/custom-object/error traces, joined-delimiter cases and graph/CLI consumers match baseline; API/purity/read budget preserved. — evidence: actual-vault/corpus before/after outputs; trace-comparison.json; focused tests; CLI pairs.
- [x] Actual corpus starts fewer matchAll scans; controlled timing evidence is source-bound and scoped; focused checks/Doctor and fresh review pass. — evidence: scan-counts.json; timing.json; commands.json; Doctor stdout; outer-heavy-original-records.jsonl; link_delimiter_reviewer: story closed / commit, no findings.

## Final Summary

Two necessary-delimiter guards only, after unchanged stripCodeSpans. Wiki requires [[ in primitive prose; markdown requires ](. Non-string prose follows original matchAll path without includes access; all regex/loop bodies/order unchanged. Comment explains stripping can join delimiters. No cache/state/helper/import/export/API or output format change; existing pure leaf read budget intact.

Confirmed Node24.22.1/macOS:29index/identity/link/readiness+3parser/resolver predicates+11graph/query/reconcile/Doctor-parity+14CLI namespace/module/size/routine+37state-migration=94pass,2state skips,0fail. Final heavy15659exit0; Doctor0issues/warnings;1011source/runtime identities stable. Actual271document extraction and25edge corpus output pairs exact;10custom-method/error/invalid/boxed traces exact. Permanent tests cover code/comment/fence joined delimiters, metadata/ordering existing tests, permissive markdown without opening bracket, non-string includes refusal and same sentinel error from first/second matchAll. Actual graph/ready/codemap CLI JSON stdout/stderr/status exact at common paths/fixed clock/scaffold.

Real delegated matchAll starts542→258 (wiki271→33,markdown271→225); strip replace813→813. New includes542calls explicitly counted: this is skipped regex iteration, not no string scanning. Controlled final uninstrumented literal-source parser timing on same271document inputs:16alternating paired samples,3corpus passes/sample,3warmup passes each; median10.952→9.743771ms(ratio0.88968,~11.03%less). Full sample/runtime/source/input hashes retained; preliminary270doc probe10.709→9.493688ms was separately source-bound in-memory candidate before actual edits. Final source includes explanatory comment, final timing uses final actual code. Timing is in-process extractLinks only, not whole CLI/user latency, universal speedup, memory/native-token/quota/net-workflow saving;0native inference calls BYRUNNER, operator/reviewer usage unmeasured.

Evidence `.waypost/experiments/wp21-link-delimiters-20261104/` retains literal baseline/current/probe source/runtime/input identities, frozen complete texts and corpus, full extraction/error/method traces, delegated scan counts, raw timing samples, actual CLI outputs, exact runner/clock/commands/full logs and cleanup. Preflight68750exit0 and final15659exit0; no failed validation. Owned temporary CLI/vault trees removed via lstat without following external symlink targets; primary evidence retained. Fresh independent link_delimiter_reviewer accepted all AC/decomposition items: story closed / commit, no findings;6review hashes match,1011checked inputs differ only by later story prose.271frozen inputs,25edge cases,10traces,3CLI pairs and final timing medians independently verified; tests not rerun. Base99d8b90 full CI41944859024 was in_progress at last check; no native pilot or budget change.

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-11-05*
