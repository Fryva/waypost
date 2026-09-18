#!/usr/bin/env node
// waypost — cleanup.mjs (WP-17, the clean story, ADR "Disk hygiene by
// discovery" Decision 4, amended by "Cleanup to a machine-wide limit")
//
// A classified plan, and nothing else: every export here is a pure
// function — no filesystem, no subprocess, no clock but the one a caller
// passes in. Two accepted-ADR guards on this file forbid removal calls and
// quoted removal words, so removal itself can never live here even by
// accident; it lives in bin/waypost alone, which gathers every fact this
// module needs (a walk's own output, git status, the live process table,
// leases, peers, the machine state directory) and passes it in, so
// classification is tested without git or a process table at all.
//
// An item is { scope: "project"|"machine", path (absolute — the one
// coordinate system every function here shares, project or machine alike),
// bytes, newest_ms, nested_git, in_nested_repo, unreadable, other_fs (an
// entry inside it lives on a different device than its own root — a mount
// point a recursive removal would cross), partial (project items only — the
// walk's own budget cut its byte summation short), match
// ("tag"|"sure"|"generic"|"locator"), tool, origin ("shipped"|"project"|
// null — per-artifact, never inherited from a merged entry's own origin),
// regenerable, stale_days, clean, clean_argv, manual (machine caches only),
// source ("asked"|"env"|"default", machine caches only), askedNonDefault
// (machine caches only — true when an "asked" path actually differs from
// what env/default resolution alone would give for the same cache item),
// ignored, tracked (both optional — set by the caller from a batched git
// check when it has one; left unset, a project item is never assumed
// not-ignored or tracked just because nobody checked) } — the shape
// scripts/sizes.mjs's scanProject/scanGlobal already report, once the
// caller resolves each `path` to an absolute one and (for leases) does the
// same for whatever it compares against.
//
// facts also carries `projectEcosystemRunning: boolean` — whether any of
// the project's own detected ecosystem tools (scripts/discovery.mjs's
// detectManifests) has a live process, the only in-use signal a tag or
// generic match can lean on (its own owner carries no tool to check by
// name).
//
// Exports:
//   itemId(scope, abs)                          -> "p-"|"m-" + 10 hex chars
//   runningTools(entries, comms)                 -> Set<tool id>
//   refusePath(abs, { home, root, stateDir, platform }) -> boolean
//   routeFor(item)                                -> { kind, argv? } | null
//   classifyItem(item, facts)                     -> { class, reason, route }
//   classify(items, facts, { now, limit })        -> [{ ...item, id, class,
//                                                        reason, route, picked }]
//   orderOldestFirst(items)                       -> items, oldest newest_ms first
//   countedBytes(items)                           -> number
//   qualifiesForLimit(item, now)                  -> boolean (should + kind + 7-day floor)
//   pickUnderLimit(classifiedItems, limitBytes, now) -> Set<path> ("should" picks)
//   recheck(item, freshFacts, facts)              -> { class, reason, route, changed }
//   consent({ yes, reason, isTTY, harnessDetected }) -> { method, ok, reason? }
//   logLine(entry)                                -> one JSON line, no trailing "\n"
//   TEN_MINUTES_MS, DAY_MS, DEFAULT_PROJECT_STALE_DAYS, DEFAULT_MACHINE_STALE_DAYS

import { basename } from "node:path";
import { createHash } from "node:crypto";

export const TEN_MINUTES_MS = 10 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_PROJECT_STALE_DAYS = 7;
export const DEFAULT_MACHINE_STALE_DAYS = 30;

// A stable, short id for one item: enough of a sha256 of its own absolute
// path to be practically unique within one plan, prefixed by scope so a
// project id and a machine id can never collide even if two different
// absolute paths on two different machines happened to hash the same short
// prefix.
export function itemId(scope, abs) {
  const prefix = scope === "machine" ? "m-" : "p-";
  return prefix + createHash("sha256").update(String(abs)).digest("hex").slice(0, 10);
}

function normComm(s) {
  const b = basename(String(s || "").replace(/\\/g, "/")).replace(/\.exe$/i, "");
  return b.toLowerCase();
}

