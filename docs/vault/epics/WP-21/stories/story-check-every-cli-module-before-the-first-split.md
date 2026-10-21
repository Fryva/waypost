---
type: story
id: "story-check-every-cli-module-before-the-first-split"
epic: "WP-21"
title: "Check every CLI module before the first split"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-20
updated: 2026-10-21
external_refs: {}
tags: []
code_refs: ["tests/helpers/cli-modules.mjs", "tests/helpers/cli-namespace.mjs", "tests/harness.test.mjs", "tests/scripts.test.mjs"]
specs: []
started_at: "2026-10-20T20:34:15.011Z"
closed_at: "2026-10-21T02:47:50.602Z"
plan_updated_at: "2026-10-20T20:34:15.011Z"
---

# Check every CLI module before the first split

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Before accepted CLI modularization moves production functions, add executable syntax/load safeguards for every future command module. A requested module can fail because a different static dependency is broken; checking only the entry or requested file misses that failure. Race fixtures must exercise the real recursively copied module tree rather than hiding future modules behind stubs. This slice changes test infrastructure only, not production dispatch or state ownership.

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [x] Add complete entry/module syntax checking and command-module import checking with deterministic diagnostics. — evidence: tests/helpers/cli-modules.mjs:26,43,62.
- [x] Cover nested dependency syntax/link failures, incomplete child execution and the absent-module pre-split state. — evidence: tests/harness.test.mjs:1511,1526,1548.
- [x] Copy the real recursive CLI module tree into race fixtures; verify selected checks and independent acceptance. — evidence: tests/scripts.test.mjs:803,831; runtime-matrix.json; final independent reviewer accepted3AC/no findings.

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

Fresh cli_module_checks_planner checked base9776d83, accepted ADR Decisions3–6 and comparable test-infrastructure stories. Reuse collectNamespaceFiles for complete recursive discovery/symlink refusal. Add test-only cli-modules helper: collect named Node --check outcomes for every entry/module before failing, and actual file-URL import in a fresh bounded child for each command module only. Require exact successful terminal receipt and child exit/status/signal; never import entry. Use scratch cwd/stores plus minimal environment with no NODE_OPTIONS/NODE_PATH/harness evidence and empty PATH. This is isolation of normal stores, not a security sandbox or proof of arbitrary side-effect absence. Cover absent cli, nested syntax and missing-export dependencies, non-execution of entry/exported functions, top-level failures and incomplete child receipt. Extend makeRaceRepo with optional synthetic binSource and real recursive cli copy; keep existing story-section substitution and stale-sha race. Verify copied import.meta.url/fault isolation. Run source-bound selected checks through heavy gate on local25 and official20/22/24, then independent final acceptance. No production edit, loader redesign or state-ownership mapping in this slice.

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [x] The real entry and all recursively discovered bin/cli/**/*.mjs receive named syntax checks; all command modules receive actual import/link checks in isolated child contexts. The entry itself is never imported/evaluated by the new guard. The absent-module pre-split tree is supported without inventing modules. — evidence: tests/helpers/cli-modules.mjs:26,43,62; tests/harness.test.mjs:1511; all4runtime logs.
- [x] Meaningful fixtures prove every-file coverage and fail closed for broken nested syntax/static export links or incomplete child execution; diagnostics distinguish requested module from failing dependency without guessing the error origin. — evidence: tests/harness.test.mjs:1526,1548;19selected checks pass per4versions.
- [x] Race fixtures recursively copy the real bin/cli tree when present, preserve existing pre-split tests and keep fault injection meaningful. Source-bound affected checks pass, fresh independent reviewer accepts criteria, and no production CLI/pilot/budget changes are made. Local selected checks remain distinct from the full migration CI gate. — evidence: tests/scripts.test.mjs:773,803,831; runtime-matrix.json/verification.json; final independent reviewer accepted3AC,160source hashes/6review identities/7evidence identities/4log hashes verified.

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

