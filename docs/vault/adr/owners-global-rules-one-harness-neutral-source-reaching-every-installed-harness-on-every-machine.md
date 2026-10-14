---
type: adr
id: "owners-global-rules-one-harness-neutral-source-reaching-every-installed-harness-on-every-machine"
title: "Owner's global rules: one harness-neutral source, reaching every installed harness on every machine"
status: accepted
date: 2026-10-13
authors: ["Ivan Morozov"]
tags: []
external_refs: {}
supersedes: null
superseded_by: null
review_status: reviewed
reviewed_at: 2026-10-13
drafted_by: {"harness":"claude","provider":null,"date":"2026-10-13"}
guards: []
---

# Owner's global rules: one harness-neutral source, reaching every installed harness on every machine

| Field | Value |
|---|---|
| **Status** | accepted |
| **Date** | 2026-10-13 |
| **Authors** | Ivan Morozov |

---

## Context

Waypost keeps one source of rules for a project (`AGENTS.md`, reaching each
harness through a generated file or an import, checked by `doctor`). It has
nothing for the owner's **global** rules — what every harness loads in every
project on a machine.

What the owner has, measured on 2026-10-13:

- **macOS host — a hub, two prose bridges, and a native setting.**
  `~/.claude/CLAUDE.md` (20 KB) is the hub. `~/.codex/AGENTS.md` and
  `~/.config/opencode/AGENTS.md` (16.7 and 20.3 KB) each tell the agent, in
  prose, to read `/Users/frost/.claude/CLAUDE.md` — a path no VM can resolve —
  and each keeps its own copies of shared sections. "Answer in Russian" was in
  both bridges and not in the hub; separately, `~/.claude/settings.json` sets
  Claude Code's native `"language": "Russian"`.
- **Windows VM `FROSTBEBE`** — Claude Code (bundled with the desktop app) and
  Codex (the Store app `OpenAI.Codex`) are installed; neither is on `PATH`.
  There was no `~/.claude/CLAUDE.md`; the Codex bridge pointed at a drive `W:`
  that does not exist. A symlink to the host's file over `\\Mac\frost` was
  tried; Claude Code does not follow a `CLAUDE.md` symlink to a network path,
  so it was replaced by a local copy.
- **Both harnesses on that VM are MSIX-packaged, and AppData is virtualized
  per package.** From a session of the Claude desktop app,
  `realpathSync.native("%LOCALAPPDATA%\Waypost")` resolves to
  `…\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Local\Waypost`, and child
  processes share the redirection; a file written there is invisible to a
  terminal and to Codex. `%USERPROFILE%` outside AppData is not virtualized.
- **Which surfaces load user scope is not yet measured.** Subagents of the
  Claude desktop app on the VM did not show the local `~/.claude/CLAUDE.md`,
  but that observation is confounded: the parent session started at 01:24 and
  the file was written at 02:06, and subagents inherit the parent's start-time
  snapshot (they also showed `.claude/CLAUDE.md` as it was at HEAD). Some
  surfaces skip user scope by design (Explore, Plan, `omitClaudeMd`
  subagents). The Agent SDK loads user scope when `settingSources` is
  omitted. Cowork loads user scope; it skips out-of-directory imports and a
  user `CLAUDE.md` that is a symlink or hard link. Every live check runs in a
  session started after the write.
- **Project rules did not reach Claude either.** This repository's
  `.claude/CLAUDE.md` imported `@AGENTS.md`, which Claude Code resolves against
  the importing file — `.claude/AGENTS.md`, absent (fixed under WP-19).

So the failure is **hand-kept copies and prose pointers that drift and break
per machine, state that is not where it seems, and a "wired" state that does
not mean "loaded" — with no check**. Waypost's registry (ADR-0005) knows where
21 harnesses keep roles and skills in a project, and nothing about global rules.

Harness facts ("documented" until load-tested here):

