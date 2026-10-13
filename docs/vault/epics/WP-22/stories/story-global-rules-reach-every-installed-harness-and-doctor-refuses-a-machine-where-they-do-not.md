---
type: story
id: "story-global-rules-reach-every-installed-harness-and-doctor-refuses-a-machine-where-they-do-not"
epic: "WP-22"
title: "Global rules reach every installed harness, and doctor refuses a machine where they do not"
status: planned
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-13
updated: 2026-10-13
external_refs: {}
tags: []
code_refs: []
specs: []
blocked_by: ["WP-18/story-the-heavy-work-slot-is-machine-wide-on-windows-not-one-per-packaged-app"]
started_at: null
closed_at: null
plan_updated_at: null
---

# Global rules reach every installed harness, and doctor refuses a machine where they do not

| Field | Value |
|---|---|
| **Epic** | [WP-22](../epic.md) |
| **Status** | planned |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

The base of WP-22: a **local** source on a machine reaches Claude Code, Codex
and OpenCode as generated delivery points, re-rendered automatically, and a
read-only `waypost doctor --global` says whether it does. A remote source, the
reply language and the migration (with reporting of rules outside the source)
are their own stories. Decision:
[Owner's global rules: one harness-neutral source, reaching every installed harness on every machine](../../../adr/owners-global-rules-one-harness-neutral-source-reaching-every-installed-harness-on-every-machine.md)
(Decisions 1–5).

## Decomposition

- [ ] ADR-0005 amendment; registry `global_rules` for Claude Code, Codex,
      OpenCode via a shipped-only loader (`config_home`, ordered files,
      settings that move or disable loading, ownership model, surfaces
      expected vs excluded).
- [ ] `waypost rules source|where` (gated; records path and storage kind) and
      `rules install|uninstall --global` (gated; records config homes; a home
      counts only if the harness created it).
- [ ] Generated delivery points: deterministic header, link count 1; owned
      files (Codex, OpenCode), managed block (Claude).
- [ ] Automatic re-render from `brief` and `rules`, with the bad-source guard
      (empty/unreadable kept out; a smaller source after two agreeing
      refreshes); notices for a changed source, location or skipped target;
      `brief --no-install`.
- [ ] Safe writes: confinement, refusal of links, digest-before-rename,
      Windows retry, sandbox skip, lock.
- [ ] Read-only `waypost doctor --global`; the project-doctor warning.
- [ ] Hermetic tests.
- [ ] The Windows gate's ancestor walk through `Win32_Process` (stops at a
      parent not older than its child, fails closed); `CODEX_THREAD_ID` and
      `CODEX_SESSION_ID` as Codex markers.
- [ ] The Codex surface hashes instruction files (content and file id) before
      `thread/start`, after it, and after the drain.
- [ ] A rules lock separate from the machine lock, never held across retries
      or source reads.
- [ ] On win32, `EPERM`/`EACCES`/`EBUSY` retried with a bounded backoff;
      a sandbox denial only when a sandbox marker is present.
- [ ] The bad-source rule in numbers: what "much smaller" means, N minutes,
      compared with the last source (not the last render); a first install
      with an empty source refuses.
- [ ] Before migration, `rules install` skips a hand-written global file with
      "migration pending" unless an explicit replace is given.
- [ ] `rules history|diff` over the last N renders.

## Implementation Plan

## Acceptance Criteria

- [ ] With a local source, `rules install --global` from the owner's terminal
      delivers to every present harness, and an edit to the source reaches all
      of them by the next `brief`.
- [ ] The gate refuses source, install, uninstall and fix from inside a harness.
- [ ] A config home the environment resolves differently from the recorded
      one is reported and never written; a home inside a work tree is refused.
- [ ] A project `.waypost/harnesses/<id>.json` that sets `global_rules` is
      dropped and reported.
- [ ] An empty source propagates nothing; a deliberate cut propagates after
      two agreeing refreshes.
- [ ] Drift is never overwritten and `brief` reports it; appended content
      survives install, re-render and uninstall; uninstall deletes an owned
      file only when byte-identical to its last render.
- [ ] An unchanged source leaves the Codex file byte-identical; no rule
      content appears in agent-visible output.
- [ ] `doctor --global` writes nothing, reports a surface expected to load
      that does not, and lists excluded surfaces as info.
- [ ] On `FROSTBEBE`, the gate refuses from a full-access Codex app session
      with no environment markers.
- [ ] A `brief` re-render does not make budget admission fail with a busy lock.
- [ ] A hand-written Codex or OpenCode bridge is left untouched before
      migration and reported as "migration pending".

## Final Summary

## Technical Notes

- 2026-10-13, `FROSTBEBE`: `C:\Users\frost\.claude\CLAUDE.md` was absent. A
  symlink to `\\Mac\frost\.claude\CLAUDE.md` was created (Developer Mode is
  on) and then replaced with a local copy carrying a header naming the host
  file, because Claude Code does not follow a `CLAUDE.md` symlink to a network
  path. A subagent launched from the desktop app on the VM did not receive that
  copy, nor the project's `@AGENTS.md` expanded.
- Codex is installed on the VM as the Store app `OpenAI.Codex` (not on
  `PATH`); its bridge `C:\Users\frost\.codex\AGENTS.md` pointed at a
  non-existent `W:` and was corrected to `Y:` / `\\Mac\frost`.
- From a Claude desktop session, `realpathSync.native` of
  `%LOCALAPPDATA%\Waypost` is `…\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Local\Waypost`:
  AppData is virtualized per MSIX package.
- Symlink evaluation on the VM: local-to-remote enabled, remote-to-remote and
  remote-to-local disabled (`fsutil behavior query SymlinkEvaluation`).

## Dependencies

- `story-the-heavy-work-slot-is-machine-wide-on-windows-not-one-per-packaged-app` (machine state in its new root).

## Attachments

-

---

*Last updated: 2026-10-13*
