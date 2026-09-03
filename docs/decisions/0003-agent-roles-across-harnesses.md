# ADR-0003: Agent roles: one neutral definition plus per-harness adapters

- Status: accepted
- Date: 2026-08-29
- Deciders: Ivan Morozov (project owner); approved 2026-09-03
- Supersedes: —
- Superseded by: —
- Related: `agents/*.md`, `scripts/agents.mjs`, `templates/agents-block.md.tmpl`, ADR-0001, ADR-0005
- code_refs: ["scripts/agents.mjs", "agents/critic.md", "agents/planner.md", "agents/reviewer.md", "agents/librarian.md", "agents/archaeologist.md", "templates/agents-block.md.tmpl", "scripts/doctor.mjs", "tests/harness.test.mjs", "bin/waypost"]

## Context

In ProjectStore the five roles (critic, planner, reviewer, librarian,
archaeologist) are `agents/*.md` files with Claude Code frontmatter
(`model: opus`, `effort: max`, `tools: Read, Grep…`) that the harness picks up as
subagents. Neither Codex nor OpenCode reads that format: OpenCode has its own
agent format, and Codex had no subagents at all at the time — only custom
prompts and `codex exec`.

The first version of the fork simply lost the roles: `agents/` was not ported and
`AGENTS.md` suggested "perform critic/planner/reviewer yourself". That destroys
the one property that makes a role worth its cost — an independent pass with a
fresh context. Reviewing your own work in your own context is exactly the
self-approval bias the roles exist to remove.

## Decision drivers

- One wording of a role for every harness: divergent prompts are divergent
  review quality.
- A fresh context is mandatory even where there are no subagents.
- Do not invent a model for a harness that has no stable tier naming.
- Tell "installed and current" from "installed and stale" deterministically,
  without an LLM.
- Never create a directory for a harness the project does not use.

## Considered options

### Option 1: a neutral definition plus generated per-harness files (chosen)

`agents/<role>.md` carries neutral frontmatter: `name`, `description`, `summary`,
`mode`, `model: reasoning|balanced|fast` (a tier, not a vendor id), `effort`,
`access: read-only`, `tools: [read, grep, glob, bash, web]` — a closed
vocabulary, where an unknown tool is an error at read time. `waypost agents install`
renders that into each harness's native file (see ADR-0005 for the registry that
describes them). Every emitted frontmatter scalar is escaped as a YAML
double-quoted string: role descriptions contain `": "`, and a plain scalar ends
there.

For anything with no role format at all, `waypost agents show <role>` prints the raw
prompt: `codex exec "$(waypost agents show critic) <target>"`.

**Read-only is a contract, not full isolation.** Where a harness has a tool map
or a sandbox mode, edits are denied there (OpenCode's `permission: edit: deny`,
Codex's `sandbox_mode = "read-only"`, Claude's `disallowedTools`). The shell
stays available everywhere, because these roles need `git diff`, `git log` and
`waypost doctor` — so "never write" is also carried by the role prompt itself.

**Pros:** one source; restrictions expressed in each harness's own language where
it has one; extension is a new file in `agents/`, not a new branch in a renderer;
provenance with a hash of the render gives doctor a deterministic freshness
check; the `waypost-` prefix cannot collide with a user's own agents.
**Cons:** generated files must be reinstalled when the source, the config or an
adapter changes (closed by doctor and `--fix`); the neutral frontmatter is one
more format to know.

### Option 2: hand-write native files for every harness

**Pros:** no generator.
**Cons:** N copies of one prompt that inevitably diverge, and no way to check
freshness deterministically. Rejected.

### Option 3: `waypost agents show` only, with no installation

**Pros:** minimal machinery.
**Cons:** the roles never appear where a user looks for them (subagents), and
invoking one becomes a manual ritual. Rejected as a downgrade to
"documented somewhere".

## Decision

Take option 1. Roles are part of the fork's core, like the vault mechanics; only
the rendering is harness-specific.

