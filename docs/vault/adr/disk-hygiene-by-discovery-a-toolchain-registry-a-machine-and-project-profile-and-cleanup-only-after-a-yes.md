---
type: adr
id: "disk-hygiene-by-discovery-a-toolchain-registry-a-machine-and-project-profile-and-cleanup-only-after-a-yes"
title: "Disk hygiene by discovery: a toolchain registry, a machine and project profile, and cleanup only after a yes"
status: accepted
date: 2026-09-14
authors: ["Ivan Morozov"]
tags: []
external_refs: {}
supersedes: null
superseded_by: null
review_status: reviewed
reviewed_at: 2026-09-14
drafted_by: {"harness":"claude","provider":null,"date":"2026-09-14"}
code_refs: ["toolchains/", "scripts/toolchains.mjs", "scripts/sizes.mjs", "scripts/cleanup.mjs (planned)", "scripts/doctor.mjs", "scripts/presence.mjs", "bin/waypost", "prompts/cleanup.md (planned)", "docs/toolchains.md", "tests/sizes.test.mjs", "tests/toolchains.test.mjs", "tests/cleanup.test.mjs (planned)"]
related: "ADR-0001, ADR-0004, ADR-0005, ADR-0007, ADR-0008, ADR-0011"
guards: [{"forbid": "\\b(rmSync|unlinkSync|rmdirSync|rm|unlink|rmdir)\\(", "in": "scripts/sizes.mjs", "why": "the scan only measures"}, {"forbid": "[\"'`](rm|rmdir|rd|del)[\"'` ]", "in": "scripts/sizes.mjs", "why": "no removal shelled out from the scan either"}, {"forbid": "DerivedData|plutil|xcodeproj|Library/Developer", "in": "scripts/sizes.mjs", "why": "tool knowledge lives in toolchains/*.json, never in the scanner core"}]
---

# Disk hygiene by discovery: a toolchain registry, a machine and project profile, and cleanup only after a yes

| Field | Value |
|---|---|
| **Status** | accepted |
| **Date** | 2026-09-14 |
| **Authors** | Ivan Morozov |

---

## Context

Build output and tool caches filled the owner's disk: 26 GB free on
2026-09-12, one cargo `target/` at 35 GB, another ~25 GB in custom
`CARGO_TARGET_DIR`s, and machine caches (simulators, per-OS-version device
support, stale toolchains) on top. The first remedy was a personal bash script
and a Claude Code hook on one Mac.

The owner's requirements, all from 2026-09-14:

1. It must work on any computer and from any harness, so it belongs in
   Waypost.
2. When Waypost is installed it scans the project and the machine, works out
   what can and what should be removed, and automates it: it classifies,
   removes only after a yes, audits at `waypost setup` and warns through
   `doctor` / `next`; the machine audit runs once per machine and on request.
3. Waypost is universal. It is installed on different operating systems and
   used with different development tools, so it must not be bound to Xcode or
   to the owner's projects on one Mac. After installation it gathers
   information about the system itself and builds from it the scheme of what
   it works with.
4. Verification across operating systems runs on the owner's Windows and
   Linux virtual machines, which share this checkout.

This ADR replaces two same-day drafts that were never committed — "Build
artifacts under control" (accepted, then reopened by the owner) and "Install-
time disk audit and confirmed cleanup" (proposed) — merged into one decision
at the owner's request. It also answers what went wrong in the first
implementation: Xcode knowledge in the scanner core (`plutil`, the
DerivedData folder), a flat list of default cache paths that misses any
reconfigured cache, Apple-only rules for what to remove, and constants
calibrated on one machine.

Constraints already decided: ADR-0001 (no hooks; commands are the
interface), ADR-0004 (project wiring in `.waypost/`), ADR-0005 (a harness is
data — the model for tools here), ADR-0007 (never delete what is not yours;
shared checkouts, leases, presence), ADR-0008 (standing context has a
budget), ADR-0011 (decisions check themselves; nothing a clone ships is
executed); `AGENTS.md`: pure node, no dependencies, `scripts/` compute and
print JSON, only `bin/waypost` writes, `doctor` is deterministic.

Decision drivers: universal across operating systems and tools; ask the
system instead of assuming it; tool knowledge as data; nothing a cloned
repository ships is executed; read-only by default; removal only after a yes
and never of what is in use or tracked; a deterministic `doctor`; no new
standing-context text.

## Decision

