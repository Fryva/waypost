---
type: story
id: "story-preserve-reconciliation-failure-reports-and-child-status"
epic: "WP-21"
title: "Preserve reconciliation failure reports and child status"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-28
updated: 2026-10-28
external_refs: {}
tags: []
code_refs: ["bin/cli/core.mjs", "bin/cli/views.mjs", "scripts/reconcile.mjs", "tests/harness.test.mjs", "tests/scripts.test.mjs", "tests/state-migrate.test.mjs", "docs/cli-reference.md"]
specs: []
started_at: "2026-10-28T21:22:58.465Z"
closed_at: "2026-10-28T21:33:02.239Z"
plan_updated_at: "2026-10-28T21:22:58.465Z"
---

# Preserve reconciliation failure reports and child status

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

A nonzero reconcile child exits before its captured report is returned: prose and --json can lose failure details, forcing another diagnostic call. Preserve reports and exact child failure status, without exposing captured internal output from other commands.

## Decomposition

- [x] Add a narrow caller-controlled spawn-result option and failure-preserving reconcile handling. — evidence: core.run opt-in and handleReconcile; scope-proof.json.
- [x] Cover partial writes, JSON streaming, malformed reports, status/signal/error and default-capture suppression. — evidence: 11 core/28 handler cases, 2MiB stream and real CLI regressions.
- [x] Verify source-bound checks, independent review and owned-temp cleanup. — evidence: validation.json, diagnostics.json, cleanup.json, final independent review.

## Implementation Plan

Add returnResult=false to core.run options; after the existing spawn-error fail branch, return the full result only when explicitly requested. Defaults and runJson remain unchanged. Reconcile --json calls run with inherited streams; human reconcile opts into captured result, locally parses a non-null non-array object report with an absent/null or valid object-array indexes field, renders existing compact details, then gives exact child status priority over summary.failed (null status ->1). Invalid/malformed output is retained byte-for-byte on stdout, reports expected-JSON diagnostic on stderr, and sets exitCode to child nonzero/null->1 or1 for status0, returning naturally to flush output. Never immediate process.exit after writing captured output. A nonzero child with valid report gets a failure header; normal headers/formatter unchanged. Existing generator/core default execution, args/env, spawn errors, file writes, public flags and other captured callers remain unchanged. Meaningful real CLI partial-failure and isolated core/handler/stream checks; heavy admission then independent review.

## Acceptance Criteria

- [x] Reconcile human/JSON retain failure details, partial success facts and exact child status; malformed/non-object reports and signal/null-status fail without losing available output, and normal success/compute behavior stays compatible. — evidence: tests/harness.test.mjs handler and streaming cases; tests/scripts.test.mjs real CLI partial-write reports; exact status7/null checks.
- [x] Other captures remain suppressed on failure, success returns unchanged, spawn errors/stdio/env forwarding preserved; regression checks cover large output and no dry-run writes, with matching source identities and passing CLI guards/Doctor. — evidence: validation.json: 20 passed, 0 failures/skips; 575 source identities stable; syntax/module/core ownership/isolation/diff checks and Doctor issue/warn/warning0; scope-proof.json.
- [x] Independent reviewer accepts criteria and own temporary files are removed; no native-token/quota/net savings claimed from avoiding an extra diagnostic invocation. — evidence: final reviewer accepted all criteria without findings; cleanup.json own runner absent, 1776 logical bytes removed; no measured token-saving claim.

## Final Summary

Reconcile now retains failure reports in prose and JSON. One internal core.run opt-in returns the spawn result after the unchanged spawn-error check; default run/runJson callers preserve their suppression/status contract. Human reconcile renders structured partial results and sets exact child status, with null status mapped to1 and child failure taking priority over summary.failed. Invalid JSON/root/index structure retains available stdout and expected-JSON stderr diagnostic with natural exitCode-based flushing. JSON directly inherits streams and preserves raw child output/status. No generator, storage, write policy, public flag, module boundary, role/model or budget change.

Source-bound Node24.22.1: 20 focused checks passed, 0 failed/skipped, 14101.471167 ms, 575 stable source identities, wrapper/child exit0 and stable binary/runner/log hashes. Real CLI fixtures verify prose/JSON partial-write reports and partial successes. Isolated checks cover11core cases,28handler cases, exact status7/null mapping, malformed/root/index output, spawn/buffer errors and default private-output suppression. A real inherited stream check preserves a 2MiB JSON payload exactly with stderr separate and status7. Existing reconciliation, module syntax/import/size/core ownership, routine output and subprocess guards pass. Human capture keeps its existing maxBuffer; the large JSON check does not assert unlimited human capture. Own runner removed. Independent reviewer accepted all criteria with no findings. Full CI for this revision follows publication. No native-token/quota/net-workflow saving measured.

## Technical Notes

Local bugfix with one internal opt-in; no new public flag, dependency, schema, model/native run or budget. Preserve existing core.run error precedence and human capture maxBuffer; large inherited JSON is a separate streaming check, not proof for oversized human reports. Tests use env.mjs; include subprocess guard. Full CI at baseline5ec15cc passed Node20/22/24.

## Dependencies

- Existing reconciliation contracts and accepted thin CLI/core ownership.

## Attachments

- Local retained evidence: `.waypost/experiments/wp21-reconcile-failure-20261028/`.

---

*Last updated: 2026-10-28*
