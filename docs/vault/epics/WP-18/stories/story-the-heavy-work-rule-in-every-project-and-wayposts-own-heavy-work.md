---
type: story
id: "story-the-heavy-work-rule-in-every-project-and-wayposts-own-heavy-work"
epic: "WP-18"
title: "The heavy-work rule in every project, and Waypost's own heavy work"
status: planned
priority: p1
assignee: "Ivan Morozov"
created: 2026-09-15
updated: 2026-09-15
external_refs: {}
tags: []
code_refs: ["scripts/agents.mjs", "AGENTS.md", "prompts/heavy.md (planned)", "package.json", "bin/waypost", "tests/harness.test.mjs", "README.md", "CHANGELOG.md"]
specs: []
blocked_by: ["WP-18/story-waypost-run-heavy-a-machine-wide-slot-for-heavy-work"]
started_at: null
closed_at: null
plan_updated_at: null
---

# The heavy-work rule in every project, and Waypost's own heavy work

| Field | Value |
|---|---|
| **Epic** | [WP-18](../epic.md) |
| **Status** | planned |
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

- [ ] The routing-block line "Heavy work: `waypost run --heavy -- <cmd>`.",
      in the block `waypost agents register` installs. The budget test stays
      under 1400 characters, unchanged.
- [ ] `prompts/heavy.md` and `waypost prompt heavy`:
      - what counts as heavy;
      - check `waypost capacity` before launching parallel agents that build
        or test;
      - long work goes in the harness's background mode;
      - when refused, report it or retry later, and never run the work
        outside Waypost.
- [ ] Waypost's own `AGENTS.md` states the rule, and the ADR's guard selects
      it and passes.
- [ ] Waypost's test suite: `npm test` runs through a small runner that holds
      a slot and sets `--test-concurrency` from `waypost capacity`.
      `WAYPOST_HEAVY_WAIT` waits, and a refusal says why.
- [ ] `waypost size --global` holds a slot while it scans. The machine audit
      in `waypost setup` holds one when WP-17 builds it.
- [ ] README command table (`capacity`, `run --heavy`), CHANGELOG.
- [ ] The ADR goes to `accepted` in this commit.

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan). -->

## Acceptance Criteria

- [ ] `waypost agents register` in a fixture project writes the block with
      the line, and the standing-context budget test passes without its
      limit raised.
- [ ] `waypost prompt heavy` prints the procedure.
- [ ] `AGENTS.md` carries the rule and the ADR's guard selects it and passes.
      The ADR is `accepted`, and `waypost doctor` reports 0 issues.
- [ ] `npm test` holds a slot and runs at the concurrency `waypost capacity`
      allows. On an injected busy machine it stops with the reason, and with
      `WAYPOST_HEAVY_WAIT` it waits.
- [ ] `waypost size --global` holds a slot while it scans.
- [ ] README and CHANGELOG name the commands.

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

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
