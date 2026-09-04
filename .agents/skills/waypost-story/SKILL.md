---
name: waypost-story
description: Use when starting, planning, claiming or finishing a story in the project vault (epics/<id>/stories/). Run the lifecycle gates with `waypost story plan|close`, never edit status or dates by hand.
license: MIT
metadata:
  waypost-source: skills/waypost-story/SKILL.md
  waypost-hash: f5700a1b3e71
---

# Work a story through its gates

A story has two gates, and both are commands:

- **Start**: `waypost story plan <path> --write` — marks it in progress,
  claims it for this session (other sessions see the claim in
  `waypost sessions`), and stamps `started_at`. Write the Implementation Plan
  section *after* studying the code, not before.
- **Finish**: `waypost story close <path> --write` — marks it done and stamps
  `closed_at`. Before that, tick each acceptance criterion with evidence
  (`— evidence: <test | command | file:line>`) and write the Final Summary.

Between the gates: commit through `waypost commit --story <epic>/<stem> -m "…"`,
one story per commit, so the history says which story each change served.

`waypost ready` (when available) lists stories that are unblocked and unclaimed;
`waypost sessions` shows who holds what. The full procedure: `waypost prompt story`.
