---
type: story
id: "story-compact-repeated-declarative-checks-in-the-default-doctor-report"
epic: "WP-21"
title: "Compact repeated declarative checks in the default Doctor report"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-25
updated: 2026-10-25
external_refs: {}
tags: []
code_refs: ["scripts/doctor-report.mjs", "scripts/doctor.mjs", "tests/doctor-report.test.mjs", "tests/scripts.test.mjs", "bin/cli/help.mjs", "docs/cli-reference.md", "docs/how-it-works.md"]
specs: []
started_at: "2026-10-25T03:43:07.917Z"
closed_at: "2026-10-25T03:54:30.519Z"
plan_updated_at: "2026-10-25T03:43:07.917Z"
---

# Compact repeated declarative checks in the default Doctor report

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Reduce repeated non-actionable Doctor output under accepted ADR-0008 while retaining complete diagnostic details and safety findings.

## Decomposition

- [x] Add opt-in compact rendering using the unchanged canonical-check predicate.
- [x] Enable compact CLI text by default and provide --full; preserve repair/machine modes.
- [x] Pin output budget and verify before/after compatibility and independent review.

## Implementation Plan

Independent planner identified a bounded extension of renderDoctorReport. Add metadata compactChecks=false so existing programmatic callers remain byte-compatible. Only when enabled and at least two canonical info adr-guard checks occur within one displayed group, emit one counted not-executed/details hint at the first check position and skip the other canonical entries and their old legend. Keep declarativeCheck byte-for-byte, all other findings/order/headers/summary/newline/exit behavior. CLI opts in only for ordinary text without --full or --fix; JSON/startup branches remain untouched, --fix retains legacy full report and identical repairs. Help/reference explain details. Add threshold/order/near-match/group/immutability/character-budget tests and CLI default/full/JSON/startup/fix non-execution controls. Replay actual fixed findings plus owned real-Git fixtures, including real repair writes; source-bound heavy tests and fresh reviewer before close.

## Acceptance Criteria

- [x] Only groups with at least two canonical info checks fold, at their first slot; every warning/issue/unknown or near-match finding remains complete. — evidence: tests/doctor-report.test.mjs and unchanged declarativeCheck in verify-replay.py.
- [x] Public renderer default, CLI --full, JSON, startup, --fix output/exit and repair contents match baseline; no check command executes. — evidence: cli-before/after.json, project-report-before/after.json, verify-replay.py.
- [x] Full details remain reachable via --full and JSON; compact growth is bounded by a character-budget test. — evidence: tests/doctor-report.test.mjs 360-character budget and CLI --full/JSON tests.
- [x] Frozen live-project findings demonstrate a smaller ordinary text report; report UTF-8/character savings separately from native token use or quota. — evidence: measurement.json and project-report-before/after.json.
- [x] Targeted checks pass with source/command/log receipts; doctor zero issues/warnings; independent reviewer approves. — evidence: validation.json, tests-attempt-1.log, doctor.json, fresh-context reviewer ship.

## Final Summary

Ordinary Doctor text now counts at least two canonical info ADR checks at their first slot within each group and points to repeating the same command with --full. All warnings/issues/unknown levels/near matches remain complete. Public renderer opts in with compactChecks and retains legacy full output by default. CLI --full and --fix keep the old full report; JSON/startup and diagnostics/repairs/exit policy unchanged.

Frozen actual-project report body1744->749UTF-8B (-57.05%),1724->735characters, excluding the CLI final newline. This is output-size saving only, not measured native-token/quota/workflow saving. The canonical eligibility predicate is byte-identical. Main Doctor reverses exactly after the four expected formatting-option edits. Nine real-Git CLI modes replayed: intentional default folding only; all other stdout/stderr/exits and files (including actual .gitattributes/.gitconfig repair writes) match before/after. Declarative marker commands never executed.

Five-file heavy Node24.21.0 run265/265passed,0failed/skipped,exit0,88.927s. Includes all previous API golden tests, five new compact regressions, existing standing-context/CLI byte ceilings and guard/repair checks, plus expanded CLI non-execution modes. Compact synthetic one-group report stays<=360characters at2/20/200checks. Package/syntax pass; doctor0issues/0warnings. Independent reviewer ship/no findings verified20source/13dirty hashes, baseline identities, log/manifest/pack SHA and17live fixture files. Evidence: .waypost/experiments/wp21-doctor-compact-checks-20261025/ (measurement.json, validation.json, verify-replay.py, snapshots and full log). Owned fixture/script/npmcache removed after review; receipts retained. New remote CI pending; acceptedADR0008 applied without a new diagnostic policy or native pilot/budget.

## Technical Notes

This applies accepted ADR-0008, without a new diagnostic/repair policy. No native pilot/budget change. Preserve diagnostic receipts and remove owned temporary fixture/cache after review.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-25*
