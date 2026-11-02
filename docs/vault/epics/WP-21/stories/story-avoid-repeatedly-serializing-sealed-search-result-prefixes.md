---
type: story
id: "story-avoid-repeatedly-serializing-sealed-search-result-prefixes"
epic: "WP-21"
title: "Avoid repeatedly serializing sealed search result prefixes"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-02
updated: 2026-11-02
external_refs: {}
tags: []
code_refs: ["scripts/evaluation-source.mjs", "tests/evaluation-source.test.mjs", "tests/evaluation-transport.test.mjs", "docs/vault/adr/budgeted-read-only-role-evaluation-over-a-sealed-source-snapshot.md"]
specs: []
started_at: "2026-11-02T02:24:26.113Z"
closed_at: "2026-11-02T02:37:45.808Z"
plan_updated_at: "2026-11-02T02:24:26.113Z"
---

# Avoid repeatedly serializing sealed search result prefixes

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Search output-byte checks copy and serialize every previously selected hit for each next candidate. Count the exact JSON array-body bytes incrementally while preserving search results and the complete sealed broker protocol. CPU-only; no token-saving claim.

## Decomposition

- [x] Replace growing result-array previews with additive hit/comma bytes and the unchanged per-candidate envelope/cursor. — evidence: tests/evaluation-source.test.mjs; source-bound replay/metrics/test/Doctor/reviewer receipts in `.waypost/experiments/wp21-sealed-results-bytes-20261101/`.
- [x] Pin exact byte caps, pagination/cursor widths, fresh and duplicate identity, accounting and failure gates. — evidence: tests/evaluation-source.test.mjs; source-bound replay/metrics/test/Doctor/reviewer receipts in `.waypost/experiments/wp21-sealed-results-bytes-20261101/`.
- [x] Baseline replay and actual copy/stringify-volume metrics, suites/guards, Doctor and independent review. — evidence: tests/evaluation-source.test.mjs; source-bound replay/metrics/test/Doctor/reviewer receipts in `.waypost/experiments/wp21-sealed-results-bytes-20261101/`.

## Implementation Plan

Only search() while-loop candidate construction changes. Maintain accepted resultsBytes. Candidate = accepted bytes + (result.results.length ?1:0) + bytes(hits[position]); compare against bytes({...result,results:[],truncated:true,cursor:cursorAt(position+1)}). Recompute envelope and cursorAt each iteration; accept only under the same maxOutputBytes check. Keep fresh cloned hit push and position increment, update accepted byte total only after acceptance. No change to scan/cache/4096 retention, query/cursor/schema validation, order/caps/result immutability, callback/byte/replay/owner/close/stop/sealing/hash/transport/publicAPI/config/dependencies/model/budget. JSON array brackets already belong to empty envelope; do not add/subtract them or use character lengths. Tests/replay cover first/last byte boundaries, no-fit/empty/complete/truncated output, Unicode paths, different line/cursor digit widths and limit changes, repeated/newcall identity, warm and uncached indexes, callback/input/output budgets, malformed/foreign cursors and terminal gates. Instrument actual Array iterator copied hit references and JSON.stringify calls/serialized bytes in isolated synchronous callbacks. Report fewer copied prefixes/serialized bytes, not fewer stringify calls or measured latency/heap/tokens. One-hit control must retain equal serialized bytes despite one extra stringify; long100-hit fixture measures scope. Compare serialized results/errors/full evidence/identity against5017698, retain source/runtime/log/Doctor identities, run source+transport and module/routine/subprocess guards via heavy admission after roles finish, own cleanup and fresh reviewer.

## Acceptance Criteria

- [x] Incremental search-array accounting preserves exact payloads/cursors/errors/evidence/identity/security/budgets/final checks and unchanged search-cache/read behavior. — evidence: tests/evaluation-source.test.mjs; source-bound replay/metrics/test/Doctor/reviewer receipts in `.waypost/experiments/wp21-sealed-results-bytes-20261101/`.
- [x] Source-bound boundary replay and actual copy/serialization metrics confirm reduction on a multi-hit fixture with honest one-hit/call-count controls; suites/guards pass, Doctor clean and independent reviewer accepts. — evidence: tests/evaluation-source.test.mjs; source-bound replay/metrics/test/Doctor/reviewer receipts in `.waypost/experiments/wp21-sealed-results-bytes-20261101/`.

## Final Summary

Search byte checks now count the JSON array body incrementally instead of copying/serializing all selected hit prefixes. Add bytes(next hit) and a comma only after an existing selected hit; empty envelope already contains array brackets. Per-candidate cursor generation/envelope/cap remains unchanged, accepted bytes update only after acceptance, and fresh cloned hit push/position semantics remain intact. No changes to cache/read/seal/security/validation/publicAPI/limits/identity/accounting/replay/transport/model/budget.

Source-bound Node24.22.1/macOS:70source-broker/transport+4module/routine/subprocess guards=74pass0fail/skip;416source identities stable. Two baseline files equal5017698; exact inverse reconstructs production baseline.1798paired replay calls match JSON result bytes/errors/full evidence and outer/results-array/first-hit cross-call identity; caps−1/=/+1, comma and cursor/line9/10+99/100, nonzero cursors/EOF, nofit/complete/truncated/continuation, cached and4097uncached queries, limit changes/duplicate/foreign/closed/budgets/read-search-interleave and deleted sealed files covered. Persistent tests pin exactUnicode-path caps, conservative last-preview nofit, outputBytes0/log0, fresh versus duplicate and no copied prefix references.

Measured actual synchronous callback for100hits: Array-iterator copied hit REFERENCES4950→0; cumulative JSON.stringify outputbytes708661→75916(-89.29%); stringify calls INCREASE938→1038. One-hit control:1400bytes unchanged,calls47→48,copiedrefs0→0. Iterator instrumentation filters arrays beginning with a path/line record, excluding manifest and file/line entry arrays, delegates the native iterator and restores it in finally; does not claim fewer allocated arrays or deep copies. Responses are byte-identical. Latency/heap/disk/model-context/native-token/quota/net-workflow savings not measured;0native inference calls BY RUNNER,operator/reviewer spend unmeasured.

Fresh independent implementation reviewer accepted original AC. Explicit checkednode+repo/bin Doctor receipt:956tracked/untracked/config inputs stable,exit0/empty stderr/0issues/warnings6info. Single admitted68751exit0, no wrapper/test failures. Owned canonical temporary fixtures removed30226logical bytes; helpers cleaned separately. Evidence `.waypost/experiments/wp21-sealed-results-bytes-20261101/` retains source/review/baseline/runtime/replay/metrics/log/Doctor identities. No native pilot or historical budget change.

## Technical Notes

For B=serialized UTF8 bytes, array body size is sum B(hit)+max(0,N−1) commas. Keep per-candidate cursor generation and final callback check. No token-output change is intended.

## Dependencies

-

## Attachments

- Evidence: `.waypost/experiments/wp21-sealed-results-bytes-20261101/`.

---

*Last updated: 2026-11-02*
