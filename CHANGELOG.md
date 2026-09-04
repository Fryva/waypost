# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Decisions that check themselves (ADR-0011): an ADR may carry `guards`
  (`forbid`/`require` regexes over `in`/`not_in` globs, with a mandatory
  `why`); `doctor` evaluates them over the project's files — issue for an
  accepted decision, "would fail" for a proposed one — and names the file and
  line; a `check` guard names the project's fitness command and is never
  executed. `draft adr --write` records `drafted_by`; the ADR templates carry
  both fields.
- Ready work: a story may declare `blocked_by: ["<epic>/<stem>", …]`;
  `waypost ready` lists stories that are planned, unblocked and unclaimed
  with the command that claims each, `--all` says why the rest are not;
  `waypost next` ranks the first three ready stories above warnings; the
  board tags blocked stories `#blocked`; `doctor` reports a `blocked_by`
  that names no story, a dependency cycle, block-form `blocked_by`, and two
  ADRs sharing one number.

### Changed
- Coordination follows the repository (ADR-0010): inside a git repository,
  presence and leases now live in the git common dir (`.git/waypost/<vault>/`),
  which every worktree shares and `git clean` never touches, so two agents in
  two worktrees see each other's claims, leases and presence. A linked worktree
  inherits the main worktree's binding (`git worktree add` needs no setup), a
  session id that arrives from the environment is qualified per linked
  worktree, and `brief`/`sessions` name sibling worktrees instead of
  mistaking them for a shared checkout (the vault-offset signal is retired).
  Outside a repository the records stay in `<vault>/.projectstore/`;
  `coordination_dir` in the binding overrides both; `waypost storage` names
  the directory in use. For one minor version both places are written and
  read, so a peer on 0.14 keeps its protection. The legacy session registry
  stays in the vault (ADR-0004).

## [0.14.0] — 2026-09-04

### Added
- Waypost's procedures ship as standard Agent Skills (`SKILL.md`): ten bundled
  `waypost-*` skills — draft, story, review, search, doctor, commit, and the
  four proactive ones — installed with `waypost skills install` into the
  directory each harness discovers (one copy in `.agents/skills/` for the
  eleven harnesses that read it), checked by `doctor` (stale, missing,
  foreign), repaired by `--fix`, installed by `setup` and by the running
  harness's first `brief`. Descriptions are pinned to a standing-context
  budget by a test. `waypost skill <name>` accepts the short name.
- A harness started from inside another (OpenCode from a Claude Code session)
  is detected by its own process, not by the inherited env markers, so it no
  longer records itself as the outer harness or installs the outer harness's
  roles. Found by the first live OpenCode run; the README now carries a
  verified-live matrix and the vault a runbook for running one.
- `doctor` checks instruction-file hygiene: an `AGENTS.md`/`CLAUDE.md` over
  300 lines is a warning, and a project that uses Claude Code with the routing
  block only in `AGENTS.md` gets a `claude-bridge` warning that `--fix`
  answers with a `CLAUDE.md` importing it (`@AGENTS.md`). `agents register`
  no longer writes the block into a root `CLAUDE.md` that already imports
  `AGENTS.md`.
- The harness registry records where each tool discovers project-level Agent
  Skills (`skills.dir`, `skills.reads`, with the evidence discipline of the
  entry itself); `waypost harnesses` shows the directory and `--json` carries
  the object. Twenty of twenty-one harnesses read skills; eleven of them read
  the shared `.agents/skills/`, which is the install target wherever a harness
  reads it. First story of WP-14.

## [0.13.1] — 2026-09-04

### Added
- `waypost sessions --prune --older-than <span>` (`6h`, `90m`, `2d`) lowers
  the 24h reaping threshold explicitly. A record whose harness process is
  still running on this host is never reaped by age, whatever the threshold:
  that would drop its story claim.

## [0.13.0] — 2026-09-04

### Added
- On the same host, a session whose harness process has exited is `ended` at
  once, not after 24h: a beat records the harness process (the nearest
  non-shell ancestor of the CLI) with its start time, and a reader on that host
  checks the process table. `waypost sessions --prune` reaps such records
  immediately; other hosts' records and records without process information
  are judged as before (ADR-0007 amendment).

## [0.12.2] — 2026-09-04

### Fixed
- One session, one id: the harness is detected before the session id is
  derived, so the id's harness prefix no longer depends on whether
  `WAYPOST_HARNESS` happened to be pinned already. One Claude Code session used
  to leave two presence records (`8-48df-…` and `claude-8-48df-…`) and stamp
  commits with either (ADR-0006 amendment).

## [0.12.1] — 2026-09-04

### Fixed
- `waypost bind <the same vault>` reset `language` and `layout` to their
  defaults unless both flags were repeated; a re-bind now keeps what the
  project already chose, and an explicit flag still changes it.

