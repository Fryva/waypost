---
type: story
id: "story-reuse-bounded-search-hits-across-sealed-source-pages"
epic: "WP-21"
title: "Reuse bounded search hits across sealed-source pages"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-02
updated: 2026-11-02
external_refs: {}
tags: []
code_refs: ["scripts/evaluation-source.mjs", "tests/evaluation-source.test.mjs", "tests/evaluation-transport.test.mjs", "docs/vault/adr/budgeted-read-only-role-evaluation-over-a-sealed-source-snapshot.md"]
specs: []
started_at: "2026-11-02T01:56:34.362Z"
closed_at: "2026-11-02T02:07:15.700Z"
plan_updated_at: "2026-11-02T01:56:34.362Z"
---

# Reuse bounded search hits across sealed-source pages

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Each new search callback scans all immutable sealed lines, including subsequent pages of an unchanged literal query. Reuse one bounded private hit index while preserving the complete source isolation and callback protocol. This is CPU/allocation work, not a token-saving claim.

## Decomposition

- [x] Add one per-broker lazy last-query slot capped at4096hits; clear before miss scans and clone selected result records. — evidence: tests/evaluation-source.test.mjs and source-bound replay/metrics/test/Doctor/reviewer receipts in `.waypost/experiments/wp21-sealed-search-cache-20261101/`.
- [x] Pin paging/query changes/empty hits/isolation/cap/result identity and validation/replay/accounting behavior. — evidence: tests/evaluation-source.test.mjs and source-bound replay/metrics/test/Doctor/reviewer receipts in `.waypost/experiments/wp21-sealed-search-cache-20261101/`.
- [x] Source-bound baseline comparison and measured line predicate calls, relevant suites/guards, Doctor and independent review. — evidence: tests/evaluation-source.test.mjs and source-bound replay/metrics/test/Doctor/reviewer receipts in `.waypost/experiments/wp21-sealed-search-cache-20261101/`.

## Implementation Plan

Only scripts/evaluation-source.mjs search-derived data changes. Private finite cap4096, one per-seal lastSearch slot (including empty hits), exact raw string query key. Existing query/limit/cursor schema/binding validation remains before lookup. On miss release prior slot before scanning sealed lines; validate cursor position against resulting hits before publishing a cacheable index; larger indexes remain transient and are not cached. Every returned selected hit is a new {path,line} record, preserving distinct callback nested identities; duplicate callId still returns recorded exact result. Do not alter files/sealing/hash checks, public API/config/exports, read behavior, page byte caps, literal ordering/cursors/errors, immutable output, callback/input/output accounting, owner/replay/close/stop/transport rules. No I/O/global cache, model call, protocol revision or budget change. Tests cover continuation and limit changes, repeated/new callId, query switch/eviction/back, nohits,4096/4097 threshold, independent brokers, mutation/deletion of sealed files, immutable identity, malformed/foreign/out-of-range cursors/queries/limits and byte/callback caps. Isolated instrumentation counts actual line.includes invocations; compare complete returned payloads/errors/evidence/identity relations to baseline608a22f. Focused source+transport/host/budget regressions and module/routine/subprocess guards through heavy admission after roles finish. Retain source/runtime/baseline/log/Doctor identities, remove owned scratch, request fresh implementation reviewer. No latency/heap/native-token/quota/net-workflow claims.

## Acceptance Criteria

- [x] Bounded per-broker last-query reuse removes repeated line scans for cached pages while preserving all bytes/errors/evidence/counters/result immutability and per-call versus duplicate identity; source security and transport remain unchanged. — evidence: tests/evaluation-source.test.mjs and source-bound replay/metrics/test/Doctor/reviewer receipts in `.waypost/experiments/wp21-sealed-search-cache-20261101/`.
- [x] Baseline/current replay covers cache hits/misses/threshold/isolation and failure gates; actual predicate counts decrease in paged fixture, suites/guards pass, Doctor clean and independent reviewer accepts. — evidence: tests/evaluation-source.test.mjs and source-bound replay/metrics/test/Doctor/reviewer receipts in `.waypost/experiments/wp21-sealed-search-cache-20261101/`.

## Final Summary

The sealed-source broker reuses only the last exact query index within one broker, with a private4096-hit retention ceiling including empty hits. A miss clears the prior slot before scanning; a rejected position never publishes a new slot. Large searches retain prior uncached behavior. Selected output records are copied to preserve fresh identities for distinct callbacks; recorded duplicates still return the exact earlier result. Existing validation/security/output/cursor/error/evidence/accounting/read/close/transport contracts remain intact, with no public API/config/exports/dependency or budget/model change.

Source-bound Node24.22.1/macOS run:66source-broker/transport+4module/routine/subprocess guards=70pass0fail/skip,416source identities stable. Two baseline files equal608a22f; exact inverse reconstructs production baseline.67paired replay calls match serialized result bytes, errors, full evidence and cross-call identity relations; paging/query changes/empty hits/independent brokers/cap4096vs4097/rejected cursor/input-output-callback limits/replay/foreign traffic/closed/read-after-file-replacement-deletion covered. Persistent tests instrument actual String.includes without public hooks.

Measured logical predicate calls for20pages over1000sealed lines/500hits:20000→1000(-95%).4096hit warm query skips its next scan;4097hit queries rescan, and evict the earlier slot. This measures line predicate operations, not latency, heap, disk reads, model context, native tokens, subscription quota or net-workflow savings. Responses are byte-identical.0native inference calls by runner; operator/reviewer token usage unmeasured.

Fresh independent implementation reviewer accepted original AC. Explicit checkednode+repo/bin Doctor receipt:954tracked/untracked/config inputs stable,exit0/empty stderr/0issues/warnings6info. First wrapper13349 failed source-root before replay/tests because its temporary root passed through /var symlink; broker guard correctly refused it. Only wrapper fixture changed to canonical realpath; source/tests unchanged between attempts. attempt-1 retains initial runner/source/cleanup and an honest summary; original raw stderr exists only in tool transcript. Final admitted19566exit0. Both owned fixture roots removed, helpers cleaned separately. Evidence `.waypost/experiments/wp21-sealed-search-cache-20261101/` retains source/review/baseline/runtime/replay/metrics/log/Doctor identities. No native pilot or historical budget change.

## Technical Notes

Fixed4096 avoids overflow/user-inflated products of public caps. Source buffers stay sealed once and unchanged. One slot is not an unbounded query map. Cache is derived metadata only; retain repeated callback traffic charges.

## Dependencies

-

## Attachments

- Evidence: `.waypost/experiments/wp21-sealed-search-cache-20261101/`.

---

*Last updated: 2026-11-02*
