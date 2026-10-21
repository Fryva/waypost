---
type: story
id: "story-map-cli-dependencies-and-shared-state-ownership-before-migration"
epic: "WP-21"
title: "Map CLI dependencies and shared-state ownership before migration"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-21
updated: 2026-10-21
external_refs: {}
tags: []
code_refs: ["bin/waypost.mjs", "tests/fixtures/cli-namespace.json", "tests/helpers/cli-namespace.mjs", "tests/helpers/cli-static-closure.mjs", "tests/helpers/cli-modules.mjs"]
specs: []
started_at: "2026-10-21T03:05:29.445Z"
closed_at: "2026-10-21T03:15:13.494Z"
plan_updated_at: "2026-10-21T03:05:29.445Z"
---

# Map CLI dependencies and shared-state ownership before migration

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

<!-- What problem does this story solve? Who is the user? -->

The accepted CLI split requires a source-grounded dependency and state-ownership map before moving functions. Assign every frozen declaration to a module, route external imports without importing the entry, preserve initialization order and a single owner for mutable state, and establish an acyclic module plan within size ceilings. This is implementation planning for the accepted ADR, not another architecture approval or a production move.

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [x] Map all138 declarations and63 external import locals against the frozen201-name baseline. — evidence: ownership-map.json/validation.json; independent reviewer verified138/63/201 and original import identities.
- [x] Record mutable-state owners, read/write consumers, initialization order and static dependency DAG. — evidence: Implementation Plan state/startup/DAG tables; independent review confirmed all mutable targets and21-node DAG.
- [x] Validate ownership coverage, dependency/size/body-preservation constraints and review a staged migration sequence. — evidence: source-bound structural validation and final reviewer accepted3AC/no findings, including corrected wrapper accounting.

## Implementation Plan

### Status and source identity

Fresh cli_ownership_planner prepared the map and verified a focused correction placing all cross-module mutable state/helpers in core, as the accepted ADR requires. This is a reviewed-placement candidate, not migration-ready production. Baseline HEAD `af5c92860c46b8467552bf5c8da5932010b25595`; source `bin/waypost.mjs`,204781UTF-8bytes, SHA256 `e6eea77efc89a36a1013a28f65ca3b78aeef4f6e25525d6f4cd8909bd0a77c95`. No production file changed.

### Proposed declaration ownership

Every one of138 frozen declarations has exactly one owner. Paths below are proposed `bin/cli/<owner>.mjs`, except entry. Bytes are original declaration blocks plus their preceding comments, not final modules: headers/exports/ROOT adjustment and rewritten dispatch are still pending. Source accounting is203195owner-block bytes+1517original import/prefix bytes+68entry main().catch trailer bytes+1separator newline=204781source bytes. The trailer belongs to entry but is outside its11799declaration-block bytes. Preserve function bodies byte-for-byte during the later move.