## [0.12.0] — 2026-09-04

### Added
- This changelog.
- A harness that opens the project for the first time installs itself:
  `waypost brief` renders the roles of the harness it runs in when they are
  missing or stale, puts the routing block into that harness's own instruction
  file, and says what it wrote so it gets committed (`--no-install` or
  `WAYPOST_NO_INSTALL=1` reads only). `waypost doctor` and `next` count the
  harness running them as in use, so a fresh session is told to install its
  roles even before its first brief.
- A shared *checkout* is named while it matters: when a session on another
  host is live and reports this project root, or a vault at the same offset
  inside its checkout (presence records now carry `vault_rel`), or the project
  root is on a cloud/network drive, `waypost brief`, `sessions` and
  `status` say so and repeat the one rule that helps — commit verified work at
  once, check leases before any revert — because git runs no hook before
  `checkout`/`restore`/`stash`/`reset`/`clean` (ADR-0007 addendum).
- `waypost commit --all`/`--tracked` refuses in a shared checkout without
  `--force`: a sweep would stage the other session's half-finished edits under
  this session's trailers. Explicit paths still work.

### Changed
- The binding stores `vault_path` relative to the project root when the vault
  lives inside the project, and resolves a relative path against the project
  root of the machine reading it. One checkout mounted under different paths
  on two machines now keeps one binding instead of each `bind --force`
  breaking the other's. An absolute path written by an earlier version still
  works and is rewritten the next time the tool saves the config.

### Fixed
- `waypost sessions` and `waypost status` no longer hide live peers behind the
  "no session registry yet" hint: presence beats by itself, and a session on
  another device was invisible there until someone ran `--touch`.
- `waypost lease <path>` outside the vault stored the path as typed, so an
  absolute path, or one carrying the vault's own prefix, never matched a staged
  path in `waypost commit`. Lease paths are now vault-relative inside the vault
  and project-relative outside it.

## [0.11.2] — 2026-09-03

### Changed
- Rewrote the README landing page for a first-time reader: a plain-language
  intro, the problem it solves, `npm install`, and a simpler quick start.
- Added a "How it compares" section positioning Waypost against rule syncers,
  spec-driven toolkits and agent-memory services.

No code changes from 0.11.1.

## [0.11.1] — 2026-09-03

### Added
- A tag-triggered Release workflow that runs the tests and publishes to npm with
  build provenance, gated on the tag matching `package.json`'s version.

Maintenance release; no functional changes from 0.11.0.

## [0.11.0] — 2026-09-03

Initial public release.

### Added
- **Harness-agnostic core**: one `waypost` CLI (alias `wyp`) that owns every
  write — no hooks, status line or slash commands required. Pure Node, no
  dependencies.
- **A project vault** of markdown-in-git artifacts: ADRs, specs, epics, stories
  and a kanban board, in the `engineering` layout.
- **Agent roles in 21 tools**: five roles (critic, planner, reviewer, librarian,
  archaeologist) defined once and rendered into each tool's format — Claude
  Code, Codex, OpenCode, Cursor, Windsurf, Gemini CLI, Copilot, Cline, Roo, and
  more — plus six model-provider records.
- **A deterministic `doctor`** that checks vault and install consistency with no
  AI, and `--fix` for the mechanical repairs.
- **Derived views** (`kanban`, `graph`, `codemap`) and `reconcile`, with scoped
  reads (`graph --for`, `search`) that keep context spend flat as the vault grows.
- **Multi-session / multi-device coordination**: commit trailers, advisory file
  leases, and skew-immune presence for vaults shared over cloud or network
  drives — `commit`, `merge`, `log`, `sessions`, `lease`, `watch`, `storage`.
- Nine accepted architecture decision records (0001–0009).

Hardened before release by a multi-agent audit and independent critic passes.

[Unreleased]: https://github.com/Fryva/waypost/compare/v0.14.0...HEAD
[0.14.0]: https://github.com/Fryva/waypost/compare/v0.13.1...v0.14.0
[0.13.1]: https://github.com/Fryva/waypost/compare/v0.13.0...v0.13.1
[0.13.0]: https://github.com/Fryva/waypost/compare/v0.12.2...v0.13.0
[0.12.2]: https://github.com/Fryva/waypost/compare/v0.12.1...v0.12.2
[0.12.1]: https://github.com/Fryva/waypost/compare/v0.12.0...v0.12.1
[0.12.0]: https://github.com/Fryva/waypost/compare/v0.11.2...v0.12.0
[0.11.2]: https://github.com/Fryva/waypost/compare/v0.11.1...v0.11.2
[0.11.1]: https://github.com/Fryva/waypost/compare/v0.11.0...v0.11.1
[0.11.0]: https://github.com/Fryva/waypost/releases/tag/v0.11.0
