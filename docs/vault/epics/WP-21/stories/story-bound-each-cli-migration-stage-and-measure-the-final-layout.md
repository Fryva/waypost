---
type: story
id: "story-bound-each-cli-migration-stage-and-measure-the-final-layout"
epic: "WP-21"
title: "Bound each CLI migration stage and measure the final layout"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-21
updated: 2026-10-21
external_refs: {}
tags: []
code_refs: ["bin/waypost.mjs", "tests/helpers/cli-namespace.mjs", "tests/helpers/cli-static-closure.mjs", "tests/helpers/cli-modules.mjs"]
specs: []
started_at: "2026-10-21T13:19:54.895Z"
closed_at: "2026-10-21T13:40:47.799Z"
plan_updated_at: "2026-10-21T13:19:54.895Z"
---

# Bound each CLI migration stage and measure the final layout

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Complete the accepted CLI split readiness gate that ownership source estimates cannot prove: actual final files including import/export headers, ROOT depth and dispatch diagnostics must fit14000entry/24000module UTF-8 bytes. Prepare explicit strictly declining temporary entry budgets for six cohesion revisions. This is a docs-only measurement/review story; no production migration, freeze, native pilot or budget mutation.

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [x] Review and construct six complete isolated candidate snapshots from the frozen source and accepted ownership map.
- [x] Measure exact UTF-8 sizes, fix decreasing stage caps and verify source/dependency/dispatch safety.
- [x] Preserve reproducible evidence, obtain fresh independent acceptance and document remaining migration gates.

## Implementation Plan

1. Fresh cli_stage_budgets_planner grounds the route in accepted split ADR and completed ownership/guard stories at863b431. Before construction, fresh critic reviews this method. Baseline204781bytes SHAe6eea77efc89a36a1013a28f65ca3b78aeef4f6e25525d6f4cd8909bd0a77c95; 138declarations/63canonical imports. No code in the live checkout is moved.
2. Use a session-owned dependency-free generator in temporary storage, with frozen source/map/input hashes and retained generator text/patches as private reproducibility evidence. Extract138source-format headers and preceding comments, prove exact full-source reconstruction and ownership coverage. Do not claim a general JavaScript parser. Preserve every declaration body except documented dispatch spans and one ROOT-depth replacement; retain exact before/after splice identities.
3. Construct six SEPARATE complete snapshots: (a)core; (b)status/help/brief/bind/views/artifacts/profile/mcp-config; (c)slots/capacity/size; (d)clean-plan/remove/deleter; (e)clean-apply/clean; (f)auto-clean/run/setup. Retain original declaration order inside each owner. Import external names directly with original source/export/local aliases and corrected relative depth. Export canonical owned names without changing bodies. Derive needed frozen-U names using the accepted engine classifier, not raw comments or fake bindings. Static module imports follow the accepted DAG (including conservative bind→brief); no module imports entry and core imports noCLI.
4. Entry retains unmoved bodies at each intermediate stage and may temporarily statically import moved helpers used by those bodies. Core-only static command closure is FINAL, not an impossible intermediate requirement. All imports must remain free of static team dependencies. At final, entry owns only its accepted six declarations and imports CLIcore only. Keep inherited identity capture before main and all existing startup branches/order.
5. Lazy dispatch uses literal import per branch and string export selector, with comma-call to preserve this=undefined. Frozen-U intentionally treats unquoted property identifiers conservatively, so dot selectors would incorrectly demand entry bindings. A small main-local curried onFail callback adds requested-module diagnostics without a generic/computed import wrapper. Whitelist only its pure declaration, two existing early dispatch replacements (__waypost-delete/team-mcp-config), and switch replacements; all other main spans unchanged. Early-only dispatch is the narrow mechanical consequence of accepted Decisions1/3, not permission for arbitrary main edits. Record exact whitelisted differences and test actual module load failures separately if execution is needed; syntax checks localize dependency files.
6. Measure all complete UTF-8 files, not declaration sums. Set fixed numeric B1..B5 from measured snapshots with explicit bounded headroom; require204781>B1>...>B5>B6=14000, every entry<=its cap and every module<=24000. Prefer16000 but accepted24000 ceiling controls. Record bytes/hashes and require all6stage checks to use the complete clean snapshot, never a dirty final tree against intermediate metadata.
7. Reuse existing namespace, recursive syntax/import and transitive static-closure helpers on the generated candidates through heavy gate after all agents finish, on Node20/22/24 plus local25. Copy only required tracked scripts/package/bin into owned temporary roots; never link back to mutable live CLI. Validate selected names/paths/bytes/source invariants and source hashes before/after. Add isolated baseline/candidate parity controls for help/version/unknown command (exact stdout/stderr/status), plus corrupt requested-module and transitive-dependency fixtures: requested-module labels must remain accurate and per-file syntax checks must locate the actual bad file. Disable migration/heartbeat/self-install and isolate HOME/state/project; tests evaluate module imports and controlled CLI commands, not arbitrary task functions. These offline candidate checks are NOT the mandatory full npm/Ubuntu per-revision gate, Windows runtime, import-effect proof or measured token savings. Preserve logs/provenance/manifests and remove only owned temp runtimes/candidates after reviewer has inspectable retained source evidence.
8. Fresh reviewer checks actual candidate evidence and story requirements before closure/commit. Record fixed budgets and final sizes in this story/parent epic. Later migration still requires a coordinated WP20 freeze, separate worktree, six prepared clean revisions and full UbuntuNode20/22/24 CI at EACH revision before advancing. No production move or new native inference is authorized by this measurement story.

