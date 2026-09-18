#!/usr/bin/env node
// waypost — sizes.mjs (WP-17, the registry and clean-plan stories)
// A read-only measurement of build artifacts and dev caches: never deletes,
// never shells out to anything that deletes. This module knows no tool: it
// walks a project tree by NAME and PATTERN alone, and those names, patterns
// and cache paths all come from the toolchain registry (scripts/toolchains.mjs
// + toolchains/*.json). Three accepted-ADR guards on this file forbid
// removal calls, quoted removal words, and naming a specific tool here,
// comments included, so this header states the properties instead of ever
// spelling out an example of what they forbid.
//
//   node sizes.mjs [--project [dir]] [--budget <n>]
//   node sizes.mjs --global
//
// Two modes:
//  - scanProject(dir, { budget, registry, rootItem }): walks one project
//    tree, breadth-first, for directories that are build/cache output by the
//    walk invariants in the ADR: an outermost CACHEDIR.TAG, a name/prefix/
//    pattern the registry marks unambiguous ("sure") anywhere, or one it
//    marks ambiguous ("generic") only where the project's own git rules say
//    it is output. After the walk, any locator the loaded registry applies
//    on this platform runs once, generically, against the basenames the
//    walk collected for it. `rootItem: false` (the clean-plan story) never
//    reports the root itself as one item even when it carries the tag —
//    `waypost size` never passes it, so its own output is unchanged.
//  - scanGlobal({ home, env, platform, registry, profile }): measures the
//    registry's own cache paths for this platform — resolved from an
//    environment variable, then a per-OS default, with a trailing "*"
//    expanded against the parent directory's real entries — reporting only
//    the ones that exist on this machine, each with which tool it belongs to
//    and where its path came from. Built from two smaller, separately
//    exported steps: cacheCandidates (policy, no filesystem measurement) and
//    measureCaches (stat + sum, no policy).
//
// Both report allocated bytes (st.blocks * 512; st.size on win32, which
// reports none) and dedupe by (dev, ino) so a hard link is counted once.
// Every matched item (either mode) also carries a read-only age (the newest
// of mtime/ctime over its own root and everything inside it, the OS metadata
// names the registry's `system` entry lists ignored), whether its own
// subtree holds a nested repository, whether it was found while already
// walking inside one, whether any of it could not be read, its own identity
// (dev/ino), how it was matched, and the registry fields its owning entry
// carries — the facts the clean-plan story classifies from, never a removal
// decision made here.
// bin/waypost formats the JSON both functions return, reaching this module
// with a dynamic import() (in-process, the way selfInstall reaches
// agents.mjs at bin/waypost:812). doctor (a later story) is synchronous and
// already imports its other collaborators (agents.mjs, skills.mjs,
// ready.mjs) statically at the top of the file, so it will bring in
// scanProject and DEFAULT_ENTRY_BUDGET the same static way — either path
// runs this code in-process, never as a subprocess.

import { readdirSync, lstatSync, statSync } from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadRegistry, applicableLocators, runLocator, resolveCachePaths } from "./toolchains.mjs";
import { gitCommonDir } from "./lib.mjs";

// Never entered, whatever it contains: version control metadata. Every
// other never-enter name (installed dependency trees, virtualenvs, …) is a
// tool's own business and comes from the registry's `skip` lists instead.
const CORE_SKIP = new Set([".git"]);
const EMPTY_SET = new Set();

// The OS metadata names the registry's `system` entry lists (".DS_Store",
// a Windows thumbnail cache file, a Windows folder-settings file) — read
// once per scan and passed down to every age computation below, so a
// metadata file's own timestamp never makes an otherwise-idle item look
// freshly touched.
export function metadataNamesOf(entries) {
  const sys = entries.find((e) => e.id === "system");
  return new Set(Array.isArray(sys && sys.metadata_names) ? sys.metadata_names : []);
}

