---
type: story
id: "story-the-heavy-work-rule-in-every-project-and-wayposts-own-heavy-work"
epic: "WP-18"
title: "The heavy-work rule in every project, and Waypost's own heavy work"
status: in-progress
priority: p1
assignee: "Ivan Morozov"
created: 2026-09-15
updated: 2026-09-15
external_refs: {}
tags: []
code_refs: ["templates/agents-block.md.tmpl", "scripts/agents.mjs", "AGENTS.md", "prompts/heavy.md", "package.json", "scripts/test.mjs", "bin/waypost", "tests/harness.test.mjs", "tests/capacity.test.mjs", "tests/sizes.test.mjs", "tests/slots.test.mjs", "tests/test-runner.test.mjs", "README.md", "CHANGELOG.md"]
specs: []
blocked_by: ["WP-18/story-waypost-run-heavy-a-machine-wide-slot-for-heavy-work"]
started_at: "2026-09-15T14:08:40.220Z"
closed_at: null
plan_updated_at: "2026-09-15T14:08:40.220Z"
---

# The heavy-work rule in every project, and Waypost's own heavy work

| Field | Value |
|---|---|
| **Epic** | [WP-18](../epic.md) |
| **Status** | in-progress |
| **Priority** | p1 |
| **Assignee** | Ivan Morozov |

---

## Description

Decisions 3 and 4 of the ADR
[Heavy work sized to the machine](../../../adr/heavy-work-sized-to-the-machine-waypost-capacity-a-machine-wide-slot-and-a-rule-to-check-first.md).
The rule reaches every project through the routing block, within its budget.
The procedure is on demand, and Waypost's own heavy work obeys the same
limit. The ADR becomes `accepted` in this story's commit.

## Decomposition

- [x] The routing-block line "Heavy work: `waypost run --heavy -- <cmd>`.",
      in the block `waypost agents register` installs. The budget test stays
      under 1400 characters, unchanged.
- [x] `prompts/heavy.md` and `waypost prompt heavy`:
      - what counts as heavy;
      - check `waypost capacity` before launching parallel agents that build
        or test;
      - long work goes in the harness's background mode;
      - when refused, report it or retry later, and never run the work
        outside Waypost.
- [x] Waypost's own `AGENTS.md` states the rule, and the ADR's guard selects
      it and passes.
- [x] Waypost's test suite: `npm test` runs through a small runner that holds
      a slot and sets `--test-concurrency` from `waypost capacity`.
      `WAYPOST_HEAVY_WAIT` waits, and a refusal says why.
- [x] `waypost size --global` holds a slot while it scans. The machine audit
      in `waypost setup` holds one when WP-17 builds it.
- [x] README command table (`capacity`, `run --heavy`), CHANGELOG.
- [x] The ADR goes to `accepted` in this commit.

## Implementation Plan

Written by the lead on 2026-09-15, from the code:
- the block template, `templates/agents-block.md.tmpl`;
- its version, `AGENT_BLOCK_VERSION` at `scripts/agents.mjs:61`;
- `doctor`'s version-drift issue, `scripts/doctor.mjs:196-201`;
- the budget test, `tests/harness.test.mjs:1141`;
- `printDoc("prompts", …)`;
- `handleSize`.

1. **The rule in every project.**
   - Add one bullet to `templates/agents-block.md.tmpl`, after the existing
     bullets: "- Heavy work: `waypost run --heavy -- <cmd>`." It is about 46
     characters, so the block stays under the 1400-character test (1333
     today).
   - Bump `AGENT_BLOCK_VERSION` to 2. `doctor` then reports every older block
     as an issue, and `waypost doctor --fix` or `waypost agents register`
     rewrites it in place. That is how the line reaches projects that are
     already installed.
   - Re-register Waypost's own block in this repository, in the same commit.
2. **`prompts/heavy.md`**, in the shape of `prompts/doctor.md` (frontmatter
   with `description` and `argument-hint`, then steps):
   - what counts as heavy;
   - check `waypost capacity` before launching parallel agents that build or
     test;
   - run long work as `waypost run --heavy -- <cmd>` in the harness's
     background mode;
   - on exit 75, report the reason, or retry later with `--wait`, and never
     run the work outside Waypost;
   - one heavy job per agent at a time.
