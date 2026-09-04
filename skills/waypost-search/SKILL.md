---
name: waypost-search
description: Use when looking for a decision, spec, story or note in the project vault, or for what links to a file. Query with `waypost search` and `waypost graph --for`; never read graph.md or an index whole.
license: MIT
---

# Find things in the vault without paying for the whole vault

- `waypost search "<text>" [--kind adr|spec|epic|story|research] [--limit N]`
  returns pointers (path, title, status), not documents. Open only what you
  need.
- `waypost graph --for <vault-relative path>` prints one artifact's links in
  both directions.
- `waypost brief` is the orientation packet at the start of a session; `--full`
  explains the reading order.

`graph.md`, `kanban.md` and the folder indexes grow with the vault (about 66
tokens per artifact in the graph); reading one whole is the most expensive
way to answer a question the commands above answer in a line.
Procedure: `waypost prompt search`.
