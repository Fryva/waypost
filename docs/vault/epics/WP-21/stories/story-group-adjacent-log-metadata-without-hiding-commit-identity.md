---
type: story
id: "story-group-adjacent-log-metadata-without-hiding-commit-identity"
epic: "WP-21"
title: "Group adjacent log metadata without hiding commit identity"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-29
updated: 2026-10-29
external_refs: {}
tags: []
code_refs: ["scripts/commit.mjs", "tests/commits.test.mjs", "tests/harness.test.mjs", "tests/state-migrate.test.mjs", "docs/cli-reference.md", "docs/vault/adr/0006-commit-protocol.md", "docs/vault/adr/0008-token-budget.md"]
specs: []
started_at: "2026-10-29T03:02:47.312Z"
closed_at: "2026-10-29T03:17:36.903Z"
plan_updated_at: "2026-10-29T03:02:47.312Z"
---

# Group adjacent log metadata without hiding commit identity

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Human log output repeats date/harness/provider/OS on every commit. On frozen real latest20 records, shared headings can reduce2976->2461 characters while retaining each SHA, subject, story and ordered tasks. Group only adjacent equal raw base fields, preserving JSON and audit warning semantics.

## Decomposition

- [x] Define adjacent raw-base grouping and per-commit identity preservation. — evidence: log rendering block and raw-field/collision Git cases.
- [x] Implement text-only grouping and actual Git regression cases. — evidence: tests/commits.test.mjs full protocol suite and rendering inverse.
- [x] Compare frozen real/controlled records, verify source-bound checks and independent review. — evidence: comparison.json, live-default.json, validation.json, diagnostics.json and final reviewer.

## Implementation Plan

Replace only the text rendering loop inside commit.mjs log(). Group adjacent already-filtered rows with exact raw tuple [date,harness,provider,os]. Groups of at least2 get explicit date/baseTag [N commits] heading; each indented row retains SHA, full subject and per-row story/tasks in original order. Singletons retain the exact legacy line including padding. No sorting, cross-group merging, truncation, parser/filter/limit/JSON/untagged-warning changes; author/session remain JSON-only as before. Tests cover varied stories/tasks within a shared base, boundaries for each field/empty values/rendered collisions, A/B/A, singleton, filtered limits/no-match and prefilter warnings, JSON identity and full identity retention. Source-bound old/new log execution uses frozen real rows and controlled cases, compares Git calls/JSON/exit behavior and measures text. Existing commit/lease/claim behavior stays outside change. No new flags/API/ADR.

## Acceptance Criteria

- [x] Only adjacent matching raw date/harness/provider/OS share headings; every SHA/subject/story/task stays attributable to its row; singletons stay byte-identical and no metadata boundary is crossed. — evidence: tests/commits.test.mjs real Git row-by-row equality, raw boundary/collision/A-B-A/singleton cases; reconstructed legacy output.
- [x] Git retrieval, filters/-n/order, JSON schema/bytes and prefilter untagged warning remain unchanged; meaningful Git regressions and source-bound syntax/isolation/Doctor checks pass. — evidence: validation.json full28commit tests plus4guards passed; JSON/Git-call parity, exact rendering inverse; diagnostics.json syntax/diff/Doctor issue/warn/warning0,576 stable source inputs.
- [x] Frozen real/default and controlled measurements establish character reduction without native-token/quota/net claims; independent reviewer accepts criteria and own temporary runner is removed. — evidence: comparison.json156 cases and real20rows2976->2461chars; live-default.json byte identity; final independent reviewer accepted criteria; cleanup.json runner absent,6484logical bytes removed.

## Final Summary

Only the text loop in log() changes production behavior. Adjacent already-selected rows share date/harness/provider/OS only when the raw tuple matches; every SHA/full subject/story/ordered task remains per row. Singletons preserve exact legacy bytes. Git retrieval, filters/limit/order, JSON, author/session availability and the prefilter untagged warning remain unchanged; commit/claim/lease/write code is untouched.

Source-bound Node24.22.1: full commit protocol28/28 tests passed (46086.057333ms), plus4/4CLI/module/routine/subprocess guards (8346.577792ms), zero failures/skips, wrapper/children exit0,576 stable source inputs and matching binary/runner/log identities. Frozen156 comparisons restore all legacy rows and warning bytes, preserve JSON/Git-call identity and input data. Latest20 frozen real rows shrink2976->2461characters (-515/17.3051%); a live local CLI log call on the same base has byte-identical output to that measurement. These are text metrics, not native-token/subscription/net savings. Exact render inverse restores baseline; own runner removed. Independent reviewer accepted all criteria with no findings. Full CI for this revision follows publication.

## Technical Notes

Applies accepted ADR-0006 audit protocol and ADR-0008 compact detail policy. Compare raw fields, not rendered tag text. Shared headings do not assert identical sessions/authors or verified identity; those fields were already JSON-only. Keep all story/task values per commit even when they differ. Native runs, budgets, roles and commit write/claim/lease behavior unchanged.

## Dependencies

- Accepted ADR-0006 and ADR-0008.

## Attachments

- Local retained evidence: `.waypost/experiments/wp21-log-groups-20261029/`; initial read-only probe `.waypost/experiments/wp21-log-probe-20261028/`.

---

*Last updated: 2026-10-29*