3. **`AGENTS.md` and `README.md`.**
   - Rows in the CLI tables: `waypost capacity [--json] [--release <id>]` and
     `waypost run --heavy [--wait <Ns|Nm>] -- <cmd…>`.
   - A one-sentence rule in `AGENTS.md`, beside the table. Once the table and
     the block carry it, the ADR's guard (`require "waypost run --heavy"` in
     `AGENTS.md`) passes.
4. **Waypost's own test suite under the limit.**
   - `package.json`: `"test": "node scripts/test.mjs"`.
   - `scripts/test.mjs` (new):
     - lists `tests/*.test.mjs`;
     - takes the concurrency from `measure()`, as one heavy job's share of
       cores (max(1, ⌊cores/4⌋));
     - runs `bin/waypost run --heavy [--wait $WAYPOST_HEAVY_WAIT] -- node
       --test --test-concurrency=<N> <files…>` with stdio inherited, and
       passes the exit code on. A refusal (75) therefore stops `npm test`
       with the reason.
5. **Tests that must not see the real slot table.** When `npm test` holds a
   real slot, any test that reads the real table sees a holder. So:
   - `tests/capacity.test.mjs:465` asserts `holders === 0` and must run with
     a temporary `HOME`, `XDG_STATE_HOME` and `LOCALAPPDATA`, as must its
     sibling at `:489`;
   - every test that runs `waypost size --global` (`tests/sizes.test.mjs`)
     gets the same, plus an idle `WAYPOST_CAPACITY_PROBE`.

   Find them all with `rg`.
6. **`waypost size --global` holds a slot** while it scans. It uses the same
   `claimSlot(…)` with argv `["waypost", "size", "--global"]`: exit 75 with
   the reason when refused, and the slot released in a `finally`.
7. **`CHANGELOG.md`**: the prompt, the block v2, `npm test` under the limit,
   and `size --global` holding a slot.
8. **The ADR goes to `accepted`** (frontmatter and table) in this story's
   commit.
9. **Tests:**
   - the block carries the line and stays under 1400 characters;
   - a v1 block is reported by `doctor` and rewritten by `--fix`;
   - `waypost prompt heavy` prints;
   - `scripts/test.mjs` sizes its concurrency from an injected measure;
   - with a busy `WAYPOST_CAPACITY_PROBE` and a temporary `HOME`, it exits 75
     with the reason;
   - with a slot held and `WAYPOST_HEAVY_MAX=1`, `size --global` exits 75.
10. **Test runs:**
    - the touched files alone while working;
    - the full suite once, at the end, through the new `npm test`, which
      holds a real slot in the machine state directory;
    - never alongside another heavy job.

## Acceptance Criteria

- [x] `waypost agents register` in a fixture project writes the block with
      the line, and the standing-context budget test passes without its
      limit raised.
      — evidence: `tests/harness.test.mjs:1178` (the limit is still 1400),
      `:1181` (the line is present). The block measures 1379 characters.
- [x] `waypost prompt heavy` prints the procedure.
      — evidence: `tests/harness.test.mjs:1120`
- [x] `AGENTS.md` carries the rule and the ADR's guard selects it and passes.
      The ADR is `accepted`, and `waypost doctor` reports 0 issues.
      — evidence: the `AGENTS.md` table row and its v2 block. With the ADR
      accepted, `waypost doctor` reports 0 issues and 0 warnings. A v1 block
      is reported and rewritten (`tests/harness.test.mjs:619`).
- [x] `npm test` holds a slot and runs at the concurrency `waypost capacity`
      allows. On an injected busy machine it stops with the reason, and with
      `WAYPOST_HEAVY_WAIT` it waits.
      — evidence: the final run went through the new `npm test` with
      `WAYPOST_HEAVY_WAIT`.
      - It waited in the queue behind another session's builds and started
        once the machine had room.
      - It ran at `--test-concurrency=2`, a quarter of 8 cores, and passed
        504/504 in 146 s.
      - An earlier attempt was refused at its 45-minute deadline with exit
        75 while the load stood at up to 72.

      The injected busy machine is tested at `tests/test-runner.test.mjs:44`,
      and `testConcurrency` at `:24`.
