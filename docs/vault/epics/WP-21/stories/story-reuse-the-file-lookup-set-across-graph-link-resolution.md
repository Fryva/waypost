---
type: story
id: "story-reuse-the-file-lookup-set-across-graph-link-resolution"
epic: "WP-21"
title: "Reuse the file lookup set across graph link resolution"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-29
updated: 2026-10-29
external_refs: {}
tags: []
code_refs: ["scripts/graph.mjs", "scripts/lib-links.mjs", "scripts/lib-node-index.mjs", "scripts/doctor.mjs", "tests/scripts.test.mjs", "tests/lib-links.test.mjs", "tests/harness.test.mjs", "tests/state-migrate.test.mjs", "docs/vault/adr/0008-token-budget.md"]
specs: []
started_at: "2026-10-29T19:21:55.104Z"
closed_at: "2026-10-29T19:34:04.097Z"
plan_updated_at: "2026-10-29T19:21:55.104Z"
---

# Reuse the file lookup set across graph link resolution

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Graph generation prepares the same vault-file membership Set in different node contexts; typed-only nodes repeat it for every frontmatter reference. Reuse the existing resolver cache within one graph computation, preserving all link semantics and lazy no-reference behavior.

## Decomposition

- [x] Reuse the resolver-built file Set through a private local resolution wrapper, only after the first actual resolver call. — evidence: scripts/graph.mjs buildGraph/resolveTarget; reviewer.json.
- [x] Cover body/typed-only contexts, kinds/source paths/non-node files and fresh membership across repeated builds. — evidence: tests/scripts.test.mjs graph lookup regressions; comparison.json.
- [x] Retain source-bound graph/trace/CLI parity, measured cache preparation reduction, independent review and owned cleanup. — evidence: comparison.json; validation.json; diagnostics.json; reviewer.json; cleanup.json.

## Implementation Plan

Inside buildGraph keep a local fileSet initially unset. Private resolveTarget(raw,type,ctx) seeds ctx._fileSet when fileSet exists, delegates to unchanged resolveLinkTarget, then remembers ctx._fileSet on successful return. Route existing generic body/typed calls through this wrapper. The first actual resolver call still initializes its own lazy Set, preserving first-call error order; no resolver call means no Set preparation. Keep node contexts and refCtx spreads, per-node sourceRel, field kinds, full ordered vaultFiles/index/exists callback, special resolveStoryEntry, dedup and sort unchanged. No getter, global cache, result memoization or separate eager constructor. Tests cover typed-only repeated refs, cross-kind/relative/ring-2 behavior, and the same injected files array updated after target create/rename/delete. Actual-function before/current replay compares full graph content/stats and resolver/exists trace at a fixed clock; count unique resolver fileSet identities/sizes only. Prove zero preparations for generic-link-free graphs (including special structural/spec-story relations) and fresh Set identities across builds. Actual CLI graph JSON preview comparison uses owned tool roots and fixed generation clock. Run link/graph/doctor/reconcile regressions and CLI/module/routine/subprocess guards through heavy admission, stable source/runtime/log bindings, Doctor, independent review and owned cleanup. No API/ADR/config/native/model change.

## Acceptance Criteria

- [x] Generic link resolution prepares one shared file membership Set per buildGraph call when used and none when unused, while sourceRel/kinds/ordered full files/index/exists remain unchanged. — evidence: comparison.json (file Sets 400 ->1; cold 0; empty Set reused); scripts/graph.mjs.
- [x] Full graph content/stats, edge ordering/dedup/normalization, node scopes, ambiguity/dead/out-of-scope and relative/type semantics remain equivalent; later builds with a mutated same files array get fresh membership, including creation/rename/removal. — evidence: graph-links.tap; comparison.json (full graph/trace/probe parity, fresh mutated array, error controls).
- [x] Source-bound before/current output/trace/CLI parity and reduced preparation counts pass link/graph/doctor/reconcile and safety checks; independent review accepts, Doctor is clean and owned scratch removed. No physical heap/latency/I/O/native-token/quota/net savings inferred. — evidence: validation.json (17+4 passed); reviewer.json (accepted, no findings); diagnostics.json (Doctor clean); cleanup.json (510,092 owned logical bytes removed).

## Final Summary

Generic resolution now adopts the first resolver-created file Set and seeds later contexts within the same buildGraph call; no generic resolution means no preparation. First-call lazy initialization and errors remain in the shared resolver. Per-node sourceRel/kinds/full file walk/exists, special story matching, edge normalization/dedup/sorting and public API stay unchanged. Source-bound Node 24.22.1/macOS: graph/link/doctor/reconcile checks 17/17 and safety/module/routine/subprocess guards 4/4 passed, fail/skip zero; 575 source identities and runtime binary stable. Actual-function bodyless fixture with 205 files and 400 generic refs: unique resolver file Sets 400 ->1, summed cache membership entries 82,000 ->205. Full graph content/stats and resolver/probe traces match; mixed body/typed links, non-node files, empty Set reuse, first-call malformed-file failure and identical probe exception identity verified. Same injected array updated through create/rename/delete gives fresh Set identity and correct membership. Generic-link-free structural/spec-story graph has zero resolver/cache work. Actual CLI graph JSON preview is byte-identical across owned old/current tool roots at the same fixed clock. These are preparation counts, not physical heap/latency/I/O/native-token/quota/net savings. Owned runner/fixture/tool copies removed; cleanup.json counts only own regular bytes and symlink paths. Source-bound Doctor issue/warn/warning counts are zero; independent reviewer accepted all criteria without findings; current full CI follows publication. Prior07168c9 CI40933884300 passed Node20/22/24.

## Technical Notes

The shared resolver and public buildGraph API stay unchanged. Keep full walk records (not a nodes-only projection) for non-node markdown resolution. Do not cache exists results or reference outcomes. Source header names an inherited graph contract; no matching covering spec exists in the bound vault, so this is behavior-preserving work under ADR-0008 and existing golden/parity tests.

## Dependencies

-

## Attachments

- Local retained evidence: `.waypost/experiments/wp21-graph-inputs-20261029/`.

-

---

*Last updated: 2026-10-29*
