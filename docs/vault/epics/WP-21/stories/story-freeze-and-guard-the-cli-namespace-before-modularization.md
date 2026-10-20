---
type: story
id: "story-freeze-and-guard-the-cli-namespace-before-modularization"
epic: "WP-21"
title: "Freeze and guard the CLI namespace before modularization"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-19
updated: 2026-10-20
external_refs: {}
tags: []
code_refs: ["tests/helpers/cli-namespace.mjs", "tests/fixtures/cli-namespace.json", "tests/fixtures/cli-namespace-baseline.mjs.gz", "tests/harness.test.mjs"]
specs: []
started_at: "2026-10-19T17:28:08.737Z"
closed_at: "2026-10-20T20:28:46.610Z"
plan_updated_at: "2026-10-19T17:28:08.737Z"
---

# Freeze and guard the CLI namespace before modularization

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Implement the accepted split ADR frozen-U safety net before moving functions. Preserve a compressed byte-identical pre-split baseline and an audited201-name inventory, so shallow clones can reproduce completeness without historical Git. Use Node engine export early-errors to detect missing module-level bindings without evaluating modules. The guarantee is bounded to frozen literal U, not arbitrary JavaScript free-identifier analysis.

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [x] Freeze source/blob identities, compressed baseline and import/declaration inventory; engine-audit completeness. — evidence: tests/harness.test.mjs:1501, runtime-matrix.json.
- [x] Add parse-only namespace oracle and automatic entry/future-module discovery. — evidence: tests/helpers/cli-namespace.mjs:48, tests/helpers/cli-namespace.mjs:75.
- [x] Cover scope/template/escape/report regressions and verify affected checks plus independent review. — evidence: tests-resumed.log, runtime-matrix.json, final independent reviewer accepted all3AC.

## Implementation Plan

Fresh planner verified8 import statements/63 locals plus115 function/19 const/4 let declarations (201 names). Freeze compressed original204781 bytes and source/git identities. Reproduce a strict header inventory, then independently engine-probe the raw Unicode identifier superset one candidate at a time in one child and compare actual exportable names to U. Runtime uses the immutable JSON U, conservative raw literal matching including strings/comments, rejects any raw backslash-u sequence (baseline has none), appends unique aliases absent from source and only constructs SourceTextModule. Engine scope resolution distinguishes module bindings from locals/parameters/catch. Automatically enumerate entry and all nested CLI mjs files; reject symlink traversal instead of silently skipping. Add negative/mutation fixtures and explicit out-of-U limitation. Use existing child/stdout/exit-status fail-closed pattern; no external dependencies. Run heavy selected checks on available runtime versions; official20/22/24 selected matrix before final review where capacity permits. Ownership mapping/module syntax/loading and actual migration remain later.

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [x] Committed baseline bytes/source/blob hashes and sorted201-name U (63 import locals/138 declarations) are pinned; engine audit of raw identifier candidates equals U. Future modules use unchanged U; cold/shallow clones need no historical Git or external parser. — evidence: tests/harness.test.mjs:1501; runtime-matrix.json, all4versions passed.
- [x] Entry and recursively discovered bin/cli/**/*.mjs are checked without link/evaluate. Missing frozen-U bindings fail even inside template expressions, suppressed catch, parameters or local shadowing; valid imports/top-level declarations pass. Alias collisions, unsupported raw Unicode escapes, malformed/failed reports and skipped files fail closed. — evidence: tests/harness.test.mjs:1523,1538,1556,1581; tests-resumed.log and runtime-matrix.json.
- [x] Meaningful mutation and bounded-scope tests pass with source-bound logs and fresh independent acceptance. Only test infrastructure changes; no production move/pilot/budget mutation. Local selected results remain distinct from the full Node20/22/24 migration gate. — evidence: verification.json/source-final.json,13pass/0fail per4versions; independent cli_namespace_reviewer accepted3AC/no open findings2026-10-20.

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

Frozen pre-split source and201-name inventory now have an independent engine census, reproducible without historical Git. Parse-only module export probes prevent forgotten frozen-U imports from hiding behind template/local/catch scope; recursive discovery and exact report checks fail closed. Fresh reviewer found and verified fixes for incomplete selected-name reports and parent-bin symlink traversal, then accepted all3AC with no open findings after actual runtime evidence.

Confirmed on macOS arm64:13selected checks pass on Node20.20.2/22.23.3/24.22.0/25.6.1,159 input hashes stable, syntax/diff passed. Node20's111 additional skips are filter exclusions. Earlier capacity refusals started no tests and remain historical evidence. Owned temporary runtimes removed325259264bytes. Source-bound logs/provenance/final review retained in `.waypost/experiments/wp21-cli-namespace-20261019/`.

Guarantee is conservative and bounded to literal frozen U, not a general JavaScript analyzer; comments/string/property-only matches deliberately require bindings and raw Unicode escapes are rejected. No production CLI moved; module loading/ownership/freeze checks remain before migration. Full npm suite, Ubuntu per-migration CI, other OS, live role compatibility and token savings are unverified. No pilot or budget mutation.

## Technical Notes

Implemented test-only engine oracle, immutable JSON inventory and compressed baseline (64133bytes; original204781bytes). Engine census of2625 raw candidates now confirms the pinned201-name inventory. All13 selected namespace/static-closure/standing/routine checks pass on Node20.20.2/22.23.3/24.22.0/25.6.1 on macOS arm64, with all159 source-final hashes unchanged before/after. Node20 additionally reports111 tests excluded by the name filter as skips; other versions report0 skips. Two syntax checks/diff passed. Fresh final acceptance confirmed all3AC and6review identities,159source hashes,4log hashes/provenance/cleanup; no open findings.

Evidence `.waypost/experiments/wp21-cli-namespace-20261019/`: source-before.json is historical before reviewer fixes; source-final.json binds159 current inputs. Current successful evidence: tests-resumed.log, runtime-matrix.json/per-version logs, runtime-provenance.json/official SHASUMS and verification.json. Earlier capacity refusals are historical in tests.log/tests-final.log/tests-continued.log and verification-capacity-refusal.json; no queued test remains. Verified owned temporary runtimes were removed325259264bytes; runtime-cleanup.json records the absent unique root. Conservative matching deliberately requires frozen names appearing only in strings/comments/property names too; module mapping must account for false positives without treating this as exact semantic dependency analysis. Any raw backslash-u sequence, including text, is rejected to avoid escaped-identifier bypass (original snapshot has none). Scope is only frozen U; unrelated unresolved names are outside the guarantee. Namespace guard does not establish mutable-state ownership or import-time side-effect safety. Full npm suite, per-migration-revision Ubuntu CI and other OS remain unverified. No production move/pilot/budget change.

### Static review corrections

Fresh cli_namespace_reviewer found incomplete selected-name reports could pass and parent bin symlinks were unchecked. Fixed exact parent-side selected-name comparison plus regression fixture, and lstat bin before traversal plus external-parent symlink fixture. Existing dangling-cli symlink rejection retained. Reconcile repaired stale code-map; doctor now0issues/2unrelatedWP18warnings. Source-final.json is the current fixed snapshot; no runtime acceptance/closure/implementation commit yet.

Follow-up fresh static review confirmed both corrections, no new findings. The earlier1m retry returned75 for CPU capacity (load12.34/8cores), no tests started; the later Oct20 capacity-only observation reached37.64/8cores. These are superseded as runtime status by the successful four-version checks above. Doctor reports0issues,2unrelatedWP18warnings and an additional sandbox process-table warning. Production migration still requires the remaining loader/ownership/freeze gates.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-20*
