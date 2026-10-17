---
name: waypost-review
description: Use before treating an ADR, spec, epic, story or design as final, and before closing a story or committing feature-sized code. A fresh-context critic or reviewer pass, never a self-review.
license: MIT
---

# Review in a fresh context

Reviewing your own work in your own context removes the point of the review.
Waypost ships read-only roles for it, rendered for this harness by
`waypost agents install`:

- `waypost-critic` — adversarial review of an artifact or design proposal:
  assumptions, missing alternatives, testability, what is missing.
- `waypost-reviewer` — does this diff actually close the story's acceptance
  criteria? Run before commit or `story close`.

Give the role a compact handoff, with pointers instead of copied transcripts:

- Task/artifact path and original acceptance criteria/spec links.
- Base/head revisions, dirty state, and exact diff scope (committed, staged,
  unstaged, untracked); relevant paths and symbols.
- Content hashes or a retained patch/manifest identifying dirty and untracked
  inputs. A dirty flag alone does not identify a reproducible snapshot.
- Relevant validation command, exit status/counts and full-log path, bound to
  the checked revisions and input identities; include meaningful failures.

Missing fields trigger independent discovery or an explicit evidence gap, never
skipped verification. Caller conclusions are not evidence, and logs without a
matching checked-source identity remain unverified. The role starts fresh, checks
original requirements and may expand to any contracts, dependencies or full files
needed. Within one context reuse unchanged evidence; refresh after branch,
revision or file changes, or uncertainty. After your own edits inspect the diff
and affected dependencies; avoid automatically re-reading unchanged files.

Spawn the role the way this harness spawns subagents (`waypost harnesses`
says how); where it cannot, run `<cli> "$(waypost agents show critic) <target>"`
as a separate process. Fold the findings into the artifact; an ADR is
accepted only by the project owner, after the pass.

The checklist the roles use: `waypost prompt review`.
