---
type: story
id: "story-isolate-adr-guard-checks-without-changing-diagnostic-behavior"
epic: "WP-21"
title: "Isolate ADR guard checks without changing diagnostic behavior"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-23
updated: 2026-10-23
external_refs: {}
tags: []
code_refs: ["scripts/doctor.mjs", "scripts/doctor-guards.mjs", "tests/doctor-guards.test.mjs", "tests/scripts.test.mjs", "docs/how-it-works.md", "docs/vault/adr/0011-decisions-that-check-themselves.md"]
specs: []
started_at: "2026-10-23T15:26:48.887Z"
closed_at: "2026-10-23T15:35:44.835Z"
plan_updated_at: "2026-10-23T15:26:48.887Z"
---

# Isolate ADR guard checks without changing diagnostic behavior

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

ADR guards live inside the 108047-byte Doctor script. Move the existing checks
and their private helpers into a focused module, preserving diagnostic behavior
and the old public imports. This is a mechanical refactor under ADR-0008/0011,
not a new diagnostic architecture or source-budget policy.

## Decomposition

- [x] Move the complete guard block and preserve old ESM exports and one cache.
- [x] Keep the accepted non-execution guard covering both Doctor source files.
- [x] Add isolated boundary/compatibility tests, compare frozen behavior and review.

## Implementation Plan

Copy the complete Guards section (constants, glob matcher, projectFiles/_files,
lineOf and checkGuards) literally into scripts/doctor-guards.mjs. Add only stdlib
fs/path/child_process imports and an exact local copy of the five-line finding
factory. Keep the original factory for remaining Doctor checks. Import checkGuards
into Doctor for its unchanged caller and re-export all four old public names
without wrappers or a second cache. Do not change bodies, lazy file discovery,
Git/fallback behavior, size/count limits, errors, ordering or non-execution.

In accepted ADR-0011 add new source/test code_refs and mechanically widen only the
existing forbid selector from scripts/doctor.mjs to scripts/doctor*.mjs. Keep the
require selector on Doctor's unchanged check registration. Add new paths to the
parent epic footprint and a short source pointer in docs/how-it-works.md.

Retain the original guard regression through doctor.mjs. Add standalone module
checks for ESM binding identity/shared cache, explicit empty files, lazy discovery,
Git tracked/untracked/ignored files, fallback exclusions, file/count bounds,
non-execution and the widened ADR selector (safe and forbidden fixture source,
never executing it). Capture old source/section/factory hashes and frozen actual
findings/metadata/report. Independently compare baseline/new findings on fixed
fixtures, restore the complete Doctor source by reversing only import/re-export
and extraction, and compare frozen reports/exit policy. Run focused guards and
Doctor/CLI regressions through heavy admission with source/log hashes. Verify
new scripts are packaged. No native/token/runtime savings claims from byte sizes.

## Acceptance Criteria

- [x] Guard bodies, constants and cache move unchanged; old exports remain identical bindings, and remaining Doctor source restores byte-for-byte to baseline. — evidence: measurement.json, literal 7038-byte block/five-line factory equality, complete source reconstruction and public-export identity checks.
- [x] Guard finding content/order, Git/fallback and lazy discovery, file/count limits, JSON/text/exit and check-command non-execution remain compatible; ADR guard still covers the implementation. — evidence: three old/new fixture comparisons, six focused module tests and unchanged CLI regressions within 60/60 checks; safe/forbidden fixture for the widened ADR selector.
- [x] Focused and integration checks pass with independent review, package inclusion and honest focused/combined source measurements; no native savings inferred. — evidence: 60/60 heavy-gated tests, matching source/log identities, package manifest and independent reviewer ship verdict with no actionable findings.

## Final Summary

The complete 7038-byte Guards section moved literally into scripts/doctor-guards.mjs
with stdlib imports and an exact local copy of the finding factory. Doctor retains
its original caller and four public exports as identical ESM bindings; there is one
project-file cache. Reversing only the extraction and two import/export lines
restores all of Doctor byte-for-byte to 53a5165. The renderer is unchanged.
ADR-0011 now protects scripts/doctor*.mjs with the same forbid pattern and retains
the original registration require guard. No architectural policy changed.

Focused guard source is 7396 UTF-8 bytes versus the former 108047-byte containing
file. Doctor is now 101158 bytes; combined production source is 108554 bytes,
507 bytes more. Exact-symbol reads may not improve. No native-token, runtime,
whole-workflow or quota savings inferred from source sizes.

All three deterministic old/new fixture cases return identical complete findings
and rendered reports (8 findings each). Frozen actual-finding report unchanged.
60/60 targeted checks passed through heavy admission on Node 25.6.1/macOS:
six new module checks plus 54 Doctor/renderer/CLI checks. No local full suite or
Node 20/22/24 matrix claim. npm pack dry-run includes all three Doctor modules;
no dependency or packaging-policy changes. Temporary replay removed; temporary
pack cache removed (1521680 bytes); retained evidence is intentional.
Doctor exit 0, no issues; two old WP-18 warnings plus sandbox process-table
limitation. Next exit 0. Independent implementation review: ship, no actionable findings. Reviewer independently verified the exact block/factory, complete source reconstruction, four export identities, 8 baseline/10 current source hashes, test-log hash and package manifest.

The first measurement-only source reconstruction attempt failed because a literal
JavaScript replacement interpreted dollar-backtick text inside the extracted
source. It was corrected to callback replacement before fixture execution;
production sources were unchanged. The failed attempt is retained explicitly.

## CI follow-up: shared child-process environment

Full CI job 120503233651 (Node 24, commit e05b79e) reached 1974 passed,
1 failed, 3 skipped: the state-migration suite found that the new guard test
spawns Git without importing the shared tests/env.mjs. The same failure was
reproduced locally at 31f2fae. tests/doctor-guards.test.mjs now imports that module
first, setting the existing migration opt-out for its children. The protective
assertion and production modules are unchanged.

On macOS, complete state-migrate plus guard-module test files now pass on
Node 20.20.2, 22.23.3 and 24.22.0: each 43 passed, 0 failed, 2 platform skips
(45 total). This is a focused matrix, not a full-suite success claim. New CI
confirmation remains pending. The earlier 60-check result above remains a record
of its narrower original scope. Official runtime archives were SHA256 verified;
owned temporary runtimes/archives removed (469794877 bytes).

Evidence: `.waypost/experiments/wp21-ci-node24-20261023/` contains the failed CI
log, local failing reproduction, exact one-line fix identity, runtime provenance,
three complete logs/source-bound receipts and cleanup record. Independent bugfix
review: ship, no findings; all seven source hashes and logs verified. Production
code and budgets are unchanged by this fix.

## Technical Notes

No new CLI flags, dependencies, model changes, native pilots or historical budget
changes. Existing cache invalidation and symlink behavior are deliberately kept.

## Dependencies

- Accepted ADR-0008 and ADR-0011.

## Attachments

- `.waypost/experiments/wp21-doctor-guard-module-20261023/`: baseline section/factory/source hashes, frozen findings/metadata/report, old/new fixtures, measurements, test log/manifest, package check and proof-attempt record (retained local evidence).

---

*Last updated: 2026-10-23*
