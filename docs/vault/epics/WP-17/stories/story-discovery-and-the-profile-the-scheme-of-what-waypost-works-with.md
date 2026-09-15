---
type: story
id: "story-discovery-and-the-profile-the-scheme-of-what-waypost-works-with"
epic: "WP-17"
title: "Discovery and the profile: the scheme of what Waypost works with"
status: in-progress
priority: p2
assignee: "Ivan Morozov"
created: 2026-09-14
updated: 2026-09-14
external_refs: {}
tags: []
code_refs: ["scripts/discovery.mjs (planned)", "scripts/toolchains.mjs", "toolchains/", "scripts/sizes.mjs", "scripts/presence.mjs", "bin/waypost", "docs/toolchains.md", "tests/discovery.test.mjs (planned)", "tests/toolchains.test.mjs", "tests/sizes.test.mjs", "tests/scripts.test.mjs", "CHANGELOG.md"]
specs: []
blocked_by: ["WP-17/story-waypost-size-the-read-only-scan-project-and-global"]
started_at: "2026-09-14T21:00:53.429Z"
closed_at: null
plan_updated_at: "2026-09-14T21:00:53.429Z"
---

# Discovery and the profile: the scheme of what Waypost works with

| Field | Value |
|---|---|
| **Epic** | [WP-17](../epic.md) |
| **Status** | in-progress |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

After installation Waypost gathers what the machine and the project use and
keeps it as a profile — the scheme it works with, as the ADR
[Disk hygiene by discovery](../../../adr/disk-hygiene-by-discovery-a-toolchain-registry-a-machine-and-project-profile-and-cleanup-only-after-a-yes.md)
decides (Decision 2). The profile records:
- which registry tools are present;
- where their caches really are: asked from the tool first, then the
  environment, then the default;
- the project's ecosystems.

`waypost size --global` then measures what the profile found instead of a
fixed list.

## Decomposition

- [ ] Detection (`scripts/discovery.mjs`):
      - each entry's `detect.bins` is looked up on `PATH` without running
        anything: it must be a regular file, executable on POSIX, found
        through `PATHEXT` on Windows;
      - `detect.manifests` is matched in the project root, by exact names and
        `*.ext`.
- [ ] Asking (`scripts/toolchains.mjs`): a shipped cache item's `ask` holds
      argv, `parse` (`line`, `json` key, `kv` key) and documented `env`
      switches.
      - It runs by the absolute path detection found, without a shell, with
        stdin closed, the home directory as cwd, and a fixed timeout.
      - Its value is used only if it is an absolute path. Otherwise the
        environment variable, then the per-OS default.
      - Every path records its source. A duplicate path keeps the asked one.
      - On Windows a batch shim (`.cmd`, `.bat`) cannot run without a shell,
        so its ask is skipped with a note.
- [ ] `ask` added to the entries whose tools document a cache query (the
      table below); `docs/toolchains.md` describes the field.
- [ ] The machine state directory per OS (`scripts/discovery.mjs`):
      `$XDG_STATE_HOME/waypost` (default `~/.local/state/waypost`),
      `~/Library/Application Support/Waypost`, `%LOCALAPPDATA%\Waypost`. The
      host key is presence's `hostSlug`, exported.
- [ ] Profiles: `machine.<host>.json` there, and
      `.waypost/state/project.<host>.json`. Each is rebuilt when missing,
      when older than 30 days, or on `--refresh`.
- [ ] `waypost profile [--refresh] [--json]`. `waypost setup` runs discovery
      under the same refresh rule, and `setup --dry-run` says what it would
      discover.
- [ ] `waypost size --global` measures the machine profile's paths when a
      fresh profile exists; otherwise it falls back to the registry with a
      hint.
- [ ] Tests, hermetic: fake tools on an injected `PATH`, injected platform,
      environment, home and host name.

## Implementation Plan

From a `waypost-planner` pass (2026-09-14), grounded in the code, with the
lead's decisions below.

1. `scripts/discovery.mjs` (new, compute only):
   - `findOnPath(name, { platform, env })`
   - `detectManifests(entries, { projectRoot })` — root only
   - `machineStateDir({ platform, env, home })`
   - `needsRefresh(profile, { maxAgeDays: 30, force, now })`
   - `buildMachineProfile(entries, { platform, env, home, host })` — detected
     tools only, then `resolveCachePaths(…, { ask: true, bins })`
   - `buildProjectProfile(entries, { projectRoot, host })`

   `hostSlug` is exported from `scripts/presence.mjs` and reused.
2. `scripts/toolchains.mjs`: `askCache(ask, { bin, env, home, platform,
   timeoutMs })`, and `resolveCachePaths(entries, { …, ask = false })`. An
   item's asked value comes first (source `asked`); otherwise today's tokens,
   unchanged. `ASK_TIMEOUT_MS = 3000`, exported. The header comment says what
   runs: only the shipped `ask` argv.
3. Registry: `ask` on the entries in the table below, with each command's
   docs. Every other entry (sccache, rust, gradle, maven, swiftpm, …) stays
   environment-then-default.
4. `bin/waypost`:
   - `handleProfile` loads the profiles, applies the refresh rule, writes
     both atomically, and prints a summary or `--json`;
   - `case "profile"`;
   - a `handleSetup` step "discover tools and ecosystems" through the
     existing `step()`, so `--dry-run` says "would …";
   - `handleSize --global` passes a fresh machine profile to `scanGlobal`.
5. `scripts/sizes.mjs`: `scanGlobal({ profile })` measures `profile.caches`
   directly. Without a profile it takes today's registry path, unchanged.
