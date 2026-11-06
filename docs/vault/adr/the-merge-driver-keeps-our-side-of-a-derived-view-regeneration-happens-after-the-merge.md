---
type: adr
id: "the-merge-driver-keeps-our-side-of-a-derived-view-regeneration-happens-after-the-merge"
title: "The merge driver keeps our side of a derived view; regeneration happens after the merge"
status: proposed
date: 2026-11-06
authors: ["Ivan Morozov"]
tags: ["merge", "derived-views", "adr-0006"]
external_refs: {}
supersedes: null
superseded_by: null
review_status: pending
reviewed_at: null
drafted_by: {"harness":"claude","provider":null,"date":"2026-11-06"}
guards: []
code_refs: ["scripts/merge-derived.mjs", "scripts/commit.mjs", "scripts/doctor-repairs.mjs", "tests/commits.test.mjs", "scripts/doctor-generated.mjs"]
---

# The merge driver keeps our side of a derived view; regeneration happens after the merge

| Field | Value |
|---|---|
| **Status** | proposed |
| **Date** | 2026-11-06 |
| **Authors** | Ivan Morozov |

---

## Context

ADR-0006 put a git merge driver on the vault's derived views (`kanban.md`,
`graph.md`, `code-map.md`, folder index READMEs): "the driver ignores both sides
and regenerates the file from the artifacts — which git has already merged by
then". Both halves of that sentence turned out wrong (story "The merge driver
regenerates a derived view without writing into the worktree", WP-15,
reproduced 2026-11-06 in `tests/commits.test.mjs`):

1. **The artifacts are not merged yet.** merge-ort merges contents in memory and
   writes the worktree after every driver has run. The vault the driver reads is
   the one from before the merge, so the board it builds misses the very commit
   being applied: after `git cherry-pick` of "story Alpha" the committed board
   had no Alpha.
2. **Regenerating wrote into the worktree.** The driver ran
   `reconcile --write`, which rewrote the real `kanban.md` before the result was
   copied to `%A`. In a sequence git then saw a "local change" and refused the
   next commit: a `git cherry-pick` of three commits stopped on the third, and a
   `rebase` the same way. The only way through was to disable the driver.

