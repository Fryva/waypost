---
type: story
id: "story-keep-brief-folder-descriptions-behind-full-mode"
epic: "WP-21"
title: "Keep brief folder descriptions behind full mode"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-19
updated: 2026-10-19
external_refs: {}
tags: []
code_refs: ["scripts/brief.mjs", "scripts/lib.mjs", "tests/predicates.test.mjs", "tests/harness.test.mjs", "docs/how-it-works.md"]
specs: []
started_at: "2026-10-19T15:47:35.538Z"
closed_at: "2026-10-19T15:51:47.169Z"
plan_updated_at: "2026-10-19T15:47:35.538Z"
---

# Keep brief folder descriptions behind full mode

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

The default session orientation repeats folder README descriptions already available on demand. Under accepted ADR-0008, hide only the Purpose column in default brief while preserving every layout folder, kind, count, policy, in-flight item and advisory. Full mode and JSON facts retain current detail. This is a bounded local output optimization, not a claim of total token savings.

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [x] Add renderer option preserving existing default/full callers; brief selects compact folder table.
- [x] Cover custom/empty folders, escaped descriptions, counts, full/JSON and output budget.
- [x] Measure on frozen facts and verify the affected checks and independent review.

## Implementation Plan

Fresh planner grounded the change in renderVaultSkeleton folder-table rendering and brief selection. Add optional folderPurposes=true to the pure renderer, defaulting to existing complete output. brief passes the full flag; condense and all advisory appenders remain untouched. Add predicate coverage beside skeleton contracts4–6 and a CLI brief regression. Reduce the routine brief ceiling after checking actual fixture output. Preserve full-mode/facts on frozen real-vault inputs, and test affected predicate/harness checks through the heavy gate before independent review.

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [x] Default brief emits Folder/Kind/Count for every folder (including custom/empty folders and epic/story counts), without Purpose descriptions. Full renderer/default callers and --full output stay byte-identical; JSON facts are unchanged. — evidence: tests/predicates.test.mjs compact folders; tests/harness.test.mjs brief full/JSON; full-before.txt snapshot.
- [x] Policies, in-flight/timeout state and advisory appenders retain their output; links point to full detail. Meaningful renderer/CLI regression tests and stricter brief character budget pass. — evidence: unchanged condense/appenders; predicate outside-table equality; routine budget test.
- [x] Frozen-input before/after measurement and source-bound test log pass independent review. Report character/byte reduction only; no native pilot, token/quota savings claim or budget mutation. — evidence: measurement.json; source-before.json; tests-final.log21pass; fresh reviewer brief_compact_reviewer accepted.

## Final Summary

Default brief now omits only folder Purpose descriptions; full rendering/default renderer callers and JSON facts retain all prior detail. Kept every layout folder, count and advisory. Added custom/empty/escaped-pipe/full/JSON preservation coverage and tightened brief fixture budget2200→1500.21 selected heavy-gated checks passed;155 checked source identities remained stable. Frozen orientation1787→1097 characters (690 removed,38.6121992%), excluding unchanged dynamic appenders. Fresh independent reviewer accepted all3AC without findings. Full suite/other OS/token savings remain unverified; no native pilot or budget mutation.

## Technical Notes

Private evidence `.waypost/experiments/wp21-brief-20261019/`: frozen facts/full-before/compact-before/compact-after/measurement.json; source-before.json binds155 checked inputs; verification.json/tests-final.log. All input hashes matched after the test run. Selected skeleton/brief/routine/standing tests21 passed/0 failed/0 skipped, exit0 through heavy gate. Four syntax checks and diff whitespace passed. Initial sandbox slot EPERM ran no tests; successful elevated gate log is tests-final.log. Full suite/other OS not exercised.

Frozen real-vault condensed skeleton1787→1097 characters,1802→1110 bytes:690 characters removed (38.6121992%). Full renderer snapshot and every non-table character are byte-identical; dynamic presence/team/change/cleanup appenders excluded from this size comparison and unchanged in source. JSON fixture equality/custom+empty folders/escaped pipes/timeout orientation covered. Routine brief ceiling tightened2200→1500. Source size only, no tokenizer/task/quota savings claim or native pilot/budget mutation. Fresh independent reviewer brief_compact_reviewer accepted all3AC/decomposition without findings, independently reproduced output counts/full snapshot and confirmed155 source hashes,7 review hashes and bound21-test log. Reviewer doctor0issues3pre-existing/sandboxwarnings and diff check passed. Verdict story closed / commit. Subsequent lifecycle metadata and derived views only record this verdict.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-19*
