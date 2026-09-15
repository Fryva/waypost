#!/usr/bin/env node
// waypost — discovery.mjs (WP-17, the discovery-and-profile story, ADR
// "Disk hygiene by discovery")
//
// Builds the profile — the scheme of what waypost works with on this machine
// and in this project. Compute only: nothing here writes to disk (bin/waypost
// does, atomically) and nothing here spawns a subprocess. findOnPath is a
// filesystem lookup alone (stat, never run); the one thing that ever spawns
// anything is scripts/toolchains.mjs's askCache, on the shipped registry's
// own `ask` argv, called from buildMachineProfile below through
// resolveCachePaths.
//
// Exports:
//   findOnPath(name, { platform, env })                  -> absolute path | null
//   detectManifests(entries, { projectRoot })             -> [{ id, name, manifest }]
//   machineStateDir({ platform, env, home })              -> absolute dir (from ./lib.mjs — the
//                                                             one implementation capacity.mjs's
//                                                             slot table already uses)
//   machineProfilePath({ platform, env, home, host })     -> absolute path to machine.<host>.json
//   projectProfilePath({ projectRoot, host })             -> absolute path to
//                                                             <projectRoot>/.waypost/state/project.<host>.json
//   needsRefresh(profile, { maxAgeDays, force, now })     -> boolean
//   buildMachineProfile(entries, { platform, env, home, host, now, timeoutMs }) -> profile
//   buildProjectProfile(entries, { projectRoot, host, now }) -> profile
//   hostSlug (re-exported from presence.mjs — one host key, one place; NOT lib.mjs's hostTag,
//     which names temp-file writers, a different concept)

import { readdirSync, statSync, accessSync, constants as fsConstants } from "node:fs";
import { join, win32 as pathWin32, posix as pathPosix } from "node:path";
import { machineStateDir } from "./lib.mjs";
import { hostSlug } from "./presence.mjs";
import { resolveCachePaths, ASK_TIMEOUT_MS } from "./toolchains.mjs";

export { hostSlug, machineStateDir };

const DEFAULT_PATHEXT = ".COM;.EXE;.BAT;.CMD";

// A regular, executable file only — never a directory. Follows a symlink (a
// PATH entry is very often one) to judge the target, never the link itself;
// nothing here ever runs the file it finds. On POSIX, "executable" is asked
// of the OS itself (accessSync X_OK — the effective permission check for
// THIS process, which correctly honours ACLs and group/other bits a raw
// mode-bit test can get wrong) rather than inspected from the raw mode bits.
function acceptableFile(p, platform) {
  let st;
  try { st = statSync(p); } catch { return false; }
  if (!st.isFile()) return false;
  if (platform !== "win32") {
    try { accessSync(p, fsConstants.X_OK); } catch { return false; }
  }
  return true;
}

// Looks a name up on PATH without running it. win32 splits PATH on ";" and
// tries `name` plus each PATHEXT extension (default .COM;.EXE;.BAT;.CMD),
// matched case-insensitively against the directory's own listing — the
// PATHEXT env value and a real file's own extension can each be any case,
// and Windows treats them all alike. Every other platform splits on ":" and
// looks for `name` exactly. A PATH entry that is not itself absolute (per
// the injected platform, never the host's own) is skipped rather than
// joined against — a relative entry means "resolve against the shell's own
// cwd", which is not a thing findOnPath does or should guess at, and
// joining it anyway could resolve a path the caller never meant to search
// (and, worse for askCache below, a path relative to the WRONG directory
// once spawned with cwd=home).
export function findOnPath(name, { platform = process.platform, env = process.env } = {}) {
  const pathVar = env.PATH ?? env.Path ?? env.path ?? "";
  const sepChar = platform === "win32" ? ";" : ":";
  const isAbs = platform === "win32" ? pathWin32.isAbsolute : pathPosix.isAbsolute;
  const dirs = pathVar.split(sepChar).filter(Boolean).filter((d) => isAbs(d));

  if (platform === "win32") {
    const pathext = String(env.PATHEXT || DEFAULT_PATHEXT).split(";").filter(Boolean);
    for (const dir of dirs) {
      let entries;
      try { entries = readdirSync(dir); } catch { continue; }
      const byLower = new Map(entries.map((n) => [n.toLowerCase(), n]));
      for (const ext of pathext) {
        const real = byLower.get((name + ext).toLowerCase());
        if (!real) continue;
        const full = join(dir, real);
        if (acceptableFile(full, platform)) return full;
      }
    }
    return null;
  }

  for (const dir of dirs) {
    const p = join(dir, name);
    if (acceptableFile(p, platform)) return p;
  }
  return null;
}

// Matches an entry's detect.manifests against the project ROOT only — no
// recursion, so a hostile or enormous tree costs one readdir. A manifest is
// either an exact name ("go.mod") or a "*.ext" suffix ("*.csproj"); the first
// manifest an entry lists that is found wins, so one project only ever
// reports one ecosystem per entry, matching the manifest that named it.
export function detectManifests(entries, { projectRoot }) {
  let names;
  try { names = readdirSync(projectRoot); } catch { return []; }
  const out = [];
  for (const e of entries) {
    const manifests = (e.detect && e.detect.manifests) || [];
    let hit = null;
    for (const m of manifests) {
      if (typeof m !== "string" || !m) continue;
      if (m.startsWith("*.")) {
        const ext = m.slice(1);
        hit = names.find((n) => n.endsWith(ext)) || null;
      } else {
        hit = names.includes(m) ? m : null;
      }
      if (hit) break;
    }
    if (hit) out.push({ id: e.id, name: e.name, manifest: hit });
  }
  return out;
}

