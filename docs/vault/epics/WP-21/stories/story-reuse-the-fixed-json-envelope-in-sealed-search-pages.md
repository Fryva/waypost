---
type: story
id: "story-reuse-the-fixed-json-envelope-in-sealed-search-pages"
epic: "WP-21"
title: "Reuse the fixed JSON envelope in sealed search pages"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-02
updated: 2026-11-02
external_refs: {}
tags: []
code_refs: ["scripts/evaluation-source.mjs", "tests/evaluation-source.test.mjs", "tests/evaluation-transport.test.mjs", "docs/vault/adr/budgeted-read-only-role-evaluation-over-a-sealed-source-snapshot.md"]
specs: []
started_at: "2026-11-02T02:41:18.316Z"
closed_at: "2026-11-02T02:53:42.803Z"
plan_updated_at: "2026-11-02T02:41:18.316Z"
---

# Reuse the fixed JSON envelope in sealed search pages

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Search still serializes invariant preview-envelope fields for every candidate. Compute that fixed JSON size once per nonempty page and add each freshly generated base64url cursor body length; preserve all existing byte-boundary behavior. CPU-only, no token-saving claim.

## Decomposition

- [x] Lazily compute fixed empty-array/empty-cursor envelope once per search page; keep per-candidate cursor generation and accepted-hit bytes. — evidence: tests/evaluation-source.test.mjs and source-bound replay/metrics/test/Doctor/reviewer receipts in `.waypost/experiments/wp21-sealed-search-envelope-20261101/`.
- [x] Pin nohit/EOF/onehit/manyhit envelope work and exact caps/cursor widths/identity/accounting. — evidence: tests/evaluation-source.test.mjs and source-bound replay/metrics/test/Doctor/reviewer receipts in `.waypost/experiments/wp21-sealed-search-envelope-20261101/`.
- [x] Source-bound replay/actual serialization metrics, source/transport suites/guards, Doctor and fresh review. — evidence: tests/evaluation-source.test.mjs and source-bound replay/metrics/test/Doctor/reviewer receipts in `.waypost/experiments/wp21-sealed-search-envelope-20261101/`.

## Implementation Plan

Only search() preview calculation changes. Local nullable envelopeBytes starts empty on every callback. For every actual candidate preserve bytes(hit) then cursorAt(position+1); cursor is still generated each attempt. Lazily serialize {...result,results:[],truncated:true,cursor:''} once, then compare envelopeBytes + accepted candidate hit-body bytes + nextCursor.length against unchanged cap. Base64url cursor is ASCII and JSON-unescaped, so its UTF8 JSON body bytes equal length; quote pair belongs to empty envelope. Fixed fields are kind/manifest/query; results/truncated/cursor are explicitly overridden. No candidate means no envelope serialization. Preserve accepted total update/push/position/fresh clones, final cursor/callback checks, cache4096/read/security/seal/validation/replay/traffic/owner/close/publicAPI/config/model/budget. Source-bound baseline7236c4d replay compares exact serialized responses/errors/full evidence/identities, including query Unicode/escaping, base64 position widths9/10+99/100, nonzero cursors/EOF/empty, bytecaps±1/continuation/last-preview nofit, warm/4097uncached indexes and traffic failure gates. Instrument actual JSON.stringify calls, serialized volume, cursor-generation-related calls and preview-envelope count separately for0/1/100hits. Every generated public cursor must be base64url ASCII with byte-body length equal to string length. No token/latency/heapclaim. Source+transport and module/routine/subprocess guards via heavy admission after rolesfinish; source/runtime/log/Doctor identities, owned cleanup and fresh reviewer.

## Acceptance Criteria

- [x] Fixed-envelope reuse preserves exact payloads/cursors/errors/evidence/identities/security/accounting and per-candidate cursor generation, with unchanged cache/read/publicAPI behavior. — evidence: tests/evaluation-source.test.mjs and source-bound replay/metrics/test/Doctor/reviewer receipts in `.waypost/experiments/wp21-sealed-search-envelope-20261101/`.
- [x] Source-bound boundary replay and actual0/1/100-hit operation metrics prove reduced envelope/serialization work with no empty-search regression; suites/guards pass, Doctor clean and reviewer accepts. — evidence: tests/evaluation-source.test.mjs and source-bound replay/metrics/test/Doctor/reviewer receipts in `.waypost/experiments/wp21-sealed-search-envelope-20261101/`.

## Final Summary

Search computes the fixed empty-array/empty-cursor preview envelope lazily once per nonempty callback. Every candidate still computes hit bytes then the same cursorAt(position+1); base64url is unescaped one-byte ASCII, so adding cursor.length retains exact preview bytes with its quote pair already in the base. No-candidate/EOF/recorded duplicates perform no extra envelope work. Fresh clones, position/result-body accumulator/final callback checks and all response/identity/security/validation/cache/read/traffic/close/publicAPI/model/budget behavior remain intact.

Source-bound Node24.22.1/macOS:72source-broker/transport+4module/routine/subprocess guards=76pass0fail/skip;416source identities stable. Two baseline files equal7236c4d; exact inverse restores production baseline.1809paired replay calls compare exact JSON results/errors/full evidence/outer+results-array+nested-hit identities and every cursor-factory position list. Covers0/1/100hits/EOF/duplicates, escaped Unicode queries/cross-query state, caps±1, cursor9/10+99/100 and nonzero positions, conservative last-preview nofit, continuation, warm/4097uncached indexes, budgets/foreign/closed/read-search interleave/deleted files. Public cursors satisfy ASCII/base64url and JSON-body bytes==length. Persistent tests count envelope/factory attempts including rejected first hit and verify query-local accounting.

Measured actual synchronous callback:100hits envelopes100→1, stringify1038→939, serialized75916→47190bytes(-37.84%); cursor factories100 unchanged. One hit:1envelope/1factory/48stringify unchanged, bytes1404→1282. Zero hits:0envelopes/0factories/38stringify/657bytes unchanged. Instrumentation delegates real JSON.stringify and one-argument Buffer.from canonical binding/position factory calls (two-argument decoder excluded), restores in finally, excludes request preparation/oracle/evidence. Responses byte-identical; no latency/heap/native-token/quota/net-workflow savings measured.0native inference calls BY RUNNER; operator/reviewer spend unmeasured.

Fresh independent implementation reviewer accepted original AC. Explicit checkednode+repo/bin Doctor receipt:957tracked/untracked/config inputs stable,exit0/empty stderr/0issues/warnings6info. Single admitted29463exit0; no wrapper/test failures. Owned canonical fixtures removed30258logical bytes; helpers cleaned separately. Evidence `.waypost/experiments/wp21-sealed-search-envelope-20261101/` retains source/review/baseline/runtime/replay/metrics/log/Doctor identities. No native pilot or historical budget changes.

## Technical Notes

The base64url factory remains the proof boundary; if cursor encoding changes, revisit body-byte accounting. Do not reuse a completed response or skip cursor validation/generation. No cross-callback retained envelope state.

## Dependencies

-

## Attachments

- Evidence: `.waypost/experiments/wp21-sealed-search-envelope-20261101/`.

---

*Last updated: 2026-11-02*
