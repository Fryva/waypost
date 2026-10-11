---
type: story
id: "story-assignments-supervision-and-stronger-model-handover"
epic: "WP-20"
title: "Assignments supervision and stronger-model handover"
status: planned
priority: p1
assignee: "Ivan Morozov"
created: 2026-09-30
updated: 2026-09-30
external_refs: {}
tags: []
code_refs: ["scripts/presence.mjs", "scripts/sessions.mjs", "scripts/ready.mjs", "bin/waypost", "tests/presence.test.mjs", "scripts/team-workflow.mjs", "tests/team-workflow.test.mjs"]
specs: ["cross-harness-team-coordination-protocol"]
started_at: null
closed_at: null
plan_updated_at: null
blocked_by: ["WP-20/story-participant-identity-and-owner-approved-model-policy", "WP-20/story-local-authority-log-and-crash-safe-mutations", "WP-20/story-addressed-messages-and-verified-harness-delivery"]
---

# Assignments supervision and stronger-model handover

| Field | Value |
|---|---|
| Epic | [One task coordinated across harnesses and AI models](../epic.md) (WP-20) |
| Status | planned |
| Priority | p1 |

## Description

Let the strongest eligible enrolled model coordinate scoped work, inspect actual diffs, and safely hand control to a stronger participant without losing or duplicating execution.

Architecture/backlog only. No work claim or implementation is asserted.

## Decomposition

- [ ] Implement work state machine, dependency/scope checks and leader acknowledgement.
- [ ] Implement automatic stronger-model handover, monotonic epochs, quiesce/adopt/fence and worker acknowledgement.
- [ ] Preserve uncertain execution, worktree quarantine and explicit reconciliation; use exact-file leases.
- [ ] Record coordinator diff-based supervision, questions and corrections addressed to workers.

## Implementation Plan

A fresh planner fills this at the work-start gate after owner ADR approval and
spec activation. Route through spec contracts 3, 5.

## Acceptance Criteria

- [ ] Only acknowledged current leader schedules; concurrent assignment/scope conflicts and dependency cycles refuse.
- [ ] Stronger eligible join initiates handover automatically; stale leader cannot issue valid new work; adopted work binds new epoch.
- [ ] Leader/worker timeout never implies editing stopped; ambiguous shared-tree scope cannot be reassigned.
- [ ] Worker cannot self-approve/integrate; submitted evidence includes intended untracked files and actual immutable diff.
- [ ] Read-only reviews may overlap; edits require authorized concrete paths and leases; permission/sandbox rules remain binding.
- [ ] Heavy work uses machine-capacity gate with no new agents alongside heavy jobs; cancel preserves partial work and provenance.

## Final Summary

Pending implementation, evidence and independent review.

## Technical Notes

See [[cross-harness-team-coordination-protocol]]. Its acceptance is additive.
No live messaging, model identity or cross-platform proof from document creation.

## Dependencies

- WP-20/story-participant-identity-and-owner-approved-model-policy
- WP-20/story-local-authority-log-and-crash-safe-mutations
- WP-20/story-addressed-messages-and-verified-harness-delivery

## Attachments

- [[model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review]]

### Live dependent and parallel works (2026-10-11, Claude Code)

Owner-assigned team `chain`, zero cohorts, ≈54.1K subscription tokens: coordinator
Claude Code (2.1.296), Codex (`gpt-6.1-sol` low, `codex-no-exec-r1`) as alternate and
work reviewer, executor OpenCode (`qwen3.8-max` low). Identities 7,265 / 2,196 /
3,718; leader ACK 3,073. Two works on disjoint paths ran at once: `fix-sum`
(`src/sum.js`) and `fix-mul` (`src/mul.js`); a third on `SRC/sum.js` was refused
`native-work-path-overlap`. OpenCode executed both (3,945, 3,949), Codex approved
both (8,646, 8,629), the leader Host published them one after the other. Then the
dependent `add-sub` (`depends_on: ["fix-sum"]`): with the owner's base it was refused
`native-work-dependency-base-required`, with `["fix-sum","fix-mul"]` refused
`native-work-dependency-chain-required`; with `fix-sum`'s published commit as base it
was accepted, executed (4,044; the candidate diff against that commit adds only
`sub`), approved by Codex (8,633) and published. Its commit's parent is `fix-sum`'s
commit and its `src/sum.js` holds both the fixed `sum` and the new `sub`; the owner's
branch was untouched.

### Leader decomposition for owner-assigned teams (2026-10-11, Claude Code)

Slice 7 of the spec (contract 28 amended): the owner opens a plan request
(`waypost team plan TEAM --request`), the confirmed leader proposes a set of works from the
listed files of the pinned base (one fixed control call, no tools, no file tree), and the owner
installs the exact proposal by digest (`--install --yes --reason`), all works or none. Acceptance:
unit and Host tests only (`tests/native-work-plan.test.mjs`, `tests/native-work-plan-host.test.mjs`:
request, strict answer, whole-plan checks, install all or nothing, void on leader change, a published
work of an installed plan). No live run.

### Live leader decomposition, owner-installed (2026-10-11, Claude Code)

