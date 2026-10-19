---
type: story
id: "story-pin-team-bound-story-refusal-before-cli-modularization"
epic: "WP-21"
title: "Pin team-bound story refusal before CLI modularization"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-19
updated: 2026-10-19
external_refs: {}
tags: []
code_refs: ["tests/team-cli.test.mjs"]
specs: []
started_at: "2026-10-19T15:56:04.490Z"
closed_at: "2026-10-19T16:26:39.096Z"
plan_updated_at: "2026-10-19T15:56:04.490Z"
---

# Pin team-bound story refusal before CLI modularization

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Before any future CLI modularization, pin the existing legacy story guard at the real CLI boundary. A canonical team-bound story must reject ordinary plan/close writes without mutating artifacts, authority, claims or views. Existing direct gate tests do not prove dispatcher ordering. This test-only prerequisite does not approve or implement the proposed CLI split.

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [x] Reuse the real local team CLI fixture with canonical story paths and initial statuses.
- [x] Assert preview/control behavior and exact refusal plus unchanged vault bytes.
- [x] Run affected tests, independent review and record the scope without a savings claim.

## Implementation Plan

Fresh planner selected tests/team-cli.test.mjs real local authority fixture. Add optional canonical-story setup retaining the default epic fixture and a raw CLI runner. For planned/in-progress stories, first prove preview changed:true, then assert exact plan/close binding refusal and recursive vault file-byte equality (including authority/claims/views in the non-Git fixture). Unbound sibling plan/close must succeed. No-op changed:false is intentionally not covered as refusal: dispatcher exits before the gate. Use no-beat fixture isolation. Correct the parent dependency line to the actual proposed ADR status. Run the full affected team CLI file through the heavy gate before independent review.

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [x] Real CLI story plan and close previews can inspect an owned canonical story; --write refuses with team-bound-artifact-use-team-workflow and exact operation, before changing vault files including story/status/timestamps, team authority, session claims and derived views. — evidence: tests/team-cli.test.mjs real CLI story regression; tests-resumed.log11/11.
- [x] An otherwise equivalent unbound story in the same vault can plan and close through the real CLI, proving the refusal is the binding gate rather than fixture invalidity. Existing default fixture behavior is retained. Parent epic dependency text matches the actual proposed split ADR status. — evidence: tests/team-cli.test.mjs unbound control; parent dependency line matches proposed ADR.
- [x] Affected team CLI tests and independent review pass against identified sources; no production behavior, team protocol, native pilot, budget or proposed architecture status changes. — evidence: verification.json154 matching inputs/11pass; final independent story_gate_reviewer acceptance.

## Final Summary

Pinned team-bound plan/close refusal at the real CLI boundary before any story/authority/claim/view write. Canonical fixture previews prove changed:true; recursive vault snapshots prove no side effects; unbound sibling control confirms valid lifecycle behavior. Existing default fixture remains covered. Fixed setup traps by seeding claim before binding and putting team --id behind --. Full affected file11/11 passes via heavy gate with154 unchanged code identities; final independent reviewer accepted all3AC without findings. Earlier capacity refusals are historical. Production CLI unchanged; full npm/other OS/token savings unverified. The CLI split ADR remains proposed; parent dependency text corrected accordingly.

## Technical Notes

Runtime verification completed: `waypost run --heavy --wait 30s -- node --test tests/team-cli.test.mjs` exit0,11 passed/0 failed/0 skipped. All154 checked code hashes matched source-final.json before/after. Syntax and diff whitespace checks passed. Private evidence `.waypost/experiments/wp21-story-gate-20261019/verification.json` binds source-final.json and tests-resumed.log to base4fad36e. Full npm suite/other OS not exercised; this verifies a safety prerequisite, not token savings or the future split.

Historical attempts waited30s/3m/3m and all exited75 before tests started; retained tests.log/tests-retry.log/tests-authorized.log plus verification-capacity-refusal.json record capacity refusal. No active test remains. Earlier source-before.json/review-inputs.json are historical and predate fixture corrections; use source-final.json/review-inputs-verified.json for final review.

Fresh static reviewer story_gate_reviewer found two fixture setup issues: a legacy claim after team binding refuses, and global --id can change session identity. Fixed by seeding the same-session claim before team create and separating team-only flags with --. Reviewer confirmed fixes statically; the successful full affected run now covers them. Unbound sibling control includes lifecycle timestamps and claim/release output. No-op changed:false and loader-failure scenarios are outside scope. Final independent reviewer story_gate_reviewer accepted all3AC and decomposition with no findings, verified154/154 code identities,3/3 review identities and bound log11pass/0fail/0skip. Verdict story closed / commit. Later lifecycle metadata and regenerated views only record this acceptance.

Production code, native pilots, budgets and proposed architecture status unchanged. Parent epic corrects a false accepted dependency label to the actual proposed ADR status.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-19*
