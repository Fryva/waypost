# Waypost

[![npm](https://img.shields.io/npm/v/waypost.svg)](https://www.npmjs.com/package/waypost)
[![CI](https://github.com/Fryva/waypost/actions/workflows/ci.yml/badge.svg)](https://github.com/Fryva/waypost/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

**Waypost gives your AI coding agents a shared memory of your project — the
decisions, plans and open work — kept as plain markdown in git, and it works the
same in 20+ agent tools.**

A waypost is a signpost left where the path forks, for whoever comes next. That
is the idea: every decision, spec, epic, story and a kanban board live as
readable files in your repo, so the next agent — or the next model a year from
now — can see *why* the project is the way it is, instead of guessing.

Harness-agnostic fork of [ProjectStore](https://github.com/SmartAndPoint/ProjectStore).

## The problem it solves

- **Agents forget.** Each new session starts blank and re-derives context that
  was already settled. Waypost writes that context down once, in the repo.
- **Every tool stores things differently.** Claude Code, Codex, Cursor, Gemini
  and the rest each have their own format for agent instructions. Waypost keeps
  **one** source of truth and renders it into whatever tool you use.
- **No lock-in.** Everything is plain markdown in git — no server, no database,
  no proprietary format. Open it in any editor, or in Obsidian for the graph and
  board views.

## Install

```bash
npm install -g waypost      # needs Node 20+, no other dependencies
```

This gives you two commands, `waypost` and the short alias `wyp`.

## Quick start

From inside your project:

```bash
waypost setup
```

That one command does the whole install: it creates (or adopts) a `vault/`
folder for your project's notes, sets up the folder layout, installs the agent
roles for whatever tools your project uses, and fixes anything mechanical. It is
safe to re-run; add `--dry-run` to see what it would do first.

Then, day to day:

```bash
waypost                 # is this set up, and what does it need right now?
waypost next            # the same, ranked, with the exact command for each
waypost brief           # a short orientation to read at the start of a session
waypost draft adr "Use Postgres for primary storage" --write
```

The last command creates a decision record and wires it into the board and the
link graph. Every file it makes is plain markdown you can read and edit by hand.

## What you get

- A **decision log and backlog** that lives in the repo, not in someone's head.
- The **same agent roles in every tool** — define a reviewer or a planner once,
  use it in Claude Code, Codex, Cursor, and 18 more.
- A **deterministic health check**, `waypost doctor`, that verifies the vault is
  consistent with zero AI and zero guesswork.
- **Coordination for teams and multiple machines** — who is working on what,
  across tools, sessions and even a vault synced over iCloud or Dropbox.

## The everyday loop

task → write it down (a decision, spec, epic or story) → an independent critic
checks it → it lands in the backlog → a planner turns it into steps → a reviewer
checks the result → done. Each *check* is a fresh, separate pass so nothing
rubber-stamps its own work, and `waypost doctor` keeps the mechanical parts
honest.

## Commands

| Command | What it does |
|---------|--------------|
| `waypost setup` | the whole install in one command (`--dry-run` to preview) |
| `waypost next` | what the project needs now, ranked, with the command for each |
| `waypost brief` | a short orientation packet for the start of a session |
| `waypost draft <kind> "<title>" [--write]` | create an artifact (`epic`/`story` take a leading id) |
| `waypost story plan\|close <path> [--write]` | move a story through its lifecycle |
| `waypost kanban` / `graph` / `codemap` | rebuild one view |
| `waypost graph --for <path>` | just one artifact's neighbourhood, not the whole graph |
| `waypost search "<text>"` | search the vault, returning pointers rather than whole files |
| `waypost reconcile [--write]` | rebuild every view and index |
| `waypost doctor [--fix]` | consistency check (and mechanical repairs) |
| `waypost agents …` | manage roles: `list` / `install` / `uninstall` / `model` |
| `waypost harnesses` | which agent tools are supported |
| `waypost commit -m "…" [--story <id>]` | commit with harness/session/story trailers |
| `waypost sessions` / `lease` / `watch` | see and coordinate who is working |
| `waypost status` | a summary of the setup and role state |

Run `waypost help` for the full list.

## Works with your agent tool

Define a role once in `agents/*.md`; Waypost renders it into the format each tool
expects. Adding support for another tool is a JSON file, not code.

```bash
waypost harnesses                         # every tool it can render into
waypost agents install --harness cursor   # install roles for one tool (or `all`)
waypost agents list                       # roles + where they're installed
```

Supported today (21 tools): **Claude Code, Codex, OpenCode, Cursor, Windsurf,
Gemini CLI, GitHub Copilot, Cline, Roo Code**, and Kimi, Qwen, ZCode, CodeBuddy,
Grok, Antigravity, DeepSeek, QM, Pi, Trae, iFlow, Tongyi Lingma. The full table,
with exactly where each tool's files land, is in
[docs/harnesses.md](docs/harnesses.md).

Five roles ship: `critic`, `planner`, `reviewer`, `librarian`, `archaeologist`.
They are read-only by contract — they propose; writes go through the
approval-gated `waypost` flow.

## Working across tools, machines and people

Two agents in two different tools on one repo is the case this fork is built for.
Waypost keeps the history attributable and the shared files conflict-free:

```bash
waypost commit -m "Add the codex adapter" --story PS-1/story-codex-adapter --all
waypost log --story PS-1/story-codex-adapter     # or --harness codex
```

Every commit carries git trailers (`Waypost-Harness`, `Waypost-Session`,
`Waypost-Story`) that git itself can read, so the record survives without this
tool. Generated views regenerate on merge instead of conflicting line by line.
See [ADR-0006](docs/decisions/0006-commit-protocol.md).

For a vault synced across machines (iCloud, Dropbox, a network share) Waypost
does not pretend to lock anything — it coordinates:

```bash
waypost lease src/auth.ts    # "I'm editing this right now"
waypost sessions             # who is live, on which OS, holding what
waypost watch                # stay live and see others join, leave, take a story
```

Liveness never compares one machine's clock with another's, so a device whose
clock is hours off is still judged correctly, and every answer says how stale it
might be. See [ADR-0007](docs/decisions/0007-shared-vault-presence.md).

## What it costs to run

The overhead carried into every session is small and **does not grow with the
vault**: on a 32-artifact project, about 700 tokens total (roughly $0.04 across a
100-turn Opus session). The one thing to avoid on a big vault is reading a whole
generated view; use the scoped commands instead:

```bash
waypost graph --for adr/use-postgres.md    # 44 tokens, vs 1119 for the whole graph
waypost search "retry budget" --limit 5    # 91 tokens, vs 1516 for one index file
```

The agent roles are where real money goes, and that's the point — a critic pass
on Opus measured about $1.62, mostly the reading it does. Use `waypost agents
model default sonnet` to cut that by ~60%, and reserve the roles for decisions,
specs and story reviews rather than every edit. Budgets for all of this are
enforced by tests. See [ADR-0008](docs/decisions/0008-token-budget.md).

## Layout

The default `engineering` layout: `adr/`, `specs/`, `epics/<id>/stories/`,
`research/`, `concepts/`, `meetings/`, `ops/`, `diagrams/`. Defined in
`scaffold/layouts/engineering.json`.

## How it compares

Waypost sits where three kinds of tools overlap, and most tools cover just one of
them. It is a young, single-maintainer project; the ones below are more
established, and often the better pick if you only need the one thing they do.

| You want to… | Established tools | Where Waypost differs |
|---|---|---|
| Sync one rules file into every tool's format | [rulesync](https://github.com/dyoshikawa/rulesync), ai-rules-sync, ruler | Waypost renders full *roles* (with model/effort/tools), not just rules text — and carries a project vault and coordination on top |
| Drive a spec → plan → tasks → code workflow | [GitHub Spec Kit](https://github.com/github/spec-kit), [OpenSpec](https://www.jamasoftware.com/blog/openspec-guide/), Taskmaster, BMAD | Waypost adds a durable decision log (ADRs), a deterministic no-AI `doctor`, drift detection, and cross-tool / cross-machine coordination. Spec Kit is bigger and works with more agents |
| Give agents a queryable memory service | [mem0](https://github.com/mem0ai/mem0), Zep, Letta | Those are hosted/queryable memory stores (usually paid). Waypost is plain files in git — no server, no database — with pointer-based `search`/`graph` instead of semantic retrieval |
| Keep architecture decision records | [MADR](https://github.com/adr/madr), adr-tools | Waypost includes ADRs as one artifact type among specs, epics, stories and a board |

**What's distinctive** is the combination: one role definition rendered into 21
tools, a git-native vault checked by a deterministic doctor, and coordination
across sessions, tools and machines (presence, leases, commit trailers,
provenance) — including a vault synced over iCloud or Dropbox, with liveness that
survives clocks being hours apart. No single tool above does all three.

The closest relative is the upstream
[ProjectStore](https://github.com/SmartAndPoint/ProjectStore); Waypost's main
difference from it is being harness-agnostic instead of Claude-only.

## Learn more

- [docs/how-it-works.md](docs/how-it-works.md) — the mechanics in depth.
- [docs/harnesses.md](docs/harnesses.md) — every supported tool and how to add one.
- [docs/decisions/](docs/decisions/) — the architecture decision records.
- [CHANGELOG.md](./CHANGELOG.md) — what changed in each release.
- [AGENTS.md](./AGENTS.md) — the rules every tool and contributor follows.

## Contributing

Issues and pull requests are welcome. Read [AGENTS.md](./AGENTS.md) (the single
source of the project's rules) and [docs/decisions/](docs/decisions/) (the ADR
log — architectural changes get an ADR before they get code) first.

```bash
npm test        # the whole suite — pure node, no dependencies, no network
```

CI runs the tests on Node 20, 22 and 24.

### Releasing

Bump `version` in `package.json`, tag the commit `vX.Y.Z` (matching that
version), and push the tag. The `Release` workflow runs the tests and publishes
to npm, using the repository secret `NPM_TOKEN`. The tag must equal
`package.json`'s version, or the workflow refuses to publish.

## License

MIT — see [LICENSE](./LICENSE). Upstream ProjectStore is MIT-licensed by
SmartAndPoint; this fork keeps the licence and the attribution.
