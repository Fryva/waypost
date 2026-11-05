---
type: story
id: "story-same-named-machines-keep-each-others-live-records"
epic: "WP-19"
title: "Same-named machines keep each other's live records"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-05
updated: 2026-11-05
external_refs: {}
tags: []
code_refs: ["scripts/presence-host.mjs", "scripts/presence-process.mjs", "scripts/presence-lease-groups.mjs", "bin/cli/deleter.mjs", "bin/cli/slots.mjs", "tests/host-identity.test.mjs", "tests/presence.test.mjs", "tests/host-home.mjs", "scripts/presence.mjs", "scripts/presence-liveness.mjs", "scripts/presence-checkout.mjs", "scripts/brief.mjs", "scripts/sessions.mjs"]
specs: []
started_at: "2026-11-05T05:37:11.441Z"
closed_at: "2026-11-05T06:18:34.530Z"
plan_updated_at: "2026-11-05T05:37:11.441Z"
---

# Same-named machines keep each other's live records

| Field | Value |
|---|---|
| **Epic** | [WP-19](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

"Same host" was the short hostname. Two devices with a default name (two `MacBook-Pro`s) sharing a vault or checkout read each other's live presence records, leases and deleter markers as local, found their pids missing from the local process table and called them gone — `sessions --prune` could reap a live foreign session and the deleter could adopt a foreign marker. Separately, the adjacent-lease grouping helpers were copied verbatim into brief, sessions and lease list.

## Decomposition

- [x] `hostId()`: a hash of the OS machine id (`/etc/machine-id`, IOPlatformUUID, MachineGuid — the raw value never leaves the module), so every account on one machine agrees; a random `r-` id only where the OS gives none; cached atomically in `<machineStateDir>/host-id.<hostSlug>`, null on any filesystem error.
- [x] `sameHost(rec)`: by `host_id` when both sides have one, else the old short-name comparison (legacy records).
- [x] Presence, lease and slot/deleter records carry `host_id`; processGone, peers, sharedTree and the deleter's leftovers use sameHost.
- [x] One `leaseRunEnd` shared by brief, sessions and lease list.

## Implementation Plan

New leaf modules `presence-host.mjs` and `presence-lease-groups.mjs` keep the pinned export lists of presence-process/presence-storage unchanged; `host` stays for display.

## Acceptance Criteria

- [x] A record with the same short name but another host_id is never judged by the local process table; our own id with a dead pid is gone; a record without host_id behaves as before. — evidence: tests/host-identity.test.mjs.
- [x] hostId is stable across processes and the same for two HOMEs of one machine; an empty or broken cache is replaced; an unwritable state gives null and the name fallback. — evidence: tests/host-identity.test.mjs.
- [x] sharedTree reports a same-named foreign machine on our root, and the deleter leaves (does not adopt) a same-named foreign marker. — evidence: tests/host-identity.test.mjs sharedTree and leftoversOf cases.
- [x] Lease grouping output of brief, sessions and lease list is unchanged. — evidence: tests/presence.test.mjs grouping tests unchanged, tests/host-identity.test.mjs leaseRunEnd.

## Final Summary

Focused presence/slots/capacity/limit/doctor-coordination/commits 306/306 (7 skipped). Independent review moved the id from per-HOME to per-machine (two accounts on one host would otherwise each be a foreign host, defeating the rule that a record whose harness process runs on this host is never reaped by age) and made minting atomic; presence tests now run with a throwaway HOME (tests/host-home.mjs). Limits: a record written by an older version on a same-named machine stays vulnerable until its next beat; where the OS gives no machine id two accounts fall back to separate random ids; team-store authority keeps the full hostname (out of scope). Only the darwin branch was exercised; not verified live on two machines. Full suite on the combined tree after all review fixes: 2509 tests, 2500 pass, 0 fail, 9 skipped (macOS, Node 25, `npm test` in the heavy slot). Fresh waypost-reviewer pass over all four stories; its blocker and should-fixes are applied.

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-11-05*
