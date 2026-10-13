---
type: story
id: "story-a-source-on-another-machine-reaches-each-vm-through-a-local-cache"
epic: "WP-22"
title: "A source on another machine reaches each VM through a local cache"
status: planned
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-13
updated: 2026-10-13
external_refs: {}
tags: []
code_refs: []
specs: []
blocked_by: ["WP-22/story-global-rules-reach-every-installed-harness-and-doctor-refuses-a-machine-where-they-do-not"]
started_at: null
closed_at: null
plan_updated_at: null
---

# A source on another machine reaches each VM through a local cache

| Field | Value |
|---|---|
| **Epic** | [WP-22](../epic.md) |
| **Status** | planned |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

The owner's VMs read the host's source over a Parallels share. They must get
the rules from a local cache, so a sleeping host leaves yesterday's rules,
never none, and the host's own Claude files must not load beside the VM's.
Decision: [Owner's global rules: one harness-neutral source, reaching every installed harness on every machine](../../../adr/owners-global-rules-one-harness-neutral-source-reaching-every-installed-harness-on-every-machine.md) (Decisions 1, 2, 4).

## Decomposition

- [ ] `storageOf()` on `realpathSync.native` of the source; a mapped drive
      stored as UNC; an unresolvable drive letter refused.
- [ ] Local cache in the machine state; advanced only by `brief` and `rules`
      (with a timeout, a skip-if-recent window, and a single-instance guard so
      sleeping-host reads do not pile up); `doctor --global` only reports
      "source differs from cache since …".
- [ ] The `claudeMdExcludes` entry for another account's home that is an
      ancestor of the working directories (from the mount table; the registry's
      ancestor list incl. `.claude/AGENTS.md`), behind the gate.
- [ ] Reading a remote source: `doctor --global` and `brief` each in a child
      process with its own timeout; the project `doctor` never.
- [ ] Network reads in an async, detached child abandoned at the deadline,
      re-read after the settle time; the storage kind is the one recorded by
      `rules source`, never resolved by `brief`.
- [ ] Cloud-synced sources (iCloud, OneDrive placeholders) read like remote
      ones, through the deadline-bound reader.
- [ ] Runbook: does a host `.claude/CLAUDE.md` excluded by `claudeMdExcludes`
      still suppress Claude's native `AGENTS.md` reading on the VM?

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

## Acceptance Criteria

- [ ] With the source on the host share, both VMs render from a local cache.
- [ ] With the host unreachable, `doctor --global` returns within its timeout
      and reports the cache age, and a fresh session still has the rules.
- [ ] On the Linux VM, a session in a project under the host's home lists no
      host `CLAUDE.md`; on `FROSTBEBE`, the same in a project under `Y:\`.
- [ ] The project `doctor` never touches a remote path.

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

## Dependencies

- `story-global-rules-reach-every-installed-harness-and-doctor-refuses-a-machine-where-they-do-not`.

## Attachments

-

---

*Last updated: 2026-10-13*
