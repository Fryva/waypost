---
type: story
id: "story-transfer-content-addressed-handoff-deltas-with-confirmed-receiver-baselines"
epic: "WP-24"
title: "Transfer content-addressed handoff deltas with confirmed receiver baselines"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-03
updated: 2026-11-04
external_refs: {}
tags: []
code_refs: ["scripts/handoff-transfer.mjs", "bin/cli/handoff-transfer.mjs", "tests/handoff-transfer.test.mjs", "docs/handoffs.md", "docs/handoff-experiment-2026-11-04.md"]
specs: []
started_at: "2026-11-04T03:43:37.049Z"
closed_at: "2026-11-04T04:59:00.269Z"
plan_updated_at: "2026-11-04T03:43:37.049Z"
blocked_by: ["WP-24/story-serve-bounded-handoff-document-requests-through-the-existing-host"]
---

# Transfer content-addressed handoff deltas with confirmed receiver baselines

## Description

Owner-approved continuation of Portable task handoffs with verifiable evidence.

## Implementation Plan

Keep content objects in an explicit bounded receiver-local store. Authenticate participant availability through existing team messages, reverify the exact base and reconstructed target, and publish only complete snapshots. Exercise full transfer, acknowledged delta, eviction, explicit full fallback, relocation and provenance-limited garbage collection through the public CLI.

## Acceptance Criteria

- [x] An opt-in bounded local content store validates every object hash, size and supported type before availability acknowledgement. — evidence: scripts/handoff-transfer.mjs and11 tests; actual full CLI export/import validates bounded objects and manifests.
- [x] Delta application requires the exact receiver-confirmed base digest and verifies the reconstructed full snapshot digest. — evidence: actual authenticated availability message followed by delta import; reconstructed relocated snapshot verified.
- [x] Missing/corrupt base falls back explicitly to bounded full transfer; stale or mismatched confirmation never counts as a hit. — evidence: actual eviction refusal returned needs-full/exit2 without target publication, followed by verified full fallback.
- [x] Relocation and round recovery preserve content identity. Report wire/storage bytes separately from model input; fresh model contexts never claim inherited hidden memory. — evidence: transfer-demo/results.json verifies3 relocated snapshots and foreign-file-preserving GC; full40930 vs delta4111 serialized bytes, distinct from model input.

## Final Summary

Implemented optional content-addressed receiver stores, participant availability hints, complete verification before publication, explicit full fallback and provenance-limited GC. Public CLI full/report/delta/eviction/fallback/relocation flow completed with0 model calls. Wire40930→4111 bytes and object29553→1900 bytes in this example. Scope is cooperative local stores; a hard crash may leave a fail-closed lock, and no hidden model state is inherited.
