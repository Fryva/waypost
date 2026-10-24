#!/usr/bin/env node
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
import { basename, dirname, join, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadRegistry, applicableLocators, runLocator } from "./toolchains.mjs";
import { gitCommonDir } from "./lib.mjs";

// Never entered, whatever it contains: version control metadata. Every
// other never-enter name (installed dependency trees, virtualenvs, …) is a
// tool's own business and comes from the registry's `skip` lists instead.
const CORE_SKIP = new Set([".git"]);


// The `system` entry's own list of distributable-package suffixes (the
// amended ADR, Decision 3) — read once per scan, lower-cased, and compared
// against an entry's own basename, also lower-cased, during the very same
// age walk that already visits every entry: an item holding one of these is
// never counted or picked by an automatic, no-questions-asked sweep. The
// list itself is registry data, never spelled out in this file.
export function keepSuffixesOf(entries) {
  const sys = entries.find((e) => e.id === "system");
  const list = Array.isArray(sys && sys.auto_keep_suffixes) ? sys.auto_keep_suffixes : [];
  return new Set(list.map((s) => String(s).toLowerCase()));
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
  const skip = new Set(CORE_SKIP);
  const ownerByName = new Map();
  const ownerByPrefix = [];
  const ownerByPattern = [];

  // Every (entry, artifact) pair, with its OWN origin resolved first: a
  // project artifact carries its own `origin: "project"` (sanitizeArtifact,
  // scripts/toolchains.mjs) even when merged into an otherwise-shipped
  // entry that extends a shipped id — `a.origin` always wins over the
  // entry's own `e.origin` when set, so that one glued-on artifact is never
  // mistaken for the shipped definition around it. A project artifact never
  // carries a `pattern` (the allowlist excludes it), so patterns are
  // shipped-only.
  //
  // Blocker 1, second round (independent review, 2026-09-18): whether a
  // matched name counts as "sure" (walked and counted at once) or
  // "generic" (needs a confirmed git-ignore first) used to be tracked in
  // FLAT sets built from every artifact regardless of origin or ownership —
  // a project artifact reusing a name, prefix, OR pattern a shipped entry
  // already owns as "generic" could flip it to "sure" project-wide, simply
  // by declaring the SAME name/prefix `match: "sure"` itself (a brand-new
  // id, an extension of the very entry that owns it, or an unrelated
  // prefix like "b" that happens to also match "build"). An un-ignored
  // "sure" match skips the git-ignore check the walk would otherwise
  // require, and — once its OWNER still resolves to the shipped entry
  // (ownership itself was already fixed the first round) — routeFor's own
  // shipped-sure bypass would remove it outright with no tracked-file
  // check at all; an ignored one would escape the generic cap (never
  // "should", never counted for a machine-wide limit) it was supposed to
  // stay under. The fix: `match` is now read from the SAME owner object
  // ownership already resolves with shipped priority (see below) — there
  // is no separate flat set left to flip.
  const pairs = [];
  for (const e of entries) {
    for (const name of e.skip || []) skip.add(name);
    for (const a of e.artifacts || []) {
      const origin = a.origin ?? e.origin ?? "shipped";
      const owner = {
        tool: e.id, origin, match: a.match, regenerable: a.regenerable,
        stale_days: Number.isFinite(a.stale_days) ? a.stale_days : null,
        clean: a.clean ?? null,
        // `false` only when this artifact's own origin is "shipped" AND it
        // carries `auto === false` itself (the amended ADR: read only from
        // the shipped registry) — never inherited, never true-by-default;
        // `undefined` (checked upstream as `!== false`, never as `=== true`)
        // is what every other artifact carries.
        auto: origin === "shipped" && a.auto === false ? false : undefined,
        clean_argv: Array.isArray(a.clean_argv) ? a.clean_argv : null,
      };
      let re = null;
      if (typeof a.pattern === "string") {
        try { re = new RegExp(a.pattern, a.flags || undefined); } catch { continue; }
      } else if (typeof a.name !== "string" && typeof a.prefix !== "string") continue;
      pairs.push({ a, owner, origin, re });
    }
  }

  // Ownership decides which entry's policy AND match kind govern a matched
  // name/prefix/pattern — a shipped artifact always claims its own key
  // outright (last one in `entries` order wins among shipped artifacts,
  // same as before); a project artifact only ever ADDS a key nothing
  // shipped already owns. Without this, a project's own toolchains data —
  // sorted by id, so ordering is not something a project file controls —
  // could shadow or downgrade a shipped owner's policy (or, per the note
  // above, its match kind) for a name it already governs (ADR: a project's
  // own data can only extend the registry, never change what an outside
  // name means).
  for (const { a, owner, origin, re } of pairs) {
    if (origin === "project") continue;
    if (typeof a.name === "string") ownerByName.set(a.name, owner);
    else if (typeof a.prefix === "string") ownerByPrefix.push({ prefix: a.prefix, owner });
    else if (re) ownerByPattern.push({ re, owner }); // patterns are shipped-only
  }
  for (const { a, owner, origin } of pairs) {
    if (origin !== "project") continue;
    if (typeof a.name === "string") { if (!ownerByName.has(a.name)) ownerByName.set(a.name, owner); }
    else if (typeof a.prefix === "string") { if (!ownerByPrefix.some((x) => x.prefix === a.prefix)) ownerByPrefix.push({ prefix: a.prefix, owner }); }
  }

  return { skip, ownerByName, ownerByPrefix, ownerByPattern };
}

