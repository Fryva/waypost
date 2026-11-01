---
type: story
id: "story-avoid-repeating-search-result-filenames-as-titles"
epic: "WP-21"
title: "Avoid repeating search result filenames as titles"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-01
updated: 2026-11-01
external_refs: {}
tags: []
code_refs: ["bin/cli/views.mjs", "tests/scripts.test.mjs", "docs/cli-reference.md", "docs/vault/adr/0008-token-budget.md"]
specs: []
started_at: "2026-11-01T21:05:17.580Z"
closed_at: "2026-11-01T22:30:04.911Z"
plan_updated_at: "2026-11-01T21:05:17.580Z"
---

# Avoid repeating search result filenames as titles

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Search prints the filename twice when no nonempty title exists: once in the relative path and again as an automatic title. Omit only that automatic title row; retain explicit titles and all match evidence.

## Decomposition

- [x] Record actual fallback provenance in the private bounded result and omit its redundant row. — evidence: tests/scripts.test.mjs and retained CLI/token/Doctor/source/reviewer receipts in `.waypost/experiments/wp21-search-fallback-titles-20261101/`.
- [x] Cover empty/null/typed/explicit/Unicode/status/path-only results and preserve all search gates. — evidence: tests/scripts.test.mjs and retained CLI/token/Doctor/source/reviewer receipts in `.waypost/experiments/wp21-search-fallback-titles-20261101/`.
- [x] Compare baseline/current actual CLI stdout, measure named token counts, pass suites/guards, Doctor and independent review. — evidence: tests/scripts.test.mjs and retained CLI/token/Doctor/source/reviewer receipts in `.waypost/experiments/wp21-search-fallback-titles-20261101/`.

## Implementation Plan

After unchanged titleLine calculation, evaluate String(fm.title ?? "") once, keep title || n and a private fallbackTitle boolean. Render path/status as before, render title row only when not fallbackTitle, and retain existing snippet/titleLine condition. No filename equality inference: explicit title equal to basename stays visible even for body/path hits. Do not trim/normalize/reparse or change line scanning, canonical root/exclusions, kind/path/content gates, bounded retention/full traversal, count/remainder/iCloud/error/flags/exports behavior. Search has no JSON branch; do not add one. Update existing expected untitled rows and add real CLI edge matrix. Baseline abdf3fa actual-handler replay on owned fixed fixtures must differ only by omitted fallback rows; all other stdout/stderr/status identical; read order preserved by unchanged scanner/gates, not separately instrumented. Measure full stdoutLF with named offline pinned tiktoken encodings, not native calls or weekly quota. Focused search plus module/routine/subprocess safety guards run through heavy admission after roles finish. Hash source/input/Doctor receipts, remove only owned scratch and request fresh implementation review.

## Acceptance Criteria

- [x] Only automatically substituted basename title rows disappear; every explicit title (including equal basename), snippet/locator/status/path and existing matching/order/limits/iCloud/error behavior remains intact. — evidence: tests/scripts.test.mjs and retained CLI/token/Doctor/source/reviewer receipts in `.waypost/experiments/wp21-search-fallback-titles-20261101/`.
- [x] Source-bound baseline/current actual CLI comparisons and named text-token counts prove the scoped reduction; focused suites/guards pass, Doctor has no issues/warnings and fresh reviewer accepts. — evidence: tests/scripts.test.mjs and retained CLI/token/Doctor/source/reviewer receipts in `.waypost/experiments/wp21-search-fallback-titles-20261101/`.

## Final Summary

Only automatic fallback filename title rows are omitted. Explicit titles (including basename-equal), match snippets/locators/status/path and all search gates remain intact. No parser, schema, flag, export or dependency change.

Confirmed source-bound Node24.22.1/macOS:17search+4module/routine/subprocess guards=21pass,0fail/skip.416source identities stable;3before-files match abdf3fa and inverse reconstructs baseline exactly.24real copied-CLI same-path fixture pairs prove exact scoped stdout differences with unchanged stderr/status/project file hashes. Read order was not separately instrumented; its preservation follows from the unchanged scanner/gates diff. Empty/null, no frontmatter, whitespace,0/false strings, explicit basename body/path/title, Unicode/BOM/CRLF, empty/no-match/kind/invalid limit, --json existing text and mixed limit/lateiCloud covered.

Pinned offline tiktoken0.14.0 full stdoutLF, both o200k_base/cl100k_base: short fallback19→15(-21.05%), no-header14→10(-28.57%), path-only10→6(-40%), long filename46→27(-41.30%). Explicit title19→19 unchanged; mixed-limit52→48o/51→47cl. Seven pairs retain roundtrip/repeat and denied DNS/sockets0attempts; public wheel install/encoding warm separate.0native inference calls by runner; operator/reviewer consumption unmeasured. These are fixture CLI text counts, not native/week-quota/net-workflow savings; titled results have no reduction.

Fresh independent implementation reviewer accepted original AC. Explicit checked-node repo/bin Doctor receipt:952tracked/untracked/config inputs stable,exit0/empty stderr/0issues/warnings6info. Two earlier5m CPU admission refusals exited75 without starting runner; resumed session72427 admitted/exit0. Owned fixture/tool/venv/encoding-cache scratch removed21,960,694logical bytes, external targets untouched; helpers cleaned separately. Evidence `.waypost/experiments/wp21-search-fallback-titles-20261101/` retains source/review/baseline/runtime/CLI/tokenizer/test/Doctor identities. No native pilot or historical budget change.

## Technical Notes

Existing String(fm.title ?? "") semantics distinguish empty/null from whitespace, numbers and booleans. Keep the resulting title string, fallback provenance and locator handling separate; do not infer fallback from filename equality.

## Dependencies

-

## Attachments

- Local evidence: `.waypost/experiments/wp21-search-fallback-titles-20261101/`.

---

*Last updated: 2026-11-01*
