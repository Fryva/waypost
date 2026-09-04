---
type: runbook
slug: "verify-a-harness-live-the-whole-waypost-loop-in-one-session"
title: "Verify a harness live: the whole waypost loop in one session"
status: active
date: 2026-09-04
authors: ["Ivan Morozov"]
tags: []
---

# Verify a harness live: the whole waypost loop in one session

## Purpose

Turn a registry entry from `documented` into `verified`: run the whole loop inside the harness itself, from its own session, and record what happened in the entry's `notes` with the date. One harness per run; the same script for all.

## Prerequisites

- The harness installed and signed in (a headless `run` mode is fine where it exists: `opencode run`, `codex exec`).
- `waypost` on PATH (0.14 or later).
- A throwaway project: `git init`, a README, an `AGENTS.md` with one line of your own, then `waypost setup` and `waypost draft epic PS-1 "Verification epic" --write`, committed.

## Steps

Give the harness this task, verbatim, and let it drive the shell:

> Do exactly these steps, one at a time, reading each command's output before the next:
> 1. `waypost brief` 2. `waypost next` 3. `waypost draft story PS-1 "Hello from <harness>" --write` (note the path) 4. `waypost story plan <path> --write` 5. append one line to README.md 6. `waypost commit --story PS-1/story-hello-from-<harness> -m "hello" -- README.md` 7. `waypost sessions` 8. `waypost lease README.md`, then `waypost lease list` 9. `waypost doctor`. Do not edit any file except README.md. Report each step with one quoted output line.

Then check from outside the harness:
- `waypost log --harness <id>` shows the commit with `Waypost-Harness: <id>` — the harness was detected as itself.
- `waypost sessions --json`: the record's `harness` and `proc.comm` agree.
- The harness activated a skill on its own (`waypost-story` or `waypost-draft`) at least once — look at its transcript.
- Set `confidence: "verified"` and a dated `notes` sentence in `harnesses/<id>.json`; add the row to the README matrix.

## Verification

The five checks above, plus `npm test` green if a defect was fixed on the way. A run that had to be helped by hand is `documented`, not `verified`.

## Rollback

The throwaway project is deleted; nothing else changes.

## Common Issues

- **Started from inside another harness** (OpenCode launched from a Claude Code session): env markers of the outer harness are inherited. Since 0.14 detection prefers the ancestor process; before that the session recorded itself as the outer harness.
- **Headless `opencode run` hangs after `init`** with no session created: leftover `opencode run` processes from an earlier run hold its database; `pkill -f <prompt substring>` and retry. Add `--pure` if a global MCP server (for example `codegraph`) is configured and slow to start.
- **`timeout` is not on macOS** — bound a headless run with the caller's own timeout.

## References

- Story: WP-14 "Live verification: Codex and OpenCode run the whole loop"
- `docs/harnesses.md` — confidence levels and what `verified` means

---

*Last updated: 2026-09-04*
