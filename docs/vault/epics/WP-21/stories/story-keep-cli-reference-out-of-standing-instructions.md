---
type: story
id: "story-keep-cli-reference-out-of-standing-instructions"
epic: "WP-21"
title: "Keep CLI reference out of standing instructions"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-19
updated: 2026-10-19
external_refs: {}
tags: []
code_refs: ["AGENTS.md", "docs/cli-reference.md", "docs/how-it-works.md", "tests/harness.test.mjs"]
specs: []
started_at: "2026-10-19T01:02:44.628Z"
closed_at: "2026-10-19T01:12:08.101Z"
plan_updated_at: "2026-10-19T01:02:44.628Z"
---

# Keep CLI reference out of standing instructions

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Project AGENTS.md carries a CLI reference table in every file load even when the task needs none of its options. Apply accepted ADR-0008 pull-context policy: retain all standing rules/invariants, move only reference detail to a linked standalone CLI reference and remove the duplicate overview table. Preserve original command rows and existing doc-only options. Pin a whole-file character budget; measure source reduction without claiming measured task-token, subscription-quota or savings percentages.

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [x] Extract reference-only content, preserving every byte outside the standing table and managed routing block.
- [x] Retain command/option guidance in a linked packaged reference and add a standing character budget.
- [x] Verify source reduction, instruction/package links, targeted budgets and independent review.

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

The fresh planner confirmed this local extraction follows accepted ADR-0008 and fits the existing instruction/documentation/harness-test footprint. Move original26 command rows byte-for-byte into a standalone reference, preserve overview-only bind/scaffold/tokens rows and richer option notes, then link from AGENTS and overview. Keep every byte outside the original AGENTS table unchanged, including the managed block. Refinement: retain the table's normative heavy-job definition/mandatory dispatcher/refusal policy as a standing paragraph as well as in the reference; budget17100 characters accommodates that rule (the initial17000 proposal assumed only a link). Add the whole real AGENTS file budget in the existing token-economy tests. Verify pointer bindings, all rows and package inclusion, then source-bound targeted budgets and independent review. No runtime or module architecture change.

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [x] AGENTS.md stays below17100 characters by replacing only its CLI table with a pull-reference link. All surrounding instructions and managed routing block are byte-identical; mandatory heavy-work/fresh-review/lifecycle/coordination rules remain standing.
- [x] Original AGENTS command rows plus existing overview-only commands and richer option notes remain available in docs/cli-reference.md. AGENTS/overview links resolve, reference is packaged, instruction bindings/roles/runtime behavior are unchanged.
- [x] Required standing-context budgets pass with source-bound evidence; before/after counts and link/row preservation are independently accepted. Report measures characters/bytes only, not tokenizer or native-task savings; no live pilot, budget/authority change or module-split ADR acceptance.

## Final Summary

Moved the complete CLI reference out of standing instructions under accepted ADR-0008, preserving all other bytes and retaining the full heavy-work rule. AGENTS19335→17013 characters (2322 removed,12.0093095% of that file); linked packaged reference preserves all command/option guidance. Added whole-file character budget17100. Two selected standing-context tests passed; syntax, diff whitespace and package dry-run passed. This is source-size reduction for future loads only; actual token/task/subscription savings remain unmeasured. No native pilot or budget mutation. Fresh independent reviewer accepted all3AC without findings.

## Technical Notes

Source baseline912cee7: AGENTS19335 characters/19429 bytes/299 lines →17013 characters/17097 bytes/277 lines:2322 characters removed (12.0093095% of this file). Exact prefix/suffix outside the original table and managed routing block are unchanged; all26 original command rows,3 overview-only rows and3 richer notes are preserved. The complete heavy-work rule remains standing. This is source size for future instruction loads, not measured token/task/quota savings; this session may retain the old instructions.

Private evidence: `.waypost/experiments/wp21-standing-reference-20261018/measurement.json`, `source-before.json`, `tests.log`, `pack.json`, `verification.json`. The manifest binds159 inputs, unchanged after checks. `node --check tests/harness.test.mjs` and `git diff --check` passed. Heavy-gated selected standing-context tests:2 passed,0 failed,0 skipped; full suite not run. npm pack dry-run with scripts disabled:383 files, linked CLI reference included; nothing published. Instruction bindings and roles unchanged. Isolated npm cache removed after provenance checks.

No new native pilot or budget/authority mutation; prior failed pilots remain closed and full native costs unknown. Fresh reviewer `standing_reference_reviewer` independently accepted all3AC: source size and prefix/suffix/managed identity;26+3 rows/3notes;3 resolving links;pack383 entries/reference3844bytes;159 checked hashes and6 review hashes match; bound tests2/2. Reviewer repeated syntax/diff checks exit0 and doctor0issues (pre-existing warnings only). Verdict: story closed / commit; no open findings. Review covers the implementation snapshot; subsequent story checkbox/final-summary lifecycle metadata and regenerated views only record this accepted evidence.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-19*
