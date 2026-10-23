---
type: story
id: "story-isolate-artifact-integrity-checks-without-changing-diagnostics"
epic: "WP-21"
title: "Isolate artifact integrity checks without changing diagnostics"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-23
updated: 2026-10-23
external_refs: {}
tags: []
code_refs: ["scripts/doctor.mjs", "scripts/doctor-integrity.mjs", "tests/doctor-integrity.test.mjs", "tests/scripts.test.mjs", "docs/how-it-works.md", "docs/vault/adr/0009-artifact-integrity-checks.md"]
specs: []
started_at: "2026-10-23T15:43:28.501Z"
closed_at: "2026-10-23T15:51:13.653Z"
plan_updated_at: "2026-10-23T15:43:28.501Z"
---

# Isolate artifact integrity checks without changing diagnostics

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

The three ADR-0009 checks live inside the 101158-byte Doctor script. Give them
one focused source module without changing field readers, resolver, severity,
review policy, parent-footprint semantics or their existing public entry points.

## Decomposition

- [x] Move three literal check bodies, private constants and exact helper copies.
- [x] Preserve public bindings/callers and document the focused source.
- [x] Compare real CLI behavior, run targeted checks and independently review.

## Implementation Plan

Create scripts/doctor-integrity.mjs for checkCodeRefs, checkSupersedes and
checkAcceptanceGate, retaining their complete literal bodies and comments.
Move REF_ANNOTATION and REVIEW_UNANSWERED; add exact local copies of finding and
epicIdOf (original helpers remain for other Doctor checks). Only imports:
node:fs existsSync, node:path join, and existing lib listOf/refsOf/resolveLinkTarget.
No alternate reader/resolver, dependency injection or cycle. Doctor imports and
re-exports the same three bindings, removes only the unused refsOf import, and
keeps all callers in place. Other checks, orchestration, CLI and guards unchanged.

Add source/test code_refs to ADR-0009 and the parent epic, plus a short docs pointer.
ADR-0009 has no executable selectors; ADR-0011 already covers scripts/doctor*.mjs,
so no policy/selector changes are needed. Preserve prefix-based subset checks,
status vocabulary and accepted review-answer behavior literally.

Keep existing integration expectations and add public-binding identity checks.
Add focused golden cases for custom nested epic path and all three story shapes,
annotations/statuses, scalar supersedes through real parsed frontmatter/shared
resolver, acceptance policy and input immutability. Capture complete source blocks
and helpers; reverse the move to recover the full baseline Doctor byte-for-byte.
Capture real CLI JSON/text/exit on a retained temporary vault before/after the
move, then remove the owned temporary fixture. Verify package inclusion and run
focused Doctor/CLI checks through heavy admission with exact source/log hashes.

## Acceptance Criteria

- [x] Three checks/constants/helpers move literally, old exports remain identical ESM bindings and full baseline Doctor source is recoverable byte-for-byte. — evidence: literal block/helper equality, complete reverse reconstruction and three public-binding assertions.
- [x] Existing semantics and JSON/text/exit remain compatible, including shared supersede resolution and nested-layout story footprints; no input mutation is introduced. — evidence: exact real CLI JSON/text/stderr/exit equality on the same frozen vault, four focused tests and unchanged integration expectations within 64/64 tests.
- [x] Focused/integration checks, packaging and independent review pass; focused/combined source sizes are reported without native-token or runtime savings claims. — evidence: 64/64 tests, package manifest, final 14-source hash mapping/comment equivalence proof and independent reviewer ship confirmation without remaining findings.

## Final Summary

Three ADR-0009 checks now live in scripts/doctor-integrity.mjs with the same
shared lib readers/resolver. Moved blocks total 8543 UTF-8 bytes; all bodies,
comments and constants are literal copies, as are private finding/epicIdOf
helpers. Doctor retains its helpers for other checks, its original callers,
and three public exports as identical bindings. Only unused refsOf import was
removed. Complete reverse reconstruction restores e05b79e Doctor byte-for-byte.
ADR-0009 gains source/test pointers only; its policy and ADR-0011 are unchanged.

Focused module: 9086 UTF-8 bytes versus the old 101158-byte containing file.
Doctor is now 92793 bytes; combined source 101879 bytes (721 more). Exact-symbol
reads may not improve. No native-token/runtime/workflow/quota savings inferred.

Real separate CLI processes before/after on the same temporary vault produced
identical JSON, text, stderr and exit codes: JSON 0, text 1, seven full findings.
The owned 464-byte fixture was removed; inputs and outputs remain as evidence.
64/64 selected checks passed through heavy admission on Node 25.6.1/macOS,
including four new focused cases and all prior 60 guards/renderer/Doctor/CLI
checks. No local full suite or Node 20/22/24 matrix claim. Packaging includes all
four Doctor modules; temporary pack cache removed (1524629 bytes). Live doctor
exit 0, no issues; two old WP-18 warnings plus sandbox process-table limitation.
Next exit 0. Initial independent implementation review: ship with one nit.
The two-line code-map comment was restored before checkCodeMap. This moved
112 bytes of comments only; no executable text or other checked input changed.
The original 64-pass receipt is retained, with exact checked-to-final source hash
mapping, comment-only equivalence proof and final syntax checks. Heavy tests were
not repeated for the comment move. Final independent review: ship, no remaining findings. Reviewer verified the exact 112-byte comment move, all 14 final source hashes, unchanged executable text/other 12 inputs and byte-identical full baseline reconstruction.

## Technical Notes

Mechanical extraction under accepted ADR-0008/0009; no new architecture, flags,
dependencies, model settings, native pilots or historical budget changes.

## Dependencies

- Accepted ADR-0008 and ADR-0009; ADR-0011 coverage retained automatically.

## Attachments

- `.waypost/experiments/wp21-doctor-integrity-module-20261023/`: saved blocks/helpers, source hashes, complete CLI fixture/before/after snapshots, measurements, full test log and manifest, package check and consistency logs (retained local evidence).

---

*Last updated: 2026-10-23*
