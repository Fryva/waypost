# Harnesses

MPS renders one set of agent roles into whatever the harness in front of you
understands. A harness is **data**, not code: `harnesses/<id>.json` says where
its role files live, what shape they are and whether they can carry a model.
Adding support for one more agent CLI is a JSON file.

```bash
mps harnesses                       # what is known, where roles land, how to invoke
mps agents install --harness cursor # render into one
mps agents install                  # …or into whatever this project uses
```

## What ships

| id | Harness | Vendor | Roles land in | Shape | Confidence |
|----|---------|--------|---------------|-------|------------|
| `claude` | Claude Code | Anthropic | `.claude/agents/mps-<role>.md` | subagent/rule | verified |
| `cline` | Cline | Cline | `.clinerules/workflows/mps-<role>.md` | prompt/rule | documented |
| `codebuddy` | CodeBuddy Code (腾讯云代码助手) | Tencent | `.codebuddy/agents/mps-<role>.md` | subagent/rule | documented |
| `codex` | Codex CLI | OpenAI | `.codex/prompts/mps-<role>.md` | prompt/rule | documented |
| `copilot` | GitHub Copilot (VS Code / CLI) | GitHub / Microsoft | `.github/chatmodes/mps-<role>.chatmode.md` | subagent/rule | documented |
| `cursor` | Cursor | Anysphere | `.cursor/rules/mps-<role>.mdc` | subagent/rule | documented |
| `gemini` | Gemini CLI | Google | `.gemini/commands/mps/<role>.toml` | command | documented |
| `kimi` | Kimi Code CLI | Moonshot AI | `.kimi-code/agents/mps-<role>.md` | subagent/rule | documented |
| `lingma` | Tongyi Lingma (通义灵码) | Alibaba Cloud | `.lingma/rules/mps-<role>.md` | prompt/rule | documented |
| `opencode` | OpenCode | SST | `.opencode/agent/mps-<role>.md` | subagent/rule | documented |
| `qwen` | Qwen Code | Alibaba | `.qwen/agents/mps-<role>.md` | subagent/rule | documented |
| `roo` | Roo Code | Roo Code | `.roomodes` | custom mode | documented |
| `windsurf` | Windsurf | Cognition | `.windsurf/workflows/mps-<role>.md` | prompt/rule | documented |
| `zcode` | ZCode (Z.ai / Zhipu) | Zhipu AI | `.zcode/agents/mps-<role>.md` | subagent/rule | documented |
| `iflow` | iFlow CLI (心流) | iFlow | `.iflow/agents/mps-<role>.md` | subagent/rule | inferred |
| `trae` | Trae (ByteDance) | ByteDance | `.trae/rules/mps-<role>.md` | prompt/rule | inferred |

Three levels, and they are about **evidence**, not about how good the tool is:

- **verified** — the format is documented *and* has been exercised in that harness.
- **documented** — taken from the vendor's own documentation; the entry records
  the URL in its `docs` field (`mps harnesses --json`), but it has not been run
  here.
- **inferred** — guessed from a directory convention or from a sibling CLI in the
  same family. The entry's `notes` say exactly what was assumed and what to check.

Being wrong here is cheap and local: override the entry (below), and nothing
else changes.

Several of these vendors ship a CLI *and* models — Moonshot (Kimi Code CLI +
Kimi models), Zhipu (ZCode + GLM), Alibaba (Qwen Code + DashScope). The tool is
a harness entry, the model is a provider entry, and they carry different ids so
one project can use one without the other.

## Vendors are not harnesses

Some vendors ship a CLI, some ship only models, and several ship both. DeepSeek
and MiniMax are models only: DeepSeek's terminal agents are community projects,
and MiniMax's MMX-CLI generates media rather than driving a codebase. Moonshot,
Zhipu and Alibaba ship both — `kimi`, `zcode` and `qwen` above are their tools,
and the entries below are their models, which also run inside Claude Code
pointed at an Anthropic-compatible endpoint:

```bash
export ANTHROPIC_BASE_URL=https://api.moonshot.ai/anthropic   # Kimi, for example
mps agents install --harness claude    # install for the harness you actually run
mps commit -m "…"                      # records Mps-Provider: kimi
```

So there is nothing to install for a provider. What mps does instead is
**record which one produced the work**: `mps commit` detects the provider from
the endpoint override or a vendor key and writes an `Mps-Provider` trailer, and
`mps log --provider deepseek` reads it back. The same harness behaves very
differently behind a different model, and six months later that is not
recoverable from anything else.