| Harness | Global file(s), config home | Import | Notes |
|---|---|---|---|
| Claude Code | `~/.claude/CLAUDE.md`, `~/.claude/rules/*.md`; native `language` in `~/.claude/settings.json` (free-form name, also sets dictation; a project or managed `settings.json` overrides it); config home `CLAUDE_CONFIG_DIR` else `~/.claude` | `@path`, relative to the importing file | network symlink not followed; Cowork skips links and out-of-directory imports; `CLAUDE.md`, `CLAUDE.local.md`, `.claude/CLAUDE.md`, `.claude/rules/`, and (2.1.277+) `AGENTS.md` and `.claude/AGENTS.md` load from every ancestor directory, settings files do not; `claudeMdExcludes` takes absolute globs |
| Codex | `AGENTS.override.md` else `AGENTS.md` (first non-empty) in `CODEX_HOME` | none | home instructions are bound by file digest (tool-surfaces ADR); also `developer_instructions`, `model_instructions_file` in config |
| OpenCode | `~/.config/opencode/AGENTS.md`, **else falls back to `~/.claude/CLAUDE.md`**; `instructions` in global `opencode.json(c)`; follows the XDG config dir | no `@` | |
| Gemini CLI | `~/.gemini/GEMINI.md` | `@file` | its agent edits that file with general file tools |
| Cursor | user rules in app settings (assumed) | — | no file |

## Owner's decisions

- 2026-10-13: global rules do not depend on any harness — one neutral source;
  harness files are generated delivery points.
- 2026-10-13: the reply language is local to each computer.
- 2026-10-13: content edits to the source propagate automatically; only the
  source's location and install, uninstall, fix and migration are gated.

## Decision