1. **A toolchain registry, as data.** `toolchains/<id>.json` ships with
   Waypost. An entry:
   - `id`, `name`, `os` (the `process.platform` values it applies to), and a
     `confidence` per OS (`verified` = exercised on that OS, `documented` =
     from the tool's docs with a `docs` URL, `inferred` = convention, with
     `notes`), as `docs/harnesses.md` defines them.
   - `detect`: executables looked up (never run) on `PATH`, through `PATHEXT`
     on Windows, and project manifests (`Cargo.toml`, `build.gradle*`,
     `*.csproj`, …).
   - `caches`: each resolved by asking the tool first (`ask`: an argv and how
     to read its output, e.g. `go env GOCACHE`, `npm config get cache`,
     `pip cache dir`), then an environment variable, then a per-OS default;
     with `regenerable`, `stale_days`, and a `clean_argv` or manual text.
   - `artifacts`: where the tool writes in a project — names relative to a
     manifest, overrides by environment or config — with `regenerable` and
     the tool's own project clean command (`cargo clean` in the manifest's
     directory).
   - `processes`: names that mean the tool is at work right now.
   - `detectors`: named checks for what is provably dead (superseded device
     support versions, unavailable simulators, a toolchain that duplicates
     another), implemented as small pure functions in
     `scripts/toolchains.mjs` and run only when their tool is detected on this
     OS.

   Xcode is one entry among the others. The conventional names every
   ecosystem uses (`build`, `dist`, `out`, `bin`, `obj`, `target`,
   `coverage`) are an entry too, `generic`. The scanner core knows no tool; a
   guard on this ADR forbids Xcode specifics in `scripts/sizes.mjs`.

   **What a project may add.** `<project>/.waypost/toolchains/<id>.json`
   describes the project's own build output, as data only: it carries `detect`
   manifests and `artifacts` — exact names or prefixes, never a pattern a
   hostile repository could use to stall the walk — that stay inside the
   project root, with `regenerable`, `stale_days` and manual text. With the id of a shipped
   entry it extends that entry's project artifacts; with a new id it adds a
   project-only entry. Any other field — `ask`, `clean_argv`, a project clean
   command, processes, detectors, anything about a machine cache — is dropped
   by the loader and reported by `waypost profile` and `doctor`. A project
   entry's artifacts are removed only when git ignores them (Decision 5).
   Everything Waypost executes, and every path outside the project it may
   remove, comes from the registry it ships: a cloned repository can change
   what is measured and labelled inside itself, never what runs or what
   outside it is removed — the perimeter ADR-0011 drew for guard commands.
2. **Discovery builds the profile — the scheme of what Waypost works with.**
   `waypost setup` (and `waypost profile --refresh`) detects the OS and
   architecture, which registry tools are present, asks each present tool for
   its cache locations (the shipped `ask` argv, no shell, a timeout each), and
   finds the project's manifests. It writes:
   - `machine.<host>.json` in the machine state directory, which follows each
     OS's convention: `$XDG_STATE_HOME/waypost` (default
     `~/.local/state/waypost`) on Linux, `~/Library/Application
     Support/Waypost` on macOS, `%LOCALAPPDATA%\Waypost` on Windows. It is
     resolved from `os.homedir()` and the environment, and is unrelated both
     to `WAYPOST_HOME` (where Waypost itself is installed) and to a project's
     `.waypost/state/` (ADR-0004). Files are keyed by host, as presence
     observations are (`peers.<host>.json`), so a home shared by two machines
     keeps two profiles. It holds the tools found with versions, the resolved
     cache paths with how each was found (asked / environment / default) and
     the date; it is refreshed when missing, older than 30 days, or on
     request.
   - `.waypost/state/project.<host>.json`, machine-local like the rest of
     `.waypost/state/` and keyed by host because one checkout can be shared by
     several machines — the ecosystems found and their artifact locations.

   `waypost profile` prints both. Profiles hold facts, not policy. Because
   `ask` comes only from the shipped registry, `--refresh` needs no
   confirmation.
