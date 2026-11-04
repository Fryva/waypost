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
code_refs: ["bin/cli/handoff-capture.mjs", "bin/cli/handoff-delivery.mjs", "bin/cli/handoff-prepare.mjs", "bin/cli/handoff-process.mjs", "bin/cli/handoff-retrieval.mjs", "bin/cli/handoff-transfer.mjs", "bin/cli/handoff.mjs", "bin/cli/help.mjs", "bin/waypost.mjs", "docs/cli-reference.md", "docs/handoff-experiment-2026-11-02.md", "docs/handoff-experiment-2026-11-04.md", "docs/handoffs.md", "scripts/evaluation-source.mjs", "scripts/handoff-benchmark-runtime.cjs", "scripts/handoff-benchmark.mjs", "scripts/handoff-capture.mjs", "scripts/handoff-delivery.mjs", "scripts/handoff-prepare.mjs", "scripts/handoff-retrieval.mjs", "scripts/handoff-transfer.mjs", "scripts/handoff.mjs", "scripts/native-usage.mjs", "scripts/run-budget.mjs", "scripts/team-cli.mjs", "scripts/team-host.mjs", "scripts/team-native-action.mjs", "scripts/team-role-calibration.mjs", "scripts/team-store.mjs", "scripts/team-subscription.mjs", "scripts/team-transport.mjs", "tests/handoff-benchmark.test.mjs", "tests/handoff-capture.test.mjs", "tests/handoff-delivery.test.mjs", "tests/handoff-prepare.test.mjs", "tests/handoff-recovery.test.mjs", "tests/handoff-retrieval.test.mjs", "tests/handoff-transfer.test.mjs", "tests/handoff.test.mjs", "tests/harness.test.mjs", "tests/helpers/handoff-interruption.mjs", "tests/native-protocol-delivery-host.test.mjs", "tests/native-usage.test.mjs", "tests/state-migrate.test.mjs", "tests/team-cli.test.mjs", "tests/team-host.test.mjs", "tests/team-store.test.mjs"]
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

- Historical raw buckets remain unknown; new17-call continuation preserves complete native input/cache/output breakdown.
- Three-task coding comparison: packet18025 vs history21152 vs summary17383 tokens; each2/3 accepted. No general coding-quality or latency claim.
- Owner500000 allocation:130706 consumed,369294 remain; unrelated historical17520 retained, reserved0, prior admission policy restored.

## Related

- ADR-0008; WP-21 “Targeted evidence reads and reproducible role handoffs”.


## Owner-approved continuation

The owner approved the following implementation order in this chat. Existing
measurement story finishes native usage detail and timing first. Then:

- [[story-preflight-managed-handoffs-and-generate-private-route-configuration|Preflight managed handoffs and generate private route configuration]] — implemented and independently reviewed; runtime acceptance recorded in its story.
- [[story-recover-handoffs-after-forced-interruption-within-an-overall-deadline|Recover handoffs after forced interruption within an overall deadline]] — implemented and independently reviewed; runtime acceptance recorded in its story.
- [[story-compare-real-coding-continuations-against-history-summary-and-packet|Compare real coding continuations against history summary and packet]] — implemented and independently reviewed; runtime acceptance recorded in its story.
- [[story-serve-bounded-handoff-document-requests-through-the-existing-host|Serve bounded handoff document requests through the existing host]] — implemented and independently reviewed; runtime acceptance recorded in its story.
- [[story-transfer-content-addressed-handoff-deltas-with-confirmed-receiver-baselines|Transfer content-addressed handoff deltas with confirmed receiver baselines]] — implemented and independently reviewed; runtime acceptance recorded in its story.

The original native allocation remains500000, with32187 already spent. New calls
share the remaining467813; preserve unrelated historical17520 too. Full native
bucket diagnostics can only be measured on new calls, never reconstructed as
fabricated historical zeros. Runtime receiver isolation and authority stay unchanged.
