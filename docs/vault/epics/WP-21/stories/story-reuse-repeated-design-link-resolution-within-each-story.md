---
type: story
id: "story-reuse-repeated-design-link-resolution-within-each-story"
epic: "WP-21"
title: "Reuse repeated design link resolution within each story"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-04
updated: 2026-11-04
external_refs: {}
tags: []
code_refs: ["scripts/ready.mjs", "tests/ready.test.mjs"]
specs: []
started_at: "2026-11-04T18:15:25.058Z"
closed_at: "2026-11-04T18:22:06.857Z"
plan_updated_at: "2026-11-04T18:15:25.058Z"
---

# Reuse repeated design link resolution within each story

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Repeated spec and ADR references within one story repeat pure link resolution over the same snapshot. Reuse those results without removing any diagnostic rows or changing output.

## Decomposition

- [x] Add a cache local to one story's designGates call, keyed separately by kind and exact reference.
- [x] Verify duplicate diagnostics, kind/source scope and freshness, and compare complete baseline/current rows with resolver call counts.
- [x] Run focused tests, Doctor and independent review.

## Implementation Plan

Keep scripts/ready.mjs designGates loops and gate emission unchanged. After its no-spec early return, create two private Maps (spec/adr). Resolve each exact raw string only once per kind in that invocation; store the existing node/missing/ambiguous projection only after successful resolution. No global/per-vault cache, normalization, persistent state, shared-resolver change or API change. Existing synchronous index/files snapshot is read-only. tests/ready.test.mjs extends repeated missing and ambiguous references and cross-kind identity coverage; existing source-relative and snapshot-mutation controls remain. Source-bound actual-module replay wraps real resolver imports, compares all old/current rows and counts calls across repeated and unique controls plus later vault changes. Focused readiness/link tests and CLI namespace/module/state guards run through heavy admission. CPU operation counts only: no latency, native token, quota or net workflow claim. Accepted ADR-0008 unchanged; no new architecture decision or model pilot.

## Acceptance Criteria

- [x] Complete readiness rows, ordering, duplicates, kind/source resolution and freshness match baseline. — evidence: comparison.json; readiness-link.stdout (10pass).
- [x] Repeated-reference fixture performs fewer actual resolver calls; unique controls retain behavior; focused tests, Doctor and fresh reviewer pass. — evidence: comparison.json; commands.json; followup.json; doctor-receipt.json; independent ready_resolution_reviewer (story closed / commit, no findings).

## Final Summary

Local per-story/kind/raw-ref memoization reuses only resolved node/missing/ambiguous results. Gate emission, order, duplicates, via, ranking and fresh vault snapshots remain unchanged. Added explicit same-ref spec/ADR and alias/via diagnostics tests, repeated missing/ambiguous cases and existing source/new-path controls.

Source-bound Node24.22.1/macOS actual-module replay with wrapped real resolver: 32-story repeated-reference fixture 7680→224 calls; status-refresh3840→160, rename3200→160, removal2560→128. Complete serialized rows match baseline at every stage. Unique4→4; no-spec0→0. Synthetic workload counts only, not representative latency/heap/token/quota savings; unique references incur Map overhead. No native model pilot or budget change.

Evidence `.waypost/experiments/wp21-ready-resolution-20261104/` retains baseline/current identities, runtime hashes, full rows, source manifests, exact commands/full logs and cleanup. First probe failed before fixtures/tests because VM import.meta.url was unset; only probe loader corrected. Second producer completed replay and 10 readiness/link tests plus CLI guards, then Doctor correctly failed on a code-map made stale by this story's code_refs; source hashes stable, tests reused while derived views are regenerated. Follow-up heavy67148exit0: full state-migrate37pass2skip, Doctor0issues0warnings,1004input hashes stable. CLI guard log reports15pass including one empty unmatched-file subtest:14actual guard tests. Total61actual tests passed,2skipped,0fail. Fresh independent ready_resolution_reviewer accepted both AC and all decomposition items: story closed / commit; no findings. Six review hashes and1000tracked sources matched. Doctor snapshot differs only by subsequent story prose. Previous commit eed0914 CI41877886032 confirmed completed/success.

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-11-04*
