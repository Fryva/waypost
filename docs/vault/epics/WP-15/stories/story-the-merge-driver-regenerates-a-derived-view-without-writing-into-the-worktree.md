---
type: story
id: "story-the-merge-driver-regenerates-a-derived-view-without-writing-into-the-worktree"
epic: "WP-15"
title: "The merge driver regenerates a derived view without writing into the worktree"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-09-24
updated: 2026-11-06
external_refs: {}
tags: ["merge", "commit-protocol", "bug"]
code_refs:
  - scripts/merge-derived.mjs
  - scripts/commit.mjs
  - scripts/doctor-generated.mjs
  - scripts/doctor-repairs.mjs
  - tests/commits.test.mjs
  - tests/doctor-generated.test.mjs
  - tests/doctor-repairs.test.mjs
  - bin/cli/help.mjs
  - docs/how-it-works.md
specs: []
started_at: "2026-11-06T14:42:51.989Z"
closed_at: "2026-11-06T17:19:40.871Z"
plan_updated_at: "2026-11-06T14:42:51.989Z"
---

# The merge driver regenerates a derived view without writing into the worktree

| Field | Value |
|---|---|
| **Epic** | [WP-15](../epic.md) |
| **Status** | done |
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

- [x] A reproduction test first: a temporary repo with the driver configured, a branch of two
      commits that each change a story and regenerate `kanban.md`, `git cherry-pick` of the range
      onto the base — it fails today
- [x] Confirm or refute "reconcile reads the pre-merge vault" with the same fixture
- [x] Make the driver write only to `%A` and never to the worktree
- [x] Make the result reflect the merged artifacts, or say plainly that it does not and who
      rebuilds it (see Technical Notes)
- [x] CHANGELOG entry; fix the header comment of `scripts/merge-derived.mjs`

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

Owner's decisions (2026-11-06): the driver keeps our side; the change is a new
ADR "The merge driver keeps our side of a derived view; regeneration happens
after the merge" (proposed) amending ADR-0006's derived-views paragraph.

1. `tests/commits.test.mjs` — a diverged branch of three story commits and a
   story on `main`, driver wired by `doctor --fix`; plain `git cherry-pick
   main..b`, `rebase main` and `merge b`: exit 0, clean `git status`, every
   story in the tree, `doctor` reports the stale board, `reconcile` fixes it.
   With the old driver cherry-pick and rebase fail (checked by swapping it in).
2. Confirmed: after cherry-picking "story Alpha" the committed board had no
   Alpha — the driver reads the pre-merge vault.
3. `scripts/merge-derived.mjs` — writes only `%A`: kanban/graph/code-map keep
   our side; a layout folder's index README keeps our table and merges its
   prose three-way (`git merge-file`, markers + exit 1 on a prose conflict);
   anything else merges as plain text. Scratch files in the OS temp dir.
   (Critic pass: the first draft kept our side of every README and lost human
   prose.)
4. `scripts/doctor-generated.mjs` — the folder index table is compared whole
   with what reconcile would write (issue), as kanban/graph/code-map are.
5. `scripts/commit.mjs` — `waypost commit -- <paths>` says when a view
   reconcile rewrote is not among the paths.
6. Help, `docs/how-it-works.md`, `AGENTS.md`, README, the `.gitattributes` comment
   `doctor --fix` writes, CHANGELOG; ADR-0006 "Amended by" note.

## Acceptance Criteria

- [x] A multi-commit `git cherry-pick` whose commits touch derived views completes without
      disabling the driver, and `git status` is clean afterwards — evidence:
      tests/commits.test.mjs "a cherry-pick of a range whose commits regenerate the board…";
      fails against the old driver ("Your local changes … would be overwritten by merge");
      a views-only commit stops as empty by git's design, `--skip` goes on (test "a commit
      that changed only the views…")
- [x] The same holds for `git merge` and `git rebase` of such a branch — evidence: the rebase
      and merge variants of the same test; rebase fails against the old driver
- [x] The driver never modifies a worktree file; only `%A` — evidence: scripts/merge-derived.mjs
      writes only `%A` (scratch files in the OS temp dir); tests "keeps our side of a whole
      generated view and writes nothing else", clean `git status` in the sequence tests
- [x] After the operation, the committed derived view equals what `waypost reconcile --write` would
      produce from the merged artifacts, or `waypost doctor` reports it as stale — evidence:
      kanban/graph/code-map compared whole (issue); folder index tables now compared whole with
      `rebuildIndexRows` (scripts/doctor-generated.mjs, issue; tests/doctor-generated.test.mjs);
      the sequence tests assert the doctor issue and that reconcile restores every story

## Final Summary

Reproduced on 2026-11-06: a 3-commit cherry-pick stopped on a "local change" the
driver wrote into the worktree, and the picked commit's board missed its own story
(the driver reads the pre-merge vault; merge-ort writes the worktree after drivers).
Owner's decisions: the driver keeps our side; a new ADR "The merge driver keeps our
side of a derived view; regeneration happens after the merge" (proposed) amends
ADR-0006. After the critic pass the driver distinguishes whole views (ours), a
layout folder's index README (our table, prose merged three-way with markers on a
conflict) and anything else (plain text merge) — the first draft lost human prose.
`doctor` compares index tables whole; `waypost commit -- <paths>` names a view it
rewrote but did not stage.

Tests: 13 merge-driver/WP-15 tests in tests/commits.test.mjs; full npm test 2580
pass, 0 fail. Fresh-context waypost-critic (revise → addressed) and waypost-reviewer
(AC4 gap for indexes → fixed). Left open: the ADR needs the owner's acceptance; a
merge on a forge runs no driver; a teammate on an older CLI runs the old driver;
`plainMerge` ignores `-X ours|theirs` and `conflict-marker-size`.

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

*Last updated: 2026-11-06*
