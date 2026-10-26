---
type: story
id: "story-isolate-atomic-file-replacement-and-orphan-cleanup-behind-the-library-facade"
epic: "WP-21"
title: "Isolate atomic file replacement and orphan cleanup behind the library facade"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-26
updated: 2026-10-26
external_refs: {}
tags: []
code_refs: ["scripts/lib.mjs", "scripts/lib-atomic-write.mjs", "tests/lib-atomic-write.test.mjs", "tests/helpers/atomic-write-scenarios.mjs", "tests/predicates.test.mjs", "docs/how-it-works.md"]
specs: []
started_at: "2026-10-26T15:34:54.398Z"
closed_at: "2026-10-26T16:27:54.828Z"
plan_updated_at: "2026-10-26T15:34:54.398Z"
---

# Isolate atomic file replacement and orphan cleanup behind the library facade

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Reduce the source an agent must read for atomic file replacement without changing its filesystem or cross-host safety contract. Extract the existing literal helper block behind the unchanged library facade. This is mechanical work under the accepted WP-21 module boundary; no new durability policy or native-token pilot.

## Decomposition

- [x] Freeze safe baseline and source identities.
- [x] Move literal block; add focused safety and call-time tests.
- [x] Compare behavior, run affected consumers, independent review and close.

## Implementation Plan

Move the complete 3102-byte atomic-write block from scripts/lib.mjs into scripts/lib-atomic-write.mjs with direct Node fs/path/os imports. Directly re-export writeFileAtomic and hostTag; retain hostname/unlinkSync needed elsewhere, remove only unused basename/renameSync. No caller changes, caches, fsync, retries, mkdir, validation or fallback changes. New leaf budget: 5000 UTF-8 bytes. Verify inverse reconstruction and export namespace/name/arity.

Before edits freeze baseline behavior using only owned temporary fixtures. Replace process.kill with a never-forwarding spy accepting only known fake fixture PIDs and signal zero. Install explicit JavaScript PID getter before import and assert two positive readbacks (native data-descriptor mocks are not portable). Stub hostname at call time. Guard every write/unlink/rename path within the owned fixture root; both rename arguments must be checked. Protect live, foreign-host, self/zero and malformed temp files and verify content/inode/dev/mtime. Reset only intended writer outputs and allowed dead fixture orphans between baseline and current runs.

Compare exact operation order, final bytes and error identity for success, sweep:false, readdir failure, orphan unlink failure, partial-write failure, rename failure and cleanup failure. Preserve original errors even when cleanup fails, sweep-before-temp ordering, own-host-only ESRCH deletion, EPERM/other-errors retention and call-time hostname/PID behavior. Add import-time action guards and facade alias/read-budget tests. Existing predicates plus CLI/reconcile/generated-view and session/commit integration suites exercise actual consumers; run through the heavy gate with a source-bound log and runtime identity. Run package dry-run, syntax, doctor and independent reviewer before completion. Full Node 20/22/24 CI follows publication; report pending status honestly.

## Acceptance Criteria

- [x] Literal extraction, facade API and helper function text preserved; leaf <=5000 bytes and no facade cycle — evidence: comparison.json and api-before/api-after.json under .waypost/experiments/wp21-lib-atomic-write-20261026/; independent reviewer verified literal/inverse proof and namespace100.
- [x] Safe before/after replay preserves filesystem order, bytes/errors and protected fixture identities; no real foreign PID probes — evidence: baseline.json/current.json, 10 scenarios/121 operations/81 protected identities, Node24.22.1; independent reviewer verified live fixtures.
- [x] Focused and affected integration tests pass with source-bound runtime receipts; package and doctor succeed — evidence: validation.json/tests.tap, Node24.22.1, 282pass/0fail/2 expected Linux-only skips, exit0, 62257.695125ms; stable runtime and248 source identities. Package includes leaf; doctor0/0.
- [x] Independent reviewer approves exact diff and evidence; docs describe actual boundary and measurement limits — evidence: independent final ship with no findings, verified248 source/11dirty hashes and log/manifest/runner/argv; docs/how-it-works.md.

## Final Summary

Extracted the literal3102B atomic helper block into scripts/lib-atomic-write.mjs with direct Node imports and unchanged facade exports/callers. Facade44396 ->41340B; leaf3270B (budget5000); combined source +214B. Public namespace100/name/arity/function text and whole-facade inverse remain exact. Own-host-only ESRCH sweep, live/foreign/self/zero/malformed retention, native ordering, same error object on write/rename/cleanup failures, and call-time hostname/PID semantics remain unchanged.

Frozen safe replay matches10scenarios/121operations and81protected content/inode/dev/mtime identities. No real PID probes/signals; all mutation paths owned and guarded, both rename arguments checked, swallowed forbidden attempts detected. Tests cover success, sweep:false, read/sweep/write/rename/cleanup errors, Buffer bytes and missing parent. Test-only expected paths use join() for platform separators; this is not native Windows coverage.

Final six-file admitted contour: Node24.22.1,284total/282pass/0fail/2unchanged Linux-only proc tick-count skips,exit0,62257.695125ms. Binary SHA stable,248source hashes checked before/after; full log/runner/argv/manifest receipts retained. Earlier passing run before the join() test fix retained separately. Initial capacity refusals (2m and10m waits,exit75) launched no tests; later normal admission succeeded without bypass. Package dry-run, syntax/diff-check and Doctor0issues/0warnings pass. Independent final reviewer ship/no findings after verifying248source/11dirty hashes and live protected fixtures.

Evidence: .waypost/experiments/wp21-lib-atomic-write-20261026/. Own fixtures/npmcache/replay runner removed 1605143logical bytes after final review; runner/source retained as text. BaselineCI40345225902 passed Node20/22/24; new full CI follows publication and is not claimed passed here. No native token/quota/runtime/net-saving measurement or pilot.

## Technical Notes

ADR-0007 forbids sweeping another host's temporary file. Only same-host ESRCH permits sweep deletion; other errors leave the fixture untouched. Source comment mentions an atomic-regeneration spec absent from the current vault; retain the comment without inventing a spec or changing policy. This extraction reduces per-topic source size; total source and actual token spend are separate quantities.

## Dependencies

Accepted ADR-0008 and the accepted thin CLI/module boundary; existing atomic helper behavior.
