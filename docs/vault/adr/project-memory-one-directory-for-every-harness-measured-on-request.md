---
type: adr
id: "project-memory-one-directory-for-every-harness-measured-on-request"
title: "Project Memory: one directory for every harness, measured on request"
status: accepted
date: 2026-11-13
authors: ["Ivan Morozov"]
tags: ["memory", "doctor", "context-spend"]
external_refs: {"claude-code-memory": "https://code.claude.com/docs/en/memory", "claude-code-sessions": "https://code.claude.com/docs/en/sessions#where-transcripts-are-stored"}
supersedes: null
superseded_by: null
review_status: reviewed
reviewed_at: 2026-11-15
drafted_by: {"harness":"claude","provider":null,"date":"2026-11-13"}
guards: [{"check": "node --test tests/memory.test.mjs", "why": "Decision 1: the .claude/projects tree of a temporary home, files and directories, is byte-identical before and after doctor --memory, also when Memory is absent"}]
code_refs: ["scripts/doctor.mjs", "scripts/tokens.mjs", "scripts/agents-registry.mjs", "harnesses/claude.json", "tests/harness.test.mjs", "tests/env.mjs", "scripts/memory.mjs", "tests/memory.test.mjs"]
---

# Project Memory: one directory for every harness, measured on request

| Field | Value |
|---|---|
| **Status** | accepted — by the owner on 2026-11-15, after six fresh-context critic passes |
| **Date** | 2026-11-13 |
| **Authors** | Ivan Morozov |
| **Related** | [ADR-0001](./0001-harness-agnostic-core.md), [ADR-0008](./0008-token-budget.md), [ADR-0011](./0011-decisions-that-check-themselves.md), [owners-global-rules](./owners-global-rules-one-harness-neutral-source-reaching-every-installed-harness-on-every-machine.md) |

---

## Context

Claude Code keeps an auto Memory per repository: an index `MEMORY.md` and
topic files beside it. The owner's global rules make Codex and OpenCode read
and write the same directory. The harnesses meet it very differently:

