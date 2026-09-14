#!/usr/bin/env node
// waypost — sizes.mjs (WP-17, the registry story)
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
//  - scanProject(dir, { budget, registry }): walks one project tree,
//    breadth-first, for directories that are build/cache output by the walk
//    invariants in the ADR: an outermost CACHEDIR.TAG, a name/prefix/pattern
//    the registry marks unambiguous ("sure") anywhere, or one it marks
//    ambiguous ("generic") only where the project's own git rules say it is
//    output. After the walk, any locator the loaded registry applies on
//    this platform runs once, generically, against the basenames the walk
//    collected for it.
//  - scanGlobal({ home, env, platform, registry }): measures the registry's
//    own cache paths for this platform — resolved from an environment
//    variable, then a per-OS default, with a trailing "*" expanded against
//    the parent directory's real entries — reporting only the ones that
//    exist on this machine, each with which tool it belongs to and where
//    its path came from.
//
// Both report allocated bytes (st.blocks * 512; st.size on win32, which
// reports none) and dedupe by (dev, ino) so a hard link is counted once.
// bin/waypost formats the JSON both functions return, reaching this module
// with a dynamic import() (in-process, the way selfInstall reaches
// agents.mjs at bin/waypost:812). doctor (a later story) is synchronous and
// already imports its other collaborators (agents.mjs, skills.mjs,
// ready.mjs) statically at the top of the file, so it will bring in
// scanProject and DEFAULT_ENTRY_BUDGET the same static way — either path
// runs this code in-process, never as a subprocess.

import { readdirSync, lstatSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadRegistry, applicableLocators, runLocator, resolveCachePaths } from "./toolchains.mjs";

// Never entered, whatever it contains: version control metadata. Every
// other never-enter name (installed dependency trees, virtualenvs, …) is a
// tool's own business and comes from the registry's `skip` lists instead.
const CORE_SKIP = new Set([".git"]);

// Builds the four lookup shapes the walk needs — sure/generic names,
// prefixes and patterns — from every loaded entry's `artifacts`, plus the
// union of every entry's `skip` names. Pure data assembly, no tool named.
function compileArtifacts(entries) {
  const sureNames = new Set();
  const surePrefixes = [];
  const genericNames = new Set();
  const genericPrefixes = [];
  const surePatterns = [];
  const genericPatterns = [];
  const skip = new Set(CORE_SKIP);
  for (const e of entries) {
    for (const name of e.skip || []) skip.add(name);
    for (const a of e.artifacts || []) {
      const sure = a.match === "sure";
      if (typeof a.name === "string") (sure ? sureNames : genericNames).add(a.name);
      else if (typeof a.prefix === "string") (sure ? surePrefixes : genericPrefixes).push(a.prefix);
      else if (typeof a.pattern === "string") {
        let re;
        try { re = new RegExp(a.pattern, a.flags || undefined); } catch { continue; }
        (sure ? surePatterns : genericPatterns).push(re);
      }
    }
  }
  return { sureNames, surePrefixes, genericNames, genericPrefixes, surePatterns, genericPatterns, skip };
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

// ─── byte summation inside one matched directory ────────────────────────
//
// Pure lstat, no symlink is ever resolved or descended into — its own
// allocation is counted and nothing more, which is also what keeps a
// symlink cycle from ever being followed here. `seen` is shared across the
// whole scan (every matched directory), so two hard links anywhere in the
// scan are counted once, the way `du` counts them.
function dirBytes(root, seen, budgetLeft) {
  let bytes = 0;
  let visited = 0;
  let partial = false;
  let rst;
  try { rst = lstatSync(root); } catch { return { bytes: 0, visited: 0, partial: false }; }
  visited++;
  const rootKey = `${rst.dev}:${rst.ino}`;
  if (!seen.has(rootKey)) { seen.add(rootKey); bytes += sizeOf(rst); }

  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let names;
    try { names = readdirSync(dir); } catch { continue; }
    for (const name of names) {
      if (budgetLeft != null && visited >= budgetLeft) { partial = true; return { bytes, visited, partial }; }
      const p = join(dir, name);
      let st;
      try { st = lstatSync(p); } catch { visited++; continue; }
      visited++;
      const key = `${st.dev}:${st.ino}`;
      if (seen.has(key)) continue;
      seen.add(key);
      bytes += sizeOf(st);
      if (st.isDirectory() && !st.isSymbolicLink()) stack.push(p);
    }
  }
  return { bytes, visited, partial };
}

