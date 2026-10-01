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
- A throwaway project: `git init`, a README, then `waypost setup --harness <id>`, `waypost draft epic PS-1 "Verification epic" --write`, committed. Name the harness explicitly and keep the project free of harness files: since the setup evidence fix, `setup` also asks which harness it is running inside, so a bare repo exercises that path, and an `AGENTS.md` in the fixture would make every harness look like a codex project — which is what this runbook used to create on purpose, for a reason that no longer holds.

## Steps

Give the harness this task, verbatim, and let it drive the shell:

> Do exactly these steps, one at a time, reading each command's output before the next:
> 1. `waypost brief` 2. `waypost next` 3. `waypost draft story PS-1 "Hello from <harness>" --write` (note the path) 4. `waypost story plan <path> --write` 5. append one line to README.md 6. `waypost commit --story PS-1/story-hello-from-<harness> -m "hello" -- README.md` 7. `waypost sessions` 8. `waypost lease README.md`, then `waypost lease list` 9. `waypost doctor`. Do not edit any file except README.md. Report each step with one quoted output line.

For Codex's scoped approval mode, append the authorization used in the verified
run (the nine commands above are unchanged):

> The throwaway project is preconfigured and committed, and you are explicitly authorized to execute all nine steps, including Waypost's writes to its bound vault and .git coordination/commit metadata. Do not touch other projects or change code. Use normal scoped approval if protected project metadata needs it; do not bypass sandbox. Final response in Russian. Do not request guidance or hand the commands back to the caller.

This authorizes the prescribed work; it names no skill and supplies no recovery
command. Do not intervene after launch.

Then check from outside the harness:
- `waypost log --harness <id>` shows the commit with `Waypost-Harness: <id>` — the harness was detected as itself.
- `waypost sessions --json` identifies the session and coordination directory. Read its raw stored record under `<coordination_dir>/presence/`: `harness` and `proc.comm` agree. The compact sessions output does not expose `proc`.
- The harness activated a skill on its own (`waypost-story` or `waypost-draft`) at least once — look at its transcript.
- Set `confidence: "verified"` and a dated `notes` sentence in `harnesses/<id>.json`; add the row to the README matrix.

## Verification

The five checks above, plus `npm test` green if a defect was fixed on the way. A run that had to be helped by hand is `documented`, not `verified`.

## Rollback

The throwaway project is deleted; nothing else changes.

## Common Issues

- **Started from inside another harness** (OpenCode launched from a Claude Code session): env markers of the outer harness are inherited. Since 0.14 detection prefers the ancestor process; before that the session recorded itself as the outer harness. Measured 2026-09-30: a codex session exports `CODEX_SANDBOX=seatbelt` and `CODEX_SANDBOX_NETWORK_DISABLED=1`, and `CODEX_HOME` is normally unset (the default is `~/.codex`) — so an entry listing only `CODEX_HOME` would not be detected by env alone.
- **`codex exec` cannot create `.codex/` under its own sandbox**: the default is `workspace-write`, and `agents install` fails with `EPERM: operation not permitted, mkdir '.codex/agents'`. That is codex, not waypost. Prepare the prerequisite `waypost setup` from the caller with scoped write approval, then run the task with `codex exec --approve-for-me`. Protected `.git` coordination and commit writes can also need scoped approval; story plan/close now report incomplete coordination; retry plan, or use `waypost sessions --release` after a failed close release (a repeated close can be unchanged). The roles' own `sandbox_mode = "read-only"` is unaffected.
- **`codex` is not always on PATH**: the CLI ships inside the desktop bundle at `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex` on macOS even when no symlink exists. `codex --version` prints the version it found.
- **Headless `opencode run` hangs after `init`** with no session created: leftover `opencode run` processes from an earlier run hold its database; `pkill -f <prompt substring>` and retry. Add `--pure` if a global MCP server (for example `codegraph`) is configured and slow to start.
- **`timeout` is not on macOS** — bound a headless run with the caller's own timeout.

## Verified run: Codex CLI, 2026-09-30

Platform: macOS, codex-cli 0.159.2, signed-in `codex exec --approve-for-me`.
Prerequisites were prepared with real `setup --harness codex` and committed:
five TOML roles, ten skills, routing block, binding, mechanical Git setup and
PS-1. The standalone session inherited no Waypost or outer Codex session ids.
It received the nine-step task without any named skill or intervention after
launch. The transcript independently loaded `waypost-draft`, `waypost-story`,
`waypost-commit` and `waypost-doctor` before step 1.

| Step | Observed output |
|---|---|
| 1. brief | `nothing in progress` |
| 2. next | `source changes with no story open` |
| 3. draft | `created …/PS-1/stories/story-hello-from-codex.md` |
| 4. plan | `claimed PS-1/story-hello-from-codex` |
| 5. README | `Hello from codex` |
| 6. commit | `[main 4c16f42] hello` |
| 7. sessions | `codex-e-7310-a00f-9f9bb49ae338 … story:PS-1/story-hello-from-codex` |
| 8. lease/list | `live README.md … codex-e-7310-a00f-9f9bb49ae338` |
| 9. doctor | `0 issue(s), 1 warning(s)` — sandbox denies the process table |

Outside checks: `waypost log --harness codex` returned `4c16f42`; Git contained
`Waypost-Harness: codex`, `Waypost-Session: codex-e-7310-a00f-9f9bb49ae338`, and
`Waypost-Story: PS-1/story-hello-from-codex`. The coordination presence record
contained `harness: codex`, `proc.comm: codex` (pid 58471), and the PS-1 claim.
The independent CLI thread was `01a0f500-138e-7310-a00f-9f9bb49ae338`, consistent
with that session id. After the CLI exited, outside sessions correctly showed
it as ended; outside doctor reported zero issues and zero warnings. The raw
presence record was checked as well as `sessions --json`, whose compact output
does not include `proc`.

The first independent run exposed a silent partial failure: story plan wrote
the story but sandbox protection prevented its claim. The dispatcher now warns
that coordination is incomplete and names the write permission needed. In the
second independent run the agent autonomously retried plan with scoped approval
and registered the claim; no caller message or blanket bypass was needed.
Protected Git metadata can require such approvals; this verification covers
macOS and this approval mode, not other platforms or permission policies.

Validation after the fixes: `npm test` — 817 passed, zero failed, five skipped.
The locale test compares each process snapshot with its own row count, avoiding
a race between consecutive live `ps` calls.

Fresh-context `waypost-critic` verdict: **ship**. It independently checked the
CLI rollout, event transcript and fixture Git; no open blockers or should-fix
findings remain. Native TOML-role invocation was not one of the nine CLI steps.
The temporary fixtures and scratch transcripts are removed after that review;
the compact evidence above remains in the vault.

## References

- Story: WP-14 "Live verification: Codex and OpenCode run the whole loop"
- `docs/harnesses.md` — confidence levels and what `verified` means

---

*Last updated: 2026-09-30*
