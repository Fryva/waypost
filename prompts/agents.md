---
description: Install, inspect and route the waypost agent roles (critic, planner, reviewer, librarian, archaeologist) in whichever harnesses this project uses.
argument-hint: "<install | list | show <role> | register | model <role|default> <id>>"
---

You are managing the waypost agent roles for this project.

One definition per role lives in `agents/<role>.md` with neutral frontmatter
(tier, effort, access, tools). Each harness gets that same role rendered into
its own format — never a second copy to maintain:

| Harness | Where it lands | What it becomes |
|---|---|---|
| Claude Code | `.claude/agents/waypost-<role>.md` | a subagent (`waypost-critic`, …) |
| OpenCode | `.opencode/agent/waypost-<role>.md` | a `mode: subagent` agent |
| Codex | `.codex/prompts/waypost-<role>.md` | a custom prompt (`/waypost-critic`) |
| anything else | — | `waypost agents show <role>` printed as the prompt |

## Steps

1. **Inspect** first — never install blind:

   ```bash
   waypost agents list
   ```

   It prints the roster and, per harness, how many role files are `current`,
   `stale`, `foreign` or `absent`.

2. **Install** into the harnesses this project actually uses (that is the
   default; `--harness claude,opencode,codex` or `--harness all` overrides).
   With nothing detected and nothing named, install refuses and lists the
   choices — it will not scatter three directories into the project:

   ```bash
   waypost agents install
   ```

   Idempotent: a role whose rendering has not changed is left untouched. Each
   generated file carries a provenance line with a hash of the render — that is
   how `waypost doctor` tells "installed and current" from "installed and stale"
   (including after a model or adapter change), and how `waypost agents uninstall`
   knows which files are ours to remove. A file under the `waypost-` prefix without
   that line is reported as `skipped (not ours)` and left alone.

   For Codex, also offer the one-liner that makes them slash commands:
   `cp .codex/prompts/waypost-*.md ~/.codex/prompts/`.

3. **Register the routing block** so every session knows *when* to reach for a
   role, not merely that it exists:

   ```bash
   waypost agents register
   ```

   It writes one block, between markers, into `AGENTS.md` (and `CLAUDE.md` if
   the project has one). Re-running replaces the block in place — it never
   duplicates it, and that is also how a version bump propagates. Everything
   outside the markers is the user's; leave it alone.

4. **Model** (optional). The role declares a neutral tier (`reasoning`), and each
   harness maps it: for Claude Code, `reasoning` → `opus`. To pin a concrete id:

   ```bash
   waypost agents model default sonnet      # every role
   waypost agents model reviewer opus       # one role
   waypost agents model harness:opencode anthropic/claude-sonnet-4-5
   waypost agents install                   # re-render with the new model
   ```

   `default` and per-role pins reach only harnesses with a published tier
   naming (today: Claude Code) — a bare Claude id is not something OpenCode can
   resolve. Say it per harness there. The CLI prints which harnesses a pin
   applies to.

   Say the trade-off honestly when asked: these roles do not write code — they
   are critics, planners and reviewers, and they earn their cost on strong
   models at high effort. A cheaper model here mostly buys quieter reviews.

## Invoking a role

Always in a **fresh context, separate from the author** — that separation is the
entire point of the role, and reviewing your own work in your own context
silently removes it.

- Claude Code / OpenCode: spawn the subagent (`waypost-critic`, `waypost-planner`, …).
- Codex: `/waypost-critic <target>`, or `codex exec "$(waypost agents show critic) <target>"`.
- Any other harness: start a separate run with `waypost agents show <role>` as the
  system prompt and the target as the input.

## Notes

- The roles are read-only by contract: edits are denied by the tool map where
  the harness has one, the shell stays available (they need `git diff`), and
  "never write" is carried by the role prompt. They report; every write goes
  back through the approval-gated `waypost` flow.
- Generated role files are ordinary files in the repo — committing them is how a
  team gets the same roles. The bind config and `.waypost/state/` are not: those are
  machine-local and belong in `.gitignore`.
- A file under the `waypost-` prefix without a provenance line is not ours. Do not
  overwrite or delete it; ask.
