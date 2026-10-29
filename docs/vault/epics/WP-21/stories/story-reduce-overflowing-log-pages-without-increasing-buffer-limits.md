---
type: story
id: "story-reduce-overflowing-log-pages-without-increasing-buffer-limits"
epic: "WP-21"
title: "Reduce overflowing log pages without increasing buffer limits"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-29
updated: 2026-10-29
external_refs: {}
tags: []
code_refs: ["scripts/commit.mjs", "tests/commits.test.mjs", "tests/harness.test.mjs", "tests/state-migrate.test.mjs", "docs/cli-reference.md", "docs/vault/adr/0006-commit-protocol.md", "docs/vault/adr/0008-token-budget.md"]
specs: []
started_at: "2026-10-29T04:07:57.783Z"
closed_at: "2026-10-29T04:19:27.707Z"
plan_updated_at: "2026-10-29T04:07:57.783Z"
---

# Reduce overflowing log pages without increasing buffer limits

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

A fixed 200-record filtered-log page can overflow the 1 MiB capture even when each individual record and the requested recent result fit. Recover from this specific read-only buffer failure by shrinking the same page, preserving pinned history and the buffer limit.

## Decomposition

- [x] Add filtered-only ENOBUFS recovery with actual successful page size. — evidence: scripts/commit.mjs log(); reviewer.json.
- [x] Cover retry/continuation/window/errors and a controlled real large-subject reproduction. — evidence: tests/commits.test.mjs; comparison.json; commits.tap.
- [x] Verify full commit tests, source-bound evidence, independent review and owned cleanup. — evidence: validation.json; doctor-full.json; reviewer.json; cleanup.json.

## Implementation Plan

Private readPage returns parsed rows plus the actual requested size. Only filtered callers enable overflow recovery: r.error.code===ENOBUFS before parsing, size>1 -> halve floor/min1 and retry identical pinned OID/skip/options. Never parse or accumulate failed stdout, including status0+error. All other errors and size1 overflow remain fatal. Persist the smaller successful size for later pages; exhaustion compares successful row count with that used size, and skip advances by actual successful records. Keep 1 MiB maxBuffer and 20s timeout unchanged, unfiltered/zero/default handling unchanged, only successful records update matches/audit prefix. Tests include 200->100->50 then later match, no premature exhaustion, first-n warning across reduced pages, overflow at later offset, size1 success and fatal overflow, nonoverflow errors not retried and truncated matching sentinel discarded. Real owned Git repro uses two old ~600 KiB subjects followed by 20 small recent commits (HEAD is requested match); message input via stdin. Source-bound baseline/current runner, full commit/guards and independent review; no buffer increase or native benchmark.

## Acceptance Criteria

- [x] Only filtered ENOBUFS triggers bounded size reduction at the same pinned revision/offset; retries discard all partial data, keep the capture limit, and advance/stop using the successful requested size. — evidence: scripts/commit.mjs log(); commits.tap; reviewer.json.
- [x] Match order, latest-n audit prefix, grouping/JSON, unfiltered/zero paths and nonoverflow/final overflow failures stay correct; controls and real oversized-page reproduction pass with source-bound commit/safety/Doctor checks. — evidence: validation.json (31+4 pass); doctor-full.json; comparison.json.
- [x] Baseline failure/current success on identical controlled Git history is recorded, independent reviewer accepts and owned temporary data is removed; no quantified native/quota/memory/net savings claimed. — evidence: comparison.json; reviewer.json (no findings); cleanup.json (2,505,973 logical bytes removed).

## Final Summary

Filtered reads now halve only ENOBUFS pages at the same pinned revision/offset, persist the successful size and discard failed output before parsing. Buffer cap remains 1 MiB; single-record overflow and all other errors remain fatal. Source-bound Node 24.22.1: full commit protocol 31/31 and focused safety/module/routine/subprocess guards 4/4 passed, zero failures/skips; 576 source hashes and runtime binary stayed stable. A real 22-record Git fixture with two old ~600 KiB subjects reproduces baseline ENOBUFS and current exact requested HEAD result after sizes 200/100/50/25/12; five unchanged-path cases retain bytes/errors/calls. Evidence: comparison.json, validation.json and full TAP/stderr logs in the attachment directory. Owned runner and Git fixture removed (see cleanup.json). Independent reviewer accepted all criteria without findings; source-bound Doctor issue/warn/warning counts are all zero. Smaller pages may increase Git calls/traversal; no native-token, quota, total-time or net-memory saving is measured.

## Technical Notes

Read-only Git retries only, unrelated to native model invocation retry policy. At most 7 size reductions from 200 to 1 per query if smaller size persists. Smaller pages may increase Git traversal/calls; no total-time bound or unlimited single-record support. No new flag/API/ADR/dependency/model/native run/budget; commit writes/claims/leases and other capture defaults unchanged.

## Dependencies

- Pinned filtered-log traversal and accepted ADR-0006/0008.

## Attachments

- Local retained evidence: `.waypost/experiments/wp21-log-page-overflow-20261029/`.

---

*Last updated: 2026-10-29*