3. **The scan stays read-only and tool-agnostic.** `waypost size`
   (`scripts/sizes.mjs`) keeps the walk invariants already built: an
   outermost `CACHEDIR.TAG` directory counts whole; a registry name counts
   when its entry says so, a generic name only when git ignores it and it
   holds no tracked file; symbolic links and junctions are never followed;
   breadth-first, code-unit name order, one budget for discovery, summation
   and every subprocess. Sizes are allocated bytes with each inode once; APFS
   clones are still overcounted, and on Windows, where Node reports no
   allocated blocks, file sizes are used, which overstate compressed and
   sparse files — both are reported as approximate. A path that is too long
   or unreadable is reported and the scan goes on. The names come from the
   registry and the project profile; `--global` measures the cache paths
   discovery resolved, not a fixed list. The entry budget and the charge per
   subprocess are fixed counts, the same on every machine, so `doctor` gives
   the same verdict for the same tree anywhere; the verification runs time
   them on each OS, and if one is too slow the constant is lowered for all.
4. **A classified plan.** `scripts/cleanup.mjs` computes, and never executes:
   - **keep** — in use: a running process the registry names for that tool,
     or anything modified in the last 10 minutes (where the process table is
     unavailable — Windows today — recency is the only in-use signal, and the
     report says so); under another session's lease; not regenerable.
     `regenerable` defaults to false: an entry that does not say `true` is
     never removable, and a test requires every entry to state it, so release
     archives, crash reports and model downloads stay `keep` unless their
     entry says otherwise.
   - **should** — regenerable, not in use, and idle past its `stale_days`
     (defaults: 7 for project artifacts, 30 for machine caches), or any
     regenerable project artifact while the project exceeds its limit; plus
     what a detector proves dead, with its evidence: device-support folders
     whose OS version matches no device the platform tool reports as paired
     with this machine (without that report they are at most `can`);
     simulators the platform tool reports unavailable; a toolchain that
     duplicates another at the same version.
   - **can** — regenerable and not in use but recently used.

   The project root is never an item, even when it carries `CACHEDIR.TAG`.
   When another live session reports this project (a shared checkout), project
   artifacts are at most `can`. A machine cache whose clean command reaches
   beyond its own path — a machine-wide garbage collection such as a container
   engine's prune or a package manager's cleanup of every version — is at most
   `can` and never gets a `clean_argv`: its entry carries manual instructions
   only. `scripts/cleanup.mjs` gets the same two removal guards as
   `scripts/sizes.mjs`; they join this ADR's frontmatter in the commit that
   creates the file, because a guard that selects no file is a finding of its
   own (ADR-0011).
5. **`waypost clean` removes only after a yes.**
   - Without flags it prints the plan with ids, sizes and reasons; `--json`
     gives it whole.
   - `--apply <id…>` or `--apply should` removes exactly those; `keep` is
     refused, `can` only by id.
   - The yes: when a person is at the terminal and no harness is detected
     (the detection `waypost commit` uses), it lists the items and total and
     asks `[y/N]`, answering no after 60 s. When a harness is detected or there
     is no terminal, it never prompts and requires `--yes --reason "<who
     agreed, when>"`; an agent passes them only after the user agreed in the
     conversation (`prompts/cleanup.md`).
   - Every apply is logged to `cleanup.<host>.jsonl` in the machine state
     directory: time, session, harness, the yes (terminal, or the reason
     given), items, sizes and results.
   - Right before its own removal each item is classified again and checked
     with `lstat`; one that changed, or is now a symbolic link or junction, is
     skipped with the reason and never removed through.
   - A project item is removed from the project or worktree being cleaned
     (`git -C <root>`), and nothing that holds a tracked file or a nested
     repository is removed by any route. The route: the toolchain's own clean
     command, from the shipped registry, when the whole directory is that
     tool's output; otherwise, for an ignored directory,
     `git clean -X -d -f -- <dir>`, which never removes a tracked or
     non-ignored file and skips nested repositories (the report names what
     stayed); otherwise, for a `CACHEDIR.TAG` directory or an artifact the
     shipped registry declares, `bin/waypost` removes it itself; anything
     else, a project entry's non-ignored artifact included, is not removed,
     and the report says why.
   - A machine cache is removed by its `clean_argv`, a literal argv run
     without a shell, when its shipped entry has one; otherwise `bin/waypost`
     removes the resolved path itself. Clean text in prose — `rm -rf …`, a
     templated or shell-expanded command — is shown as manual instructions
     and never run.
   - Items are independent: one that fails (a lock, a permission, a path too
     long) is reported, the rest continue, and the exit status is non-zero.
   - Each result is verified (the directory is gone or smaller), and the space
     freed is measured with `fs.statfsSync` on each item's own filesystem,
     before and after.
