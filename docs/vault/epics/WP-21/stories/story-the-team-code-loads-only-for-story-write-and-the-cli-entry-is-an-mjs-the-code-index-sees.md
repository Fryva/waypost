---
type: story
id: "story-the-team-code-loads-only-for-story-write-and-the-cli-entry-is-an-mjs-the-code-index-sees"
epic: "WP-21"
title: "The team code loads only for story --write, and the CLI entry is an .mjs the code index sees"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-14
updated: 2026-10-14
external_refs: {}
tags: []
code_refs: ["bin/waypost", "bin/waypost.mjs", "tests/scripts.test.mjs", "tests/sizes.test.mjs", "CHANGELOG.md"]
specs: []
started_at: "2026-10-14T03:58:49.184Z"
closed_at: "2026-10-14T04:46:20.594Z"
plan_updated_at: "2026-10-14T03:58:49.184Z"
---

# The team code loads only for story --write, and the CLI entry is an .mjs the code index sees

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Decision 0 of ADR "The CLI as a thin entry with per-command modules, each
readable in one pass", done ahead of the split because it is a few lines and
takes two of its three gains:

1. `bin/waypost` statically imports `scripts/team-legacy.mjs` for one call
   (`withTeamArtifactGate` in `story --write`), linking 22 team modules into every
   command. A syntax error in team work in progress breaks `run --heavy`,
   `capacity`, `clean`, `help`, `version` on every host.
2. The entry has no extension, so codegraph (extension-only, no configuration)
   does not index the most navigated file of the repository.

## Decomposition

- [x] `handleStory` becomes async and imports team-legacy lazily, no try/catch (the gate stays fail-closed); the switch awaits it.
- [x] `git mv bin/waypost bin/waypost.mjs`; a new executable `bin/waypost` shim: `#!/usr/bin/env node`, a comment, `import "./waypost.mjs";`.
- [x] `makeRaceRepo` (tests/scripts.test.mjs) copies `bin/waypost.mjs` too; `node --check` test covers it.
- [x] Guard of ADR "setup asks the running harness" re-scoped to `bin/waypost.mjs`.
- [x] CHANGELOG `[Unreleased]` entry.
- [x] A test pins that the entry has no static import of `scripts/team-*`.

## Implementation Plan

1. `bin/waypost`: drop the static `team-legacy` import; `handleStory` async, `await import(SCRIPT_URL("team-legacy"))` just before the gate; `await handleStory` in the switch.
2. Copy the entry to `bin/waypost.mjs` (blob identical apart from step 1), replace `bin/waypost` by the shim, both mode 755.
3. Tests: `makeRaceRepo` copies both files as real files; `node --check` covers `bin/waypost.mjs`; a static test forbids `from '../scripts/team-` in the entry.
4. Re-scope the setup ADR guards to `bin/waypost.mjs`; CHANGELOG.
5. Verify: output parity of version/help/unknown; a broken team module in a scratch copy; `npm test` in a worktree; doctor; after merge, codegraph.

## Acceptance Criteria

- [x] With `scripts/team-state.mjs` replaced by a syntax error in a scratch copy of the tool, `version`, `help`, `capacity` succeed; `story plan --write` fails loudly. — evidence: scratch runs 2026-10-14 (author and waypost-reviewer): `version`/`help`/`capacity` exit 0, `story plan --write` exit 1 with the story file unchanged; loader trace 0 team modules for version/help/capacity/size/profile/clean, 22 for `story plan --write`; `tests/sizes.test.mjs` "the CLI entry does not link the team code statically" (fails on an injected static import)
- [x] `npm test` through `waypost run --heavy` in a separate worktree: no new failures against main (the 17 of `tests/claude-native-counter.test.mjs` fail on 2bec1ac too). — evidence: worktree wp21-step0, 1746 tests: 1720 pass, 17 fail, 9 skipped; `node --test tests/claude-native-counter.test.mjs` on main 2bec1ac: the same 17 of 37 fail; touched files re-run 144/144
- [x] `node bin/waypost version` and `help` byte-identical to before. — evidence: stdout+stderr+exit of version, help, --help, -h, -v, --version and an unknown command byte-identical between 2bec1ac and 6d5f093
- [x] `waypost doctor` clean; the re-scoped guard is satisfied. — evidence: 0 issues (2 pre-existing WP-18 warnings) after reconcile; guards mutation-checked by the reviewer (2 "would fail" lines naming bin/waypost.mjs, 0 on the control run)
- [x] Manual: after `codegraph sync`, `codegraph query handleStory` finds it in `bin/waypost.mjs`. — evidence: main 0f86466, `codegraph query handleStory` → bin/waypost.mjs:741; `codegraph callers withTeamArtifactGate` → handleStory

## Final Summary

The dispatcher no longer links the team code: `story --write` imports
`team-legacy.mjs` lazily at its only caller, fail-closed. The entry is
`bin/waypost.mjs` (the former `bin/waypost`, 9 lines changed); `bin/waypost` is a
small shim, so every invoking path is unchanged. codegraph now indexes the
entry. Tests: race fixture copies both files, `node --check` covers the `.mjs`,
a new test forbids a static team import. Suite: no new failures against main.
Commits 6d5f093 (code), f79cb77 (ADR/epic revision), merge 0f86466.

Follow-ups: vault commands still load the team graph in their subprocesses
(WP-20 owner); the split itself waits for the ADR; ~40 pointer comments and 39
`code_refs` naming `bin/waypost` now point at the shim.

## Technical Notes

- `main()` is called unconditionally at the end of the entry, so importing it from the shim runs it; `ROOT` (two `dirname`s from `import.meta.url`) is unchanged by the rename.
- Everything that spawns the CLI (`package.json` `bin`, the launcher, `spawnDeleter`, tests, `scripts/test.mjs`, team-cli/team-mcp) keeps the path `bin/waypost`.
- The dynamic import uses the existing `SCRIPT_URL()` helper (file-URL based, UNC-safe since 1513605).
- Still loading the team graph in their own subprocess: `doctor`, `reconcile`, `sessions`, `commit`, `brief`, `ready`, `status` — follow-up for the WP-20 owner. A consequence: with broken team code, `draft --write` now writes the artifact and fails in the reconcile subprocess with a clear "run `waypost reconcile --write`" message, where the dispatcher used to fail before any write.
- A failed lazy import prints only the message (`Unexpected token …`): Node's module `SyntaxError` carries no file or line. Locate it with `node --check scripts/team-*.mjs`.
- `bin/waypost.mjs` is a copy of the former `bin/waypost` in git terms: follow history with `git log -C -C` / `git blame -C -C`.
- Owner approved doing step 0 ahead of the ADR on 2026-10-14 ("начинай, согласен, делай как лучше").

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-14*
