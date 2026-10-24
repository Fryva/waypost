---
type: story
id: "story-isolate-checkout-identity-and-path-normalization-behind-the-presence-facade"
epic: "WP-21"
title: "Isolate checkout identity and path normalization behind the presence facade"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-24
updated: 2026-10-24
external_refs: {}
tags: []
code_refs: ["scripts/presence.mjs", "scripts/presence-checkout.mjs", "tests/presence-checkout.test.mjs", "tests/presence.test.mjs", "tests/cleanup.test.mjs", "tests/limit.test.mjs"]
specs: []
started_at: "2026-10-24T20:39:06.501Z"
closed_at: "2026-10-24T20:44:42.040Z"
plan_updated_at: "2026-10-24T20:39:06.501Z"
---

# Isolate checkout identity and path normalization behind the presence facade

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Make path normalization and shared-checkout identity readable independently while preserving lease paths, worktree classification and cleanup protection.

## Decomposition

- [x] Extract literal path and checkout identity blocks.
- [x] Preserve five public bindings, namespace27 and all callers.
- [x] Verify exact replay, affected safety contours and independent review.

## Implementation Plan

Independent planner selected lines140-166 and312-369 at base8846703. Move the path helpers and sharedTree/advice/formatter to presence-checkout.mjs with direct path/os/lib/storage/liveness imports. Keep normPath/underPath private; facade imports vaultRel/vaultOffset and re-exports five original names. No backimport, duplicate cache or policy edits. Preserve lexical path spelling, exact versus contain behavior, current process.platform, sibling classification before host filtering, retired vault-offset signal, supplied-view bypass of peers but not storage/Git probes, and persist forwarding. Freeze path/API/identity and real-Git heartbeat/lease/observation facts plus CLI advice with fixed inputs; add env-first tests; run existing presence/process/storage/liveness/commit/doctor/cleanup/limit contours through heavy admission on Node24. Record source/command/log identities and obtain fresh review before close.

## Acceptance Criteria

- [x] Current sources reconstruct baseline SHA256 33aa95d8e397fe75122d550492ed22003f9806ad423b75e501ec647551668451; facade and focused module below24000B. — evidence: .waypost/experiments/wp21-presence-checkout-module-20261024/verify-move.py, move-proof.json.
- [x] Five bindings and namespace27 remain compatible; private helpers, path normalization and runtime environment timing unchanged. — evidence: .waypost/experiments/wp21-presence-checkout-module-20261024/checkout-before/after.json and tests-attempt-1.log.
- [x] Frozen path/checkout/advisory and integration results/contents match; shared checkout, sibling worktree and containment remain distinct. — evidence: .waypost/experiments/wp21-presence-checkout-module-20261024/checkout-before/after.json, cli-before/after.json, flow-before/after.json.
- [x] Focused and existing safety checks pass through source-bound heavy receipts; package/syntax pass; doctor zero issues/warnings. — evidence: .waypost/experiments/wp21-presence-checkout-module-20261024/validation.json, source-tested.json, tests-attempt-1.log, pack-proof.json, doctor.json.
- [x] Independent reviewer verifies criteria before close/commit. — evidence: .waypost/experiments/wp21-presence-checkout-module-20261024/fresh-context reviewer: ship, all five criteria met.

## Final Summary

Literal path/checkout blocks moved to presence-checkout.mjs (5536B), facade25831->20690B, combined+395B. All five presence modules now below24000B (facade20690/process7519/storage5967/liveness10031/checkout5536), total49743B. Five public bindings and namespace27 preserved; normPath/underPath remain private. No heartbeat/lease/cleanup policy changes.

Actual current modules reconstruct baseline SHA256 33aa95d8e397fe75122d550492ed22003f9806ad423b75e501ec647551668451 exactly. Frozen path/function/API/view/persistence results, actual sessions advisory stdout/stderr/exit and real-Git heartbeat/lease/observation dual-write/read/clear results and contents match. Supplied view bypasses peers but not runtime storage/Git probes; exact/contain/platform/sibling precedence and retired vault-offset behavior preserved.

Source-bound nine-file heavy Node24.21.0 run261total/259pass/0fail/2existing Linux-only macOS skips,exit0,53.938s; all ten new env-first tests passed. Package includes all five modules, syntax checks pass and doctor0issues/0warnings. Fresh reviewer ship/no findings verified27current/25baseline/12dirty identities, manifest/log/pack SHA, reconstruction and live fixture contents. Complete evidence: .waypost/experiments/wp21-presence-checkout-module-20261024/ (validation.json, full log, manifests, verify-move.py, replay pairs, packaging and doctor receipt). Owned temporary replay/scripts/npmcache removed after review; receipts retained. New remote CI pending; no native-token/runtime/workflow saving measured and no native pilot/budget change.

## Technical Notes

No measured native-token savings claimed and no new native pilot/budget. Keep diagnostic receipts and remove owned temporary fixtures/cache after review.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-24*