Added deterministic all-file syntax and actual command-module import guards before moving production code. Shared recursive discovery handles the absent pre-split directory and future nested modules. Fresh children require exact completion receipts and isolate ordinary stores; entry is syntax-checked only. Broken syntax dependencies, missing exports, top-level exceptions and incomplete children fail closed. Race copies now retain real recursive CLI files, verified through import.meta.url and a copy-only dependency fault; existing stale-sha protection remains green.

Confirmed19selected checks pass on Node20.20.2/22.23.3/24.22.0/25.6.1, macOSarm64,160source hashes stable. Node20's195 skips are filter exclusions; other versions0. Three syntax/diff checks passed. Independent final reviewer accepted all3AC/no findings after verifying6review inputs,7evidence identities and4successful log hashes. Successful20/25 were reused unchanged; only22/24 resumed. Earlier18/19 canonical-tmp assertion and capacity refusals are retained as historical evidence. Two temporary runtime roots are absent; cleanup records325259264bytes from initial preparation and235429072bytes from remaining22/24 preparation.

Scratch isolation is not a security sandbox or proof of arbitrary-effect absence. Real bin/cli is still absent; synthetic fixtures exercise imports and the permanent guard will cover real modules when added. No production CLI/pilot/budget changes. Full npm/Ubuntu migration CI/otherOS/live role compatibility/token savings are unverified. State/dependency ownership map and coordinated freeze/worktree still precede production migration.

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

Implemented tests/helpers/cli-modules.mjs reusing namespace discovery. Each file receives its own bounded --check child; all outcomes are retained before aggregate refusal. Each command module imports in a fresh child with exact terminal receipt; entry is excluded and invalid entry/traversal/backslash requests fail closed. Minimal inherited OS/locale environment, empty PATH/preloads, scratch stores/cwd isolate ordinary state but do not constitute a security sandbox or prove absence of arbitrary effects. Real-tree scratch is checked for retained files; no production modules exist yet, so current real-tree check covers entry syntax and zero imports while synthetic nested fixtures exercise imports/link errors.

makeRaceRepo now accepts optional binSource and copies a present cli tree recursively into real files, keeping the story-section substitution unchanged. Synthetic nested import.meta.url verifies the copy is executed; corrupting only the copied dependency fails without changing source bytes. Existing stale-sha race still passes. First run18/19 exposed canonical tmp-path comparison (/var versus /private/var on macOS); fixed expected URL with realpathSync. First failing log/source identity retained, not hidden.

Current macOS selected results:19pass/0fail on Node20.20.2/22.23.3/24.22.0/25.6.1,160 source hashes unchanged. Node20's195 skips are filter exclusions; other versions report0 skips. Successful20/25 evidence was reused; only22/24 were rerun on the identical source-final snapshot. Three syntax checks/diff passed. Final independent reviewer accepted3AC/no findings and verified6review identities/160source hashes/7evidence identities/4log hashes; previous matrix blocker is closed. Earlier Node20/22 capacity refusals and load27.08 observation are historical, superseded by the complete successful selected matrix. No queued test remains.

Evidence `.waypost/experiments/wp21-cli-modules-20261020/`: source-before.json/tests.log/verification-first-failure.json are the original failed snapshot; source-final.json/tests-final.log/verification.json bind corrected successful Node25. Current runtime-matrix.json combines successful20 from tests-resumed-v20.20.2.log with tests-remaining-v22.23.3.log/tests-remaining-v24.22.0.log. Refused matrix snapshots/logs remain historical. static-review-verdict.json/review-inputs.json bind the earlier static pass; review-inputs-verified.json/review-verdict.json record final acceptance. Original temporary runtimes removed325259264bytes; runtime-cleanup.json proves that root absent. Only22/24 were prepared again, with official SHASUMS/binary hashes in runtime-provenance-remaining.json and cleanup in runtime-cleanup-remaining.json. No production CLI/pilot/budget mutation; full npm suite, migration CI, other OS and token savings unverified.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-21*
