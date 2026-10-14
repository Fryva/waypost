---
type: epic
id: "WP-23"
title: "Solo entry: one person, one harness"
status: planned
priority: p2
created: 2026-10-14
updated: 2026-10-14
external_refs: {}
tags: []
code_refs: []
review_status: pending
reviewed_at: null
---

# WP-23: Solo entry: one person, one harness

| Field | Value |
|---|---|
| **Status** | planned |
| **Priority** | p2 |
| **Created** | 2026-10-14 |
| **Updated** | 2026-10-14 |

---

## Goal

A developer who works alone, in one harness, can take the two parts of
Waypost that stand on their own — the deterministic `doctor` and trailered
commits carrying a tracker's task id — without the roles, skills and routing
block arriving uninvited, and finds that path at the top of the README.

## Context

2026-10-14 a solo Claude Code user (tasks in YouTrack) declined Waypost as too
heavy: vault, roles for 21 harnesses, session coordination, teams, heavy slots,
a start ritual. They would take the integrity check without an LLM and task ids
in commit trailers.

A first plan for a full solo profile was revised after its critic pass (it
conflicted with ADR-0006, the WP-18 routing-block rule and the fail-closed team
gate; the profile did not reach a clone; runtime savings ~30 ms). This epic now
covers the minimal answer; the profile is deferred.

## Stories

| Story | Status | Description |
|-------|--------|-------------|
| `story-commit-carries-an-external-task-id-in-a-waypost-task-trailer` | planned | `commit --task`, `Waypost-Task`, `log --task` |
| `story-doctor-vault-path-checks-a-vault-on-a-fresh-clone-without-a-binding` | planned | `doctor --vault <path>` for CI on a fresh clone |
| `story-a-vault-turns-briefs-self-install-off-for-every-clone` | planned | `"self_install": "off"` in the vault config |
| `story-readme-opens-a-path-for-working-alone-in-one-tool` | planned | the solo path in the README |

## Expected Results

- [ ] `commit --task PROJ-123` works with and without a vault
- [ ] CI checks a vault with `doctor --vault <path>` and no setup step
- [ ] a vault with self-install off gains no role or skill files from `brief` in any clone
- [ ] the README shows this path before the team material

## Dependencies

- ADR "Solo entry without a profile: an external task trailer, doctor on a vault path, a vault-level opt-out from self-install" (accepted)

## Open Questions

- [ ] The full solo profile (no presence, no team code): deferred until a measured need

## Related

- ADR-0006