// Builds the four lookup shapes the walk needs — sure/generic names,
// prefixes and patterns — from every loaded entry's `artifacts`, plus the
// union of every entry's `skip` names, and an owner lookup back from a
// matched name/prefix/pattern to the entry that claims it (`tool`, whether
// that entry's own definition is the shipped registry or a project's own,
// `regenerable`, `stale_days`, and its clean instructions) — the same shape
// a matched cache item already carries, so a caller classifying a matched
// item never has to ask which kind of match it was to read its owner. Pure
// data assembly, no tool named.
function compileArtifacts(entries) {
  const sureNames = new Set();
  const surePrefixes = [];
  const genericNames = new Set();
  const genericPrefixes = [];
  const surePatterns = [];
  const genericPatterns = [];
  const skip = new Set(CORE_SKIP);
  const ownerByName = new Map();
  const ownerByPrefix = [];
  const ownerByPattern = [];
  for (const e of entries) {
    for (const name of e.skip || []) skip.add(name);
    for (const a of e.artifacts || []) {
      const sure = a.match === "sure";
      const owner = {
        tool: e.id, origin: e.origin || "shipped", regenerable: a.regenerable,
        stale_days: Number.isFinite(a.stale_days) ? a.stale_days : null,
        clean: a.clean ?? null,
        clean_argv: Array.isArray(a.clean_argv) ? a.clean_argv : null,
      };
      if (typeof a.name === "string") {
        (sure ? sureNames : genericNames).add(a.name);
        ownerByName.set(a.name, owner);
      } else if (typeof a.prefix === "string") {
        (sure ? surePrefixes : genericPrefixes).push(a.prefix);
        ownerByPrefix.push({ prefix: a.prefix, owner });
      } else if (typeof a.pattern === "string") {
        let re;
        try { re = new RegExp(a.pattern, a.flags || undefined); } catch { continue; }
        (sure ? surePatterns : genericPatterns).push(re);
        ownerByPattern.push({ re, owner });
      }
    }
  }
  return {
    sureNames, surePrefixes, genericNames, genericPrefixes, surePatterns, genericPatterns, skip,
    ownerByName, ownerByPrefix, ownerByPattern,
  };
}

function ownerOf(name, c) {
  if (c.ownerByName.has(name)) return c.ownerByName.get(name);
  const p = c.ownerByPrefix.find((x) => name.startsWith(x.prefix));
  if (p) return p.owner;
  const r = c.ownerByPattern.find((x) => x.re.test(name));
  return r ? r.owner : null;
}

// One entry per locator name, from whichever entry declares it — the same
// owner shape as an artifact's, read from the locator's own declaration
// (a locator that carries no `regenerable`/`clean` of its own reports those
// as unknown rather than guessing).
function compileLocatorOwners(entries) {
  const map = new Map();
  for (const e of entries) {
    for (const l of e.locators || []) {
      if (map.has(l.name)) continue;
      map.set(l.name, {
        tool: e.id, origin: e.origin || "shipped",
        regenerable: typeof l.regenerable === "boolean" ? l.regenerable : null,
        stale_days: Number.isFinite(l.stale_days) ? l.stale_days : null,
        clean: l.clean ?? null,
        clean_argv: Array.isArray(l.clean_argv) ? l.clean_argv : null,
      });
    }
  }
  return map;
}

function isSureName(name, c) {
  if (c.sureNames.has(name)) return true;
  if (c.surePrefixes.some((p) => name.startsWith(p))) return true;
  return c.surePatterns.some((re) => re.test(name));
}

function isMaybeName(name, c) {
  if (c.genericNames.has(name)) return true;
  if (c.genericPrefixes.some((p) => name.startsWith(p))) return true;
  return c.genericPatterns.some((re) => re.test(name));
}

// The walk stops after this many filesystem entries (lstat calls), covering
// discovery, the summation inside a matched directory, AND (see
// SUBPROCESS_CALL_COST below) every subprocess a level's generic names or a
// locator needs — a bound on wall-clock time expressed as a single count,
// so doctor (which runs this on every call) stays deterministic. Calibrated
// against real trees, with the subprocess charge included: a real git
// repository needing 30443 charged entries and 5 subprocess calls finished
// cold in ~1.4s at this budget; a second one used 5 calls, well under the
// budget, finishing in well under a second. A tree whose generic names
// recur at many breadth-first levels (a synthetic 30-level fixture, one
// ignored build/ per level) still stops deterministically before it can
// degrade to the ~110 entries/s that shape hit uncharged, because the
// subprocess calls each level needs are charged against this same budget
// and the walk halts once they are no longer affordable — at this budget
// that fixture stopped at 39 calls, ~1.1s. A warm cache finishes in a
// fraction of either. See the story's Final Summary for the numbers.
export const DEFAULT_ENTRY_BUDGET = 40000;

// The cost of one subprocess this walk may spawn: a git call (check-ignore
// or ls-files, ~29-31ms measured on macOS during development; the
// verification story re-times it on Linux and Windows) or a locator's own
// confirmation call (~18ms measured for the one locator this registry ships
// — cheaper, so the same figure is a safe charge for any other). At the
// ~30k-entries/s cold throughput a plain lstat walk reaches here, ~30ms is
// roughly equivalent to 1000 filesystem entries, so every such subprocess is
// charged that much against entries_visited — but only when a budget is set
// (an unbounded scan pays no charge, since nothing there needs bounding).
// This is what keeps a tree whose generic names recur at many levels, or a
// machine with many unrelated locator matches, from spending wall-clock the
// entry budget cannot see: once the remaining budget cannot afford the next
// subprocess, the walk stops there rather than spawning it anyway.
export const GIT_CALL_COST = 1000;
export const SUBPROCESS_CALL_COST = GIT_CALL_COST;