// Where machine.<host>.json lives — machineStateDir (./lib.mjs) plus the host
// key, keyed the same way presence's peers.<host>.json is (Decomposition):
// two host names sharing one home keep two machine profiles.
export function machineProfilePath({ platform = process.platform, env = process.env, home, host }) {
  return join(machineStateDir({ platform, env, home }), `machine.${host}.json`);
}

// Where project.<host>.json lives — machine-local like the rest of
// .waypost/state/ (ADR-0004) and keyed by host because one checkout can be
// shared by several machines (ADR Decision 2).
export function projectProfilePath({ projectRoot, host }) {
  return join(projectRoot, ".waypost", "state", `project.${host}.json`);
}

// Missing, too old, or explicitly forced — the only three reasons either
// profile is rebuilt (Decomposition).
export function needsRefresh(profile, { maxAgeDays = 30, force = false, now = Date.now() } = {}) {
  if (force) return true;
  if (!profile || typeof profile !== "object") return true;
  const generated = Date.parse(profile.generated_at);
  if (Number.isNaN(generated)) return true;
  return now - generated > maxAgeDays * 24 * 60 * 60 * 1000;
}

// Every applicable entry's caches are resolved, detected or not: `tools`
// records only the entries whose own detect.bins was found on PATH, but a
// cache path convention (Xcode's default under ~/Library/Developer, an
// IDE's or an SDK's own cache) is worth reporting via env/default even for
// a tool this machine cannot find a binary for on PATH at all (cursor,
// electron, huggingface, jetbrains, puppeteer, pytorch, system, an Android
// SDK reached only through its app, …) — dropping them made a fresh profile
// measure LESS than no profile at all, the opposite of what discovery is
// for. Asking stays opt-in per tool, though: `bins` — the one place that
// knows findOnPath — is built ONLY from the detected entries' own ask
// commands, as a map from each distinct argv[0] to its absolute path or
// `undefined` when not found; scripts/toolchains.mjs's resolveCachePaths
// only ever reads it, never looks anything up on PATH itself, so an entry
// nobody has on this machine is never asked — its cache items silently fall
// back to env/default, exactly as docs/toolchains.md describes.
//
// The profile holds facts, not policy (ADR Decision 2 / the story's
// Technical Notes): each written cache entry is trimmed to
// { tool, item, path, source, ask_note? } — `item` is the cache item's own
// raw path TEMPLATE from the registry (resolveCachePaths adds it), a stable
// key for that item regardless of how its path resolved this time. `clean`,
// `regenerable`, `confidence`, `docs` and `notes` are deliberately left out:
// they are policy, read back from the CURRENT registry at measurement time
// by scanGlobal({ profile, registry }) in scripts/sizes.mjs, so fixing a
// wrong `regenerable` or `clean` in the registry is visible to
// `size --global` immediately — never stale for up to 30 days because it
// was baked into an old profile.
export function buildMachineProfile(entries, { platform = process.platform, env = process.env, home, host, now = Date.now(), timeoutMs = ASK_TIMEOUT_MS }) {
  const applicable = entries.filter((e) => Array.isArray(e.os) && e.os.includes(platform));
  const tools = [];
  const detected = [];
  for (const e of applicable) {
    const candidates = (e.detect && e.detect.bins) || [];
    let found = null;
    for (const b of candidates) {
      found = findOnPath(b, { platform, env });
      if (found) break;
    }
    if (!found) continue;
    tools.push({ id: e.id, name: e.name, bin: found });
    detected.push(e);
  }

  const bins = {};
  for (const e of detected) {
    for (const c of e.caches || []) {
      if (!c.ask || !Array.isArray(c.ask.argv) || !c.ask.argv.length) continue;
      const cmd = c.ask.argv[0];
      if (cmd in bins) continue;
      bins[cmd] = findOnPath(cmd, { platform, env }) || undefined;
    }
  }

  const resolved = resolveCachePaths(applicable, { home, env, platform, ask: true, bins, timeoutMs });
  const caches = resolved.map((c) => ({
    tool: c.tool, item: c.item, path: c.path, source: c.source,
    ...(c.ask_note ? { ask_note: c.ask_note } : {}),
  }));

  return {
    host, platform, arch: process.arch, generated_at: new Date(now).toISOString(),
    tools, caches,
  };
}

// The project's own ecosystems — data only (Lead decision: scanProject stays
// as it is, so an undetected ecosystem can never hide build output; this
// profile only records what was found, never gates the walk).
export function buildProjectProfile(entries, { projectRoot, host, now = Date.now() }) {
  const found = detectManifests(entries, { projectRoot });
  return {
    host, generated_at: new Date(now).toISOString(),
    ecosystems: found.map((f) => ({ id: f.id, name: f.name, manifest: f.manifest })),
  };
}
