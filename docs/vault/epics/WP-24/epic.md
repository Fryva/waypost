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
code_refs: ["bin/cli/handoff-capture.mjs", "bin/cli/handoff-delivery.mjs", "bin/cli/handoff.mjs", "bin/cli/help.mjs", "bin/waypost.mjs", "docs/cli-reference.md", "docs/handoffs.md", "docs/handoff-experiment-2026-11-02.md", "scripts/handoff-capture.mjs", "scripts/handoff-delivery.mjs", "scripts/handoff.mjs", "scripts/run-budget.mjs", "scripts/team-cli.mjs", "scripts/team-host.mjs", "tests/handoff-capture.test.mjs", "tests/handoff-delivery.test.mjs", "tests/handoff.test.mjs", "tests/harness.test.mjs", "tests/native-protocol-delivery-host.test.mjs"]
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

- [[story-create-and-inspect-a-portable-task-packet-with-file-freshness-checks|Create and inspect a portable task packet with file freshness checks]] — first experimental slice, done.
- [[story-capture-command-outcomes-with-selected-input-snapshots|Capture command outcomes with selected input snapshots]] — capture first.
- [[story-deliver-portable-packets-through-existing-cross-harness-inboxes|Deliver portable packets through existing cross-harness inboxes]] — existing managed transport next.
- [[story-compare-continuation-quality-and-native-tokens-with-and-without-a-packet|Compare continuation quality and native tokens with and without a packet]] — owner500000 native token allocation.

## Expected Results

- A small standalone create/show command that preserves primary evidence pointers.
- Reproducible stale-input detection and explicit limits on caller-provided claims.
- Bounded command receipts tied to selected before/after source observations.
- Targeted delivery and recovery using existing managed team transport.

## Open Questions

- Preserve raw native input/cache/output breakdown; complete total is verified but separate buckets remain unavailable.
- Expand beyond the single synthetic task: frozen ABBA showed36.78% fewer native tokens with all four answers correct; no general coding-quality or latency claim.
- Owner500000 allocation:32187 consumed, historical17520 retained, prior admission policy restored.

## Related

- ADR-0008; WP-21 “Targeted evidence reads and reproducible role handoffs”.
