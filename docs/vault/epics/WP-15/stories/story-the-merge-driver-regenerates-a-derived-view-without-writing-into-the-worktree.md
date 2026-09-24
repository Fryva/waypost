---
type: story
id: "story-the-merge-driver-regenerates-a-derived-view-without-writing-into-the-worktree"
epic: "WP-15"
title: "The merge driver regenerates a derived view without writing into the worktree"
status: planned
priority: p2
assignee: "Ivan Morozov"
created: 2026-09-24
updated: 2026-09-24
external_refs: {}
tags: ["merge", "commit-protocol", "bug"]
code_refs:
  - scripts/merge-derived.mjs
  - scripts/reconcile.mjs
  - tests/merge-derived.test.mjs (waiting)
specs: []
started_at: null
closed_at: null
plan_updated_at: null
---

# The merge driver regenerates a derived view without writing into the worktree

| Field | Value |
|---|---|
| **Epic** | [WP-15](../epic.md) |
| **Status** | planned |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

`waypost merge-derived` breaks a `git cherry-pick` of several commits whenever those commits
touch the derived views. Seen on 2026-09-23 in Fryva (checkout at `f311310`), landing worktree
branches onto `main` with `git cherry-pick main..<branch>` — four commits, each regenerating
`docs/vault/kanban.md` and `docs/vault/graph.md`:

1. Two commits applied. The third stopped with `error: Your local changes to the following files
   would be overwritten by merge: docs/vault/graph.md docs/vault/kanban.md`. The worktree diff
   held nothing but regenerated content: a new `generated_at` and one story moved between board
   columns.
2. After `git checkout -- docs/vault/graph.md docs/vault/kanban.md` and
   `git cherry-pick --continue`, git answered `no cherry-pick or revert in progress`. The fourth
   commit had not been applied, and nothing said so: it surfaced only because the range was
   being counted by hand.
3. `git cherry-pick <fourth>` on a clean worktree (`git status` empty) failed the same way before
   applying anything.
4. `git -c merge.waypost-derived.driver=true cherry-pick …` — the driver replaced by "keep ours" —
   applied the rest cleanly. The views were then rebuilt with `waypost reconcile --write` and
   committed separately.

The user is anyone who moves work between branches with the driver installed: merging worktree
branches into `main` is exactly the parallel-work path ADR-0006 put the driver in for.

**Cause.** `main()` runs `reconcile.mjs --write --only <selector>` (`scripts/merge-derived.mjs:71-73`),
and reconcile writes the regenerated view into the vault — the real file at `%P`, in the worktree
— before the result is copied over `%A` (line 93). Git has not finished the merge at that point
and does not expect the worktree file to change under it, so the next step of the sequence sees a
"local change" and refuses to continue. That is items 1 and 3.

**Probably also wrong, to verify.** The header comment says the driver is sound "because the
SOURCE of these files — the artifacts — has already been merged by git before the driver runs".
With merge-ort, content merges happen in memory and the worktree is written after all of them, so
reconcile most likely reads the vault as it was BEFORE the commit being applied. If so, even a
merge that does not break produces a view that misses the commit's own stories and is only put
right by the next reconcile.

## Decomposition

- [ ] A reproduction test first: a temporary repo with the driver configured, a branch of two
      commits that each change a story and regenerate `kanban.md`, `git cherry-pick` of the range
      onto the base — it fails today
- [ ] Confirm or refute "reconcile reads the pre-merge vault" with the same fixture
- [ ] Make the driver write only to `%A` and never to the worktree
- [ ] Make the result reflect the merged artifacts, or say plainly that it does not and who
      rebuilds it (see Technical Notes)
- [ ] CHANGELOG entry; fix the header comment of `scripts/merge-derived.mjs`

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

## Acceptance Criteria

- [ ] A multi-commit `git cherry-pick` whose commits touch derived views completes without
      disabling the driver, and `git status` is clean afterwards
- [ ] The same holds for `git merge` and `git rebase` of such a branch
- [ ] The driver never modifies a worktree file; only `%A`
- [ ] After the operation, the committed derived view equals what `waypost reconcile --write` would
      produce from the merged artifacts, or `waypost doctor` reports it as stale

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

- `reconcile.mjs` has no way to write anywhere but the vault, and its input is the vault in the
  worktree. Regenerating into `%A` needs an output override, or input read from the merged index
  rather than from the worktree.
- A simpler option: the driver resolves to either side unchanged (the view is derived, so any
  version is equally "wrong"), and the regeneration moves to where the merged artifacts really are
  on disk — the next `waypost commit`, a `post-merge`/`post-rewrite` hook, or doctor's staleness
  check. That drops the claim that a derived view is always current right after a merge, which the
  current code does not deliver anyway.
- Workaround until then: `git -c merge.waypost-derived.driver=true <cherry-pick|merge|rebase> …`,
  then `waypost reconcile --write` and a separate commit.

## Dependencies

- ADR-0006 "A commit protocol for parallel work across harnesses" — the driver's contract

## Attachments

- Seen in Fryva on 2026-09-23; the workaround is recorded in that project's shared Memory

---

*Last updated: 2026-09-24*
