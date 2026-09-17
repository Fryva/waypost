---
type: runbook
slug: "run-waypost-from-a-checkout-another-operating-system-edits"
title: "Run waypost from a checkout another operating system edits"
status: draft
date: 2026-09-17
authors: ["Ivan Morozov"]
tags: ["install", "cross-os"]
---

# Run waypost from a checkout another operating system edits

## Purpose

Use this when `waypost` runs from a checkout (`npm link`, or `npm install -g` from a path) and that
same checkout is edited from another operating system — a Windows or Linux VM reaching it over a
network share, a synced folder. Every save from a system without an executable bit writes
`bin/waypost` back without one. `npm` put a symlink to that file on `PATH`, so from then on the
command answers `permission denied`, usually in the middle of someone's work. `core.fileMode=false`,
which such a checkout needs anyway, means git neither notices nor restores the bit, and `chmod +x`
holds only until the next save from the other machine.

`waypost doctor` warns about this before it happens (`[launcher]`, a warning) and reports it as an
issue once the bit is gone. It never repairs it on its own: the repair writes into a directory on
`PATH`, outside any project.

## Prerequisites

- [ ] macOS or Linux. Windows is not affected: npm writes `.cmd`/`.ps1` shims there, never a symlink.
- [ ] `node` on `PATH`.
- [ ] Write access to the directory the symlink lives in (`/opt/homebrew/bin`, `~/.local/bin`, …).

## Steps

### 1. See what is on PATH

```bash
node <checkout>/scripts/launcher.mjs
```

Through `node`, because `waypost` itself may already be refusing to start. `exposed` means the
next save from the other machine breaks the command; `broken` means it already has.

### 2. Replace the symlinks with shims

```bash
node <checkout>/scripts/launcher.mjs --write
```

Only symlinks that resolve to this checkout's `bin/waypost` are replaced. A regular file named
`waypost` on `PATH` is somebody's own script and is left alone. The shim runs the entry point
through `node`, so the entry point needs no executable bit; edits to the checkout are still picked
up at once.

## Verification

- [ ] `node <checkout>/scripts/launcher.mjs` says "nothing on PATH depends on the entry point's executable bit".
- [ ] `chmod -x <checkout>/bin/waypost && waypost --version` still prints the version.

## Rollback

`npm link` from the checkout (or deleting the shim and recreating the symlink) restores npm's
layout. The shim carries a `waypost-launcher-shim` marker line and is safe to delete.

## Common Issues

### `npm link` was run again

It puts the symlinks back. Re-run step 2.

### Something resolved the checkout by following the symlink

A script that finds the checkout with `realpath $(command -v waypost)` no longer can: a shim is not
a link. Point it at the checkout explicitly (an environment variable, as on Windows).

### node was upgraded or moved

The shim names `node` as `PATH` had it when the shim was written (`/opt/homebrew/bin/node`, not a
versioned Cellar path), so an upgrade in place is fine. After a move, re-run step 2.

## References

- `scripts/launcher.mjs`, `tests/launcher.test.mjs`, `checkLauncher` in `scripts/doctor.mjs`
- ADR-0007, "Several devices and operating systems"