| Owner | Source bytes | Declarations |
|---|---:|---|
| core.mjs | 13945 | `INHERITED_SESSION_ID`, `INHERITED_HARNESS`, `INHERITED_PROC`, `ROOT`, `SCRIPT`, `SCRIPT_URL`, `VERSION`, `fail`, `run`, `runJson`, `projectRoot`, `configPath`, `readConfig`, `VALUED`, `splitAtTerminator`, `flag`, `opt`, `positionals`, `withRegistryHome`, `registryReadFailed`, `detectedHarnesses`, `runningHarness`, `passThrough`, `GB`, `tildeHome`, `warnedCleanNowProbed`, `lastCleanNowHonored`, `cleanNow`, `warnIfProbed`, `BOOT_AUTHORITY`, `bootAuthority` |
| status.mjs | 8660 | `leadClause`, `handleNext`, `repairFor`, `cleanupStatusLine`, `handleStatus`, `handleDefault` |
| help.mjs | 11331 | `printDoc`, `help` |
| bind.mjs | 6101 | `checkLayoutExists`, `handleBind`, `gitUser`, `handleScaffold` |
| views.mjs | 7292 | `DERIVED`, `handleGraphQuery`, `handleSearch`, `handleDerived`, `handleReconcile` |
| artifacts.mjs | 8826 | `handleDraft`, `reconcileAfterWrite`, `handleStory`, `claimForStory` |
| brief.mjs | 3577 | `selfInstall` |
| profile.mjs | 4922 | `refreshProfiles`, `handleProfile` |
| size.mjs | 7283 | `handleSize` |
| slots.mjs | 8119 | `slotsDir`, `legacySlotsDirs`, `EX_TEMPFAIL`, `WAIT_POLL_MS`, `REASON_PRINT_MS`, `delay`, `selfMarker`, `slotWhere`, `claimSlot`, `recordAuthority`, `parseDuration`, `signalNumber`, `shellQuote` |
| capacity.mjs | 4060 | `handleCapacity`, `holderSummary`, `holderLine`, `handleCapacityRelease` |
| run.mjs | 8566 | `ownScopeAvailable`, `runHeavy`, `handleRun` |
| clean-plan.mjs | 17525 | `isHarnessDetected`, `gatherCleanContext`, `factsFrom`, `planFromContext`, `activeLimitFor`, `formatPlanItem`, `formatPlan`, `printCleanPlan`, `printAuditSummary` |
| remove.mjs | 11079 | `orderForRemoval`, `isDescendantOf`, `freshFactsFor`, `recheckItem`, `findCacheDef`, `machinePathStillSafe`, `REMOVE_TIMEOUT_MS`, `removeItem`, `describeKept`, `verifyRemoval`, `APFS_FREE_SPACE_NOTE`, `CLEAN_LOG_ROTATE_BYTES`, `appendCleanLog`, `baseLogItem`, `refusedLogItem` |
| deleter.mjs | 10873 | `REMOVING_NAME_RE`, `randomHex6`, `renameForRemoval`, `spawnDeleter`, `leftoversOf`, `purgeLeftovers`, `handleInternalDelete` |
| clean-apply.mjs | 13885 | `limitFlagValue`, `parseApplySelection`, `selectionDescriptorOf`, `resolveApplySelection`, `printApplyPreview`, `groupByDev`, `applyClean`, `printApplyResult` |
| clean.mjs | 14372 | `gateEvidenceOf`, `gateRefusalMessage`, `printLimitPreview`, `handleCleanLimit`, `handleClean` |
| auto-clean.mjs | 15677 | `warnedAutoCleanProbe`, `autoCleanProbe`, `autoCleanPause`, `autoCleanVault`, `autoExcludedReasonOf`, `autoCleanupReport`, `safeRealpath`, `logAndReportAuto`, `autoCleanup` |
| setup.mjs | 11255 | `handleSetup`, `guessVault` |
| mcp-config.mjs | 4048 | `installMcpConfig` |
| entry | 11799 | `LEASE_SUBCOMMANDS`, `leaseArgs`, `QUIET_COMMANDS`, `heartbeat`, `migrateStateIfNeeded`, `main` |

The first clean-plan grouping was24871bytes before headers. Move selection helpers to clean-apply, then place clock state/helper in core: clean-plan17525, clean-apply13885, core13945, slots8119source bytes. No extra module or body rewrite is needed. Target16KB is advisory; final ceiling is24KB per module. Conservatively plan final UTF-8 budgets of14000entry/24000module bytes, stricter than binary-KB interpretations. Current entry declaration block11799bytes plus69wrapper bytes is not a proof that future dispatch+headers fit14000; measure complete prepared files before claiming that gate.

### External import identities

All63 original local import names are retained, with canonical source/export and aliases. Command/core modules import only the names they need directly from the original source; do not re-export every external dependency through core. Relative scripts specifiers gain one parent level in bin/cli. The raw consumer superset is conservative, not a semantic dependency graph; refine non-code occurrences before deriving real headers.

