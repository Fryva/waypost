---
type: story
id: "story-build-node-lookup-buckets-without-rescanning-their-members"
epic: "WP-21"
title: "Build node lookup buckets without rescanning their members"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-04
updated: 2026-11-04
external_refs: {}
tags: []
code_refs: ["scripts/lib-node-index.mjs", "tests/lib-node-index.test.mjs"]
specs: []
started_at: "2026-11-04T22:09:55.623Z"
closed_at: "2026-11-04T22:17:54.081Z"
plan_updated_at: "2026-11-04T22:09:55.623Z"
---

# Build node lookup buckets without rescanning their members

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Private node-index insertion scans a whole bucket for every node/readout and repeats Map lookups. A node is processed once in one contiguous batch, so an existing occurrence must be at that bucket's tail. Use this invariant to avoid linear rescanning without changing index contents or object identity.

## Decomposition

- [x] Replace private add's has/includes/repeated-get with one get, direct initial bucket and tail check; preserve normalization and iteration order.
- [x] Verify all node fields, ordered Map keys/value references, duplicate paths/readings, ambiguity, freshness and I/O/error behavior.
- [x] Measure actual bucket-index reads and Map operations on real and collision-heavy vaults, compare CLI/focused checks/Doctor and fresh review.

## Implementation Plan

Only scripts/lib-node-index.mjs private add: preserve const k=key.toLowerCase(); const bucket=map.get(k); if(!bucket)map.set(k,[node]); else if(bucket[bucket.length-1]!==node)bucket.push(node). Each push creates a unique node object, all adds of current n occur together, maps are private and append-only until return. Therefore a repeated n in any bucket is always its last member, even A/B/A key order. Empty/missing branch avoids a tail read for new keys. No sorting/dedup of nodes/paths/stemReadings, Set/cache/helper/export/import change. byPath last-wins behavior and distinct objects for repeated paths unchanged; document invariant in English. Test mixed-case collisions, normalized repeated readings, duplicate layout folders, full Map entries through exact node ordinals, aliases and per-call freshness. Source-bound actual old/current module replay uses delegated Map/array Proxy instrumentation to count real bucket element reads and Map has/get calls; freeze complete nodes and ordered Map tables plus reference ordinals. Compare actual current vault and1000node collision fixture, resolver ambiguity and file read sequence, then copied actual graph/ready/codemap JSON at fixed clock/same paths/scaffold. Focused node-index/identity/link/readiness/predicates and CLI namespace/module/routine/state guards via heavy gate, Doctor and fresh review. Logical operation counts only, no latency/heap/native-token/quota/net-workflow claim. Pure leaf6000B bound and public facade unchanged; accepted ADR0008, no new architecture or pilot.

## Acceptance Criteria

- [x] Complete ordered index/maps/references, duplicated paths/readings, ambiguity/freshness and consumer/CLI behavior match baseline with API/read budget intact. — evidence: actual-vault/collision-1000/duplicate-path before/after snapshots; resolver-comparison.json; freshness.json; CLI pairs; index-consumers.stdout.
- [x] Actual vault and collision-heavy workload perform fewer bucket reads/Map operations; focused checks/Doctor and fresh review pass. — evidence: operation-counts.json; commands.json; Doctor stdout; outer-heavy-original-records.jsonl; node_bucket_reviewer: story closed / commit, no findings.

## Final Summary

Private bucket insertion now gets once, creates missing bucket with current node, otherwise checks its last element. Each unique node is processed in one contiguous batch, so membership is equivalent to tail identity. Original normalized key, node/path/readings order, duplicate paths, Map key/value order and object references unchanged. No new Set/cache/helper/export/import/state/API or output-format change. Comment records invariant; leaf bound6000B unchanged.

Confirmed Node24.22.1/macOS:24index/identity/link/readiness+13identity/resolver predicates+14CLI namespace/module/size/routine+37state-migration=88pass,2state skips,0fail. Heavy12880exit0; Doctor0issues/warnings;1009input/runtime hashes stable. Actual269node vault complete snapshots include all node fields plus each ordered Map entry encoded through exact node ordinals. Three index pairs (actual,1000collision,duplicate paths) equal; full transitive read/probe sequence equal; resolver ambiguity/missing and independent containers/caller-mutation freshness equal. Actual graph/ready/codemap CLI JSON stdout/stderr/status exact at fixed clock with same paths/scaffold.

Delegated native Map/array Proxy instrumentation wraps arrays from both [] and [node]; counters frozen before serialization. Actual vault: bucket index reads171→71, Map.get1553→807, Map.has807→0, Map.set736→736.1000same-identity/stem nodes: index reads1499500→2998, get5000→3000, has3000→0,set2→2. Duplicate paths3nodes: reads12→7. These are logical property/method counts, excluding engine/runtime/physical memory/latency and native-token/quota/net-workflow savings. Text output unchanged. The contiguous-node/private-append-only invariant is required: a future interleaved revisit of an earlier node must reconsider this optimization.

Evidence `.waypost/experiments/wp21-node-buckets-20261104/` retains literal baseline, current source/runtime identities, complete Map/ordinal/node snapshots and I/O traces, operation counts, ambiguity/freshness, exact CLI outputs, runner/clock/commands/full logs and cleanup. Single heavy producer passed. Owned collision fixture/tool/vault scratch removed with lstat and no followed external symlink targets. Planner exploratory Node25counts were not acceptance evidence; explicit admitted Node24results supersede them. Fresh independent node_bucket_reviewer accepted all AC/decomposition items: story closed / commit, no findings;6current review hashes match and1009checked inputs differ only by later story prose. Runner/raw heavy receipts match; tests were not rerun. Basebd62259 full CI41914173685 confirmed completed/success; no native model/pilot or budget change.

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-11-04*
