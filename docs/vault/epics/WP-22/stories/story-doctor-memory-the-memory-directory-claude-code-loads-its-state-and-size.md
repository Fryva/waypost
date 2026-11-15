---
type: story
id: "story-doctor-memory-the-memory-directory-claude-code-loads-its-state-and-size"
epic: "WP-22"
title: "doctor --memory: the Memory directory Claude Code loads, its state and size"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-15
updated: 2026-11-15
external_refs: {}
tags: ["memory", "doctor"]
code_refs: ["scripts/memory.mjs", "scripts/doctor.mjs", "scripts/tokens.mjs", "harnesses/claude.json", "bin/cli/help.mjs", "tests/memory.test.mjs", "tests/tokens.test.mjs", "tests/harness.test.mjs", "tests/env.mjs", "docs/cli-reference.md", "docs/harnesses.md"]
specs: []
started_at: "2026-11-15T07:18:43.165Z"
closed_at: "2026-11-15T08:50:56.044Z"
plan_updated_at: "2026-11-15T07:18:43.165Z"
---

# doctor --memory: the Memory directory Claude Code loads, its state and size

| Field | Value |
|---|---|
| **Epic** | [WP-22](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Implements the accepted ADR [Project Memory: one directory for every harness,
measured on request](../../../adr/project-memory-one-directory-for-every-harness-measured-on-request.md). Codex and OpenCode key the shared
Memory with the wrong rule (`/` → `-`) and read it unmeasured; nothing tells
the owner when an index nears Claude Code's load limit (P2PMessenger: 93 %).
`waypost doctor --memory` computes the directory Claude Code loads by default,
its state, and the index and topic sizes, read-only, in any directory.

## Decomposition

- [ ] `scripts/memory.mjs`: the canonical root (`.git` walk through
  `gitdir`/`commondir`/`worktrees`), the key (realpath, NFC, `[^a-zA-Z0-9]`
  → `-`, over 200 characters truncated plus the base-36 hash), the state in
  the ADR's numbered order, the measurements.
- [ ] `scripts/tokens.mjs` uses the same key function with its own root.
- [ ] `doctor --memory` in the CLI: no binding required, first stdout line
  `memory: <state> …` independent of the registry, `--json`
  `{state, dir, source, findings}`, `--memory --fix` refused, exit 1 only
  on an `issue` in text mode.
- [ ] `harnesses/claude.json`: `memory: {index_lines: 200, index_chars:
  25000, confidence: "inferred", docs, notes}` through the ordinary loader.
- [ ] `tests/memory.test.mjs`: the ADR's Consequences test list; the guard's
  byte-identical home tree. `tests/env.mjs` clears inherited `CLAUDE_*`.
- [ ] `docs/cli-reference.md`: `doctor --memory`, its JSON shape, the sources
  Waypost cannot see.
- [ ] The ADR's three open questions answered against the installed Claude
  Code: legacy `env` in `~/.claude.json`, JSONC settings, 2.1.325 vs 2.1.316.
- [ ] Out of this story, the owner's step: Decision 4's edit of the three
  global rule files, after this ships.

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

No spec; the ADR is the contract. Planner pass 2026-11-15 on 4f37bdb.

1. Answer the ADR's open questions against the installed bundles (2.1.316,
   desktop 2.1.325): JSONC in settings, legacy `env` in `~/.claude.json`,
   whether settings `env` overlays the process env for step 4's sources.
   Record answers in Technical Notes before `readSettings`.
2. `scripts/memory.mjs`, read-only, `home`/`env` as parameters:
   `hash32`, `projectKey(path)` (pure string), `gitRoot`, `canonicalRoot`
   (Claude Code's `lr()`: `gitdir:` → `commondir` → `worktrees` back-link
   by realpath; a `commonDir` not named `.git` is the root itself),
   `memoryLocation` (realpath, then NFC), `readSettings`, `memoryState`,
   `memoryLimits` (registry in try/catch), `measureMemory`, `runMemory`.
   No `mkdir`, no writes; not `gitCommonDir`/`mainWorktree`.
3. `harnesses/claude.json` gains `memory`; shape checked inside memory.mjs.
   No new exports from `agents.mjs`/`lib.mjs` (export lists are pinned).
