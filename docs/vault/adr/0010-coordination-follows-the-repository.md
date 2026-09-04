---
type: adr
id: "ADR-0010"
title: "Coordination follows the repository: presence and leases in the git common dir"
status: accepted
date: 2026-09-04
authors: ["Ivan Morozov"]
tags: []
external_refs: {}
supersedes: null
superseded_by: null
code_refs: ["scripts/presence.mjs (planned)", "scripts/sessions.mjs (planned)", "scripts/lib.mjs (planned)", "scripts/commit.mjs (planned)", "bin/waypost (planned)", "tests/presence.test.mjs (planned)"]
review_status: reviewed
reviewed_at: 2026-09-04
deciders: "Ivan Morozov (project owner); approved 2026-09-04 by delegation after the fresh-context critic pass"
related: "ADR-0004 (vault service files stay upstream-compatible), ADR-0006 (commit protocol), ADR-0007 (presence, leases, network drives), `scripts/presence.mjs`"
---
# ADR-0010: Coordination follows the repository: presence and leases in the git common dir

| Field | Value |
|---|---|
| **Status** | accepted |
| **Date** | 2026-09-04 — revised the same day after a fresh-context critic pass |
| **Deciders** | Ivan Morozov (project owner); approved 2026-09-04 by delegation after the fresh-context critic pass |
| **Supersedes** | — |
| **Superseded by** | — |
| **Related** | ADR-0004 (vault service files stay upstream-compatible), ADR-0006 (commit protocol), ADR-0007 (presence, leases, network drives), `scripts/presence.mjs` |

---
## Context

ADR-0007 keeps a session's presence record (which carries its story claim) and
its leases in `<vault>/.projectstore/`, an untracked directory inside the
vault. That was the right place for the case it was written for: a vault on a
synchronised drive, where the directory itself carries the records between
machines.

The dominant way to run several coding agents in 2026 is a git worktree per
agent: every orchestrator in the field survey isolates agents that way, and
the harnesses themselves offer it. A worktree has its own untracked files.
With the vault inside the repository, every worktree therefore has its own
`.projectstore/`, and two sessions in two worktrees of one repository do not
see each other at all: no claims, no leases, no presence. The one situation
Waypost's coordination exists for — parallel work on one codebase — is exactly
the one where it goes blind. Worse, `git clean -xfd`, a routine command in a
worktree, deletes `<vault>/.projectstore/` outright, since the directory's own
`*` gitignore makes it ignored.

A linked worktree has a second, prior problem the critic pass measured: it is
not even bound. `.waypost/projectstore.json` is machine-local and gitignored
by contract, so `waypost sessions` in a fresh `git worktree add` answers "no
bound vault". Moving records without solving that would be the second half of
a fix whose first half is missing.

The shared-checkout addendum to ADR-0007 covers two sessions in one working
copy. This decision covers many working copies of one repository.

## Decision drivers

- No server, no daemon: coordination stays in files that already exist.
- Sessions of one repository see each other whatever the checkout layout:
  one working copy, several worktrees, a checkout shared between machines.
- Nothing already working stops working — in both directions of a mixed
  version window, and for upstream ProjectStore reading the same vault
  (ADR-0004).
- Advisory semantics unchanged: this moves records, it does not turn them
  into locks.
- Migration without a flag day.

## Considered options

### Option 1: the git common dir (chosen)

**Binding first.** A linked worktree inherits the main worktree's binding:
when `<project>/.waypost/projectstore.json` is absent and the project root is
inside a git repository, `readConfig` reads
`<main worktree>/.waypost/projectstore.json` instead, where the main worktree
is the parent of the repository's common dir. Its relative `vault_path`
(stored relative since 0.12.0) resolves against the *linked* worktree's own
root, so each worktree works on its own copy of the vault files while sharing
coordination. `waypost setup` in a linked worktree is therefore unnecessary,
and `waypost status` says which worktree the binding came from. The per-host
observation cache (`.waypost/state/peers.<host>.json`) stays per worktree; it
is a cache keyed by session, and a worktree that starts from nothing only pays
first sight once.

