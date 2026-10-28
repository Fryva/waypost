---
type: story
id: "story-teach-bounded-queries-in-full-vault-orientation"
epic: "WP-21"
title: "Teach bounded queries in full vault orientation"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-28
updated: 2026-10-28
external_refs: {}
tags: []
code_refs: ["scripts/lib-skeleton.mjs", "scripts/brief.mjs", "tests/predicates.test.mjs", "tests/lib-skeleton.test.mjs", "tests/harness.test.mjs", "tests/state-migrate.test.mjs", "docs/vault/adr/0008-token-budget.md"]
specs: []
started_at: "2026-10-28T15:12:53.937Z"
closed_at: "2026-10-28T15:20:23.223Z"
plan_updated_at: "2026-10-28T15:12:53.937Z"
---

# Teach bounded queries in full vault orientation

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Full orientation still recommends reading an entire folder index and grepping graph.md. Apply accepted ADR-0008 query-first navigation to the tutorial; preserve the architectural-decision index gate and every safety/state signal.

## Decomposition

- [x] Replace only three full-tutorial prose regions. — evidence: source-substitutions.json, exact inverse.
- [x] Pin bounded queries and retain deciding, compact/full/JSON and safety contracts. — evidence: predicates/harness assertions and comparison.json.
- [x] Verify source-bound focused checks and independent review before close. — evidence: validation.json, diagnostics.json, independent reviewer accepted all three AC.

## Implementation Plan

Replace descent steps 3 and 5 and the derived-views graph recipe in scripts/lib-skeleton.mjs. Teach waypost search with existing optional filters and waypost graph --for with vault-relative path. Keep step 4 byte-identical, all sections/facts/default renderer options and pure API unchanged. Existing brief condense removes both altered sections, so default output remains identical. Update existing predicate and integration assertions; retain whole-graph prohibition, bare-slug warning, staleness/source-of-truth and code-placement advice. Compare old/new frozen renderings with exact inverse-source proof. Run focused skeleton, brief, graph-query economy and child-isolation checks through heavy admission; capture source/binary/log identities, then review and publish. No native pilot or savings claim.

## Acceptance Criteria

- [x] Full tutorial teaches existing bounded search and graph queries, preserves all five descent steps and the exact architectural index requirement; no whole-index lookup or grep recipe remains. — evidence: source-substitutions.json, tests/predicates.test.mjs contracts 8/11/9, custom ADR-index assertion.
- [x] Production diff consists only of three prose substitutions; default output, facts/API, safety appenders and all other instructions unchanged on frozen cases and inverse-source proof. — evidence: comparison.json: 32 frozen renderings; exact inverse; unchanged scripts/brief.mjs.
- [x] Source-bound focused checks, syntax/diff/Doctor and fresh independent review pass; actual token/quota/workflow savings remain explicitly unmeasured. — evidence: validation.json: 28 passed; diagnostics.json: all checks exit0, Doctor issue/warn/warning0; independent reviewer verdict story closed / commit.

## Final Summary

Three tutorial prose regions now teach bounded search and graph queries; the obsolete grep-flood figures are removed with the grep recipe. Exact inverse restores the baseline source. All 32 frozen renderings (8 cases x 4 folder modes) preserve default condensed text, immutable facts and API/arity. Full tutorial retains five steps, custom architectural index, graph prohibition and staleness/code-placement advice.

Source-bound Node24.22.1 focused run: 28 passed, 0 failed, 0 skipped, 15988.229417 ms, 574 unchanged source identities; wrapper/child exit0. Existing query economy test verifies one graph node is over five times smaller in characters than the whole graph on its fixture. This does not measure whole-task/native-token/subscription savings. Own temporary runner removed; independent reviewer accepted all three AC with no findings. Full CI for this revision is pending publication.

## Technical Notes

Presentation correction under accepted ADR-0008; no CLI flags, storage, model configuration, native runs or budgets change. Existing focused test files import env.mjs; include the state-migrate subprocess safety guard.

## Dependencies

- Accepted ADR-0008: Context spend as a design constraint, not an outcome.

## Attachments

- Local retained evidence: `.waypost/experiments/wp21-full-query-guidance-20261028/`.

---

*Last updated: 2026-10-28*