Owner-assigned team `plan`, zero cohorts, ≈44.5K tokens of a further 60K approval:
coordinator Claude Code (2.1.296), Codex alternate and work reviewer, executor OpenCode.
Identities 7,265 / 2,199 / 3,716; leader ACK 3,083. The owner requested plan `math`
(goal: sum must add and mul must multiply; scope `src/sum.js`, `src/mul.js`; at most two
works). The leader answered in one fresh no-tools call (2,844) with the scope files'
content bound by digest: two independent works, one per file, each with concrete
criteria (`sum(2,3)` returns 5, `mul(-2,4)` returns -8, no other file modified) that show
it read the current, wrong implementations. All plan checks passed (`proposed`, no codes).
The owner approved the exact stored proposal in chat; `team plan --install --digest … --yes
--reason` installed `math-1` and `math-2` together. OpenCode executed both (3,999 each),
Codex approved both (8,681, 8,700), the leader Host published both commits; the owner's
branch was untouched.

### Dependencies inside a plan (2026-10-11, Claude Code)

Slice 8 of the spec (contract 28 amended): the leader's plan may give a work `depends_on`
(a chain of 1 to 3 other works of the plan). The owner still approves the plan whole; the
authority then installs a dependent work itself when its dependencies are integrated, with the
base at the commit of the tip of the chain, through the same manifest checks (no owner-only
event is loosened: the manifest body is shared and the actor check stays in the owner's event).
A passing obstacle is kept in the plan and retried on the next event; a final one or a
cancelled dependency abandons the work. Acceptance: unit tests (reader, graph checks, install,
automatic install with the right base, retry and final refusals, cancelled dependency) and a Host
test with real Git (A then B on the same file: B installed from the commit of A on publication,
its prompt carries A's result, its parent is A's commit). No live run.

### Live leader plan with a dependent work (2026-10-11, Claude Code)

Owner-assigned team `deps`, zero cohorts, ≈30.4K tokens: coordinator Claude Code 1
(2.1.296), reviewer Claude Code 2 (same configuration, separate participant), executor
OpenCode. Identities 2,194 / 2,194 / 3,716; leader ACK 3,041. Plan `chain` (scope
`src/sum.js`, at most two works): the leader (3,014) proposed `chain-1` (fix `sum`) and
`chain-2` (add `sub`, `depends_on: [0]`, same file, allowed because it depends on the
first). The owner approved in chat; `team plan --install` installed `chain-1` and
recorded `chain-2` as pending. `chain-1`: OpenCode 4,021, Claude 2 approved 4,075,
published `eaff812`. On that integration the authority installed `chain-2` itself
(base `eaff812`, `depends_on: ["chain-1"]`, plan provenance `auto: true`). `chain-2`:
OpenCode 4,057 (candidate diff against `eaff812` adds only `sub`), Claude 2 approved
4,075, published `1fcef12` with parent `eaff812`; `src/sum.js` holds the fixed `sum` and
the new `sub`. The owner's branch was untouched.

### Critic of the plan, chosen by the owner (2026-10-11, Claude Code)

`critic: true` in the plan request (`team plan --request ... --critic`) names an independent critic of the plan: the top of the
owner's reviewer list that is neither the leader nor of its native configuration (refused at the request when there is none or the
plan ceiling allows fewer than 2 calls). The new control kind `protocol-work-plan-review` carries the owner's goal, the proposal and
the files the leader saw; the critic judges coverage of the whole goal, fit of each work to goal and files, and the split, not code.
Verdict `approve | changes-requested | reject` with up to 16 findings; the plan becomes `review-approved` or `review-rejected`;
install needs the approval of the current proposal (`native-work-plan-critic-approval-required`), a negative verdict is final for
the proposal (`native-work-plan-critic-rejected`). Plans without the flag are unchanged byte for byte. Acceptance: unit tests (flag
and digest, critic choice and refusals, install gate, request, strict reader) and Host tests with real Git (critic approves, work
runs; critic rejects, install refused and a new plan goes through; critic prompt carries the proposal and the files; context apart
from the leader's; shared plan ceiling). No live run.

### Live plan critic (2026-10-11, Claude Code)

Owner-assigned team `crit`, zero cohorts, ≈40.3K tokens of a further 40K approval (plus
the ≈15K left before): coordinator Claude Code (2.1.296), reviewer Codex (`gpt-6.1-sol`
low, `codex-no-exec-r1`) for plans and works, executor OpenCode. Identities 7,265 /
2,193 / 3,712; leader ACK 3,070. The owner requested plan `fix` with `--critic` (one
work at most, scope `src/sum.js`). The leader proposed one work (2,805). An install
before the critic's verdict was refused `native-work-plan-critic-approval-required`; the
leader's Host asked to act as plan critic was refused
`host-native-work-plan-critic-endpoint-required`. Codex, the top listed reviewer of
another configuration than the leader, reviewed the proposal with the scope file
(8,619): `approve`, no findings, plan `review-approved`. The owner approved in chat and
installed it; OpenCode executed `fix-1` (3,980, `a-b` → `a+b`), Codex approved the work
(8,702), the leader Host published `2e76db5`; the owner's branch was untouched.