**Then the records.** `git rev-parse --path-format=absolute --git-common-dir`,
spawned with `cwd: projectRoot()` (git ≥ 2.31; the CWD-relative default form
of that command answers relative to the caller's directory and is not used),
names the one `.git` directory every worktree of a repository shares.
Presence and leases move to `<common-dir>/waypost/<vault-key>/{presence,leases}/`
when the **project root** — not the vault — is inside a git repository.
`<vault-key>` is the vault's path relative to the repository root
(`docs-vault` for `docs/vault`), so two bound subprojects of one monorepo keep
separate coordination while two worktrees of one repository, whose vault
sits at the same relative path, share it. A vendored repository inside another
resolves to its own `.git`, which is the repository whose worktrees can share.

**The legacy session registry does not move.** `<vault>/.projectstore/sessions/`
is read and written by unmodified upstream ProjectStore on a shared vault
(`scripts/lib.mjs` above `sessionsDir` says so, and AGENTS.md forbids renaming
vault service files). Claims live in presence records, not there, so nothing
this decision needs is lost by leaving it.

**Where the rule does not apply.** Vault outside any repository, project not a
repository, `git` absent or failing, a bare repository (`git rev-parse
--is-bare-repository` says so; with `--path-format=absolute` the common dir of a
bare repository is its own path, not `.`): the ADR-0007 location
`<vault>/.projectstore/` stays, since there
the vault directory is the channel and often the synchronised one.
`coordination_dir` in the **main worktree's** `.waypost/projectstore.json`
overrides both rules for the rare arrangement neither fits (a vault inside a
repository that is synchronised by folder rather than by git); linked
worktrees inherit it with the binding, so two worktrees can never disagree.

**Migration, both directions.** For one minor version every writer writes
presence and leases to both locations and every reader merges both; the merged
read is keyed by location and session, prefers the new location when both
hold the same session, and `--prune` reaps in both. A session on the previous
version therefore still sees a new session's claim and lease — "nothing already
working stops working" holds for the older peer too, which a dual-read-only
migration would not give. After that version writers use the new location
only and the old directory is left to `--prune`.

**Identity across worktrees.** A session id that arrives from the environment
(`WAYPOST_SESSION_ID` exported as a constant by a wrapper, ADR-0006) would make
two live worktrees write one presence file and one lease name. In a linked
worktree such an id is qualified with a short hash of the worktree path, once,
deterministically; ids derived by `bin/waypost` itself are already per
session. `doctor` reports one id beating from two project roots.

**The shared-checkout signal is corrected in the same change.** ADR-0007's
addendum reads "same vault offset inside the checkout" as "same checkout",
which is true only while records arrive through the checkout. Once they arrive
through `.git`, the rule is: same common dir and a different project root is a
*sibling worktree* (named as such, never "shared checkout", never a `--all`
refusal); same common dir, same project root and another host is a shared
checkout as before. The vault-offset signal is retired, not kept beside the
new one. A lease from a sibling worktree on a path this worktree edits is
reported as a merge conflict on its way — advisory as ever.

**Pros:** every worktree of one repository sees one set of records; a fresh
worktree needs no setup; nothing to run; the shared-drive channel of ADR-0007
is untouched where it is used; `.git/waypost/` survives `git clean -xfd`,
`git worktree prune` and `git gc` (verified by the critic pass), which
`<vault>/.projectstore/` does not.
**Cons:** one more place to look for a human (`waypost storage` names it); a
vault carried to another repository leaves its live records behind — correct,
since they describe sessions, not artifacts; a linked worktree's `.git` file
holds an absolute gitdir, so a *linked* worktree of a checkout mounted under
different paths on two machines does not resolve (the main working copy does).

### Option 2: a tracked directory in the repository

**Pros:** records travel with `git push`.
**Cons:** every beat is a commit or a dirty tree; records go stale the moment
they are committed; conflicts in files that mean "now". Rejected.

### Option 3: per-worktree records plus a hub file listing worktrees

**Pros:** no move.
**Cons:** the hub itself has to live somewhere shared — which is the common
dir — and every reader walks N directories. Strictly more machinery for the
same information. Rejected.

### Option 4: an OS temp directory keyed by repository identity

**Pros:** nothing inside the repository.
**Cons:** gone on reboot, invisible across a shared mount, and the identity
key is a new invention. Rejected.

## Decision

Take option 1 as written above: binding inherited by linked worktrees;
presence and leases in `<common-dir>/waypost/<vault-key>/` when the project
root is in a repository, the ADR-0007 location otherwise, `coordination_dir`
in the main worktree's config overriding both; the legacy session registry
stays in the vault; dual-write and dual-read for one minor version; ids from
the environment qualified per linked worktree; the shared-checkout rule
corrected in the same change; `waypost storage` names the directory in use and
classifies *it*, not the vault, for the presence lag estimate.

## Consequences

### Positive

- Two agents in two worktrees of one repository see each other's claims,
  leases and presence within one command, with no setup in the second
  worktree.
- Orchestrators that isolate by worktree get Waypost's coordination without
  integration: a shared `.git` is all they have.
- Coordination records stop being collateral of `git clean`.
- The ADR-0007 model is intact where it applies; this is a change of address,
  not of protocol.

### Negative / risks

- Windows worktrees and a `.git` on a cloud drive are not measured; WP-15
  carries a measurement story that runs before anything moves, by hand on the
  owner's machines since CI is Linux only.
- A vault inside a repository whose *folder* is synchronised (not its git)
  loses the cross-machine channel unless `coordination_dir` points back at the
  vault. Documented, and `waypost storage` says which directory is in use.
- For one version every beat is two writes. Cheap, and temporary.
- Two bound subprojects of one monorepo with the same vault-relative path in
  different worktrees are indistinguishable by design: they are the same
  project.

## Verification and follow-up

- Critic pass 2026-09-04 (fresh context, Opus): verdict *revise*; the
  findings folded in above — unbound linked worktrees, dual-read-only
  migration, the legacy registry and ADR-0004, the shape of
  `--git-common-dir` across layouts, the resolution origin, the invalidated
  shared-checkout signal, constant session ids, the cache keyed by session.
- Tests: `git worktree add` then `waypost sessions` with no setup; two
  worktrees see each other's presence, claim and lease; a sibling worktree is
  named as such and never as a shared checkout; a vault outside a repository
  keeps `.projectstore/`; a bare repository and a missing `git` fall back;
  `coordination_dir` in the main worktree wins and a linked worktree inherits
  it; `--git-common-dir` resolved from a subdirectory project root; a nested
  repository resolves to the inner `.git`; two monorepo subprojects get two
  keys; records in the old location are read, written and reaped for one
  version; one session id present in both locations is read once; a constant
  `WAYPOST_SESSION_ID` in two worktrees yields two records; the legacy
  registry stays where upstream reads it.
- Live: two sessions in two worktrees, `waypost sessions` from each; a
  measurement of Windows worktrees and a cloud-drive `.git` before the move.
- Measured 2026-09-04 on macOS 26 (Darwin 25.6.0), git 2.50.1 (Apple Git-155), with the
  runbook "Measure the git common dir across checkout layouts" (`docs/vault/ops/`):

| Layout | `--path-format=absolute --git-common-dir` from the project root | Note |
|---|---|---|
| main working copy, at root | `<main>/.git` | |
| main working copy, from a subdirectory | `<main>/.git` | the relative form answers `../../.git` relative to the caller's directory, hence `--path-format=absolute` and `cwd: projectRoot()` |
| linked worktree | `<main>/.git` | its own `.git` is a file: `gitdir: <main>/.git/worktrees/<name>` — an absolute path |
| main worktree of a linked one | `dirname(common dir)` | the main worktree's `.waypost/projectstore.json` is reachable from there: yes |
| bare repository | `<bare>` itself | not `.`: the fallback keys on `git rev-parse --is-bare-repository`, never on the answer's shape |
| nested repository, from the inner one | `<inner>/.git` | the inner repository wins; a vendored repo coordinates alone |
| not a repository | `fatal: not a git repository` (exit 128) | the ADR-0007 location stays |

  Windows and a cloud-drive `.git`: not measured yet (the runbook says how).