4. `scripts/doctor.mjs`: after flag parsing, before `--vault=` and
   `readConfig()`: `--memory --fix` → stderr, exit 2; else `runMemory`.
   `bin/waypost.mjs` and `bin/cli/` untouched (size cap, pinned module list).
5. `scripts/tokens.mjs` uses `projectKey`, keeping its own root.
6. Tests: `tests/memory.test.mjs` groups A key/root, B state order, C
   measurements, D CLI (first line, JSON, `--fix` refused, exit codes,
   byte-identical `.claude/projects` in exists and absent, default
   doctor/next/brief unchanged); `withoutClaudeEnv` beside `ambientEnv` in
   `tests/env.mjs`; long-path case in `tests/tokens.test.mjs`; output budget
   in `tests/harness.test.mjs`. Literal expected keys for long, NFD, emoji.
7. `bin/cli/help.mjs`, `docs/cli-reference.md`, `docs/harnesses.md`. No
   `ADR-<n>` in script strings; AGENTS.md untouched (15 327 / 15 400).
8. `npm test` (takes its own heavy slot), `waypost doctor`, reviewer,
   `waypost commit --story … -- <paths>`; drop `(planned)` in ADR and here.

Residual risk, not in scope: a broken `.waypost/projectstore.json` exits in
`heartbeat` before dispatch, so no first line — Decision 4's fallback covers it.

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <path>#"<test title>" | <command> | <file>:<line> -->

- [x] The key matches Claude Code's for a linked worktree, a submodule, a
  bare repository with a worktree, `--separate-git-dir`, a symlinked path, a
  path over 200 characters, an NFD path and an emoji. — evidence: tests/memory.test.mjs#"A: a linked worktree keys as the main worktree, from any subdirectory" | tests/memory.test.mjs#"A: a submodule is its own root" | tests/memory.test.mjs#"A: a bare repository with a worktree keys as the bare directory" | tests/memory.test.mjs#"A: --separate-git-dir: the repository is its own root, a worktree of it keys as the git directory" | tests/memory.test.mjs#"A: a symlinked path keys by its realpath" | tests/memory.test.mjs#"A: the key replaces every non-alphanumeric code unit and truncates with a hash" | tests/memory.test.mjs#"A: an NFD path keys as NFC and an emoji as two dashes"
- [x] Every step of the state order has a test, including the conflicts the
  ADR names (settings `=0` beating process `=1`, process `=0` never turning
  Memory on, invalid settings JSON giving `off`). — evidence: tests/memory.test.mjs#"B: DISABLE_AUTO_MEMORY in a settings env block: 1 gives off, 0 beats the other switches" | tests/memory.test.mjs#"B: the switch only in the process gives off; =0 there never turns Memory on" | tests/memory.test.mjs#"B: a settings file that is not valid JSON gives off, JSONC included" | tests/memory.test.mjs#"B: off beats overridden; overridden alone is reported"
- [x] The first stdout line matches `^memory: (exists|absent|overridden|off)`
  in all four states, also unbound and with a broken registry. — evidence: tests/memory.test.mjs#"D: the first stdout line names the state, in all four states, for an unbound project" | tests/memory.test.mjs#"D: a broken or memory-less harness record still prints the first line"
- [x] A Cyrillic index between 25 000 characters and 25 000 bytes is not an
  issue; over 25 000 characters or 200 lines is, and exits 1. — evidence: tests/memory.test.mjs#"C: a Cyrillic index between 25000 characters and 25000 bytes is not an issue" | tests/memory.test.mjs#"C: over 25000 characters or over 200 lines is an issue; the trim and the newline count are Claude Code's" | tests/memory.test.mjs#"D: a dead pointer or an over-limit index exits 1 in text mode"
- [x] The `.claude/projects` tree of a temporary home, files and
  directories, is byte-identical after a run, also when Memory is absent. — evidence: tests/memory.test.mjs#"D: the .claude/projects tree is byte-identical after a run, absent state included"
- [x] `tokens.mjs` keys a path over 200 characters the same as
  `scripts/memory.mjs`. — evidence: tests/tokens.test.mjs#"tokens: a project path over 200 characters is keyed like Claude Code and the Memory key"
- [x] Default `doctor`, `next` and `brief` output is unchanged. — evidence: tests/memory.test.mjs#"D: default doctor, next and brief do not mention Memory or change with it"
- [x] `npm test` passes. — evidence: npm test

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

