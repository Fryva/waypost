---
type: story
id: "story-separate-project-matching-and-git-evidence-from-the-size-scanner"
epic: "WP-21"
title: "Separate project matching and Git evidence from the size scanner"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-24
updated: 2026-10-24
external_refs: {}
tags: []
code_refs: ["scripts/sizes.mjs", "scripts/sizes-rules.mjs", "scripts/sizes-git.mjs", "tests/sizes-rules.test.mjs", "tests/sizes-git.test.mjs", "tests/sizes-measure.test.mjs"]
specs: []
started_at: "2026-10-24T17:19:20.818Z"
closed_at: "2026-10-24T17:24:56.742Z"
plan_updated_at: "2026-10-24T17:19:20.818Z"
---

# Separate project matching and Git evidence from the size scanner

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Reduce the context needed to inspect matching and Git evidence without changing scanner policy or the public API. Continue the accepted context-economy work in WP-21.

## Decomposition

- [x] Extract matching and ownership into sizes-rules.mjs.
- [x] Extract Git evidence and subprocess constants into sizes-git.mjs.
- [x] Verify compatibility, guard boundaries and deterministic replay.

## Implementation Plan

The independent planner identified literal ranges 72-231 and 250-417 at base 60bd660. Move these into dependency-leaf modules. Re-export only the original public bindings. Preserve owner precedence, mutable regex state, clean_argv identity, conservative Git fallbacks, literal paths and every budget debit. Keep all three guard selectors and expressions. Add env-first focused tests and extend the existing guard sentinel. Replay frozen project/cache/Git fixtures, run broad checks, record source identities and obtain an independent reviewer pass.

## Acceptance Criteria

- [x] Facade and each new module are below 24,000 bytes; facade public namespace remains the original eleven names.
- [x] Extraction reverses to baseline SHA256 5422d73e7c25e4872d72a906bec06ed0587c18e2e954d3d32c9aea19b208dd1c; policy, budgets and guards remain unchanged.
- [x] Frozen measurements, CLI output, file identities and Git evidence match before and after.
- [x] Focused and existing scanner/cleanup/registry/discovery/migration/guard tests pass through heavy admission; doctor reports no issues or warnings.
- [x] Independent review verifies acceptance and source-bound evidence.

## Final Summary

Literal extraction completed: facade 40,534 -> 23,798 B; rules 8,243 B; Git 8,989 B, combined +496 B. Original eleven-name API and four moved public bindings remain compatible. Current modules and facade reverse exactly to baseline SHA256 5422d73e7c25e4872d72a906bec06ed0587c18e2e954d3d32c9aea19b208dd1c. Frozen measurement/CLI/cleanup/file/Git snapshots match on the same fixture paths and identities.

Evidence for all criteria: .waypost/experiments/wp21-sizes-project-support-20261024/ (verify-move.py, move-proof.json, facts/files/git-facts before/after, source-tested/source-after/review-input manifests, validation.json, pack-proof.json, doctor-final.json). Eleven new env-first tests cover ownership precedence, regex and argv identity, Git failures and literal paths. The existing sentinel now proves all three unchanged scanner guards across all four files; both cleanup guards remain unchanged.

The first heavy-gated attempt had one fixture error: git add treated brackets as a pattern. Fixed only the new fixture with literal pathspecs. The complete second ten-file contour passed 323/325, zero failures, two existing state-migrate platform skips, exit 0 in 25.985 seconds on Node 25.6.1/macOS. Source-bound full log SHA256 0b89aaff49cc351f30666ba878f1ecf96a5e2fa46fe4535fb90579b882fc63ee. Package dry-run includes all four modules; syntax checks pass. Doctor after normal reconciliation: zero issues/warnings. Fresh reviewer: ship, all five criteria met; verified 74 current/70 baseline/14 dirty identities and live fixtures. Only subsequent source-pointer/checklist/summary edits are administrative. Cross-version CI for this commit is pending; no measured native-token/runtime/workflow savings claimed.

## Technical Notes

Mechanical decomposition is not evidence of native-token savings. Existing native experiment budgets remain closed. Remove owned diagnostic fixtures after review and preserve their evidence.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-24*
