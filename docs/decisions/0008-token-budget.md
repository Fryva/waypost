# ADR-0008: Context spend as a design constraint, not an outcome

- Status: proposed
- Date: 2026-09-01
- Deciders: not approved by the project owner; status `proposed`
- Supersedes: —
- Superseded by: —
- Related: ADR-0003 (roles), `agents/*.md`, `templates/agents-block.md.tmpl`, `scripts/brief.mjs`, `bin/waypost`
- code_refs: ["agents/critic.md", "templates/agents-block.md.tmpl", "scripts/brief.mjs", "scripts/agents.mjs", "bin/waypost", "tests/harness.test.mjs"]

## Context

A tool that runs a project through an agent pays in context twice: for what sits
in the context **permanently**, and for what every command **prints**. The first
is more expensive than it looks — everything in the context is re-read on every
turn, so a line in the routing block read 150 times in a session costs 150 times
what it appears to.

Measured before the work (a 32-artifact project, o200k tokenizer):

| What | Tokens |
|---|---|
| Standing context: routing block + role descriptions + `waypost brief` | **1747** |
| `waypost status` | 1390 |
| `waypost agents list` | 1235 |
| `waypost harnesses` | 938 |
| `waypost draft <kind> "<title>"` (preview) | 575 |
| `graph.md` read whole (32 artifacts) | 1119 |
| `adr/README.md` read whole | 1516 |

The last two are the large-project problem: derived views grow linearly (~66
tokens per artifact in the graph, ~51 in an index), so at 200 artifacts reading
the graph once costs more than all the standing overhead combined.

## Decision drivers

- Separate "standing" from "on demand": pay for detail only where it was asked for.
- Answer the question rather than emit a document the answer has to be dug out of.
- Do not trade away role quality: their prompts are not where to economise.
- The budget must be checkable, or it dissolves at the next edit to a paragraph.

## Considered options

### Option 1: compact by default, plus queries instead of whole-file reads (chosen)

1. **Two descriptions per role.** `summary` (one sentence) goes into the
   generated harness files and the routing block — that is what a harness
   injects into the main context; the long `description` stays in the source for
   `waypost agents list -v` and for humans.
2. **Compact output by default, detail behind a flag:** `waypost brief` (`--full`),
   `waypost harnesses` (`--all`), `waypost agents list` (`-v`), `waypost draft` without
   `--write` (`--json`), and `waypost status`.
3. **Queries instead of reading derived views.** `waypost graph --for <path>` returns
   one node's typed neighbourhood; `waypost search "<text>" [--kind] [--limit]`
   returns pointers (path, title, status, matching line) rather than documents.
4. **Budgets pinned by tests** (`tests/harness.test.mjs`, the token-economy
   section): the block's length, each role description's length, ceilings for the
   routine commands, and the requirement that a graph query be several times
   cheaper than the file it replaces.

**Pros:** standing spend drops by ~60%; routine command cost stops growing with
the harness registry and with the vault; the detail still exists, paid for by
whoever asks.
**Cons:** you have to remember the flag when you want detail; a short role
`summary` carries less signal for a harness's automatic role selection (the
routing block compensates).

### Option 2: compress the role prompts

**Pros:** the largest single line per invocation (1.2–1.4k tokens).
**Cons:** that is the product. A role is expensive because of the reading it
does, not its prompt — measured: $1.62 per critic pass, of which the prompt is
0.08%. Rejected.

### Option 3: print nothing but JSON and let the agent parse it

**Pros:** formally minimal output.
**Cons:** an artifact's JSON is the same text plus quoting; humans lose
readability and the agent still pays for the content. Rejected; `--json` stays
where machine parsing is the point.

## Decision

Take option 1. The rule for any future text change: **anything entering the
standing context needs a budget in a test**; anything a command prints answers
the question by default and hides the reference behind a flag.

## Consequences

### Positive

Measured after (same project, same tokenizer):

| What | Before | After |
|---|---|---|
| Standing context | 1747 | **698** (block 197 + descriptions 92 + brief 409) |
| `waypost status` | 1390 | 175 |
| `waypost agents list` | 1235 | 147 |
| `waypost harnesses` | 938 | 51 |
| `waypost draft` (preview) | 575 | 156 |
| One graph node | 1119 (whole file) | **44** (`--for`) |
| A vault search | 1516 (whole index) | **91** (`waypost search`) |

In a 100-turn Opus session the standing context costs about $0.035 instead of
$0.087; on a large vault the `--for` / `search` saving grows linearly with the
number of artifacts.

### Negative / risks

- `summary` is hand-written: a new role without one falls back to the first
  sentence of `description`, which may be long — the budget test catches that,
  but only for the bundled roles.
- Compact output hides detail that is occasionally wanted; the cost of that
  mistake is one repeated call with a flag.
- `waypost search` is a grep over frontmatter and body, not semantic search; "find
  something like this" is still `waypost-librarian`.

## Verification and follow-up

- The measurements above were taken with `gpt-tokenizer` (o200k) on the same
  project before and after; the measurement script was one-off and lives outside
  the repository, while the budgets themselves are tests inside it.
- `tests/harness.test.mjs`: routing block length, per-role description length,
  ceilings for `brief`/`status`/`doctor`/`harnesses`/`agents list`/`search`, and
  that `graph --for` is several times cheaper than the file and answers an
  unknown node clearly.