Model resolution, per harness:
`agents.per_harness.<harness>.model` → (`agents.per_agent.<role>.model` ??
`agents.default.model`, **only** where the registry maps tiers onto real ids) →
the tier mapping itself. The middle two keys are harness-blind, so they must not
reach a harness whose ids they cannot be valid for: `waypost agents model default
sonnet` writes `sonnet` for Claude Code, while OpenCode needs
`waypost agents model harness:opencode anthropic/…`. A format that carries no model
at all (a rule file) refuses the pin outright — accepting a key and discarding it
at render time is worse than saying no.

Freshness is decided by a **byte comparison** against what install would write
now, so a changed model or a changed adapter is as visible as a changed
`agents/<role>.md`. The render hash in the provenance line is not the mechanism
of that check — it marks provenance and distinguishes "edited by hand" from
"source, config or adapter changed" in the finding text.

A file under the `waypost-` prefix without a provenance line is someone else's:
`install` skips it (`skipped (not ours)`), `uninstall` never deletes it, and
doctor reports it under its own `agent-roles-foreign` check, which `--fix` does
not act on.

If no harness is named and none is detected, `install` refuses and lists the
choices: guessing "install into all of them" created `.claude/`, `.opencode/`
and `.codex/` in a project that used none — and since detection is by directory,
the guess made itself true forever. For the same reason `uninstall` removes the
directories it emptied, and `doctor --fix` only repairs `issue`/`warn` levels:
on `info` ("this harness has no waypost roles") it used to install roles nobody had
asked for, undoing an explicit uninstall.

**Context budget (see ADR-0008).** A harness injects every agent's *description*
into the main context of every session, so the roles carry a short `summary`
which is what the generated files and the routing block use; the long
`description` stays in the source for `waypost agents list -v` and for humans.

## Consequences

### Positive

- The same roles and the same prompt in every supported harness, and in any
  other runner through `waypost agents show`.
- `waypost doctor` reports per-harness state (`current`/`stale`/`foreign`/`absent`),
  and `waypost doctor --fix` re-renders what drifted.
- A file under the `waypost-` prefix that waypost did not generate is never touched.

### Negative / risks

- Harness formats change; when one does, the adapter (or the registry entry)
  has to be updated — localised in `scripts/agents.mjs` and `harnesses/*.json`.
- The Claude tier mapping (`reasoning → opus`) is hard-coded; new model families
  mean editing that map or using `waypost agents model`.
- A harness whose sub-agents are user-level only (ZCode) gets project files plus
  a printed copy step; the freshness check then watches the project copy, not
  the home one.
- `~/.codex/prompts` and other home directories are global across projects: two
  projects with different role edits would overwrite each other there.
- Capabilities are not identical across harnesses even though the prompt is:
  Claude Code gets `WebFetch, WebSearch`, OpenCode only `webfetch`.

## Verification and follow-up

- `tests/harness.test.mjs`: neutrality of the definitions; a render per harness
  with provenance and a matching hash; frontmatter scalar rules for every role ×
  harness; rejection of an unknown tool and of a vendor id used as a tier;
  install idempotence; refusal without a harness; a foreign file surviving
  `install` and `doctor --fix`; staleness after a model change; no leak of a
  harness-blind pin into a harness that cannot use it; `waypost agents model
  harness:<name>`; `register` idempotence; `show` output; and the token budgets
  from ADR-0008.
- 2026-08-29: two critic passes were run over this ADR (Opus; 16 and 12
  requests, $1.62 each). The first found that three of its four load-bearing
  guarantees did not hold: install overwrote foreign files (and `doctor --fix`
  did so on the strength of its own warning), nine of fifteen generated files
  had unparseable YAML, and the provenance hash missed model and adapter
  changes. The second confirmed those closed and found two more: a model pinned
  for a format that carries none was silently discarded, and `uninstall` left
  empty directories that made detection resurrect the harness. All fixed here.
- Live behaviour inside the harnesses themselves has not been verified by the
  project owner; ADR-0005 records the per-entry confidence levels.
