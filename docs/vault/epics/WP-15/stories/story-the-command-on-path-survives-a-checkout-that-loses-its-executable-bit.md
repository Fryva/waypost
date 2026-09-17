---
type: story
id: "story-the-command-on-path-survives-a-checkout-that-loses-its-executable-bit"
epic: "WP-15"
title: "The command on PATH survives a checkout that loses its executable bit"
status: planned
priority: p2
assignee: "Ivan Morozov"
created: 2026-09-17
updated: 2026-09-17
external_refs: {}
tags: ["install", "cross-os"]
code_refs:
  - scripts/launcher.mjs
  - scripts/doctor.mjs
  - tests/launcher.test.mjs
  - README.md
  - bin/waypost (waiting)
  - CHANGELOG.md (waiting)
specs: []
started_at: null
closed_at: null
plan_updated_at: null
---

# The command on PATH survives a checkout that loses its executable bit

| Field | Value |
|---|---|
| **Epic** | [WP-15](../epic.md) |
| **Status** | planned |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

`npm link` puts a symlink to `bin/waypost` on `PATH`. In a checkout that a Windows VM edits over a
network share, every save from there drops the file's executable bit, and `waypost` answers
`permission denied` on the host until someone runs `chmod +x` — which holds until the next save.
Seen twice in one day on the owner's Mac, 2026-09-17, while a Windows session was working on WP-18.
The user is anyone who runs waypost from a shared checkout: exactly the multi-OS setup ADR-0007 is about.

## Decomposition

- [x] `scripts/launcher.mjs`: report what is on PATH (`none` / `exposed` / `broken`) and, with `--write`, replace the symlinks with node shims
- [x] `checkLauncher` in `scripts/doctor.mjs`: a warning while exposed, an issue once broken; never a `--fix` repair
- [x] `tests/launcher.test.mjs`
- [x] Runbook in `ops/`, a paragraph in README
- [ ] `waypost launcher [--write]` routed in `bin/waypost` — waits until the WP-18 session's uncommitted edits to that file are committed
- [ ] CHANGELOG entry — same reason

## Implementation Plan

Detection is deliberately narrow: a launcher counts only when it is a symlink whose realpath is this
checkout's own `bin/waypost`. `exposed` additionally needs `core.fileMode=false` in the checkout —
the one setting that says "shared with a system that has no executable bit" and also the reason git
will not restore it. The shim names `node` as PATH has it, not its realpath, so a node upgrade does
not break it. Nothing is routed through `bin/waypost` yet: another live session holds uncommitted
edits there, and the script is runnable as `node scripts/launcher.mjs` — which is also the only way
to reach it once the command itself refuses to start.

## Acceptance Criteria

- [x] A symlinked launcher in a checkout with `core.fileMode=false` is reported `exposed`, and `waypost doctor` warns — confirmed by: `tests/launcher.test.mjs`
- [x] A symlinked launcher to an entry point without the bit is `broken`, and doctor reports an issue — confirmed by: `tests/launcher.test.mjs`; live on macOS 2026-09-17
- [x] `--write` replaces only symlinks that resolve to this checkout, and the shim runs with the bit off, arguments intact — confirmed by: `tests/launcher.test.mjs`; live on macOS 2026-09-17 (`waypost --version`, `wyp --version` with `bin/waypost` at mode 0664)
- [x] A regular file on PATH and a symlink into another checkout are never touched — confirmed by: `tests/launcher.test.mjs`
- [ ] Verified on Linux (`~/.local/bin` symlink layout of the Debian VM)
- [ ] `waypost launcher` works as a routed command

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

Windows is out of scope on purpose: npm writes `.cmd`/`.ps1` there. A consumer that located the
checkout with `realpath $(command -v waypost)` has to be pointed at it explicitly after the switch;
Fryva's `check-memory.mjs` already honours `WAYPOST_CHECKOUT` for the same reason on Windows.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-09-17*
