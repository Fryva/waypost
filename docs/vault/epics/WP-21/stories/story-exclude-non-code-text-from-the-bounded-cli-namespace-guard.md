---
type: story
id: "story-exclude-non-code-text-from-the-bounded-cli-namespace-guard"
epic: "WP-21"
title: "Exclude non-code text from the bounded CLI namespace guard"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-21
updated: 2026-10-21
external_refs: {}
tags: []
code_refs: ["tests/helpers/cli-namespace.mjs", "tests/harness.test.mjs", "bin/waypost.mjs", "tests/fixtures/cli-namespace.json"]
specs: []
started_at: "2026-10-21T03:29:31.047Z"
closed_at: "2026-10-21T03:40:07.545Z"
plan_updated_at: "2026-10-21T03:29:31.047Z"
---

# Exclude non-code text from the bounded CLI namespace guard

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

<!-- What problem does this story solve? Who is the user? -->

Implement the accepted ADR's comment/string exclusion in the bounded frozen-U namespace guard. The raw selector creates false entry dependencies and cleanup cycles in the accepted ownership map, blocking verbatim modularization. Keep the existing no-evaluation engine oracle and all safety invariants; do not add a parser dependency or move production functions.

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [x] Review and implement engine-backed non-code filtering with independently computed parent expectations.
- [x] Cover text/code boundaries, real unchanged CLI snippets and retained namespace safety negatives.
- [x] Verify selected checks on Node20/22/24/25 with source identities and independent acceptance.

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

Fresh cli_text_guard_planner inspected base2a20df4/helper/tests and confirmed this dependency-free plan; fresh cli_text_design_critic accepted the design (ship, no findings) before code changes. Original design identities and verdict are retained in .waypost/experiments/wp21-cli-text-20261021/.

1. Keep checkedSource first: validate original strict ESM and reject every raw backslash-u before excluding text. Immutable auditNamespace census remains unchanged. Discovery and export-alias prefix generation remain shared.
2. In the flagged child only, collect whole Unicode identifier matches with original UTF-16 offsets, considering only requested frozen U. For each raw name first try the existing unique appended export. Success proves a module-level binding, whose declaration/import is itself a code occurrence: select immediately. On SyntaxError only, fall back to occurrence classification; other errors fail closed.
3. Replace exactly one complete occurrence in an independent source copy with bare @ and construct SourceTextModule. Successful parse excludes that occurrence; SyntaxError conservatively selects the name and stops; other errors fail closed. All occurrences must be checked before excluding a name. This preserves executable template expressions via the engine grammar; properties and unusual regex contexts may remain conservative false positives. No source link/evaluation, custom lexer, private Node parser or dependency.
4. Primary files worker retains the final combined export early-error check. Parent decoder obtains expected selected arrays in a second single batch child with an internal selection-only kind, independently of the primary report. This oracle has a direct nonrecursive process/JSON/kind/complete-path/order/unique-raw-subset decoder; it never calls the primary decoder. Parent then requires exact per-file selected names/order from the primary. Semantic classification trusts the tested oracle code, not a self-asserted occurrence receipt; malformed/incomplete oracle responses fail closed. Preserve the fake correct-path empty-primary-report negative.
5. Propagate explicit env through both children; keep timeout120000/maxBuffer1MiB per child. Two sequential children extend the theoretical request bound, so record actual durations without raising limits. The binding fast path bounds current201-name real-tree selection to201export probes per worker rather than1312raw-occurrence mutations; this is a source estimate, not a timing measurement.
6. Split comment/string/template-text positive fixtures from retained code/property/local/shadow/catch negatives. Cover nested/tagged templates, escaped quotes, comments resembling interpolation, mixed text/code occurrences, syntax errors, Unicode escapes in all contexts, imports/classes/aliases and malformed/partial/reordered/duplicate reports for both channels. Real unchanged runHeavy/handleStatus/heartbeat chunks get only test-only dummy bindings for other U; text-only main/heartbeat no longer imply entry imports, while an added executable missing-name mutation still fails.
7. Run source-bound affected namespace/module/static-closure/standing/routine/race checks on Node20/22/24/25 through the heavy gate; preserve failures, verify source hashes and obtain independent final acceptance. No production move/pilot/budget mutation; stage budgets/freeze/worktree/full per-revision CI remain separate gates.

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [x] Comment, string and template-text-only occurrences no longer demand frozen-U bindings; executable template expressions and ordinary code remain selected. Real unchanged run/status/heartbeat source snippets no longer imply entry imports. The immutable201-name census and bounded scope remain unchanged, with no target evaluation or new parser dependency. — evidence: CLI namespace non-code/mixed-code/real-baseline/census tests,22-pass runtime-matrix.json on20/22/24/25.
- [x] Missing module-level dependencies still fail despite local shadowing/parameters/suppressed catch; Unicode escapes, invalid syntax and discovery errors still fail closed. Parent decoder independently recomputes exact selected names and validates every file/path/order/name; successful-looking incomplete or malformed reports and failed/terminated/timed-out children cannot pass. — evidence: retained scope/discovery/Unicode negatives and both decoder failure matrices,22-pass4runtime logs.
- [x] Meaningful boundary/regression checks and existing module/static-closure/standing/race checks pass on Node20/22/24/25 with stable source-bound evidence. Fresh design critic and final reviewer accept the method/diff; only test infrastructure changes, with no production migration/pilot/budget or savings claim. — evidence: final22-pass4runtime logs,160stable inputs, cli_text_design_critic ship and cli_text_guard_reviewer all3ACmet/no open findings.

