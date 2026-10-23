---
type: story
id: "story-isolate-story-and-epic-lifecycle-diagnostics"
epic: "WP-21"
title: "Isolate story and epic lifecycle diagnostics"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-23
updated: 2026-10-23
external_refs: {}
tags: []
code_refs: ["scripts/doctor.mjs", "scripts/doctor-lifecycle.mjs", "tests/doctor-lifecycle.test.mjs", "tests/predicates.test.mjs", "docs/how-it-works.md"]
specs: []
started_at: "2026-10-23T23:41:09.385Z"
closed_at: "2026-10-23T23:45:39.487Z"
plan_updated_at: "2026-10-23T23:41:09.385Z"
---

# Isolate story and epic lifecycle diagnostics

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Move story/epic completion diagnostics out of the 61955-byte Doctor into a
focused pure module, preserving all current policies and public imports.

## Decomposition

- [x] Move literal lifecycle block and private finding copy.
- [x] Preserve bindings/callers and update source pointers.
- [x] Verify frozen CLI, tests, packaging and independent review.

## Implementation Plan

Fresh planner at d1cd9a5 identified one block: Fence/inline-code comment through
linesOutsideFences/checkStoriesAndEpics/checkLifecycleGates, stopping before
Suggestion for existing binds. Move it literally to scripts/doctor-lifecycle.mjs
with exact private finding copy. Import existing isLegacyStory/sectionOf/
evidenceSuffixRe/stripCodeSpans from lib; remove only these four imports in Doctor.
Doctor imports/re-exports two original bindings and retains guarded-loop positions.

Preserve unconditional basic acceptance/review/epic checks versus policy/legacy
exemption only in lifecycle gates. Preserve stripCodeSpans versus raw fenced-line
handling, registry-call timing, status vocabulary/case, ordering and pluralization.
No policy/schema/API/dependency/cap/model/pilot/budget change; no new ADR needed.

New env-first tests: two binding identities, complete findings/frozen inputs,
policy missing/off/on/true, legacy/non-done, EN/RU/CJK headings/evidence, code
fences/inline code, missing plan/summary/date, reviewed without reviewed_at and
done epic with all three child story shapes. Keep existing predicate/locale/CLI
expectations. Capture literal block/factory, reconstruct complete baseline bytes,
and compare full CLI JSON/text/stderr/exits plus all file hashes on identical
off/on/legacy/localized fixtures. Run affected tests including child-process env
protection through heavy admission; retain source/log hashes and package proof.
Update docs/parent pointers; ADR-0011 glob already covers the new file.

## Acceptance Criteria

- [x] Literal block/factory, two identical public bindings and unchanged callers; full baseline reconstructs byte-for-byte. — evidence: block-before.txt, factory-before.txt, measurement.json, tests/doctor-lifecycle.test.mjs.
- [x] Basic and gated/legacy/localized/fenced findings retain order and semantics; frozen CLI matches without file mutation. — evidence: cli-before/after.json, readonly-before/after.json, tests.log.
- [x] Heavy targeted/protection checks, package inclusion and independent review pass; focused/combined sizes reported without native-token/runtime savings claims. — evidence: validation.json, pack-proof.json, Final Summary.

## Final Summary

Doctor: 61955 -> 58181 UTF-8 bytes; focused module 4147 bytes; combined growth 373 bytes.
Block/factory match literally; complete baseline reconstructs byte-for-byte.
Two public bindings and guarded-loop positions remain unchanged. Frozen CLI
JSON/text/stderr/exits match across off/on/legacy/localized cases (7/10/7/10
findings); all fixture-file hashes stay unchanged during every diagnostic pass.

Heavy selected validation across twelve files: 108 passed, zero failed or skipped, including
six new tests and existing lifecycle/locale/legacy/CLI/env regressions. Package
includes all nine Doctor modules. Doctor: zero issues, three known warnings; next: exit 0.
Baseline full CI 40009897153 passed Node 20/22/24; new full CI is separate.
No native-token/runtime/workflow savings measured. Independent reviewer: ship, no findings. Verified 18 baseline, 20 current and
9 review-snapshot hashes, literal reconstruction, two public bindings, 28 fixture
file hashes, full CLI parity, validation log and package manifest.

## Technical Notes

Mechanical extraction under accepted ADR-0008; upstream lifecycle contracts remain.

## Attachments

- Evidence: .waypost/experiments/wp21-doctor-lifecycle-module-20261023/
(source-before/after.json, block-before.txt, factory-before.txt, measurement.json,
cases-inputs.json, cli-before/after.json, readonly-before/after.json, tests.log,
validation.json, pack.json, pack-proof.json, baseline-ci.json, doctor.log, next.log).
Owned replay fixture and npm cache removed.

---

*Last updated: 2026-10-23*