| Original source | Source from bin/cli | Original imported identity / local name |
|---|---|---|
| `node:path` | `node:path` | `resolve`, `dirname`, `join`, `sep`, `basename`, `relative` |
| `node:url` | `node:url` | `fileURLToPath`, `pathToFileURL` |
| `node:fs` | `node:fs` | `existsSync`, `mkdirSync`, `writeFileSync`, `readFileSync`, `readdirSync`, `statSync`, `lstatSync`, `unlinkSync`, `rmSync`, `statfsSync`, `appendFileSync`, `realpathSync`, `renameSync`, `openSync`, `closeSync`, `fsyncSync`, `linkSync` |
| `node:child_process` | `node:child_process` | `spawnSync`, `spawn` |
| `node:crypto` | `node:crypto` | `createHash`, `randomUUID` |
| `../scripts/machine-lock.mjs` | `../../scripts/machine-lock.mjs` | `acquireLock`, `releaseLock` |
| `node:os` | `node:os` | `homedir`, `hostname`, `setPriority`, `uptime as osUptime`, `constants as osConstants` |
| `../scripts/lib.mjs` | `../../scripts/lib.mjs` | `parseFrontmatter`, `isInsideVault`, `writeFileAtomic`, `sessionId`, `sessionIdFlag`, `storyRefOf`, `expandHome`, `storedVaultPath`, `resolveVaultPath`, `bindingInfo`, `selfInstallOff`, `readVaultConfig`, `writeVaultConfig`, `readConfig as readConfigLib`, `isLinkedWorktree`, `worktreeTag`, `machineStateDir`, `legacyStateDirs`, `legacyDirsToMove`, `ensureMachineStateDir`, `accountStateDir`, `LIMIT_WRITER`, `stateWriteHint`, `askYesNo`, `readCleanupSetting`, `readLastAutoCleanup`, `REMOVING_DIR` |

### Proposed static dependency DAG

These are genuine cross-module uses discovered in the existing bodies. Entry statically imports core only; other command modules are literal lazy imports on their existing branches. Modules never import entry, and core imports no CLI module.

| Owner | CLI dependencies |
|---|---|
| core | none |
| status | core |
| help | core |
| bind | core |
| views | core |
| artifacts | core |
| brief | core |
| profile | core |
| size | core, slots |
| slots | core |
| capacity | core, slots |
| run | core, slots, auto-clean |
| clean-plan | core |
| remove | clean-plan |
| deleter | core, slots |
| clean-apply | core, clean-plan, remove |
| clean | core, slots, clean-plan, clean-apply, remove, deleter |
| auto-clean | core, slots, clean-plan, remove, deleter |
| setup | core, bind, profile, slots, clean-plan, clean-apply |
| mcp-config | core |
| entry | core |

One conservative guard-only edge may remain: bind→brief for canonical `selfInstall`, because handleBind already has a local variable of that frozen name. This is not a call to brief:selfInstall. A canonical named import can provide the module-level binding without changing local shadowing; do not present this as semantic use or introduce a fictitious alias. The union DAG, including this edge, is acyclic. A topological preparation order is core; slots/clean-plan/simple commands (brief before bind for the guard edge); remove/deleter; clean-apply; auto-clean/clean/setup; run. Entry still dispatches dynamically.

### Shared state and observable effects

| State | Single owner | Writers/readers and import rule |
|---|---|---|
| warnedCleanNowProbed | core | only cleanNow reads/writes |
| lastCleanNowHonored | core | cleanNow writes; applyClean,handleClean,autoCleanup read. Export a live ESM binding and use static named imports; no destructured snapshot/getter/body rewrite |
| BOOT_AUTHORITY | core | only bootAuthority reads/writes; capacity,claimSlot,autoCleanup call the lazy thunk. recordAuthority calls capacity.bootAuthority, a different property |
| warnIfProbed.done | core | only warnIfProbed reads/writes its function-object property; capacity and claimSlot reuse that same exported function |
| warnedAutoCleanProbe | auto-clean | private to autoCleanProbe; no cross-module consumer |
| VALUED/DERIVED/LEASE_SUBCOMMANDS/QUIET_COMMANDS | assigned owners above | no mutation after initialization found in this source; do not recreate parser Sets |

