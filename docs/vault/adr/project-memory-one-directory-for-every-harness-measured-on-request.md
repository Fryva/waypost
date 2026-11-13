---
type: adr
id: "project-memory-one-directory-for-every-harness-measured-on-request"
title: "Project Memory: one directory for every harness, measured on request"
status: proposed
date: 2026-11-13
authors: ["Ivan Morozov"]
tags: ["memory", "doctor", "brief", "context-spend"]
external_refs: {"claude-code-memory": "https://code.claude.com/docs/en/memory", "claude-code-sessions": "https://code.claude.com/docs/en/sessions#where-transcripts-are-stored"}
supersedes: null
superseded_by: null
review_status: pending
reviewed_at: null
drafted_by: {"harness":"claude","provider":null,"date":"2026-11-13"}
guards: [{"check": "node --test tests/memory.test.mjs", "why": "Decision 1: brief and doctor --memory run with every node:fs write method replaced by a throw"}]
code_refs: ["scripts/brief.mjs", "scripts/doctor.mjs", "scripts/agents-registry.mjs", "harnesses/claude.json", "tests/harness.test.mjs", "tests/env.mjs", "scripts/memory.mjs (planned)", "tests/memory.test.mjs (planned)"]
---

# Project Memory: one directory for every harness, measured on request

| Field | Value |
|---|---|
| **Status** | proposed — rewritten on 2026-11-13 after three fresh-context critic passes |
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
| Claude Code | its loader at session start | 200 lines or 25 000 characters of the trimmed index | yes, a `WARNING` in its context |
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
   - home: always `~/.claude`. `CLAUDE_CONFIG_DIR` is reported, never
     followed, as the owners-global-rules ADR rules for a home the current
     environment resolves differently.

   Everything that moves or disables Memory is reported as "set, not
   followed" in v1: `CLAUDE_CONFIG_DIR`, `CLAUDE_CODE_PROJECT_DIR_NAME`,
   `CLAUDE_COWORK_MEMORY_PATH_OVERRIDE`, `CLAUDE_CODE_REMOTE_MEMORY_DIR`,
   `autoMemoryDirectory` and `autoMemoryEnabled` in user, local and project
   settings, `CLAUDE_CODE_DISABLE_AUTO_MEMORY` (three states: `1/true/yes/on`
   off, `0/false/no/off` forced on, anything else unset), `CLAUDE_CODE_SIMPLE`
   and `CLAUDE_CODE_SAFE_MODE`. Following them needs Claude Code's workspace
   trust model; v1 does not guess it. Sources Waypost cannot see —
   `--settings`, `--setting-sources`, managed and server-side settings — are
   named.
3. **`waypost doctor --memory` runs in any directory, bound or not**, only
   its own section. Its first line is always the directory and its state:
   `exists` (a `MEMORY.md` is there), `absent` (create it here), or
   `overridden` (with what is set), or `off` (auto memory disabled, with the
   source). Then, at most one finding per kind with counts and the three
   worst items:
   - `issue`: the index over Claude Code's limit, measured as its loader
     does (trimmed; lines = newlines + 1); a pointer to a missing topic;
   - `warn`: the index over 80 % of that limit — 20 000 characters or 160
     lines — before anything is lost; a topic over 50 000 characters, which
     is due to be split;
   - `info`: the three longest pointer lines; topics with no pointer; a
     `MEMORY.md` under the key the old rule produces (`/` → `-` from the
     toplevel), when that key differs — notes left there are orphans; an
     installed Claude Code other than the version the limits come from;
     "limits unknown" when the harness record carries no `memory` field.

   There is no per-line budget: the three longest lines show where the
   index has turned into a work log.

   Exit 1 on an `issue`, so "exit 0 — clean" in the owner's rules holds.
   Default `doctor` and `next` do not change.
4. **`brief` adds a line only when the index is over 80 % of the limit.**
   `brief --json` always carries `memory: {dir, state, index_chars,
   index_lines}`. Claude Code already gets the path from its loader; nothing
   is added to an ordinary session.
