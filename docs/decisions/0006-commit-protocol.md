# ADR-0006: A commit protocol for parallel work across harnesses

- Status: proposed
- Date: 2026-09-01
- Deciders: not approved by the project owner; status `proposed`
- Supersedes: —
- Superseded by: —
- Related: ADR-0003 (roles), ADR-0004 (paths), ADR-0007 (shared vaults), `scripts/commit.mjs`, `scripts/merge-derived.mjs`
- code_refs: ["scripts/commit.mjs", "scripts/merge-derived.mjs", "scripts/sessions.mjs", "scripts/doctor.mjs", "bin/waypost", "tests/commits.test.mjs"]

## Context

The fork exists so that one project can be driven from different harnesses. That
implies something upstream never had to handle: several sessions working **at the
same time** — Claude Code in a terminal, Codex in another window, Cursor in the
editor — all writing to one repository and one vault.

That produces three distinct kinds of confusion, and they need different answers:

1. **The history cannot say who did what.** A week later `git log` cannot tell
   which commit came from which session or harness, or which story it served.
2. **Derived views conflict on every merge.** `kanban.md`, `graph.md`,
   `code-map.md` and the folder indexes are generated. Two sessions each add a
   story, and git asks a human to merge two machine-written files whose only
   correct resolution is "throw both away and regenerate".
3. **Two sessions open the same story.** Nobody finds out until the work has
   been done twice.

## Decision drivers

- No server and no synchronisation service: coordination has to work through
  files that already exist (git, and the session registry in the vault).
- A convention that cannot be followed from a fourth harness is worse than none.
- The record must be machine-readable by standard git, not by our parser.
- Gate where a mistake becomes permanent (the commit); warn where it is still
  reversible (opening a story).

## Considered options

### Option 1: git trailers + a merge driver + claims in the session registry (chosen)

**The record.** Every commit carries trailers:

```
Waypost-Harness:  claude
Waypost-Session:  claude-01H…
Waypost-Provider: kimi          (when the harness is pointed at a model vendor)
Waypost-Story:    PS-1/story-codex-adapter
```

This is git's own mechanism: `git interpret-trailers --parse`,
`git log --format=%(trailers)`, `--grep` all work without our code. The subject
line is deliberately unregulated: a human or an agent in an unfamiliar harness
must be able to comply by adding three lines.

**Derived views.** `.gitattributes` marks them `merge=waypost-derived`, and the
driver (`waypost merge-derived`) ignores both sides and regenerates the file from the
artifacts — which git has already merged by then. A conflict in a generated file
stops existing as a class.

**Claims.** `waypost story plan --write` records a claim in this session's file in
the vault and `close` releases it; `waypost sessions` shows who is on what; and
`waypost commit --story X` refuses to commit a story another live session holds
until `--force` is passed. The registry lives in the vault, so every harness
bound to it sees the same answer — that is the coordination channel.

**Pros:** zero infrastructure; git reads the record itself; board conflicts
disappear; duplicated work is caught before it reaches the history.
**Cons:** trailers only appear on commits made through `waypost commit` (a hand-made
commit gets none — `waypost log` counts those honestly); a claim lives inside a
liveness window and depends on a stable session id.

### Option 2: a branch per session plus merge rules

**Pros:** physical isolation of parallel work.
**Cons:** answers none of the three questions *within* a branch, and merely
postpones the board conflict to merge time. Orthogonal to what was chosen —
branches can be layered on top. Rejected as a standalone answer.

### Option 3: do not commit derived views at all (gitignore them)

**Pros:** no conflicts by construction.
**Cons:** the board and the graph stop being part of what a human sees on GitHub
or in a clone, which loses the property that the vault is readable without the
tool. Rejected.

## Decision

Take option 1 whole: trailers as the record, the merge driver as the resolution
for derived files, claims in the session registry as the warning about parallel
work.

Separately: `git merge` commits by itself, and at that moment the driver
regenerates the board from a worktree git has not finished checking out — so the
board in a merge commit can be one artifact short. `waypost merge <ref>` therefore
merges with `--no-commit`, reconciles, and commits through the same path, which
puts the correct board in the merge commit itself. With a plain `git merge` the
residual drift is caught by `waypost doctor` (the `kanban` check) and fixed by
`waypost reconcile --write` — documented behaviour rather than a silent gap.

Session identity resolves as: `--id` → `$WAYPOST_SESSION_ID` → a harness session env
var (`CLAUDE_CODE_SESSION_ID`, `CLAUDE_SESSION_ID`, `CODEX_SESSION_ID`) → a
terminal/pane id (`TERM_SESSION_ID`, `ITERM_SESSION_ID`, `TMUX_PANE`,
`WT_SESSION`, …) → `<host>-<parent pid>`. The derivation runs exactly once per
invocation, in `bin/waypost`'s own `main()`, where `process.ppid` genuinely is the
shell or harness that invoked the CLI — not inside a script it spawns, whose
parent pid would be `bin/waypost` itself and different on every single call. The
result is pinned to `$WAYPOST_SESSION_ID` in that process's environment before
anything else runs, so every child script one `waypost` command spawns (`reconcile`,
`sessions`, `presence`, …) inherits and agrees on the same id. Harnesses are
still encouraged to export `WAYPOST_SESSION_ID`: the last-resort fallback is right
for one process tree driven by one shell, but two separate `waypost` invocations
from two different shells (no harness or terminal env var in either) still
derive two different ids, since neither shell's pid is known to the other.

## Consequences

### Positive

- `waypost log --story PS-1/story-x`, `--harness codex` and `--provider deepseek`
  answer "who did this" without anyone having agreed on anything in advance.
- Merging two branches that each added a story produces no conflict, and the
  merge commit's board holds both.
- An attempt to close a story another session holds stops before the commit.
- `waypost doctor` knows about the driver and repairs its configuration, which is
  machine-local — every clone wires it once.

### Negative / risks

- A commit made outside `waypost commit` has no trailers; that is visible in
  `waypost log`, but it is not forbidden.
- A claim is a fact with a liveness window, not a lock: a crashed harness must
  not hold a story forever, so a 30-minute window decides freshness.
- An unstable session id (a harness that exports none, calls from different
  shells) produces extra registry entries; `WAYPOST_SESSION_ID` and
  `waypost sessions --prune` are the remedy.
- The driver regenerates silently; when regeneration is impossible it exits
  non-zero and leaves the conflict to a human, which is preferable to writing a
  guess.

## Verification and follow-up

- `tests/commits.test.mjs`: git's own parser recognises the trailer block,
  including on top of an existing one; `waypost log` reads them back and filters;
  a story reference is resolved against the vault and a typo is rejected; a
  claim by another live session blocks the commit and `--force` releases it; the
  gate claims and releases; two branches with their own stories merge without
  conflict markers and with a complete board in the merge commit; doctor reports
  the driver and repairs a stale configuration; the driver refuses to guess on a
  file that is not a derived view.
- Live: temporary repositories with a real `kanban.md` conflict, `waypost merge`,
  and parallel claims from claude/codex/cursor sessions.
- Not verified: two processes writing one session file at the same instant (a
  filesystem-level race). The registry is written rarely enough for that to be
  an accepted assumption rather than a tested one.