| id | Vendor | Detected by | Usually driven from |
|----|--------|-------------|---------------------|
| `dashscope` | Alibaba Cloud | `DASHSCOPE_API_KEY`, a `dashscope.aliyuncs.com` endpoint | qwen, cline, roo, opencode |
| `deepseek` | DeepSeek | `DEEPSEEK_API_KEY`, a `deepseek.com` endpoint | cline, roo, continue, opencode |
| `glm` | Zhipu AI | `ZHIPUAI_API_KEY`, a `bigmodel.cn` endpoint | zcode, claude, cline, roo |
| `minimax` | MiniMax | `MINIMAX_API_KEY`, a `minimax.io` endpoint | claude, cline, opencode |
| `moonshot` | Moonshot AI | `MOONSHOT_API_KEY`, a `moonshot.cn` endpoint | kimi, claude, cline, roo |

`MPS_PROVIDER` overrides the detection; with no evidence, nothing is recorded —
a guess in a permanent record is worse than a blank. Add your own provider as a
JSON file in `.mps/harnesses/providers/`.

Any harness not in the table still works, with no adapter at all:

```bash
<your-cli> "$(mps agents show critic) docs/decisions/0003-….md"
```

That is the floor the whole design rests on — a role is a prompt, and every
adapter is a convenience on top of it.

## Adding or overriding one

Drop a JSON file in `<project>/.mps/harnesses/<id>.json`. A project entry with
the same id replaces the bundled one, so this is also how you fix a format that
changed under you without waiting for a release.

```json
{
  "id": "myagent",
  "name": "My Agent",
  "detect": [".myagent", "MYAGENT.md"],
  "instructions": [".myagent/rules.md"],
  "invoke": "/mps-<role> <target>",
  "roles": {
    "shape": "prompt-md",
    "dir": ".myagent/roles",
    "file": "{prefix}{role}.md",
    "model": false,
    "fields": [["description", "{description}"]]
  }
}
```

### Fields

| Key | Meaning |
|-----|---------|
| `id` | registry key; the value `--harness <id>` takes |
| `detect` | paths that mean "this project uses this harness" (directory or file) |
| `instructions` | files the routing block is written into by `mps agents register` |
| `invoke` | one line telling a human (and the block) how to reach a role there |
| `after_install` | printed after install — for a manual step the CLI cannot do |
| `confidence` | `verified` / `documented` / `experimental` — see above |
| `vendor` | who makes it, shown in the listing |
| `kind` | `provider` for a model vendor: it is listed, detected and recorded, never installed into |
| `runs_in` / `match` | provider entries only: which harnesses drive it, and the env that identifies it |
| `roles.shape` | `frontmatter-md`, `prompt-md`, `toml-prompt` or `aggregate-json` |
| `roles.dir` / `roles.file` | where a role lands; `{prefix}` and `{role}` substitute |
| `roles.model` | `false` if the format carries no model, else `{ "tiers": {…} }` |
| `roles.tools` | `{ "style": "claude" \| "opencode-map" \| "copilot-list" }`, or omitted |
| `roles.fields` | ordered `[key, template]` frontmatter; empty values are dropped |
| `roles.entry` | `aggregate-json` only: the object written per role |

Templates substitute `{prefix}`, `{role}`, `{name}`, `{description}`, `{mode}`,
`{effort}`, `{model}`, `{tools}`, `{body}`. A field whose value comes out empty
is omitted entirely — that is how "this harness has no model" and "this role
declares no effort" end up being the same rule.

### Shapes

- **`frontmatter-md`** — one file per role: YAML frontmatter, then the prompt.
  Claude Code, OpenCode, Cursor, Copilot.
- **`prompt-md`** — one file per role, plus a preamble carrying `$ARGUMENTS` and
  the read-only contract in prose. Codex, Windsurf, Cline.
- **`toml-prompt`** — `description` + `prompt = """…"""`. Gemini CLI.
- **`aggregate-json`** — every role is an entry in one shared JSON array, merged
  rather than overwritten: entries whose key starts with `mps-` are ours,
  everything else in the file is left alone. Roo Code.

## Guarantees that hold for every harness

- **Provenance.** Every generated file (or entry) carries a line naming the
  source role and a hash of the render. `mps doctor` compares against what
  install would write *now*, so a changed role, model or adapter shows up as
  stale.
- **Nothing of yours is overwritten.** A file under the `mps-` prefix without
  that provenance line is skipped by install, skipped by `doctor --fix`, and
  never deleted by uninstall.
- **No harness is conjured.** With nothing detected and no `--harness`, install
  refuses rather than scattering directories. Uninstall removes the directories
  it emptied, so detection cannot resurrect a harness you removed.
- **Read-only is a contract.** Where the harness has a tool map, edits are
  denied there; the shell stays available because these roles need `git diff`,
  so "never write" is also carried by the prompt itself.
