---
type: story
id: "story-fixed-cohort-and-blind-acceptance-for-token-economy-comparison"
epic: "WP-21"
title: "Bounded paired smoke protocol for token economy"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-17
updated: 2026-10-17
external_refs: {}
tags: []
code_refs: ["docs/vault/ops/paired-token-economy-experiment-with-blind-acceptance.md"]
specs: []
started_at: "2026-10-17T22:40:22.633Z"
closed_at: "2026-10-17T22:44:52.219Z"
plan_updated_at: "2026-10-17T22:40:22.633Z"
---

# Bounded paired smoke protocol for token economy

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

The role-policy change is delivered, but no measured savings exist. Freeze a two-task read-only paired smoke protocol, its original prompts and blinded quality rubric, accounting boundaries and stop rules before asking the owner for a numeric live allowance. This story prepares the experiment only; the proposed 12-task/four-group cohort is not frozen or executed. No new comparator, ledger, model choice, live calls or budget mutation.

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [x] Freeze two original tasks, baseline/treatment snapshots, blinded rubrics and an isolated-corpus recipe.
- [x] Specify all-attempt native accounting, unknown-cost handling, budget/admission limitations and stop rules.
- [x] Independently review the protocol and verify its static inputs without model calls.

## Implementation Plan

Fresh-context planner recommends a docs-only slice: existing v2 reports/receipts already supply counter units, coverage and fingerprints, but do not infer task attempts. Do not invent a comparison schema before a valid pair exists. Use the existing ops runbook, freeze two tasks N1/A1 and exact code revisions, retain a local attempt manifest and explicitly mark unfrozen execution configuration as a launch gate. The eight role calls include independent judges; additional native setup/control calls are accounted too. Numeric owner approval, requested configuration, accounting route and stop limits precede any native experiment call; counted bounded setup establishes observed identity before the first task/judge call. No module split or production change.

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [x] Runbook freezes two task prompts, snapshot revisions, per-task blind acceptance and arm order; distinguishes smoke from the future 12-task comparison and forbids general savings claims. — evidence: docs/vault/ops/paired-token-economy-experiment-with-blind-acceptance.md:55
- [x] All attempts, judges/setup/control/retries and failures remain in accounting; native schemas stay separate, unknown coverage/cost prevents a numeric savings verdict, and zero accepted tasks fails. — evidence: docs/vault/ops/paired-token-economy-experiment-with-blind-acceptance.md:184; docs/vault/ops/paired-token-economy-experiment-with-blind-acceptance.md:40
- [x] Numeric owner consent, exact execution configuration/identity and verified accounting are launch gates. Stop/no-retry/no-auto-raise rules preserve review, source isolation and cleanup; local admission limits are stated honestly. — evidence: docs/vault/ops/paired-token-economy-experiment-with-blind-acceptance.md:21; docs/vault/ops/paired-token-economy-experiment-with-blind-acceptance.md:114
- [x] Static commit/path/corpus checks and a fresh-context design/acceptance review are recorded; no native experiment calls, budget changes, new service or production-code changes occur in this preparation story. — evidence: /tmp/waypost-smoke-protocol-20261017/static-inputs.json; /tmp/waypost-smoke-protocol-20261017/design-review.txt; independent smoke_protocol_reviewer acceptance


## Final Summary

Prepared the existing ops runbook with two fixed read-only tasks, common production snapshot, isolated policy overlays, AB/BA order, four fresh blind judges, all-attempt accounting and stop rules. No production code, comparator or ledger was added. The future 12-task cohort is explicitly unfrozen.

Validation: refs and six common production/test inputs checked by SHA256; four overlay bodies have unchanged frontmatter. A disposable shallow repository recipe was exercised and removed. Independent critic confirmed ship for protocol SHA256 `1367c5ece03fe81815b563fd44f6bb24c330d1a1e1b81132be9d9bbe1e49ec1d`; a separate fresh reviewer accepted all four criteria on 2026-10-17. Doctor has zero issues (existing WP-18 warnings; process-table warning depends on sandbox). `git diff --check` is clean. No unit/full suite was run for this documentation-only change.

No native experiment call or budget mutation was made. Preparation/review sessions are real unknown costs, not zero; no saving is claimed. Numeric owner consent, exact verified execution configuration/accounting and runtime isolation remain launch gates. The 250,000 Codex-native-token allowance is an unapproved proposal, not a cap already set. This closes preparation only, not experiment execution.

## Technical Notes

Static preparation checks on 2026-10-17: both full frozen refs resolve; six N1/A1 production/test input files are byte-identical, four policy overlay sources differ only below unchanged frontmatter, and the later answer-key runbook is absent from both frozen commits. Manifest: `/tmp/waypost-smoke-protocol-20261017/static-inputs.json` (local scratch). Four task calls plus four independent judge calls equals eight role calls, not eight native requests. A temporary shallow repository dry run confirmed one baseline commit, absent treatment history/answer key and exactly four overlay paths; it was removed. Runtime read isolation/native route remain unverified launch gates. No native experiment call or budget mutation occurred. Authoring/planner/critic/reviewer sessions themselves consume tokens; their preparation cost is unisolated/unknown and must not be reported as zero. The independent planner recommended this docs-only slice and explicitly deferred the 12-task cohort/comparator. Live configuration, exact receipt isolation and owner numeric consent remain launch gates, not checks already passed.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-17*