`waypost doctor --memory` (new `scripts/memory.mjs`, a branch in
`scripts/doctor.mjs` before any binding is read) computes the directory
Claude Code loads auto Memory from, its state in the ADR's order, and the
index and topic sizes; it never writes. Claude Code's index limit is
registry data (`harnesses/claude.json` `memory`, `inferred`); `tokens.mjs`
shares `projectKey`, unchanged for paths up to 200 characters. Keys were
checked against the directories Claude Code 2.1.316 actually created.

Reviewer pass (fresh context): all criteria met; fixed after it:
`autoMemoryDirectory`/Cowork values normalized as `ic()` does, any
`CLAUDE_CODE_REMOTE_MEMORY_DIR` overrides, movers read from the owner's own
`env` blocks and never a project's, one process-flag finding, the first
line printed before the registry loads, `settings.local.json` found by the
raw root, fixture git scrubbed of `GIT_*`, the defaults test on a bound
project. Tests: `tests/memory.test.mjs` 35/35; full `npm test` green.

Follow-ups: the owner's edit of the three global rule files (Decision 4),
whose fallback should also look at `~/.claude.json`; the live run of a
Cyrillic index over 25 000 bytes; Windows and Linux not exercised.

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

The ADR's three open questions, answered 2026-11-15 against Claude Code 2.1.316
(`~/.local/share/claude/versions/2.1.316`) and the desktop's 2.1.325. Method:
bundle literals (python3 mmap) plus runs of `claude -p` under a throwaway HOME
with a dummy API key, observing whether `~/.claude/projects/<key>/memory` is
created and where.

- JSONC in settings: not accepted. A `settings.json` with a comment or a
  trailing comma prints "These settings files did not load ... Invalid or
  malformed JSON" in both versions. The loader parses strictly
  (`safeParseJSON` `st`/`se` is `JSON.parse` after a BOM strip; the
  jsonc-parser `T8e`/`BBe` exists in the bundle but is not on this path).
  So `unreadable → off` fires exactly on what Claude Code itself cannot parse.
  Claude Code then ignores the file (Memory stays on); `off` is the ADR's
  deliberately cautious reading, kept.
- Legacy `env` in `~/.claude.json`: applied. `{"env": {"CLAUDE_CODE_DISABLE_AUTO_MEMORY": "1"}}`
  there creates no `memory` directory in either version. `scripts/memory.mjs`
  reads it as the lowest layer of the env blocks (an unreadable file is
  ignored); the ADR names only the three settings files, so this is an
  addition to report.
- Settings `env` before step 4's sources: not overlaid. `hh()` reads
  `process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY` live (settings `env` writes to
  it), while `yh()`, `ea()` read `CLAUDE_CODE_SIMPLE`, `CLAUDE_CODE_REMOTE` and
  `CLAUDE_COWORK_MEMORY_PATH_OVERRIDE` from a startup snapshot `i.*`. Observed:
  `CLAUDE_COWORK_MEMORY_PATH_OVERRIDE` in the process env moves Memory;
  the same name in a project settings `env` does not (default directory
  created, override path not); the same for `CLAUDE_CODE_REMOTE_MEMORY_DIR`.
  Step 4 therefore reads the process environment only, as implemented.
- 2.1.325 against 2.1.316: the same results for the default key, the settings
  `env` switch, the legacy `env`, the COWORK source and JSONC. Functions of
  2.1.316 used: key `EL()` (`k()` replace, `lke=200`, `Pe()` base-36 of
  `Math.abs` hash), state `hh()`/`yh()`/`uI()`/`EJ()`, `autoMemoryDirectory`
  validation `ic()`/`bh()`. Keys for a linked worktree, a worktree from a
  subdirectory, a submodule, a bare repository's worktree, a
  `--separate-git-dir` worktree, a path over 200 characters, an NFD path and
  an emoji path were checked against the directory 2.1.316 created: all equal
  to `memoryLocation()`.
- Not run live: the Cyrillic index between 25 000 characters and 25 000 bytes
  (needs a model reply to see the `WARNING`); the registry record stays `inferred`.

## Dependencies

- ADR: [Project Memory: one directory for every harness, measured on request](../../../adr/project-memory-one-directory-for-every-harness-measured-on-request.md) (accepted)

## Attachments

-

---

*Last updated: 2026-11-15*