Core cleanNow is also called by handleSetup. false/null initialization remains before main; boot authority acquisition remains lazy. Core receives4275source bytes:3316clock block plus959warn/authority block; this avoids weakening the accepted shared-core requirement.

Preserve process-global effects exactly: main binds WAYPOST_PROJECT_DIR/PROC/HARNESS/SESSION_ID; handleBind and autoCleanup retain their existing project-dir assignments (autoCleanup currently does not restore it). withRegistryHome and the existing autoCleanup block restore WAYPOST_HOME in finally. runHeavy edits a child-env copy using INHERITED_*; it removes SIGINT/SIGTERM handlers before autoCleanup and preserves exit status. Existing process.exitCode writers remain in their original handlers. Importing modules must add no new write/spawn/command execution.

### Startup order

1. Static core import captures INHERITED_SESSION_ID/HARNESS/PROC before main and computes ROOT/SCRIPT/VERSION. ROOT in core needs three dirname calls from its deeper file URL.
2. Existing early __waypost-delete,team-mcp,team-mcp-config paths.
3. Only the leading --project handling.
4. migrateStateIfNeeded with existing help/version exceptions.
5. WAYPOST_PROC detection, then harness binding.
6. Explicit --id, inherited ID or derived ID.
7. Worktree qualification except explicit --id.
8. Heartbeat.
9. Dispatch with literal lazy command-module imports.

### Mandatory pre-move blocker: raw-U non-code occurrences

Current cli-namespace selects raw literal names including comments/strings; fixtures explicitly require even string/comment-only names to have a module binding. This conflicts with the accepted contract outside comments/strings and with verbatim movement:

- runHeavy:3233,3236 mentions main/heartbeat in comments; handleStatus:3408 contains main in template text outside interpolation; heartbeat:3689 mentions main in a comment. Raw U would demand prohibited CLI→entry imports.
- gatherCleanContext:1470 mentions machinePathStillSafe in a comment, creating a false clean-plan↔remove cycle with the actual remove→clean-plan dependency.
- freshFactsFor:1738 mentions autoCleanup in a comment, creating a false remove↔auto-clean cycle.
- printApplyResult:2476 mentions handleClean in a comment, creating a false clean-apply↔clean cycle.
- The original common-helper comment blocks mention main/runHeavy too, so moving them into core would violate its zero-CLI-dependency rule under the raw selector.

A separate guard-correction story must implement the already accepted non-code exclusion before any production move. Preserve template ${...} code, module-level export early-errors, local/shadow/catch negatives, raw Unicode-escape fail-closed and complete parent-side expected-report validation. Do not satisfy comment-only names with nominal aliases, import entry or edit function bodies. An engine-parse occurrence mutation classifier has been discussed only as a hypothesis; no classifier implementation or passed gate is claimed here. Its lexical/scope/report behavior requires fresh design review and source-bound tests.

### Migration sequence and verification gates

The accepted ADR calls for six prepared commits in a separate worktree, all three Ubuntu Node20/22/24 results at every revision before advancing, merged during one entry freeze. Keep that sequence:

1. Correct the raw-U blocker as a separately reviewed/tested story.
2. Recheck sessions/leases and coordinate the entry freeze with WP-20; create an isolated worktree. Current inventory has only primary main and no attached worktree. Storage currently reports local, lag0; this snapshot does not replace coordination at the future move.
3. Prepare the complete end-state candidate first to measure actual entry/module bytes and function-body identities; allowed changes are import/export headers, ROOT depth and switch. Update guard scopes and the truthful write-rule documentation in the revisions moving their subjects.
4. Assemble six clean, independently testable revisions from the leaves: (a)core+entry plumbing; (b)simple commands/status/help/views/artifacts/bind/brief/profile/mcp-config; (c)slots/capacity/size; (d)clean-plan/remove/deleter; (e)clean-apply/clean; (f)auto-clean/run/setup+final thin entry. Never validate an intermediate commit against a dirty full-end-state tree.
5. Intermediate entry still contains untransferred declarations, so its final14000byte bound is not yet met. Explicit monotonically declining intermediate budgets must be derived from the remaining frozen source blocks and reviewed before revision(a); they are not implemented/waived by this map. New modules obey24000bytes immediately. Final revision activates the strict14000entry gate. This unresolved transitional-check detail is a pre-move review gate, not permission to weaken permanent budgets.
6. At every prepared revision run the actual .github/workflows/ci.yml Ubuntu20/22/24 npm test+vault gates before the next revision. The full suite takes about25min per hosted runner per the current CI comment. Local selected macOS tests do not replace this gate. Add the required ceiling/entry-import ADR guards when bin/cli appears.
7. Integrate only the fully checked six-commit sequence in the coordinated freeze; rollback reverts the merge to the self-contained entry/shim.

