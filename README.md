# Waypost

[![npm](https://img.shields.io/npm/v/waypost.svg)](https://www.npmjs.com/package/waypost)
[![CI](https://github.com/Fryva/waypost/actions/workflows/ci.yml/badge.svg)](https://github.com/Fryva/waypost/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

**Waypost is the shared ground for AI coding agents on one project: a memory of
the project's decisions and open work, kept as markdown in git; the same roles and
rules in 20+ agent tools; coordination when several tools, sessions or machines
work at once; and a guard that keeps heavy builds and test runs from choking the
computer they run on.**

A waypost is a signpost left where the path forks, for whoever comes next. That
is the idea: every decision, spec, epic, story and a kanban board live as
readable files in your repo, so the next agent — or the next model a year from
now — can see *why* the project is the way it is, instead of guessing.

Waypost is one dependency-free Node CLI. It does four things:

1. **Project memory.** Decisions (ADRs), specs, epics, stories and a board as
   plain markdown in the repo, with a deterministic health check (`waypost
   doctor`) and an orientation packet for the start of every session (`waypost
   brief`), which also lists what teammates changed since your last commit.
2. **One source of rules for every tool.** Agent roles and skills are defined
   once and rendered into the native format of Claude Code, Codex, OpenCode,
   Cursor, Gemini CLI and 16 more. `waypost setup` asks the running tool which
   one it is, rather than guessing from files.
3. **Tools working together.** Sessions in different tools, on different
   machines and operating systems see each other (`sessions`, `lease`, `watch`),
   every commit records which tool, session, story and OS made it, and
   experimental **teams** let Claude Code, Codex and OpenCode work one task under
   an owner-assigned leader with an independent reviewer and an owner token budget.
4. **Machine resources.** Heavy work (a build, a full test suite, a simulator)
   runs only through a machine-wide slot sized from the computer's real free
   cores and memory (`waypost capacity`, `waypost run --heavy`), and build
   artifacts are trimmed under a machine-wide disk limit (`waypost clean
   --limit`), oldest first.

Harness-agnostic fork of [ProjectStore](https://github.com/SmartAndPoint/ProjectStore).

## The problem it solves

- **Agents forget.** Each new session starts blank and re-derives context that
  was already settled. Waypost writes that context down once, in the repo.
- **Every tool stores things differently.** Claude Code, Codex, Cursor, Gemini
  and the rest each have their own format for agent instructions. Waypost keeps
  **one** source of truth and renders it into whatever tool you use.
- **Agents in different tools collide.** Two sessions edit the same file, sweep
  each other's changes into a commit, or nobody can tell afterwards which tool
  wrote what. Waypost makes every live session visible and every commit
  attributable, and refuses the moves that would destroy another session's work.
- **Agents overload the machine.** Several agents each starting a build or a
  test suite at once can hang a laptop for half an hour, and build caches grow
  to tens of gigabytes. Waypost decides from the machine's real free resources
  how many heavy jobs may run, and keeps build artifacts under a limit.
- **No lock-in.** Everything is plain markdown in git — no server, no database,
  no proprietary format. Open it in any editor, or in Obsidian for the graph and
  board views.

## Install

```bash
npm install -g waypost      # needs Node 20+, no other dependencies
```

This gives you two commands, `waypost` and the short alias `wyp`.

If that fails with `EACCES` on `/usr/local/lib/node_modules` — the default on
Debian/Ubuntu, where npm's global prefix is not writable by your user — point
the prefix at your home directory instead of reaching for `sudo`:

```bash
npm config set prefix ~/.local
npm install -g waypost
```

Make sure `~/.local/bin` is on your `PATH` (on Ubuntu it is, from `~/.profile`,
after the next login). Or skip the install altogether: `npx waypost@latest …`.

### Running from a checkout that another system edits

If `waypost` runs from a checkout (`npm link`) and a Windows or Linux VM edits that checkout over a
network share, every save from there drops the executable bit of `bin/waypost`, and the command
starts answering `permission denied`. `waypost doctor` warns about this setup before it bites.
The repair replaces npm's symlink with a small shim that does not need the bit:

```bash
waypost launcher --write
# once the command already refuses to start:
node <checkout>/scripts/launcher.mjs --write
```

## Quick start

From inside your project:

```bash
waypost setup
```

That one command does the whole install: it creates (or adopts) a `vault/`
folder for your project's notes, sets up the folder layout, installs the agent
roles for whatever tools your project uses, and fixes anything mechanical. It is
safe to re-run; add `--dry-run` to see what it would do first. Working alone
in one tool? Skip `setup` and take the shorter path below.

Then, day to day:

```bash
waypost                 # is this set up, and what does it need right now?
waypost next            # the same, ranked, with the exact command for each
waypost brief           # orientation for the session; installs this tool's roles if missing (unless the vault opts out)
waypost draft adr "Use Postgres for primary storage" --write
```

The last command creates a decision record and wires it into the board and the
link graph. Every file it makes is plain markdown you can read and edit by hand.

## Working alone, in one tool

You do not need the roles, the coordination or the teams to get the two parts
that stand on their own: a deterministic vault check and commits that carry
your tracker's task id (needs a Waypost newer than 0.16.0):

```bash
waypost bind vault --self-install off     # a vault; no roles or skills unless you ask
printf '\n.waypost/\n' >> .gitignore      # the binding is per checkout
git add vault .gitignore && git commit -m "Add the project vault"
waypost doctor --vault vault              # in CI too: no AI, no setup, exit 1 on an issue
waypost commit -m "Fix the login timeout" --task PROJ-123 --all
waypost log --task PROJ-123
```

`--task` takes a tracker's id (YouTrack, Jira, Linear) and is never looked up;
the trailer is plain git: `git log --grep '^Waypost-Task: PROJ-123$'` finds the
whole history without this tool. `--self-install off` lives in the committed vault
policy, so no clone gains role files; on another clone run `waypost bind vault`,
not `setup`. If your agent runs builds, `waypost agents register` once writes the
routing block with its heavy-work rule into your instruction file.

## What you get

- A **decision log and backlog** that lives in the repo, not in someone's head.
- The **same agent roles in every tool** — define a reviewer or a planner once,
  use it in Claude Code, Codex, Cursor, and 18 more.
- A **deterministic health check**, `waypost doctor`, that verifies the vault is
  consistent with zero AI and zero guesswork, and can gate CI.
- **Coordination across tools, machines and people** — who is working on what,
  which files they hold, attributed commits, even on a vault synced over iCloud
  or Dropbox.
- **Teams of several tools and models** (experimental) — one task, an
  owner-assigned leader, independent review, and a token budget per run.
- **A machine that stays usable** — heavy jobs share slots sized from real free
  resources, and build artifacts stay under a disk limit.

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
| `waypost commit -m "…" [--story <id>] [--task <id>]` | commit with harness/session/story/task trailers |
| `waypost skills install` | the bundled procedures as Agent Skills, in the directory your tool reads |
| `waypost ready` | stories that are planned, unblocked (by other stories, a draft spec or a proposed ADR) and unclaimed, with the command that claims each |
| `waypost sessions` / `lease` / `watch` | see and coordinate who is working |
| `waypost team …` | experimental: teams of several tools and models under an owner-assigned leader (`create`, `roles`, `plan`, `host`); see `docs/team-coordination.md` |
| `waypost status` | a summary of the setup and role state |
| `waypost capacity [--json]` | the machine's real free resources now, and how many more heavy jobs it can take |
| `waypost run --heavy [--wait <Ns\|Nm>] -- <cmd…>` | claim a machine-wide slot for heavy work (a build, a full test suite, a simulator boot, a whole-disk scan) |

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

## Verified live

`waypost harnesses` marks every entry `verified`, `documented` or `inferred`
(see [docs/harnesses.md](docs/harnesses.md)). Verified means the whole loop —
a real prerequisite setup followed by brief, a story, a commit, sessions,
leases and doctor driven from that tool's own session on the date given.
Setup may be prepared by the caller where protected configuration needs approval. The runbook is in the vault
(`ops/`: "Verify a harness live").

| Tool | Status | Date | What was exercised |
|---|---|---|---|
| Claude Code | verified | 2026-09-04 | the whole loop, daily, on this repository and a second project |
| OpenCode | documented, run partially | 2026-09-04 | headless `opencode run --pure` executed `waypost brief` and `waypost next` with permissions auto-allowed; the full loop still needs an interactive session |
| Codex CLI 0.159.2 | verified | 2026-09-30 | independent `codex exec --approve-for-me` on macOS: real setup, all nine runbook steps, autonomous skills, codex/story trailers, claim and lease; scoped metadata approvals; sandbox process-table warning |
| the other 18 | documented / inferred | — | formats from vendor docs; see the registry `notes` |

## Working across tools, machines and people

Two agents in two different tools on one repo is the case this fork is built for.
Waypost keeps the history attributable and the shared files conflict-free:

```bash
waypost commit -m "Add the codex adapter" --story PS-1/story-codex-adapter --all
waypost log --story PS-1/story-codex-adapter     # or --harness codex
```

Every commit carries git trailers (`Waypost-Harness`, `Waypost-Session`,
`Waypost-OS`, `Waypost-Provider`, `Waypost-Story`, `Waypost-Task`) that git itself can read, so the record survives without this
tool. Generated views regenerate on merge instead of conflicting line by line.
See [ADR-0006](docs/vault/adr/0006-commit-protocol.md).

For a vault synced across machines (iCloud, Dropbox, a network share) Waypost
does not pretend to lock anything — it coordinates:

```bash
waypost lease src/auth.ts    # "I'm editing this right now"
waypost sessions             # who is live, on which OS, holding what
waypost watch                # stay live and see others join, leave, take a story
```

Liveness never compares one machine's clock with another's, so a device whose
clock is hours off is still judged correctly, and every answer says how stale it
might be. See [ADR-0007](docs/vault/adr/0007-shared-vault-presence.md).
When two sessions share one *checkout*, not just one vault, `waypost brief` says
so, and `waypost commit --all` refuses to sweep the other session's uncommitted
edits into your commit.

### Teams across tools and models (experimental)

One task can be worked by several tools under one leader, with an independent
reviewer. The owner assigns the roles, the leader proposes a plan, and nothing
is installed until the owner says so:

```bash
waypost team create <story.md> --id <team> --native-policy-bootstrap   # one team per task
waypost team roles <team> --assign --coordinator a --reviewers b --executors c \
  --reason "<why>" --yes                         # owner-assigned roles
waypost team plan <team> --request --plan-id P --goal "..." --base <sha> --scope a.js [--critic]
waypost team plan <team> --install --plan-id P --digest <digest> --yes --reason "<why>"
```

Claude Code, Codex and OpenCode take part through managed read-only endpoints;
approved work is published as one commit on the team's private branch. Live runs
on macOS covered a Claude Code, Codex and OpenCode trio, the loss of a role,
chained and parallel works, a plan from the leader and a plan critic.

The owner's token budget for live runs holds across every team on the machine,
per tool's token counter and optionally in total. A call that would exceed it is
refused before it starts:

```bash
waypost team budget set --name run-1 --total 250000 --yes --reason "<who agreed>"
waypost team budget status
```

Sessions that are not team members can still read and answer a team's inbox
through an MCP server (`waypost team-mcp-config --harness claude …` prints or
writes the config). See [docs/team-coordination.md](docs/team-coordination.md)
and the ADR [owner-assigned team roles](docs/vault/adr/owner-assigned-team-roles-by-default-with-calibration-as-an-optional-check.md).

## Keeping the machine usable

Agents start builds, test suites and simulators without knowing what else is
running. Waypost measures the machine itself (cores, load, available memory, and
memory pressure on macOS) and hands out machine-wide slots for heavy work, shared
by every agent tool and session on the computer:

```bash
waypost capacity                              # free resources now, and who holds the slots
waypost run --heavy -- xcodebuild build …     # runs only if a slot is free, at lowered priority
waypost run --heavy --wait 20m -- npm test    # or waits for one
```

A refused job exits with code 75 and names the reason. Build artifacts are kept
under one machine-wide limit: after each heavy job Waypost removes the project's
least recently built artifacts until it is back under the limit, never the
newest. The owner sets the limit once per machine:

```bash
waypost clean --limit 20      # GB; or free:30%, or off
waypost size --project        # read-only: what the build artifacts weigh
waypost size --global         # toolchain caches, simulators, Docker, each with its own clean command
```

See the ADRs [heavy work sized to the machine](docs/vault/adr/heavy-work-sized-to-the-machine-waypost-capacity-a-machine-wide-slot-and-a-rule-to-check-first.md),
[cleanup to a machine-wide limit](docs/vault/adr/cleanup-to-a-machine-wide-limit-set-by-the-owner-idle-artifacts-oldest-first.md)
and [disk hygiene by discovery](docs/vault/adr/disk-hygiene-by-discovery-a-toolchain-registry-a-machine-and-project-profile-and-cleanup-only-after-a-yes.md).

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
enforced by tests. See [ADR-0008](docs/vault/adr/0008-token-budget.md).

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
- [docs/vault/adr/](docs/vault/adr/) — the architecture decision records, in Waypost's own vault.
- [CHANGELOG.md](./CHANGELOG.md) — what changed in each release.
- [AGENTS.md](./AGENTS.md) — the rules every tool and contributor follows.

## Contributing

Issues and pull requests are welcome. Read [AGENTS.md](./AGENTS.md) (the single
source of the project's rules) and [docs/vault/adr/](docs/vault/adr/) (the ADR
log — architectural changes get an ADR before they get code) first.

```bash
npm test        # the whole suite — pure node, no dependencies, no network
```

Any test that spawns child processes must import `./env.mjs` before running them,
so children inherit the state-migration opt-out. For scoped validation of such
tests, include `tests/state-migrate.test.mjs`: its existing safety check scans all
test files for missing environment imports.

CI runs the tests on Node 20, 22 and 24. The test step sets
`WAYPOST_HEAVY_WAIT=5m` to wait up to five minutes for resource admission.
The capacity checks and 40-minute job timeout still apply.

### Releasing

Bump `version` in `package.json`, tag the commit `vX.Y.Z` (matching that
version), and push the tag. The `Release` workflow runs the tests and publishes
to npm, using the repository secret `NPM_TOKEN`. The tag must equal
`package.json`'s version, or the workflow refuses to publish.

## License

MIT — see [LICENSE](./LICENSE). Upstream ProjectStore is MIT-licensed by
SmartAndPoint; this fork keeps the licence and the attribution.
