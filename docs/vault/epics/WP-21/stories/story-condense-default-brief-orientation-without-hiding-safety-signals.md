---
type: story
id: "story-condense-default-brief-orientation-without-hiding-safety-signals"
epic: "WP-21"
title: "Condense default brief orientation without hiding safety signals"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-22
updated: 2026-10-22
external_refs: {}
tags: []
code_refs: ["scripts/brief.mjs", "scripts/lib.mjs", "tests/predicates.test.mjs", "tests/harness.test.mjs", "docs/how-it-works.md"]
specs: []
started_at: "2026-10-22T22:55:26.231Z"
closed_at: "2026-10-22T23:00:10.390Z"
plan_updated_at: "2026-10-22T22:55:26.231Z"
---

# Condense default brief orientation without hiding safety signals

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Default brief is paid context on every new session. Its folder reference repeats
Markdown table framing even though README purposes are already behind `--full`.
Use a compact list while retaining every folder path, kind and count. This is a
formatting increment under accepted ADR-0008, not a new native benchmark.

## Decomposition

- [x] Add an opt-in compact folder list to the pure skeleton renderer.
- [x] Select it only for default brief and protect compatibility with tests.
- [x] Record a frozen-input size comparison, review and targeted validation.

## Implementation Plan

Keep the existing renderer default and full mode unchanged. Add an explicit
compact folder option in `renderVaultSkeleton`; default `brief` opts into it.
Iterate the same folder facts and use the existing count formatter. Only folder
reference markup changes: preserve policy, in-flight/timeout, Derived guidance,
and all presence, shared-checkout, team, cleanup and Git appenders.

Extend the existing renderer regression for custom and empty folders, separate
epic/story counts, unchanged non-folder sections and immutable facts. Update the
brief integration fixture and retain its existing size ceiling, preserving compact/full JSON parity.
Capture before/after using the same frozen facts; report UTF-8 bytes and characters
without inferring native tokens, quota or product-level savings. Run targeted
checks through the heavy gate, then a fresh reviewer before lifecycle close.

## Acceptance Criteria

- [x] Default brief retains every folder, kind and count, including custom and empty folders and distinct epic/story counts; only folder markup changes. — evidence: `skeleton folder list preserves facts and changes only folder markup`, 25/25 targeted checks.
- [x] Existing renderer default and `--full` remain byte-identical on frozen facts, JSON remains complete, and non-folder sections remain byte-identical, including timeout and safety appenders. — evidence: frozen full comparison and `measurement.json`; shared-checkout/Git integration tests; exact base comparison proves `brief` only changes renderer arguments.
- [x] Targeted regressions pass against identified source hashes; retained before/after evidence measures the actual static reduction with no native-token claim. — evidence: `.waypost/experiments/wp21-brief-list-20261022/verification.json` and `tests.log`.

## Final Summary

Default brief now renders ``- `path/` kind: count`` from the same facts rather than
repeating a table header and cell separators. Full mode and the renderer's default
remain unchanged. Purpose remains independently supported in either renderer
format. No role, review, coordination or budget behavior changed.

On the retained frozen facts (SHA256
`b589855dca4b4a09afdd2269d10640e2352fca44bb22d65978ebbf60d44779c2`),
compact orientation decreased from **1097 to 1017 characters** (7.29%) and
**1110 to 1030 UTF-8 bytes** (7.21%). Full text and all non-folder text were
byte-identical. These counts exclude dynamic appenders and do not establish
native token, subscription-quota or product-level savings.

Targeted heavy-gated checks: **25/25 passed**, Node v25.6.1 on macOS; full suite
and Node20/22/24 matrix were not run locally. Runtime tests cover JSON parity,
shared-checkout warnings and other authors' commits. A base-source comparison
confirms all dynamic appender implementations and composition are unchanged.
Fresh-context `waypost-reviewer` independently verified source/log hashes, frozen
comparisons and all acceptance criteria: story closed / commit, no actionable
findings. Doctor: 0 issues, two pre-existing WP-18 code-ref warnings.

## Technical Notes

Do not read live sequential outputs as an identical-input comparison. All dynamic
appenders stay outside the folder-format change. Do not reopen closed experiment
ledgers or change role models or review requirements.

## Dependencies

- Accepted ADR-0008; no new architectural choice.

## Attachments

- `.waypost/experiments/wp21-brief-list-20261022/`: frozen facts, before/after text, full baseline, source hashes, measurement and validation log (local evidence).

---

*Last updated: 2026-10-22*