Preserve slotWhere-before-lock/recordAuthority-after-release ordering, existing deleter shim invocation, real recursive race copies and fail-closed team-bound story refusal. Reuse harness namespace/static-closure/syntax/import guards, team-cli, slots, scripts-race, sizes/cleanup/limit and team-mcp-config tests; compare help/version/error output, npm pack dry-run and moved ADR guard scopes. Heavy work always uses waypost run --heavy with no agents beside it.

### Current validation and limits

Private source-bound evidence `.waypost/experiments/wp21-cli-map-20261021/ownership-map.json` and validation.json establish138unique declaration owners,63canonical imported locals,201frozen names,21nodes, no missing/duplicate names, acyclic proposed static+guard-only edges, core zero CLI imports and no entry-import edges. Source hash stayed unchanged. Proposed placement is not an implemented module graph; source-block measures are not final module sizes, and no runtime tests, production move, native pilot, budget mutation or token savings measurement occurred in this document-only slice. Migration remains blocked by the raw-U correction and the explicit preparation/verification gates above.

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [x] Every frozen top-level declaration has exactly one proposed owner; external imported names retain their original source/export semantics. Coverage is bound to the unchanged baseline source hash and distinguishes structural facts from proposed placement. — evidence: ownership-map.json/validation.json; reviewer independently confirmed138unique owners and63exact source/imported/local identities at baseline SHAe6eea77e…77c95.
- [x] All shared mutable state has one owner and documented readers/writers, preserving live-binding semantics and startup ordering. Proposed static edges are acyclic, core imports no CLI module and no module imports entry. Conservative frozen-U guard effects and actual unresolved blockers are explicitly identified. — evidence: proposed21-node DAG including bind→brief guard-only edge; independent source/AST review confirmed dependencies,5mutable targets and raw-U false-edge examples.
- [x] The plan includes measured source spans/estimates and header headroom, entry/module ceilings, a staged move order and per-revision verification/freeze/worktree gates. Independent fresh-context review accepts the plan or names actionable blockers; no production change, new native pilot or unmeasured savings claim. — evidence: final fresh reviewer accepted3AC/no findings after wrapper correction; review-inputs-fixed.json binds10files/2evidence. This accepts mapping only, not production readiness.

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

Completed a source-bound ownership/import/dependency plan for20CLI modules plus entry:138unique declaration owners,63canonical imported locals, no omissions/duplicates and an acyclic proposed graph. Shared mutable clock/authority/warning state lives in core; live binding and process/startup/signal behavior are explicitly preserved. Selection functions stay with clean-apply to avoid an oversized clean-plan. Measured source-only blocks remain distinct from final header/switch/module sizes.

Independent fresh reviewer verified original import identities, semantic references, mutable targets, raw false-edge examples and all10file/2evidence identities; all3AC met, no open findings. A size-accounting nit was corrected and rechecked:203195declaration-block bytes+1517prefix+68entrytrailer+1newline=204781. Only documentation/derived views changed; no runtime test or production/native pilot/budget/savings measurement was performed.

Migration remains blocked pending a separately reviewed correction of raw-U comment/string false positives and the explicit transitional-budget/freeze/worktree/per-revision Ubuntu20/22/24 gates. The map is accepted as an implementation plan, not proof of prepared modules or permission to weaken guards/change bodies. Next implement the guard correction under the already accepted ADR, retaining template/scope/catch/Unicode/report protection.

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-21*
