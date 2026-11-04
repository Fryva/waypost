---
type: story
id: "story-serialize-each-handoff-round-payload-once-for-size-and-identity"
epic: "WP-24"
title: "Serialize each handoff round payload once for size and identity"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-04
updated: 2026-11-04
external_refs: {}
tags: []
code_refs: ["scripts/handoff-retrieval.mjs", "tests/handoff-retrieval.test.mjs", "tests/state-migrate.test.mjs", "tests/handoff-capture.test.mjs"]
specs: []
started_at: "2026-11-04T05:10:01.778Z"
closed_at: "2026-11-04T05:20:43.220Z"
plan_updated_at: "2026-11-04T05:10:01.778Z"
---

# Serialize each handoff round payload once for size and identity

| Field | Value |
|---|---|
| **Epic** | [WP-24](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Reuse one round-local JSON serialization for payload byte accounting and SHA256 identity in continueHandoff. CPU/serialization optimization only; transmitted bytes and native usage unchanged.

## Decomposition

- [x] Replace duplicate synchronous serialization with one iteration-local string, retaining limit/hash/state ordering.
- [x] Verify Unicode byte/digest/cumulative identity, all three rounds, authoritative replay and failure controls.
- [x] Compare baseline output/serialization volume, run focused suites and guards, Doctor and fresh review.

## Implementation Plan

In continueHandoff only: JSON.stringify(prepared.payload) at the existing size-check point; derive Buffer.byteLength from that exact string and reuse it in sha at the original identity point AFTER cumulative checks. No persistent/global cache, mutation, new protocol or policy. Rebuilt payload is ordinary JSON; fixed standard serializer scope. No changes fresh checks, route binding, challenge, deadlines, authority, limits, persisted representation or native admission/accounting. Read-only scout identified exact duplicate work; separate planner/critic before edits. Add three-round UTF-8/CRLF regression with independent expected size+hash and replay identities/no-extra surrogate inference. Differential baseline replay includes complete/failure/recovery scenarios and actual JSON instrumentation restricted to full payload serializations. Heavy focused retrieval/delivery/recovery tests plus CLI module/routine/state guards; source/log identities, Doctor, independent reviewer before completion. No native model calls or token-saving claim. First validation exposed a pre-existing safety-guard defect: recognize either standard quote style for env imports and add the actually missing capture-test env import. Keep the mandatory guard enabled; retain failed attempt logs and rerun affected tests.

## Acceptance Criteria

- [x] Payload bytes/digest/cumulative accounting, persisted identities, failures and authoritative replay remain equivalent; three-round Unicode regression passes.
- [x] Source-bound comparison confirms one fewer full payload serialization per round without changing sent bytes; focused suites/guards pass, Doctor clean and independent review accepts.

## Final Summary

Round-local JSON is shared by UTF-8 byte accounting and SHA256 identity; limit checks stay before hashing. No cache/state/wire/security/deadline/admission change. Fixed standard serializer/plain JSON scope.

Confirmed local Node25.6.1/macOS: 72 focused retrieval/delivery/recovery + 4 CLI/state guards pass, zero failures/skips. Source manifest 442 identities stable before/after. Exact inverse reconstructs base4a078ef. Differential comparison preserves sent payloads, states, snapshots and errors across three rounds, replay, tampered resume, round-limit, missing answer, deadline, interruption/recovery, uncertain consumption and stale source. Persistent Unicode regression independently checks UTF-8 bytes/SHA256/cumulative and replay identity with no extra surrogate inference.

Actual full-payload serializations in three-round continuation (including unchanged rebuild validation): 10→7; cumulative serialized volume 20492→13915 bytes. This removes one size/digest serialization per processed round. Sent bytes and native accounting unchanged; no token/latency/heap or net-workflow savings measured. Zero native model calls by runner. Operator/reviewer usage unmeasured; no experimental allocation change.

First attempt:39 focused pass,3/4 guards pass; pre-existing env-import guard accepted only double quotes and capture-test lacked env import. Fixed guard to recognize either matching quote style and added missing import; original failure/source/logs retained under attempt1. Final rerun includes capture/create/show regressions.

Doctor receipt:1002 inputs stable,exit0,0issues/warnings6info. Independent reviewer accepts original AC. Evidence `.waypost/experiments/wp24-round-serialization-20261104/` retains baselines, runner, source/runtime/review hashes, comparison, commands/full logs/Doctor/cleanup. Remote CI follows publication; no unobserved cross-Node/OS runtime success claim.

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-11-04*
