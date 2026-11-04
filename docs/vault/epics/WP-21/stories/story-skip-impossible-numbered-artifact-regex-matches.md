---
type: story
id: "story-skip-impossible-numbered-artifact-regex-matches"
epic: "WP-21"
title: "Skip impossible numbered artifact regex matches"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-04
updated: 2026-11-04
external_refs: {}
tags: []
code_refs: ["scripts/lib-identity.mjs", "tests/lib-identity.test.mjs"]
specs: []
started_at: "2026-11-04T21:04:45.598Z"
closed_at: "2026-11-04T21:13:27.197Z"
plan_updated_at: "2026-11-04T21:04:45.598Z"
---

# Skip impossible numbered artifact regex matches

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Legacy identity recognition dynamically constructs a regex even when the required ASCII digit cannot occur immediately after its literal prefix. Reject these impossible cases before regex construction, preserving all matching/consumer results.

## Decomposition

- [x] Add a negative-only primitive-string anchor digit-position check after existing name coercion and empty-anchor handling, keeping generic matching unchanged.
- [x] Preserve numbered/slug/custom-prefix/story/case/extension/newline/Unicode behavior, public API/purity and unusual prefix/coercion/error contracts.
- [x] Prove fewer actual RegExp constructor calls and identical outcomes on actual index/resolver and broad corpus; focused consumers/guards, Doctor and fresh review.

## Implementation Plan

Only scripts/lib-identity.mjs isLegacyNumberedId: after `if (!anchor) return null`, if typeof anchor is string, get stem.charCodeAt(anchor.length), return null unless digit>=48 && digit<=57 (NaN must reject). With existing non-u case-insensitive regex, literal prefix consumes fixed UTF-16 width and next token is ASCII digit, so this is a necessary condition only; it never accepts a match. Leave all escapeRe/new RegExp/match/return expressions unchanged. Non-string anchor stays on original path, preserving custom replace/String objects/TypeErrors. No cache/state/import/export/caller changes. Name/option ordering and seven facade bindings/arity stay unchanged. Test mixed case, arbitrary regex-special/control/Unicode prefixes, short stems, non-ASCII digits, .md/trailing-LF, numbered positive controls and type/coercion/exception order. Source-bound actual modules delegate real RegExp constructors through counted Proxy; compare broad outcome/trace corpus, actual current-vault buildNodeIndex and resolver results; include numbered controls which still construct. Same current vault for old/new, checked source/runtime hashes; preserve full serialized node/row/facts and CLI stdout. Local Node24 relevant identity/index/link/readiness/predicate tests plus CLI namespace/module/routine/state guards via heavy gate. Logical constructor-call reduction only: no heap/compiler/latency/native-token/quota/net workflow claim. Accepted ADR0008 and pure leaf budget9000 unchanged; no new architecture or native pilot.

## Acceptance Criteria

- [x] Original matching/results/ordering/exceptions and consumer data/CLI text are preserved, public API/purity/read budget remain valid. — evidence: api-comparison.json; trace-comparison.json; index.before.json/index.after.json; cli-comparison.json; focused tests.
- [x] Actual current-vault workloads avoid unnecessary constructors, positive controls stay correct; focused checks/Doctor and fresh independent review pass. — evidence: constructor-counts.json; commands.json; Doctor stdout; outer-heavy-original-records.jsonl; identity_guard_reviewer: story closed / commit, no findings.

## Final Summary

Added a negative-only digit-position guard for primitive-string anchors after original name coercion/empty-anchor handling. Short/NaN/non-ASCII-digit/non-numeric cases return null before dynamic regex construction. Original escaped matcher and return unchanged; non-string anchors retain old path. No cache/state/dependency/export/API/identity grammar change. Public facade/arity/purity and leaf7017B<=9000 preserved; no output-format change.

Confirmed Node24.22.1/macOS:23identity/index/link/readiness+13identity/resolver predicates+14CLI namespace/module/size/routine+37state-migration=87pass,2state skips,0fail. Final heavy63056exit0, Doctor0issues/warnings,1008input/runtime hashes stable.7590literal actual-module API pairs and4coercion/error traces match. Actual current268node index data identical; missing-slug resolver result identical while dynamic identity-module newRegExp calls242→0, index242→0. Numbered-story miss242→207; ADR-shaped control242→242,1000numbered positives1000→1000. Three actual CLI graph/ready/codemap JSON pairs identical stdout/stderr/status on same copied vault with fixed clock. Metrics count dynamic constructor calls in identity only, excluding regex literals/other modules/engine compilation. Positive-heavy cases add a small digit check; no universal latency/heap/native-token/quota/net-workflow saving claim.

Evidence `.waypost/experiments/wp21-identity-digit-20261104/`: literal baseline/current source/runtime identities, full API/corpus/traces/index/constructor counts and CLI output, exact runner/clock/commands/full logs, source stability and cleanup. First heavy44839exit1 after successful API/index/resolver replay, before tests: CLI tool clone lacked scaffold/layouts/engineering.json. Probe only corrected to copy original scaffold into both roots; production/tests unchanged. Both failed and successful evidence retained. Generator CLI clones require scaffold; previous query-only clones did not exercise this missing dependency. Own scratch tool/vault trees removed via lstat without following symlink targets. Fresh independent identity_guard_reviewer accepted all AC/decomposition items: story closed / commit, no findings;6review hashes match and1008checked inputs differ only by later story prose.7590API pairs,268node records,3CLI pairs and unchanged Map construction independently verified. Planner preliminary Node25counts were exploratory only and superseded by source-bound explicit Node24evidence. No native model/pilot/budget change.

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-11-04*
