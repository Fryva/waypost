---
type: story
id: "story-skip-code-stripping-phases-without-their-current-delimiters"
epic: "WP-21"
title: "Skip code stripping phases without their current delimiters"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-05
updated: 2026-11-05
external_refs: {}
tags: []
code_refs: ["scripts/lib-links.mjs", "tests/lib-links.test.mjs"]
specs: []
started_at: "2026-11-05T01:25:11.087Z"
closed_at: "2026-11-05T01:32:26.092Z"
plan_updated_at: "2026-11-05T01:25:11.087Z"
---

# Skip code stripping phases without their current delimiters

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Avoid regex replacements that cannot match in stripCodeSpans, shared by link extraction and lifecycle checkbox validation. Preserve the exact existing grammar and ordered results.

## Decomposition

- [x] Guard each of the three existing replacements by its required literal delimiter on the current intermediate primitive string.
- [x] Preserve the full original replacement chain for initially non-string inputs, including custom methods, errors and boxed strings.
- [x] Verify full outputs, actual delegated replacement counts, controlled timing, consumers and fresh review.

## Implementation Plan

Inside the existing pure leaf only, capture whether the original input is a primitive string. For that case skip fence replacement without ```; inspect its resulting text before skipping inline replacement without `; inspect the next result before skipping HTML replacement without <!--. Keep regexes and order unchanged. For all initially non-string inputs always run the original three replacements, even if a custom method returns primitive text. No coercion, cache, helper, import/export or API change. Stable standard String intrinsics are assumed, as for existing primitive-string guards.

Preflight on 271 actual documents: fence-only median 9.523→9.447ms (~0.8%, insufficient); sequential all-phase candidate 9.413→8.379ms (~11%) on 16 alternating paired samples, three corpus passes each, three warmups. These are preliminary controlled extractLinks timings, not full CLI or native-token savings. Final literal source and frozen inputs must be bound to evidence. Test joined delimiters, incomplete notation, custom replace/getter/error paths and boxed/invalid inputs. Compare baseline/current strip and extraction outputs, count includes overhead separately, compare actual CLI graph/ready/codemap at identical paths/clock, run focused parser/lifecycle/graph/CLI/state guards through heavy admission, Doctor and a fresh reviewer. Preserve leaf ceiling 10000B, ADR0008 and existing architecture. No native pilot or budget change.

## Acceptance Criteria

- [x] Full stripping/extraction outcomes, custom method/error traces and consumer outputs match baseline, with API/purity/read budget intact. — evidence: frozen corpus strip/extract outputs, trace-comparison.json, cli-comparison.json, focused tests.
- [x] Actual corpus performs fewer delegated replacements, with source-bound scoped timing and all focused checks, Doctor and fresh review passing. — evidence: scan-counts.json, timing.json, commands.json, validation.json and outer-heavy-original-records.jsonl; fresh strip_phases_reviewer: story closed / commit, no findings.

## Final Summary

All three original regexes/order remain; only impossible replacements on primitive strings are skipped, using each current intermediate result. Initially non-string inputs keep the complete original chain, including first/second custom replacements returning primitive text. No API/cache/state/import/export/helper change; leaf stays below 10000B. Fresh critic approved implementation; fence-only was rejected for insufficient measured gain.

Confirmed Node24.22.1/macOS:32index/identity/link/readiness+6lifecycle+3parser/resolver predicates+11graph/query/reconcile/Doctor-parity+14CLI namespace/module/size/routine+37state-migration=103pass,2state skips,0fail. Final heavy51087exit0; Doctor0issues/warnings;1012source hashes stable. Full strip and ordered extraction outputs match for272frozen actual documents and30edge cases;13custom/error/invalid/boxed/primitive-return traces match. Three graph/ready/codemap CLI JSON stdout/stderr/status pairs exact at same paths/fixed clock/scaffold. Permanent cases include intermediate delimiter joins, incomplete fences/comments, no second inline pass after HTML, custom replacement/getter errors and boxed inputs.

Delegated regex replace816→299 on actual documents; matchAll remains259, with includes544→1360 explicitly accounted. Final literal-source, uninstrumented extractLinks timing:16alternating paired samples,3corpus passes/sample,3warmup passes each; median9.675229→8.6286665ms(ratio0.89183,~10.82%less). Counts do not imply no string scanning. Timing is controlled in-process parser only, not wholeCLI/user latency/universal speedup/heap/native-token/quota/net-workflow savings.0native inference calls BYRUNNER; operator/reviewer usage unmeasured. No native pilot or budget change.

Evidence `.waypost/experiments/wp21-strip-phases-20261104/`: actual literal baseline/current and runner, runtime/source manifest, frozen complete inputs and edge corpus, full strip/extraction outputs, custom traces/counts, raw timing samples, CLI outputs, commands/full logs and cleanup. Preflight fence-only85772exit0 (~0.8%, rejected), all-phase probe exit0 (~11%); final51087exit0, no failed validation. All-phase preflight originally copied the wrong helper into probe.mjs.txt; the actual executed helper is retained as probe.executed.mjs.txt in its own directory, final runner self-copy is correct. Ten original outer-heavy records retain starts/completions, SHA81ddf49bc1a975d5005490b5adc45d02b48f80dbdbaffddad7c13f133db112f3. Scratch CLI/vault trees removed6,984,397logical bytes via lstat without following symlink targets; primary evidence retained. Independent final strip_phases_reviewer accepted both AC and all decomposition items with no findings;6review hashes match and1012checked inputs differ only by later story prose. Own helpers also removed26,791B after byte equality with retained copies, total temporary cleanup7,011,188logical bytes. Base250e9e8 CI41946940350 stillin_progress at last check.

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-11-05*
