---
type: story
id: "story-compact-the-empty-readiness-explanation"
epic: "WP-21"
title: "Compact the empty readiness explanation"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-04
updated: 2026-11-04
external_refs: {}
tags: []
code_refs: ["scripts/ready.mjs", "tests/harness.test.mjs"]
specs: []
started_at: "2026-11-04T17:01:09.933Z"
closed_at: "2026-11-04T17:28:18.100Z"
plan_updated_at: "2026-11-04T17:01:09.933Z"
---

# Compact the empty readiness explanation

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Shorten only the no-ready explanation emitted by ready/default and --all. Retain no-planned/blocked/claimed/spec-or-ADR waiting reasons and the exact actionable waypost ready --all command. No logic, API, JSON, status or ready-command changes.

## Decomposition

- [x] Replace the empty-readiness literal and pin its message/status/JSON behavior.
- [x] Compare actual baseline/current CLI stdout for empty/blocked/claimed/design/mixed/unbound cases and measure full output text in two encodings.
- [x] Run readiness/link and CLI/namespace/state guards through heavy admission, Doctor and independent review.

## Implementation Plan

One literal at scripts/ready.mjs main after --json early return: nothing ready: no planned stories, or all blocked, claimed, or awaiting spec/ADR — details: `waypost ready --all`. Preserve newline and all subsequent rows, statuses, stderr, ranking/claims/design calculations and plain path claim commands. Existing harness empty test pins wording and CLI success; extend controls without duplicating readiness logic. Source-bound actual CLI A/B covers no stories, settled-only, all blocked, all claimed, draft spec, proposed ADR, mixed ready+other states, unbound. --json/--all --json and nonempty control must be byte-identical; --all changes only first-line literal. Use canonical own tool copies, one current-bound fixture per case, explicit live claim through CLI and fixed owner/viewer identities. Pinned tokenizer measures full default/--all stdout in o200k_base/cl100k_base; no model mapping/native-usage/quota/workflow saving claim. Node24 focused readiness/link and selected harness tests include full CLI namespace family/module/routine/state guards. Retain baseline/source/runtime/log/tokenizer identities, temporary cleanup and independent reviewer. Accepted ADR-0008 unchanged; no new ADR/API/model/native calls.

## Acceptance Criteria

- [x] Both text modes preserve all reasons and diagnostic command; only the intended empty header changes, JSON/nonempty commands/status/errors unchanged. — evidence: tests/harness.test.mjs; comparison.json.
- [x] Actual full CLI text is smaller in both tested encodings, appropriate tests/guards pass, Doctor clean and fresh reviewer accepts. — evidence: tokens.json; validation.json; doctor-receipt.json; review.json.

## Final Summary

Shortened only the no-ready text literal, retaining no-planned/blocked/claimed/spec-or-ADR waiting categories and the exact `waypost ready --all` command/newline. Ready rankings, lifecycle path commands, claims/design gates, JSON, error status/stderr and detailed rows are unchanged. Exact production inverse restores d517b75.

Confirmed local Node24.22.1/macOS:9readiness/link+19readiness/CLI namespace/module/routine/state guards=28pass0fail/skip.999tracked input hashes excluding3derived views stable before/after.32actual CLI A/B pairs over8fixtures (empty,settled,blocked,claimed with actual live controller identity,draft spec,proposed ADR,mixed,unbound) × default/--all/--json/--all--json; only intended header changes and detailed suffixes remain exact. Explicit checkednode+repo/bin Doctor:1005input hashes stable,exit0,0issues/warnings6info. Fresh independent reviewer accepts original AC.

Pinned tiktoken0.14.0 on full actual stdout: empty default/--all36→28o200k_base(-22.22%),37→28cl100k_base(-24.32%). Every measured no-ready branch saves8/9text tokens, including detailed blocked/claimed/design cases; mixed nonempty and unbound controls unchanged. Zero stdout has0tokens and percent null. UTF-8 roundtrip/repeated counts, package/table/input hashes and network-denied counting retained. These are text-encoding counts only; native model usage/framing/cache/quota/net-workflow savings not measured.0native model calls BY RUNNER; operator/reviewer usage unmeasured; no new pilot/model/allocation/API.

Evidence `.waypost/experiments/wp21-empty-ready-20261104/` preserves baselines/source/runtime/review identities, actual stdout/JSON/statuses, commands/full logs, counter/proofs/Doctor and owned cleanup. Attempt1 stopped before tests because fixture supplied numeric WAYPOST_PROC instead of actual JSON process identity. Producer96267 ran all CLI comparisons/tests successfully, then exited1 solely on offline zero-length percentage calculation. Counter fixed to percent null and rerun alone41575exit0 against unchanged frozen stdout and reverified999inputs; tests were reused, not rerun. Both failed tool attempts retained, no production-test failure hidden. Previous full CI41854908606 atd517b75 is confirmed completed/success on Node20/22/24; this new code's full remote CI follows publication. No unobserved cross-OS/native benchmark claim.

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-11-04*
