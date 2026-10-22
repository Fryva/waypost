---
type: story
id: "story-check-safe-zstandard-member-handling-across-node-versions"
epic: "WP-21"
title: "Check safe Zstandard member handling across Node versions"
status: in-progress
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-21
updated: 2026-10-21
external_refs: {}
tags: []
code_refs: ["tests/token-codex.test.mjs", "scripts/token-codex.mjs", "docs/how-it-works.md"]
specs: []
started_at: "2026-10-21T15:17:41.034Z"
closed_at: null
plan_updated_at: "2026-10-21T15:17:41.034Z"
---

# Check safe Zstandard member handling across Node versions

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | in-progress |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Corrected full CI atc1728fd passed Node20/22 but Node24.22.0 failed one Zstandard concatenation test: a second valid frame was fully decoded (150 tokens), while the test required null. The existing archive contract permits successful full decode/consumption and forbids trusted partial spans from ignored bytes. Determine and test the safe outcomes across runtime capabilities without weakening junk-tail quarantine, byte-consumption checks, source hashes, privacy or limits. This is compatibility validation of the existing accounting contract, not a new native pilot or CLI migration stage b.

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [x] Independently ground runtime-dependent valid-member behavior in existing contracts and retained CI evidence.
- [x] Add minimal portable assertions that reject silent partial counts and retain malformed-tail refusal; clarify documentation if needed.
- [ ] Verify relevant accounting regressions, obtain fresh review and full corrected Ubuntu20/22/24 CI before closure or stage b.

## Implementation Plan

Fresh sealed_collision_planner independently grounded this test/documentation correction in the existing completed archive story and reader contract. Production archiveBytes already enforces full-byte consumption; no production change or new architecture is needed.

1. Preserve full failed Node24 and successful Node20/22 logs with c1728fd/merge tree identities. The original failed150!==null demonstrates the overstrict expectation; it is not proof of a new safety failure.
2. Add a successful alternative only for a valid second Zstandard frame: require all150 native tokens, decoded1/failed0/skipped0, readable provenance/errornull and SHA256 of the full concatenated original file. Otherwise require null total/observed0/decoded0/failed1/unreadable1, null hash and explicit trailing/decode error. A partial100 always fails.
3. Keep mandatory successful gzip concatenation and mandatory failed junk tails/Brotli second members unchanged. Preserve unconditional single-frame codec parity/hash/privacy tests. Add one documentation sentence clarifying fully decoded concatenation; retain historical runtime results.
4. Run the full affected token-codex/tokens/token-navigation suites through the heavy gate with source hashes and production/entry/core identity proof. Fresh reviewer must accept before prepared commit; new full exact-tree Ubuntu20/22/24 CI remains required for all pending closures/stage b. Do not claim both runtime-dependent Zstandard outcomes were locally exercised without actual evidence.

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [x] Valid concatenated Zstandard input either contributes all expected native spans with full original-byte provenance or is explicitly quarantined with no trusted partial spans; silently accepting only the first member remains a failure. Malformed junk tails remain failures for every supported codec. — evidence: strict zst member assertions in tests/token-codex.test.mjs, unchanged negative junk/Brotli and gzip-success branches, local100pass; Node25 diagnosed quarantine only, corrected successful zst branch awaits CI.
- [x] Existing archive byte-consumption/hash/limits/identity/replay/privacy/native-counter safeguards remain unchanged; focused accounting regressions pass, and CLI entry/core remain unchanged. — evidence: source-final.json161stable inputs differ fromc1728fd only in tests/token-codex.test.mjs; accounting-tests.log100pass0fail0skip,8.303s, syntax/diff checks exit0.
- [ ] Fresh reviewer accepts the bounded compatibility change; a new fully successful exact-tree Ubuntu Node20/22/24 matrix is required before closing this story, the collision-fix story, core stage a or starting stage b.

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

Original corrected run39620458834: Node20 successful1943tests/1940pass/3skip and vault healthy; Node22 successful1946tests/1943pass/3skip and vault healthy; Node24 failure1946tests/1942pass/1fail/3skip at tests/token-codex.test.mjs:436,150 !== null for a valid second member. All checkout logs name merge1f82969; its tree96c3f5142f72d0e49e14c6d6e903196d3c20e1eb equals headc1728fd. Complete logs and final status retained in primary .waypost/experiments/wp21-source-collisions-20261021/. Existing production reader uses decoder.bytesWritten===raw for full reads and already permits complete concatenated gzip. docs/how-it-works.md describes ignored or unsupported members, not a universal prohibition on valid Zstandard concatenation. Upstream Node issue64741 documents chunk-boundary-dependent Zstandard concatenation behavior; use as investigation context, not proof of this exact runtime.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-21*

Prepared validation: first accounting run100pass0fail0skip in9.640s; final run after adding outcome diagnostics100pass0fail0skip in8.303s onNode25.6.1/macOSarm64. Final log explicitly reports Zstandard concatenation outcome: quarantined. No claim the corrected successful zst branch was exercised locally. Source161hashes stable, only test input differs fromc1728fd; production reader SHA17068f69bf365ef0d5a86c8121106415fd3800bafad6b23572169d154ffc985a unchanged. Initial capacity0 memory/CPU conditions were respected by heavy --wait30s; commands started only after admission. Evidence primary .waypost/experiments/wp21-zstd-compat-20261021/. Fresh sealed_collision_reviewer accepts the prepared commit with no code findings;6file+1requirement+13evidence+161source hashes independently verified. Only new full exact-tree Ubuntu20/22/24 CI remains pending; all three stories remain in-progress and stage b stays closed.
