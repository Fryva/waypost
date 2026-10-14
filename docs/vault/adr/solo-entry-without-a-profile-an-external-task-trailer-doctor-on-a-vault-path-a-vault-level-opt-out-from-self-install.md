---
type: adr
id: "solo-entry-without-a-profile-an-external-task-trailer-doctor-on-a-vault-path-a-vault-level-opt-out-from-self-install"
title: "Solo entry without a profile: an external task trailer, doctor on a vault path, a vault-level opt-out from self-install"
status: accepted
date: 2026-10-14
authors: ["Ivan Morozov"]
tags: []
external_refs: {}
supersedes: null
superseded_by: null
review_status: reviewed
reviewed_at: 2026-10-14
drafted_by: {"harness":"claude","provider":null,"date":"2026-10-14"}
guards: []
---

# Solo entry without a profile: an external task trailer, doctor on a vault path, a vault-level opt-out from self-install

| Field | Value |
|---|---|
| **Status** | accepted |
| **Date** | 2026-10-14 |
| **Authors** | Ivan Morozov |

---

## Context

On 2026-10-14 a solo Claude Code user declined Waypost as too heavy, and named
the two parts worth taking: the deterministic integrity check (`doctor`) and
commit trailers carrying the task id. Their tasks live in YouTrack.

What stands in the way today, checked against the code:
1. `waypost commit --story PROJ-123` exits 1 with `no story matches` with or
   without a vault (`scripts/commit.mjs:204-207`, `scripts/lib.mjs:1050-1052`).
   That rejection is deliberate: ADR-0006 turns a typo in a vault story id into
   an error (`tests/commits.test.mjs:154-166`).
2. `waypost doctor --vault` on a fresh clone or in CI exits 1 with "No usable
   vault" until `waypost bind` writes the machine-local binding
   (`scripts/doctor.mjs:2139-2147`).
3. The first `waypost brief` in a bound checkout installs the running harness's
   roles, skills and routing block (`bin/waypost.mjs:3620-3661`). The opt-out,
   `--no-install` or `WAYPOST_NO_INSTALL`, lasts one invocation on one machine.
4. The README presents trailers only as multi-agent coordination, and doctor as
   one item among many.

A first draft proposed a full solo profile (no roles, presence or team code).
Its critic pass found that it broke accepted decisions (ADR-0006 typo rejection;
the routing block carrying the heavy-work rule, WP-18; the fail-closed team
gate), that a profile in the gitignored binding does not reach a clone, and that
the runtime savings were about 30 ms per command. This ADR keeps the smallest
change that answers the request; the profile is deferred.

## Decision

1. **An external task id goes in its own trailer.** `waypost commit --task <id>`
   writes `Waypost-Task: <id>`. The id is not looked up anywhere; it must match
   the allowlist `^[A-Za-z0-9][A-Za-z0-9._#/-]{0,63}$`, and `--task` with no value
   or with a flag as its value is an error. `--task` may repeat, one trailer
   line per id. `--story` keeps its ADR-0006 lookup and rejection unchanged;
   both flags may be given at once. `waypost log --task <id>` matches an id
   exactly (`PROJ-12` does not match `PROJ-123`).
2. **`doctor --vault <path>` checks a vault without a binding.** When the token
   after `--vault` is not a flag, doctor uses it as the vault directory and
   needs no `.waypost/projectstore.json`. The generators doctor spawns to
   compare derived views (kanban, code map, graph) receive the same vault, so
   a stale view is an issue exactly as with a binding — a path mode that skips
   or softens those checks would be a false green gate. The layout defaults to
   `engineering`; a directory with none of the layout's folders is an issue,
   as is a path that does not exist. `--vault` alone keeps today's behaviour,
   including the issue on a fresh clone.
3. **The vault can turn self-install off.** `"self_install": "off"` in
   `<vault>/.projectstore.json` — the committed vault policy file — makes
   `waypost brief` behave as with `--no-install` in every clone. The routing
   block, roles and skills are installed only by an explicit
   `waypost setup` / `agents install` / `agents register` / `skills install`.
   `off` and boolean `false` are accepted case-insensitively; a missing key
   means today's behaviour; any other value is a `doctor` warning (as for
   `acceptance_gate`), and an unreadable vault config means "do not install".
   With it off, `next` and `doctor` stop recommending role installation.
   `waypost bind --self-install off` writes the key (merging, never dropping
   other policy keys), so the opt-out can be set before the first `brief`.
4. **The README opens a solo path** in this order: `bind --self-install off`,
   `.waypost/` in `.gitignore`, `doctor --vault <path>` in CI, `commit --task` —
   ahead of the team material, stating the first release that has them.

Nothing else changes: presence, leases, team code and the routing block
behave as before.

## Rationale

1. A separate trailer leaves ADR-0006 intact: a vault story id is still
   validated, an external id is explicitly external, and an epic id like
   `WP-23` never collides with a tracker id.
2. A path argument is the usual CLI shape for checking something that is not
   configured, and it makes a CI gate a single command.
3. The vault config already travels with git and carries policy
   (`acceptance_gate`); an opt-out stored there reaches every clone, which a
   flag, an environment variable or the binding cannot.
4. All four are additive: no existing invocation changes its output.

## Alternatives Considered

### Amend ADR-0006: accept a bare id matching a configured pattern in `--story`

**Pros**:
- one flag instead of two

**Cons**:
- a typo that happens to match the pattern passes silently; needs a pattern in
  config before it works; epic ids collide with tracker ids

**Rejected because**: it weakens an accepted guarantee to save one flag.

### A full solo profile (first draft)

**Pros**:
- one switch covering install footprint and runtime

**Cons**:
- conflicts with three accepted decisions; the runtime half saves ~30 ms;
  profile placement unsolved

**Rejected because**: deferred until a measured need; this ADR covers the request.

### Store the opt-out in the binding or an environment variable

**Pros**:
- no change to the vault config

**Cons**:
- a fresh clone or a second machine still self-installs on its first `brief`

**Rejected because**: the opt-out must reach every clone.

## Consequences

**Positive**:
- the two parts the user wanted work without the rest
- CI runs `waypost doctor --vault docs/vault` with no setup step
- a solo repository never gains role or skill files it did not ask for

**Negative / trade-offs**:
- two task-like trailers (`Waypost-Story`, `Waypost-Task`) to explain
- with self-install off, a harness joining later is not set up automatically
  (the WP-14 / "setup asks the running harness" convenience), which is the
  point of the opt-out
- with self-install off and no block registered, the routing block's rules
  (artifact before editor, heavy work through `waypost run --heavy`) do not
  reach that project's agents (WP-18 D3); the README tells anyone who runs
  builds through agents to `waypost agents register` once
- an older CLI ignores `--task` and the path after `--vault` silently; the
  README names the minimum version

**What changes in code / process**:
- `scripts/commit.mjs`: `--task`, trailer, `log --task`
- `scripts/doctor.mjs`: `--vault <path>`, vault passed to the generator children,
  `self_install` value check, no role-install advice when off
- `bin/waypost.mjs`: `selfInstall` reads `self_install`; `bind --self-install off`
  (first caller of `writeVaultConfig`); `next` stops advising role install when off
- `README.md`: the solo path
- tests for each

## References

- ADR-0006 (trailers, typo rejection)
- WP-23 "Solo entry: one person, one harness"
- `docs/vault/adr/setup-asks-the-running-harness-not-only-the-projects-files.md`

---

*Last updated: 2026-10-14*
