---
type: epic
id: "WP-22"
title: "The owner's global rules on every machine and harness"
status: planned
priority: p2
created: 2026-10-13
updated: 2026-10-13
external_refs: {}
tags: []
code_refs: []
review_status: pending
reviewed_at: null
---

# WP-22: The owner's global rules on every machine and harness

| Field | Value |
|---|---|
| **Status** | planned |
| **Priority** | p2 |
| **Created** | 2026-10-13 |
| **Updated** | 2026-10-13 |

---

## Goal

Every harness installed on every machine the owner works on loads the same
global rules, from one harness-neutral source; `waypost doctor` says so, or
names the harness, surface and machine where it is not true. Each machine replies
in its own user's language.

## Context

Waypost keeps one source of project rules (`AGENTS.md`) but has nothing for
the owner's global rules. On 2026-10-13 the Windows VM `FROSTBEBE` turned out
to have no global rules file at all, the host's Codex and OpenCode files reach
its `CLAUDE.md` only through prose with a macOS path, and the "answer in
Russian" rule was in those two but not in `CLAUDE.md`. Decision:
[Owner's global rules: one harness-neutral source, reaching every installed harness on every machine](../../adr/owners-global-rules-one-harness-neutral-source-reaching-every-installed-harness-on-every-machine.md).

## Stories

| Story | Status | Description |
|-------|--------|-------------|
| `story-global-rules-reach-every-installed-harness-and-doctor-refuses-a-machine-where-they-do-not` | planned | The base: a local source to Claude Code, Codex, OpenCode — gated install, automatic re-render with the bad-source guard, read-only `doctor --global` |
| `story-a-source-on-another-machine-reaches-each-vm-through-a-local-cache` | planned | Remote source through a local cache; host Claude files excluded on VMs |
| `story-each-machine-replies-in-its-own-users-language` | planned | Machine-local reply language, explicit or recorded automatically |
| `story-the-owners-global-files-on-every-machine-migrate-into-the-one-source` | planned | Merge the host and VM files into the source, with the owner |

## Expected Results

- [ ] One harness-neutral source holds every owner rule; harness files are generated delivery points only.
- [ ] The registry names each harness's global rules file, graded by evidence.
- [ ] `waypost doctor --global` reports a missing or drifted managed block as an issue, per installed harness; the project doctor only warns.
- [ ] `rules install --global` delivers without system privileges, and a remote source through a local cache.
- [ ] The reply language is machine-local, recorded automatically and never overwriting an explicit choice.
- [ ] The current global files on every machine are merged into the source, with the owner.

## Dependencies

- ADR-0005 harness registry (the new field lives there).

## Open Questions

- [ ] How each current section is phrased in the neutral source (conditions instead of harness names) — the owner decides at migration.
- [ ] Which Claude surfaces the owner uses on the VMs actually load user scope — load tests decide.

## Related

- WP-14 "Skills as the portable layer, and the first verified harnesses" — the registry's evidence grades.

---

*Last updated: 2026-10-13*