## Final Summary

Implemented the reviewed engine occurrence classifier and independent batch selection oracle; exact parent report validation and final export early-errors remain. Added3 test groups plus strengthened existing scope/Unicode/report fixtures. All22selected tests pass on officialNode20.20.2/22.23.3/24.22.0 and local25.6.1(macOSarm64), with160source input hashes stable. Node20's195skips are filter exclusions; other versions0. Fresh cli_text_guard_reviewer accepted all3AC/no open findings; doctor0issues3pre-existing/sandbox warnings after reconcile. Story may close and commit.

Evidence: .waypost/experiments/wp21-cli-text-20261021/source-final.json, verification.json, runtime-matrix.json, runtime-provenance.json, retained officialSHASUMS, runtime-cleanup.json and per-version logs. Final suite duration~15–25seconds. Node25 real-tree namespace test~0.86seconds; independent unchanged inventory census~4.34seconds. No speedup comparison or token savings claim. Both owned temporary runtime roots removed325259264bytes each (650518528total); archives removed after verified extraction. No dependencies installed.

Only test infrastructure changed; production source/inventory/baseline unchanged. No native pilot/budget mutation. Full npm suite/Ubuntu CI/otherOS/live-role compatibility/savings unverified. Transitional budgets, coordinated freeze/separate worktree and six full Ubuntu20/22/24 migration-revision checks remain later gates.

## Technical Notes

Implementation is restricted to tests/helpers/cli-namespace.mjs and tests/harness.test.mjs. The audit/discovery paths and frozen inventory/baseline are unchanged. Two independent parse-only children classify files with the same algorithm; the second is a trusted local oracle, not an adversarial proof protocol. No link/evaluate occurs. Per-child timeout120000/maxBuffer1MiB are unchanged; request bound can reach roughly240seconds plus overhead. Property names/regex may remain conservative false positives; arbitrary names outside U are unanalysed.

Regression chunks come from the immutable real pre-split baseline, so later production moves do not invalidate their extraction. Only dummy module-level bindings for other U names are appended; function text is unmodified. The initial all4Node22-pass snapshot used the current identical entry, then this fixture was moved to the frozen baseline; both evidence snapshots are retained separately. Final checks must bind the latter source-final.json.

<!-- Implementation hints, constraints, gotchas. -->

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-21*
