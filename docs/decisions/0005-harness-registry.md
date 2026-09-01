# ADR-0005: A harness is data: the `harnesses/*.json` registry instead of a branch in a renderer

- Status: proposed
- Date: 2026-09-01
- Deciders: not approved by the project owner; status `proposed`
- Supersedes: —
- Superseded by: —
- Related: ADR-0003 (roles), `harnesses/*.json`, `scripts/agents.mjs`, `docs/harnesses.md`
- code_refs: ["harnesses/claude.json", "harnesses/opencode.json", "harnesses/codex.json", "harnesses/cursor.json", "harnesses/windsurf.json", "harnesses/copilot.json", "harnesses/gemini.json", "harnesses/cline.json", "harnesses/roo.json", "harnesses/qwen.json", "harnesses/kimi.json", "harnesses/zcode.json", "harnesses/codebuddy.json", "harnesses/dsh.json", "harnesses/trae.json", "harnesses/lingma.json", "harnesses/iflow.json", "harnesses/grok.json", "harnesses/antigravity.json", "harnesses/qm.json", "harnesses/pi.json", "harnesses/providers/deepseek.json", "harnesses/providers/moonshot.json", "harnesses/providers/glm.json", "harnesses/providers/minimax.json", "harnesses/providers/dashscope.json", "harnesses/providers/xai.json", "scripts/agents.mjs", "scripts/commit.mjs", "docs/harnesses.md", "tests/harness.test.mjs"]

## Context

ADR-0003 introduced one neutral role definition and adapters for three
harnesses. Those adapters were code: `renderClaude`, `renderOpencode`,
`renderCodex`, a `switch` in `targetDir`, and a hard-coded
`HARNESSES = ["claude","opencode","codex"]`. With three entries that reads fine;
but the fork's promise is "works from whatever harness you use", and the field
moves faster than releases: Cursor, Windsurf, Cline, Roo Code, Gemini CLI,
GitHub Copilot, and then a wave of vendor CLIs from Alibaba, Moonshot, Zhipu,
Tencent and DeepSeek.

Their formats are also different in *shape*: one file per role with YAML
frontmatter (Claude Code, OpenCode, Cursor, Copilot, Kimi, Qwen, ZCode,
CodeBuddy, Gemini, Grok Build), a directory per agent holding one such file
(Antigravity), a prompt file invoked by a slash command (Windsurf, Cline,
Lingma, Trae), TOML (Codex agents), one shared file holding an array of modes
(Roo Code), and none at all (DeepSeek Harness registers subagents in code, QM
delegates to whichever harness it runs, Pi ships no sub-agents by design).

## Decision drivers

- Supporting one more agent CLI should cost less than reading the renderer.
- A user should not wait for a release: when a vendor changes a format, they fix
  it locally.
- The guarantees (provenance, "never touch what is not ours", refusal without a
  harness) must hold identically for every entry, including user-added ones.
- Honesty: what has not been checked against the vendor's documentation must not
  be presented as if it had.

## Considered options

### Option 1: a JSON registry plus a small set of render shapes (chosen)

`harnesses/<id>.json` describes detection, the target directory and filename,
the shape, the frontmatter fields, whether the format carries a model, and which
tool vocabulary it speaks. The renderer knows only shapes: `frontmatter-md`,
`prompt-md`, `toml`, `aggregate-json`, and `none`. Project entries in
`<project>/.mps/harnesses/<id>.json` override the bundled ones.
**Pros:** a new harness is a data file; overriding needs no fork; `mps harnesses`
documents itself; the guarantees are implemented once for everyone.
**Cons:** the template language is deliberately poor (a field is a scalar or a
block), so a genuinely exotic format needs a new shape; the JSON is not strictly
schema-validated.

### Option 2: one adapter function per harness

**Pros:** maximum flexibility per harness.
**Cons:** seventeen harnesses means seventeen nearly identical functions and
seventeen places to forget provenance or the foreign-file guard; and a user
cannot add their own. Rejected.