5. **The owner's global rules change in all three files**
   (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`, `~/.config/opencode/AGENTS.md`):
   - take the Memory directory from the first line of
     `waypost doctor --memory`, also in a project Waypost is not bound to and
     before the first note exists;
   - if `waypost` is missing or does not know `--memory`: every character
     other than A–Z, a–z, 0–9 becomes `-`; in a linked worktree use the main
     worktree's path; a path over 200 characters cannot be keyed by hand —
     say so instead of guessing;
   - after writing `MEMORY.md`, run `waypost doctor --memory`;
   - read a topic over 20 000 characters by its matching section (`rg -n`,
     then a line range), not whole;
   - when the first line says `off`, Claude Code's auto memory is disabled:
     do not read or write the shared Memory either.

   This is the owner's change to the owner's files. Waypost reports `off`;
   the rule decides what it means.
6. **Claude Code's limit is registry data; the thresholds are code.**
   - `harnesses/claude.json` gains `memory: {index_lines: 200, index_chars:
     25000, confidence: "documented", docs, notes}`, read by the ordinary
     registry loader. `notes` say the documentation reads "25KB" while
     2.1.316 counts characters, and which version and OS were checked. A
     project override can only change that project's own findings, so no
     shipped-only loader is needed; when WP-22 builds `global_rules`, whose
     size limits are already registry data, the field moves there.
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
6. Thresholds are set where they flag outliers on the measured Memories: 80 %
   of the limit flags only P2PMessenger (93 %, 1 764 characters from losing
   its tail); 50 000 characters flags the 205 000- and 300 000-character
   topics, not the ordinary ones.
7. Off means off for everyone: shared Memory exists so that a note from one
   harness reaches the others; if Claude Code does not load it, notes from
   Codex and OpenCode reach no one, and the owner disabled it on purpose.
   Codex keeps its own automatic memories for private use.
8. Limits are tool knowledge and so data (the owner's rule, ADR-0005, and the
   owners-global-rules ADR, which lists size limits as registry data);
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

### E. Follow every override like Claude Code

**Rejected for v1 because**: local and project settings count only in a
trusted workspace; without Claude Code's trust model Waypost would follow a
cloned repository's settings and send Codex and OpenCode where Claude Code
would not go.

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
- The key algorithm and the limit come from the Claude Code 2.1.316 binary;
  a release can change them. The version check in Decision 3 is the drift
  signal.
- With a moved or disabled Memory, v1 names the override instead of the
  right directory.
- Windows and Linux are not exercised yet; other VCS roots (Claude Code has
  a `working_copy` root) are not handled.

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
- `scripts/brief.mjs`: the over-budget line and the `memory` JSON field.
- `tests/harness.test.mjs`: the `brief` budget test (1 500 characters) gets a
  fixture Memory over budget under its temporary home.
- `tests/env.mjs`: Memory tests clear inherited `CLAUDE_*` variables.
- `tests/memory.test.mjs`: linked worktree; submodule; bare repository with a
  worktree; `--separate-git-dir` and a worktree of it; a symlinked path; a
  path over 200 characters; an NFD path and an emoji; a Cyrillic index
  between 25 000 characters and 25 000 bytes; a trailing newline;
  `DISABLE_AUTO_MEMORY=0`; an invalid `PROJECT_DIR_NAME`; an unbound
  project; a dead pointer exiting 1; `brief` and `doctor --memory` with every
  `node:fs` write method replaced by a throw.
- `docs/cli-reference.md`: `doctor --memory`, the `brief` field.
- The owner's three global rule files (Decision 5).

The `transcriptDir` in `scripts/tokens.mjs` keeps its own key and root:
transcripts are keyed by the working directory, not the repository.

The three questions this draft left open — the budgets, constants or registry
data, and shared Memory with auto memory off — are settled in Decisions 3, 5
and 6.

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
  auto memory means no shared Memory for any harness. This version has not
  been reviewed by a critic.

---

*Last updated: 2026-11-13*
