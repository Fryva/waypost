---
type: runbook
slug: "measure-the-git-common-dir-across-checkout-layouts"
title: "Measure the git common dir across checkout layouts"
status: active
date: 2026-09-04
authors: ["Ivan Morozov"]
tags: []
---

# Measure the git common dir across checkout layouts

## Purpose

ADR-0010 rests on what `git rev-parse --git-common-dir` answers across checkout layouts and on a linked worktree's `.git` file. This runbook measures it on any machine in under a minute; the table lives in ADR-0010.

## Prerequisites

- [ ]

## Steps

1. Save the script below as `measure-common-dir.sh` and run `sh measure-common-dir.sh`.
2. Copy the rows into the table in ADR-0010 with the git version and OS the script prints.
3. On Windows run it from Git Bash and, separately, note what `cmd`/PowerShell git answers for the same layouts.

```sh
#!/bin/sh
# Prints, per layout, what `git rev-parse --path-format=absolute --git-common-dir`
# answers from the project root, whether the main worktree's binding is reachable
# from a linked worktree, and what a linked worktree's .git file holds.
set -e
T=$(mktemp -d "${TMPDIR:-/tmp}/wp-measure.XXXXXX")
echo "git: $(git --version) · os: $(uname -s) $(uname -r) · tmp: $T"
row() { printf '%-28s %s\n' "$1" "$2"; }
git init -q "$T/main" && (cd "$T/main" && git commit -q --allow-empty -m base && mkdir -p sub/deep .waypost && echo '{"vault_path":"docs/vault"}' > .waypost/projectstore.json)
row "main copy, at root"      "$(cd "$T/main" && git rev-parse --path-format=absolute --git-common-dir)"
row "main copy, from sub/deep" "$(cd "$T/main/sub/deep" && git rev-parse --path-format=absolute --git-common-dir)"
row "main copy, relative form" "$(cd "$T/main/sub/deep" && git rev-parse --git-common-dir)"
(cd "$T/main" && git worktree add -q "$T/wt" -b wt >/dev/null 2>&1)
row "linked worktree"          "$(cd "$T/wt" && git rev-parse --path-format=absolute --git-common-dir)"
row "linked worktree .git file" "$(cat "$T/wt/.git")"
row "main worktree of linked"  "$(cd "$T/wt" && dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
row "binding reachable from wt" "$( [ -f "$(cd "$T/wt" && dirname "$(git rev-parse --path-format=absolute --git-common-dir)")/.waypost/projectstore.json" ] && echo yes || echo no )"
git init -q --bare "$T/bare.git"
row "bare repository"          "$(cd "$T/bare.git" && git rev-parse --path-format=absolute --git-common-dir)"
git init -q "$T/outer" && (cd "$T/outer" && git commit -q --allow-empty -m o && git init -q inner && cd inner && git commit -q --allow-empty -m i)
row "nested repo, from inner"  "$(cd "$T/outer/inner" && git rev-parse --path-format=absolute --git-common-dir)"
row "not a repository"         "$(cd "$T" && git rev-parse --path-format=absolute --git-common-dir 2>&1 | head -1)"
rm -rf "$T"
```

## Verification

- [ ]

## Rollback

Nothing to roll back: the script works in a temporary directory it removes.

## Common Issues

###

## References

-

---

*Last updated: 2026-09-04*
