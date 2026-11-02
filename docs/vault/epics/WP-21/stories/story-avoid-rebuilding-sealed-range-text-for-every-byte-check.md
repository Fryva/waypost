---
type: story
id: "story-avoid-rebuilding-sealed-range-text-for-every-byte-check"
epic: "WP-21"
title: "Avoid rebuilding sealed range text for every byte check"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-02
updated: 2026-11-02
external_refs: {}
tags: []
code_refs: ["scripts/evaluation-source.mjs", "tests/evaluation-source.test.mjs", "tests/evaluation-transport.test.mjs", "docs/vault/adr/budgeted-read-only-role-evaluation-over-a-sealed-source-snapshot.md"]
specs: []
started_at: "2026-11-02T02:10:43.574Z"
closed_at: "2026-11-02T02:21:18.608Z"
plan_updated_at: "2026-11-02T02:10:43.574Z"
---

# Avoid rebuilding sealed range text for every byte check

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Range reads repeatedly join all accepted lines and serialize growing text on every output-byte check. Count the exact escaped JSON text-body bytes incrementally and join only once, while preserving the complete existing source callback contract. CPU work only; no token-saving claim.

## Decomposition

- [x] Replace growing candidate text with exact additive escaped-body bytes and unchanged per-line envelope. — evidence: tests/evaluation-source.test.mjs; source-bound replay/metrics/test/Doctor/reviewer receipts in `.waypost/experiments/wp21-sealed-range-bytes-20261101/`.
- [x] Pin byte boundaries/empty lines/Unicode/escapes/continuation and unchanged final callback limit enforcement. — evidence: tests/evaluation-source.test.mjs; source-bound replay/metrics/test/Doctor/reviewer receipts in `.waypost/experiments/wp21-sealed-range-bytes-20261101/`.
- [x] Baseline replay and actual join/serialization metrics, source/transport suites/guards, Doctor and independent review. — evidence: tests/evaluation-source.test.mjs; source-bound replay/metrics/test/Doctor/reviewer receipts in `.waypost/experiments/wp21-sealed-range-bytes-20261101/`.

## Implementation Plan

Only read() candidate construction changes. Keep selected lines and an accepted escaped JSON-body byte total. Candidate text bytes = prior total + (selected.length ?2:0) + bytes(next line)-2; JSON quotes excluded and joinLF serialized as two bytes. Compare unchanged candidate envelope with text:''/end_line i+1/truncated:true/next_line i+2 plus candidate text bytes; recompute envelope each iteration for digit-width changes. Update accepted total only after successful bound check, then join once for final result.text. Preserve current conservative preview fields literally; callback final bytes/result/outputBytes/stop remains unchanged because complete result can be LARGER than the preview (false vs true and null vs short next_line). Preserve all range validations, start/end/empty/EOF/truncation/errors/cursors, immutable response and per-call/replay identity, budgets/accounting/owner/closed/search-cache/seal/hash/transport behavior. No extra state retained after read, API/export/config/dependency/model/budget change. Tests compare exact boundary caps around preview and final size, Unicode multibyte/emoji/U2028/CR/tab/NUL/quotes/backslash, empty lines/file and final newline, 9/10 and99/100 digit transitions, continuation and callback/input/output/replay/stop failures. Source-bound baseline b82efb4 replay compares serialized payload/errors/full evidence and identity; isolated instrumentation measures actual LF joins and JSON serialized bytes without public hooks. Relevant source+transport tests and module/routine/subprocess guards via heavy admission after rolesfinish; source/runtime/Doctor identities, own cleanup and fresh reviewer. No latency/heap/native-token/quota/net-workflow saving claim.

## Acceptance Criteria

- [x] Incremental accounting selects exactly the prior lines and preserves all serialized bytes/errors/evidence/identity/security/accounting/final callback checks, with no changes to search or external API. — evidence: tests/evaluation-source.test.mjs; source-bound replay/metrics/test/Doctor/reviewer receipts in `.waypost/experiments/wp21-sealed-range-bytes-20261101/`.
- [x] Source-bound boundary replay and actual operation measurements prove fewer LF joins and cumulative serialized bytes for a long range, with stringify-call counts and a single-line control reported separately; relevant suites/guards pass, Doctor clean and fresh reviewer accepts. — evidence: tests/evaluation-source.test.mjs; source-bound replay/metrics/test/Doctor/reviewer receipts in `.waypost/experiments/wp21-sealed-range-bytes-20261101/`.

## Final Summary

Range reads now count the escaped JSON text body incrementally and join accepted lines only for the final response. Each candidate retains the original per-line empty-text envelope and exact end_line/truncated:true/next_line values. Accepted bytes update only after the bound check. The independent final callback size check remains unchanged, including existing cases where the complete false/null result is larger than preview and closes the broker. All response bytes, errors/evidence/identity, security/sealing/search-cache/traffic/limits/close/transport/public API behavior remain intact.

Source-bound Node24.22.1/macOS:68source-broker/transport+4module/routine/subprocess guards=72pass0fail/skip;416source identities stable. Two baseline files equalb82efb4 and exact inverse reconstructs production baseline.1326paired replay calls compare serialized result bytes/errors/full evidence/outer identities; empty/EOF/newlines/BOM/CRLF/CR/controls/NUL/quotes/backslash/Unicode/emoji/U2028, preview/full caps and9/10+99/100 digit transitions, continuation/replay/budget/foreign/closed/read-after-replace-delete/search interleave covered. Persistent tests pin exact escaped-byte boundaries, final-callback failure accounting and one200line LFjoin.

Measured actual synchronous callback operations for200lines of100characters:LFjoins201→1; cumulative JSON.stringify outputbytes2130026→100626(-95.28%). Stringify-call count INCREASES243→443. One-line control:LFjoins2→1,bytes1127→1129(+2),calls44→45. Report serialized volume and joins, not fewer stringify calls or a universal speedup. Responses are byte-identical; latency/heap/disk/model-context/native-token/quota/net-workflow savings were not measured.0native inference calls BY RUNNER; operator/reviewer token spend unmeasured.

Fresh independent implementation reviewer accepted original AC. Explicit checkednode+repo/bin Doctor receipt:955tracked/untracked/config inputs stable,exit0/empty stderr/0issues/warnings6info. Single admitted run61007exit0 with no wrapper/test failure. Owned canonical temporary fixtures removed21464logical bytes, helpers cleaned separately. Evidence `.waypost/experiments/wp21-sealed-range-bytes-20261101/` retains source/review/baseline/runtime/replay/metrics/log/Doctor identities. No native pilot or historical budget change.

## Technical Notes

JSON text-body size is additive across line joins because inserted LF prevents surrogate pairs crossing lines. Empty accepted lines must still add the next LF. The preview is not necessarily an upper bound on final serialized result; do not fix that separate behavior here.

## Dependencies

-

## Attachments

- Evidence: `.waypost/experiments/wp21-sealed-range-bytes-20261101/`.

---

*Last updated: 2026-11-02*
