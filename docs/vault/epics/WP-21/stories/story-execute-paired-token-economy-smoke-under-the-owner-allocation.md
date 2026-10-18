---
type: story
id: "story-execute-paired-token-economy-smoke-under-the-owner-allocation"
epic: "WP-21"
title: "Execute paired token economy smoke under the owner allocation"
status: in-progress
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-18
updated: 2026-10-18
external_refs: {}
tags: []
code_refs: ["docs/vault/adr/budgeted-read-only-role-evaluation-over-a-sealed-source-snapshot.md"]
specs: []
started_at: "2026-10-18T03:24:43.347Z"
closed_at: null
plan_updated_at: "2026-10-18T03:24:43.347Z"
---

# Execute paired token economy smoke under the owner allocation

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | in-progress |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

The owner approved the prepared 250,000 Codex-native-token pilot on 2026-10-18. Execute the frozen two-task protocol only after all gates pass; retain blocked preflight and unknown costs as outcomes, never bypass them. Current result: no experiment inference, launch gates failed on CLI version and missing budgeted source-navigation route. Execution remains pending; this story is not done.

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [x] Record owner consent, budget status and non-model version preflight.
- [ ] Establish a supported original-task route with verified source isolation and native accounting after the separate owner decision.
- [ ] Execute the fixed four task/four judge calls or record runtime stop outcomes; publish complete scoped cost and acceptance evidence.

## Implementation Plan

Follow the frozen runbook SHA256 `1367c5ece03fe81815b563fd44f6bb24c330d1a1e1b81132be9d9bbe1e49ec1d`. Read-only nativeVersionStatus is allowed before model calls. The independent launch planner verified that no supported existing budgeted route accepts the original tasks with sealed-source navigation: version refresh alone is insufficient. Record the fail-closed stop and propose the missing route for owner approval; do not change protected surface definitions, purposes, prompts or receipts to force execution. Continue only after explicit architecture/surface decision, implementation/review and live controls within the existing budget/call ceiling.

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [x] Numeric consent and machine budget are recorded; native version gate is checked without inference. — evidence: /tmp/waypost-token-smoke-20261018/budget-before.json; /tmp/waypost-token-smoke-20261018/preflight.json
- [ ] Runtime version/catalog, original task/role delivery, snapshot read boundary, identity, accounting and stop/drain are independently verified before tasks.
- [ ] All fixed tasks/judges and failed/unknown attempts are retained with receipts, blind acceptance and counter/source identities; no replacement or cap raise.
- [ ] Result distinguishes scoped comparison from unknown preparation cost and whole-week quota; no saving claim when required coverage or quality is missing.

## Final Summary

Not complete: launch preflight failed before experiment inference. No task/judge pair or savings result exists.

## Technical Notes

Budget `waypost-token-smoke-20261018`, schema `codex-thread-cumulative-total-v1`, cap 250000, spent/reserved 0 at preflight. Installed CLI 0.163.0-alpha.10.2 versus pinned 0.162.0-alpha.17.2; blocker native-surface-version-unverified. The Host has no arbitrary budgeted read-only role task, and no-exec suppresses source navigation. Proposed follow-up: [[budgeted-read-only-role-evaluation-over-a-sealed-source-snapshot]]. Native experiment calls 0 is an operator workflow observation, not provider-wide usage; these authoring/review sessions are real unknown preparation cost. Protocol and existing surface code unchanged. Independent critic first requested a whole-loop zero-anchor gate and immutable-buffer reads; both were corrected in the proposal. Final design verdict ship on 2026-10-18, reviewed design SHA256 b95182cfe0e57cec5e05d825687ed45d64ef5b72ceb88e9461bfa80daba4a134 (before recording review metadata). Runtime gates and owner acceptance remain outstanding.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-18*
