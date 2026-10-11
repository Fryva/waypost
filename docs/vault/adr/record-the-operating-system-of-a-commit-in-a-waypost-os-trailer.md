---
type: adr
id: "record-the-operating-system-of-a-commit-in-a-waypost-os-trailer"
title: "Record the operating system of a commit in a Waypost-OS trailer"
status: proposed
date: 2026-10-11
authors: ["Ivan Morozov"]
tags: ["commit-protocol", "attribution", "team"]
external_refs: {}
supersedes: null
superseded_by: null
review_status: pending
reviewed_at: null
drafted_by: {"harness":"claude","provider":null,"date":"2026-10-11"}
guards: []
code_refs: ["scripts/commit.mjs", "scripts/presence.mjs", "tests/commits.test.mjs", "bin/waypost", "AGENTS.md", "docs/how-it-works.md", "skills/waypost-commit/SKILL.md"]
related: "ADR-0006, ADR-0010"
---

# Record the operating system of a commit in a Waypost-OS trailer

| Field | Value |
|---|---|
| **Status** | proposed |
| **Date** | 2026-10-11 |
| **Authors** | Ivan Morozov |

---

## Context

[[0006-commit-protocol]] fixes the trailers every `waypost commit` writes:
`Waypost-Harness`, `Waypost-Session`, `Waypost-Story`, `Waypost-Provider`. On
2026-10-01 the owner asked for a log of each participant's actions that shows what
was done, under which harness and on which operating system, because the project is
meant to be used by several developers on different machines ([[0001-harness-agnostic-core]]).

The live layer knows the operating system, but only locally: a presence heartbeat
records `os` as `<platform>-<major release>` (`selfDescriptor`, `scripts/presence.mjs`)
and `brief`/`sessions` print it; leases store `platform()` alone. Presence lives in
`.git/waypost/` and is never pushed ([[0010-coordination-follows-the-repository]]), so
developers on other machines never see it, and once a session ends nothing durable
says which system produced a commit. `Waypost-Session` does not carry it either: it
comes from harness or terminal ids first; the `<host>-<ppid>` form is a last resort,
and none of the 26 session values in this repository's history has a host or an OS.

## Decision drivers

- The commit history is the durable, shared, git-native record ([[0006-commit-protocol]]).
- One computation of the value, shared by presence and commit.
- Coarse enough to publish; the publication is new and is accepted as such.
- Old commits and commits made outside `waypost commit` stay valid.

## Decision

1. `waypost commit` adds one trailer, after `Waypost-Session`: `Waypost-OS: darwin-27`.
2. **The value** is presence's: `<os.platform()>-<major of os.release()>`, computed by
   one exported helper (`osTag()` in `scripts/presence.mjs`) that `selfDescriptor` and
   commit's `main()` both use. `composeMessage` stays pure and takes `os` as an input,
   like `provider`. What the value means per platform:

   | Platform | Example | What the major tells |
   |---|---|---|
   | macOS | `darwin-27` | the Darwin kernel major, which tracks macOS releases (not the marketing version) |
   | Linux | `linux-6` | the kernel major only; every distribution, and WSL2 or a container on another host, reports the guest kernel |
   | Windows | `win32-10` | per Node's docs `os.release()` is `10.0.<build>`, so Windows 10, 11 and current Server all read `win32-10` — **not measured** |

3. **Opt-out**: `WAYPOST_OS` overrides the value; set and empty, it omits the trailer —
   the same environment convention as `WAYPOST_HARNESS` and `WAYPOST_PROVIDER`.
4. **Never required**, as for every Waypost trailer ([[0006-commit-protocol]] "not
   forbidden"): a commit without it is valid, and `waypost log`'s untagged rule (no
   Harness and no Session) stays as it is — a hand-made commit carrying only
   `Waypost-OS` rightly counts as made outside `waypost commit`.
5. **`waypost log`** shows it, adds `os` to `--json`, and filters with `--os <text>`
   (substring of the value; `darwin`, `linux`, `win32` — `--os macos` matches nothing,
   and the help says so).
