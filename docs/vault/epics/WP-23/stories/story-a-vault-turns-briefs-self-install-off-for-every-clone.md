---
type: story
id: "story-a-vault-turns-briefs-self-install-off-for-every-clone"
epic: "WP-23"
title: "A vault turns brief's self-install off for every clone"
status: planned
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-14
updated: 2026-10-14
external_refs: {}
tags: []
code_refs: []
specs: []
started_at: null
closed_at: null
plan_updated_at: null
---

# A vault turns brief's self-install off for every clone

| Field | Value |
|---|---|
| **Epic** | [WP-23](../epic.md) |
| **Status** | planned |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

A solo user who does not want role, skill or routing-block files must be able
to say so once, in the committed vault config, so no clone or machine
self-installs them on its first `waypost brief`.

## Decomposition

- [ ] `selfInstall` reads `self_install` from `<vault>/.projectstore.json`; `off`/`false` (any case) = `--no-install`; unreadable config = do not install
- [ ] `doctor` warns on any other value
- [ ] `next` / bare `waypost` and doctor's install notes stop recommending role installation when off
- [ ] `waypost bind --self-install off` writes the key, merging with existing policy (`acceptance_gate` kept)
- [ ] document the key next to `acceptance_gate` (AGENTS.md "Configuration", README)

## Acceptance Criteria

- [ ] clone → `bind` → `brief` writes no role, skill or instruction file when the vault config says `"self_install": "off"`, `false` or `"Off"`, and when it is unreadable JSON (test)
- [ ] `"self_install": "of"` is a doctor warning (test)
- [ ] with it off, `waypost next` lists no role-install item (test)
- [ ] `bind --self-install off` on a vault with `acceptance_gate: on` keeps that key (test)
- [ ] without the key, `brief` behaves as today (existing tests green)
- [ ] explicit `waypost agents install` still installs with the key set (test)

## Dependencies

- ADR "Solo entry without a profile: an external task trailer, doctor on a vault path, a vault-level opt-out from self-install"

---

*Last updated: 2026-10-14*
