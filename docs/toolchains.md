# Toolchains

`waypost size`, `waypost profile` (and, later, `waypost clean`) know no
tool. What counts as a Rust build directory, where Xcode keeps its caches,
whether an npm cache is safe to remove — all of that is data:
`toolchains/<id>.json`, one file per tool, plus `generic.json` for the
conventional names (`build`, `dist`, `target`, …) that many unrelated
ecosystems all happen to use. `scripts/sizes.mjs` walks a project by name and
pattern alone; `scripts/discovery.mjs` detects tools and ecosystems and
builds the machine/project profile; `scripts/toolchains.mjs` is the only
thing that loads this data, resolves a cache path, and asks a tool for its
own. Adding a tool, or fixing one, is a JSON file and a test — never a
branch in the scanner (see the ADR,
[Disk hygiene by discovery](vault/adr/disk-hygiene-by-discovery-a-toolchain-registry-a-machine-and-project-profile-and-cleanup-only-after-a-yes.md)).

```bash
waypost profile          # the scheme: detected tools, their cache paths, the project's ecosystems
waypost size --project   # walks this project for build/cache output, read-only
waypost size --global    # measures a fresh machine profile's caches, or the registry's defaults
```

The machine profile records facts only: for each cache, the tool, the
registry item (its path template), the resolved path and how it was found.
`clean`, `regenerable`, `confidence`, `docs` and `notes` are read from the
registry each time `size --global` runs, so fixing an entry here takes effect
at once, without refreshing any profile. A profile item whose registry item no
longer exists is not measured, and `size --global` asks for
`waypost profile --refresh`.

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
| `detect` | `bins` (executables looked up, never run, on `PATH`) and `manifests` (project files like `Cargo.toml`, matched in the project root) — what discovery (`waypost profile`) uses to list the tools and ecosystems present; an entry without `bins` is never listed as a tool, but its caches are still resolved from the environment or the default |
| `artifacts` | where the tool writes *inside a project*: `name` (exact), `prefix`, or `pattern` (a JS regex source matched against one directory name, with optional `flags`), `match` (`sure` counts unconditionally, wherever it appears; `generic` counts only when the project's own `.gitignore` says so and it holds no tracked file), `regenerable`, `clean` (the tool's own project-clean command, in prose) |
| `skip` | names this tool's own artifacts never get walked into (`node_modules`, a virtualenv name); `.git` is hard-coded in the scanner core, not listed anywhere |
| `caches` | machine-wide cache paths: `path` (with the tokens below), `os`, `confidence` (**one key per OS in this item's `os`**), `docs`/`notes` as the confidence levels below require, `regenerable`, `clean`, optional `env` (an override variable name), optional `ask` (below) |
| `locators` | named checks in `scripts/toolchains.mjs` for something a plain name/pattern match cannot find (matched by content, not by its own directory name) — `{ "name", "os", "collect": ["<suffix>", …] }`; the core collects basenames ending in `collect`'s suffixes during the walk and calls the locator by name afterwards, generically, never knowing what it does |

`clean_argv`, `processes` and `detectors` are part of the ADR's full shape
but belong to a later story (classified cleanup) — they are not read yet,
and a shipped entry should not carry them before that story lands.

### `ask`: asking the tool itself (WP-17, the discovery story)

A cache item's `ask` lets discovery (`waypost profile`/`waypost setup`, via
`scripts/discovery.mjs`'s `buildMachineProfile`) find the tool's *real* cache
location instead of guessing from a default — a moved `GOCACHE`, a custom
npm cache, a global Yarn Berry `cacheFolder`. The machine profile asks from
the home directory, so a project-level setting (a project `.npmrc`, a Berry
project's own `cacheFolder`) is not what it reports. Shape:

```json
"ask": { "argv": ["go", "env", "GOCACHE"], "parse": "line",
         "docs": "https://pkg.go.dev/cmd/go#hdr-Print_Go_environment_information" }
```

`parse: "kv"` also takes a `key` (the text after it, on the line naming it —
`dotnet nuget locals global-packages --list` prints `global-packages: <path>`,
so `"key": "global-packages:"`), and a network- or telemetry-suppressing
switch goes in `env`:

```json
"ask": { "argv": ["dotnet", "nuget", "locals", "global-packages", "--list"],
         "parse": "kv", "key": "global-packages:",
         "env": { "DOTNET_CLI_TELEMETRY_OPTOUT": "1", "DOTNET_NOLOGO": "1" },
         "docs": "https://learn.microsoft.com/en-us/nuget/consume-packages/managing-the-global-packages-and-cache-folders" }
```

- `argv` — the command, never through a shell. `argv[0]` is looked up on
  `PATH` the same way `detect.bins` is (never by a bare name), and only the
  ABSOLUTE path discovery already found is ever spawned; a tool discovery
  did not find on `PATH` is simply never asked (the item falls back to
  `env`/default, silently — no note).
- `parse` — `"line"` (the first non-empty output line), `"json"` (a top-level
  key, which may be a string or, like conda's `pkgs_dirs`, an array of
  strings — every array entry is kept as an asked path, and the entry's
  *other* cache items stay as ordinary env/default fallbacks, deduplicated
  by path against the asked ones), or `"kv"` (the text after `key` on the
  first line containing it, e.g. `global-packages: /home/x/.nuget/packages`).
  `parse: "json"`/`"kv"` require `key`.
- `env` — documented switches for that exact command only, to keep asking
  from ever reaching the network, checking for updates, or prompting (e.g.
  `PIP_DISABLE_PIP_VERSION_CHECK=1`, `DOTNET_CLI_TELEMETRY_OPTOUT=1`,
  `HOMEBREW_NO_AUTO_UPDATE=1`, `COREPACK_ENABLE_NETWORK=0` for a
  corepack-managed yarn/pnpm shim). Every switch here must be one the tool's
  own documentation names — never invented — and the doc URL for it belongs
  in the cache item's own `notes`, the same way `docs` is never guessed.
- `docs` — the command's own documentation URL (separate from the cache
  item's own `docs`, which documents the *default path*, not the query).

Execution (`scripts/toolchains.mjs`'s `askCache`, called only from
`buildMachineProfile`): no shell, stdin closed, cwd the home directory,
`ASK_TIMEOUT_MS` (3s) killed and reported as timed out past that. A hang, a
non-zero exit, unparseable output, or a result that is not an absolute path
all become a `note` on that cache item (`ask_note` in the profile) and fall
back to `env`, then the per-OS default — discovery never stops because one
tool misbehaved. On Windows, a `.cmd`/`.bat` shim cannot run without a shell
(Node refuses), so its `ask` is skipped with a note rather than attempted.
`ask` only ever runs argv the **shipped** registry carries — a project's own
`.waypost/toolchains/<id>.json` entry can never add one (the allowlist below
drops it), so `--refresh` needs no confirmation (ADR-0011's perimeter for
guard commands: a cloned repository cannot make waypost run anything of its
own).

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
- Every other top-level field — `caches` (so `ask` can never ride along
  either — asking only ever runs the shipped registry's own argv), `skip`,
  `locators`, `detect.bins`, and anything from a later story (`clean_argv`, a
  project clean command, `processes`, `detectors`) — is dropped and
  reported, one `{ file, field, reason }` per field, in `notes` from
  `loadRegistry` and by `waypost size --json`/`--global --json`/
  `waypost profile --json`.
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
