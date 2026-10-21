---
type: story
id: "story-extract-shared-cli-core-as-migration-stage-a"
epic: "WP-21"
title: "Extract shared CLI core as migration stage a"
status: in-progress
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-21
updated: 2026-10-21
external_refs: {}
tags: []
code_refs: ["bin/waypost.mjs", "bin/cli/core.mjs", "tests/harness.test.mjs", "AGENTS.md", "docs/how-it-works.md", "docs/vault/adr/the-cli-as-a-thin-entry-with-per-command-modules-each-readable-in-one-pass.md", "docs/vault/adr/setup-asks-the-running-harness-not-only-the-projects-files.md"]
specs: []
started_at: "2026-10-21T13:52:24.017Z"
closed_at: null
plan_updated_at: "2026-10-21T13:52:24.017Z"
---

# Extract shared CLI core as migration stage a

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | in-progress |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Execute only cohesion revision a of the owner-accepted CLI split: move the reviewed shared core into bin/cli/core.mjs in a separate worktree. This first production dependency requires permanent stage ceilings and truthful write-rule/guard scopes. Stage b MUST NOT start until full UbuntuNode20/22/24 CI passes the exact prepared revision. No native pilot or allowance change.

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [x] Apply exact accepted stage-a source patch and verify body/state/startup invariants.
- [x] Add meaningful permanent guards and update truthful documentation/ADR scopes.
- [ ] Obtain source-bound local checks and independent precommit review, then exact-SHA Ubuntu20/22/24 full CI before closure/next stage.

## Implementation Plan

Fresh cli_core_stage_planner inspected the source/tests and grounded this plan in accepted split ADR, completed ownership/budget stories and exact reviewed stage-a patch. The candidate method/design was already accepted by fresh cli_stage_design_critic and final cli_stage_budgets_reviewer; no new architecture or body rewrite is proposed.

1. Base91c00c8552d886b22330e299a2f4c625fa4115f5; main source204781bytes SHAe6eea77efc89a36a1013a28f65ca3b78aeef4f6e25525d6f4cd8909bd0a77c95. Managed worktree /Users/frost/.codex/worktrees/cli-modularization/Waypost, branch codex/cli-modularization; local storage lag0 and no foreign live entry lease at start. Shared Git coordination holds entry/core/docs/tests leases for this worktree. Advisory freeze is rechecked through sessions/leases and source hashes before edits; it is not a remote lock.
2. Apply exact accepted stage-a.patch SHA172e0aca7ce20ac18e13b8f9bbb1f8f4abf41e2ca62c7830459a6f7bb7f41dd3. Expected entry190748bytes SHAfdab937affbb7fdeef44fc1e84931612fa501ebd4dfba62cc5de287c7d3e69f5; core14698bytes SHA295140336ba360d264efd1a1f84ee91d70c2129f8cad168ee6cbedd8866e6d66. Shared declarations move with unchanged chunks except one ROOT dirname-depth correction; main/startup/shim/package remain verbatim.
3. Add fixed191000entry/24000module UTF-8 ceilings and exact stage-a file discovery in harness tests. Reuse namespace/module/static closure helpers. Core's transitive bin closure must be only core, preventing imports of entry/otherCLI; early entry closure must include core and remain team-free. Add fresh-child real static live-import checks for clock state, inherited captures, authority cache and ROOT/VERSION. Existing slots/cleanup runtime assertions and real-copy/race/team refusal controls remain unchanged, not weakened.
4. Correct AGENTS/how-it-works write policy: only generators rerun by doctor are pure; bin and store/write-mode scripts own mutations. Keep existing17100char standing-context ceiling unchanged. Add accepted split ADR's permanent size check/CLI→entry forbid; preserve existing setup ADR entry scopes and add target-specific core scopes for moved registry pin/detector. Update code_refs/parent footprint only for actual paths; no wildcard require over unrelated CLI modules.
5. Run affected harness/slots/cleanup/scripts/team regression checks through heavy gate after agents finish; npm pack --dry-run must contain core. Source hashes bind logs; no full-suite or other-OS claim from scoped local checks. Obtain fresh independent precommit reviewer before committing production code; story remains in-progress while CI evidence is pending.
6. Create stage-a prepared commit and draft PR on the dedicated branch; main stays unchanged. GitHub main is28WP21prep/accounting commits behind this local base, so draft PR contains those prerequisites as well. Authentication/network uses normal GitHub account outside sandbox. Existing workflow is pull_request/push-main, so branch push alone is insufficient. Full npm test/vault gate on exact SHA must pass UbuntuNode20/22/24 before any stage-b code. npm test itself calls waypost run --heavy through scripts/test.mjs; never wrap it in a second heavy claim. CI failures stop progression and are retained with fixes/rechecks.
7. Close only after exact-revision CI and fresh acceptance; stage-a budget is temporary191000, not a claim final14000 has landed. Later five cohesion revisions and final merge/freeze release remain separate work. No native inference, experiment budget mutation or token savings claim.

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [x] Production entry/core match reviewed stage-a identities after the documented top-level comment correction and retain canonical ownership. Only ROOT depth differs within moved bodies; inherited capture, startup order, shared live bindings/lazy authority cache, shim and package interface remain intact. — evidence: exact entry identity, inverse comment proof for core and local CLI migration core state/closure tests.
- [x] Permanent size/namespace/syntax/import/static-closure/live-state guards and affected runtime/race/team regression checks pass. Truthful write docs/target-specific ADR scopes remain within standing budget; package dry-run includes core. No private evidence dependency ships. — evidence:404pass0fail5platform skips in affected files, pack includes core, doctor0issues2oldWP18warnings;161source hashes stable.
- [ ] Fresh reviewer accepts the prepared code and exact-SHA full UbuntuNode20/22/24 npm-test/vault CI is green before closure or stage b. Main remains isolated until accepted merge, with no native pilot/allowance or measured-token-savings claim.

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

