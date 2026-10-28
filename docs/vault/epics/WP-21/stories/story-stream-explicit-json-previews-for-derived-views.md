---
type: story
id: "story-stream-explicit-json-previews-for-derived-views"
epic: "WP-21"
title: "Stream explicit JSON previews for derived views"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-28
updated: 2026-10-28
external_refs: {}
tags: []
code_refs: ["bin/cli/views.mjs", "bin/cli/core.mjs", "scripts/graph.mjs", "scripts/kanban.mjs", "scripts/codemap.mjs", "tests/harness.test.mjs", "tests/scripts.test.mjs", "tests/state-migrate.test.mjs", "docs/cli-reference.md", "docs/vault/adr/0008-token-budget.md"]
specs: []
started_at: "2026-10-28T22:13:50.032Z"
closed_at: "2026-10-28T22:20:54.224Z"
plan_updated_at: "2026-10-28T22:13:50.032Z"
---

# Stream explicit JSON previews for derived views

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Explicit derived-view JSON previews capture the complete generator result in the CLI parent before printing it. This adds a parent buffer/duplicate copy and can fail at spawnSync maxBuffer on large results. Stream only this explicitly requested JSON through inherited stdout/stderr; retain preview-only behavior and ordinary compact/write paths.

## Decomposition

- [x] Replace only the explicit JSON forwarding branch. — evidence: exact one-line inverse in runtime-tests.mjs.txt/comparison.json.
- [x] Cover large success/failure streams, private non-JSON calls and real preview/write/query behavior. — evidence: harness streaming/private controls and scripts preview/write/query regression.
- [x] Reproduce the former buffer failure, verify source-bound checks and independent review. — evidence: comparison.json, validation.json, diagnostics.json, final independent reviewer.

## Implementation Plan

In handleDerived JSON branch replace process.stdout.write(run(cmd, [], {capture:true})) with run(cmd, []) and return. Keep empty generator argv; do not forward ignored user flags. No change to core/default captures, generators, JSON schema, non-JSON reconciliation/write path, graph --for precedence or public flags. Extend existing large JSON stream tests to reconcile plus all three derived commands at status0/7, exact bytes, separate stderr and empty derived argv. Add a negative non-JSON capture control and actual CLI fixture tests for JSON generator parity without writes, normal writes and graph-query precedence. Source-bound frozen-handler baseline/current execution on a >1MiB payload demonstrates old capture overflow versus successful streaming; do not infer memory-byte/native-token/net savings from that reproduction. Heavy admission; syntax/module/core/isolation guards and Doctor; independent review before close.

## Acceptance Criteria

- [x] All three explicit JSON previews retain complete stdout/stderr/status beyond the former parent capture buffer; generator argv stays empty, schema/generators unchanged. — evidence: tests/harness.test.mjs large stream status0/7 and argv checks; scope-proof.json protected core/entry/generators unchanged.
- [x] Non-JSON private capture, compact output and write behavior, preview no-write behavior and graph-query precedence stay compatible; meaningful regression checks and source-bound syntax/module/Doctor pass. — evidence: validation.json: 32 passed, 0 failures/skips; 575 source identities stable; CLI preview/write/query and private capture controls; syntax/module/diff/Doctor issue/warn/warning0.
- [x] Former buffer failure and current output are reproduced on identical controlled data, independent reviewer accepts evidence and own temporary runner is removed; no measured native-token/quota/memory/net savings claim. — evidence: comparison.json old ENOBUFS versus exact current2097213-byte stdout; reviewer accepted all criteria; cleanup.json own runner absent, 4307 logical bytes removed; no measured savings claim.

## Final Summary

One production line now streams explicit kanban/graph/codemap JSON previews through inherited stdout/stderr. Empty generator argv, complete JSON schema, preview-only/no-write behavior, ordinary compact writes and graph-query precedence are preserved. Core, generators and internal captured callers are unchanged.

A source-bound controlled handler reproduction uses identical2097213-byte JSON: baseline exits1 with ENOBUFS and empty stdout; current exits0 with exact complete bytes. This demonstrates the removed parent-buffer failure, not quantified memory/native-token/quota/net savings. Node24.22.1 focused checks: 32 passed, 0 failed/skipped, 12489.697583 ms, wrapper/child exit0, 575 stable source identities and matching binary/runner/log hashes. Large2MiB streams cover reconcile and all three derived commands at status0/7 with exact bytes, separate stderr and correct argv; private non-JSON capture control, real preview/write/query fixtures and existing reconciliation/core/module/isolation guards pass. Exact one-line inverse restores the baseline; protected core/entry/generator hashes unchanged. Own temporary runner removed. Independent reviewer accepted all criteria with no findings. Full CI for this revision follows publication.

## Technical Notes

Local forwarding fix under accepted ADR-0008 explicit detail policy; no new API/flag/dependency/model/native run or budget. New production diff is one branch only; JSON is explicitly requested and other internal captures must not be exposed. Existing env.mjs and state-migrate subprocess guard remain active.

## Dependencies

- Existing derived generator JSON contracts; accepted ADR-0008.

## Attachments

- Local retained evidence: `.waypost/experiments/wp21-derived-json-stream-20261028/`.

---

*Last updated: 2026-10-28*
