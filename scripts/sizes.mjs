#!/usr/bin/env node
import { compileArtifacts, ownerOf, compileLocatorOwners, isSureName, isMaybeName, keepSuffixesOf } from "./sizes-rules.mjs";
export { keepSuffixesOf } from "./sizes-rules.mjs";
import { GIT_CALL_COST, SUBPROCESS_CALL_COST, gitIgnoredSet, gitTrackedDirs } from "./sizes-git.mjs";
export { GIT_CALL_COST, SUBPROCESS_CALL_COST, gitFacts } from "./sizes-git.mjs";
import { metadataNamesOf, inspectDir, cacheCandidates, measureCaches, scanGlobal, dirBytes } from "./sizes-measure.mjs";
export { metadataNamesOf, inspectDir, cacheCandidates, measureCaches, scanGlobal } from "./sizes-measure.mjs";
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
//  - scanProject(dir, { budget, registry, rootItem, stopAtGit, deadline,
//    locators }): walks one project tree, breadth-first, for directories
//    that are build/cache output by the walk invariants in the ADR: an
//    outermost CACHEDIR.TAG, a name/prefix/pattern the registry marks
//    unambiguous ("sure") anywhere, or one it marks ambiguous ("generic")
//    only where the project's own git rules say it is output. After the
//    walk, any locator the loaded registry applies on this platform runs
//    once, generically, against the basenames the walk collected for it.
//    `rootItem: false` (the clean-plan story) never reports the root itself
//    as one item even when it carries the tag — `waypost size` never passes
//    it, so its own output is unchanged. The amended machine-wide-limit ADR
//    adds three more, every default reproducing today's behaviour exactly
//    (the automatic path is the only caller that ever sets any of them):
//    `stopAtGit: true` never even lists a directory that itself holds a
//    nested repository's own marker (`nested_skipped` counts how many);
//    `deadline` (an absolute ms clock reading) stops the walk where it
//    stands, checked every 512 entries (`stopped_by: "deadline"` in the
//    result); `locators: false` skips every locator entirely, collection
//    included.
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
import { fileURLToPath } from "node:url";
import { loadRegistry, applicableLocators, runLocator } from "./toolchains.mjs";

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
// subprocess_calls, nested_skipped, stopped_by, dirs: [{ path, bytes,
// partial, newest_ms, nested_git, in_nested_repo, unreadable, other_fs, dev,
// ino, match, tool, origin, regenerable, stale_days, clean, clean_argv,
// holds_package, package }] } — the same shape whether the walk ran to
// completion or was stopped by the budget or the deadline. `dirs[].path` is
// root-relative
// for directories inside the project, and an absolute path for a match a
// locator found outside it. `match` is "tag"/"sure"/"generic"/"locator";
// `tool`/`origin`/… are the owning registry entry's own fields (null for a
// bare CACHEDIR.TAG match with no registry entry behind it — regenerable by
// the tag's own convention, a classifier's call to make, not this walk's).
// `in_nested_repo` is true for a match found while the walk was already
// inside a directory that itself holds a `.git` — a boundary distinct from
// `nested_git`, which says the match's OWN subtree holds one.
// `nested_skipped` counts directories `stopAtGit` never entered at all (0
// without it); `stopped_by` is `"deadline"` when the walk stopped because
// `deadline` passed, else null (a budget-only stop leaves it null too —
// `complete: false` alone already says the walk did not finish).
// `holds_package`/`package` (an item's own fields) come from the registry's
// own `auto_keep_suffixes` (keepSuffixesOf) — see dirBytes above.
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
export function scanProject(dir, {
  budget = null, home = homedir(), registry = null, rootItem = true,
  stopAtGit = false, deadline = null, locators: locatorsOpt = true,
} = {}) {
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
  const keepSuffixes = keepSuffixesOf(reg.entries);
  // locators: false (the automatic path only) — no locator ever runs, and
  // nothing is even collected for one, so an empty array here disables both
  // ends at once.
  const locators = locatorsOpt === false ? [] : applicableLocators(reg.entries);
  const locatorOwners = compileLocatorOwners(reg.entries);
  // One basename set per locator, filled in during the walk itself whenever
  // a directory's name ends with a suffix that locator asked to `collect`.
  const collected = new Map(locators.map((l) => [l.name, new Set()]));

  let entriesVisited = 0;
  let complete = true;
  let subprocessCalls = 0;
  let nestedSkipped = 0;
  let deadlineHit = false;
  const dirs = [];
  let bytesTotal = 0;
  const seen = new Set();
  const budgetHit = () => budget != null && entriesVisited >= budget;
  // Checked every 512 visited entries, the same cadence dirBytes itself
  // uses, so the cost of asking the clock never competes with the walk it
  // bounds.
  const deadlinePassed = () => deadline != null && entriesVisited > 0 && entriesVisited % 512 === 0 && Date.now() > deadline;
  // The time actually left before the deadline, for a git call about to run
  // — capped at the same 15s ceiling this module always used, never above
  // it just because a caller passed no deadline at all.
  const gitTimeoutMs = () => (deadline == null ? 15000 : Math.max(0, Math.min(15000, deadline - Date.now())));

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
      if (budgetHit() || deadlinePassed()) {
        if (deadlinePassed()) deadlineHit = true;
        dirs.push({
          path: m.rel, bytes: 0, partial: true,
          newest_ms: null, nested_git: false, in_nested_repo: inNestedRepo, unreadable: false, other_fs: false,
          dev: null, ino: null, match: m.match,
          tool: owner.tool, origin: owner.origin, regenerable: owner.regenerable,
          stale_days: owner.stale_days, clean: owner.clean, clean_argv: owner.clean_argv,
          auto: owner.auto,
          holds_package: false, package: null,
        });
        complete = false;
        continue;
      }
      const budgetLeft = budget == null ? null : budget - entriesVisited;
      const r = dirBytes(m.abs, seen, budgetLeft, metadataNames, { stopAtGit, keepSuffixes, deadline });
      entriesVisited += r.visited;
      bytesTotal += r.bytes;
      if (r.partial) {
        complete = false;
        if (deadline != null && Date.now() > deadline) deadlineHit = true;
      }
      dirs.push({
        path: m.rel, bytes: r.bytes, partial: r.partial,
        newest_ms: r.newest_ms, nested_git: r.nested_git, in_nested_repo: inNestedRepo, unreadable: r.unreadable,
        other_fs: r.other_fs, dev: r.dev, ino: r.ino, match: m.match,
        tool: owner.tool, origin: owner.origin, regenerable: owner.regenerable,
        stale_days: owner.stale_days, clean: owner.clean, clean_argv: owner.clean_argv,
        auto: owner.auto,
        holds_package: r.holds_package, package: r.package,
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
        if (budgetHit() || deadlinePassed()) { stopped = true; if (deadlinePassed()) deadlineHit = true; break levelLoop; }
        let names;
        try { names = readdirSync(abs); } catch { continue; }
        names.sort();
        // A .git entry directly inside this directory (not the project root
        // itself, whose own .git does not count) makes it the root of a
        // nested repository or worktree — everything found below it from
        // here on is "in_nested_repo", regardless of whether it also turns
        // out to be a match itself.
        const selfIsNestedRoot = abs !== root && names.includes(".git");
        // stopAtGit: this directory's children are never listed at all, let
        // alone matched or walked — "never enter", the same rule dirBytes
        // applies inside one already-matched item, here applied to the
        // OUTER discovery walk too, so a nested worktree is never even
        // looked into while searching for build output elsewhere.
        if (stopAtGit && selfIsNestedRoot) { nestedSkipped++; continue; }
        const childInNested = inNested || selfIsNestedRoot;

        for (const name of names) {
          if (budgetHit() || deadlinePassed()) { stopped = true; if (deadlinePassed()) deadlineHit = true; break levelLoop; }
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
          // Past the deadline this level's generic candidates stay
          // unresolved too, the same as a budget the walk cannot afford —
          // "stops where it is", not "keeps going on a conservative guess".
          const deadlineNow = deadline != null && Date.now() > deadline;
          if (deadlineNow || !chargeSubprocessCall()) {
            stopped = true;
            if (deadlineNow) deadlineHit = true;
          } else {
            const ignored = gitIgnoredSet(root, outside.map((p) => p.rel), gitTimeoutMs());
            const ignoredCandidates = [];
            for (const p of outside) {
              if (ignored.has(p.rel)) ignoredCandidates.push(p);
              else next.push(p); // definitively ordinary — no second call needed
            }
            if (ignoredCandidates.length) {
              const deadlineNow2 = deadline != null && Date.now() > deadline;
              if (deadlineNow2 || !chargeSubprocessCall()) {
                stopped = true; // these stay unresolved: not counted, not walked
                if (deadlineNow2) deadlineHit = true;
              } else {
                const tracked = gitTrackedDirs(root, ignoredCandidates.map((p) => p.rel), gitTimeoutMs());
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
    nested_skipped: nestedSkipped, stopped_by: deadlineHit ? "deadline" : null,
  };
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
