---
type: story
id: "story-live-verification-codex-and-opencode-run-the-whole-loop"
epic: "WP-14"
title: "Live verification: Codex and OpenCode run the whole loop"
status: in-progress
priority: p1
assignee: "Ivan Morozov"
created: 2026-09-04
updated: 2026-09-04
external_refs: {}
tags: []
code_refs: []
specs: []
started_at: "2026-09-04T16:55:06.081Z"
closed_at: null
plan_updated_at: "2026-09-04T16:55:06.081Z"
---

# Live verification: Codex and OpenCode run the whole loop

| Field | Value |
|---|---|
| **Epic** | [WP-14](../epic.md) |
| **Status** | in-progress |
| **Priority** | p1 |
| **Assignee** | Ivan Morozov |

---

## Description

Run the whole loop for real in Codex CLI and OpenCode against a throwaway project: setup, brief, draft a story, claim it, commit through `waypost commit`, a role pass, sessions and leases. Record what worked, fix what did not, and set both registry entries to `verified` with the date.

## Decomposition

- [x] Runbook written and used — evidence: docs/vault/ops/verify-a-harness-live-the-whole-waypost-loop-in-one-session.md
- [x] OpenCode, partial: `waypost brief` and `waypost next` ran through its bash tool headless (session ses_f92a9951…, 2026-09-04); the full nine-step loop stalled twice after OpenCode's `init` without a session — evidence: registry note, ~/.local/share/opencode/log
- [x] Defect found and fixed: nested-harness detection by process (f2dfe91) — evidence: test "a harness started from inside another is detected by its process…"
- [ ] OpenCode, the full loop in an interactive session — owner's machine, runbook in hand
- [ ] Codex: install, sign in, run the runbook — owner's machine
- [x] README matrix with dates — evidence: README "Verified live"

## Implementation Plan

Runbook "Verify a harness live" in `ops/`; OpenCode driven headless with `opencode run --pure` from a throwaway project prepared by `waypost setup`; Codex needs installing and signing in first.

## Acceptance Criteria

- [ ] harnesses/codex.json and harnesses/opencode.json read `verified` with a 2026-09 date — not yet: both stay `documented`, with dated notes of what was exercised
- [x] README has the matrix — evidence: README "Verified live"
- [x] Any defect found has a test — evidence: f2dfe91

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

A headless run is evidence only for what it executed. The heaviest defect so far (nested-harness detection) surfaced within the first two commands of the first run, which is the argument for running the rest interactively rather than paper over it.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-09-04*
