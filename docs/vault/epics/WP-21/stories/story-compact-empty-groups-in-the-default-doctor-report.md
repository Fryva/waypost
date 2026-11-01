---
type: story
id: "story-compact-empty-groups-in-the-default-doctor-report"
epic: "WP-21"
title: "Compact empty groups in the default Doctor report"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-01
updated: 2026-11-01
external_refs: {}
tags: []
code_refs: ["scripts/doctor-report.mjs", "tests/doctor-report.test.mjs", "tests/scripts.test.mjs", "docs/cli-reference.md", "docs/how-it-works.md", "docs/vault/adr/0008-token-budget.md"]
specs: []
started_at: "2026-11-01T16:51:12.531Z"
closed_at: "2026-11-01T17:12:51.560Z"
plan_updated_at: "2026-11-01T16:51:12.531Z"
---

# Compact empty groups in the default Doctor report

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

A genuinely empty Doctor group repeats zero counts and a separate clean marker in ordinary text. Render one named clean line in the existing compact mode without losing findings or changing full modes.

## Decomposition

- [x] Compact eligible empty group headers only under compactChecks. — evidence: scripts/doctor-report.mjs:21
- [x] Update formatter/CLI regressions and docs; retain complete nonempty/full/fix/JSON/startup behavior. — evidence: tests/doctor-report.test.mjs:176; tests/scripts.test.mjs:1175; docs/cli-reference.md:18; docs/how-it-works.md:152
- [x] Source-bound old/current full stdout checks, named offline token counts/controls, suites/guards, Doctor and independent review. — evidence: .waypost/experiments/wp21-doctor-clean-output-20261101/{formatter-parity,cli-parity,tokens,validation,doctor-receipt,reviewer}.json

## Implementation Plan

In renderDoctorReport only, after filtering fs for a group, if compactChecks && fs.length===0 and g is a nonempty single-line string, push blank and `  ✓ ${g}: clean`, then continue. Ineligible empty/multiline/nonstring names retain legacy rendering; no new public flag. Default exported formatter compactChecks=false remains full, and caller already disables compact mode for --full/--fix. Keep header/date/version, nonempty groups (including info/unknown levels), per-group order/repetition, hidden findings global summary, declarative eligibility and final newline ownership unchanged. Split old zero/singleton compact equality test: singleton/full compatibility remains, zero gets explicit new golden. Add frozen mixed/repeated groups, hidden issues/unknown levels and safe fallback. CLI own real fixtures settle derived files to genuinely empty vault; test default/full/fix/JSON/startup, issue/warn control and declarative non-execution. Docs state named clean line in ordinary mode. Source-bound actual formatter+real copied CLI before/current with fixed child clock compare all controls and full output texts. Offline pinned tiktoken0.14.0 o200k_base+cl100k_base, full stdout including newline, public binary-wheel/no-cache installation and cache warm separate from socket/DNS-blocked counting, exact encode/decode/repeat; no native model calls. Full formatter suite + focused Doctor integration + module/routine/state guards through heavy admission after agents finish; stable hashes/logs and own scratch removal. No whole-workflow/native-token/quota inference.

## Acceptance Criteria

- [x] Only eligible truly empty groups in explicit compact mode use named clean lines; ordering/repeats/summary/findings remain complete, full/default API/fix/JSON/startup and safe fallback retain prior behavior. — evidence: tests/doctor-report.test.mjs:176; tests/scripts.test.mjs:1175; .waypost/experiments/wp21-doctor-clean-output-20261101/formatter-parity.json
- [x] Actual old/current formatter and CLI controls agree outside intended clean text changes; named offline full-output token counts show reduction with unchanged controls; relevant checks pass, Doctor clean and independent reviewer accepts. — evidence: .waypost/experiments/wp21-doctor-clean-output-20261101/{tokens,validation,doctor-receipt,reviewer}.json

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

Never test zero issue/warn counts instead of fs.length: info and unknown levels make a group nonempty. No merging/reordering groups, no JSON/schema/diagnostic/write/exit changes. Character size alone does not establish token savings.

## Dependencies

-

## Attachments

- Local evidence: `.waypost/experiments/wp21-doctor-clean-output-20261101/`.

---

*Last updated: 2026-11-01*
