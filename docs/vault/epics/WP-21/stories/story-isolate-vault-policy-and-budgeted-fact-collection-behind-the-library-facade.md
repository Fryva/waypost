---
type: story
id: "story-isolate-vault-policy-and-budgeted-fact-collection-behind-the-library-facade"
epic: "WP-21"
title: "Isolate vault policy and budgeted fact collection behind the library facade"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-26
updated: 2026-10-26
external_refs: {}
tags: []
code_refs: ["scripts/lib.mjs", "scripts/lib-vault-policy.mjs", "scripts/lib-vault-facts.mjs", "tests/lib-vault-policy.test.mjs", "tests/lib-vault-facts.test.mjs", "tests/predicates.test.mjs", "scripts/brief.mjs", "docs/how-it-works.md"]
specs: []
started_at: "2026-10-26T02:48:25.275Z"
closed_at: "2026-10-26T02:57:52.075Z"
plan_updated_at: "2026-10-26T02:48:25.275Z"
---

# Isolate vault policy and budgeted fact collection behind the library facade

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Separate the complete vault-policy store helper and budgeted fact collector into coherent leaves without changing filesystem policy, asynchronous behavior or the library facade. This continues WP-21.

## Decomposition

- [x] Freeze public namespace, policy outcomes/diagnostics/writes, deterministic async traces and real brief outputs.
- [x] Move two literal chunks with direct leaf dependencies and unchanged callers.
- [x] Pin policy/deadline/late-result/import/budget contracts, test and obtain independent acceptance.

## Implementation Plan

Move Vault-side policy→before Slug/numbering (2812 B) to lib-vault-policy.mjs with direct fs exists/read/write and path join. Five public functions stay literal, including plain writeFileSync writer; do not substitute atomic writes or merge reader defaults with fail-closed selfInstallOff. Move countFolder/gather→before Session identity (6470 B) to lib-vault-facts.mjs with fs exists/readdir/stat, fs-promises readFileAsync, path join; direct resources/vault-files/frontmatter/policy leaf imports only. Facade directly re-exports six bindings, removes async-read import, narrows resources to pluginRoot and vault-files to listEpicStories. No caches/state owners/cycles changed; headings remain literal. Freeze errors/stderr/writer bytes and legacy truth table; fake timer and controlled readFile schedules compare completion/timeout/partial/late resolutions/rejections and read/timer order, including post-return reference mutation. Real fixture brief default/full/JSON with fixed date and owned state; protect non-writer files and explicitly account for intentional policy writes. Prove full inverse facade and two chunks exact, namespace100/name/arity/AsyncFunction identity. Focused imports add no own actions; policy<=4500 B, facts<=9000 B. Relevant predicates/scripts/harness/brief coverage via heavy slot, launch runtime/binarySHA/source manifest, package and Doctor0/0, independent reviewer. No new ADR/pilot or measured saving claim.

## Acceptance Criteria

- [x] Two chunks literal, six bindings/name/arity/AsyncFunction and namespace100/caller imports preserved; no cycle/new shared state or dependency. — evidence: `chunks.json`, `wiring.json`, `source-after.json`.
- [x] Policy reads/errors/stderr/writer bytes/legacy rules and facts counts/order/deadlines/read traces/late mutation match frozen baseline and brief consumers; protected fixture files unchanged. — evidence: `api-before.json`, `api-after.json`, focused tests.
- [x] Imports add no I/O/probes/writes/timers; original explicit policy writer preserved, leaf ceilings and inverse/source-size/package proofs retained. — evidence: `comparison.json`, `pack.json`, focused import tests.
- [x] Focused and relevant existing tests pass through heavy admission, Doctor0/0 and independent reviewer approves. — evidence: `validation.json`, `tests-attempt-1.log`, `doctor.json`, `review-final.json`.

## Final Summary

Independent reviewer: ship, no findings; all four acceptance criteria met. Two literal chunks2812+6470 B moved into vault-policy and vault-facts leaves. Six bindings/names/arities, AsyncFunction and namespace100/caller imports preserved; direct leaf dependencies, no cycle/new shared state. Headings/cache unchanged.

Frozen replay matches14policy cases,40legacy cases,6write cases,8fact cases and317filesystem operations. Deadline/read order, partial completion, late resolution/rejection and post-return mutation remain unchanged; three actual brief default/full/JSON outputs and24protected live file identities match. Intentional writer bytes/errors are recorded separately and writer restored. Plain writer remains non-atomic. Full inverse facade proof exact.

Policy2914 B (budget4500), facts6897 B (budget9000); facade61875→52655 B, combined+591 B. Nine-file admitted test run371pass,0fail/skip,99118.890875ms Node24.22.1 logged at startup with stable binary SHA. Package contains both leaves, syntax/diff-check clean and Doctor0issues/0warnings. Reviewer verified24current/17baseline/12dirty hashes and source-bound log/runner/argv. Evidence: `.waypost/experiments/wp21-lib-vault-facts-20261026/` (comparison/validation/review-final, before/after replay, source manifests and tests-attempt-1.log). Owned fixtures/npmcache/replay runner removed:1593419 B; source retained as text. No native-token, quota, runtime or net-saving measurement.

## Technical Notes

The deadline starts after synchronous enumeration/layout/policy. Readme and story families run concurrently but each reads sequentially. After timeout, returned folders/inFlight references can still mutate when reads settle, and timeout status stays set. Preserve this behavior and rejection handling; no cancellation/freeze. Policy reader warns and defaults; selfInstallOff fails closed; writer remains non-atomic.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-26*