| Harness | How it reads Memory | Load limit | Told when over it |
|---|---|---|---|
| Claude Code | its loader at session start | 200 lines or 25 000 characters of the trimmed index | yes: a `WARNING` in its context when over; after its own write, a reminder at 80 % to compact below 70 %, and an error over the limit (2.1.316: `0.8`, `0.7`; Memory docs) |
| Codex, OpenCode | their own tools, as the owner's rules say: the whole index, then relevant topics whole | none of Claude's (their tools' own limits not measured) | no |
| Every other harness | not at all | — | — |

The limit is `String.length` after `trim()` in Claude Code 2.1.316; the
documentation says "25KB". Across the five Memory indexes on this machine
bytes are 1.19–1.43 times characters: P2PMessenger's index is 23 236
characters and 29 190 bytes, so a byte count would report a loss that does
not happen.

Two problems remain that Claude Code does not report:

1. **The wrong directory.** The owner's rules — `~/.claude/CLAUDE.md`,
   `~/.codex/AGENTS.md`, `~/.config/opencode/AGENTS.md` — build the key by
   replacing every `/` with `-` in "the project root". Claude Code replaces
   every character other than ASCII letters and digits, in the canonical
   repository root found by walking `.git` files, after `realpath` and NFC,
   and truncates keys over 200 characters with a hash. With `.`, `_` or a
   space in the path, or from a linked worktree, Codex and OpenCode read and
   write a directory Claude Code never loads. The owner has lost Memory to a
   wrong key before (a guest host). No prose rule makes a model compute this
   reliably.
2. **Cost where nothing limits it.** Codex and OpenCode read the index and
   relevant topics whole every session. On this project (2026-11-13) the
   index is 10 414 characters; the topics are 616 730 bytes, the largest
   205 720 — twenty times the whole index. P2PMessenger's topics are 4.3 MB.

The five Memories on this machine (characters, trimmed, 2026-11-13):

| Project | Index | Pointers | Line p50 / p90 / max | Lines > 200 | Topics | Topic p90 / max | > 20k / > 50k |
|---|---|---|---|---|---|---|---|
| Waypost | 10 414 | 32 | 205 / 630 / 1 214 | 17 | 32 | 21 933 / 205 469 | 5 / 2 |
| MArb | 12 223 | 45 | 244 / 353 / 615 | 38 | 46 | 11 017 / 19 341 | 0 / 0 |
| P2PMessenger | 23 236 | 102 | 216 / 373 / 520 | 57 | 307 | 13 818 / 299 995 | 19 / 8 |
| two small projects | ~165 | 1 | — | 0 | 1 each | 7 128, 30 114 | 0–1 / 0 |

A threshold has to flag outliers, not the norm: an 8 000-character index
budget would flag all three working projects for good, and 200 characters per
pointer line more than half of their lines.

Memory exists in five projects on this machine; three are not bound to
Waypost. `waypost brief` exits 1 without a bound vault, and only this
repository's own `AGENTS.md` tells a harness to run it first; the routing
block Waypost installs elsewhere does not. So `brief` cannot be the channel.

## Decision

1. **Waypost never writes Memory.** It computes where Memory is and measures
   it. What to merge or drop is the owner's call; Memory has no history.
2. **One function computes the directory Claude Code would load by default:**
   - root: Claude Code's own walk — up to `.git`, through `gitdir`,
     `commondir` and `worktrees/<name>` — not `mainWorktree()`, which is
     wrong for submodules, `--separate-git-dir` and bare repositories; the
     directory itself outside git;
   - key: `realpath`, then NFC, every character matching `[^a-zA-Z0-9]`
     (no `u` flag) replaced by `-`; over 200 characters, the first 200, `-`,
     and the base-36 absolute value of the path's 32-bit hash
     (`(h<<5)-h+c|0`);
   - home: always `~/.claude`. A `CLAUDE_CONFIG_DIR` that resolves
     elsewhere is reported, never followed (step 4 below), as the
     owners-global-rules ADR rules for a home the current environment
     resolves differently.

   The state is decided in this order (Claude Code 2.1.316). Settings are
   the owner's, later winning: `~/.claude/settings.json`; `.claude/settings.json`
   in the current worktree's root, where Claude Code reads it; and
   `.claude/settings.local.json` in the canonical root the key is computed
   from. A settings file that exists but is not valid JSON gives
   `off — <file> unreadable`: Waypost cannot tell what it switches.
   1. `CLAUDE_CODE_DISABLE_AUTO_MEMORY` from the merged settings `env`
      blocks: a true value (`1/true/yes/on`) → `off`; a false value
      (`0/false/no/off`) → on, skip steps 2 and 3 (Claude Code writes each
      settings `env` over the inherited environment).
   2. Only when no settings file sets it, the same variable in this
      process's environment, counting only towards `off`: a true value →
      `off`; a false value changes nothing. The caller's
      environment is not the environment the owner's Claude Code runs in
      (a Claude desktop child inherits `CLAUDE_CODE_*`), so it may stop a
      harness but never send one to write.
   3. `autoMemoryEnabled: false` in the merged settings → `off`.
   4. A source that moves Memory, with a value Claude Code would accept →
      `overridden`, reported, not followed: `CLAUDE_CONFIG_DIR` whose
      realpath is not `~/.claude`; `CLAUDE_CODE_PROJECT_DIR_NAME` with
      `CLAUDE_CONFIG_DIR`, matching `^[A-Za-z0-9_-]{1,64}$`, not a reserved
      device name; `CLAUDE_COWORK_MEMORY_PATH_OVERRIDE`;
      `CLAUDE_CODE_REMOTE_MEMORY_DIR`; `autoMemoryDirectory` in any of the
      three settings files, absolute or `~/`-rooted, at least 3 characters,
      no `..` and no NUL.
   5. Otherwise `exists` or `absent`.

   `CLAUDE_CODE_SIMPLE`, `CLAUDE_CODE_SAFE_MODE` and `CLAUDE_CODE_REMOTE`
   describe one Claude Code process, not the owner's choice: info when
   true, in every state, never `off`. Sources Waypost cannot see — `--settings`,
   `--setting-sources`, session toggles, managed, flag and server-side
   settings — are listed in `docs/cli-reference.md`, not in every output.
3. **`waypost doctor --memory` runs in any directory, bound or not**, only
   its own section, from the project root. Its first line is always one of
   `memory: exists <dir>` (a `MEMORY.md` is there), `memory: absent <dir>`
   (create it here), `memory: overridden — <source>` or
   `memory: off — <source>`; the last two give no usable path. It is the
   first line of stdout and does not depend on the harness registry. With `off` or `overridden` the
   output is that line plus the process-flag info, and the exit code is 0;
   `--json` carries the same as `{state, dir, source, findings}`.
   `--memory --fix` is refused: `--fix` exits 0 on an issue. Otherwise, at
   most one finding per kind:
   - `issue`: the index over Claude Code's limit, measured as its loader
     does (trimmed; lines = newlines + 1); a pointer to a missing topic;
   - `warn`: the index over 80 % of that limit — 20 000 characters or 160
     lines; a topic over 50 000 characters, which is due to be split;
   - `info`: the three longest pointer lines as line number and length;
     topics with no pointer; a `MEMORY.md` under the key the old rule
     produces (`/` → `-` from the toplevel), when its realpath differs —
     notes left there are orphans; "limits unknown" when the harness record has no
     `memory` field or the registry fails to load; a process flag above
     when true.

   There is no per-line budget. Exit 1 on an `issue`, so "exit 0 — clean" in
   the owner's rules holds; with `--json` the exit code is 0, as for every
   `doctor --json`, and the levels carry the result. A size finding is for
   the owner: an agent fixes only a dead pointer it wrote itself, and never
   compacts the index on its own (Decision 1). Default `doctor`, `next` and
   `brief` do not change.
4. **The owner's global rules change in all three files**
   (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`, `~/.config/opencode/AGENTS.md`).
   `off` stops every harness, Claude Code included. `overridden` stops only
   the harnesses that take the path from Waypost: Claude Code's own loader
   follows the override to the right directory. For Codex and OpenCode:
   - from the project root, take the Memory directory from the first line of
     `waypost doctor --memory`, also in a project Waypost is not bound to and
     before the first note exists;
   - if `waypost` is missing or the first line of stdout does not start
     with `memory:` (a release before this one ignores the flag): stop if
     `~/.claude/settings.json`, `.claude/settings.json`,
     `.claude/settings.local.json` or `~/.claude.json` mentions `autoMemory` or
     `DISABLE_AUTO_MEMORY`, or the environment sets `CLAUDE_CONFIG_DIR` or a
     true `CLAUDE_CODE_DISABLE_AUTO_MEMORY`; otherwise every
     character other than A–Z, a–z, 0–9 becomes `-`; in a linked worktree
     use the main worktree's path; a path over 200 characters cannot be
     keyed by hand — say so instead of guessing;
   - when the first line says `off` or `overridden`, read and write no
     Memory directory; tell the owner once per session, naming the source;
     what would have been a note goes into the final report, or an ADR or
     docs when it is durable;
   - after writing `MEMORY.md`, run `waypost doctor --memory`; report a size
     finding to the owner;
   - read a topic over 20 000 characters by its matching section (`rg -n`,
     then a line range), not whole.

   This is the owner's change to the owner's files. Waypost reports the
   state; the rule decides what it means.
5. **Claude Code's limit is registry data; the thresholds are code.**
   - `harnesses/claude.json` gains `memory: {index_lines: 200, index_chars:
     25000, confidence: "inferred", docs, notes}`, read by the ordinary
     registry loader. `inferred`, because the documentation says "25KB" and
     the character count comes from the 2.1.316 bundle; `notes` cite both.
     A live run (a Cyrillic index under 25 000 characters and over 25 000
     bytes loads with no `WARNING`) is recorded in `notes` with the date and
     version; it does not make the record `verified` while the
     documentation says otherwise (ADR-0005: documented and exercised). A project
     override can only change that project's own findings, so no
     shipped-only loader is needed.
   - The index threshold is a share of that limit (80 %); the topic
     thresholds are constants in `scripts/memory.mjs`: 20 000 characters to
     read by section, 50 000 to warn. No configuration until someone needs
     to change them.
   - The key algorithm stays code: a `.git` walk and a hash are not data.

## Rationale

1. The key is an algorithm with edge cases; computing it once in code and
   handing every harness the result is what Waypost does instead of hooks
   (ADR-0001).
2. A command that needs no binding is the only channel that reaches unbound
   projects, other bound projects and a fresh Memory alike.
3. Reporting overrides instead of following them keeps v1 small and keeps
   the owners-global-rules rule that a differently resolved home is reported,
   never followed.
4. The cost lives in the topics; a reading rule bounds it for free, and a
   topic threshold makes the outliers visible.
5. Claude Code already warns Claude; default `doctor` and `next` stay quiet.
6. 80 % is Claude Code's own after-write threshold; the same threshold
   catches what Codex and OpenCode write unmeasured. On
   the measured Memories it flags only P2PMessenger (93 %, 1 764 characters
   from losing its tail). 50 000 characters flags ten topics — two here, eight
   in P2PMessenger, up to 300 000 characters — not the ordinary ones.
7. Off means off for everyone because the owner switched it off on purpose;
   Codex keeps its own automatic memories for private use. An `overridden`
   directory is not followed, so no harness writes to a guessed one.
8. Limits are tool knowledge and so data (the owner's rule, ADR-0005);
   thresholds are policy and stay small enough to be constants.

## Alternatives Considered

### A. A default warning in `doctor` and `next`

**Rejected because**: it repeats Claude Code's warning, uses the wrong
measure for Codex and OpenCode, and adds a line for every disabled or fresh
Memory.

### B. `brief` as the channel

**Rejected because**: `brief` needs a bound vault and is not run first
outside this repository; it would stay silent exactly when the first note is
written.

### C. Fix only the owner's prose rules

**Rejected because**: a model cannot compute a truncated, hashed key from
the canonical git root, and a size rule with nothing to measure it decays.

### D. `doctor --fix` rewrites the index

**Rejected because**: what a pointer keeps is judgement, and Memory has no
history to undo a wrong rewrite.

### E. Follow every override that moves Memory

**Rejected for v1 because**: `autoMemoryDirectory` in local and project
settings counts only in a trusted workspace, and flag, policy and managed
settings Waypost cannot see rank above the user file. Following the user
file alone could send Codex and OpenCode where Claude Code does not go;
stopping and telling the owner cannot.

### F. Detect split Memory by key prefix

**Rejected because**: the encoding erases the difference between `/`, `-`,
`.`, `_` and space, so a prefix cannot tell a subdirectory from a sibling
project. The exact old-rule key in Decision 3 covers the one known source of
splits.

### G. Limits as constants in code

**Pros**: one file, no registry change.

**Cons**: knowledge about a tool in the core, against the owner's rule and
ADR-0005.

**Rejected because**: the registry already holds what a harness is; its
Memory limit belongs beside it.

### H. Owner's budgets: 8 000 characters per index, 200 per pointer line

**Rejected because**: measured, they flag the norm — all three working
indexes and more than half of their lines — and a warning that never goes
away stops being read.

## Consequences

**Positive**:
- Codex, OpenCode and Claude Code use one directory, in unbound projects,
  worktrees and unusual paths too.
- The topic cost is bounded by a reading rule and visible by a budget.
- A dead pointer or an index past Claude Code's limit fails the check the
  owner's rules already call "clean on exit 0".
- Ordinary `doctor`, `next` and `brief` output does not grow.

**Negative / trade-offs**:
- The project doctor reads a harness's home directory; it departs from the
  owners-global-rules opt-in, because Memory exists without configuration.
  The read is local and only sizes, counts and a path are printed.
- The key algorithm and the limit come from the Claude Code 2.1.316 bundle;
  a release can change them, and v1 has no automatic drift signal — the
  registry's `inferred` and its notes say what to re-check.
- With a moved Memory, v1 names the override and the harnesses stop instead
  of using the right directory.
- Changing `~/.codex/AGENTS.md` changes the digest of Codex's home
  instructions, which the harness tool-surfaces ADR treats as a new
  configuration needing recalibration. Batch it with other global-rule
  changes, or make it in WP-22's single source once that exists.
- P2PMessenger's `scripts/check-memory.mjs` already checks Memory there with
  the old key and a prefix fallback (alternative F); it moves to
  `waypost doctor --memory` or goes, as a follow-up in that repository.
- Windows is not exercised yet; other VCS roots (Claude Code has a
  `working_copy` root) are not handled. Linux (Debian 13 arm64, Node 20.19.2,
  2026-11-15): `tests/memory.test.mjs` and `tests/tokens.test.mjs` pass 64/64;
  for a fresh repository at `/tmp/…/проект ü` Claude Code 2.1.325 wrote its
  transcripts into exactly the directory `doctor --memory` named. The index
  load was run there too (2026-11-15, 2.1.325, Haiku, same `/tmp/…/проект ü`
  repository): a Cyrillic index of 24421 characters, 42988 bytes and 190
  lines loaded whole with no warning; at 26424 characters, 46640 bytes and 195
  lines Claude Code warned "25.8KB (limit: 24.4KB)" (characters/1024) and cut
  12 lines, from line 184. So the limit counts characters on Linux 2.1.325
  as on macOS 2.1.316.

- Shared Memory itself keeps two weaknesses this ADR does not address: it
  has no history, so a bad consolidation cannot be undone, and two sessions
  in different harnesses can overwrite each other's edit of `MEMORY.md`.
  The cheapest remedy for both is the owner's: a local `git init` in the
  Memory directory. Waypost does not do it.

**What changes in code / process**:
- `scripts/memory.mjs`: the walk, the key, the measurements, the thresholds.
- `harnesses/claude.json`: the `memory` field; `docs/harnesses.md`
  describes it.
- `scripts/doctor.mjs`: `--memory` runs only that section, with no binding.
- `tests/harness.test.mjs`: `doctor --memory` joins the output budget test,
  with a fixture Memory over every threshold under its temporary home.
- `tests/env.mjs`: Memory tests clear inherited `CLAUDE_*` variables.
- `tests/memory.test.mjs`: linked worktree; submodule; bare repository with a
  worktree; `--separate-git-dir` and a worktree of it; a symlinked path; a
  path over 200 characters; an NFD path and an emoji; a Cyrillic index
  between 25 000 characters and 25 000 bytes; a trailing newline;
  `DISABLE_AUTO_MEMORY=0` in a settings `env` block beating
  `autoMemoryEnabled: false` and `=1` in the process; `=1` in settings giving
  `off`; `=1` only in the process giving `off`; `=0` in the process with
  `autoMemoryEnabled: false` still `off`; user, project and local settings
  merged, with the project file from a linked worktree's own root; a
  settings file with invalid JSON giving `off`; `off` and `overridden`
  together giving `off`; `overridden` alone; `CLAUDE_CONFIG_DIR` pointing at
  `~/.claude` not overriding; an invalid `autoMemoryDirectory` or
  `PROJECT_DIR_NAME` ignored; `CLAUDE_CODE_SIMPLE=1`, `SAFE_MODE=1` and
  `REMOTE=1` giving info, not `off`, and `SIMPLE=0` no line; the first line
  of stdout matching `^memory: (exists|absent|overridden|off)` in all four
  states; the `--json` shape; an unbound project; a
  broken registry still printing the first line; `--memory --fix` refused;
  a dead pointer exiting 1; the `.claude/projects` tree — files and
  directories — byte-identical after a run, in the `absent` state too.
- `tests/tokens.test.mjs` (or the existing tokens test): a project path over
  200 characters keys the same as `scripts/memory.mjs`.
- `docs/cli-reference.md`: `doctor --memory`, its JSON shape, and the
  sources Waypost cannot see.
- The owner's three global rule files (Decision 4).

`scripts/tokens.mjs` uses the same key function (gaining the 200-character
truncation transcripts also follow) with its own root: transcripts are keyed
by the working directory, Memory by the repository.

The three questions this draft left open — the budgets, constants or registry
data, and shared Memory with auto memory off — are settled in Decisions 2–5.

## References

- Claude Code documentation — Memory (location, load limit, overrides) and
  Sessions (key encoding and truncation)
- [ADR-0001](./0001-harness-agnostic-core.md) — one CLI instead of hooks
- [ADR-0008](./0008-token-budget.md) — context spend as a design constraint;
  this extends it to text agents write
- [ADR-0011](./0011-decisions-that-check-themselves.md) — the check guard on
  Decision 1
- [owners-global-rules](./owners-global-rules-one-harness-neutral-source-reaching-every-installed-harness-on-every-machine.md)
  — config home "reported, never followed", the opt-in rule this departs from

## Review history

- 2026-11-13, first `waypost-critic` pass on a doctor-only draft: revise.
  Taken: Claude Code's key rule, characters instead of bytes, deferring
  stale-reference, frontmatter, link and hash checks on measured noise,
  corrected citations, an owner-initiated remedy.
- 2026-11-13, second pass: revise. Claude Code's limit is characters and
  over-limit loading warns Claude; the shipped-only loader does not exist;
  moving `tokens.mjs` to the repository key would break transcripts; prefix
  split detection matches unrelated projects. Rewritten around `brief`.
- 2026-11-13, third pass: revise. `brief` fails unbound and is not run first
  outside this repository, so `doctor --memory` with no binding became the
  channel; `CLAUDE_CONFIG_DIR` reported, not followed; `mainWorktree()`
  replaced by Claude Code's `.git` walk, with `realpath`, tri-state env and
  every override reported; topic budget and reading rule; `issue` and exit 1
  for a dead pointer or the load limit; `~/.claude/CLAUDE.md` added to the
  rules change; the forbid guard (red CI on acceptance before the file
  exists, blind to async and atomic writes) replaced by a check guard;
  corrected the brief-test and key-count claims; the file renamed to match
  the decision. Not taken: none.
- 2026-11-13, owner: the open questions settled on measurements of the five
  Memories on this machine — thresholds at 80 % of the limit and 20 000 /
  50 000 characters per topic instead of 8 000 / 200 per index and line;
  Claude Code's limit in the harness registry, thresholds in code; disabled
  auto memory means no shared Memory for any harness.
- 2026-11-13, fourth pass: revise ("accept with amendments"). `off` and
  "every override reported, not followed" contradicted each other, and an
  environment flag of the calling process (`CLAUDE_CODE_SIMPLE=0` in a Claude
  desktop shell) could read as `off`: sources split into "moves Memory →
  `overridden`" and "the owner's standing switch → `off`", with precedence and
  per-process flags as info only; harnesses stop on `overridden` too;
  `confidence` lowered to `inferred` until a live run; the version-drift line
  and the `brief` decision cut; the `global_rules` migration sentence cut;
  80 % named as Claude Code's own threshold; ten topics over 50 000, not two;
  the registry loaded after the first line; size findings go to the owner;
  `--json` exit semantics; the recalibration cost of editing Codex's home
  instructions; P2PMessenger's `check-memory.mjs` as a follow-up; the guard
  rewritten as a byte-identical home tree; `tokens.mjs` shares the key
  function. Not taken: none.
- 2026-11-13, fifth pass: revise (narrow; the `off`-over-`overridden` order
  and "a false value forces on" checked against the 2.1.316 binary). Taken:
  the state is a numbered order with named settings files; the calling
  process's `DISABLE_AUTO_MEMORY` counts only towards `off`, never forcing
  Memory on; `overridden` only for values Claude Code would accept
  (`CLAUDE_CONFIG_DIR` by realpath, `autoMemoryDirectory` validated); a fixed
  `memory: <state>` first line, and a fallback when a release ignores the
  flag, which also stops on the owner's switch; the stop rule covers Claude
  Code and says how often to tell the owner and where notes go instead;
  process flags shown as info when set, invisible sources documented once;
  `verified` left to ADR-0005's definition; Alternative E's real reason;
  `--memory --fix` refused; the guard covers directories and `absent`;
  the old-key check by realpath; JSON shape and a long-path `tokens.mjs`
  test. The "reminder at 80 % to compact below 70 %" claim was withdrawn
  here, wrongly. Not taken: restricted and diskless modes (per-process, like
  `SIMPLE`).
- 2026-11-15, sixth pass (Decisions 2–4 only): accept with amendments.
  Taken: a false value in settings skips the process step too, as the test
  list already expected; the 80 %/70 % after-write reminder restored
  (`n0o=0.8, qQ=0.7` in 2.1.316, and the Memory docs); `overridden` stops
  only harnesses that take the path from Waypost, `off` stops all; the
  fallback checks all three settings files and the environment switch;
  the project settings file read from the worktree's own root; invalid
  settings JSON gives `off`; process flags are info when true, in every
  state; tests for each step and the first-line format. Open, not taken:
  the legacy `env` in `~/.claude.json`, whether Claude Code accepts JSONC
  settings, and the desktop's 2.1.325 against the 2.1.316 checked here.
- 2026-11-15, owner: accepted as of the sixth pass. The three open
  questions are checked when `scripts/memory.mjs` is implemented.
- 2026-11-15, implementation (story "doctor --memory" in WP-22), answers
  against 2.1.316 and 2.1.325: settings are strict JSON, not JSONC, so
  "unreadable → `off`" fires exactly where Claude Code ignores the file;
  the legacy `env` in `~/.claude.json` is applied, read as the lowest `env`
  layer; step 4's variables come from the process and from the `env` of
  the owner's own files (`~/.claude/settings.json`, `~/.claude.json`), never
  a project's, which Claude Code filters; `autoMemoryDirectory` is
  normalized, not refused for `..` (Claude Code's `ic()`), and any
  `CLAUDE_CODE_REMOTE_MEMORY_DIR` overrides. The owner added `~/.claude.json`
  to Decision 4's fallback and wrote the three global rule files on 2026-11-15.
- **Live run (2026-11-15, Claude Code 2.1.316, Haiku):** a Cyrillic index of
  24 499 characters and 44 514 bytes loaded whole with no `WARNING`; the control
  at 26 499 characters warned "25.9KB (limit: 24.4KB)" (characters / 1024) and
  cut whole lines from line 107. Recorded in `harnesses/claude.json` `notes`;
  `confidence` stays `inferred` while the documentation says "25KB" (Decision 5).

---

*Last updated: 2026-11-15*