// Which registry entries have a process actually running right now, from a
// live table of command names (comm — basename only, no arguments, no path;
// bin/waypost's own process table already reports it that way). Compared by
// basename, case-insensitively, with the trailing ".exe" Windows adds
// stripped from both sides, and by their first 15 characters — Linux's own
// /proc comm field truncates there, so a long tool name (any of the ones
// this registry ships) still matches its own truncated form.
export function runningTools(entries, comms) {
  const live = [...new Set((comms || []).map(normComm).filter(Boolean))];
  const running = new Set();
  for (const e of entries) {
    for (const proc of e.processes || []) {
      const want = normComm(proc);
      if (!want) continue;
      if (live.some((have) => have.slice(0, 15) === want.slice(0, 15))) { running.add(e.id); break; }
    }
  }
  return running;
}

function normSlashes(p) {
  let s = String(p || "").replace(/\\/g, "/");
  if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
  return s;
}

// True when `abs` is a filesystem root, a bare drive root, or equal to (or
// an ancestor of) the home directory, the project root, or the machine
// state directory — never true merely because `abs` sits INSIDE one of
// those (a cache under $HOME, or a build directory under the project root,
// is exactly what this whole plan is about). Case-folded on darwin and
// win32, whose own filesystems already treat two spellings as the same
// path; an asked cache path is otherwise trusted only as far as this check.
export function refusePath(abs, { home, root, stateDir, platform = process.platform } = {}) {
  const foldCase = platform === "darwin" || platform === "win32";
  const norm = (p) => {
    const s = normSlashes(p);
    return foldCase ? s.toLowerCase() : s;
  };
  const p = norm(abs);
  if (!p) return true; // an empty or unusable path is never a valid target
  if (p === "/" || /^[a-z]:$/.test(p)) return true; // a POSIX or a bare Windows drive root

  const isSelfOrAncestorOf = (of) => {
    if (!of) return false;
    const g = norm(of);
    return p === g || (g + "/").startsWith(p + "/");
  };
  return isSelfOrAncestorOf(home) || isSelfOrAncestorOf(root) || isSelfOrAncestorOf(stateDir);
}

