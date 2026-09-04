---
name: waypost-review
description: Use before treating an ADR, spec, epic, story or design as final, and before closing a story or committing feature-sized code. A fresh-context critic or reviewer pass, never a self-review.
license: MIT
metadata:
  waypost-source: skills/waypost-review/SKILL.md
  waypost-hash: 862322553e74
---

# Review in a fresh context

Reviewing your own work in your own context removes the point of the review.
Waypost ships read-only roles for it, rendered for this harness by
`waypost agents install`:

- `waypost-critic` — adversarial review of an artifact or design proposal:
  assumptions, missing alternatives, testability, what is missing.
- `waypost-reviewer` — does this diff actually close the story's acceptance
  criteria? Run before commit or `story close`.

Spawn the role the way this harness spawns subagents (`waypost harnesses`
says how); where it cannot, run `<cli> "$(waypost agents show critic) <target>"`
as a separate process. Fold the findings into the artifact; an ADR is
accepted only by the project owner, after the pass.

The checklist the roles use: `waypost prompt review`.