Precommit review accepted prepared code with CI pending and found2nits. Relative moduleUrl test calls were corrected to include absolute REPO; old test reproduced1failure from /private/tmp and final3migration tests pass there. A misleading top-level removal-ownership comment was corrected without changing a function body. Final core14613bytes SHA2362ba34127126bf60d65ee4940ecdae240f124bacf8c11e40375ec9ce95f975; restoring only that paragraph reproduces accepted candidate14698/SHA295140336ba360d264efd1a1f84ee91d70c2129f8cad168ee6cbedd8866e6d66. Entry190748/SHAfdab937affbb7fdeef44fc1e84931612fa501ebd4dfba62cc5de287c7d3e69f5 unchanged. Final affected5file rerun again409tests404pass0fail5platform skips in128.86seconds;161source hashes stable. pack-final includes14613-byte core. Final evidence uses source-after-review.json/local-final.log/local-verification-final.json/foreign-cwd-final.log/comment-correction.json; original results/reproduction are retained separately. Fresh cli_core_precommit_reviewer accepted the final prepared code with no remaining code findings; AC3/full exact-SHA CI remains pending.

Prepared code is in codex/cli-modularization worktree only, not primary main. Initial affected-file run onNode25.6.1/macOSarm64:409tests/404pass/0fail/5platform skips in124.98seconds (superseded by final rerun above). All3new CLI migration guards pass; Linux OOM/systemd and sleep-specific fixtures are the5skips. Unchanged slots/cleanup/race/team tests pass. Source161input hashes stable; npm pack dry-run contains core14698bytes; no package archive/dependency created. AGENTS17075characters remains under existing17100ceiling. Doctor0issues2oldWP18warnings. Evidence in primary checkout .waypost/experiments/wp21-cli-core-20261021/: source-final.json, local-first.log, local-verification.json, pack.json, doctor-pre-review.log. Independent precommit review is accepted; full exact-SHA Ubuntu20/22/24 CI remains pending; no stage b or done status until that gate passes.

<!-- Implementation hints, constraints, gotchas. -->

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-21*
