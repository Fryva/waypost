---
type: story
id: "story-command-guards-opt-in-behind-vault-config-never-run-by-fix"
epic: "WP-16"
title: "Command guards opt-in behind vault config, never run by --fix"
status: planned
priority: p2
assignee: "Ivan Morozov"
created: 2026-09-04
updated: 2026-09-04
external_refs: {}
tags: []
code_refs: []
specs: []
started_at: null
closed_at: null
plan_updated_at: null
---

# Command guards opt-in behind vault config, never run by --fix

| Field | Value |
|---|---|
| **Epic** | [WP-16](../epic.md) |
| **Status** | planned |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

`run` guards execute only when `<vault>/.projectstore.json` sets `guards_run: on`, never under `doctor --fix`, with a timeout, and the finding shows the command's last lines.

## Decomposition

- [ ] Config read, execution path, timeout
- [ ] Tests: refused without opt-in; never executed under --fix

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

## Acceptance Criteria

- [ ] Without the opt-in a run guard is reported as skipped, not executed (test)
- [ ] `--fix` never executes a run guard (test)

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

Markdown must not become a way to run commands on someone else's machine; the opt-in is per vault.

## Dependencies

- story-doctor-evaluates-regex-guards-of-accepted-adrs

## Attachments

-

---

*Last updated: 2026-09-04*
