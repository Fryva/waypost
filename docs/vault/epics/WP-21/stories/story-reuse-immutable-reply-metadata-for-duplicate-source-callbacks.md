---
type: story
id: "story-reuse-immutable-reply-metadata-for-duplicate-source-callbacks"
epic: "WP-21"
title: "Reuse immutable reply metadata for duplicate source callbacks"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-02
updated: 2026-11-02
external_refs: {}
tags: []
code_refs: ["scripts/evaluation-source.mjs", "tests/evaluation-source.test.mjs", "tests/evaluation-transport.test.mjs", "docs/vault/adr/budgeted-read-only-role-evaluation-over-a-sealed-source-snapshot.md"]
specs: []
started_at: "2026-11-02T14:09:10.387Z"
closed_at: "2026-11-02T14:28:40.356Z"
plan_updated_at: "2026-11-02T14:09:10.387Z"
---

# Reuse immutable reply metadata for duplicate source callbacks

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Repeated delivery of one recorded callback reuses its immutable result but recomputes result byte length and canonical output digest. Retain those deterministic private metadata values while preserving all replay validation and full traffic charges. CPU-only, no token-saving claim.

## Decomposition

- [x] Cache outputBytes/outputDigest only on existing private recorded entries, preserve phase ordering and fallback after partial metadata computation.
- [x] Pin duplicate/newcall identity, byte/hash fault ordering, limits/foreign/replay/close and unchanged logs.
- [x] Source-bound baseline replay and actual result-serialization metrics, suites/guards, Doctor and fresh review.

## Implementation Plan

Only callback() result metadata work changes. After unchanged schema/inputbyte/owner/inputDigest/replay checks and previous.result reuse, length=previous?.outputBytes??bytes(result); always charge outputBytes and enforce unchanged caps. At the ORIGINAL recorded.set point after successful bytecap, retain previous entry or insert {inputDigest,result}; only then compute missing outputDigest=hash(canonical(result)), assign both private metadata values, and push the same immutable log fields/order. If first byte serialization fails, no record/outputcharge; if output hash serialization fails after record insertion, keep recorded immutable result, no completed metadata, no successlog; retry must return same result and recalculate missing metadata while charging again. Do not move record insertion after hashing. No result mutation/public record fields or persistent/global caches. Results are broker-owned recursively immutable plain trees, no mutable getters/toJSON payloads. All requests still increment counts/inputbytes, validate owner/name+args digest, charge outputbytes including duplicates, append duplicate logs and stop on cap/close. No changes read/search/seal/security/API/config/model/budget/transport. Tests/replay compare full JSONresults/errors/evidence and identity vsd06d7dc; inject one-time byte/hash serialization failure at identified frozen-result/canonical-text phases, preserve record/errorordering; include unique/duplicate/changedinput/foreign/digest/closed/callback/input/output caps and mutated sourcefiles. Instrument actual frozen-result serialization and payload-text canonicalization plus total JSONcalls/bytes, onlyinsidecallback and restoredfinally. First/new-ID controls must retain own computation; repeated deliveries skip redundant output metadata only, no token/latency/heapclaim. Source+transport and module/routine/subprocess guards through heavy admission after rolesfinish; source/runtime/Doctor identities, owned cleanup and fresh reviewer.

## Acceptance Criteria

- [x] Recorded duplicate replies reuse immutable size/digest without bypassing validation/traffic limits/logs or changing responses/evidence/identity/error-phase behavior; first/new-call paths preserve computation.
- [x] Source-bound replay and actual duplicate serialization metrics show reduced repeated work with first/new-call/failure controls; suites/guards pass, Doctor clean and fresh reviewer accepts.

## Final Summary

Private recorded entries retain outputBytes/outputDigest after successful hashing; public frozen results stay unchanged. Every callback still validates owner/input/replay, charges full input/output traffic and enforces caps. Record insertion remains before output hashing: injected byte serialization failure leaves no record/output charge, whereas digest failure retains the original result and charged output, recomputing incomplete metadata on retry.

Confirmed local Node24.22.1/macOS:76 source/transport tests +4 migration/module/routine/subprocess guards=80pass0fail/skip. Exact production inverse and baseline files match d06d7dc;416 checked source hashes stable.1363 paired callbacks preserve full JSON responses/errors/evidence/identity, including fault phases, replay/foreign/digest/closed/callback/input/output caps, ranges/search and sealed-file mutation/deletion. Explicit checkednode+repo/bin Doctor:959 inputs stable,exit0,0issues/warnings6info. Fresh independent reviewer accepted original AC.

Actual callback instrumentation on eight retransmits of a16KB reply: frozen frame serializations8→0, canonical payload serializations8→0, total stringify calls344→208 and cumulative serialized bytes261328→2104. First/new-ID/independent-broker controls unchanged. This measures internal serialization only, not latency/heap/model tokens/quota/net-workflow savings. Every delivered reply remains fully charged. Standard fixed serializer and broker-owned immutable plain output scope; global serializer/prototype mutations are outside the compatibility claim. No native pilot/budget/model/API/security policy change;0inference calls BY RUNNER, operator/reviewer token usage unmeasured.

Evidence: `.waypost/experiments/wp21-source-replay-metadata-20261102/` contains exact baselines, source/runtime/review identities, admitted runner/session18657exit0, replay/metrics/full test logs, Doctor receipts and owned temporary cleanup17294logical fixture bytes. Full GitHub CI follows publication; no unobserved cross-Node/remote-OS runtime success claim.

## Technical Notes

Store metadata on a separate private entry, never on the immutable public result. Insert the base record before hashing at the original phase. Cache values only after output hash succeeds; missing metadata always recomputes.

## Dependencies

-

## Attachments

- Evidence: `.waypost/experiments/wp21-source-replay-metadata-20261102/`.

---

*Last updated: 2026-11-02*
