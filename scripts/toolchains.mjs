#!/usr/bin/env node
// waypost — toolchains.mjs (WP-17, the registry story, ADR "Disk hygiene by discovery")
//
// The tool registry, as data: toolchains/<id>.json ships with waypost, one
// file per tool plus generic.json for the conventional names every ecosystem
// uses. This module only loads and computes — no fs writes, no removal
// calls, nothing here executes anything the registry names. Mirrors the
// harness loader (registryDirs()/registry() in scripts/agents.mjs): shipped
// entries first, then a project's own <project>/.waypost/toolchains/*.json,
// which may only ADD to what a project already ships (Decision 1 of the
// ADR) — a cloned repository can change what its own tree measures and
// labels, never what runs or what outside it is touched.
//
// Exports:
//   registryDirs(projectRoot)              -> [shippedDir, projectDir]
//   loadRegistry({ projectRoot, platform }) -> { entries, notes }
//   applicableLocators(entries, platform)   -> [{ name, collect }]
//   runLocator(name, ctx)                   -> { matches, incomplete }
//   resolveCachePaths(entries, { home, env, platform }) -> [{ ... }]

import { readFileSync, readdirSync, lstatSync } from "node:fs";
import { join, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { pluginRoot } from "./lib.mjs";

// ─── registry loading ───────────────────────────────────────────────────

function shippedDir() {
  return join(pluginRoot(), "toolchains");
}

export function registryDirs(projectRoot) {
  return [shippedDir(), join(projectRoot, ".waypost", "toolchains")];
}

// A single path segment: no separator, and not "." or "..". Applied to a
// project artifact's `name`/`prefix` so a project entry can never point
// outside itself (ADR: "an artifact that resolves outside the project is
// refused").
function isSingleSegment(v) {
  return typeof v === "string" && v.length > 0
    && !v.includes("/") && !v.includes("\\") && v !== "." && v !== "..";
}

// The allowlist a project's own toolchain entry passes through: `detect`
// keeps only `manifests` (never `bins` — a project cannot make waypost look
// for its own executables), and each artifact is rebuilt field by field
// (see sanitizeArtifact) rather than passed through whole, so a stray key
// (a clean_argv, an ask, a path) can never ride along into the registry.
// Every other top-level field is dropped and reported.
const PROJECT_ENTRY_FIELDS = new Set(["id", "name", "detect", "artifacts"]);

// The fields an artifact object may carry at all — `pattern`/`flags` are
// deliberately absent: a regular expression shipped by a cloned repository
// could hang the walk (catastrophic backtracking against a long directory
// name), so a project artifact is only ever matched by name or prefix. A
// key outside this set is reported as a dropped field, same as any other
// unrecognized field elsewhere in the entry.
const ARTIFACT_FIELDS = new Set(["name", "prefix", "match", "regenerable", "stale_days", "clean"]);

// Rebuilds one project artifact from an allowlist, field by field — never
// the raw object — so nothing outside this exact shape can reach the
// registry. Returns null when the artifact has to be dropped entirely
// (no usable name/prefix, or an invalid `match`); every drop, whole-artifact
// or single-field, is reported.
function sanitizeArtifact(a, i, file, notes) {
  const drop = (field, reason) => notes.push({ file, field: `artifacts[${i}]${field ? `.${field}` : ""}`, reason });
  if (!a || typeof a !== "object" || Array.isArray(a)) { drop(null, "not an object"); return null; }
  for (const key of Object.keys(a)) {
    if (!ARTIFACT_FIELDS.has(key)) drop(key, key === "pattern" ? "patterns come only from the shipped registry" : "not a recognized artifact field");
  }
  const okName = a.name !== undefined ? isSingleSegment(a.name) : null;
  const okPrefix = a.prefix !== undefined ? isSingleSegment(a.prefix) : null;
  if (okName === false) drop("name", `"${a.name}" is not a single path segment`);
  if (okPrefix === false) drop("prefix", `"${a.prefix}" is not a single path segment`);
  if (!(okName === true || okPrefix === true)) { drop(null, "has no usable name or prefix"); return null; }
  if (a.match !== "sure" && a.match !== "generic") { drop("match", `${JSON.stringify(a.match)} must be "sure" or "generic"`); return null; }

  const out = { match: a.match, regenerable: typeof a.regenerable === "boolean" ? a.regenerable : false };
  if (okName === true) out.name = a.name;
  if (okPrefix === true) out.prefix = a.prefix;
  if (Number.isFinite(a.stale_days) && a.stale_days > 0) out.stale_days = a.stale_days;
  if (typeof a.clean === "string") out.clean = a.clean;
  return out;
}

function sanitizeProjectEntry(raw, file, notes) {
  const drop = (field, reason) => notes.push({ file, field, reason });
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    notes.push({ file, field: null, reason: "not a JSON object" });
    return null;
  }
  if (typeof raw.id !== "string" || !raw.id) {
    notes.push({ file, field: "id", reason: "missing or not a string" });
    return null;
  }
  for (const key of Object.keys(raw)) {
    if (!PROJECT_ENTRY_FIELDS.has(key)) drop(key, "project entries are data only — this field only applies to the shipped registry");
  }
  // A manifest is a file name inside the project, held to the same
  // single-segment rule as an artifact name, so no later reader of
  // `manifests` can be pointed outside the project.
  const manifests = [];
  for (const [i, m] of (Array.isArray(raw.detect && raw.detect.manifests) ? raw.detect.manifests : []).entries()) {
    if (isSingleSegment(m)) manifests.push(m);
    else drop(`detect.manifests[${i}]`, `${JSON.stringify(m)} is not a single file name inside the project`);
  }
  if (raw.detect && typeof raw.detect === "object" && !Array.isArray(raw.detect)) {
    for (const key of Object.keys(raw.detect)) {
      if (key !== "manifests") drop(`detect.${key}`, "project entries are data only — only detect.manifests applies to a project's own conventions");
    }
  }
  const artifacts = (Array.isArray(raw.artifacts) ? raw.artifacts : [])
    .map((a, i) => sanitizeArtifact(a, i, file, notes))
    .filter((a) => a !== null);
  return {
    id: raw.id, name: typeof raw.name === "string" && raw.name ? raw.name : raw.id,
    os: [], detect: { bins: [], manifests }, artifacts, skip: [], caches: [], locators: [],
  };
}

