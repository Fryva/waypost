# ADR-0010: Coordination follows the repository: runtime state in the git common dir

- Status: proposed
- Date: 2026-09-04
- Deciders: not approved by the project owner; status `proposed`
- Supersedes: —
- Superseded by: —
- Related: ADR-0006 (commit protocol), ADR-0007 (presence, leases, network drives), `scripts/presence.mjs`
- code_refs: ["scripts/presence.mjs (planned)", "scripts/sessions.mjs (planned)", "scripts/lib.mjs (planned)", "scripts/commit.mjs (planned)", "tests/presence.test.mjs (planned)"]

## Context

ADR-0007 keeps a session's presence record, its leases and its story claim in
`<vault>/.projectstore/`, an untracked directory inside the vault. That was the
right place for the case it was written for: a vault on a synchronised drive,
where the directory itself is what carries the records between machines.

The dominant way to run several coding agents in 2026 is a git worktree per
agent: every orchestrator in the field survey isolates agents that way, and the
harnesses themselves offer it. A worktree has its own untracked files. With the
vault inside the repository, every worktree therefore has its own
`.projectstore/`, and two sessions in two worktrees of one repository do not
see each other at all: no claims, no leases, no presence. The one situation
Waypost's coordination exists for — parallel work on one codebase — is exactly
the one where it goes blind.

The shared-checkout addendum to ADR-0007 (2026-09-04) covers the opposite
arrangement, two sessions in one working copy. This decision covers many
working copies of one repository.

## Decision drivers

- No server, no daemon: coordination stays in files that already exist.
- Sessions of one repository see each other whatever the checkout layout:
  one working copy, several worktrees, a checkout shared between machines.
- Nothing already working stops working: the synchronised-vault case of
  ADR-0007 keeps its channel.
- Advisory semantics unchanged: this moves records, it does not turn them
  into locks.
- Migration without a flag day: records written by the previous version are
  still read for one minor version.

## Considered options

### Option 1: the git common dir (chosen)

`git rev-parse --git-common-dir` names the one `.git` directory every worktree
of a repository shares (`.git` in the main working copy; a worktree's own
`.git` is a file pointing there). Runtime coordination moves to
`<common-dir>/waypost/{presence,leases,sessions}/` whenever the vault lives
inside a git repository. It is untracked by construction, machine-local to the
checkout family, and shared by every worktree of it. A checkout shared between
two machines shares its `.git` too, so the shared-checkout case keeps working
unchanged.

When the vault is outside any repository, or the project is not a git
repository, the ADR-0007 location `<vault>/.projectstore/` stays: there the
vault directory is the channel, and often the synchronised one.

`coordination_dir` in `.waypost/projectstore.json` overrides the choice for the
rare arrangement neither rule fits (a vault inside a repository that is
synchronised by folder rather than by git).

**Pros:** every worktree of one repository sees one set of records; nothing to
run; the shared-drive channel of ADR-0007 is untouched where it is used;
`git worktree remove` does not lose anyone's records, and `git worktree prune`
never touches them.
**Cons:** one more place to look for a human; the `.git` directory is not the
vault, so a vault carried to another repository leaves its live records
behind — which is correct, since they describe sessions, not artifacts.

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

Take option 1. `waypost` resolves the coordination directory once per command:
the git common dir when the vault is inside a repository, the vault otherwise,
`coordination_dir` when set. Presence, leases and the legacy session registry
all move together. For one minor version readers merge records from the old
location, `--prune` reaps in both, writers use only the new one; the old
directory is then left to `--prune`. The shared-checkout signal of ADR-0007
gains a sibling: a live peer whose common dir is ours, seen from another
worktree, is listed as such, and a lease on a path from another worktree is
reported as "a merge conflict on its way", advisory as ever.

## Consequences

### Positive

- Two agents in two worktrees of one repository see each other's claims,
  leases and presence within one command.
- Orchestrators that isolate by worktree get Waypost's coordination for free:
  they need no integration, only a shared `.git`.
- The ADR-0007 model is intact where it applies; this is a change of address,
  not of protocol.

### Negative / risks

- The behaviour of a git common dir on Windows and on synchronised drives is
  not measured yet; the first story of the epic measures it before anything
  moves.
- A vault inside a repository whose *folder* is synchronised (not its git)
  loses the cross-machine channel unless `coordination_dir` points back at the
  vault. Documented, and `waypost storage` says which directory is in use.
- For one version, two locations hold records; a reader that forgets one
  reports a session as absent. Covered by tests for both directions.

## Verification and follow-up

- Tests: two worktrees of one temporary repository see each other's presence,
  claim and lease; a shared-drive vault outside a repository keeps its
  `.projectstore/`; `coordination_dir` wins over both rules; records in the old
  location are read and reaped for one version; `waypost storage` names the
  directory in use.
- Live: two sessions in two worktrees, `waypost sessions` from each.
- Not verified at the time of writing: Windows worktrees, a `.git` on a cloud
  drive.