### Complete candidate sizes and fixed stage ceilings

These decimal UTF-8 byte ceilings are fixed after measuring complete clean candidates. Validation reads the fixed table; it does not derive a passing limit from current size. The original entry is204781bytes. Final entry headroom is only2bytes, so even comments/diagnostic changes in a future prepared revision require remeasurement; this table does not waive14000.

| Stage | New owners | Complete entry bytes | Fixed entry ceiling | Headroom |
|---|---|---:|---:|---:|
| a | core | 190748 | 191000 | 252 |
| b | status, help, brief, bind, views, artifacts, profile, mcp-config | 137200 | 138000 | 800 |
| c | slots, capacity, size | 117968 | 118000 | 32 |
| d | clean-plan, remove, deleter | 78902 | 79000 | 98 |
| e | clean-apply, clean | 50513 | 51000 | 487 |
| f | auto-clean, run, setup | 13998 | 14000 | 2 |

Every generated module is subject to24000bytes from its first appearance. Final module sizes include original comments, actual external/static import headers and canonical exports, with ROOT depth corrected:

| Final module | Complete UTF-8 bytes |
|---|---:|
| artifacts.mjs | 9322 |
| auto-clean.mjs | 16535 |
| bind.mjs | 6644 |
| brief.mjs | 3837 |
| capacity.mjs | 4410 |
| clean-apply.mjs | 14557 |
| clean-plan.mjs | 18016 |
| clean.mjs | 15369 |
| core.mjs | 14698 |
| deleter.mjs | 11465 |
| help.mjs | 11530 |
| mcp-config.mjs | 4386 |
| profile.mjs | 5269 |
| remove.mjs | 11661 |
| run.mjs | 9280 |
| setup.mjs | 12001 |
| size.mjs | 7737 |
| slots.mjs | 8815 |
| status.mjs | 9053 |
| views.mjs | 7663 |

Largest module clean-plan18016bytes; core14698bytes; auto-clean16535bytes exceeds the advisory16000target but remains below accepted24000ceiling. No declaration ownership change from the accepted map was needed.

### Reproducibility and allowed changes

Baseline HEAD863b431aa87cc4a57ee1b139768f64d45ed8d421/source SHAe6eea77efc89a36a1013a28f65ca3b78aeef4f6e25525d6f4cd8909bd0a77c95. Private evidence in .waypost/experiments/wp21-cli-layout-20261021/: generator.py.txt, checker.mjs.txt, candidate-manifest.json with138block offsets/hashes and copied-input hashes, six independent patches with hashes, stage-budgets.json and validation-inputs.json. Patches reconstruct each complete candidate from the unchanged base; no installed dependency or hidden parser. Existing ownership metadata assigns203195block bytes+1517prefix+68trailer+1separator; the generator assigns that one separator to core, making its extracted original block total13946 while reconstructing exactly204781bytes. This is newline accounting, not an extra declaration/body change.

Original main is recovered exactly by removing the pure main-local onFail declaration and reversing recorded dispatch splices. Both early branches retain order/return, switch keeps existing calls/arguments/await semantics, string selectors plus comma-call preserve this=undefined. No generic import wrapper: all25final dispatch imports have literal specifiers. onFail only handles import rejections, before handler invocation. Its message says requested ./cli/<name>.mjs, so a bad dependency is not falsely identified as that requested file. All other declaration chunks are verbatim, except one documented ROOT-depth replacement in core. Canonical static imports preserve the live lastCleanNowHonored binding and original external aliases.

