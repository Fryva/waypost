# Toolchains

`waypost size` (and, later, `waypost profile` and `waypost clean`) knows no
tool. What counts as a Rust build directory, where Xcode keeps its caches,
whether an npm cache is safe to remove — all of that is data:
`toolchains/<id>.json`, one file per tool, plus `generic.json` for the
conventional names (`build`, `dist`, `target`, …) that many unrelated
ecosystems all happen to use. `scripts/sizes.mjs` walks a project by name and
pattern alone; `scripts/toolchains.mjs` is the only thing that loads this
data and knows how to resolve a cache path. Adding a tool, or fixing one, is
a JSON file and a test — never a branch in the scanner (see the ADR,
[Disk hygiene by discovery](vault/adr/disk-hygiene-by-discovery-a-toolchain-registry-a-machine-and-project-profile-and-cleanup-only-after-a-yes.md)).

```bash
waypost size --project   # walks this project for build/cache output, read-only
waypost size --global    # measures every registry cache that exists on this machine
```

## Entry format

```json
{
  "id": "swiftpm",
  "name": "Swift Package Manager",
  "os": ["darwin", "linux"],
  "detect": { "bins": ["swift"], "manifests": ["Package.swift"] },
  "artifacts": [
    { "name": ".build", "match": "sure", "regenerable": true, "clean": "swift package clean" }
  ],
  "skip": [],
  "caches": [
    {
      "path": "$HOME/Library/Caches/org.swift.swiftpm",
      "os": ["darwin"],
      "confidence": { "darwin": "verified" },
      "docs": "https://github.com/swiftlang/swift-package-manager/blob/main/Documentation/Usage.md#swift-package-purge-cache",
      "regenerable": true,
      "clean": "swift package purge-cache"
    }
  ],
  "locators": []
}
```

| Field | Meaning |
|---|---|
| `id` | registry key; must equal the filename (`toolchains/swiftpm.json` → `"swiftpm"`) |
| `name` | shown in `waypost size --global` output |
| `os` | the OSes this tool runs on — a non-empty subset of `darwin`/`linux`/`win32`, and a superset of every `caches[].os` and `locators[].os` the entry lists (an artifact-only entry with no caches or locators, like `cmake` or `generic`, still names every OS it runs on — this is what the discovery story detects it on, not a fact derived from its caches) |
| `detect` | `bins` (executables looked up, never run, on `PATH`) and `manifests` (project files like `Cargo.toml`) — data only in this story; nothing runs it yet |
| `artifacts` | where the tool writes *inside a project*: `name` (exact), `prefix`, or `pattern` (a JS regex source matched against one directory name, with optional `flags`), `match` (`sure` counts unconditionally, wherever it appears; `generic` counts only when the project's own `.gitignore` says so and it holds no tracked file), `regenerable`, `clean` (the tool's own project-clean command, in prose) |
| `skip` | names this tool's own artifacts never get walked into (`node_modules`, a virtualenv name); `.git` is hard-coded in the scanner core, not listed anywhere |
| `caches` | machine-wide cache paths: `path` (with the tokens below), `os`, `confidence` (**one key per OS in this item's `os`**), `docs`/`notes` as the confidence levels below require, `regenerable`, `clean`, optional `env` (an override variable name) |
| `locators` | named checks in `scripts/toolchains.mjs` for something a plain name/pattern match cannot find (matched by content, not by its own directory name) — `{ "name", "os", "collect": ["<suffix>", …] }`; the core collects basenames ending in `collect`'s suffixes during the walk and calls the locator by name afterwards, generically, never knowing what it does |

`ask`, `clean_argv`, `processes` and `detectors` are part of the ADR's full
shape but belong to later stories (discovery, and classified cleanup) — they
are not read yet, and a shipped entry should not carry them before the story
that uses them lands.

### Path tokens

`$HOME`, `$XDG_CACHE_HOME`, `$XDG_DATA_HOME`, `$LOCALAPPDATA`, `$APPDATA`,
`$TEMP`, `$TMPDIR`, `$USER` — resolved by `scripts/toolchains.mjs`, each
reported with its `source`: `"env"` when an actual environment variable
supplied it, `"default"` otherwise (`$HOME`, and `$XDG_CACHE_HOME`/
`$XDG_DATA_HOME` when neither was set). A token with no coded default
(`$LOCALAPPDATA` and the rest) skips that cache entirely when unset, rather
than guessing. A trailing `*` expands by prefix-matching the parent
directory's own entries — no glob library, the only shape this data needs (a
per-version cache directory, e.g. `AndroidStudio2024.2`).

