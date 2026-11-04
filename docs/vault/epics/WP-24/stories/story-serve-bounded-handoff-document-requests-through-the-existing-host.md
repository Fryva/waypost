---
type: story
id: "story-serve-bounded-handoff-document-requests-through-the-existing-host"
epic: "WP-24"
title: "Serve bounded handoff document requests through the existing host"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-03
updated: 2026-11-04
external_refs: {}
tags: []
code_refs: ["scripts/handoff-retrieval.mjs", "bin/cli/handoff-retrieval.mjs", "tests/handoff-retrieval.test.mjs", "scripts/handoff-delivery.mjs", "docs/handoffs.md", "docs/handoff-experiment-2026-11-04.md", "scripts/team-cli.mjs", "scripts/team-store.mjs", "tests/team-cli.test.mjs", "tests/team-store.test.mjs"]
specs: []
started_at: "2026-11-04T03:43:34.865Z"
closed_at: "2026-11-04T04:58:59.119Z"
plan_updated_at: "2026-11-04T03:43:34.865Z"
blocked_by: ["WP-24/story-compare-real-coding-continuations-against-history-summary-and-packet"]
---

# Serve bounded handoff document requests through the existing host

## Description

Owner-approved continuation of Portable task handoffs with verifiable evidence.

## Implementation Plan

Use an opt-in continuation loop above existing managed delivery. Validate explicit packet references and current hashes before serving bounded UTF-8 ranges. Persist deterministic round keys and cumulative fragments; replay existing authority on resume. Demonstrate a real two-round native request and a replay without additional inference.

## Acceptance Criteria

- [x] The receiver can request explicit manifest-authorized UTF-8 documents or bounded line ranges without filesystem tools or arbitrary path access. — evidence: scripts/handoff-retrieval.mjs and12 deterministic retrieval tests; actual two-round request for ledger line40 returned the exact separate oracle.
- [x] The host verifies exact packet/file hashes for every response, bounds request count/ranges/bytes and refuses stale, oversized or malformed requests. — evidence: allowlist/current SHA256/strict UTF-8/range/byte limits exercised, including retained earlier fragments.
- [x] Each native request round uses existing admission/receipts and a persisted deterministic round key; all rounds count toward call and token ceilings. — evidence: native two-round received/settled records plus one supplemental inline-data continuation; immediate public replay made0 new calls and preserved deadline; CLI timestamp regression82pass.
- [x] V1 one-shot delivery remains compatible; structured data requests cannot execute commands or promote permissions. — evidence: one-shot delivery regressions remain green; source data grants no tools/authority.

## Final Summary

Implemented bounded opt-in data requests through existing authenticated delivery. Actual two-round retrieval succeeded. Its initial replay exposed unstable generated CLI command time; fixed by recovering command_at from verified events while retaining full command digest and mutex authorization.82 targeted regressions pass. Original expired deadline was never extended; a separate one-round supplemental continuation verifies actual public replay with0 additional native calls. Total cohort remains17 calls.