6. Tests: `tests/discovery.test.mjs` (new), plus additions to
   `tests/toolchains.test.mjs`, `tests/sizes.test.mjs` and
   `tests/scripts.test.mjs` (setup `--dry-run`).

| Entry | argv | parse | docs |
|---|---|---|---|
| go | `go env GOCACHE`; `go env GOMODCACHE` | line | https://pkg.go.dev/cmd/go#hdr-Print_Go_environment_information |
| node | `npm config get cache` | line | https://docs.npmjs.com/cli/v10/commands/npm-config |
| python | `pip cache dir`; `uv cache dir`; `poetry config cache-dir` | line | https://pip.pypa.io/en/stable/cli/pip_cache/ ; https://docs.astral.sh/uv/reference/cli/#uv-cache-dir ; https://python-poetry.org/docs/configuration/ |
| yarn | `yarn cache dir` (v1); `yarn config get cacheFolder` (Berry) | line | https://classic.yarnpkg.com/en/docs/cli/cache/ ; https://yarnpkg.com/cli/config/get |
| pnpm | `pnpm store path` | line | https://pnpm.io/cli/store |
| homebrew | `brew --cache` | line | https://docs.brew.sh/Manpage |
| conda | `conda info --json` | json `pkgs_dirs` (an array; `inferred`: the key is from conda's source) | https://docs.conda.io/projects/conda/en/stable/commands/info.html |
| dotnet | `dotnet nuget locals global-packages --list` | kv `global-packages:` | https://learn.microsoft.com/en-us/nuget/consume-packages/managing-the-global-packages-and-cache-folders |
| deno | `deno info --json` | json `denoDir` | https://docs.deno.com/runtime/reference/cli/info/ |
| bun | `bun pm cache` | line | https://bun.sh/docs/cli/pm |
| php | `composer config cache-dir` | line | https://getcomposer.org/doc/03-cli.md |
| ccache | `ccache --get-config cache_dir` | line | https://ccache.dev/manual/latest.html |

Lead decisions:
- **Tool versions are left out** of the machine profile in this story. No two
  tools share a version query, and no criterion needs one. They land with the
  detector that compares versions, in the clean story.
- **The project profile is data only.** `scanProject` stays as it is, so an
  undetected ecosystem can never hide build output.
- **No network, no prompts.** Each ask runs with its tool's documented
  switches for update checks, telemetry and prompts turned off. Examples:
  `PIP_DISABLE_PIP_VERSION_CHECK=1`, `npm_config_update_notifier=false`,
  `DOTNET_CLI_TELEMETRY_OPTOUT=1` and `DOTNET_NOLOGO=1`,
  `DENO_NO_UPDATE_CHECK=1`, `COREPACK_ENABLE_NETWORK=0` for corepack shims,
  `HOMEBREW_NO_AUTO_UPDATE=1`. Asking then never reaches the network or waits
  for input. Each switch must be one its tool documents.
- **Windows batch shims are not run.** Node refuses to spawn a `.cmd` or
  `.bat` without a shell, and the ADR runs no shell. The item falls back with
  a note; the verification story checks which tools this affects.
- **`waypost setup` applies the refresh rule** rather than forcing it. The
  machine is asked once, and again on request (`waypost profile --refresh`).
- **conda's `pkgs_dirs` is an array**, expanded like a trailing `*`. Its other
  items stay as fallbacks, deduplicated by path.

## Acceptance Criteria

- [ ] A fake tool on `PATH` that reports a moved cache puts that path in
      `waypost profile --json` with source `asked`. Without the tool, the
      environment variable and then the default are used, each with its
      source.
- [ ] A fake tool that hangs or fails is reported, and discovery continues
      within its timeout. An asked value that is not an absolute path is
      ignored.
- [ ] With an injected `win32` platform an executable is found through
      `PATHEXT`, and a `.cmd` shim's ask is skipped with a note.
- [ ] Every shipped `ask` is an argv array with a `parse` kind. It runs
      without a shell, with stdin closed and the home directory as cwd, and
      its cache item names the docs for the command.
- [ ] The machine state directory resolves per OS from the injected platform
      and environment. Two host names sharing one home keep two machine
      profiles; two sharing one checkout keep two project profiles.
- [ ] `waypost setup --dry-run` names the discovery and writes nothing.
      `waypost setup` writes both profiles. A profile older than 30 days is
      refreshed, and a fresh one is kept unless `--refresh` is given.
- [ ] `waypost size --global` measures a fresh machine profile's paths, and
      without one falls back to the registry with a hint.
- [ ] `npm test` is green and `waypost doctor` reports 0 issues.

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

- Profiles hold facts, not policy; `.waypost/state/` is machine-local and
  never committed.
- Discovery runs only the shipped registry's `ask` argv, so `--refresh` needs
  no confirmation.
- A project-level setting (a project `.npmrc`, a Berry project) can move a
  cache for that project only. The machine profile asks from the home
  directory and reports the global location.
- Paused on 2026-09-15 for the capacity work (WP-18). The partial
  implementation is in `git stash` as "WP-17 discovery story: partial
  implementation, paused 2026-09-15 for the capacity work". It holds:
  - `scripts/discovery.mjs`;
  - the `hostSlug` export in `scripts/presence.mjs`;
  - the changes to `scripts/toolchains.mjs`;
  - `ask` on `toolchains/go.json` and `toolchains/node.json`.

  To resume, run `git stash pop`. Then take `machineStateDir` and the host
  key from `scripts/lib.mjs` and `scripts/presence.mjs`, which WP-18 lands,
  instead of defining them in `scripts/discovery.mjs`.

## Dependencies

- `story-waypost-size-the-read-only-scan-project-and-global` (the registry),
  done.

## Attachments

-

---

*Last updated: 2026-09-14*
