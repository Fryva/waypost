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
