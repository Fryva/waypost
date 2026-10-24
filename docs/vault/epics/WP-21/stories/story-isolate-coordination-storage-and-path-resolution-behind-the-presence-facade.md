---
type: story
id: "story-isolate-coordination-storage-and-path-resolution-behind-the-presence-facade"
epic: "WP-21"
title: "Isolate coordination storage and path resolution behind the presence facade"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-24
updated: 2026-10-24
external_refs: {}
tags: []
code_refs: ["scripts/presence.mjs", "scripts/presence-storage.mjs", "tests/presence-storage.test.mjs", "tests/presence.test.mjs"]
specs: []
started_at: "2026-10-24T20:00:57.742Z"
closed_at: "2026-10-24T20:07:07.358Z"
plan_updated_at: "2026-10-24T20:00:57.742Z"
---

# Isolate coordination storage and path resolution behind the presence facade

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Make storage classification and coordination address resolution readable independently while preserving coordination behavior and authority.

## Decomposition

- [x] Extract storage and path resolution into one focused module.
- [x] Preserve the single lazy cache, public bindings and all callers.
- [x] Verify replay, safety contours and independent review.

## Implementation Plan

Independent planner selected literal lines 52-148 at base 8523f00 (5727 bytes), stopping before ensure. Move STORAGE, mount classification, the sole _coord Map, coordination paths, hostSlug and observationsPath to presence-storage.mjs with direct stdlib/lib imports and no backimport. Import/re-export five original public bindings; import only the three internal path helpers privately. Keep projectRoot+NUL+raw-vault cache keys, shared mutable return identity, sticky config, repeated gitCommonDir calls, call-time inputs and all delay/path spelling unchanged. No reader/writer, heartbeat, lease, prune or policy changes. Add env-first focused tests, replay frozen repository/cache/storage facts and isolated read/write flows, run existing presence/process/commit/doctor coordination contours through heavy admission. Retain source-bound command/log receipts and fresh reviewer verdict.

## Acceptance Criteria

- [x] Extraction reverses exactly to baseline SHA256 15372889b7a772068d3b11aa9ec6ce16216448e157b3d03da580747a537fed6f; focused module is below 24000 bytes and facade shrinks. — evidence: .waypost/experiments/wp21-presence-storage-module-20261024/verify-move.py, move-proof.json.
- [x] Five bindings and namespace27 are preserved; raw cache keys, mutable identity, sticky configuration, cloud/network/local classification and Git/legacy/override paths remain compatible. — evidence: .waypost/experiments/wp21-presence-storage-module-20261024/facts-before/after.json and tests-attempt-1.log.
- [x] Frozen path/cache/layout facts, fixture identities and isolated heartbeat/lease/observation flow results and contents match. — evidence: .waypost/experiments/wp21-presence-storage-module-20261024/files-before/after.json, flow-before/after.json.
- [x] Focused and existing safety tests pass with source-bound heavy receipts; doctor reports zero issues/warnings. — evidence: .waypost/experiments/wp21-presence-storage-module-20261024/validation.json, source-tested.json, tests-attempt-1.log, doctor.json.
- [x] Independent reviewer verifies all acceptance criteria before close/commit. — evidence: .waypost/experiments/wp21-presence-storage-module-20261024/fresh-context reviewer: ship, all five criteria met.

## Final Summary

Literal extraction completed: presence-storage.mjs 5967 B; facade 40897 -> 35367 B, combined +437 B. Five public bindings and namespace27 are unchanged. The three path helpers are internal to the facade; STORAGE, mountTypeOf and the sole _coord Map remain private. All readers/writers and their primary/legacy policy stay unchanged. Current sources reconstruct baseline SHA256 15372889b7a772068d3b11aa9ec6ce16216448e157b3d03da580747a537fed6f exactly.

Frozen real-Git layout/cache/classification facts and original fixture content/inode identities match. Separate fixed-clock replay verifies heartbeat dual-write/read/clear, acquire/read/release and observation file contents. Source-bound five-file heavy run passed 98/100, zero failures, two existing Linux-only skips on macOS, exit 0 in 81.959 s on Node25.6.1. All nine new env-first tests pass; they cover bindings/lazy import, mount prefix/failure behavior, raw cache keys and mutable identity, sticky binding, override and linked worktree semantics.

Independent reviewer ship, no findings: verified 19 current/17 baseline/11 dirty hashes, log/manifest SHA, 21 live fixture files and final flow contents. Package includes both modules, syntax checks pass, doctor0issues/0warnings. Complete evidence: .waypost/experiments/wp21-presence-storage-module-20261024/ (validation.json, full log, source manifests, replay pairs, verify-move.py and packaging). Owned fixtures/scripts/npm cache are removed after review; receipts retained. New full CI is pending. No measured native-token/runtime/workflow saving, no native pilot or budget change.

## Technical Notes

Source-size improvement does not establish measured native-token savings. No new native pilot or budget change. Remove owned replay fixtures and temporary cache after review; retain evidence.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-24*
