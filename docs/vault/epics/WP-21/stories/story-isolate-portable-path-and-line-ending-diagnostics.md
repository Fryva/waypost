---
type: story
id: "story-isolate-portable-path-and-line-ending-diagnostics"
epic: "WP-21"
title: "Isolate portable path and line ending diagnostics"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-23
updated: 2026-10-23
external_refs: {}
tags: []
code_refs: ["scripts/doctor.mjs", "scripts/doctor-portability.mjs", "tests/doctor-portability.test.mjs", "tests/presence.test.mjs", "docs/how-it-works.md", "docs/vault/adr/0007-shared-vault-presence.md"]
specs: []
started_at: "2026-10-23T18:22:13.585Z"
closed_at: "2026-10-23T18:27:48.069Z"
plan_updated_at: "2026-10-23T18:22:13.585Z"
---

# Isolate portable path and line ending diagnostics

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Portable path and line-ending checks sit inside the 84046-byte Doctor. Give
this independent concern a focused file without changing diagnostics or repairs.

## Decomposition

- [x] Move the literal cross-OS block and private finding factory.
- [x] Preserve public bindings/callers and update source/ADR/epic pointers.
- [x] Verify predicates, frozen CLI/fix parity, packaging and independent review.

## Implementation Plan

Fresh planner at 0392a39 identified the exact block from Cross-device / cross-OS
checks through checkLineEndings, stopping before Presence and leases. Move it
literally to scripts/doctor-portability.mjs, with existsSync/readFileSync/join
imports and exact private finding copy. Doctor imports/re-exports identical two
bindings; all callers, shared-state, merge-driver and applyFixes remain unchanged.
No import cleanup. Keep cfg parameters, string/object entries, per-segment checks,
reason deduplication, order, toLowerCase and rel.length >180. Preserve no-Git,
swallowed attributes read errors, first matching policy and current eol= regex.

New env-first tests cover complete findings, frozen inputs, export identity and
line-ending fixtures (no Git, missing/unreadable attrs, bare policy, LF/CRLF,
any current eol= match, multiple policy lines). No invalid real Windows filenames.
Keep presence tests' public entry and repair assertions unchanged. Reconstruct
all original Doctor bytes; compare frozen full CLI JSON/text/stderr/exits and
--fix output/attributes across missing/bare/complete policy states on the same
owned temporary project. Bind heavy selected run including existing repair and
child-process env protection to source hashes/log. Check package inclusion.
Update docs pointer, parent footprint and ADR-0007 code_refs only; ADR-0011 glob
already covers new module. No new decision/policy/dependency/model/pilot/budget.

## Acceptance Criteria

- [x] Exact moved block/factory, same two public bindings and unchanged callers; full baseline Doctor reconstructs byte-for-byte. — evidence: block-before.txt, factory-before.txt, measurement.json, tests/doctor-portability.test.mjs.
- [x] Complete findings/order/input semantics, line-ending edge cases and existing repairs remain compatible; frozen CLI JSON/text/stderr/exits/fix and attributes match. — evidence: cli-before/after.json, measurement.json, tests.log.
- [x] Heavy targeted/protection checks, package inclusion and independent review pass; report focused and combined bytes without native-token/runtime savings claims. — evidence: validation.json, tests.log, pack-proof.json, Final Summary.

## Final Summary

Doctor shrank from 84046 to 80638 UTF-8 bytes; focused module is 3862 bytes,
combined production growth is 454 bytes. Exact literal block/factory and whole
baseline reconstruction verified. Frozen CLI JSON/text/stderr/exits, --fix output
and resulting attributes match for missing/bare/complete policy. Both public ESM
bindings/callers preserved. Existing presence expectations remain unchanged.

Heavy selected run across ten files: 84 passed, zero failed/skipped, including
four new portability tests, existing repair branches and child env protection.
Package dry-run contains all six Doctor modules. Baseline full CI39995556265
passed Node20/22/24; the new commit's full CI is separate. Two new footprint
warnings were resolved by adding the story's existing test/ADR paths to parent
code_refs only after tests; production/test identities are unchanged.
No native-token/runtime/workflow savings measured. Independent reviewer: ship, no findings. Verified 16 baseline, 18 tested/final
and ten review-snapshot hashes, reconstruction, binding identity, CLI/fix snapshots,
log and package manifest.

## Technical Notes

Mechanical extraction under ADR-0008. No change to Windows naming rules,
first-match attributes policy, eol= acceptance, read-error handling or repairs.

## Dependencies

- Accepted ADR-0007, ADR-0008 and ADR-0011.

## Attachments

- Evidence: .waypost/experiments/wp21-doctor-portability-module-20261023/
(source-before/tested/after.json, block-before.txt, factory-before.txt, measurement.json,
cli-before/after.json, validation.json, tests.log, pack.json, pack-proof.json,
baseline-ci.json, doctor.log, next.log). Owned replay fixture and npm cache removed.

---

*Last updated: 2026-10-23*
