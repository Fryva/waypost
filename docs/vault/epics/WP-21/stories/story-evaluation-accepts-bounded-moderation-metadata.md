---
type: story
id: "story-evaluation-accepts-bounded-moderation-metadata"
epic: "WP-21"
title: "Evaluation accepts bounded moderation metadata"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-18
updated: 2026-10-18
external_refs: {}
tags: []
code_refs: ["scripts/codex-evaluation-surface.mjs", "scripts/team-transport.mjs", "tests/evaluation-transport.test.mjs"]
specs: []
started_at: "2026-10-18T18:49:44.922Z"
closed_at: "2026-10-18T22:44:15.178Z"
plan_updated_at: "2026-10-18T18:49:44.922Z"
---

# Evaluation accepts bounded moderation metadata

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Revision-2 C1 stopped on a version-documented `turn/moderationMetadata` notification. Support only this bounded opaque notification in the separate evaluation surface. Preserve the failed C1 receipt, original no-exec surface, native counters, broker boundaries and unprobed catalog status. No inference or budget mutation is part of this fix.

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [x] Bind method and finite frame/count/total-byte caps in the evaluation definition digest. — evidence: `CODEX_EVALUATION_SURFACE.moderation_limits` and `turn_methods`; final 65/65 fixture run.
- [x] Verify owned, closed-schema notifications and all invalid/late/over-limit paths. — evidence: final source-bound 65/65 affected fixtures.
- [x] Run affected fixtures and independent reviewer; retain runtime limitations. — evidence: `final-verification.json`, reviewer verdict `story closed / commit`; live limitations below.

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

1. Reuse `evaluationFrameGuard` after callback/terminal checks and declared method admission; validate notification params and thread/turn, accept any JSON metadata without interpreting it.
2. Pass actual UTF-8 JSON-line bytes from the parser to the evaluation guard (including whitespace, escapes and CR, excluding LF); require positive safe-integer evidence without normalized fallback. Hash this metric and caps of 65536 bytes/frame, 262144 bytes/turn and 16 frames in the evaluation definition. Duplicates consume both budgets; failures use sticky accounting invalidation.
3. Extend existing transport fixture and direct guard cases, including UTF-8 exact boundaries, total/count overflow, late stop/drain and C3-first violations. Keep old surface and budget/receipt behavior unchanged.
4. Focused tests through the heavy gate, then a separate reviewer. Runtime revalidation needs a separately approved and preregistered protocol.

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [x] Owned before-terminal metadata with exact documented params is opaque and bounded; permits no callback/source side effect or counter change. — evidence: `tests/evaluation-transport.test.mjs` opaque/accounting/broker cases; 65/65 final fixtures.
- [x] Malformed, unbound/foreign, server-request, late and byte/count-limit cases invalidate accounting even after an expected C3 tool violation. — evidence: moderation invalid/late/C3, byte-evidence and wire-boundary fixtures in final run.
- [x] Caps/method are definition-hashed only for evaluation; old no-exec and failed C1 evidence remain unchanged. Focused fixtures and independent reviewer verify the fix. — evidence: 65/65 evaluation + old no-exec transport fixtures, unchanged 385 source hashes, independent final verdict `story closed / commit`.

## Final Summary

Added only bounded owned opaque moderation notifications to the separate evaluation surface. The parser forwards actual received UTF-8 JSON-line bytes before LF, including whitespace, escapes and CR; missing/invalid evidence fails closed. Method, byte metric and finite frame/aggregate/count caps are definition-hashed. Old no-exec behavior, native counters, broker boundaries, old C1 evidence and unprobed catalog remain unchanged.

Affected suites passed 65/65 with no failures/skips on the exact 385-input snapshot. Fresh reviewer verdict `story closed / commit`, no open findings. This is macOS fixture verification, not live compatibility, cross-OS/full-suite validation or measured quality/savings. A separately authorized/frozen protocol and fresh controls are still required before inference; proposed revision 3 stays draft and the full pilot remains budget-blocked.

