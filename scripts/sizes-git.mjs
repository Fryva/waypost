import { lstatSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { gitCommonDir } from "./lib.mjs";

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
export function gitIgnoredSet(root, relPaths, timeoutMs = 15000) {
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
export function gitTrackedDirs(root, relPaths, timeoutMs = 15000) {
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

