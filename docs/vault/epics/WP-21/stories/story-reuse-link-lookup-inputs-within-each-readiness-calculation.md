---
type: story
id: "story-reuse-link-lookup-inputs-within-each-readiness-calculation"
epic: "WP-21"
title: "Reuse link lookup inputs within each readiness calculation"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-29
updated: 2026-10-29
external_refs: {}
tags: []
code_refs: ["scripts/ready.mjs", "scripts/lib-links.mjs", "scripts/lib-node-index.mjs", "tests/ready.test.mjs", "tests/lib-links.test.mjs", "tests/harness.test.mjs", "tests/state-migrate.test.mjs", "scripts/kanban.mjs", "docs/vault/adr/0008-token-budget.md"]
specs: []
started_at: "2026-10-29T18:33:52.100Z"
closed_at: "2026-10-29T18:45:33.488Z"
plan_updated_at: "2026-10-29T18:33:52.100Z"
---

# Reuse link lookup inputs within each readiness calculation

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Readiness rebuilds the same node-file projection for each story with specs and the resolver recreates a Set for every spec/ADR reference. Reuse lookup inputs within one readiness snapshot, keeping the existing resolver semantics and fresh inputs on each call.

## Decomposition

- [x] Prepare the existing files projection and caller-owned file Set once per readiness invocation. — evidence: scripts/ready.mjs readiness/designGates; reviewer.json.
- [x] Preserve per-reference sourceRel/kinds and verify ambiguity/order/duplicates/fresh reads/no-spec behavior. — evidence: tests/ready.test.mjs; readiness-links.tap; comparison.json stages.
- [x] Record source-bound result and CLI parity with preparation-work counts, independent acceptance and owned cleanup. — evidence: comparison.json; validation.json; diagnostics.json; reviewer.json; cleanup.json.

## Implementation Plan

After the existing index/claims reads and before mapping stories, conditionally prepare files using the same index.nodes.map(rel/name) and a Set of those rel values. Do nothing when index is null. Pass files/fileSet to private designGates; remove its per-story projection and pass _fileSet into each fresh resolver context. Keep per-story sourceRel, each kinds array, index, resolver and public exports unchanged. Reuse the resolver's existing caller-owned cache contract; do not memoize results or cache across readiness calls. Tests exercise shared specs/ADRs, missing/ambiguous and cross-kind identities, root/source-relative refs from different stories, duplicates/order/via and later calls after status updates AND path-qualified spec/ADR creation/rename/removal, checking fresh Set identities/sizes. Preserve ADR refs relative to the story and root-first wrong-kind refusal. Freeze before/current functions on one owned fixture, compare entire serialized rows, count basename projection calls and unique actual resolver Set identities/sizes. Actual CLI ready JSON/text/all and kanban JSON use owned tool roots and the same fixed generation clock. Run readiness/link and relevant ready/kanban CLI plus module/routine/subprocess guards via heavy admission, source/binary/log identities, Doctor, independent review and owned cleanup. No API/ADR/native/model/config change.

## Acceptance Criteria

- [x] Files/basename projection and file Set are prepared at most once per readiness call, never for a no-spec cohort; resolver uses the same ordered files/index and original sourceRel/kinds for every reference. — evidence: comparison.json (basename 12,240 ->204, file Sets 180 ->1; no-spec zero); scripts/ready.mjs.
- [x] Readiness rows and ready/kanban output preserve statuses, missing/ambiguity, cross-kind and source-relative resolution, duplicates/order/via, dependencies/claims; later calls observe changed vault contents with no shared cache. — evidence: readiness-links.tap; cli-guards.tap; comparison.json (whole-row/resolver-trace parity, fresh paths/Sets and four exact CLI modes).
- [x] Source-bound same-fixture parity and measured preparation-work reduction pass readiness/link/CLI safety checks; independent reviewer accepts, Doctor is clean and owned scratch removed. No native-token/quota/physical-heap/latency/I/O/net savings claimed. — evidence: validation.json (9+7 passed); reviewer.json (accepted, no findings); diagnostics.json (Doctor clean); cleanup.json (517,019 owned logical bytes removed).

## Final Summary

Prepared the existing ordered files projection and caller-owned Set once within each readiness call, after claims reads; private designGates retains per-reference sourceRel/kinds and the existing resolver. No shared cache between calls and no preparation for no-spec cohorts. Source-bound Node 24.22.1/macOS: readiness/link tests 9/9 and CLI/guard checks 7/7 passed, fail/skip zero, 575 source identities and runtime binary stable. Actual-function same-fixture replay (204 nodes, 60 spec-bearing stories, 180 resolutions): basename projection calls 12,240 ->204; unique resolver file Sets 180 ->1, total stored membership entries across those Sets 36,720 ->204. Entire serialized rows and resolver traces match; created/renamed/deleted paths use fresh Set identities and expected sizes, no-spec has zero index/projection/Set work. Four actual CLI modes (ready JSON/default/all and kanban JSON) are byte-identical across owned before/current tool roots at one fixed clock. These are preparation-work counts, not measured latency/heap/I/O/native-token/quota/net savings. Owned runner/fixture/tool copies removed; cleanup.json counts regular files and symlink paths without following external targets. Parent epic footprint adds only tests/ready.test.mjs. Source-bound Doctor issue/warn/warning counts are zero; independent reviewer accepted all criteria without findings; current full CI follows publication. Earlier calibration split candidate was rejected and unchanged.

## Technical Notes

The resolver and provenance/authority modules remain unchanged. Shared inputs live only in the synchronous readiness call; no result memoization or reuse between calls. The earlier team-role-calibration structural candidate was rejected and left unchanged (rejected-boundary.json).

## Dependencies

-

## Attachments

- Local retained evidence: `.waypost/experiments/wp21-ready-inputs-20261029/`.

-

---

*Last updated: 2026-10-29*
