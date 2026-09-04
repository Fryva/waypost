---
name: waypost-commit
description: Use when about to commit, revert, stash or reset in a project with a waypost vault. Commit through `waypost commit` so the history carries session and story trailers, and check other sessions before any revert.
license: MIT
---

# Commit through waypost

- `waypost commit -m "<what>" [--story <epic>/<stem>] [--all | -- <paths>]`
  reconciles the derived views, checks other sessions' claims and leases, and
  writes the `Waypost-Harness` / `Waypost-Session` / `Waypost-Story` trailers.
  One story per commit.
- Other sessions may be live in this repository, on this machine or another:
  `waypost sessions` lists them, `waypost lease list` what they are editing.
  If the checkout is shared with another live session, `waypost brief` says
  so: commit verified work at once, and never run `git checkout --`,
  `git restore`, `git stash`, `git reset --hard` or `git clean` on paths you
  did not edit yourself without checking those two commands first.
- `waypost commit --all` refuses in a shared checkout; name your paths.
- Before editing files someone else might touch: `waypost lease <path…>`;
  `waypost lease release` when done.

Never merge a derived view by hand; a conflict in `kanban.md`, `graph.md` or an
index is resolved by `waypost merge <ref>` or `waypost reconcile --write`.
