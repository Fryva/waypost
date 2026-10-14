---
type: story
id: "story-a-vault-turns-briefs-self-install-off-for-every-clone"
epic: "WP-23"
title: "A vault turns brief's self-install off for every clone"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-14
updated: 2026-10-14
external_refs: {}
tags: []
code_refs: ["bin/waypost.mjs", "scripts/lib.mjs", "scripts/doctor.mjs", "tests/harness.test.mjs", "AGENTS.md", "CHANGELOG.md", "docs/how-it-works.md", "docs/harnesses.md"]
specs: []
started_at: "2026-10-14T23:22:31.541Z"
closed_at: "2026-10-14T23:37:19.054Z"
plan_updated_at: "2026-10-14T23:22:31.541Z"
---

# A vault turns brief's self-install off for every clone

| Field | Value |
|---|---|
| **Epic** | [WP-23](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

A solo user who does not want role, skill or routing-block files must be able
to say so once, in the committed vault config, so no clone or machine
self-installs them on its first `waypost brief`.

## Decomposition

- [x] `selfInstall` reads `self_install` from `<vault>/.projectstore.json`; `off`/`false` (any case) = `--no-install`; unreadable config = do not install
- [x] `doctor` warns on any other value
- [x] `next` / bare `waypost` and doctor's install notes stop recommending role installation when off
- [x] `waypost bind --self-install off` writes the key, merging with existing policy (`acceptance_gate` kept)
- [x] document the key next to `acceptance_gate` (AGENTS.md "Configuration", docs/how-it-works.md, docs/harnesses.md, bind help; README in its own story)

## Implementation Plan

<!-- Route through the covering spec's contracts: which contracts, in what order, which files. Filled at the gate. -->

## Acceptance Criteria

- [x] clone → `bind` → `brief` writes no role, skill or instruction file when the vault config says `"self_install": "off"`, `false` or `"Off"`, and when it is unreadable JSON (test) — evidence: tests/harness.test.mjs "self_install off in the vault policy stops brief…" (off, false, "Off", unreadable JSON: no file written)
- [x] `"self_install": "of"` is a doctor warning (test) — evidence: tests/harness.test.mjs "self_install off in the vault policy stops brief…"; scripts/doctor.mjs checkVaultPolicy
- [x] with it off, `waypost next` lists no role-install item (test) — evidence: tests/harness.test.mjs "self_install off in the vault policy stops brief…" (with a positive control without the key)
- [x] `bind --self-install off` on a vault with `acceptance_gate: on` keeps that key (test) — evidence: tests/harness.test.mjs "self_install off in the vault policy stops brief…" (merged; an unreadable policy is refused, not overwritten)
- [x] without the key, `brief` behaves as today (existing tests green) — evidence: tests/harness.test.mjs "brief installs the skills of the harness it runs in…" green; harness+scripts suites 196/197 then the hygiene test fixed
- [x] explicit `waypost agents install` still installs with the key set (test) — evidence: tests/harness.test.mjs "self_install off in the vault policy stops brief…"

## Final Summary

`"self_install": "off"` (or false, any case) in the vault policy stops
`waypost brief` from installing roles, skills and the routing block; an
unreadable policy fails closed. `waypost bind <vault> --self-install off|on`
writes or removes the key, merging, and refuses an unreadable policy file
instead of overwriting it. With it off, doctor drops its "no roles / skills /
block yet" notes, so `next` stops advising installs; partial or stale installs
still report. A value other than on/off is a doctor warning.
Tests: harness + scripts suites (one failure was AGENTS.md crossing the 300-line
hygiene limit with this story's addition — trimmed), then the affected tests 9/9
after the reviewer's fixes (flag before the path, unreadable policy, next control).
Open: a clone with no binding is still pointed at `waypost setup`, which
installs everything; the README must say `bind` first.

## Dependencies

- ADR "Solo entry without a profile: an external task trailer, doctor on a vault path, a vault-level opt-out from self-install"

---

*Last updated: 2026-10-14*
