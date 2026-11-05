---
type: story
id: "story-reuse-legacy-anchor-matching-within-each-link-resolution"
epic: "WP-21"
title: "Reuse legacy anchor matching within each link resolution"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-04
updated: 2026-11-05
external_refs: {}
tags: []
code_refs: ["scripts/lib-links.mjs", "tests/lib-links.test.mjs"]
specs: []
started_at: "2026-11-04T22:50:55.757Z"
closed_at: "2026-11-05T00:54:13.045Z"
plan_updated_at: "2026-11-04T22:50:55.757Z"
---

# Reuse legacy anchor matching within each link resolution

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Tier-3 legacy fallback repeats identical pure anchor matching for many eligible nodes. Reuse matching results per exact string anchor within one resolver call, while preserving traversal, node getters, kind scopes and ambiguity.

## Decomposition

- [x] Add a tier-3-only lazy private Map capped at32 exact primitive-string anchors; retain original object/null result, cache null correctly and bypass non-string anchors.
- [x] Preserve eligible/story/prefix/stem reads and outer short-circuit/filter/Set behavior, errors, duplicates, tier precedence, freshness and path/ring2/exists rules.
- [x] Compare source-bound old/current outcomes, traces and actual matcher calls, consumer CLI/focused checks/Doctor and fresh review.

## Implementation Plan

Only third tier closure in scripts/lib-links.mjs. Each callback keeps original `eligible(n) && legacyFor(n) && n.stem...` expression. Private legacyFor reads n.story once and n.prefix only when false using the original literal options; derive exact primitive string anchor (story marker or raw prefix). Non-string anchors call original isLegacyNumberedId each time, preserving custom replace/state/errors. For strings, use undefined as absence; retain original object/null result (not boolean, so custom nodes.filter callback observes original null). Create Map only after a first successful eligible string matcher call inside tier3; cache at most32 distinct anchors, thereafter use matcher normally for uncached anchors. No key normalization, eviction, ctx/index writes, cross-call cache or changed exports/API. Map bound avoids memory growth for many unique prefixes. All outer filter/Set/ambiguity/tier/ring2/path/exists logic unchanged. Matcher purity assumes stable JS intrinsics; index values/getters/kinds continue to be observed per node, no global prototype mutation contract added. Tests include repeated negative/positive/empty/raw-case/string-story keys, duplicate identities/paths, getter/exception/short-circuit traces, custom filter null returns, stateful non-string replace and repeated-call freshness plus cap controls. Source-bound actual modules wrap real identity matcher to count calls, compare actual index and synthetic typed/ambiguous/bounded cases, complete outcomes/identities/I/O and cloned graph/ready/codemap CLI with fixed clock/scaffold. Focused resolver/identity/index/readiness/predicates and CLI namespace/module/routine/state guards via heavy gate, Doctor and fresh reviewer. Logical matcher-call reduction only: scan remains O(nodes), no latency/heap/native-token/quota/net savings claim. Accepted ADR0008/public pure-leaf budget10000 unchanged; no new architecture or pilot.

## Acceptance Criteria

- [x] All results, tiers, kind scopes, duplicates/errors/getter/callback traces and consumer/CLI behavior match baseline; state stays local/lazy/bounded and API/read budget unchanged. — evidence: operation-counts.json; per-case outcomes/getter traces; freshness.json; focused tests; cli-comparison.json.
- [x] Repeated-anchor workloads invoke the actual matcher fewer times, non-string/unique/cap controls preserve behavior; focused checks/Doctor and fresh review pass. — evidence: operation-counts.json; commands.json; Doctor stdout; outer-heavy-original-records.jsonl; resolver_anchor_reviewer: story closed / commit, no findings.

## Final Summary

Only tier3 memoizes real legacy matcher results by exact primitive-string anchor in one lazy private Map, capped32 with uncached overflow fallback. Original object/null result retained, not boolean: custom index.nodes.filter callback null semantics preserved. Original eligible&&legacy&&stem expression, node getter order, custom non-string replace/error behavior and all other tiers/filter/Set/path/kind/ambiguity/ring2/exists logic remain unchanged. No ctx/index/global state or cross-call cache/API/export/import change.

Confirmed Node24.22.1/macOS:27index/identity/link/readiness+13identity/resolver predicates+14CLI namespace/module/size/routine+37state-migration=91pass,2state skips,0fail. Heavy31480exit0, Doctor0issues/warnings,1010input/runtime identities stable.21source-bound resolver outcome/trace pairs over actual current index and positive/negative/raw/empty/story-shared/unique/cap/nonstring/getter/throw/duplicate/tier/ring2 controls; three actual graph/ready/codemap CLI JSON stdout/stderr/status pairs exact at common paths/fixed clock/scaffold. Repeated-call modified-index freshness equal.32filled+firstrevisit+33rdtwice checks firstanchor reused, overflowanchor executes twice, maxsize32. Higher tier hits/kind-excluded cases allocate0cacheMaps and call0matcher.

Delegated real isLegacyNumberedId calls: current index each measured missing/nonlegacy/story-shaped/ADR-shaped reference270→29 (three cached string anchors,26non-string nodes retain original calls);1000repeated positive/negative anchors1000→1. Raw-case/unique40controls keep original matcher counts; null/boxed/stateful/invalid non-string controls keep original calls/errors. Cap35node sequence35→34, firstprefix once/33rd twice, no eviction. Scan remains O(nodes); distinct-anchor lookups add Map overhead. Logical call counts only, not latency/heap/native-token/quota/net-workflow savings; text unchanged,0native inference calls BYRUNNER.

Evidence `.waypost/experiments/wp21-resolver-anchors-20261104/` retains literal baseline/current source/runtime hashes, actual matcher delegation/map bound traces, complete per-case outcomes/callback/getter/error traces, freshness, actual CLI output, exact runner/clock/commands/full logs and cleanup. Single heavy producer passed. Owned scratch CLI/vault trees removed using lstat without following external symlink targets. Planner's boolean-cache suggestion deliberately refined to object/null to preserve injected-filter callback results, and cap32 bounds unique-prefix retention; fresh critic shipped final plan. Fresh independent resolver_anchor_reviewer accepted all AC/decomposition items: story closed / commit, no findings;6current review hashes match and1010checked inputs differ only by later story prose.21outcome/trace pairs,3CLI pairs and cache bounds/counts independently verified. Base657ff27 full CI41924149734 still in_progress at last check; no native pilot or budget change.

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-11-05*