function sizeOf(st) {
  return process.platform === "win32" ? st.size : st.blocks * 512;
}

function entryAgeMs(st) {
  return Math.max(st.mtimeMs, st.ctimeMs);
}

// ─── byte summation + age/identity/readability inside one matched item ──
//
// Pure lstat, no symlink is ever resolved or descended into — its own
// allocation is counted and nothing more, which is also what keeps a
// symlink cycle from ever being followed here. `seen` is shared across the
// whole scan (every matched directory), so two hard links anywhere in the
// scan are counted once, the way `du` counts them. Alongside bytes, this
// also reports: `newest_ms` (the newest of mtime/ctime over the item's own
// root and every entry inside it, a name in `metadataNames` never moving
// it); `nested_git` (a `.git` file or directory found directly inside any
// directory this walk entered — the item's own subtree holds a nested
// repository or worktree); `unreadable` (a readdir or lstat failure inside
// the item was swallowed rather than surfaced); and the item's own root
// identity (`dev`/`ino`), read once, for a re-check to compare against
// later without re-walking the whole tree.
function dirBytes(root, seen, budgetLeft, metadataNames = EMPTY_SET) {
  let bytes = 0;
  let visited = 0;
  let partial = false;
  let unreadable = false;
  let nestedGit = false;
  let newestMs = null;
  let rst;
  try { rst = lstatSync(root); }
  catch { return { bytes: 0, visited: 0, partial: false, unreadable: true, nested_git: false, newest_ms: null, dev: null, ino: null }; }
  visited++;
  const dev = rst.dev;
  const ino = rst.ino;
  const rootKey = `${dev}:${ino}`;
  if (!seen.has(rootKey)) { seen.add(rootKey); bytes += sizeOf(rst); }
  if (!metadataNames.has(basename(root))) newestMs = entryAgeMs(rst);

  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let names;
    try { names = readdirSync(dir); } catch { unreadable = true; continue; }
    // A .git entry directly inside a visited directory means this item's own
    // subtree holds a nested repository (or a worktree's link back to one) —
    // read for free off the listing the walk below already fetched.
    if (names.includes(".git")) nestedGit = true;
    for (const name of names) {
      if (budgetLeft != null && visited >= budgetLeft) {
        partial = true;
        return { bytes, visited, partial, unreadable, nested_git: nestedGit, newest_ms: newestMs, dev, ino };
      }
      const p = join(dir, name);
      let st;
      try { st = lstatSync(p); } catch { visited++; unreadable = true; continue; }
      visited++;
      if (!metadataNames.has(name)) {
        const age = entryAgeMs(st);
        if (newestMs == null || age > newestMs) newestMs = age;
      }
      const key = `${st.dev}:${st.ino}`;
      if (seen.has(key)) continue;
      seen.add(key);
      bytes += sizeOf(st);
      if (st.isDirectory() && !st.isSymbolicLink()) stack.push(p);
    }
  }
  return { bytes, visited, partial, unreadable, nested_git: nestedGit, newest_ms: newestMs, dev, ino };
}

// One absolute path, in isolation: the same facts a matched item carries out
// of the walk above, with no budget and no dedup against any other item —
// for a re-check right before a later removal step touches anything, and for
// tests that want one item's facts without a whole project scan.
export function inspectDir(abs, { metadata = EMPTY_SET } = {}) {
  let st;
  try { st = lstatSync(abs); } catch { return { exists: false }; }
  if (st.isSymbolicLink()) return { exists: true, is_directory: false, is_symlink: true };
  if (!st.isDirectory()) return { exists: true, is_directory: false, is_symlink: false };
  const r = dirBytes(abs, new Set(), null, metadata);
  return {
    exists: true, is_directory: true, is_symlink: false,
    bytes: r.bytes, newest_ms: r.newest_ms, nested_git: r.nested_git,
    unreadable: r.unreadable, dev: r.dev, ino: r.ino,
  };
}

// ─── git check-ignore, batched once per scan ────────────────────────────
//
// Any outcome other than "at least one of these is ignored" (status 0) or
// "none of these is ignored" (status 1) — no git binary, a project that is
// not a git repository, a detached worktree with no HEAD — is read as
// "nothing here counts as ignored", per the ADR: a generic name only counts
// inside a repository whose own rules say so. No --literal-pathspecs here:
// `check-ignore` itself refuses that option outright ("pathspec magic not
// supported by this command"), on every git version tried — unlike ls-files
// below, which does support it.
function gitIgnoredSet(root, relPaths) {
  if (!relPaths.length) return new Set();
  const input = relPaths.map((p) => p.split(sep).join("/")).join("\0") + "\0";
  let r;
  try {
    r = spawnSync("git", ["-C", root, "check-ignore", "--stdin", "-z"], { input, encoding: "utf8", timeout: 15000 });
  } catch {
    return new Set();
  }
  if (r.error || r.status == null || (r.status !== 0 && r.status !== 1)) return new Set();
  return new Set((r.stdout || "").split("\0").filter(Boolean));
}

