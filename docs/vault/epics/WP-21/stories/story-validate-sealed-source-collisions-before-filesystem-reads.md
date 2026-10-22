---
type: story
id: "story-validate-sealed-source-collisions-before-filesystem-reads"
epic: "WP-21"
title: "Validate sealed-source collisions before filesystem reads"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-21
updated: 2026-10-22
external_refs: {}
tags: []
code_refs: ["scripts/evaluation-source.mjs", "tests/evaluation-source.test.mjs"]
specs: []
started_at: "2026-10-21T14:42:43.244Z"
closed_at: "2026-10-22T00:58:07.242Z"
plan_updated_at: "2026-10-21T14:42:43.244Z"
---

# Validate sealed-source collisions before filesystem reads

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Full Ubuntu CI for prepared CLI stage a (445c446) exposed a pre-existing sealed-source regression: sorted A.mjs is accessed before the collision with a.mjs is detected, so case-sensitive Linux returns ENOENT instead of source-case-collision. Validate the whole normalized manifest before opening any manifest file. This is an independent bounded compatibility fix, not migration stage b, a broker redesign or permission for native inference.

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [x] Retain failed CI evidence and reproduce the collision-before-I/O contract on all filesystems.
- [x] Separate complete collision preflight from immutable source reads, preserving existing validation and limits.
- [x] Run focused regressions, obtain fresh independent review and publish the fix for full matrix verification.

Evidence for the final gate: full Ubuntu Node20/22/24 run [39699932934](https://github.com/Fryva/waypost/actions/runs/39699932934) at49aac3b, zero failures; fresh sealed_collision_reviewer accepts all criteria with no findings.

## Implementation Plan

Fresh sealed_collision_planner confirmed the existing broker placement and the unchanged accepted sealed-source contract. Base445c446; only scripts/evaluation-source.mjs and its test change. No new architecture, dependency, Host/transport behavior or CLI source change.

1. Retain Node22/24 failed full logs and incomplete cancelled Node20; CI head and synthetic merge have identical tree525954881102d70bac97cfcc31f7f61004391c74.
2. Add absent case/duplicate/directory-prefix collisions, both input orders, an earlier noncolliding missing file and valid same-directory siblings; retain original regression. Run source tests against unchanged broker to prove detection independently of filesystem case behavior.
3. Finish the existing prefix/case loop over all normalized sorted entries, then run the existing filesystem-read loop. Preserve root/git/path/hash/type/symlink/byte-limit/immutable/callback semantics and exact shared-directory-prefix behavior; no file-versus-directory redesign.
4. Bind focused full evaluation-source/evaluation-transport runs to hashes, verify unchanged entry/core, then request fresh independent reviewer. Commit this independent compatibility fix through Waypost and push existing draft branch for new full CI. Story closure and migration stage b still wait for a new green Ubuntu20/22/24 matrix, not selected local checks.

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [x] Case-colliding or duplicate manifest entries are rejected with source-case-collision before any manifest-file lookup, independently of file existence and input order; valid sibling paths still seal. — evidence: five new cases in evaluation-source.test.mjs; red26tests/4fail before fix, green63pass across full source/transport.
- [x] Existing immutable reads, hash/symlink/path/size safeguards and callback/search semantics pass focused regression checks; CLI entry/core bytes stay unchanged. — evidence: focused-fixed.log exit0/63pass/0fail/0skip; source-fixed.json161input hashes unchanged after run, entry/core identities still match445c446.
- [x] Fresh independent reviewer accepts the bounded fix and retained source-bound evidence; stage-a closure and stage b remain gated by a new fully successful Ubuntu Node20/22/24 CI revision.

Evidence for the final gate: full Ubuntu Node20/22/24 run [39699932934](https://github.com/Fryva/waypost/actions/runs/39699932934) at49aac3b, zero failures; fresh sealed_collision_reviewer accepts all criteria with no findings.

## Final Summary

Separated complete manifest collision preflight from the existing file-reading loop, preserving path/hash/type/symlink/size/immutable-source safeguards. Five portable regressions cover absent case variants, duplicate entries, conflicting directory prefixes, an earlier missing unrelated file and valid siblings; four new cases failed before the fix even on macOS.

Prepared code at c1728fd passed focused source+transport63/63; final source-equivalent49aac3b passed full Ubuntu20.20.2/22.23.3/24.22.0 tests and vault gates ([run39699932934](https://github.com/Fryva/waypost/actions/runs/39699932934)):1940/1943/1943pass, zero failures,3skips each; doctor0issues2existingWP18warnings. Fresh reviewer independently accepted all3AC and source/log identities. Earlier failed/cancelled CI logs remain historical evidence. No new native inference, allowance change, measured token savings or quota attribution.

## Technical Notes

Observed CI: Node22 job119275405748, run39615531635, full1941tests/1937pass/1fail/3skip,943.628s. Sole reported failure: tests/evaluation-source.test.mjs:69, ENOENT for /tmp/waypost-sealed-source-*/A.mjs. Original full log retained in primary .waypost/experiments/wp21-cli-core-20261021/ci-node22.log. Node24 later completed with the same sole failure (1941tests/1937pass/1fail/3skip,1159.540s). Remaining Node20 was cancelled after these two failures; its partial log contains the same failure but has no completed-suite result. Final old run status cancelled, never green. Head445c446 and GitHub synthetic merged788800 have identical tree525954881102d70bac97cfcc31f7f61004391c74. sealEvaluationSource sorts paths bytewise and currently interleaves prefix collision checking with lstat/read, explaining the Linux-only error ordering.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-22*

Prepared fix evidence (primary checkout .waypost/experiments/wp21-source-collisions-20261021/): source-red.json/regression-before.log prove four new cases fail on unchanged broker regardless of filesystem case behavior,26tests22pass4fail0skip. source-fixed.json/focused-fixed.log bind full source+transport63tests63pass0fail0skip,46.650s on Node25.6.1/macOSarm64. All161inputs unchanged through each run. Syntax checks and git diff --check pass. At that prepared snapshot full corrected CI was not yet available and no token savings were claimed. Fresh sealed_collision_reviewer accepts prepared commit with no code findings:6file+6evidence+161source hashes independently verified and inverse-loop reconstruction matches HEAD. Full corrected CI was pending at prepared review; final run39699932934 and fresh acceptance now satisfy that gate.