## Confidence

The same three levels `docs/harnesses.md` defines for a harness apply here,
about **evidence**, not about how good the tool is:

- **verified** — measured on that OS (today, only ever darwin: where the
  registry was first measured). A cache whose linux/win32 entry was never
  anything but assumed from the darwin measurement is `documented` (a docs
  URL backs the same path convention) or `inferred` (no docs — `notes` says
  it was measured on macOS only) instead, kept as a *separate* cache item
  from the darwin one so a reader resolving this path on darwin is never
  shown a caveat that only applies to another OS.
- **documented** — taken from the tool's own documentation; `docs` names the
  URL.
- **inferred** — guessed from a directory convention; `notes` says exactly
  what was assumed.

Being wrong here is cheap and local: fix the entry, and nothing else changes.
Never invent a `docs` URL — an entry with no confirmed documentation page is
`inferred`, with notes, rather than `documented` with a guessed link.

## `regenerable`

Defaults to unsafe: every artifact and every cache states `regenerable`
explicitly (a schema test fails a missing one). `true` means the tool
re-downloads or rebuilds it with no data loss beyond time — iOS DeviceSupport
is `true` because it is re-copied from a paired device on connect. `false`
means irreplaceable or doubtful: Xcode Archives (needed to symbolicate old
crash reports), crash/diagnostic reports, `/cores`, a simulator device's own
installed apps and data, a container engine's data volume. When unsure, the
entry says `false` and explains why in `notes` — a later cleanup story reads
`regenerable` as the one hard gate on what may ever be removed in bulk.

## Project entries: data only, and why

A project may add `<project>/.waypost/toolchains/<id>.json` for its **own**
build output — conventions the shipped registry cannot know because they are
this project's own choice, not a public tool's. It is read as **data only**:

- Kept at the top level: `id`, `name`, `detect.manifests`.
- Every other top-level field — `caches`, `skip`, `locators`, `detect.bins`,
  and anything from a later story (`ask`, `clean_argv`, a project clean
  command, `processes`, `detectors`) — is dropped and reported, one
  `{ file, field, reason }` per field, in `notes` from `loadRegistry` and by
  `waypost size --json`/`--global --json`.
- Each `artifacts[]` item is **rebuilt field by field from an allowlist**,
  never passed through whole, so no stray key (a `clean_argv`, an `ask`, a
  `path`) can ride along inside one:
  - `name` or `prefix` — a single path segment (no `/` or `\`, never `.` or
    `..`); an artifact with neither is dropped.
  - `match` — must be exactly `"sure"` or `"generic"`; anything else drops
    the artifact.
  - `regenerable` — kept only if it is already a boolean, otherwise `false`.
  - `stale_days` — kept only if a positive number, otherwise omitted.
  - `clean` — kept only if a string, otherwise omitted.
  - `pattern`/`flags` are **never** kept, even when the pattern compiles: a
    regular expression a cloned repository ships could hang the walk
    (catastrophic backtracking against a long directory name), so a project
    artifact is only ever matched by name or prefix — the shipped registry
    is the only source of patterns.
  - Any other artifact key is dropped and reported the same way.
- An id matching a shipped entry **extends** that entry's artifacts and
  manifests; a new id adds a project-only entry.
- Invalid JSON produces a note, never a crash.

**Why data only:** `waypost setup`, `waypost size` and `waypost doctor` are
often the *first* commands a freshly cloned repository runs. If a project
entry could carry an executable (`ask`, a clean command, a detector), cloning
a repository and running its own tooling would mean running code the clone's
author chose — the exact perimeter ADR-0011 already draws around guard
commands. A project can change what its own tree measures and labels; it can
never change what waypost executes, or what outside the project waypost may
ever touch. Anything a project needs beyond that goes into the *shipped*
registry, the same way a private harness format is added in
`.waypost/harnesses/` but a harness's *executable* behaviour never comes from
a project.

## Adding or fixing a tool

Drop `toolchains/<id>.json` following the shape above.
`tests/toolchains.test.mjs`'s schema pass already exercises it — every
shipped entry is checked the same way, nothing per-tool to add there. Add a
fixture-backed test in `tests/sizes.test.mjs` if the tool introduces a new
walk shape (a locator, a pattern); most entries need none, since `sure` and
`generic` name/prefix/pattern matching is already fully data-driven.

To fix a wrong path or confidence level: edit the entry, rerun
`npm test`. Nothing outside that one file changes.
