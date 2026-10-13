---
type: story
id: "story-each-machine-replies-in-its-own-users-language"
epic: "WP-22"
title: "Each machine replies in its own user's language"
status: planned
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-13
updated: 2026-10-13
external_refs: {}
tags: []
code_refs: []
specs: []
blocked_by: ["WP-22/story-global-rules-reach-every-installed-harness-and-doctor-refuses-a-machine-where-they-do-not","WP-22/story-a-source-on-another-machine-reaches-each-vm-through-a-local-cache"]
started_at: null
closed_at: null
plan_updated_at: null
---

# Each machine replies in its own user's language

| Field | Value |
|---|---|
| **Epic** | [WP-22](../epic.md) |
| **Status** | planned |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

People with different languages work on the same project from their own
machines. Each machine records its user's reply language once — explicitly by
the owner, or automatically from what the user actually typed — and every
harness on that machine replies in it. Decision: [Owner's global rules: one harness-neutral source, reaching every installed harness on every machine](../../../adr/owners-global-rules-one-harness-neutral-source-reaching-every-installed-harness-on-every-machine.md) (Decision 7).

## Decomposition

- [ ] `reply_language` in the machine state (explicit / native / auto); BCP 47
      plus a rendering allowlist; the registry maps a code to each harness's value.
- [ ] Import an existing native value (the host's Claude `"language": "Russian"`)
      as `native`; write a native setting only while it still equals what
      Waypost last wrote; `settings.json` edited one key at a time.
- [ ] `waypost rules language <code>`: `explicit` only after the gate's
      `[y/N]`; `auto` only from registry-listed interactive entrypoints;
      Waypost's launchers set a refusing marker.
- [ ] The while-unset instruction and the while-auto correction line, only in
      user-level delivery points of harnesses with an interactive entrypoint;
      size tests (ADR-0008).
- [ ] `brief` shows value, provenance, entrypoint, date; `doctor --global`
      reports a project, local or managed override.
- [ ] A later `auto` replaces an earlier one only after the same new code is
      seen in two sessions at least a day apart (each change costs a Codex
      calibration).
- [ ] A native value that maps to no code (free text) is kept as `native`
      with `code: null`: never overwritten, nothing rendered for other
      harnesses, reported as info.
- [ ] While provenance is `native`, the native value is re-read on every
      refresh; Claude hot-reloads `settings.json`, so that key takes effect at
      once.
- [ ] State plainly that the "evidence" for `auto` is the agent's own claim.

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

## Acceptance Criteria

- [ ] Host `ru` and VM `en`: Russian replies on the host, English on the
      VM, in a project under the host's home.
- [ ] The host's existing native `"language": "Russian"` is imported as
      `native` and never changed by an `auto`.
- [ ] `auto` never replaces `explicit` or `native`; Waypost team runs and
      Waypost-launched `-p` / `exec` record nothing (a nested `-p` that inherits
      the entrypoint may record — stated limitation); a subagent may record (stated
      limitation) and `brief` shows it.
- [ ] An invalid code is refused and renders nothing; setting or unsetting the
      language changes no project file; `settings.json` keeps every other key.
- [ ] On `FROSTBEBE`, `rules language` from the Claude app, the Codex app and
      a terminal resolve to one file.

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

## Dependencies

- `story-global-rules-reach-every-installed-harness-and-doctor-refuses-a-machine-where-they-do-not`; `story-a-source-on-another-machine-reaches-each-vm-through-a-local-cache`.

## Attachments

-

---

*Last updated: 2026-10-13*