## Technical Notes

### Verification blocked by machine admission (2026-10-18)

The initial two changed `.mjs` files passed `node --check`; `git diff --check` passes. The affected fixture command `waypost run --heavy --wait 10m -- node --test tests/evaluation-transport.test.mjs tests/codex-surface-transport.test.mjs` waited for CPU capacity and exited 75 without starting tests. No behavior pass/count exists; syntax checks do not satisfy the acceptance criteria. The story remains in-progress and is not close/commit-ready.

Retained local ignored evidence: `.waypost/experiments/wp21-moderation-20261018/{source-before.json,tests.log,verification.json}`. Initial manifest SHA256 `d445afa7c82df2156d850401a676fdf95636a83d7a026b0b99350c3414dddf58` binds 385 source/test inputs to base `22b9f78`; all hashes matched after the refused attempt. Full gate log SHA256 `a6276b81a4eae2911ba5ada1426261b26d1a16e5ba7ffcdedacb788e409121d9`. No native inference, cap/catalog mutation or historical receipt change occurred. Retry fixtures when resources permit; live controls additionally need the separate owner protocol decision.

<!-- Implementation hints, constraints, gotchas. -->

### Independent review correction (2026-10-18)

Fresh reviewer verdict `gaps remain / fix first` for the initial manifest: normalized `JSON.stringify` size lost received whitespace/escapes, and fixture execution was missing. Following a separate delta planner, the implementation now passes the actual JSONL Buffer length before LF from `processPeer` to the evaluation guard, requires byte evidence without fallback, and hashes the exact metric. Added noncompact/escaped, exact/over-limit, aggregate and split multibyte transport fixtures plus missing/invalid byte evidence cases. The old no-exec definition is unchanged; other listeners ignore the additive third byte-count argument. The initial manifest/log above do not verify this newer code. All three changed modules pass new syntax checks. Updated 385-input manifest SHA256 `ed121669fc5e6a282b6502792692eafc045a14f3ea5ae65337a3849a50dfdf3a` matched after a second gate attempt (`--wait 30s`), again refused exit75 without starting tests. Retained `source-wire-before.json`, `wire-tests.log` (SHA256 `14650bdd36c992a07daff9c21cf373bcd0df1c13f1b865d4638da0ce0e6cb76e`) and `wire-verification.json` in the same private directory. Independent delta review found the byte-gap fixed and no new code defects, with AC1/AC2 met statically. Final verdict remains `gaps remain / fix first` solely because affected fixtures did not execute; AC3 remains unverified. Do not commit/close until the two suites pass on a bound snapshot.

### Successful fixture verification and final independent acceptance (2026-10-18)

The admission-blocked states above are historical. Resources subsequently became available; `waypost run --heavy --wait 30s -- node --test tests/evaluation-transport.test.mjs tests/codex-surface-transport.test.mjs` completed exit0: 65 passed, 0 failed, 0 skipped. HEAD `22b9f781262b58e94a5072dd357edf9a4a5cb91f` and all 385 source/test hashes matched manifest `ed121669fc5e6a282b6502792692eafc045a14f3ea5ae65337a3849a50dfdf3a` before/after. Retained `.waypost/experiments/wp21-moderation-20261018/final-tests.log` SHA256 `6fecae1f320f51c650c2428919d3702bfba3e0b82306359c3e8bbd4d447c0cfd` and `final-verification.json` bind the result. Fresh final reviewer rechecked all hashes and the new evidence, returned `story closed / commit`, AC1–AC3 met, no open findings.

No new native pilot call, cap change or catalog registration. Budget readback remains cap250000, counted7520 assumed, reserved0, remaining242480; prior C1 remains failed with partial coverage. Reviewed revision-3 proposal SHA256 `3a2dbc8c575f546ae44c11a9776bd07644cc91d029ddc836f7c1422506a19510` authorizes no phase and claims no live compatibility or savings.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-18*