6. **`waypost setup` audits last.** After discovery it scans the project (with
   the budget) and, if due, the machine; prints the totals per class and the
   largest items; when a person is at the terminal and no harness is detected,
   it offers to remove the `should` items with one `[y/N]` (default no, 60 s);
   otherwise it names `waypost clean`. `--dry-run` says what it would
   discover and audit. `setup` removes nothing without that yes.
7. **`doctor` and `next` warn.** A `warn` in the `vault` group, check
   `build-artifacts`, in `runVaultChecks` beside its one `readVaultConfig`,
   when the project's artifacts exceed `build_artifacts_limit_gb` (vault
   policy, default 5; `WAYPOST_BUILD_LIMIT_GB` overrides; a non-numeric value
   is itself a warning), always with the fixed entry budget; a stopped scan
   above the limit warns with `≥ N GB`, a stopped scan below it gives an
   `info`. `next` already forwards warnings; it gains the `info` and the
   repair pointer `waypost clean`.
8. **Verification across operating systems is recorded, not assumed.** Tests
   stay hermetic on every OS (fixtures, injected platform and environment).
   A registry entry's `confidence` for an OS becomes `verified` only after a
   run on that OS. The owner's Linux and Windows virtual machines, which share
   this checkout, run `npm test`, `waypost profile`, `waypost size` and a
   `waypost clean` plan, and time `doctor`; on Windows also a directory
   junction inside a scanned tree and swapped in for a planned item, and a
   path longer than 260 characters in a scanned and in a removed tree. The
   verification story records the evidence.

## Rationale

1. The owner's four requirements, taken literally.
2. Asking the tool finds the cache where it really is — a moved
   `GOCACHE` or `npm` cache, a custom `CARGO_HOME` — where a list of defaults
   silently reports nothing.
3. Knowledge as data follows the registry that already works for harnesses
   (ADR-0005): a new tool, or a correction, is a JSON file and a test, not a
   branch in the scanner.
4. Executing only what Waypost ships keeps a cloned repository from running
   code through `waypost setup`, the first command a fresh checkout runs —
   the line ADR-0011 drew for guard commands.
5. A fixed budget keeps `doctor` deterministic on every machine, which a
   per-machine calibration would not; timing it on all three operating
   systems answers the worry that it was tuned on one Mac.
6. Removal only through each tool's own command, `git clean -X`, or Waypost
   itself on a directory with no tracked file, re-checked right before it
   runs, keeps what the owner fears losing — tracked files, uncommitted work,
   another session's build — out of reach by construction.

## Alternatives Considered

### Alternative A: tool knowledge in code

**Cons**:
- The first implementation: Xcode in the scanner core, bound to one machine,
  every new tool a code change.

**Rejected because**: it is what the owner stopped.

### Alternative B: a flat list of default paths

**Cons**:
- Misses every reconfigured cache; cannot tell which tools are present or
  explain where a path came from.

**Rejected because**: discovery answers what the list only guesses.

### Alternative C: discovery on every command

**Cons**:
- A subprocess per tool on every `doctor` and `next`.

**Rejected because**: the profile caches discovery; `setup`, `--refresh` and
age refresh it.

### Alternative D: a CI matrix instead of the virtual machines

**Pros**:
- Runs on every push.

**Rejected because**: the owner chose their own Windows and Linux machines;
CI can be added later without changing this decision.

### Alternative E: remove automatically, report only, a hook, or `doctor --fix`

**Rejected because**: the owner chose removal after a yes; ADR-0001 rules out
hooks; `--fix` repairs Waypost's own wiring.

### Alternative F: clean commands as shell strings

**Rejected because**: argv without a shell keeps data from becoming code;
prose stays manual.

### Alternative G: commit the project profile

**Rejected because**: it holds machine paths; ecosystems are cheap to derive
again.

### Alternative H: executable fields in a project's entries, behind a confirmation

**Pros**:
- A project could teach Waypost a private tool's cache command.

**Cons**:
- The first command a fresh clone runs would execute what the clone ships,
  and one more yes to read is one more yes given without reading.

**Rejected because**: ADR-0011's perimeter; a private tool's entry can join
the shipped registry.

### Alternative I: a budget calibrated per machine

**Pros**:
- The same time bound on a slow machine and a fast one.

**Cons**:
- The same tree gets different verdicts on different machines, and on one
  machine after a refresh.

**Rejected because**: `doctor` is deterministic (`AGENTS.md`).

### Alternative J: machine state in `~/.waypost/state/`

