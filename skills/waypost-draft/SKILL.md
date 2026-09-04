---
name: waypost-draft
description: Use when the user wants a decision record, spec, epic, story, research note, concept, meeting note or runbook in the project vault. Create it through `waypost draft`, never by writing the file yourself.
license: MIT
---

# Draft a vault artifact

Waypost keeps the project's memory as markdown in git, and every artifact is
created through the CLI so that ids, frontmatter, indexes and the board stay
consistent.

1. Preview first: `waypost draft <kind> "<title>"` prints where the file would
   go and what it would contain. Kinds: `adr`, `spec`, `epic <ID> "<title>"`,
   `story <EPIC> "<title>"`, `research`, `concept`, `meeting`, `runbook`.
2. Create with `--write`. The derived views (indexes, `kanban.md`) are rebuilt
   automatically; do not edit them.
3. Fill the sections the template left empty, in the file the command printed.
4. The kind's own procedure — what to ask, what to check, when to call the
   critic — is one command away: `waypost prompt <kind>`. Read it once per
   kind, not from memory.
5. An ADR stays `status: proposed` until the project owner approves it; a
   fresh-context critic pass (`waypost-critic`) comes before that.

Name the artifact by its title when you talk about it, and commit it through
`waypost commit`.
