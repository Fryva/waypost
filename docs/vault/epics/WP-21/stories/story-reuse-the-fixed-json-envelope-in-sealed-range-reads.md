---
type: story
id: "story-reuse-the-fixed-json-envelope-in-sealed-range-reads"
epic: "WP-21"
title: "Reuse the fixed JSON envelope in sealed range reads"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-02
updated: 2026-11-02
external_refs: {}
tags: []
code_refs: ["scripts/evaluation-source.mjs", "tests/evaluation-source.test.mjs", "tests/evaluation-transport.test.mjs", "docs/vault/adr/budgeted-read-only-role-evaluation-over-a-sealed-source-snapshot.md"]
specs: []
started_at: "2026-11-02T13:46:47.722Z"
closed_at: "2026-11-02T14:03:06.562Z"
plan_updated_at: "2026-11-02T13:46:47.722Z"
---

# Reuse the fixed JSON envelope in sealed range reads

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Range byte checks still serialize fixed header fields for every candidate line. Reuse that fixed envelope lazily and add exact decimal end/next widths, preserving all former response and refusal boundaries. CPU-only; no token-saving claim.

## Decomposition

- [x] Compute fixed zero-number envelope once per nonempty range and add actual decimal widths per candidate. — evidence: tests/evaluation-source.test.mjs and source-bound replay/metrics/test/Doctor/reviewer receipts in `.waypost/experiments/wp21-sealed-range-envelope-20261102/`.
- [x] Pin digit/cap/Unicode/empty/EOF/huge-start/replay/final-failure behavior and actual operation counts. — evidence: tests/evaluation-source.test.mjs and source-bound replay/metrics/test/Doctor/reviewer receipts in `.waypost/experiments/wp21-sealed-range-envelope-20261102/`.
- [x] Baseline replay, source/transport suites/guards, Doctor and independent review. — evidence: tests/evaluation-source.test.mjs and source-bound replay/metrics/test/Doctor/reviewer receipts in `.waypost/experiments/wp21-sealed-range-envelope-20261102/`.

## Implementation Plan

Only read() preview calculation changes. Keep existing nextTextBytes including escaped-LF handling. Within actual loop after bytes(line), lazy envelopeBytes=bytes({...result,text:'',end_line:0,truncated:true,next_line:0})-2; remove exactly two single-byte zero digits, not text quotes. Candidate=envelopeBytes+nextTextBytes+String(i+1).length+String(i+2).length. All mutable fields override; other metadata constant per callback. Private lines is text.split result JSArray, with i<end<=length<=2^32−1, hence1<=i+1<=2^32−1 and2<=i+2<=2^32; these exact positive integers use decimal ASCII without exponent, so String lengths equal JSONnumber byte widths. Invalid/huge inputstart does not enter this proof because no loop executes. Preserve accepted-total update/selected push/endline/finaljoin, independent callback size/outputcharge/stop (full result may exceed preview), validation/cache/search/sealing/security/budget/identity/transport/API. No empty/EOF/recordedduplicate envelope work, no persistent memo/config/export. Baseline0a8b371 replay exact JSON results/errors/evidence/identity with caps±1/preview-finalfail, digit8/9/10+98/99/100/nonzero starts, Unicode/escapes/newlines, MAX_SAFE and2^32 EOF starts, budgets/replay/close/interleave. Instrument actual envelope-like JSONcalls excluding frozen final result, JSONcallcount/serialized volume/LFjoins and explicit number-String conversions;0/1/200line controls. No latency/heap/native-token/quota/net-workflow claim. Source+transport and module/routine/subprocess guards via heavy admission after rolesfinish; source/runtime/Doctor identities, owned cleanup and fresh reviewer.

## Acceptance Criteria

- [x] Fixed range-envelope arithmetic preserves exact payloads/line selection/errors/evidence/identities/security/accounting/final byte checks and unchanged search/API behavior. — evidence: tests/evaluation-source.test.mjs and source-bound replay/metrics/test/Doctor/reviewer receipts in `.waypost/experiments/wp21-sealed-range-envelope-20261102/`.
- [x] Source-bound digit and cap replay plus actual0/1/200line operation metrics prove less repeated envelope work with no empty/huge-start regression; suites/guards pass, Doctor clean and fresh reviewer accepts. — evidence: tests/evaluation-source.test.mjs and source-bound replay/metrics/test/Doctor/reviewer receipts in `.waypost/experiments/wp21-sealed-range-envelope-20261102/`.

## Final Summary

Read byte checks lazily reuse one fixed envelope with empty text, zero end_line/next_line and truncated:true, excluding exactly two single-byte zero digits. Every candidate still computes escaped text bytes and adds actual decimal widths for i+1/i+2. The private split-array bound gives1<=i+1<=2^32−1 and2<=i+2<=2^32, so positive decimal String lengths equal JSONnumber UTF8 bytes without exponent notation. Huge requested starts/EOF do not enter the loop. Accepted totals/push/endline/join, independent final callback size/charge/stop and all validation/security/search/cache/identity/traffic/API behavior remain unchanged.

Source-bound Node24.22.1/macOS:74source-broker/transport+4module/routine/subprocess guards=78pass0fail/skip;416source identities stable. Two baseline files equal0a8b371; exact inverse restores production baseline.1862paired replay calls compare exact JSON results/errors/evidence/outeridentity, including empty/EOF/2^32/MAX_SAFE starts, accepted blank-first partial response, preview/final cap±1,digits9/10+99/100+999/1000, nonzero/continuation,Unicode/escapes/newlines,replay/budgets/foreign/closed/interleave/deletedfiles. Every read asserts new preview count=min(old,1) and explicit numericString count=2*oldattempts; frozen final responses excluded from preview instrumentation. Persistenttests pin lazy operationcounts/digitcaps; prior final false/null overflow behavior preserved.

Measured actual synchronous callback for200lines:preview200→1,stringify443→244,serialized100626→62031bytes(-38.35%),LFjoin1unchanged; explicit String(number) calls0→400. One-line control:45stringify/1129bytes unchanged,2added explicit numberString calls. Empty control:43stringify/636bytes/noenvelopes unchanged. Proxy delegates original String and restores in finally alongside JSON.stringify/Array.join; requestprep/oracle/evidence excluded. This is a trade in internal operations, not a measured universal speedup,latency,heap,disk,model-context,native-token,quota or net-workflow saving. Responses are byte-identical;0native inference calls BY RUNNER,operator/reviewer usage unmeasured.

Fresh independent implementation reviewer accepted original AC. Explicit checkednode+repo/bin Doctor receipt:958tracked/untracked/config inputs stable,exit0/empty stderr/0issues/warnings6info. Single admitted11767exit0,no failures. Own canonical temporary fixtures removed25864logical bytes, helpers cleaned separately. Evidence `.waypost/experiments/wp21-sealed-range-envelope-20261102/` retains source/review/baseline/runtime/replay/metrics/log/Doctor identities. No native pilot or historical budget changes.

## Technical Notes

The two zero-digit bytes belong only to end_line/next_line replacements. Text quotes stay in base; text escaped body remains nextTextBytes. Decimal width proof is conditional on an executed line iteration, not arbitrary requested start/end values.

## Dependencies

-

## Attachments

- Evidence: `.waypost/experiments/wp21-sealed-range-envelope-20261102/`.

---

*Last updated: 2026-11-02*
