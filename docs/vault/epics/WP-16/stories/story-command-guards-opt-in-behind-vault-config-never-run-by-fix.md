---
type: story
id: "story-command-guards-opt-in-behind-vault-config-never-run-by-fix"
epic: "WP-16"
title: "check guards name the project's own fitness command; doctor prints it and never runs it"
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

# check guards name the project's own fitness command; doctor prints it and never runs it

| Field | Value |
|---|---|
| **Epic** | [WP-16](../epic.md) |
| **Status** | planned |
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

- [ ] `check` field parsed with the other guard kinds; printed in the `adr-guard` context line
- [ ] A sentinel test proves doctor never executes it, through `waypost doctor`, `doctor --fix` and `waypost next`
- [ ] Docs: how to pair `check` with the project's test suite (option 2 of ADR-0011)

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

## Acceptance Criteria

- [ ] A `check` guard is shown with its ADR and `why` (test)
- [ ] The named command is never executed on any doctor path (sentinel test)

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

Markdown must not become a way to run commands on someone else's machine; there is no opt-in because there is no execution.

## Dependencies

- story-doctor-evaluates-regex-guards-of-accepted-adrs

## Attachments

-

---

*Last updated: 2026-09-04*
