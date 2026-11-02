---
type: epic
id: "WP-24"
title: "Portable task handoffs with verifiable evidence"
status: planned
priority: p2
created: 2026-11-02
updated: 2026-11-02
external_refs: {}
tags: []
code_refs: ["scripts/handoff.mjs", "bin/cli/handoff.mjs", "bin/waypost.mjs", "bin/cli/help.mjs", "tests/handoff.test.mjs", "tests/harness.test.mjs", "docs/handoffs.md", "docs/cli-reference.md"]
review_status: pending
reviewed_at: null
---

# WP-24: Portable task handoffs with verifiable evidence

| Field | Value |
|---|---|
| **Status** | planned |
| **Priority** | p2 |
| **Created** | 2026-11-02 |
| **Updated** | 2026-11-02 |

---

## Goal

Allow any harness to continue a task from compact shared context and original
artifacts, with deterministic freshness checks and no model training.

## Context

Owner requested a first implementation and test after discussing SwaT. This is
portable application state, not KV transfer. Establish correctness before claiming
less repeated exploration or lower end-to-end cost.

## Stories

- [[story-create-and-inspect-a-portable-task-packet-with-file-freshness-checks|Create and inspect a portable task packet with file freshness checks]] — first experimental slice.

## Expected Results

- A small standalone create/show command that preserves primary evidence pointers.
- Reproducible stale-input detection and explicit limits on caller-provided claims.

## Open Questions

- Later: execution-bound evidence and measurement with a fixed owner allocation.
- Later: whether native harness integrations provide enough benefit to justify coupling.

## Related

- ADR-0008; WP-21 “Targeted evidence reads and reproducible role handoffs”.
