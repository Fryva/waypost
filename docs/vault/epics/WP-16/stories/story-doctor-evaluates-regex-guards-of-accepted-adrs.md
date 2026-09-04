---
type: story
id: "story-doctor-evaluates-regex-guards-of-accepted-adrs"
epic: "WP-16"
title: "doctor evaluates regex guards of accepted ADRs"
status: done
priority: p1
assignee: "Ivan Morozov"
created: 2026-09-04
updated: 2026-09-04
external_refs: {}
tags: []
code_refs: []
specs: []
blocked_by: ["WP-16/story-adr-0011-accepted-guards-and-draftedby-in-adr-frontmatter"]
started_at: "2026-09-04T18:24:02.980Z"
closed_at: "2026-09-04T18:29:10.802Z"
plan_updated_at: "2026-09-04T18:29:09.853Z"
---

# doctor evaluates regex guards of accepted ADRs

| Field | Value |
|---|---|
| **Epic** | [WP-16](../epic.md) |
| **Status** | done |
| **Priority** | p1 |
| **Assignee** | Ivan Morozov |

---

## Description

doctor reads `guards` from vault ADRs and evaluates `forbid` and `require` over the files their `in` glob selects, at level issue for accepted ADRs and info for proposed ones, naming ADR, file, line and `why`.

## Decomposition

- [x] Glob + regex evaluation without dependencies; ignored files skipped — evidence: scripts/doctor.mjs `checkGuards`, `projectFiles`, `globToRegExp`
- [x] `adr-guard` findings; `why` mandatory — evidence: same; test in tests/scripts.test.mjs
- [x] Tests on fixtures for both levels — evidence: "doctor guards: forbid, require, not_in, levels by status, bounds and a check that is never run (ADR-0011)"; CLI test in tests/harness.test.mjs

## Implementation Plan

`checkGuards(artifacts, proj)` in scripts/doctor.mjs, registered outside the stop-on-throw loop: flow-form `guards` parsed with JSON.parse; `forbid` (any match) and `require` (every selected file) over files from `git ls-files --cached --others --exclude-standard` (a walk outside a repository), globs matched by an in-tree matcher, patterns compiled per guard, whole-file matching with the line of the first match; a glob selecting nothing, a missing `why`, a bad pattern and block form are findings; files over 1 MB and selections over 5000 are skipped and said so. Accepted → issue, proposed → info "would fail", superseded → nothing. `next` maps `adr-guard` to `waypost doctor`.

## Acceptance Criteria

- [x] A failing forbid guard on an accepted ADR is an issue with file:line — evidence: both tests (`src/a/http.ts:1`, `src/api.ts:1`)
- [x] A proposed ADR's failing guard is info — evidence: scripts test, `would fail:` prefix
- [x] A guard without `why` is its own finding — evidence: scripts test

## Final Summary

Dogfooded on this vault: ADR-0011 now guards itself (`forbid spawnSync(…g.check` in scripts/doctor.mjs, `require checkGuards(`), ADR-0008 names the standing-context test as its `check`. doctor: 0 issues.

## Technical Notes

Line-by-line matching; multi-line patterns are out of scope for v1.

## Dependencies

- story-adr-0011-accepted-guards-and-draftedby-in-adr-frontmatter

## Attachments

-

---

*Last updated: 2026-09-04*