- [x] `waypost size --global` holds a slot while it scans.
      — evidence: `tests/sizes.test.mjs:536`
- [x] README and CHANGELOG name the commands.
      — evidence: the rows in the `README.md` command table, and the
      `CHANGELOG.md` entry

## Final Summary

**What changed.**
- The routing block, v2 (`templates/agents-block.md.tmpl`,
  `AGENT_BLOCK_VERSION = 2`), carries "Heavy work:
  `waypost run --heavy -- <cmd>`." It measures 1379 of 1400 characters.
  `doctor` reports a v1 block as an issue and `--fix` rewrites it, so the
  line reaches every project already installed. Waypost's own `AGENTS.md`
  block is re-registered.
- `prompts/heavy.md`, printed by `waypost prompt heavy`, gives the procedure.
- `AGENTS.md` and `README.md` gain rows for `waypost capacity` and
  `waypost run --heavy`. `AGENTS.md` stays at 299 lines, under doctor's
  300-line limit, with two bullets rewrapped and their wording unchanged.
- `npm test` now runs `scripts/test.mjs`. It holds a slot through
  `waypost run --heavy`, and sets `--test-concurrency` to one heavy job's
  share of the cores (2 on 8 cores). `WAYPOST_HEAVY_WAIT` waits.
- `waypost size --global` holds a slot for its scan and releases it in a
  `finally`.
- `run --heavy` no longer passes the command an identity it only derived for
  itself: the session id, the harness, the harness process. A nested
  `waypost` call derives its own.
- Tests that read the real slot table run with a temporary home. New tests
  cover the block, the prompt, the runner, `size --global` and the identity
  leak.
- The ADR "Heavy work sized to the machine" is accepted.

**Why.** ADR Decisions 3 and 4: the rule has to reach every project without
hooks, and Waypost's own heavy work obeys the same limit.

**Tests executed.**
- The touched files, run alone by the implementer: harness 83/83, capacity
  46/46, sizes 30/30, slots 42/42, test-runner 3/3.
- A first full run through the new `npm test`, by the implementer, came out
  502/503. The one failure was a real leak: a presence test's nested
  `waypost` inherited the wrapper's invented session id. It is fixed, with a
  regression test.
- The final full run passed 504/504 in 146 s, through `npm test` with
  `WAYPOST_HEAVY_WAIT`. It queued behind another session's builds and
  started when the machine had room. An earlier attempt waited its full 45
  minutes, with the load up to 72, and was refused with exit 75, as
  designed.

**Review.**
- Lead review fixed the table row's unescaped `|`. It also kept the two
  rewrapped paragraphs, once the reason (the 300-line limit) was clear.
- `waypost-reviewer` found the diff fit to commit, with all six criteria met.
  Its should-fix is done: `WAYPOST_PROC` was leaking the same way. Two nits
  remain:
  - a raw stack trace if the state directory cannot be created;
  - a plain-text refusal under `size --global --json`.

**Seen live.** Other sessions already run their builds through the global
`waypost run --heavy`. The final suite waited in the queue behind a
`cargo check` and an xcframework build before it started.

**Risks and follow-ups.**
- About 20 characters of the block budget remain.
- The machine audit in `waypost setup` holds a slot once WP-17 builds it.
- Windows is verified in the next story.
- The owner's personal fallback rule in the global instructions can now be
  shortened.

## Technical Notes

- Roughly 20 characters of the block budget remain after this line, so any
  later addition has to fit the same test.
- The owner's personal fallback rule (`pgrep`, strictly one) can be retired
  from the global instructions once this ships.

## Dependencies

- `story-waypost-run-heavy-a-machine-wide-slot-for-heavy-work`.

## Attachments

-

---

*Last updated: 2026-09-15*
