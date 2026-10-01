---
type: epic
id: "WP-19"
title: "The process layer on any host, and honest harness detection"
status: planned
priority: p1
created: 2026-09-30
updated: 2026-09-30
external_refs: {}
tags: []
code_refs: ["scripts/presence.mjs", "scripts/agents.mjs", "scripts/skills.mjs", "scripts/lib.mjs", "tests/commits.test.mjs", "tests/predicates.test.mjs", "scripts/doctor.mjs", "harnesses/codex.json", "harnesses/claude.json", "harnesses/gemini.json", "bin/waypost", "tests/presence.test.mjs", "tests/harness.test.mjs", "tests/limit.test.mjs", "docs/vault/ops/verify-a-harness-live-the-whole-waypost-loop-in-one-session.md"]
review_status: pending
reviewed_at: null
---

# WP-19: The process layer on any host, and honest harness detection

| Field | Value |
|---|---|
| **Status** | planned |
| **Priority** | p1 |
| **Created** | 2026-09-30 |
| **Updated** | 2026-09-30 |

---

## Goal

Two guarantees that the rest of the coordination layer stands on:

- **Localized ps output is readable on supported POSIX hosts.** When `ps` is
  available and permitted, it is asked for output in the C locale, so the parser
  receives the spelling it expects regardless of `LC_TIME`. Windows has no table
  support here; on supported POSIX hosts doctor reports an unavailable table,
  including restricted sandboxes.
- **Project markers and a running harness answer different questions.** The
  initial investigation below proposed removing the shared `AGENTS.md` marker.
  The later proposed ADR "setup asks the running harness, not only the project's
  files" instead preserves it deliberately and unions markers with the running
  harness. The historical diagnosis below is not the current implementation
  goal. Direct installers and stable Codex session identity are the follow-up.

## Context

Found on 2026-09-30 by running the whole Waypost loop for real from an
interactive OpenCode session against a throwaway project (the WP-14 runbook),
on the owner's machine.

**1. The process table is empty on a non-English host.** `processTable()` parses
`ps axo pid=,ppid=,lstart=,comm=` with a regex hardcoded to the English
spelling of `lstart` (`Tue Sep 15 14:51:13 2026`). This machine runs
`LANG=ru_RU.UTF-8` / `LC_TIME=ru_RU.UTF-8`, so `ps` answers
`вторник, 15 сентября 2026 г. 14:51:13` and **0 of 784 rows match**.
`processTable()` returns `null`, and with it three documented behaviours go
silent at once:

- a presence record is written with `"proc": null`, so "on this host a record
  whose harness process is gone is reaped by `--prune` at once" is false — every
  session waits out the 24h age threshold instead (41 records here: 23 with a
  process, 18 without, and the 18 are the recent ones);
- `harnessProcess()` returns `null`, so `detectHarness()` falls back to the env
  markers, and the process-first rule from f2dfe91 silently stops applying in
  production. (It does not show up as a failing call: `harnessOfProcess` reads
  the process only when handed `process.env`, so the obvious probe —
  `detectHarness({OPENCODE:"1", CLAUDECODE:"1"})` — answers `claude` on an
  English host too, and proves nothing either way.) The guard test still passes
  because it injects `WAYPOST_PROC` rather than walking the table;
- `gateCheck()` degrades to `process_table: false` and its consent gate falls
  back to env markers alone.

The project's own suite already fails here and says so:
`tests/presence.test.mjs` "a beat records the harness process; on this host a
gone process ends the session at once" — `actual: null`. The failure is real;
only its attribution is wrong: a locale problem reported as a missing process.

**2. `AGENTS.md` reads as "codex is used here".** `AGENTS.md` is a `detect`
marker for `codex` and for no other entry, while it is the `instructions`
target of all 21. The existing E-1 guard (`markerCounts`) only strips waypost's
own routing block, so a project whose `AGENTS.md` holds a line of the user's own
prose, and no harness directory at all, is detected as Codex. Live, in a
throwaway project with nothing but a README and one line of `AGENTS.md`:

```
$ waypost setup --dry-run
  would install roles for codex
  would install skills for codex
$ waypost next
  - codex is used by this project but has no waypost roles
        waypost agents install
```

An OpenCode session is told to install Codex's roles, and `setup` would create
`.codex/agents/` for a project that has never run Codex. The asymmetry is not a
detail: no other harness is allowed to make the same claim, so the one that can
is the one that is wrong most often.

Both are the same class of defect — a signal the code trusts that does not mean
what it is taken to mean, and no test that says so. Neither is OpenCode-specific;
OpenCode is only the harness whose live run happened to surface them.

## Stories

| Story | Status | Description |
|-------|--------|-------------|
| [ps in the C locale, so the process table exists on any host](stories/story-ps-in-the-c-locale-so-the-process-table-exists-on-any-host.md) | done | ask `ps` for the spelling the parser reads; cover locale in a test |
| [setup asked the filesystem alone about which harnesses a project uses](stories/story-agentsmd-is-not-evidence-that-codex-is-used-here.md) | in-progress | union project markers and the running harness in setup |
| [Codex keeps one session and direct installers see the running harness](stories/story-codex-keeps-one-session-and-direct-installers-see-the-running-harness.md) | in-progress | direct installers, thread identity and brief self-install |

## Expected Results

- [ ] `processTable()` returns a table on a supported POSIX host with available
      and permitted `ps` and a non-English `LC_TIME`,
      and every path it feeds is live again: presence liveness and `--prune`,
      harness attribution, the consent gate, cleanup's in-use signal, the
      detached deleter's pid-reuse guard and heavy-slot liveness.
- [ ] `waypost doctor` says when there is no process table, so the next cause of
      the same silence (a `ps` that rejects the format, a stripped `PATH`) is not
      also invisible.
- [ ] Setup and direct installers account for the running harness without losing
      the E-1 protection; explicit selection overrides both evidence sources.
- [ ] The repo's two recorded positions on shared instruction files — ADR-0005
      and the "E-1 does not over-correct" test — are reconciled by a decision on
      the record, not by one of them quietly disappearing.

## Dependencies

- none; found by the WP-14 live verification, not blocked by it

## Open Questions

- [ ] Historical alternative (not the implemented direction): dropping `AGENTS.md` from `codex`'s `detect` means a Codex project that
      has only `AGENTS.md` and no `.codex/` is no longer auto-detected. Is
      `AGENTS.md` alone evidence of Codex at all, or is `.codex/` (or an
      explicit `--harness`) the honest threshold? Owner decision — it changes
      what `setup` does on first run in a Codex project.
- [ ] The same asymmetry, smaller: `claude` claims `CLAUDE.md` (read by 6 other
      entries) and `gemini` claims `GEMINI.md` (read by 1). Are those violations
      too, and does "shared" mean "read by at least one other entry" or only by
      several? Three existing tests assert the `claude` case, so this is not a
      free correction.
- [ ] Projects the current behaviour already polluted keep a tracked
      `.codex/agents/`, which is the same path a fixed `codex` entry legitimately
      detects on — so they can never be de-detected. Accept and document, or give
      them their own story?

## Related

- ADR-0005 (harness registry) — line 143 already argues for the removal this
  epic's second story considers
- ADR-0007 (presence, leases and liveness), ADR-0010 (coordination follows the
  repository) — the behaviour this epic restores
- `docs/vault/ops/verify-a-harness-live-the-whole-waypost-loop-in-one-session.md`
  — the runbook whose live OpenCode run found both; its own setup step is
  affected by the second story

---

*Last updated: 2026-09-30*