// Two paths (the same absolute coordinate system every item and lease uses)
// overlap when one contains the other, in either direction — a lease on a
// file inside the item, or a lease on a directory the item itself sits
// inside.
function overlaps(a, b) {
  const na = normSlashes(a);
  const nb = normSlashes(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.startsWith(nb + "/") || nb.startsWith(na + "/");
}

// What removing this item would run, informational only — this module never
// runs it. null means no route exists yet (shown as a "keep" reason by
// classifyItem, never as a route to try anyway). Project-scope order is the
// ADR's own (Decision 5), literally: the tool's own clean command when the
// whole directory is its output; otherwise, once confirmed ignored, `git
// clean -X`; otherwise, only for a tag or a shipped sure/locator match,
// waypost's own removal; otherwise no route. Checking `ignored === true`
// BEFORE the tag/sure/locator fallback is what keeps an ignored tag
// directory on `git clean -X` (which skips a nested repository and any
// tracked file on its own) rather than waypost's own less careful route,
// and what keeps a NOT-(yet)-confirmed-ignored match from getting
// `git clean -X` at all — that command only ever touches ignored paths, so
// running it on one would remove nothing.
export function routeFor(item) {
  if (item.scope === "machine") {
    if (item.manual) return null; // shown as manual instructions, never run
    if (Array.isArray(item.clean_argv) && item.clean_argv.length) return { kind: "tool-clean-argv", argv: item.clean_argv };
    // An asked (non-default) path with no clean_argv of its own is only
    // ever removed through the tool that reported it — decided HERE, at
    // plan time, so the plan itself never shows a route that apply would
    // always skip. `askedNonDefault` is set by the caller only when the
    // asked path actually differs from what env/default resolution alone
    // would give for the same cache item — an asked path that happens to
    // match the default is exactly as safe as any other default path.
    if (item.source === "asked" && item.askedNonDefault === true) return null;
    return { kind: "waypost-remove" };
  }
  if (item.nested_git || item.in_nested_repo) return null;
  if (item.origin === "shipped" && Array.isArray(item.clean_argv) && item.clean_argv.length) {
    return { kind: "tool-clean-argv", argv: item.clean_argv };
  }
  if (item.ignored === true) return { kind: "git-clean-x" };
  if (item.match === "tag") return { kind: "waypost-remove" };
  if (item.origin === "shipped" && (item.match === "sure" || item.match === "locator")) return { kind: "waypost-remove" };
  return null;
}

// One item's classification, in the order the ADR decides: keep by policy,
// then keep because it is in use, then should/can by staleness, then the
// caps that never let an item past "can" regardless of its age.
export function classifyItem(item, facts = {}) {
  const now = facts.now ?? Date.now();

  // ── keep — by policy ────────────────────────────────────────────────
  if (refusePath(item.path, facts)) return { class: "keep", reason: "a protected path — never touched", route: null };
  if (item.regenerable !== true) return { class: "keep", reason: "the owning entry does not declare regenerable: true", route: null };
  if (item.nested_git) return { class: "keep", reason: "holds a nested repository or worktree", route: null };
  if (item.in_nested_repo) return { class: "keep", reason: "found inside a nested repository", route: null };
  if (item.other_fs) return { class: "keep", reason: "holds a mount point — a recursive removal would cross filesystems", route: null };
  if (item.scope === "project" && item.origin === "project" && item.ignored === false) {
    return { class: "keep", reason: "a project entry's artifact that git does not ignore", route: null };
  }
  if (item.scope === "project" && item.tracked === true) {
    return { class: "keep", reason: "holds a tracked file", route: null };
  }
  // A manual item (machine-wide cleanup, or a directory of versions) has no
  // automated route by design — routeFor already says so — but that alone
  // never means "keep": it still goes through the same in-use and staleness
  // checks below, capped at "can" at the very end, never "should".
  const manualCap = item.manual === true;
  const route = manualCap ? null : routeFor(item);
  if (!route && !manualCap) return { class: "keep", reason: "no removal route for this match", route: null };

  // ── keep — in use ───────────────────────────────────────────────────
  if (item.newest_ms != null && now - item.newest_ms < TEN_MINUTES_MS) {
    return { class: "keep", reason: "modified within the last 10 minutes", route };
  }
  if (item.tool && facts.runningTools && facts.runningTools.has(item.tool)) {
    return { class: "keep", reason: `${item.tool}'s own process is running`, route };
  }
  // A tag match (CACHEDIR.TAG) carries no owning tool at all — it is found
  // by the tag alone, not by name — so the check above can never protect it
  // (a long-running LTO link that touches no file for over 10 minutes would
  // otherwise be unprotected). A generic match's own owner can also be
  // wrong (the same name is claimed by more than one ecosystem). For both,
  // fall back to whether ANY of the project's own detected ecosystem tools
  // (facts.projectEcosystemRunning, from scripts/discovery.mjs's
  // detectManifests) has a live process — coarser than a per-tool check,
  // but the only signal available once the match itself names no tool.
  if ((item.match === "tag" || item.match === "generic") && facts.projectEcosystemRunning) {
    return { class: "keep", reason: "a project ecosystem tool's own process is running", route };
  }
  // A lease is stored the way presence.mjs's own vaultRel spells a path
  // (vault-relative or project-relative — the caller resolves this once,
  // per item, as `leaseRel`, since reversing a lease's own string back to
  // an absolute path is genuinely ambiguous). Falls back to `path` itself
  // for a caller (a direct unit test, a machine-scope item) that never set
  // one — comparing two absolute paths works exactly the same way.
  const leaseKey = item.leaseRel != null ? item.leaseRel : item.path;
  const lease = (facts.leases || []).find((l) => overlaps(l.path, leaseKey));
  if (lease) {
    return { class: "keep", reason: `leased by ${lease.session || "another session"}${lease.host ? ` on ${lease.host}` : ""}`, route };
  }

  // ── should / can, by staleness ──────────────────────────────────────
  const staleDays = Number.isFinite(item.stale_days) ? item.stale_days
    : (item.scope === "project" ? DEFAULT_PROJECT_STALE_DAYS : DEFAULT_MACHINE_STALE_DAYS);
  const ageDays = item.newest_ms == null ? null : (now - item.newest_ms) / DAY_MS;
  // An unknown age never reaches "should" — the safe half when nothing says
  // otherwise.
  let cls = ageDays != null && ageDays > staleDays ? "should" : "can";
  let reason = ageDays == null ? "age unknown" : (cls === "should" ? `idle for more than ${staleDays} day(s)` : "recently used");

  // ── caps at "can" ────────────────────────────────────────────────────
  // An item part of which could not be read (a permission error the walk
  // swallowed) or whose own byte summation the entry budget cut short never
  // reaches "should" either: its own age is exactly what a missing read
  // could have hidden, so an old newest_ms here is not trustworthy. Checked
  // first — it overrides every other cap's reason too, since none of them
  // would be trustworthy either.
  if (item.unreadable === true || item.partial === true) {
    cls = "can"; reason = "age unknown — part of it could not be read";
  } else if (manualCap) {
    cls = "can"; reason = "manual — machine-wide cleanup, or a directory of versions";
  } else if (item.match === "generic") {
    cls = "can"; reason = "a generic name — release output lives here too, removed only by id";
  } else if (item.scope === "project" && facts.sharedProject) {
    cls = "can"; reason = "a live session on another host shares this checkout";
  }

  return { class: cls, reason, route };
}

// Oldest newest_ms first; a null/unknown age never sorts as "oldest" (it
// never reaches "should" in the first place, so this mainly matters for
// direct callers testing the sort itself); ties by path in code-unit order,
// which is what JavaScript's own `<`/`>` on strings already gives.
export function orderOldestFirst(items) {
  return [...items].sort((a, b) => {
    const an = a.newest_ms ?? Infinity;
    const bn = b.newest_ms ?? Infinity;
    if (an !== bn) return an - bn;
    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  });
}

// The KIND of item Decision 3 lets a machine-wide limit see at all: a
// project-scope match only — an outermost CACHEDIR.TAG, or a registry name
// the walk marked "sure" — BOTH confirmed git-ignored (the ADR's own
// qualification string requires this for a tag match too, not only "sure":
// a CACHEDIR.TAG directory nobody's own ignore rules cover yet is not
// assumed safe for an UNATTENDED sweep, even though a human's `--apply <id>`
// may still remove it directly). Never a project-origin artifact either — a
// project's own toolchains data is less trusted than the shipped registry
// (the same reasoning behind routeFor's own shipped-only bypass) and must
// never make itself eligible for automatic, no-questions-asked removal. A
// generic name, a machine cache, or anything nobody confirmed ignored never
// counts, so a limit can never hold hostage to output this plan is not
// allowed to remove automatically anyway.
function qualifiesForLimitKind(item) {
  return item.scope === "project" && item.origin !== "project"
    && (item.match === "tag" || item.match === "sure") && item.ignored === true;
}

// What counts towards a machine-wide limit's OWN total (the amended ADR,
// Decision 3) — every item of the qualifying kind, counted whatever its own
// class (idle or not): the limit tracks total footprint, not just what
// happens to be pickable right now.
export function countedBytes(items) {
  return items.filter(qualifiesForLimitKind).reduce((sum, it) => sum + (it.bytes || 0), 0);
}

// Whether an already-classified item is one a machine-wide limit may
// actually PICK, not merely count towards its total: the same kind
// qualification as countedBytes, already classified "should", AND idle past
// whichever is LARGER of the ADR's own 7-day floor or the item's own
// stale_days — a registry entry's shorter stale_days can still make an item
// "should" sooner for a human's own `waypost clean`, but must never let an
// unattended automatic sweep remove it before 7 days.
export function qualifiesForLimit(item, now = Date.now()) {
  if (item.class !== "should") return false;
  if (!qualifiesForLimitKind(item)) return false;
  if (item.newest_ms == null) return false;
  const floorDays = Math.max(DEFAULT_PROJECT_STALE_DAYS, Number.isFinite(item.stale_days) ? item.stale_days : 0);
  return (now - item.newest_ms) / DAY_MS > floorDays;
}

// Which already-classified items (classify()'s own per-item output, each
// carrying `class`) a limit would pick: qualifying items oldest first, only
// as many as bring the counted total at or under the limit — never a "can"
// item, whatever the limit. `limitBytes` of null or undefined picks nothing
// (no limit set).
export function pickUnderLimit(classifiedItems, limitBytes, now = Date.now()) {
  const picks = new Set();
  if (limitBytes == null) return picks;
  let total = countedBytes(classifiedItems);
  if (total <= limitBytes) return picks;
  const eligible = orderOldestFirst(classifiedItems.filter((it) => qualifiesForLimit(it, now)));
  for (const it of eligible) {
    if (total <= limitBytes) break;
    picks.add(it.path);
    total -= (it.bytes || 0);
  }
  return picks;
}

// The whole plan: every item classified, with a stable id and, when a limit
// is given, which "should" items it would pick. `facts` is everything
// bin/waypost gathered outside this module (now, runningTools, leases,
// sharedProject, home/root/stateDir/platform for refusePath) — merged with
// `now` here so every item sees the same clock.
export function classify(items, facts = {}, { now = Date.now(), limit = null } = {}) {
  const f = { ...facts, now };
  const classified = items.map((item) => {
    const r = classifyItem(item, f);
    return { ...item, id: itemId(item.scope, item.path), class: r.class, reason: r.reason, route: r.route };
  });
  const picks = pickUnderLimit(classified, limit, now);
  return classified.map((it) => ({ ...it, picked: picks.has(it.path) }));
}

// Re-classifies one item against fresh facts read right before its own
// removal (the apply story, WP-17): gone, replaced by a symlink or junction,
// or otherwise changed identity (dev/ino) is reported as `changed`, never
// removed through even if the fresh facts would otherwise classify it
// should/can. `fresh` is inspectDir's own facts for this one path, plus (for
// a project item) `ignored`/`tracked` from a gitFacts call scoped to just
// this path — both optional, so a caller that never re-checked git status
// (a machine item, or a caller happy with the plan's own facts) still works
// exactly as before.
export function recheck(item, fresh, facts = {}) {
  if (!fresh || fresh.exists === false) return { class: "keep", reason: "no longer exists", route: null, changed: true };
  if (fresh.is_symlink) return { class: "keep", reason: "replaced by a symlink", route: null, changed: true };
  // A plain file where a directory used to be — inspectDir reports no
  // bytes/newest_ms/dev/ino for this shape, so relying on the identity
  // check below alone would miss it whenever the ORIGINAL item never
  // captured dev/ino either (a budget-cut match, dev: null/ino: null).
  // Caught here explicitly instead, before that check ever runs.
  if (fresh.is_directory === false) return { class: "keep", reason: "no longer a directory", route: null, changed: true };
  const identityChanged = item.dev != null && item.ino != null && (fresh.dev !== item.dev || fresh.ino !== item.ino);
  // other_fs (a mount point) must come from `fresh` too — a filesystem
  // mounted inside this item AFTER the plan was built is exactly the case
  // this re-check exists for; carrying over the plan's own (stale) value
  // would let a recursive removal cross into it.
  const merged = {
    ...item, newest_ms: fresh.newest_ms, nested_git: fresh.nested_git, unreadable: fresh.unreadable,
    other_fs: fresh.other_fs, dev: fresh.dev, ino: fresh.ino,
    ...(fresh.ignored !== undefined ? { ignored: fresh.ignored } : {}),
    ...(fresh.tracked !== undefined ? { tracked: fresh.tracked } : {}),
  };
  const result = classifyItem(merged, facts);
  return { ...result, changed: identityChanged };
}

// The yes, decided from facts bin/waypost already gathered (a flag pair, or
// a terminal with no harness detected) — never itself reads a flag, an
// environment variable or a keystroke. `method: "prompt"` means the caller
// still has to actually ask (this module has no I/O); everything else is a
// final answer.
export function consent({ yes = false, reason = null, isTTY = false, harnessDetected = false } = {}) {
  // A reason of all whitespace is not a reason — `--reason "   "` must be
  // refused the same as no --reason at all, not accepted as a truthy string.
  const trimmedReason = typeof reason === "string" ? reason.trim() : reason;
  if (yes && trimmedReason) return { method: "flag", ok: true, reason: trimmedReason };
  if (isTTY && !harnessDetected) return { method: "prompt", ok: null };
  return {
    method: "refused", ok: false,
    reason: "no --yes --reason, and no interactive terminal without a harness detected — see `waypost prompt cleanup`",
  };
}

// One JSONL log line, as a string with no trailing newline — bin/waypost
// appends "\n" and the file handle; this module never opens one.
export function logLine(entry) {
  return JSON.stringify({ v: 1, kind: "apply", ...entry });
}