// A directory git ignores can still hold a file someone force-added despite
// the rule (vendored source living under a generically-named directory, say)
// — reporting it as a build artifact would point a cleanup step at tracked
// work. One batched `git ls-files -z` per level for exactly the candidates
// check-ignore already flagged, not one call per candidate. Any failure here
// is read the OPPOSITE way from gitIgnoredSet's: as "cannot tell, so do not
// call this an artifact" — the direction that cannot lose tracked content.
function gitTrackedDirs(root, relPaths) {
  if (!relPaths.length) return new Set();
  const rels = relPaths.map((p) => p.split(sep).join("/"));
  let r;
  try {
    r = spawnSync("git", ["--literal-pathspecs", "-C", root, "ls-files", "-z", "--", ...rels], { encoding: "utf8", timeout: 15000 });
  } catch {
    return new Set(relPaths);
  }
  if (r.error || r.status !== 0) return new Set(relPaths);
  const files = (r.stdout || "").split("\0").filter(Boolean);
  const out = new Set();
  for (let i = 0; i < rels.length; i++) {
    const prefix = `${rels[i]}/`;
    if (files.some((f) => f === rels[i] || f.startsWith(prefix))) out.add(relPaths[i]);
  }
  return out;
}

// A merged, hardened read of the same two facts, for callers outside the
// walk's own per-level budget accounting — inspectDir's re-check, the
// clean-plan's own fact-gathering (bin/waypost), and later the removal
// path's own re-check right before it touches anything.
//
// Repository membership is its own question, answered once by
// `gitCommonDir` (lib.mjs's own `git rev-parse --git-common-dir`) rather
// than inferred from check-ignore's exit status — check-ignore can fail for
// reasons that have nothing to do with "is this a repository" (a corrupt
// index, for one), and conflating the two used to read a corrupt-but-real
// repository as "outside git" instead of "cannot tell right now".
//
// Tracked-ness is checked for EVERY given path, not only the ones
// check-ignore flagged ignored: an un-ignored match (a shipped "sure" name
// with no ignore rule covering it at all) can still hold tracked content,
// and that is exactly the case a plain "only check what's ignored" miss —
// the CACHEDIR.TAG/tracked-file acceptance criterion this function exists
// for. --literal-pathspecs is used only here, on ls-files, which supports
// it; `check-ignore` refuses that option outright regardless of `--stdin`.
//
// Outside a git repository, `repo` is false and nothing is reported ignored
// or tracked. Inside one, ANY git failure on either call (no binary, a
// corrupt index, an unreadable object, output this function cannot parse) —
// answers conservatively: nothing ignored, EVERY given path tracked. That is
// the one direction that can never turn real content into something a
// caller believes is safe to remove.
export function gitFacts(root, relPaths) {
  if (!relPaths.length) return { repo: true, ignored: new Set(), tracked: new Set() };
  if (!gitCommonDir(root)) return { repo: false, ignored: new Set(), tracked: new Set() };

  const posix = relPaths.map((p) => p.split(sep).join("/"));
  const conservative = () => ({ repo: true, ignored: new Set(), tracked: new Set(relPaths) });

  let r;
  try {
    r = spawnSync("git", ["-C", root, "check-ignore", "--stdin", "-z"],
      { input: posix.join("\0") + "\0", encoding: "utf8", timeout: 15000 });
  } catch {
    return conservative();
  }
  // check-ignore: status 0 (at least one match) or 1 (none) are the only
  // answers that mean anything; anything else is a failure, not "nothing
  // ignored".
  if (r.error || r.status == null || (r.status !== 0 && r.status !== 1)) {
    return conservative();
  }
  const ignoredPosix = new Set((r.stdout || "").split("\0").filter(Boolean));
  const ignored = new Set(relPaths.filter((_, i) => ignoredPosix.has(posix[i])));

  let tr;
  try {
    tr = spawnSync("git", ["--literal-pathspecs", "-C", root, "ls-files", "-z", "--", ...posix], { encoding: "utf8", timeout: 15000 });
  } catch {
    return conservative();
  }
  if (tr.error || tr.status !== 0) return conservative();
  const files = (tr.stdout || "").split("\0").filter(Boolean);
  const tracked = new Set();
  for (let i = 0; i < relPaths.length; i++) {
    const prefix = `${posix[i]}/`;
    if (files.some((f) => f === posix[i] || f.startsWith(prefix))) tracked.add(relPaths[i]);
  }
  return { repo: true, ignored, tracked };
}