// Every shipped owner (name, then prefix, then pattern) is asked before any
// project owner, so a project name or prefix can never take over a name only
// a shipped pattern governs (a project "derived-data" against the shipped
// derived-data pattern) and lift it out of that owner's match kind.
function ownerOf(name, c) {
  for (const origin of ["shipped", "project"]) {
    const n = c.ownerByName.get(name);
    if (n && n.origin === origin) return n;
    const p = c.ownerByPrefix.find((x) => x.owner.origin === origin && name.startsWith(x.prefix));
    if (p) return p.owner;
    const r = c.ownerByPattern.find((x) => x.owner.origin === origin && x.re.test(name));
    if (r) return r.owner;
  }
  return null;
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

// Both read the SAME owner ownership already resolved (shipped priority,
// see compileArtifacts above) — the match kind is the owner's own `match`,
// never a separate signal a project artifact could flip on its own.
function isSureName(name, c) {
  const owner = ownerOf(name, c);
  return owner != null && owner.match === "sure";
}

function isMaybeName(name, c) {
  const owner = ownerOf(name, c);
  return owner != null && owner.match === "generic";
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
// `timeoutMs` (the amended ADR's own one-deadline rule): the automatic path
// passes the time actually left before its own deadline instead of the
// default 15s ceiling; 0 or negative means none is left, and the
// conservative answer — nothing counts as ignored — comes back without ever
// spawning git at all.
function gitIgnoredSet(root, relPaths, timeoutMs = 15000) {
  if (!relPaths.length) return new Set();
  if (timeoutMs <= 0) return new Set();
  const input = relPaths.map((p) => p.split(sep).join("/")).join("\0") + "\0";
  let r;
  try {
    r = spawnSync("git", ["-C", root, "check-ignore", "--stdin", "-z"], { input, encoding: "utf8", timeout: timeoutMs });
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
// timeoutMs: see gitIgnoredSet above — here the conservative answer (no
// remaining time) is the opposite direction, the same as any other failure
// of this call: every given path reads as tracked.
function gitTrackedDirs(root, relPaths, timeoutMs = 15000) {
  if (!relPaths.length) return new Set();
  if (timeoutMs <= 0) return new Set(relPaths);
  const rels = relPaths.map((p) => p.split(sep).join("/"));
  let r;
  try {
    r = spawnSync("git", ["--literal-pathspecs", "-C", root, "ls-files", "-z", "--", ...rels], { encoding: "utf8", timeout: timeoutMs });
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
//
// gitCommonDir itself can fail (`git rev-parse` non-zero) for a reason that
// says nothing about repository membership at all — "dubious ownership"
// (git's own safe.directory guard), a timeout, a corrupt HEAD — exactly the
// same way check-ignore/ls-files can below, and its own return value alone
// cannot tell "not a repository" apart from "cannot tell right now" (S1,
// independent review, 2026-09-18). A plain filesystem check for `.git` at
// root or any ancestor settles which: found one — conservative, the same
// fallback every other git failure here already uses; found none anywhere
// above — genuinely not a repository, `repo: false` as before.
function hasGitAnywhereAbove(dir) {
  let cur = resolve(dir);
  for (;;) {
    try { lstatSync(join(cur, ".git")); return true; } catch { /* not here */ }
    const parent = dirname(cur);
    if (parent === cur) return false; // reached the filesystem root
    cur = parent;
  }
}

// timeoutMs: see gitIgnoredSet above. Without remaining time this returns
// the same conservative answer any other git failure here already does,
// before ever spawning either call — a git repository that answers "cannot
// tell right now" and one this scan simply had no time left for read the
// same way to every caller.
export function gitFacts(root, relPaths, timeoutMs = 15000) {
  if (!relPaths.length) return { repo: true, ignored: new Set(), tracked: new Set() };
  const conservative = () => ({ repo: true, ignored: new Set(), tracked: new Set(relPaths) });
  if (!gitCommonDir(root)) {
    return hasGitAnywhereAbove(root) ? conservative() : { repo: false, ignored: new Set(), tracked: new Set() };
  }
  if (timeoutMs <= 0) return conservative();

  const posix = relPaths.map((p) => p.split(sep).join("/"));

  let r;
  try {
    r = spawnSync("git", ["-C", root, "check-ignore", "--stdin", "-z"],
      { input: posix.join("\0") + "\0", encoding: "utf8", timeout: timeoutMs });
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
    tr = spawnSync("git", ["--literal-pathspecs", "-C", root, "ls-files", "-z", "--", ...posix], { encoding: "utf8", timeout: timeoutMs });
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
