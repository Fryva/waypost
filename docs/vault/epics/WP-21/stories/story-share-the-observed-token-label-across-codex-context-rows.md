---
type: story
id: "story-share-the-observed-token-label-across-codex-context-rows"
epic: "WP-21"
title: "Share the observed-token label across Codex context rows"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-04
updated: 2026-11-04
external_refs: {}
tags: []
code_refs: ["scripts/token-codex-format.mjs", "tests/token-codex-format.test.mjs", "docs/cli-reference.md"]
specs: []
started_at: "2026-11-04T20:40:57.869Z"
closed_at: "2026-11-04T20:49:56.525Z"
plan_updated_at: "2026-11-04T20:40:57.869Z"
---

# Share the observed-token label across Codex context rows

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Detailed Codex session reports repeat ` observed tokens` for every context. Share that unit in one explicit id/role/observed-tokens header for sufficiently long one-line lists, preserving all accounting facts and caveats.

## Decomposition

- [x] Render original context rows once with original field read/coercion/order semantics; share the unit only at least5rows and strictly shorter UTF-8, otherwise exact legacy output.
- [x] Preserve id/role/value tuples, duplicates/order/unknown/zero/empty roles, multiline fallback, summary priority, all coverage caveats and report accounting/schema.
- [x] Compare frozen actual formatter and offline CLI outputs, counters/JSON provenance, text tokens, focused tests/Doctor and independent review.

## Implementation Plan

Only scripts/token-codex-format.mjs sessions branch within !summary. Collect each original template row once using original for-of iterable and expressions; never inspect contexts.length or reread getters. Strip only the known final16character ` observed tokens` suffix when all rendered rows have no CR/LF, at least5rows and the complete header+rows is strictly shorter UTF-8. Header `contexts (id, role, observed tokens):`. Otherwise append exact joined original rows, with no extra empty row for zero contexts. No sorting/dedup/trimming/type normalization, helper/export/import/state/clock/I/O changes. Preserve public facade/name/arity/budgets and all existing detailed/compact/option-getter behavior. Tests cover threshold, unknown/nullish/empty/zero, duplicate ordering, fields+coercion/getter/iterator/throw traces and multiline fallback. Frozen reports and copied actual CLI tool roots read only synthetic CODEX_HOME JSONL, native collector unchanged; JSON comparison uses an explicit fixed-Date --import shim inherited only by the actual CLI pair, the same synthetic project/CODEX_HOME paths and files for both roots, and own tool copies outside Git (assert analyzer_git/project_git identical). Compare the entire parsed JSON and permit only the formatter analyzer_sources SHA replacement after checking it against old/current file bytes; never drop whole provenance. Schema and every accounting field unchanged. Pinned offline tiktoken0.14.0 full stdout in o200k_base and cl100k_base; no native model/history scan/allocation/budget mutation or subscription conversion. CLI reference documents shared unit. Accepted ADR0008/CLI module boundaries unchanged.

## Acceptance Criteria

- [x] Long one-line context lists retain exact ordered id/role/value tuples under one explicit unit; all short/multiline/normal/summary controls and caveats match baseline, getters/iterators/errors preserved. — evidence: tests/token-codex-format.test.mjs; comparison.json; codex-tests.stdout.
- [x] Actual complete CLI output saves text tokens in both named encodings, totals/JSON schema remain unchanged except correct source SHA, focused checks/Doctor and fresh review pass. — evidence: tokens.json; five json-*-receipt.json; commands.json; Doctor stdout; independent codex_units_reviewer: story closed / commit, no findings.

## Final Summary

Only detailed Codex sessions display changed: collect original rows once using original iterable and field/coercion order; for at least5CR/LF-free rows and strictly shorter UTF-8, share an explicit id/role/observed-tokens header and remove only each known final suffix. No extra row for empty lists. Short/multiline/normal/summary behavior and every prior accounting/coverage/quota caveat unchanged. Public facade/name/arity/pure-leaf2037B/owner budgets unchanged; no helper/import/export/schema/collector/budget/pricing change.

Confirmed Node24.22.1/macOS:57formatter/native-counter tests+14CLI namespace/module/size/routine+37state-migration=108pass,2state skips,0fail. Doctor0issues/warnings; heavy4882exit0; checked runtime and1007input hashes stable.36text A/B pairs (21actual-module API +15actual CLI) and5actualCLI JSON pairs. Lists0/1/4/5/20/100, nullish/unknown/empty-role/zero/big-number/Unicode/duplicate/suffix-in-id and CR/LF cases; all changed text expands to exact old text by restoring only known suffix, controls byte-identical. Getter/coercion order and iterable one-pass/length refusal/close-on-throw checked. Actual CLI reads only synthetic CODEX_HOME; both tools use same paths/files and fixed-Date --import shim. Complete JSON equality after verifying and replacing only the formatter analyzer_sources SHA; generated_at, Git provenance, snapshots, counters and coverage otherwise identical. No whole-provenance exclusion.

Pinned offline tiktoken0.14.0 complete actual CLI reports:5contexts192→191o200k/195→194cl (1saved);20contexts388→357/398→367 (31saved,7.99%/7.79%);100contexts1429→1238/1479→1288 (191saved,13.37%/12.91%). Full output includes all caveats. Package/table/input/runtime hashes and UTF-8/token roundtrip/repeat retained; counting socket/DNS denied,0network attempts.0native inference calls BY RUNNER; operator/reviewer usage unmeasured. Synthetic offline-history CLI text counts only, no native-model/framing/cache/reasoning/reread/quota/net-workflow savings inference.

Evidence `.waypost/experiments/wp21-codex-context-units-20261104/` retains literal baseline/current source/runtime identities, synthetic source JSONL fixtures, API/CLI full text/JSON, exact runner/counter/clock, commands/full logs, tokens and cleanup. Planner first rejected further brief footer shortening (17characters) as diminishing return; no brief change made. Critic initially requested reproducible JSON provenance: plan corrected to fixed clock/common paths/Git/one verified SHA exception, then ship. Single heavy producer passed, own scratch tool/fixtures/venv/encodings removed with lstat and no followed symlink targets. Fresh independent codex_units_reviewer accepted every AC/decomposition item: story closed / commit, no findings;7review hashes match,1007checked inputs match except later story prose,36text and5completeJSON comparisons verified. Four original outer-heavy transcript records match byte-for-byte; tests were not rerun. Prior d53cd92 full CI41901354504 confirmed completed/success; no new native pilot or allocation.

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-11-04*