ADR-0006 already knew part of this ("the board in a merge commit can be one
artifact short") and answered it with `waypost merge`, which merges with
`--no-commit`, reconciles and commits. The driver itself never delivered the
"always current" view it claimed.

## Decision

The driver never regenerates and writes nothing but `%A`. What it puts there
depends on what the file is:

| File | Result in `%A` | Exit |
|---|---|---|
| `kanban.md`, `graph.md`, `code-map.md` at the vault root (generated whole) | our side, unchanged | 0 |
| `README.md` of a layout folder (`adr/`, `specs/`, `epics/`, …) — a generated index table inside human prose | the prose merged three-way (`git merge-file`), the table from our side | 0; 1 with markers when the prose conflicts |
| anything else (another README, a file outside the bound vault, no bound vault) | a plain three-way text merge, as git would do without the driver | 0; 1 with markers on a conflict |

A generated table or view is re-derived where the merged artifacts really are on
disk: `waypost merge` reconciles before its commit (unchanged), `waypost commit`
reconciles (and says so when a view it rewrote is left out of explicit paths),
and `waypost reconcile --write` does it by hand. `waypost doctor` reports a stale
`kanban.md` or `code-map.md` (and `graph.md` once it exists) as an issue, which
fails the CI gate; a folder index missing a row is a warning, not an issue.

"Our side" means a different thing in each git operation, and what keeping it
costs for a whole view is only staleness:

| Operation | `%A` ("ours") | Theirs, dropped until re-derived |
|---|---|---|
| merge, pull, `waypost merge` | the current branch | the merged branch |
| cherry-pick, revert, am -3 | HEAD | the applied commit |
| rebase, pull --rebase | upstream plus commits replayed so far | the commit being replayed |
| stash pop/apply | HEAD | the stash |
| checkout -m | the target branch | the local edits |

A commit that changed **only** derived views (a "regenerate the views" commit)
becomes empty under any of these: `cherry-pick` stops with "nothing to commit"
(`git cherry-pick --skip`, or `--empty=drop` up front), and `rebase` drops it.
Nothing is lost by that — the view is derived — but the sequence needs the skip.

This amends only the derived-views paragraph of ADR-0006 (and the note on
`git merge` in its Decision); trailers, claims and `waypost merge` stay as they are.

## Rationale

1. Inside a merge driver no correct view can be built: the inputs are not on
   disk. For a file generated whole any side is equally stale, and ours costs
   nothing.
2. A folder index is not generated whole: the prose around its table is written
   by people (`adr/README.md` holds the ADR process). Keeping one side there
   would drop the other side's prose silently, so only the table — the part
   reconcile rebuilds — takes our side.
3. A driver that writes only `%A` cannot leave a "local change" behind in the
   middle of a sequence.
4. The staleness of whole views is detected deterministically (`doctor`) and
   repaired mechanically (`reconcile`); the protocol's own merge path already
   reconciles before committing.

## Alternatives Considered

### Regenerate into `%A` only, from the worktree vault

**Pros**: no worktree write, so sequences stop breaking.
**Cons**: the view is still built from the pre-merge vault — wrong, but looks
current; keeps a reconcile run (seconds) inside every merge of every view.
**Rejected because**: it keeps a false "always current" claim at a real cost.

### Regenerate from the merged index or tree

**Pros**: would be correct.
**Cons**: during merge-ort the merged contents of the other files are not in the
index (checked with a probe driver: the applied commit's story was neither on
disk nor in the index); `git merge-tree --write-tree` could build a tree, but it
invokes the driver recursively, and stash/checkout -m have no `*_HEAD` to merge;
every generator would need a second input path (a git tree).
**Rejected because**: disproportionate for a view `reconcile` rebuilds in seconds.

### Keep ours for every README under the vault (the first draft of this ADR)

**Rejected because**: the critic pass reproduced silent loss of human prose in
`adr/README.md` under merge, rebase, stash pop and checkout -m, and any README
at any depth (a research note's own README) was taken for a view.

### Keep theirs

**Rejected because**: for whole views it is as stale as ours, and in a rebase
"theirs" is the commit being replayed, in a merge the other branch — no side is
right; ours is the one git already put in `%A`.

### A post-merge / post-rewrite hook that reconciles

**Rejected because**: hooks are not a required interface (AGENTS.md); git runs
`post-merge` on no cherry-pick, revert or stash and `post-rewrite` only on
rebase and amend; and writing the views after the operation leaves the worktree
dirty just the same.

## Consequences

**Positive**:
- `git cherry-pick`, `rebase` and `merge` of commits that touch derived views
  complete with the driver on, and the worktree stays clean.
- Human prose in a folder index survives a merge; a README that is not an index
  merges as git would without the driver.
- The driver no longer spawns reconcile once per view per merge.

**Negative / trade-offs**:
- After a plain git operation the committed views can be stale until the next
  `waypost commit` that stages them, or `reconcile --write` plus a commit; until
  then `doctor` (and a CI gate on it) is red for kanban/code-map/graph. Pushing a
  plain cherry-pick or rebase as it is makes CI red — by design, not by accident.
- A views-only commit becomes empty in a sequence: `cherry-pick --skip`.
- A merge done on a forge (a PR's merge button) runs no custom driver at all.
- A teammate on an older Waypost (`waypost merge-derived` from their PATH) still
  runs the old driver until they upgrade.

**What changes in code / process**:
- `scripts/merge-derived.mjs` as in the table; header comment rewritten.
- `scripts/commit.mjs`: a hint when reconcile rewrote a view the explicit
  paths leave out.
- `.gitattributes` comment written by `doctor --fix`, `waypost help`,
  `docs/how-it-works.md`, `AGENTS.md`, CHANGELOG updated.
- ADR-0006 carries "Amended by" notes on its derived-views paragraph and on the
  `git merge` note in its Decision.

## References

- ADR-0006 "A commit protocol for parallel work across harnesses"
- Story "The merge driver regenerates a derived view without writing into the
  worktree" (WP-15)
- `tests/commits.test.mjs` — cherry-pick, rebase and merge of a diverged branch
  with the driver on

---

*Last updated: 2026-11-06*