### Option 3: do not extend; keep three and say "print the prompt yourself"

**Pros:** no work.
**Cons:** exactly the dependency on specific CLIs the fork exists to remove.
Rejected — but the floor is kept: `mps agents show <role>` always works and is
the contract for any harness not in the registry.

## Decision

Take option 1. Each entry carries its confidence level in the JSON, and
`mps harnesses` prints it, so the difference is never lost. Three levels, about
**evidence** rather than about how good the tool is:

- `verified` — documented **and** exercised in that harness;
- `documented` — taken from the vendor's own documentation, with the URL in the
  entry's `docs` field, but not run here;
- `inferred` — guessed from a directory convention or a sibling CLI in the same
  family; the entry's `notes` say what was assumed and what to check.

**A model vendor is not a harness.** Some vendors ship both a CLI and models:
Moonshot (`kimi` + `moonshot`), Zhipu (`zcode` + `glm`), Alibaba (`qwen` +
`dashscope`), Tencent (`codebuddy`), DeepSeek (`dsh` + `deepseek`). Others ship
models only — DeepSeek's community terminal agents are separate projects, and
MiniMax's MMX-CLI generates media rather than driving a codebase. Registering a
model vendor as a harness would promise role files with nowhere to land, so such
entries carry `kind: "provider"`: they are excluded from install/status/doctor,
listed separately, and detected from the environment (`match.env`,
`match.url_contains`). Their practical payoff is the record: `mps commit` writes
an `Mps-Provider` trailer and `mps log --provider deepseek` reads it back. The
same harness behaves very differently behind a different model, and six months
later nothing else in the repository remembers which one wrote a commit.

**A harness with no role-file format is a first-class case.** `roles.shape:
"none"` (DeepSeek Harness) is still detected, still receives the routing block,
and must state how a role *is* reached instead; install writes nothing and says
so, and doctor does not ask why the roles are missing.

The routing block is written not only to `AGENTS.md`/`CLAUDE.md` but to the
instruction file each detected harness actually reads (`GEMINI.md`,
`.github/copilot-instructions.md`, `.cursor/rules/…`): a Cursor-only project may
never have heard of `AGENTS.md`.

## Registry review against the vendors' documentation (2026-09-01)

Written from memory first, the entries were wrong more often than not. After
checking every vendor's own documentation:

| Entry | Was | Now, per the docs |
|---|---|---|
| `codex` | `~/.codex/prompts/*.md` | `.codex/agents/*.toml` — project-level agents (`developer_instructions`, `sandbox_mode = "read-only"`); the old custom prompts are deprecated in favour of skills |
| `opencode` | `.opencode/agent/`, a `tools:` map | `.opencode/agents/` (plural), access through `permission:` allow/ask/deny — the `tools` map is legacy |
| `gemini` | TOML commands in `.gemini/commands/mps/` | `.gemini/agents/*.md` — Gemini CLI gained subagents |
| `copilot` | `.github/chatmodes/*.chatmode.md` | `.github/agents/*.agent.md` — chat modes deprecated; VS Code also reads `.claude/agents` |
| `claude` | no `disallowedTools` | the field is documented and is now emitted: edits denied, not merely described |
| `qwen` | TOML commands | `.qwen/agents/*.md` subagents; only the deny-list is emitted, because Qwen's allowlist uses Gemini-CLI tool names |
| `codebuddy` | `.codebuddy/rules/` | `.codebuddy/agents/*.md`, frontmatter close to Claude Code's, including `effort` |
| `kimi`, `zcode`, `dsh` | absent | Moonshot, Z.ai and DeepSeek all shipped their own harness |
| `lingma` | inferred | documented: `.lingma/rules/` is project-scoped and meant to be committed |
| `cline` | `AGENTS.md` assumed | AGENTS.md support is still an open discussion; the block goes to `.clinerules/` first |
| `windsurf` | no limits | a documented 12000-character limit per workflow; frontmatter is undocumented |
| `roo` | JSON assumed permanent | JSON is documented as fully supported and not deprecated, but YAML is now preferred |
| `cursor` | — | confirmed: `.mdc` only; a plain `.md` in `.cursor/rules` is ignored |
| `kimi` | detected on `.agents/agents` too | detected on `.kimi-code` only — `.agents/` is Antigravity's workspace directory and a shared convention Kimi merely reads, so it says nothing about which CLI runs here (the same call the registry already makes for `AGENTS.md`, read by nearly all and claimed by `codex` alone) |
| `grok`, `antigravity`, `qm` | absent | three harnesses that shipped after the fork started: `.grok/agents/*.md` (xAI, `spawn_subagent`), `.agents/agents/<name>/agent.md` (Google), and YC's orchestrator, which has no role format because it drives Pi/OpenCode/Codex/Claude Code |
| `pi` | absent | `none` on purpose: pi's own README refuses sub-agents and points at extensions, so a role is a second pi session. The file format that exists (`.pi/agents/*.md`) belongs to the third-party pi-subagents package, and the entry carries the override JSON rather than pretending stock pi reads it |