6. **Scope**: Host publications of protocol-2 team work are out of scope. Their trailer
   set is pinned by the reservation's `commit_message_digest`, so adding the OS there is
   a protocol-2 contract change for a separate decision; `waypost log --os` does not
   match integrated team work.
7. **Amendment, not supersession**: on acceptance ADR-0006's trailer block and its list
   of log filters get an "*Amended by [[record-the-operating-system-of-a-commit-in-a-waypost-os-trailer]]*"
   note; ADR-0006 stays accepted (superseding it would orphan its merge driver, claims
   and session identity). This follows the project's practice for partial amendments.

The value records where a commit was made, not that the change was tested on that
system, or only there. A rebased, amended or cherry-picked message keeps the original
value.

## Rationale

1. The owner's requirement (what, which harness, which OS) is otherwise met only by a
   local, ephemeral record that other machines never see.
2. This adds one new published datum — the platform and kernel major of the committing
   machine — to anyone who can read the remote. It is accepted because it is coarse,
   and the opt-out covers a contributor who does not want it.
3. A trailer keeps git's own tools working (`git log --format=%(trailers:key=Waypost-OS)`
   parses it; checked with git 2.54).

## Alternatives Considered

### Platform only (`darwin`, `linux`, `win32`), as leases store

**Pros**:
- Smallest fingerprint; no misleading majors on Linux and Windows.

**Cons**:
- Loses the Darwin major, which separates macOS releases whose behaviour differs.

**Rejected because**: (proposed) the Darwin major is the one part with diagnostic value
and costs little; the owner decides this at acceptance.

### A richer value (distribution, version, architecture)

**Pros**:
- More precise reproduction.

**Cons**:
- More identifying, churns with updates, diverges from presence.

**Rejected because**: coarse grouping is the purpose.

### Git notes instead of a trailer

**Pros**:
- Publishing is opt-in; commit ids do not change.

**Cons**:
- Notes are not fetched or pushed by default and are lost by most hosting views.

**Rejected because**: consistency with ADR-0006's trailers and git-native reading.

### Keep the OS only in presence

**Rejected because**: lost when the session ends and never visible to other machines.

## Consequences

**Positive**:
- Each `waypost commit` records harness, session, OS and story together.

**Negative / trade-offs**:
- A new published datum (see Rationale 2); the message grows by one line.
- `win32-10` and `linux-6` group coarsely; Windows is not measured.

**What changes in code / process**:
- `osTag()` in `scripts/presence.mjs`; `composeMessage(…, { os })`; commit `main()` reads
  `WAYPOST_OS`; `waypost log` column, `--json` field and `--os` filter.
- The lists of trailers and log flags in `scripts/commit.mjs` (header and usage),
  `bin/waypost` help, `AGENTS.md`, `docs/how-it-works.md`, `README.md` (which already
  omits `Waypost-Provider`) and `skills/waypost-commit/SKILL.md`.
- An ADR-0011 guard: `{"require": "Waypost-OS", "in": "scripts/commit.mjs", "why": "the commit protocol writes the OS trailer"}`.
- The "Amended by" note in ADR-0006 on acceptance.

## Verification

- `tests/commits.test.mjs`: trailer-block tests inject a fixed `os`; one test compares a
  real `waypost commit` with `osTag()`; `WAYPOST_OS=""` omits the trailer and an override
  is written as given; git's parser reads it; `waypost log --os` filters and `--json`
  carries `os`; a commit without it still lists and counts as tagged.

## Open questions for the owner

- Platform-and-major (proposed) or platform only.
- Whether the opt-out should exist (proposed: yes, `WAYPOST_OS=""`).

## References

- [[0006-commit-protocol]]
- [[0010-coordination-follows-the-repository]]
- Critic pass 2026-10-11 (waypost-critic, revise → this revision).

---

*Last updated: 2026-10-11*