let _shipped = null;
function shippedEntries() {
  if (_shipped) return _shipped;
  const dir = shippedDir();
  let names;
  try { names = readdirSync(dir).filter((n) => n.endsWith(".json")).sort(); }
  catch {
    throw new Error(`Cannot read the bundled toolchain registry at ${dir} (pluginRoot: ${pluginRoot()}). Check WAYPOST_HOME / CLAUDE_PLUGIN_ROOT.`);
  }
  const map = new Map();
  for (const n of names) {
    const p = join(dir, n);
    let e;
    try { e = JSON.parse(readFileSync(p, "utf8")); }
    catch (err) { throw new Error(`${p}: not valid JSON — ${err.message}`); }
    const id = e.id || n.replace(/\.json$/, "");
    map.set(id, { ...e, id });
  }
  _shipped = map;
  return map;
}

// Loads the shipped registry, then a project's own `.waypost/toolchains/`
// entries as data only. A project entry with a shipped id EXTENDS that
// entry's artifacts and manifests; a new id adds a project-only entry.
// Invalid JSON, and every field or artifact the allowlist drops, becomes a
// `{ file, field, reason }` note rather than a crash — a hostile or mistaken
// project file can only ever cost information, never control.
export function loadRegistry({ projectRoot, platform = process.platform } = {}) {
  const notes = [];
  const map = new Map();
  for (const [id, e] of shippedEntries()) map.set(id, { ...e });

  const [, projectDir] = registryDirs(projectRoot);
  let files = [];
  try { files = readdirSync(projectDir).filter((n) => n.endsWith(".json")).sort(); }
  catch { files = []; }

  for (const n of files) {
    const file = join(".waypost", "toolchains", n);
    const abs = join(projectDir, n);
    let raw;
    try { raw = JSON.parse(readFileSync(abs, "utf8")); }
    catch (err) { notes.push({ file, field: null, reason: `invalid JSON: ${err.message}` }); continue; }
    const clean = sanitizeProjectEntry(raw, file, notes);
    if (!clean) continue;
    const existing = map.get(clean.id);
    if (existing) {
      map.set(clean.id, {
        ...existing,
        artifacts: [...existing.artifacts, ...clean.artifacts],
        detect: { ...existing.detect, manifests: [...new Set([...(existing.detect.manifests || []), ...clean.detect.manifests])] },
      });
    } else {
      map.set(clean.id, clean);
    }
  }

  // Every entry is returned regardless of platform — an artifact applies
  // wherever its directory name is found, whatever OS wrote it; a cache's
  // own `os` is checked per item, downstream, by resolveCachePaths. The
  // `platform` parameter is part of this function's documented shape (a
  // project entry could one day depend on it) even though nothing here
  // filters by it yet.
  return { entries: [...map.values()].sort((a, b) => a.id.localeCompare(b.id)), notes };
}

