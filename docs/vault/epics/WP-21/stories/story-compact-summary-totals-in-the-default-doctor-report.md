---
type: story
id: "story-compact-summary-totals-in-the-default-doctor-report"
epic: "WP-21"
title: "Compact summary totals in the default Doctor report"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-01
updated: 2026-11-01
external_refs: {}
tags: []
code_refs: ["scripts/doctor-report.mjs", "tests/doctor-report.test.mjs", "tests/scripts.test.mjs", "docs/cli-reference.md", "docs/how-it-works.md", "docs/vault/adr/0008-token-budget.md"]
specs: []
started_at: "2026-11-01T17:19:33.673Z"
closed_at: "2026-11-01T17:30:13.147Z"
plan_updated_at: "2026-11-01T17:19:33.673Z"
---

# Compact summary totals in the default Doctor report

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Ordinary Doctor summaries repeat parenthetical plural suffixes and a healthy conclusion after exact zero-issue totals. Compact only the footer wording without dropping counts or repair guidance.

## Decomposition

- [x] Use natural singular/plural totals and omit redundant healthy conclusion only in compact footer. — evidence: scripts/doctor-report.mjs:44
- [x] Preserve all body/full/fix/JSON/startup/exit/repair behavior; add count matrix and owned CLI regressions/docs. — evidence: tests/doctor-report.test.mjs:225; tests/doctor-report.test.mjs:251; tests/scripts.test.mjs:1176; docs/how-it-works.md:153
- [x] Source-bound full stdout comparisons, offline named token counts/controls, suites/guards, Doctor and independent review. — evidence: .waypost/experiments/wp21-doctor-summary-output-20261101/{formatter-parity,cli-parity,tokens,validation,doctor-receipt,reviewer}.json

## Implementation Plan

Only renderDoctorReport footer changes. Keep issues/warns from all findings. For compactChecks: `Summary: N issue(singular only when N===1, otherwise issues), M warning(singular only when M===1, otherwise warnings).`; append the exact former Repairs tail with both commands/scopes only when issues>0. At issues0 emit no healthy sentence, including warning-only. For compactChecks=false retain the exact old entire footer. No new flag/helper module/caller changes. Everything before final Summary stays byte-identical in every mode. Preserve global counts despite hidden/repeated groups, info/unknown levels, no trailing spaces and renderer newline ownership. Update prior compact/full body-equality tests and two compact goldens intentionally; preserve full/default goldens. Add0/1/2 count combinations, larger numbers, hidden findings/repeated groups/frozen inputs and exact repair suffix. Extend real clean-vault CLI test for default/full/fix summaries and retain JSON. Source-bound actual old/current formatter+real copied CLI with fixed clock/reset seeds: compare entire outputs with only final footer substitution for ordinary text; exact stdout/stderr/status/files for full/fix/JSON/startup and real repairs. Named offline tiktoken0.14.0 o200k_base/cl100k_base full stdout with newline, public binary-only/no-cache install/warm separate from socket/DNS-denied counting; healthy/warning/issue/hidden controls and full unchanged. Focused Doctor plus module/routine/state guards via heavy admission after agents finish, stable manifests/logs, explicit Doctor receipt, cleanup and independent acceptance. No native/quota/net-workflow claim.

## Acceptance Criteria

- [x] Only explicit compact summary wording changes; exact global totals, numeric grammar, repair guidance, all body/full/default API/fix/JSON/startup/exit behavior and input immutability remain intact. — evidence: tests/doctor-report.test.mjs:225; tests/doctor-report.test.mjs:251; .waypost/experiments/wp21-doctor-summary-output-20261101/formatter-parity.json
- [x] Actual baseline/current full-output comparisons preserve intended scope and controls, named offline token counts decrease, suites/guards pass, Doctor clean and independent reviewer accepts. — evidence: .waypost/experiments/wp21-doctor-summary-output-20261101/{tokens,validation,doctor-receipt,reviewer}.json

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

Do not count displayed groups instead of all findings, do not double-count repeated groups, and do not classify info/unknown as warnings. Group headings retain their previous text. One is singular; zero and other counts plural.

## Dependencies

-

## Attachments

- Local evidence: `.waypost/experiments/wp21-doctor-summary-output-20261101/`.

---

*Last updated: 2026-11-01*