// A directory carries the tag when CACHEDIR.TAG is a direct child file —
// checked by name for every directory the walk encounters, independent of
// that directory's own name: a custom cache directory is found exactly
// because it is tagged, whatever it happens to be called.
function hasCachedirTag(dirAbs) {
  try { return lstatSync(join(dirAbs, "CACHEDIR.TAG")).isFile(); } catch { return false; }
}

// ─── scanProject ─────────────────────────────────────────────────────────
//
// Output: { root, complete, bytes_at_least, entries_visited, entry_budget,
// subprocess_calls, dirs: [{ path, bytes, partial, newest_ms, nested_git,
// in_nested_repo, unreadable, dev, ino, match, tool, origin, regenerable,
// stale_days, clean, clean_argv }] } — the same shape whether the walk ran
// to completion or was stopped by the budget. `dirs[].path` is root-relative
// for directories inside the project, and an absolute path for a match a
// locator found outside it. `match` is "tag"/"sure"/"generic"/"locator";
// `tool`/`origin`/… are the owning registry entry's own fields (null for a
// bare CACHEDIR.TAG match with no registry entry behind it — regenerable by
// the tag's own convention, a classifier's call to make, not this walk's).
// `in_nested_repo` is true for a match found while the walk was already
// inside a directory that itself holds a `.git` — a boundary distinct from
// `nested_git`, which says the match's OWN subtree holds one.
// `subprocess_calls` is the number of git and locator subprocesses actually
// run, reported either way; with a budget set, each one was also charged
// against entries_visited at GIT_CALL_COST (see above) before it ran.
//
// Discovery and summation are interleaved level by level, not run as two
// separate passes over the whole tree: each breadth-first level's generic
// names are resolved (ignored-and-untracked vs. ordinary), then that
// level's matches are summed against the shared budget, before the walk
// descends into the next level's ordinary directories. A budget that stops
// partway through a deep tree still reports the shallow artifacts it did
// reach, instead of a lower bound of zero. A level whose generic names
// would need a git call the remaining budget cannot afford stops the walk
// there instead of spawning it anyway — those particular candidates are
// left unresolved (neither counted nor walked) — which is what keeps a
// tree whose generic names recur at many levels from spending wall-clock
// the entry budget alone cannot see. The same charge applies to whatever
// confirmation calls a locator makes after the walk. A candidate found
// while already inside a nested repository is never sent into a
// check-ignore batch scoped to the outer root at all — git would either
// answer for the wrong repository or fail the whole batch — and is walked
// as ordinary instead, the same safe fallback used when git cannot answer.
export function scanProject(dir, { budget = null, home = homedir(), registry = null, rootItem = true } = {}) {
  const root = resolve(dir);
  home = resolve(home);
  if (root === home) throw new Error("refusing to scan $HOME as a project root — pass the project directory instead");
  if (root === resolve(sep)) throw new Error("refusing to scan / as a project root — pass the project directory instead");
  let rootSt;
  // The root itself may be a symlink to the real project directory (a
  // worktree alias, say) — followed once, here only; everything the walk
  // finds beneath it is still classified and measured by lstat.
  try { rootSt = statSync(root); } catch { throw new Error(`no such directory: ${root}`); }
  if (!rootSt.isDirectory()) throw new Error(`not a directory: ${root}`);

  const reg = registry || loadRegistry({ projectRoot: root });
  const c = compileArtifacts(reg.entries);
  const metadataNames = metadataNamesOf(reg.entries);
  const locators = applicableLocators(reg.entries);
  const locatorOwners = compileLocatorOwners(reg.entries);
  // One basename set per locator, filled in during the walk itself whenever
  // a directory's name ends with a suffix that locator asked to `collect`.
  const collected = new Map(locators.map((l) => [l.name, new Set()]));

  let entriesVisited = 0;
  let complete = true;
  let subprocessCalls = 0;
  const dirs = [];
  let bytesTotal = 0;
  const seen = new Set();
  const budgetHit = () => budget != null && entriesVisited >= budget;

  // Attempts to charge one subprocess call (git or a locator's own) against
  // the budget, charging and returning true only if it is affordable; an
  // unbounded scan always succeeds and charges nothing.
  function chargeSubprocessCall() {
    if (budget != null && entriesVisited + SUBPROCESS_CALL_COST > budget) return false;
    if (budget != null) entriesVisited += SUBPROCESS_CALL_COST;
    subprocessCalls++;
    return true;
  }

  function ownerFor(m) {
    if (m.match === "tag") return { tool: null, origin: null, regenerable: true, stale_days: null, clean: null, clean_argv: null };
    if (m.match === "locator") {
      return locatorOwners.get(m.locator) || { tool: null, origin: null, regenerable: null, stale_days: null, clean: null, clean_argv: null };
    }
    return ownerOf(basename(m.abs), c) || { tool: null, origin: null, regenerable: false, stale_days: null, clean: null, clean_argv: null };
  }

  // Sums one level's confirmed matches (sorted by path, for determinism)
  // against the shared budget, appending to `dirs` either way.
  function sumMatches(matches) {
    matches.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
    for (const m of matches) {
      const owner = ownerFor(m);
      const inNestedRepo = Boolean(m.inNested);
      if (budgetHit()) {
        dirs.push({
          path: m.rel, bytes: 0, partial: true,
          newest_ms: null, nested_git: false, in_nested_repo: inNestedRepo, unreadable: false,
          dev: null, ino: null, match: m.match,
          tool: owner.tool, origin: owner.origin, regenerable: owner.regenerable,
          stale_days: owner.stale_days, clean: owner.clean, clean_argv: owner.clean_argv,
        });
        complete = false;
        continue;
      }
      const budgetLeft = budget == null ? null : budget - entriesVisited;
      const r = dirBytes(m.abs, seen, budgetLeft, metadataNames);
      entriesVisited += r.visited;
      bytesTotal += r.bytes;
      if (r.partial) complete = false;
      dirs.push({
        path: m.rel, bytes: r.bytes, partial: r.partial,
        newest_ms: r.newest_ms, nested_git: r.nested_git, in_nested_repo: inNestedRepo, unreadable: r.unreadable,
        dev: r.dev, ino: r.ino, match: m.match,
        tool: owner.tool, origin: owner.origin, regenerable: owner.regenerable,
        stale_days: owner.stale_days, clean: owner.clean, clean_argv: owner.clean_argv,
      });
    }
  }

  // The root itself is checked for the tag too, unless the caller opted out
  // (rootItem: false — the clean-plan story: the project root is never an
  // item) — the invariant makes no exception for depth zero otherwise.
  entriesVisited++; // the root's own tag probe
  if (rootItem !== false && hasCachedirTag(root)) {
    sumMatches([{ rel: "", abs: root, match: "tag", inNested: false }]);
  } else {
    let level = [{ abs: root, rel: "", inNested: false }];
    while (level.length) {
      const next = [];
      const matchedThisLevel = [];
      const pendingMaybe = [];
      let stopped = false;

      levelLoop:
      for (const { abs, rel, inNested } of level) {
        if (budgetHit()) { stopped = true; break levelLoop; }
        let names;
        try { names = readdirSync(abs); } catch { continue; }
        names.sort();
        // A .git entry directly inside this directory (not the project root
        // itself, whose own .git does not count) makes it the root of a
        // nested repository or worktree — everything found below it from
        // here on is "in_nested_repo", regardless of whether it also turns
        // out to be a match itself.
        const selfIsNestedRoot = abs !== root && names.includes(".git");
        const childInNested = inNested || selfIsNestedRoot;

        for (const name of names) {
          if (budgetHit()) { stopped = true; break levelLoop; }
          const childAbs = join(abs, name);
          const childRel = rel ? `${rel}/${name}` : name;
          let lst;
          try { lst = lstatSync(childAbs); } catch { entriesVisited++; continue; }
          entriesVisited++;
          // A symlink is never followed, whether it targets a file or a
          // directory: it cannot become a directory match, cannot be
          // descended into, and so cannot be part of a cycle either.
          if (lst.isSymbolicLink()) continue;
          if (!lst.isDirectory()) continue;
          // Recorded regardless of what happens next: a bundle a locator
          // wants to hear about is ordinary project metadata, classified
          // and walked like any other directory below, but its basename is
          // worth remembering for that locator to use after the walk.
          for (const l of locators) {
            const suffix = (l.collect || []).find((s) => name.endsWith(s));
            if (suffix) collected.get(l.name).add(name.slice(0, name.length - suffix.length));
          }
          if (c.skip.has(name)) continue;
          if (budgetHit()) { stopped = true; break levelLoop; }
          entriesVisited++; // the tag probe, whether or not it finds one
          if (hasCachedirTag(childAbs)) { matchedThisLevel.push({ rel: childRel, abs: childAbs, match: "tag", inNested: childInNested }); continue; }
          if (isSureName(name, c)) { matchedThisLevel.push({ rel: childRel, abs: childAbs, match: "sure", inNested: childInNested }); continue; }
          if (isMaybeName(name, c)) { pendingMaybe.push({ rel: childRel, abs: childAbs, inNested: childInNested }); continue; }
          next.push({ abs: childAbs, rel: childRel, inNested: childInNested });
        }
      }

      // A generic name counts only when git ignores it AND it holds no
      // tracked file — check-ignore alone would also catch vendored source
      // that happens to sit under a generically-named directory a rule
      // matches; ls-files (batched, only for the ones check-ignore flagged)
      // tells the two apart. Anything that turns out ordinary — never
      // ignored, or ignored but carrying tracked content — is walked in
      // the next level exactly like any other directory. A candidate
      // already inside a nested repository never enters this batch at all
      // (see the header note) — it goes straight to `next`. Each remaining
      // call is charged against the budget before it runs (see
      // chargeSubprocessCall): a candidate this level cannot afford to
      // resolve is left out of both `next` and `matchedThisLevel` —
      // neither walked nor counted — and the walk stops after this level's
      // already-resolved matches are summed, rather than spawning the call
      // anyway.
      if (pendingMaybe.length) {
        const outside = pendingMaybe.filter((p) => !p.inNested);
        for (const p of pendingMaybe) if (p.inNested) next.push(p);
        if (outside.length) {
          if (!chargeSubprocessCall()) {
            stopped = true;
          } else {
            const ignored = gitIgnoredSet(root, outside.map((p) => p.rel));
            const ignoredCandidates = [];
            for (const p of outside) {
              if (ignored.has(p.rel)) ignoredCandidates.push(p);
              else next.push(p); // definitively ordinary — no second call needed
            }
            if (ignoredCandidates.length) {
              if (!chargeSubprocessCall()) {
                stopped = true; // these stay unresolved: not counted, not walked
              } else {
                const tracked = gitTrackedDirs(root, ignoredCandidates.map((p) => p.rel));
                for (const p of ignoredCandidates) {
                  if (tracked.has(p.rel)) next.push(p);
                  else matchedThisLevel.push({ ...p, match: "generic" });
                }
              }
            }
          }
        }
      }

      sumMatches(matchedThisLevel);
      if (stopped) { complete = false; break; }
      level = next;
    }
  }

  // Every applicable locator runs once, generically, against the basenames
  // the walk collected for it — the core never knows what kind of match
  // that produces, only that it returns directories to sum like any other.
  for (const l of locators) {
    const { matches, incomplete } = runLocator(l.name, { root, home, basenames: collected.get(l.name), chargeCall: chargeSubprocessCall });
    if (incomplete) complete = false;
    for (const abs of matches) sumMatches([{ rel: abs, abs, match: "locator", locator: l.name, inNested: false }]);
  }

  return {
    root, complete, bytes_at_least: bytesTotal, entries_visited: entriesVisited,
    entry_budget: budget, subprocess_calls: subprocessCalls, dirs,
  };
}

