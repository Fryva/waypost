---
type: story
id: "story-isolate-codex-report-text-formatting"
epic: "WP-21"
title: "Isolate Codex report text formatting"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-28
updated: 2026-10-28
external_refs: {}
tags: []
code_refs: ["scripts/token-codex.mjs", "scripts/token-codex-format.mjs", "scripts/tokens.mjs", "tests/token-codex-format.test.mjs", "tests/token-codex.test.mjs", "tests/tokens.test.mjs", "tests/state-migrate.test.mjs", "docs/how-it-works.md"]
specs: []
started_at: "2026-10-28T02:27:47.699Z"
closed_at: "2026-10-28T02:35:31.562Z"
plan_updated_at: "2026-10-28T02:27:47.699Z"
---

# Isolate Codex report text formatting

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Read Codex text formatting independently of rollout/archive decoding and cumulative accounting. Mechanical WP-21/ADR-0008 split; no accounting, report schema, pricing or subscription conversion change. Basef88dda1 CI40601234746 completed successfully.

## Decomposition

- [x] Freeze owner/API and formatter outputs, getter/method/error behavior.
- [x] Extract literal EOF formatter; preserve analyzer provenance coverage.
- [x] Validate existing consumers and isolation guard, review and own-temp cleanup.

## Implementation Plan

Move the literal EOF formatCodexReport block to scripts/token-codex-format.mjs, no imports/state/I/O/clock. Owner directly re-exports the binding without local imports; no internal consumer exists. Public API3/function-source/name/arity preserved, no wrappers/cycle. Leaf ceiling3000B, owner ceiling24000B. As with existing stateless leaf aliases, function identity is shared across queried owner imports; no mutable owner state moves.

Preserve nullish unknown handling, exact share===null check and toFixed(2) errors/method receiver, detailed versus compact precedence over sessions, legacy missing prefix diagnostics, property access ordering, session row order/empty roles, exact spaces and trailing newline. No new input validation or output wording. Freeze formatter matrix and getter/coercion/error traces before/after with exact owner inverse; no actual histories read.

Codex CLI analyzer_sources currently hashes the owner that contains this formatter. Add the leaf only to the Codex roster in scripts/tokens.mjs and its existing exact-path/actual-SHA test. Claude roster and its five-source assertion remain unchanged, because it does not include the Codex owner. Invert this one explicit provenance addition separately; never broadly suppress provenance fields to claim equality. Existing fixture-only Codex/Claude CLI tests remain authoritative for schema/counts.

New import-free alias/budget and captured original output golden tests do not spawn children. Existing child-spawning suites already import env.mjs. Run formatter, token-codex, tokens and state-migrate suites through heavy admission; keep the existing repository-wide child-env guard in scope. Source/runtime/runner/log identities, package/syntax/Doctor issue/warn/warning0, independent critic and reviewer, own runner/npmcache cleanup before CLI close. Update ownership docs and source pointers only; canonical ADR guards unchanged. Retain evidence .waypost/experiments/wp21-codex-format-20261027/. No native pilot, real rollout scan, provider call or measured token/runtime savings.

## Acceptance Criteria

- [x] Literal EOF move and exact inverse/API3/direct alias preserved; leaf<=3000B, owner<=24000B; frozen outputs/property/method/error behavior unchanged with no real histories read. - evidence: `comparison.json`, exact inverse and `before.json`/`after.json` in `.waypost/experiments/wp21-codex-format-20261027/`.
- [x] Codex provenance covers six exact source paths and actual hashes; Claude roster unchanged; focused/existing consumers plus child-env guard pass with source-bound logs, package/syntax/Doctor pass and docs identify ownership. - evidence: exact CLI path/actual SHA assertions, `validation.json`, `tests.tap`, `static-checks.json`, `pack.json`, `doctor.json` and ownership docs.
- [x] Independent review accepts diff/evidence; owned temporary files removed before CLI close. - evidence: independent `review-final.json`, twelve input hashes and `cleanup.json`.

## Final Summary

Literal1563B EOF formatter moved to import-free/stateless leaf; owner24495->22994B below24000B, combined production source+62B. Direct alias/API3/function-source/name/arity and exact whole-owner inverse preserved. Frozen32cases/19getter/method/error events match, including compact/session precedence, option getter reads, nullish/legacy diagnostics and existing direct-call errors. Codex analyzer roster adds only the new leaf, six exact paths/actual SHA checked; Claude five-source roster unchanged. Exact tokens.mjs inverse removes only that explicit source-path addition. Source-bound four-file run121total119pass0fail2existing platformskips,7322.943084ms Node24.22.1 wrapper/child0, stable binary/runner/log and415input identities. Includes existing child-env safety guard. Package/syntax/Doctor issue/warn/warning0; canonical ADR guards unchanged. Independent reviewer no findings. Removed1635401logicalB own runner/npmcache/replay before close, source identities reverified; proof `.waypost/experiments/wp21-codex-format-20261027/`. Previousf88dda1 CI40601234746 verified completed/success all Node20/22/24. No actual histories, accounting/schema/pricing change, native pilot or measured token/runtime/net saving. New full CI follows publication.

## Technical Notes

A malformed direct caller can still throw from toFixed or missing report fields. Preserve these errors rather than silently normalizing non-JSON inputs during source extraction.
