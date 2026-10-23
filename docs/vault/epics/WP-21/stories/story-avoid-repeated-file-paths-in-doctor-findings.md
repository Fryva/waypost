---
type: story
id: "story-avoid-repeated-file-paths-in-doctor-findings"
epic: "WP-21"
title: "Avoid repeated file paths in doctor findings"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-23
updated: 2026-10-23
external_refs: {}
tags: []
code_refs: ["scripts/doctor.mjs", "tests/scripts.test.mjs", "tests/harness.test.mjs", "docs/cli-reference.md"]
specs: []
started_at: "2026-10-23T01:39:03.733Z"
closed_at: "2026-10-23T01:43:59.353Z"
plan_updated_at: "2026-10-23T01:39:03.733Z"
---

# Avoid repeated file paths in doctor findings

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Doctor appends the finding's file even when the unchanged message already starts
with that exact file followed by a colon. ADR guard findings consequently repeat
long paths. Keep the path once without shortening the finding or hiding context.

## Decomposition

- [x] Omit only the redundant exact-prefix file suffix in the text renderer.
- [x] Verify full messages, ordinary suffixes, JSON and diagnostic exit behavior.
- [x] Measure output from frozen findings, then independently review.

## Implementation Plan

In scripts/doctor.mjs:report, append the existing file suffix unless the message
starts with the exact `${file}: ` prefix. Do not use substring/basename matching.
All icons, checks, levels, messages, group ordering, summaries and counts remain
unchanged. No change to findings generation, JSON/startup/fix behavior, guard
execution policy or exit-code calculation.

Add a CLI integration test with guard findings and an ordinary finding needing
its suffix. Compare messages and complete JSON data, verify a failed guard still
exits nonzero and a check command is never executed. Reuse existing fixtures and
cleanup. Measure old/new report functions on one frozen findings array with the
same version/date/groups; retain input/output hashes. Run targeted doctor/guard/
context/CLI checks via heavy gate, then independent reviewer before story close.

## Acceptance Criteria

- [x] A file already present as an exact message prefix is printed once; every message, severity and check remains complete, while other file suffixes remain visible. — evidence: complete-line CLI regression for accepted/proposed/malformed guard findings; frozen report comparison.
- [x] JSON findings and diagnostic/guard behavior are unchanged; issues still cause the text command to fail and declarative check commands are never executed. — evidence: JSON equality, issue exit1 and absent sentinel in exact-prefix CLI test, existing guard/exit/startup/repair regressions.
- [x] Targeted source-bound checks pass and frozen findings show the actual text-size change without a native-token/quota saving claim. — evidence: retained verification.json, tests.log44/44 and measurement.json.

## Final Summary

Doctor now omits the trailing file suffix only when the full unchanged message
already begins with that exact file plus colon and space. Other suffixes remain,
including proposed and malformed guard findings. No findings generation, JSON,
startup/fix path, exit calculation or declarative guard execution changed.

Frozen current-vault findings SHA256
`7f65086ae517bfe97664ea6dca27bb02957e3ae9847073e922d46e5c57de6d66`
with fixed version/date/groups: four redundant suffixes removed; **2719 to 2443
characters, 2763 to 2479 UTF-8 bytes (10.28% fewer bytes)**. All remaining text
was byte-identical and findings were not mutated. This is a fixed text-output
comparison, not native-token/quota/product savings.

Heavy-gated targeted checks: **44/44 passed** on Node25.6.1/macOS, including doctor
exit/JSON/guard/repair, complete messages and CLI/context guard checks. Full suite
and Node20/22/24matrix not run locally. Fresh-context reviewer: story closed / commit, no actionable findings. Independently
verified source/log hashes and frozen report replay. Doctor: zero issues and two
pre-existing WP-18 code-ref warnings.

## Technical Notes

Accepted ADR-0008 covers compact default presentation. No new flags, schemas,
role/model changes, native pilot or historical budget changes.

## Dependencies

- Existing report renderer and guard findings.

## Attachments

- `.waypost/experiments/wp21-doctor-path-20261023/`: frozen findings/metadata, before/after report and source hashes, measurement, full log and validation manifest (local evidence).

---

*Last updated: 2026-10-23*