Initial construction stopped on inverse-check bookkeeping for duplicate identical calls; replace count1 fixed the assertion before measurement. First complete candidate entry14196 exceeded14000; retain build-over-limit.log/initial-candidate-manifest/initial-patches. Final candidate removes a redundant generated entry comment and duplicate waypost prefix (fail already supplies it), shortens the pure callback name to onFail and uses compact comma-call spacing. No whitespace changes to non-dispatch bodies, nominal imports, owner reassignment or ceiling increase.

Local candidate checks use existing helper APIs. Namespace/parser checks do not evaluate source; actual isolated module imports and controlled help/version/unknown commands DO evaluate imports/commands. Their empty PATH/scratch homes disable migration/heartbeat and isolate ordinary stores; this is not a security sandbox or proof of arbitrary effect absence. Four fault controls corrupt only owned final-candidate files, restore exact bytes in finally, and require requested-module diagnostics plus separately identified syntax-failing files: help→help, slots→requested size, deleter→early delete, mcp-config→early mcp-config. No real cleanup or MCP config handler executes in those fault controls.

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [x] Six complete reproducible candidates have exact UTF-8 bytes/hashes and a fixed strictly decreasing entry budget table ending14000; all generated modules fit24000. Final files include actual headers/exports/ROOT and literal lazy dispatch diagnostics, not source-only estimates. — evidence: stage-budgets.json, six stage manifests/patches,80file size checks per runtime; final13998/clean-plan18016.
- [x] Source reconstruction, unique declaration/import ownership, verbatim bodies outside explicit dispatch/ROOT whitelist, static DAG/core-only final entry, inherited-state/startup and receiver-preserving lazy dispatch constraints are independently inspectable. No production file, native pilot or experiment allowance changes. — evidence:138block reconstruction/inverse checks, canonical header/DAG validation, unchanged source SHA and git diff docs-only;4runtime reports.
- [x] All candidate namespace/syntax/import/static-closure checks pass onNode20/22/24/25 with unchanged source identities and meaningful failure evidence where applicable. Fresh design critic and final reviewer accept; full npm/Ubuntu per-revision gates, freeze/worktree and token savings remain explicitly unverified. — evidence:4source-bound reports/logs with6/80/80/74/18/4 counts, design critic ship and cli_stage_budgets_reviewer all3ACmet/no open findings.

## Final Summary

Six complete independent candidates measured and locally checked. Fixed entry ceilings191000→138000→118000→79000→51000→14000bytes; actual entries190748→137200→117968→78902→50513→13998. Largest final module18016bytes, all20<=24000. Original declaration ownership retained. Final2byte headroom is a material preparation constraint, not spare allowance for later changes.

Confirmed on officialNode20.20.2/22.23.3/24.22.0 and local25.6.1(macOSarm64): each runtime6stages/80namespace files/80syntax files/74real module imports/18exact command-output parity checks/4load-failure controls, exit0 with source/candidate hashes unchanged. Full logs and machine-readable reports bound by validation-inputs.json and verification.json. Initial inverse bookkeeping failure and14196over-limit candidate retained separately. Requested-module labels, dependency-file syntax identification, pure onFail catch scope and comma-call receivers are explicitly inspectable. Design critic ship before construction; fresh cli_stage_budgets_reviewer accepted all3AC/no open findings.

No production/test source moved or changed, no new dependency, native inference/pilot or budget mutation. This local prototype does not satisfy mandatory full npm/Ubuntu20/22/24CI at EACH of six future prepared revisions. Coordinated WP20 freeze and a separate worktree remain required. No measured token saving or subscription quota share is claimed.

## Technical Notes

After independent review, verified every owned candidate file against its exact manifest before removal: both7tree roots (initial/final) removed27686607bytes; checksum-verified temporary Node binaries removed325259264bytes; initial failed-build baseline and owned one-off scripts also removed. cleanup-summary.json records354940135known bytes removed and all owned roots absent. Exact final+initial patches/generator/checker and source-bound logs remain as private review evidence. Exact preconstruction design-story-snapshot.md SHAc55087a891c32eb75b440e289b732bd783d2e5ed2c21b1113db9d35aad2e664a matches design-inputs and was verified independently; no audit question remains.

<!-- Implementation hints, constraints, gotchas. -->

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-21*
