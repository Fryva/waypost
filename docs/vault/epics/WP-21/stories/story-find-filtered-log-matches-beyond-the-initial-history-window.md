---
type: story
id: "story-find-filtered-log-matches-beyond-the-initial-history-window"
epic: "WP-21"
title: "Find filtered log matches beyond the initial history window"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-29
updated: 2026-10-29
external_refs: {}
tags: []
code_refs: ["scripts/commit.mjs", "tests/commits.test.mjs", "tests/harness.test.mjs", "tests/state-migrate.test.mjs", "docs/cli-reference.md", "docs/vault/adr/0006-commit-protocol.md", "docs/vault/adr/0008-token-budget.md"]
specs: []
started_at: "2026-10-29T03:35:45.343Z"
closed_at: "2026-10-29T03:53:03.780Z"
plan_updated_at: "2026-10-29T03:35:45.343Z"
---

# Find filtered log matches beyond the initial history window

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Filtered log stops after20*n raw commits and can falsely return no matches. On real base5ec7eec, --harness opencode -n1 --json returns[] despite a match7255443 at position128. Search the requested history consistently in bounded pages, avoiding corrective retries with larger limits.

## Decomposition

- [x] Add validated count and pinned bounded filtered-history traversal. — evidence: log() count validation, pinned readPage traversal, scope-proof.json.
- [x] Cover deep matches, termination, warning window, changing HEAD and page errors. — evidence: controlled Git pages and owned real merge-history regressions.
- [x] Reproduce the real false negative, verify full commit tests and independent review. — evidence: comparison.json, live-proof.json, validation.json, diagnostics.json, final reviewer.

## Implementation Plan

Validate -n as a nonnegative safe integer, rejecting missing/invalid values before Git. Keep zero output behavior. Preserve unfiltered single-query behavior and existing formatting/predicate/JSON schema. For filtered queries with positive count, resolve HEAD^{commit} once to a40/64hex OID and read200-record pages via git log --skip at that pinned revision, with explicit1MiB maxBuffer. Retain at most n matches plus the first n original records for the warning, and current page. Preserve substring filters and exact task membership literally. Stop after n matches or short/empty-page exhaustion; every page/spawn/timeout/overflow failure aborts before output. Preserve latest-n untagged warning scope, not scanned-history totals. Retain grouped human rendering unchanged. Tests: real owned merge history with matches beyond200, partial/no matches/task precision; controlled Git pages for stable pin/monotone skip/early stop/exhaustion/errors/invalid count and unfiltered parity. Source-bound before/after real probe and full commit suite; no native-token/net savings claim.

## Acceptance Criteria

- [x] Filtered queries find requested older matches beyond20*n, preserve native Git order/predicate/task precision, stop only with sufficient matches or exhaustion, and use one pinned revision with bounded page/input retention. — evidence: controlled pinned OID/skip/stop/exhaustion tests and actual merge history beyond200; comparison/live proof finds7255443 at position128.
- [x] Warning counts remain the original latest-n window; human grouping/JSON schema/unfiltered behavior remain compatible; zero/invalid counts and page errors terminate safely without false no-match or partial reports. — evidence: full commit30tests plus4guards passed; warning across pages, zero/invalid counts, error/no-partial-report controls; renderer/helper scope proof and clean diagnostics.
- [x] Real false negative and page controls reproduced, full commit and safety checks pass with source-bound evidence, independent reviewer accepts and own temporary runner is removed; no quantified native/quota/net savings inferred. — evidence: validation.json 576stable source inputs; final reviewer accepted all criteria; cleanup.json runner absent,4329logical bytes removed; no measured native savings claim.

## Final Summary

Filtered positive-count log now pins HEAD once and reads200-record/1MiB pages, retaining only requested matches, the latest-n audit window and current page. It stops at enough matches or actual exhaustion; page/status/spawn/timeout/buffer errors abort before any partial report. Validation rejects missing/invalid -n, preserves zero and ordinary unfiltered single-query behavior. Predicate/task exactness, Git ordering, grouped human/JSON rendering and commit-write code are preserved. --skip repeats traversal, a deliberate simple merge-safe tradeoff; no claim of bounded total search time.

Source-bound Node24.22.1: full commit suite30passed (52441.089458ms), guards4passed (8324.367125ms), zero failures/skips; wrapper/children exit0,576 stable source identities and matching binary/runner/log hashes. Controlled pages cover pin stability while HEAD changes, SHA256OID, limits, early-stop, exact-full/empty/short exhaustion, partial/no matches, latest-n warning across pages, later errors including status0+ENOBUFS and invalid counts. An owned merge history exercises real traversal beyond200records. Old/new frozen real history reproduces0->1match at position128, and a live local CLI confirms7255443 with byte-identical JSON. Unfiltered byte/Git-call parity and previous filtered matches as ordered prefixes hold on21cases. Own runner removed. Independent reviewer accepted all criteria with no findings. Full CI for this revision follows publication. No native-token/quota/net savings measured.

## Technical Notes

Read-only local correctness fix; no new flag/API/ADR/schema/dependency/model/native run/budget. Existing Git helper20s timeout remains; filtered page maxBuffer explicit1MiB and overflow fails, never counts a truncated page as exhaustion. --skip repeats traversal on later pages, a deliberate simple tradeoff rather than an unsafe parent cursor across merges. Commit/claim/lease/write code unchanged.

## Dependencies

- Accepted ADR-0006/0008 and log grouping contract.

## Attachments

- Local retained evidence: `.waypost/experiments/wp21-log-pages-20261029/`; original probe `.waypost/experiments/wp21-log-filter-probe-20261029/`.

---

*Last updated: 2026-10-29*