// ─── locators ────────────────────────────────────────────────────────────
//
// A locator is a named, small, pure-ish function that finds artifacts a
// plain name/pattern walk cannot: something identified by content rather
// than by its own directory name, matched only after the walk narrows the
// search using basenames it collected along the way (the `collect` suffixes
// the owning entry declares). The core (scripts/sizes.mjs) never names one:
// it collects basenames for whichever suffixes the loaded registry's
// applicable locators ask for, then dispatches by name through runLocator.

// Matched by the workspace path recorded in each candidate folder's own
// project-descriptor file, not by name alone — narrowed first, for free, to
// folders whose name starts with a basename the walk actually collected (an
// owning-bundle name it found inside the project), so a machine holding
// unrelated build output for many other projects costs nothing here. Each
// candidate's confirmation is charged like any other subprocess call via
// ctx.chargeCall(); one the remaining budget cannot afford stops the search
// there, in the same sorted, deterministic order every time — the caller
// reads `incomplete` to mark the overall result a lower bound rather than a
// finished count. Darwin only: the descriptor is read with a macOS system
// tool, not a dependency, and is never invoked on any other platform.
function xcodeDerivedDataFor(ctx) {
  const { root, home, basenames, chargeCall, platform } = ctx;
  if (platform !== "darwin" || !basenames || basenames.size === 0) return { matches: [], incomplete: false };
  const base = join(home, "Library", "Developer", "Xcode", "DerivedData");
  let names;
  try { names = readdirSync(base); } catch { return { matches: [], incomplete: false }; }
  names.sort();
  const prefixes = [...basenames].sort().map((b) => `${b}-`);
  const matches = [];
  for (const name of names) {
    if (!prefixes.some((p) => name.startsWith(p))) continue;
    if (!chargeCall()) return { matches, incomplete: true };
    const dir = join(base, name);
    let st;
    try { st = lstatSync(dir); } catch { continue; }
    if (!st.isDirectory() || st.isSymbolicLink()) continue;
    const r = spawnSync("plutil", ["-extract", "WorkspacePath", "raw", join(dir, "info.plist")], { encoding: "utf8", timeout: 5000 });
    if (r.status !== 0) continue;
    const ws = (r.stdout || "").trim();
    if (ws.startsWith(root + sep)) matches.push(dir);
  }
  return { matches, incomplete: false };
}

const LOCATOR_IMPLS = { "xcode-derived-data": xcodeDerivedDataFor };

// Every locator any loaded entry declares whose own `os` includes this
// platform — the only ones the core should bother collecting basenames for
// or invoking after the walk.
export function applicableLocators(entries, platform = process.platform) {
  const out = [];
  const seen = new Set();
  for (const e of entries) {
    for (const l of e.locators || []) {
      if (seen.has(l.name)) continue;
      if (!Array.isArray(l.os) || !l.os.includes(platform)) continue;
      seen.add(l.name);
      out.push({ name: l.name, collect: l.collect || [] });
    }
  }
  return out;
}

