---
type: story
id: "story-recover-handoffs-after-forced-interruption-within-an-overall-deadline"
epic: "WP-24"
title: "Recover handoffs after forced interruption within an overall deadline"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-03
updated: 2026-11-04
external_refs: {}
tags: []
code_refs: ["scripts/handoff-delivery.mjs", "bin/cli/handoff-delivery.mjs", "bin/cli/handoff-process.mjs", "tests/handoff-delivery.test.mjs", "tests/handoff-recovery.test.mjs", "tests/helpers/handoff-interruption.mjs", "tests/native-protocol-delivery-host.test.mjs", "docs/handoffs.md"]
specs: []
started_at: "2026-11-03T01:07:29.608Z"
closed_at: "2026-11-04T03:53:33.954Z"
plan_updated_at: "2026-11-03T01:07:29.608Z"
blocked_by: ["WP-24/story-preflight-managed-handoffs-and-generate-private-route-configuration"]
---

# Recover handoffs after forced interruption within an overall deadline

## Description

Owner-approved continuation of Portable task handoffs with verifiable evidence.

## Implementation Plan

Use the existing delivery state machine and authority with a persisted absolute deadline, remaining-time command context and bounded held-child cleanup. Validate actual process interruption at each persisted boundary and preserve unknown consumed accounting.

## Acceptance Criteria

- [x] An overall bounded deadline limits team subprocesses and preserves the last acknowledged state on timeout. — evidence: all-six-focused.log380pass, all-six-cli-guards.log9pass and independent phase2/3 reviewer ship.
- [x] Real child-process interruption tests cover persisted-before-send, sent, consumed and received boundaries. — evidence: all-six-focused.log380pass, all-six-cli-guards.log9pass and independent phase2/3 reviewer ship.
- [x] Resume preserves message/challenge/request identity; received output forwards without another inference. — evidence: all-six-focused.log380pass, all-six-cli-guards.log9pass and independent phase2/3 reviewer ship.
- [x] Consumed unknown outcomes retain existing accounting reservation and never silently launch a replacement call. — evidence: all-six-focused.log380pass, all-six-cli-guards.log9pass and independent phase2/3 reviewer ship.

## Final Summary

Implemented persisted initial deadline and an asynchronous bounded team-command runner. Resume cannot extend the deadline or change question identity. Five real Node SIGKILL surrogate boundaries and native-authority unknown/refusal/received-replay tests passed; independent reviewer ship. Only held caller child closure is observed; native closure remains unknown absent Host proof, and library callbacks must cooperate. Focused snapshot passed380tests plus9CLIguards.