One conclusion generalises: **keeping this registry true is a recurring poll,
not a one-time setup.** In a single review, formats had changed for four of the
seven Western entries. The `docs` URL in each entry exists exactly for that — the
next check starts there rather than from memory.

A second one: `sandbox_mode = "read-only"` in Codex is the only place a harness
*enforces* the roles' read-only contract rather than being asked for it.
Elsewhere it is a tool map (Claude, OpenCode, Kimi, CodeBuddy, Qwen) or prose.

A third, and the one that cost code: Antigravity's unit is a *directory* per
agent, not a file, so `roles.file` may now carry a directory segment. Install
makes the parent of each file rather than the target directory once, and
uninstall walks the target instead of listing it — a flat listing saw the
directory, failed to read it as text, and removed nothing. Both are shape-blind:
the registry stayed data, and the next such harness is still a JSON file.

## Consequences

### Positive

- Twenty-one harnesses out of the box, and the twenty-second is a data file.
- A format that changes under you is fixed in `.mps/harnesses/` the same day.
- `mps harnesses` shows what is supported, what is detected here, and how to
  invoke a role in each.

### Negative / risks

- Two entries are `inferred` and may diverge from the real CLIs; that is visible
  in the output but still moves part of the verification to the user.
- The field templates are intentionally poor: a harness needing nested YAML
  beyond a tool map will need a new shape.
- The registry is public surface: renaming a key breaks user entries.

## Verification and follow-up

- `tests/harness.test.mjs`: every registry entry renders every role with
  provenance and a matching hash; a project-local entry is picked up and
  installed with no code change; an aggregate merges without touching other
  modes; a role whose unit is a directory is created and removed whole, with a
  neighbouring file that is not ours left alone; nested directories are cleared
  on uninstall; TOML output is valid and
  its body block closed exactly once; frontmatter shapes pass the scalar rules;
  an entry with no fields produces no empty `---\n---` block; a harness with no
  role files installs nothing and is not nagged about; providers stay out of the
  harness list and are detected only on evidence; every `documented` entry names
  its document and every `inferred` entry explains itself.
- Live: installing into all twenty-one entries, idempotence, `uninstall` leaving
  nothing behind, doctor clean afterwards, and a provider recorded in a commit
  under `ANTHROPIC_BASE_URL=https://api.moonshot.ai/anthropic`.
- Not verified: behaviour inside the harnesses themselves — precisely what
  `documented` and `inferred` mean in the table.
- Open: ZCode's project-level sub-agents are announced but not shipped, so the
  entry writes project files and prints the copy step to `~/.zcode/`. When the
  project level lands, that is a one-line JSON change.