// ─── scanGlobal ──────────────────────────────────────────────────────────
//
// Split into two pure(r) steps: cacheCandidates resolves WHICH paths and
// their policy (no filesystem measurement beyond what resolving one needs
// — a trailing "*" expansion's own directory listing, or, with a profile,
// none at all); measureCaches stats and sums whichever of those exist. The
// registry's own policy (`clean`/`regenerable`/…) always comes from the
// CURRENT registry passed in here, never from a profile — a profile holds
// facts only (see below).
//
// `profile` (WP-17, the discovery story): when bin/waypost has a fresh
// machine profile for this host, its own `caches` are measured directly —
// no resolveCachePaths, no re-asking. But a profile holds facts, not policy
// (ADR Decision 2): it carries only { tool, item, path, source, ask_note? },
// so `clean`/`confidence`/`docs`/`notes`/`regenerable`/`manual`/`clean_argv`/
// `clean_docs`/`stale_days` are read back from the CURRENT `registry` at
// measurement time, matched by (tool, item) — `item` is the cache item's own
// raw path template, a stable key regardless of how it resolved. This is
// what keeps a fixed `regenerable` or `clean` in the registry visible to
// `size --global` at once, never stale for up to 30 days waiting on the next
// profile refresh. A profile item whose (tool, item) no longer matches
// anything in the current registry — the entry or that exact cache item was
// removed or renamed — is not measured; the caller sees this via the
// returned array's own `.dropped` count (an extra own property on the
// array, not a fourth output shape: `JSON.stringify` and a plain `for…of`
// both only ever see the indexed elements, so every existing consumer of
// "scanGlobal returns an array of measured caches" is unaffected — only a
// caller that deliberately reads `.dropped`, or a whole-object comparison
// like `assert.deepEqual`, ever sees it). Without a profile, today's path
// (the registry's own env/default resolution) runs unchanged.
export function cacheCandidates({ home = homedir(), env = process.env, platform = process.platform, registry = null, profile = null } = {}) {
  let candidates;
  let dropped = 0;
  if (profile) {
    // Item 7: a profile whose own `caches` is not an array (corrupt, or an
    // older shape) is not trusted at all — treated as empty rather than
    // thrown. bin/waypost's own freshness check already excludes this case
    // before ever calling scanGlobal with a profile; this is the same rule
    // enforced here too, since scanGlobal is a public function other
    // callers (tests, a future doctor check) may call directly.
    const items = Array.isArray(profile.caches) ? profile.caches : [];
    const reg = registry || loadRegistry({ projectRoot: process.cwd(), platform });
    const policy = new Map();
    for (const e of reg.entries) {
      for (const c of e.caches || []) {
        if (!Array.isArray(c.os) || !c.os.includes(platform)) continue;
        policy.set(`${e.id}::${c.path}`, {
          clean: c.clean, confidence: (c.confidence || {})[platform] || null,
          docs: c.docs ?? null, notes: c.notes ?? null, regenerable: c.regenerable ?? null,
          manual: c.manual === true, clean_argv: Array.isArray(c.clean_argv) ? c.clean_argv : null,
          clean_docs: c.clean_docs ?? null, stale_days: Number.isFinite(c.stale_days) ? c.stale_days : null,
        });
      }
    }
    candidates = [];
    for (const item of items) {
      const pol = policy.get(`${item.tool}::${item.item}`);
      if (!pol) { dropped++; continue; }
      candidates.push({ ...item, ...pol });
    }
  } else {
    // resolveCachePaths' own `base` already carries manual/clean_argv/
    // clean_docs/stale_days normalized the same way — nothing left to add.
    const reg = registry || loadRegistry({ projectRoot: process.cwd(), platform });
    candidates = resolveCachePaths(reg.entries, { home, env, platform });
  }
  candidates.dropped = dropped;
  return candidates;
}

