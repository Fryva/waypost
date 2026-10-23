---
type: story
id: "story-state-repeated-adr-check-execution-guidance-once-per-doctor-group"
epic: "WP-21"
title: "State repeated ADR check execution guidance once per doctor group"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-23
updated: 2026-10-23
external_refs: {}
tags: []
code_refs: ["scripts/doctor-report.mjs", "tests/doctor-report.test.mjs", "tests/scripts.test.mjs"]
specs: []
started_at: "2026-10-23T06:21:32.553Z"
closed_at: "2026-10-23T06:27:07.304Z"
plan_updated_at: "2026-10-23T06:21:32.553Z"
---

# State repeated ADR check execution guidance once per doctor group

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Doctor repeats the same execution disclaimer for every declarative ADR check.
State that guidance once per displayed group with multiple eligible checks while
retaining every diagnostic, command, reason, path, severity, count and order.

## Decomposition

- [x] Deduplicate the exact declarative-check suffix in text rendering only.
- [x] Cover eligibility, thresholds, groups, immutable inputs and real CLI behavior.
- [x] Compare frozen actual findings, run focused checks and independently review.

## Implementation Plan

In scripts/doctor-report.mjs define the exact producer suffix:
` — it runs in the project's own test suite; doctor never executes it.`
Eligibility requires info level, adr-guard check, string file/message, canonical
`${file}: check \`` prefix, the `\` encodes this decision (` delimiter and exact
closing parenthesis plus trailing suffix. This excludes proposed forbid/require
messages whose arbitrary why happens to end with that same suffix.
For each displayed group with at least two eligible findings, strip only that
suffix in a local rendered message and append one shared line after its findings:
`  ADR check commands run in the project's test suite; doctor never executes them.`
At zero/one eligible findings retain the original output. Compute file suffixes
from original messages. Repeated groups are independent; hidden groups emit no
legend. No input mutation, imports or state. Do not edit doctor.mjs or findings.

Add pure tests for zero/one/two/three eligible findings, near matches, proposed
forbid/require reasons ending in the disclaimer, other
levels/checks, different/repeated/hidden groups, full commands/reasons/paths,
ordering/counts and frozen inputs. Retain existing one-check CLI regression
unchanged; add a separate multi-check CLI fixture with a sentinel, exact JSON
before/after equality and text exit policy. Capture actual findings and metadata,
compare against baseline renderer and reconstruct each original message from
shortened text plus the common suffix. Prove unrelated lines are byte-identical
and diagnostic source unchanged. Run selected doctor/guard/repair/context/CLI
checks through heavy admission with source/log identities.

## Acceptance Criteria

- [x] A shared execution disclaimer appears only for at least two exact eligible findings in each displayed group; all other messages and file suffix behavior remain unchanged. — evidence: nine pure renderer tests, including canonical eligibility, zero/one/two/three checks, rule-reason collisions and group boundaries.
- [x] Every original command/reason/path/severity/order/count is retained, inputs and JSON findings stay unchanged, and declarative commands are never executed. — evidence: frozen text reconstruction/immutable inputs, unchanged single-check CLI regression and new multi-check CLI JSON/exit/sentinel regression.
- [x] Targeted checks and independent review pass; frozen text reduction is measured separately from native-token, runtime, workflow or subscription savings. — evidence: 54/54 heavy-gated tests, measurement/verification manifests and independent reviewer ship verdict with no actionable findings.

## Final Summary

The text renderer shares the standard execution guidance only for two or more
canonical declarative ADR check messages in a displayed group. The complete
command/reason/path portion remains in each line. Single checks, near matches,
other levels/checks and proposed forbid/require reasons remain unchanged.
A critic identified the possible collision with arbitrary rule reasons before
implementation; eligibility now pins the canonical check prefix and delimiter,
closing parenthesis and exact suffix, with negative regressions.

Frozen actual report: 9 findings, 4 eligible checks, 1 shared note; 2828 to 2626
UTF-8 bytes (202 removed), 2790 to 2596 characters (194 removed). Restoring the
common suffix recreates the complete baseline report byte-for-byte. Findings
remain unchanged; doctor.mjs diagnostic/JSON/main/exit source is unchanged.

54/54 targeted checks passed through heavy admission on Node 25.6.1/macOS:
nine isolated renderer tests plus 45 existing/new doctor, guard, exit, JSON,
repair, standing-context, routine-command and CLI-migration checks. Exact input
and log hashes are retained. No local full suite or Node 20/22/24 matrix claim.
No native-token/runtime/workflow/subscription savings measured. Independent
implementation review: ship, no actionable findings. Reviewer independently
reconstructed the entire baseline report, verified five current/baseline source
hashes and the test-log hash, and confirmed the diagnostic source is unchanged.
Doctor exit 0, no issues; two old WP-18 warnings plus sandbox process-table
limitation. Next exit 0.

## Technical Notes

Text-only deduplication under accepted ADR-0008. No public flags, schema changes,
new architecture, model settings, native pilots or historical budget changes.

## Dependencies

- Accepted ADR-0008; existing pure Doctor report renderer.

## Attachments

- `.waypost/experiments/wp21-doctor-guard-guidance-20261023/`: frozen actual findings/metadata and baseline text/source hashes; further comparison and validation evidence will be retained here.

---

*Last updated: 2026-10-23*
