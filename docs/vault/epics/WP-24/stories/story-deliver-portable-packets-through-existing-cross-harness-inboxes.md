---
type: story
id: "story-deliver-portable-packets-through-existing-cross-harness-inboxes"
epic: "WP-24"
title: "Deliver portable packets through existing cross-harness inboxes"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-02
updated: 2026-11-02
external_refs: {}
tags: []
code_refs: ["scripts/handoff.mjs", "scripts/handoff-delivery.mjs", "bin/cli/handoff-delivery.mjs", "tests/handoff-delivery.test.mjs", "scripts/team-host.mjs", "scripts/team-cli.mjs", "tests/native-protocol-delivery-host.test.mjs", "bin/cli/handoff.mjs", "bin/cli/help.mjs", "tests/harness.test.mjs", "docs/handoffs.md", "docs/cli-reference.md", "docs/handoff-experiment-2026-11-02.md"]
specs: []
blocked_by: ["WP-24/story-capture-command-outcomes-with-selected-input-snapshots"]
started_at: "2026-11-02T20:13:39.574Z"
closed_at: "2026-11-02T21:04:30.339Z"
plan_updated_at: "2026-11-02T20:13:39.574Z"
---

# Deliver portable packets through existing cross-harness inboxes

| Field | Value |
|---|---|
| **Epic** | [WP-24](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Deliver portable packets through existing cross-harness inboxes, the next ordered slice of the owner-authorized WP-24 experiment.

## Implementation Plan

Add a bounded handoff payload/host hydration using the existing authenticated team mailbox and managed native delivery. Send only an explicit packet locator+hash plus bounded selected context; receiver challenge/ACK is correlated using existing receipts. Validate schema, snapshot and bounds before hydration, mark data untrusted, refuse stale snapshots, and never execute imported strings. No new team authority, arbitrary-session wake claim, watcher, provider key or automatic role injection. A tool-free managed receiver requires host-side inspection/hydration, not pretending it read a path itself. Preserve v1 and unmanaged inbox delivery. Implementation: scripts/handoff-delivery.mjs plus bin/cli/handoff-delivery.mjs, called by the existing lazy handoff handler. Includes are strict UTF-8 buffers bound to the exact packet digest; final freshness rechecks both packet bytes and selected files. State persists challenge/request key/message ID/stage before paid work and resumes the same question. Add optional targetMessageId to subscription-v2 relay/CLI --message-id; filter fresh and recovered deliveries, rejecting invalid targets before inference. Legacy relay refuses targeted mode. This avoids paying for unrelated backlog. The receiver gets inline bytes, not filesystem access.

## Acceptance Criteria

- [x] Packet payload has a versioned bounded locator/hash and is validated against current selected files before delivery; stale/tampered inputs fail closed. — evidence: scripts/handoff-delivery.mjs, tests/handoff-delivery.test.mjs; v5 62 focused + 9 CLI guards passed against 424 unchanged source hashes.
- [x] Existing authenticated send/inbox/managed-delivery path is reused; no synthetic harness marker is presented as live delivery. — evidence: bin/cli/handoff-delivery.mjs and targeted subscription-v2 relay; independent prelive review. Live native acceptance remains separate.
- [x] An actual second native harness receives bounded packet context and returns correlated acknowledgement under the owner allocation. — evidence: both public-CLI packet arms answered, complete Claude Sonnet native receipts, frozen payload hashes and current checkpoint independently verified; docs/handoff-experiment-2026-11-02.md.
- [x] Deterministic transport/hydration regressions and independent review pass; unsupported arbitrary desktop wake remains explicit. — evidence: v5 71 pass / 0 fail, pagination/managed-proof/replay regressions, independent reviewer ship-prelive; docs/handoffs.md.

## Final Summary

Implemented bounded hydration, existing authenticated mailbox delivery, targeted relay and restart state. Deterministic checks and independent review pass. Actual Claude delivery completed after owner login: both public-CLI packet arms reached answered with correlated nonce/output digest, current selected snapshot and complete settled native receipts. All four experiment answers matched the six-case oracle. Earlier executable-path and login refusals cost0 and remain retained. Total experiment32187 tokens; prior policy restored. See docs/handoff-experiment-2026-11-02.md; independent final reviewer ship: all four acceptance criteria met, authority replay revision48 and final current budget verified.
