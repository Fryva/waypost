---
name: waypost-doctor
description: Use before finishing a task in a project with a waypost vault, or when something in the vault, the roles or the routing block looks inconsistent. Run `waypost doctor` and `waypost next`; `--fix` for mechanical repairs only.
license: MIT
metadata:
  waypost-source: skills/waypost-doctor/SKILL.md
  waypost-hash: 07987af6bb42
---

# Check the project before you stop

- `waypost doctor` — deterministic consistency check of the install (bind,
  roles, routing block, git wiring) and the vault (status vs board vs
  indexes, `code_refs`, supersede links, acceptance). No model involved.
- `waypost doctor --fix` — repairs only what is mechanical (gitignore, merge
  driver, line endings, stale generated role files). It never edits an
  artifact's content.
- `waypost next` — what this project needs right now, ranked, with the command
  for each.

Run `doctor` before you report a task as done; if it names an artifact, fix
the artifact, not the check. Procedure: `waypost prompt doctor`.