// Stats and sums whichever candidates exist and are directories — read-only,
// dedup by (dev, ino) like every other summation in this module. `metadata`
// is the same OS-metadata-name set scanProject's age computation uses
// (metadataNamesOf), so a cache directory's own age is computed the same
// way an item's is.
export function measureCaches(candidates, { metadata = EMPTY_SET } = {}) {
  const seen = new Set();
  const out = [];
  for (const cand of candidates) {
    // Unlike the project walk, this list is curated and fixed, not an
    // arbitrary tree — /tmp itself is a symlink on macOS, and following one
    // top-level entry is safe. dirBytes below still never follows a symlink
    // it meets while recursing.
    let st;
    try { st = statSync(cand.path); } catch { continue; }
    if (!st.isDirectory()) continue;
    const r = dirBytes(cand.path, seen, null, metadata);
    out.push({
      path: cand.path, bytes: r.bytes, clean: cand.clean, tool: cand.tool, source: cand.source,
      // The cache item's own raw path template — a stable key back into the
      // CURRENT registry's exact cache definition (its `ask`, in particular)
      // for a caller that wants to re-ask the tool at removal time, the way
      // scanGlobal({ profile }) already matches a profile entry back to its
      // policy by (tool, item).
      item: cand.item ?? null,
      confidence: cand.confidence, docs: cand.docs, notes: cand.notes, regenerable: cand.regenerable ?? null,
      manual: cand.manual === true, clean_argv: cand.clean_argv ?? null, clean_docs: cand.clean_docs ?? null,
      stale_days: cand.stale_days ?? null, newest_ms: r.newest_ms, unreadable: r.unreadable, dev: r.dev, ino: r.ino,
    });
  }
  out.dropped = candidates.dropped || 0;
  return out;
}

