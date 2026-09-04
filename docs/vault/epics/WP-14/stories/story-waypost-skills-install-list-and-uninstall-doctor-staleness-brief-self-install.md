---
type: story
id: "story-waypost-skills-install-list-and-uninstall-doctor-staleness-brief-self-install"
epic: "WP-14"
title: "waypost skills install, list and uninstall; doctor staleness; brief self-install"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-09-04
updated: 2026-09-04
external_refs: {}
tags: []
code_refs: []
specs: []
started_at: "2026-09-04T16:24:43.421Z"
closed_at: "2026-09-04T16:24:44.994Z"
plan_updated_at: "2026-09-04T16:24:43.421Z"
---

# waypost skills install, list and uninstall; doctor staleness; brief self-install

| Field | Value |
|---|---|
| **Epic** | [WP-14](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

`waypost skills install [--harness <id>|all]`, `list`, `uninstall` copy the standard skills into each harness's skills directory the way `agents install` renders roles; doctor reports absent, stale and foreign skill files; `brief` installs the running harness's skills when they are missing, as it does roles.

## Decomposition

- [x] Install/uninstall with the provenance marker; foreign files skipped — evidence: scripts/skills.mjs; test "skills install once per shared directory…"
- [x] doctor: `agent-skills` findings mirroring `agent-roles`; `--fix` reinstalls — evidence: scripts/doctor.mjs `checkAgentSkills`; test "doctor reports missing or stale skills…"
- [x] brief self-install extended to skills; `--no-install` honoured — evidence: bin/waypost `selfInstall`; test "brief installs the skills of the harness it runs in…"
- [x] `waypost setup` installs skills for detected harnesses — evidence: bin/waypost `handleSetup`; test "…setup installs skills for detected harnesses"

## Implementation Plan

`scripts/skills.mjs`: `targetsFor` groups harnesses by the directory they
read (registry `skills.dir`), so `.agents/skills` gets one copy for eleven
harnesses; `status` compares the installed copy's `waypost-hash` (read back
with a regex — the frontmatter reader is line-based) with the source and the
rendered text (stale: source changed / edited by hand; foreign: no marker);
`install` never overwrites a file without our marker; `uninstall` removes only
ours. `bin/waypost skills …`, a `setup` step, `brief` self-install for the
running harness, `doctor` `agent-skills` findings with `--fix` reinstalling,
`harnessOwnedPaths` includes skills dirs. Detection: waypost's own skills in a
shared directory are not evidence that a harness is used (`.agents/` is also
Antigravity's marker).

## Acceptance Criteria

- [x] Fresh project + `setup` → skills present for detected harnesses — evidence: test with `.opencode/` marker → `.agents/skills/waypost-draft/SKILL.md`
- [x] A hand-edited skill file is reported stale, never overwritten by --fix — evidence: `--fix` reinstalls ours (marker present); a marker-less file is "skipped (not ours)" (test)
- [x] `brief` from a harness with no skills installs them and says so — evidence: test, "installed 10 skill(s) into .agents/skills/"

## Final Summary

Live in this repository: `waypost skills install` put ten skills into
`.claude/skills/` and `.agents/skills/` (claude; codex+opencode), doctor clean.
Found and fixed on the way: the shared `.agents/skills/` we create made
`detectHarnesses` report Antigravity as used — waypost's own skills are no
longer evidence, an empty or otherwise-populated directory still is.
352 tests green.

## Technical Notes

Reuse the role install machinery; the skill file is identical for every harness, only the directory differs.

## Dependencies

- story-bundled-skills-and-loop-procedures-rendered-as-agent-skills

## Attachments

-

---

*Last updated: 2026-09-04*
