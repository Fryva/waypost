---
type: story
id: "story-command-guards-opt-in-behind-vault-config-never-run-by-fix"
epic: "WP-16"
title: "check guards name the project's own fitness command; doctor prints it and never runs it"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-09-04
updated: 2026-09-04
external_refs: {}
tags: []
code_refs: []
specs: []
blocked_by: ["WP-16/story-doctor-evaluates-regex-guards-of-accepted-adrs"]
started_at: "2026-09-04T18:29:11.607Z"
closed_at: "2026-09-04T18:29:12.550Z"
plan_updated_at: "2026-09-04T18:29:11.607Z"
---

# check guards name the project's own fitness command; doctor prints it and never runs it

| Field | Value |
|---|---|
| **Epic** | [WP-16](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

The first draft of ADR-0011 had `run` guards executed by doctor behind a
vault-level opt-in. The critic pass showed the opt-in would travel with the
vault and `waypost next` runs doctor in full on every session start, so a clone
would execute a stranger's command before anyone read the ADR. The revised
decision keeps the link and drops the execution: `check` names the project's
own fitness command, doctor prints it beside the ADR, and nothing runs.

## Decomposition

- [x] `check` parsed with the other guard kinds; printed in the `adr-guard` info line — evidence: scripts/doctor.mjs `checkGuards`
- [x] A sentinel test proves doctor never executes it — evidence: scripts test (`touch RAN` named, file never appears); the whole doctor path has no execution site for it, `--fix` included
- [x] Docs: how to pair `check` with the project's test suite — evidence: docs/how-it-works.md "Guards", AGENTS.md

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

## Acceptance Criteria

- [x] A `check` guard is shown with its ADR and `why` (test) — evidence: scripts test, level info
- [x] The named command is never executed on any doctor path (sentinel test) — evidence: scripts test; there is no `spawnSync` of a guard anywhere, which ADR-0011's own guard now forbids

## Final Summary

Nothing runs; the link is a name. ADR-0008 uses it for the standing-context test.

## Technical Notes

Markdown must not become a way to run commands on someone else's machine; there is no opt-in because there is no execution.

## Dependencies

- story-doctor-evaluates-regex-guards-of-accepted-adrs

## Attachments

-

---

*Last updated: 2026-09-04*