export function scanGlobal(opts = {}) {
  const platform = opts.platform || process.platform;
  const registry = opts.registry || loadRegistry({ projectRoot: process.cwd(), platform });
  const candidates = cacheCandidates({ ...opts, registry, platform });
  return measureCaches(candidates, { metadata: metadataNamesOf(registry.entries) });
}

// ─── CLI ─────────────────────────────────────────────────────────────────
//
// A direct `node sizes.mjs` invocation, for standalone use and for tests;
// bin/waypost instead reaches the functions above with a dynamic import()
// (in-process, the way selfInstall reaches agents.mjs at bin/waypost:812),
// and a bound doctor check will import this module statically, the way it
// already does agents.mjs/skills.mjs/ready.mjs — either way in-process,
// with no subprocess in between.
function main() {
  const args = process.argv.slice(2);
  try {
    if (args.includes("--global")) {
      process.stdout.write(JSON.stringify(scanGlobal({}), null, 2) + "\n");
      return;
    }
    const bi = args.indexOf("--budget");
    const budget = bi === -1 ? null : Number(args[bi + 1]);
    if (bi !== -1 && (!Number.isInteger(budget) || budget < 0)) throw new Error(`--budget must be a non-negative integer, got "${args[bi + 1]}"`);
    const pi = args.indexOf("--project");
    const dir = pi !== -1 && args[pi + 1] && !args[pi + 1].startsWith("--") ? args[pi + 1] : process.cwd();
    process.stdout.write(JSON.stringify(scanProject(dir, { budget }), null, 2) + "\n");
  } catch (e) {
    process.stdout.write(JSON.stringify({ error: e.message }) + "\n");
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