// Dispatches to a locator by name. An unknown name (a project cannot add
// one — locators are never part of the project allowlist) finds nothing
// rather than throwing.
export function runLocator(name, ctx) {
  const fn = LOCATOR_IMPLS[name];
  if (!fn) return { matches: [], incomplete: false };
  return fn({ platform: process.platform, ...ctx });
}

// ─── cache path resolution ───────────────────────────────────────────────
//
// Moved from sizes.mjs unchanged in behaviour: a template token substitutes
// from the environment where the tool actually reads one (with a per-OS
// default for XDG_CACHE_HOME/XDG_DATA_HOME; every other token has no
// fallback, so a template needing it is skipped when unset), and a trailing
// "*" expands by prefix-matching the parent directory's own entries — no
// glob library, the only shape this data ever needs (a per-version cache
// directory name). Each resolved path carries `source`: "env" when any
// token it used came from an actual environment override, "default" when
// every token used only a coded default (or is a fixed one like $HOME).
function tokensFor(home, env) {
  const envOr = (keys, fallback) => {
    for (const k of keys) if (env[k]) return { value: env[k], source: "env" };
    return fallback != null ? { value: fallback, source: "default" } : { value: null, source: null };
  };
  return {
    "$HOME": { value: home, source: "default" },
    "$XDG_CACHE_HOME": envOr(["XDG_CACHE_HOME"], join(home, ".cache")),
    "$XDG_DATA_HOME": envOr(["XDG_DATA_HOME"], join(home, ".local", "share")),
    "$LOCALAPPDATA": envOr(["LOCALAPPDATA"], null),
    "$APPDATA": envOr(["APPDATA"], null),
    "$TEMP": envOr(["TEMP", "TMP"], null),
    "$TMPDIR": envOr(["TMPDIR"], null),
    "$USER": envOr(["USER", "USERNAME"], null),
  };
}

const TOKEN_RE = /\$[A-Z_]+/g;

function substitute(template, tokens) {
  let missing = false;
  const used = [];
  const out = template.replace(TOKEN_RE, (tok) => {
    const t = tokens[tok];
    if (!t) return tok; // an unknown token is left as-is, same as before
    if (t.value == null) { missing = true; return ""; }
    used.push(t.source);
    return t.value;
  });
  if (missing) return null;
  return { path: out, source: used.includes("env") ? "env" : "default" };
}

function expandTrailingStar(resolved) {
  const idx = resolved.lastIndexOf("/");
  const dir = resolved.slice(0, idx) || sep;
  const prefix = resolved.slice(idx + 1, -1);
  let names;
  try { names = readdirSync(dir); } catch { return []; }
  return names.filter((n) => n.startsWith(prefix)).sort().map((n) => join(dir, n));
}

// Flattens every applicable cache of every loaded entry into concrete,
// existing-or-not candidate paths for this platform, each carrying its own
// tool id/name, single-OS confidence, and where the path came from. Purely
// computed (plus the read-only directory listing a trailing "*" needs) —
// scanGlobal decides what to do with each candidate (does it exist, how big
// is it).
export function resolveCachePaths(entries, { home, env = process.env, platform = process.platform } = {}) {
  const tokens = tokensFor(home, env);
  const out = [];
  for (const e of entries) {
    for (const c of e.caches || []) {
      if (!Array.isArray(c.os) || !c.os.includes(platform)) continue;
      const sub = substitute(c.path, tokens);
      if (sub == null) continue;
      const candidates = sub.path.endsWith("*") ? expandTrailingStar(sub.path) : [sub.path];
      for (const p of candidates) {
        out.push({
          tool: e.id, path: p, source: sub.source, clean: c.clean,
          confidence: (c.confidence || {})[platform] || null,
          docs: c.docs ?? null, notes: c.notes ?? null, regenerable: c.regenerable ?? null,
        });
      }
    }
  }
  return out;
}
