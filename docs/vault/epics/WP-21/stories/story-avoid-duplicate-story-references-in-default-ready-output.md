---
type: story
id: "story-avoid-duplicate-story-references-in-default-ready-output"
epic: "WP-21"
title: "Avoid duplicate story references in default ready output"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-25
updated: 2026-10-25
external_refs: {}
tags: []
code_refs: ["scripts/ready.mjs", "tests/harness.test.mjs", "docs/cli-reference.md"]
specs: []
started_at: "2026-10-25T05:20:27.489Z"
closed_at: "2026-10-25T05:36:56.950Z"
plan_updated_at: "2026-10-25T05:20:27.489Z"
---

# Avoid duplicate story references in default ready output

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Default ready repeats each full story ref in the heading and again in the exact claim-command path. Keep priority, canonical epic and complete title in the heading, retaining the complete command and existing detailed modes under accepted ADR-0008.

## Decomposition

- [x] Condense only default ready headings; preserve all computation and detailed modes.
- [x] Pin command identity, canonical epic/title/order/empty and compatibility regressions plus a fixed budget.
- [x] Freeze source-bound before/after evidence and obtain independent review.

## Implementation Plan

Independent planner identifies one expression in scripts/ready.mjs main ready-row renderer. Choose args.includes("--all") ? r.ref.padEnd(44) : r.ref.split("/")[0]. Keep priority padding, full title, newline and complete claim command literal. Canonical ref prefix must win over mismatched frontmatter epic. No changes to stories/readiness/claims/sort/selection/namespace; JSON early-return and --all output stay byte-identical, including blocked/claimed rows. Existing next/status/default behavior must stay unchanged. Before production edits freeze isolated fixture covering mixed priority, short/long slugs, Unicode, duplicate/missing titles, metadata mismatch, blocked/claimed and empty/unbound scenarios. Compare modes default/all/json/alljson/API, commands/data/order and source inverse. Persistent CLI tests near ready cases plus existing readiness/context budgets through heavy admission. Independent reviewer before close/commit; retain diagnostic receipts, remove only owned temp/cache.

## Acceptance Criteria

- [x] Default keeps every ready result in the same order with unchanged priority, canonical epic, full title and complete claim command; duplicate titles remain separate. — evidence: scripts/ready.mjs:116; fixture-before.json/fixture-after.json.
- [x] Only the duplicated story-ref suffix/padding is omitted from default headings; --all/JSON/API/empty/error and next/status/bare behavior remain unchanged. — evidence: unchanged JSON/API captures and full --all golden.
- [x] Frozen fixtures, exact inverse-source proof and a fixed character budget demonstrate bounded text reduction without native-token/quota savings claims. — evidence: comparison.json; tests/harness.test.mjs ready heading budget.
- [x] Meaningful regressions and existing readiness/context/CLI budgets pass through heavy admission; doctor zero issues/warnings and fresh reviewer approval. — evidence: validation.json; tests-attempt-2.log; independent reviewer ship.

## Final Summary

Default ready headings keep priority, canonical epic and full title while the unchanged command carries the exact story identity. One conditional expression changes formatting only. --all retains padded full refs; JSON/API/empty/error output and readiness/claims/sorting unchanged.

Evidence: .waypost/experiments/wp21-ready-headings-20261025/ includes three frozen scenarios and default/all/json/alljson/API captures, source manifests, exact whole-source inverse proof and full test logs. Mixed fixture691->451UTF8bytes. Four unchanged ready stories in the real project1339->986UTF8bytes/characters; original before snapshot also contained this newly planned story, excluded explicitly because claiming changed its lifecycle rather than formatting. Exact commands preserved. Fixed fixture headings72<=80UTF16units. These measure text, not native-token/quota/workflow savings.

First admission attempt refused after CPU wait (exit75, no tests ran). Second admitted Node24.21.0 run137/137pass,0fail/skip,exit0,121.208s. Syntax/package pass;doctor0issues/0warnings. Fresh reviewer initially held runtime criterion, then ship/no findings after verifying12source/9dirty-input identities and command/manifest/log/package receipts; all criteria met. Own fixture/cache removed after review, receipts retained. BaselineCI40163985765 success; immediate baselineCI40164921203 still in progress. No new pilot/allocation/policy/interface.

## Technical Notes

No new interface, ADR, native pilot, token allocation or readiness-policy change. Canonical epic comes from ref, never frontmatter epic. Changes to docs/code_refs and derived views are provenance only.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-25*