1. **Two layers: a shared source and machine state, both outside any packaged
   app's virtualized storage.**
   - The **source** holds the owner's rules and nothing machine-specific;
     default `~/.config/waypost/AGENTS.md` on every OS (Windows:
     `%USERPROFILE%\.config\waypost\AGENTS.md`).
   - **Waypost's machine state** — this machine's recorded source path and its
     storage kind, recorded harness config homes, the reply language
     (Decision 7), the cache, render history, backups, live results, the
     heavy-work slots, the run budget, the cleanup limit — lives in one root,
     `~/.local/state/waypost/` on every OS (Windows:
     `%USERPROFILE%\.local\state\waypost\`), resolved from `os.homedir()` only:
     packaged and GUI apps do not see shell `XDG_*` variables. The one
     exception is `~/.waypost/codex-catalog` (tool-surfaces ADR), left where it
     is. `machineStateDir()` changes to this root; this amends the
     disk-hygiene ADR's state directory on every OS.
   - **The move migrates every old root, and fails closed.** It is owned by
     one story — the WP-18 slot story — and lands before anything else here.
     The old state is not one directory: the real `%LOCALAPPDATA%\Waypost`,
     every `%LOCALAPPDATA%\Packages\*\LocalCache\Local\Waypost` (each
     packaged harness's private copy, readable as an ordinary path),
     `$XDG_STATE_HOME/waypost` when set, `~/.local/state/waypost` under the
     old rule, and `~/Library/Application Support/Waypost`. Completion is per
     file, with no global "done" marker: every run checks every old root until
     it is empty. A file moves under the old root's lock and then the new
     root's; an older duplicate is archived, not left behind. The same name
     with different content in two roots is a conflict: every copy is kept
     under `migrated-conflicts/`; for the run budget, live runs are refused
     until the owner sets it again; for the cleanup limit, the most
     restrictive value wins (between copies older versions left — see the
     2026-10-13 amendment below). A run budget found anywhere but the new root
     refuses live runs rather than reading as "no budget"; slots are read from
     every old root for one release. Existing files keep their host-name keys; new
     per-machine data is keyed by a machine id (`/etc/machine-id`,
     `IOPlatformUUID`, `MachineGuid` — cloned VMs share it, which `doctor`
     reports).
   - Writes refuse any target under `%LOCALAPPDATA%` or `%APPDATA%`, and
     re-check `realpathSync.native` after creating a file.
   - The storage kind of the source — `storageOf()` on `realpathSync.native`
     (a mapped drive becomes its UNC form) — is decided **once**, at the gated
     `rules source` step, and recorded; rendering never resolves a remote path
     in-process and never reads an environment variable for the source.
2. **Every rule is authored and kept only in the source; a harness file is a
   generated delivery point.**
   - One mechanism for every harness: a **generated regular file** — no
     imports, no symlinks, link count 1 — with a deterministic header (a digest
     of the rendered body and the command that shows the source,
     `waypost rules where`; no path, no timestamp).
   - Where it goes is a property of the harness in the registry. OpenCode:
     `~/.config/opencode/AGENTS.md`, owned outright, so OpenCode never falls
     back to Claude's file once installed. Codex: `<codex home>/AGENTS.md`,
     owned outright; an `AGENTS.override.md` that shadows it is reported.
     Claude Code: a managed block in `~/.claude/CLAUDE.md`.
   - **Writes go only to config homes the gated install recorded.** A home the
     current environment resolves differently (`CODEX_HOME`,
     `CLAUDE_CONFIG_DIR`, an XDG variable set by a shell, `.envrc` or wrapper)
     is reported, never followed. A home inside a git work tree, a project
     root, or cloud-synced storage is refused.
   - **Another account's home that is an ancestor of the working directories**
     is recognised from the mount table. Its ancestor-loaded files — the list
     comes from the registry (`CLAUDE.md`, `CLAUDE.local.md`,
     `.claude/CLAUDE.md`, `.claude/rules/**`, `AGENTS.md`, `.claude/AGENTS.md`)
     — are excluded through a user-scope `claudeMdExcludes` entry, in every
     spelling the OS allows, written behind the gate, checked by
     `doctor --global`, and removed by uninstall.
   - A source on another machine is rendered from a **local cache**; an
     unreachable host leaves the last rules, never none.
   - A rule that only makes sense with some tool is written in the source as a
     condition ("if a code-graph tool is available, …").
3. **The registry gains `global_rules`**, ADR-0005 amended:
   - per harness, with its own `confidence` and `docs`: how its config home
     resolves (`config_home` — `home` already means the homepage), the ordered
     files with precedence, the settings that move or disable loading, the
     ownership model, its instruction channels, its ancestor-loaded files, its
     size limits, its native language setting and how a code maps to its value
     (Claude: `ru` → `"Russian"`), its surfaces — each either *expected to
     load user scope* or *excluded by design* — and its interactive
     entrypoints (Decision 7); or `none`, or `not-a-file`; a missing field
     means unknown;
   - read by a **shipped-only loader** in the first version — a project's
     `.waypost/harnesses/` can never supply it or any detection input; no
     registry path may be a network path;
   - a harness counts as present for writing when its config home exists and
     was created by the harness, never by Waypost. Package and app-bundle
     detection, which only affects reporting, comes later;
   - first version: Claude Code, Codex, OpenCode. Gemini CLI deferred.
4. **The check is opt-in, machine-scoped and read-only.**
   - `waypost doctor --global` reads the cache and the delivery points and
     reports: present, current, not drifted, link count 1, the
     `claudeMdExcludes` entry where needed. A surface the registry expects to
     load user scope and that does not is an **issue**; a surface excluded by
     design is listed as info. It lists every harness it did not check. It
     writes nothing; `--fix` is the gated repair.
   - The project `doctor` never reads a remote path and says nothing until the
     owner has configured a source; then it reads only local state and warns.
     Never in `--startup`, never under `CI`.
   - **Hermetic tests** use temporary homes and no model. **Live checks** are
     a manual runbook first: a sentinel line through the gated path **and**
     through the automatic path (edit the source, run `brief`, open a fresh
     session), per harness × surface × OS, recorded with date and harness
     version in the machine state.
5. **Who may write what.**
   - **Where the rules come from is gated, and the gate makes evasion visible,
     not impossible** — as the cleanup-limit ADR says of the same gate. Setting
     or changing the source, `rules install|uninstall --global`,
     `doctor --global --fix`, the `claudeMdExcludes` entry and migration
     (including moving anything into the source) take that gate: a terminal,
     no harness among the ancestors, the `[y/N]` answered. On Windows, where
     the gate has so far relied on environment markers only (the Codex app's
     markers do not fire outside its sandbox), it gains an ancestor walk
     through `Win32_Process` — new code, affordable for rare operations —
     that stops at a parent not older than its child and fails closed when
     the query fails. Once a source is configured, `brief` prints its location on
     every run, and one line whenever it or the gate record changed.
   - **Content propagates automatically** (owner's choice). `brief` and
     `rules` refresh the cache and re-render this machine's delivery points, so
     an edit to the source reaches every machine by its next Waypost session.
     `brief` prints one line — no content — when the source digest changed,
     and one line for every target it skipped (drift, sandbox). Each machine
     keeps the last N renders; `waypost rules history|diff` shows them in the
     owner's terminal. `brief --no-install` skips global writes. Changes take
     effect in the next session.
   - **A bad read never propagates.** An empty or unreadable source keeps the
     last good render. A source much smaller than the last render is not
     refused: it propagates once the same digest has been read on two refreshes
     at least N minutes apart — a deliberate cut goes through, a torn read does
     not. A network source is read in an async, detached child the parent
     abandons at its deadline, re-read after the storage's settle time, and
     used only if both reads agree.
   - **Codex stays bound to the file's bytes** (tool-surfaces ADR unchanged).
     Deterministic rendering keeps an unchanged source byte-identical, so a
     re-render that changes nothing invalidates nothing. When the rules or the
     language do change, `brief` and `doctor --global` compare the latest local
     profile's `instructions_digest` with the current bytes and say "Codex
     calibration invalidated on this machine" (macOS, where the profile exists).
     Because `brief` can now rewrite the file at any moment, the Codex surface
     hashes the instruction files — content and file identity — before
     `thread/start` (or before starting the app server, if that is when Codex
     reads them), after it, and after the drain; any difference makes the
     receipt unverified.
   - Every write: confinement as in Decisions 1–2; a symlinked or hard-linked
     target is refused and reported; the target's digest is compared
     immediately before the rename, aborted if it changed; Windows sharing
     violations are retried; a target that already equals the new render is
     success; a sandbox denial (`EPERM`, `EACCES`) skips that target with one
     line, never escalated nor counted as drift. Cache, history and language
     updates are serialized under a lock in the machine-state root; a lock
     whose owner is gone is broken by the same rule the slots use.
   - **Drift** is a delivery point or cache whose body does not match its
     header digest. It is never overwritten automatically — skipped and
     reported by `brief`; the repair is the gated `rules install --global`,
     which shows path, size and digest, backs it up and replaces it on yes.
   - **`settings.json` and other structured config** are edited one key at a
     time, keeping every other key (`hooks`, `permissions`, `env`); a file that
     does not parse is skipped and reported; it is backed up before the first
     write.
   - A hand-written global file is listed by path, size and digest, backed up
     in the machine state (owner-only permissions, kept until the owner deletes
     it, never printed), and replaced only on the owner's yes.
   - `uninstall` removes the managed block, the `claudeMdExcludes` entry and
     any native value Waypost wrote that is still its own; an owned file is
     deleted only if byte-identical to its last render, otherwise its header is
     stripped and it is reported; a migrated file is offered its backup. After
     a migration uninstall leaves a harness with no global rules — it says so
     and offers an export of the source.
6. **Migration is a merge into the source, with the owner.** First version:
   every global file and native language value on every machine is listed
   (path, size, digest) and backed up; the source is seeded from the host's hub
   file; duplicates across the files are listed; the owner edits the source in
   `$EDITOR` — rewriting harness names as conditions, removing prose pointers
   and reply-language sentences — and `doctor --global` confirms. Reporting
   rules that remain outside the source (bytes outside the Claude block,
   `~/.claude/rules/*`, Codex `developer_instructions` /
   `model_instructions_file`, OpenCode `instructions`; count, size and digest
   only) belongs to this step and is an issue after it. Agents see only paths,
   sizes and digests.
7. **The reply language is machine-local.** People with different languages
   work on the same project from their own machines:
   - stored in the machine state as
     `reply_language: {code, provenance: explicit|native|auto, entrypoint, at}`;
     BCP 47 plus a rendering allowlist, never free text; only `code`, mapped
     through the registry, is ever rendered;
   - **a value the owner already set natively** (the host's
     `"language": "Russian"`) is imported at install or migration as
     provenance `native` and treated as explicit: never overwritten. Waypost
     records the exact value it last wrote into a native setting and writes
     there again only while the current value still equals it; otherwise it
     reports. `doctor --global` reports a project, local or managed setting
     that overrides the machine value;
   - delivered per harness by the registry's means: a native setting where the
     harness has one (Claude Code `language`, which ancestor directories never
     load); otherwise one rendered line — "reply to the user in <language>;
     files follow the project's own language rules";
   - `explicit` only after the gate's `[y/N]` is answered in the owner's
     terminal; `explicit` and `native` are never replaced except by the owner
     the same way;
   - `auto` only from an entrypoint the registry lists as interactive, with
     evidence. Waypost's own launchers (team transport, `run`) set a marker that
     makes the call refuse — markers may only add refusals — because an
     inherited `CLAUDE_CODE_ENTRYPOINT` cannot tell `-p` or a team run from the
     session that spawned it. A Claude subagent cannot be told apart from its
     parent and may record: a stated limitation, made visible by `brief`;
   - while the value is unset, the instruction to call
     `waypost rules language <code>` is rendered only into this machine's
     user-level delivery points, and only for harnesses with a listed
     interactive entrypoint; while it is `auto`, one line remains — "if the
     user writes in a language other than <language>, call …" — and a later
     interactive `auto` that differs replaces the earlier one. Never into a
     project file, never printed by `brief`, size-tested (ADR-0008), never
     under `CI`;
   - `brief` prints one line with the value, its provenance, entrypoint and date;
   - a language change re-renders this machine's delivery points without the
     gate, through `brief`'s render path (drift skipped).

### Amendment, 2026-10-13 — accepted by the owner 2026-10-14

**The cleanup limit across the move.** Decision 1's "for the cleanup limit,
the most restrictive value wins" applies between copies that older versions
left behind. A limit written by this version (`written_by:
"waypost-state-v2"`, set through `waypost clean --limit`) is the owner's
latest explicit choice and wins over any older copy, a loosening or `off`
included. Reason: applied on every read, the rule kept the owner from
loosening a limit while an older copy survived the move, and the command
reported success anyway (WP-18 story, fourth code critic pass, S-4).

## Rationale

1. **The shape project rules use**, one level up — once project delivery is
   itself fixed (WP-19).
2. **Harness-neutral, because the owner uses several.** A Claude-named hub
   with prose bridges is what broke.
3. **What loaded, not what is wired.** A symlink, an import, a PATH-based
   detection, an AppData path and a subagent surface all looked fine today and
   were not. One mechanism, `realpathSync.native`, "expected but not loaded"
   as an issue and live checks per surface make "clean" mean something.
4. **Opt-in, because Waypost ships to people who never asked for this.**
5. **A cache, because shares go away**, decided once by where the path really
   is — and a torn read never replaces a good one, while a deliberate cut does.
6. **Location gated, content automatic.** A repointed source or config home
   would own every later session, and a probe of an attacker's UNC path sends
   Windows credentials; the gate cannot stop an agent editing the machine
   state, but `brief` shows every such change. The content is the owner's file,
   and the owner chose that an edit to it reaches every machine without a step
   per machine.
7. **Language per machine, because a project is shared and a person is not** —
   and an owner's existing choice is never second-guessed.

## Alternatives Considered

### Alternative A: keep the Claude file as the hub, fix the bridges

**Rejected because**: every other harness depends on prose and on a
Claude-named file; ADR-0001 keeps shared rules out of any one harness's
interfaces and in `AGENTS.md`.

### Alternative B: per-machine copies kept by hand

**Rejected because**: that is how the VM ended up with none.

### Alternative C: imports instead of generated files

**Rejected because**: Cowork skips out-of-directory imports, Claude needs
per-path escaping, OpenCode has no imports, and over a share they deliver
nothing when the host sleeps.

### Alternative D: content changes need the owner's terminal on each machine

**Rejected by the owner**: a step per machine after every edit is how copies
went stale. The location stays gated.

### Alternative E: the source in git or a dotfiles manager on each machine

**Kept as an option**: Decision 1 accepts any local path. Machine state is
kept out of `~/.config` so it never travels with a synced source.

### Alternative F: the reply language in the shared source

**Rejected because**: one project, several people, several languages.

### Alternative G: an owned `~/.claude/rules/waypost.md` instead of a block in `CLAUDE.md`

**Pros**: "one mechanism, an owned file" would be literally true for Claude.
**Rejected for now because**: on a VM whose checkouts sit under the host's
home, the host's `~/.claude/rules/` loads as an ancestor rule; with the
ancestor exclusion in place it becomes viable, and the registry can switch it.

### Alternative H: bind Codex calibration to the header digest

**Rejected because**: the header is a claim written into the file, not an
observation of what Codex read — a body that drifted under an unchanged header
would keep a calibration valid while Codex reads other text, against the
tool-surfaces and native-configuration ADRs. Deterministic rendering already
gives what it was for.

## Consequences

**Positive**:
- every installed harness on every machine reads the same owner rules, an
  edit reaches all of them by the next Waypost session on each machine, and
  `doctor --global` says so per surface or names what it could not check or
  could not deliver;
- each person gets replies in their own language on their own machine, and an
  existing choice is kept.

**Negative / trade-offs**:
- anything that can edit the source changes every agent's rules on every
  machine; the gate covers only where the source and the homes are, and
  against an agent that edits the machine state it shows rather than prevents;
- every content or language change on a machine whose Codex team calibration
  is automatic starts a new calibration cohort there (about 2.25M tokens per
  the native-configuration ADR);
- a migration of machine state on every OS, and a merge of rules that needs
  the owner;
- surfaces excluded by design get no global rules and no language;
- named exceptions: ADR-0003 prints a copy step for home directories — this
  writes there, gated for install and ungated for every re-render; ADR-0008 —
  the header, the language line and the while-unset instruction are standing
  Waypost text with a size test, and the owner's rules (about 20 KB today) are
  standing context in every harness; the disk-hygiene ADR's machine state
  directory moves on every OS;
- language is per OS account, not per person.

**What changes in code / process**:
- `machineStateDir()` → `~/.local/state/waypost`, with migration (WP-18, planned);
- ADR-0005 amendment, registry `global_rules`, a shipped-only loader (planned);
- `scripts/rules.mjs` (planned): `waypost rules source|where|install|uninstall --global`,
  `waypost rules history|diff`, `waypost rules language <code>`;
- `waypost doctor --global`, the project-doctor warning, `brief` refresh,
  notices and `--no-install` (planned);
- the Codex surface hashing instruction files at thread start and after drain (planned);
- `AGENTS.md` CLI table and `docs/harnesses.md`.

## Verification

- Hermetic tests: a project override of `global_rules` or a detection input
  is dropped and reported; a config home from the environment that differs
  from the recorded one is reported and not written; a home inside a work tree
  is refused; AppData, network and symlinked targets are refused; the gate
  refuses from inside a harness; no rule content appears in agent-visible
  output; appended content survives install, re-render, fix and uninstall;
  drift is never overwritten and is reported by `brief`; an empty or
  unreadable source propagates nothing; a smaller source propagates after two
  agreeing refreshes; an unchanged source leaves the Codex file byte-identical;
  `settings.json` keeps every other key and an unparsable one is untouched; a
  native language Waypost did not write is never changed; the machine-state
  migration keeps the run budget, cleanup limit and live slots, and a budget
  left only in the old root refuses live runs; concurrent renders and an
  `EPERM` target leave consistent state; with the source host unreachable,
  `brief` and `doctor` return within their deadlines; an `auto` never replaces
  `explicit` or `native`; a Waypost-launched run records nothing; an invalid
  code renders nothing; setting or unsetting the language changes no project
  file.
- Live (runbook): on `FROSTBEBE`, `rules language` from the Claude app, the
  Codex app and a terminal resolve to one file, and the gate refuses from the
  Codex app; on the Linux VM, a session in a project under the host's home
  lists no host file.

## Review history

- 2026-10-13, critic pass 1: rework — wrong inventory; symlink-first could
  repeat the silent failure; project overrides could choose write targets;
  doctor issue too strict; language auto-recording unsound.
- 2026-10-13, critic pass 2: rework — PATH-only detection finds nothing on the
  VM; imports fail on Cowork; owner gate undefined; local/remote by path syntax.
- 2026-10-13, critic pass 3: rework (targeted) — MSIX virtualization of
  AppData; ancestor `CLAUDE.md` on VMs; content propagation undefined (owner
  chose automatic); auto-language from scripted sessions; Cowork claim wrong.
- 2026-10-13, critic pass 4: accept after small edits — "interactive only" by
  environment; propagation risks not contained; machine state split; Codex
  digest; story ordering; Agent SDK default; ancestor list; sandbox and
  concurrency. Also found the repo's own `.claude/CLAUDE.md` import broken.
- 2026-10-13, critic pass 5: revise — the state move had no migration and
  would drop the run budget (blocking); an existing native language would be
  overwritten (blocking); Codex header binding unsound (rejected, Alternative
  H); environment-chosen config homes; launchers' marker for language;
  bad-source guard and drift recovery; surfaces excluded by design; remote
  reads hanging `brief`; first story over-scoped.
- 2026-10-13, critic pass 6: accept after small edits — the state move assumed
  one old root, while on Windows every packaged harness has its own (blocking,
  fixed in Decision 1); the subagent observation was confounded by the session
  starting before the file existed (Context corrected); the Codex re-hash
  window and the Windows ancestor walk (Decision 5). Implementation detail
  from this pass — lock separation, Windows `EPERM`, debounce numbers,
  language flip-flops and unmappable native values, test isolation, the Codex
  sandbox — is carried as tasks and criteria in the stories.

## References

- ADR-0001 harness-agnostic core; ADR-0003 agent roles; ADR-0005 harness
  registry; ADR-0008 token budget; the tool-surfaces, native-configuration,
  cleanup-limit, disk-hygiene and run-budget ADRs.
- Epic WP-22 and its stories' Technical Notes: the 2026-10-13 evidence from
  `FROSTBEBE`; WP-18 (machine state move); WP-19 (project import).

---

*Last updated: 2026-10-13*
