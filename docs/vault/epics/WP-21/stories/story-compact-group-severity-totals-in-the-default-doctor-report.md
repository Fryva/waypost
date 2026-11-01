---
type: story
id: "story-compact-group-severity-totals-in-the-default-doctor-report"
epic: "WP-21"
title: "Compact group severity totals in the default Doctor report"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-01
updated: 2026-11-01
external_refs: {}
tags: []
code_refs: ["scripts/doctor-report.mjs", "tests/doctor-report.test.mjs", "tests/scripts.test.mjs", "docs/cli-reference.md", "docs/how-it-works.md", "docs/vault/adr/0008-token-budget.md"]
specs: []
started_at: "2026-11-01T20:52:18.666Z"
closed_at: "2026-11-01T21:02:21.056Z"
plan_updated_at: "2026-11-01T20:52:18.666Z"
---

# Compact group severity totals in the default Doctor report

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Nonempty compact Doctor groups still repeat parenthetical count labels. Shorten those headings while preserving every finding, local totals and the entire existing summary.

## Decomposition

- [x] Compact eligible nonempty group totals and share private natural grammar with summary.
- [x] Preserve fallback/full/API/summary/diagnostics, test local count matrix, coercion order and real info-only CLI.
- [x] Source-bound full stdout checks, named offline token counts, focused suites/guards, Doctor and independent review.

## Implementation Plan

Only renderDoctorReport changes. Reuse the same compact-name eligibility (nonempty single-line string) for existing empty clean lines and new nonempty headers. For eligible compact nonempty fs, compute local issue/warn counts: both0 => `(no issues or warnings)`, otherwise both numbers with natural singular only at1. All findings info/unknown/issue/warn remain visible; zero severe counts never means no findings or clean. Keep the literal old header expression in else so full/default/fix/ineligible names preserve coercion-before-level access and old bytes/errors. Add one private natural-total-label helper shared with already-natural compact summary; every summary byte must remain8b841c9. No changes to caller/JSON/startup/diagnostic/exit/repair/declarative logic or public exports. Update intentional compact goldens/singleton body assertions; local0/1/2/large count matrix with hidden/repeated groups, frozen data, invalid nonempty names/coercion sentinel; unchanged full/default goldens and empty lines. Add settled actual info-only vault with2declarative checks and non-execution marker, compare default/full/JSON/fix/startup. Actual old/current source replay permits only eligible nonempty compact header substitutions; entire footer and all finding text unchanged. Real copied CLI fixed-clock/reset seeds include info-only, positive issue/warn and existing full/fix/JSON/startup/repair controls. Offline pinned tiktoken0.14.0 o200k_base/cl100k_base full stdoutLF counts/roundtrip/repeat/socket-denied counting, public binary-only/no-cache install+warm separate. Suites/guards via heavy admission after agents finish, stable identities and explicit Doctor receipt, owned cleanup and fresh reviewer. No native/quota/whole-workflow inference.

## Acceptance Criteria

- [x] Only eligible nonempty compact group headers change; exact local severity facts, all finding text/order/repeats/global summary/empty clean lines and fallback/full/API/fix/JSON/startup/exit/repair behavior remain intact.
- [x] Actual baseline/current stdout checks and real info-only CLI preserve intended scope and non-execution, named offline token counts decrease, suites/guards pass, Doctor clean and independent reviewer accepts.

## Final Summary

Eligible nonempty compact groups now use natural local severity totals or “no issues or warnings”. Every finding, full/fallback mode and the entire existing Summary remain intact; no check, exit, repair, JSON/startup or dependency change.

Source-bound Node24.22.1/macOS heavy run exit0:47Doctor formatter/integration+4module/routine/state guards=51pass,0fail/skip.416source hashes stable;5baseline files equal8b841c9 and production inverse reconstructs baseline exactly.108frozen formatter cases and10real copied-CLI modes verify intended header-only changes, exact nondefault stdout/stderr/status/file hashes, actual repairs and declarative non-execution.

Pinned offline tiktoken0.14.0, complete stdout inclLF: actual info-only71→67o200k_base (-5.63%),70→66cl100k_base (-5.71%); frozen project report189→185o (-2.12%),187→183cl (-2.14%). Actual issue123→121o/124→122cl; empty35 and full-info237o/235cl unchanged. Ten pairs/two encodings roundtrip/repeat; counting denies DNS/sockets with0attempts. Public wheel install/encoding warm separate,0native inference calls by runner; operator/reviewer consumption unmeasured. These are fixed CLI text counts, not native/week-quota/net-workflow savings.

Fresh independent implementation reviewer accepted original AC with no findings. Explicit checked-node repo/bin Doctor receipt:951tracked/untracked/config inputs stable,exit0/empty stderr/0issue/warn6info. Own fixture/tool/venv/cache scratch removed21,967,973logical bytes, external targets untouched; temporary helpers cleaned separately. Evidence: `.waypost/experiments/wp21-doctor-group-totals-20261101/` (source/review manifests, runner, complete logs, CLI/tokenizer/Doctor receipts). Prior8b841c9 CI41331835913 passed Node20/22/24; current full CI follows publication. No native pilot or historical budget changes.

## Technical Notes

Keep fallback legacy header expression, including String(group) before level reads. No normalization/new name validation. Item/body text and summary are not targets; no new module, flag or dependency.

## Dependencies

-

## Attachments

- Local evidence: `.waypost/experiments/wp21-doctor-group-totals-20261101/`.

---

*Last updated: 2026-11-01*