// ─── git check-ignore, batched once per scan ────────────────────────────
//
// Any outcome other than "at least one of these is ignored" (status 0) or
// "none of these is ignored" (status 1) — no git binary, a project that is
// not a git repository, a detached worktree with no HEAD — is read as
// "nothing here counts as ignored", per the ADR: a generic name only counts
// inside a repository whose own rules say so.
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
    r = spawnSync("git", ["-C", root, "ls-files", "-z", "--", ...rels], { encoding: "utf8", timeout: 15000 });
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
// subprocess_calls, dirs: [{ path, bytes, partial }] } — the same shape
// whether the walk ran to completion or was stopped by the budget.
// `dirs[].path` is root-relative for directories inside the project, and an
// absolute path for a match a locator found outside it. `subprocess_calls`
// is the number of git and locator subprocesses actually run, reported
// either way; with a budget set, each one was also charged against
// entries_visited at GIT_CALL_COST (see above) before it ran.
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
// confirmation calls a locator makes after the walk.
export function scanProject(dir, { budget = null, home = homedir(), registry = null } = {}) {
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
  const locators = applicableLocators(reg.entries);
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

  // Sums one level's confirmed matches (sorted by path, for determinism)
  // against the shared budget, appending to `dirs` either way.
  function sumMatches(matches) {
    matches.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
    for (const m of matches) {
      if (budgetHit()) { dirs.push({ path: m.rel, bytes: 0, partial: true }); complete = false; continue; }
      const budgetLeft = budget == null ? null : budget - entriesVisited;
      const { bytes, visited, partial } = dirBytes(m.abs, seen, budgetLeft);
      entriesVisited += visited;
      bytesTotal += bytes;
      if (partial) complete = false;
      dirs.push({ path: m.rel, bytes, partial });
    }
  }

  // The root itself is checked for the tag too — the invariant makes no
  // exception for depth zero.
  entriesVisited++; // the root's own tag probe
  if (hasCachedirTag(root)) {
    sumMatches([{ rel: "", abs: root }]);
  } else {
    let level = [{ abs: root, rel: "" }];
    while (level.length) {
      const next = [];
      const matchedThisLevel = [];
      const pendingMaybe = [];
      let stopped = false;

      levelLoop:
      for (const { abs, rel } of level) {
        if (budgetHit()) { stopped = true; break levelLoop; }
        let names;
        try { names = readdirSync(abs); } catch { continue; }
        names.sort();

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
          if (hasCachedirTag(childAbs)) { matchedThisLevel.push({ rel: childRel, abs: childAbs }); continue; }
          if (isSureName(name, c)) { matchedThisLevel.push({ rel: childRel, abs: childAbs }); continue; }
          if (isMaybeName(name, c)) { pendingMaybe.push({ rel: childRel, abs: childAbs }); continue; }
          next.push({ abs: childAbs, rel: childRel });
        }
      }

      // A generic name counts only when git ignores it AND it holds no
      // tracked file — check-ignore alone would also catch vendored source
      // that happens to sit under a generically-named directory a rule
      // matches; ls-files (batched, only for the ones check-ignore flagged)
      // tells the two apart. Anything that turns out ordinary — never
      // ignored, or ignored but carrying tracked content — is walked in
      // the next level exactly like any other directory. Each call is
      // charged against the budget before it runs (see
      // chargeSubprocessCall): a candidate this level cannot afford to
      // resolve is left out of both `next` and `matchedThisLevel` —
      // neither walked nor counted — and the walk stops after this level's
      // already-resolved matches are summed, rather than spawning the call
      // anyway.
      if (pendingMaybe.length) {
        if (!chargeSubprocessCall()) {
          stopped = true;
        } else {
          const ignored = gitIgnoredSet(root, pendingMaybe.map((p) => p.rel));
          const ignoredCandidates = [];
          for (const p of pendingMaybe) {
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
                else matchedThisLevel.push(p);
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
    for (const abs of matches) sumMatches([{ rel: abs, abs }]);
  }

  return {
    root, complete, bytes_at_least: bytesTotal, entries_visited: entriesVisited,
    entry_budget: budget, subprocess_calls: subprocessCalls, dirs,
  };
}

// ─── scanGlobal ──────────────────────────────────────────────────────────
//
// Measures the registry's own cache paths for this platform — resolved by
// scripts/toolchains.mjs (token + trailing-"*" expansion), reporting only
// the ones that exist. Nothing here is filtered by size — bin/waypost's
// human output does that.
export function scanGlobal({ home = homedir(), env = process.env, platform = process.platform, registry = null } = {}) {
  const reg = registry || loadRegistry({ projectRoot: process.cwd(), platform });
  const candidates = resolveCachePaths(reg.entries, { home, env, platform });
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
    const { bytes } = dirBytes(cand.path, seen, null);
    out.push({
      path: cand.path, bytes, clean: cand.clean, tool: cand.tool, source: cand.source,
      confidence: cand.confidence, docs: cand.docs, notes: cand.notes,
    });
  }
  return out;
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
