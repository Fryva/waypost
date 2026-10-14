---
type: story
id: "story-an-empty-team-authority-on-a-network-share-does-not-block-commits-from-another-machine"
epic: "WP-19"
title: "An empty team authority on a network share does not block commits from another machine"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-14
updated: 2026-10-14
external_refs: {}
tags: []
code_refs: []
specs: []
started_at: "2026-10-14T02:49:04.408Z"
closed_at: "2026-10-14T02:49:30.822Z"
plan_updated_at: "2026-10-14T02:49:04.408Z"
---

# An empty team authority on a network share does not block commits from another machine

| Field | Value |
|---|---|
| **Epic** | [WP-19](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

The owner works on one checkout from the macOS host and from VMs that see it
over a share (`FROSTBEBE`: `Y:` = `\\Mac\frost`). The first `waypost commit`
on the host created the team authority directory
(`.git/waypost/docs-vault/teams/authority`) on its local disk — empty, no team
ever existed. From the VM the same directory is on network storage, and the
legacy gate refused every `waypost commit`, `story plan` and `story close`
with `authority-nonlocal`: nothing could be committed through Waypost from a VM.

The teams ADR ("Model-aware teams…") keeps authoritative mutations off network
storage, and that stays. But an empty authority holds no team to protect, and
the gate already passes when no authority exists there; an empty one is the
same case. A non-empty one (an identity, an event, a lock) still refuses —
work alongside an active team from another machine needs a relay, a separate
decision.

## Decomposition

- [x] `withAuthorityGate` (`scripts/team-store.mjs`): on non-local storage an
      authority directory with no entries passes like an absent one; nothing is
      written into it.
- [x] Tests: the gate on an empty and a non-empty authority; `waypost commit`
      through an empty one; the earlier refusal test now uses a real
      (non-empty) authority.
- [x] Live on `FROSTBEBE`.

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

## Acceptance Criteria

- [x] On non-local storage an empty authority passes the legacy gate and stays
      empty — evidence: `tests/team-store.test.mjs` "the legacy gate passes an
      empty authority on non-local storage, and still refuses one that holds
      anything"; red with HEAD's `team-store.mjs`, green with the fix.
- [x] One that holds anything still refuses with `authority-nonlocal` —
      evidence: the same test; `tests/commits.test.mjs` "a commit the team
      gate refuses for non-local storage says so in one line…".
- [x] `waypost commit` works through an empty authority on non-local storage
      — evidence: `tests/commits.test.mjs` "an EMPTY team authority on
      non-local storage does not block a commit"; red with HEAD, green with
      the fix.
- [x] Live: `waypost story plan --write` from `FROSTBEBE` on 2026-10-14
      moved the WP-18 slot story to in-progress and claimed it; the authority
      directory stayed empty.

## Final Summary

An empty team-authority directory on non-local storage now passes the legacy gate like an absent one (`withAuthorityGate`, `scripts/team-store.mjs`), and nothing is written into it; a non-empty one still refuses with `authority-nonlocal`. Why: the host created the directory on its local disk, so from a VM over the share every `waypost commit`, `story plan` and `story close` was refused although no team existed. Tests: `tests/team-store.test.mjs`, `tests/commits.test.mjs` — 66/66 on `FROSTBEBE`, the two new ones red with HEAD. Live: `story plan --write` from `FROSTBEBE`. Follow-up: working beside an active team from another machine needs the relay the teams ADR names.

## Technical Notes

- Suite: `tests/team-store.test.mjs` + `tests/commits.test.mjs`, 66/66 on
  `FROSTBEBE`.
- Not covered, by design: a non-empty authority (a team exists or existed)
  still refuses from another machine; the teams ADR's "remote sessions use a
  verified relay or wait" applies.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-14*