**Rejected because**: one name for two roots (a project's `.waypost/state/`),
while every OS already has a place for application state.

## Consequences

**Positive**:
- The same behaviour on macOS, Linux and Windows, for any tool the registry
  describes and, through the generic rules, for tools it does not.
- The profile explains every path it reports and how it was found.
- Removal never touches what is in use, leased, tracked or uncommitted, and a
  cloned repository cannot make Waypost run anything.

**Negative / trade-offs**:
- The registry needs upkeep; most entries stay `documented` or `inferred` for
  an OS until someone runs them there.
- The first `setup` on a machine runs discovery (a subprocess per present
  tool) and the machine audit (~25 s once on the owner's Mac).
- Detectors are code, kept small and named by data.
- Waypost now removes files — only through `waypost clean` or the setup
  prompt, and only after a yes.
- Windows has no process-based in-use check yet, recency is the only signal
  there until the process table supports it, and its sizes are file sizes,
  not allocation.
- A project cannot teach Waypost a private tool's cache or clean command;
  that goes into the shipped registry.
- On a slow machine the fixed budget takes longer; the verification runs
  bound it.

**What changes in code / process**:
- New: `toolchains/*.json`, `scripts/toolchains.mjs` (registry loader,
  discovery, detectors; compute only), `scripts/cleanup.mjs`,
  `prompts/cleanup.md`, `docs/toolchains.md`, `tests/toolchains.test.mjs`,
  `tests/cleanup.test.mjs`.
- Changed: `scripts/sizes.mjs` (tool-agnostic; names and paths from the
  registry and the profile; the flat `scripts/sizes-global.json` goes away),
  `bin/waypost` (`profile`, `size`, `clean`, the setup step, the confirmation,
  the machine state directory), `scripts/doctor.mjs`, the `waypost-doctor`
  skill body, `README.md`, `AGENTS.md`, `CHANGELOG.md`.
- Epic WP-17 is re-sliced into five stories along these decisions.

## Owner's decisions

On 2026-09-14 the owner answered the open questions and approved this ADR:

1. Idle thresholds: 7 days for project artifacts, 30 for machine caches.
2. `--apply can` removes only by id; `can` items are never removed in bulk.
3. A project's own toolchain entries are data only (Decision 1).
4. `doctor` uses one fixed entry budget on every machine (Decision 3).

Accepted with the registry story (2026-09-14), once the guards on
`scripts/sizes.mjs` passed.

## Review history

- A critic pass on the merged-in cleanup draft (2026-09-14) found five
  blockers and three should-fix items: a non-ignored `CACHEDIR.TAG`
  directory that `git clean -X` would silently leave; a `[y/N]` that could
  hang an agent holding a pseudo-terminal; `regenerable` without a safe
  default; machine-wide garbage collection treated as a per-path removal;
  consent that left no trace; the machine-state location next to
  `WAYPOST_HOME`; a device-support rule that did not match how the folders
  are kept; a missing second guard. Decisions 2, 4, 5 and 6 address them,
  with the smaller gaps it listed (nested repositories, a tagged project
  root, `git -C`, free space per filesystem, Windows without a process
  table).
- A fresh-context critic pass on this ADR (2026-09-14): accept with changes.
  - Two blockers for the owner, answered in Decisions 1 and 3 and put to the
    owner as open questions 3 and 4: discovery would have run argv from a
    project's own entries; a per-machine budget would have made `doctor`
    deterministic only per machine.
  - Three should-fix items, answered in Decisions 2, 3, 5 and 8: one name for
    the machine and the project state directories; the tool's own clean
    command without the tracked-file check; thin Windows specifics.
  - The gaps it listed: a failure mid-batch; whether `--refresh` needs
    consent; criteria for the scenarios it reproduced. They are answered in
    Decisions 2 and 5 and in the clean story's criteria.
  - Its note that the epic and the stories described the old design was
    already met by the re-slice.
- Own review after that pass:
  - The guards on `scripts/cleanup.mjs` wait for the file.
  - A cache without a clean command is removed by Waypost, never through
    prose.
  - The project profile is keyed by host.
  - A project entry's non-ignored artifact is never removed, so a mistaken or
    hostile entry cannot delete uncommitted work.

## References

- ADR-0001, ADR-0004, ADR-0005, ADR-0007, ADR-0008, ADR-0011.
- The owner's answers and directives, 2026-09-14.
- Prototype: `~/.claude/hooks/build-size-check.sh` on the owner's Mac.

---

*Last updated: 2026-09-14*
