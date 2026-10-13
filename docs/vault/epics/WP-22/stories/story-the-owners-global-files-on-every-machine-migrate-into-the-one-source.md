---
type: story
id: "story-the-owners-global-files-on-every-machine-migrate-into-the-one-source"
epic: "WP-22"
title: "The owner's global files on every machine migrate into the one source"
status: planned
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-13
updated: 2026-10-13
external_refs: {}
tags: []
code_refs: []
specs: []
blocked_by: ["WP-22/story-global-rules-reach-every-installed-harness-and-doctor-refuses-a-machine-where-they-do-not","WP-22/story-a-source-on-another-machine-reaches-each-vm-through-a-local-cache","WP-22/story-each-machine-replies-in-its-own-users-language"]
started_at: null
closed_at: null
plan_updated_at: null
---

# The owner's global files on every machine migrate into the one source

| Field | Value |
|---|---|
| **Epic** | [WP-22](../epic.md) |
| **Status** | planned |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

The host's `~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md` and
`~/.config/opencode/AGENTS.md`, and the VMs' hand-made files, are merged into
the one source with the owner; afterwards each holds only its generated part.
Decision: [Owner's global rules: one harness-neutral source, reaching every installed harness on every machine](../../../adr/owners-global-rules-one-harness-neutral-source-reaching-every-installed-harness-on-every-machine.md) (Decision 6).

## Decomposition

- [ ] List every global file and native language value on the host and both
      VMs by path, size, digest.
- [ ] Back them up in the machine state (owner-only permissions).
- [ ] Report rules outside the source (bytes outside the Claude block,
      `~/.claude/rules/*`, Codex `developer_instructions` /
      `model_instructions_file`, OpenCode `instructions`) — count, size, digest;
      an issue after migration.
- [ ] The live-check runbook: gated and automatic paths, per surface.
- [ ] Seed the source from the host's hub file and list duplicates; the
      owner edits it in `$EDITOR` (harness names as conditions, prose pointers
      removed).
- [ ] Reply-language sentences removed from the rules and recorded per
      machine as `explicit`.
- [ ] `rules install --global` on each machine; `doctor --global` clean.

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

## Acceptance Criteria

- [ ] No owner rule remains authored only in a harness file on any machine
      (`doctor --global` reports zero rules outside the source).
- [ ] Every replaced file has a backup, and uninstall offers it.
- [ ] `doctor --global` reports no issue on the host and both VMs (excluded
      surfaces listed as info); live checks recorded.

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

## Dependencies

- `story-global-rules-reach-every-installed-harness-and-doctor-refuses-a-machine-where-they-do-not`; `story-a-source-on-another-machine-reaches-each-vm-through-a-local-cache`; `story-each-machine-replies-in-its-own-users-language`.

## Attachments

-

---

*Last updated: 2026-10-13*
