// Waypost CLI: remove.
import { ensureMachineStateDir } from "../../scripts/lib.mjs";
import { factsFrom } from "./clean-plan.mjs";
import { spawnSync } from "node:child_process";
import { appendFileSync, lstatSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

// Ancestors before descendants: sorted by path depth, so a directory chosen
// alongside one of its own subdirectories (a project and a machine item can
// coincide in principle) is always removed before whatever sits inside it.
function orderForRemoval(items) {
  return [...items].sort((a, b) => {
    const da = a.path.split(sep).length, db = b.path.split(sep).length;
    return da !== db ? da - db : (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  });
}

function isDescendantOf(p, ancestor) {
  return p !== ancestor && p.startsWith(ancestor + sep);
}

// ─── recheck, right before touching anything ───────────────────────────

// Fresh facts for exactly one item: inspectDir for its own bytes/age/nested-
// repo/readability, gitFacts scoped to just this one path (project items
// only — a locator match lives outside the project, so its git status is
// not this repository's to answer), the live process table, leases and
// sharedTree — all re-read, never carried over from the plan.
function freshFactsFor(item, ctx, mods, now) {
  const { sizes, cleanup, presence } = mods;
  // keepSuffixes: without it inspectDir's own default (empty) means a
  // package that appeared since the plan was built could never be caught
  // by a re-check right before removal — the automatic path's own re-check
  // (autoCleanup) depends on this exactly as much as a manual --apply does.
  const inspected = sizes.inspectDir(item.path, { metadata: ctx.metadataNames, keepSuffixes: sizes.keepSuffixesOf(ctx.reg.entries) });
  let ignored, tracked;
  if (item.scope === "project" && item.match !== "locator" && inspected.exists && inspected.is_directory) {
    const rel = relative(ctx.root, item.path);
    const gf = sizes.gitFacts(ctx.root, [rel]);
    ignored = gf.ignored.has(rel);
    tracked = gf.tracked.has(rel);
  }
  const table = ctx.platform === "win32" ? null : presence.processTable();
  const comms = table ? [...table.values()].map((p) => p.comm).filter(Boolean) : [];
  const runningTools = cleanup.runningTools(ctx.reg.entries, comms);
  // Recomputed against this FRESH runningTools, not carried over from the
  // plan's own ctx.projectEcosystemRunning — a project ecosystem tool can
  // have started or stopped since the plan was built, and a tag/generic
  // match's only in-use signal (classifyItem) must reflect that.
  const projectEcosystemRunning = (ctx.projectEcosystems || []).some((e) => runningTools.has(e.id));
  let leases = [];
  let sharedProject = false;
  if (ctx.vault) {
    const sess = process.env.WAYPOST_SESSION_ID || null;
    leases = presence.readLeases(ctx.vault, { self: sess }).filter((l) => l.live && !l.mine)
      .map((l) => ({ path: l.path, session: l.session, host: l.host }));
    sharedProject = presence.sharedTree(ctx.vault, { self: sess }).shared;
  }
  const fresh = { ...inspected, ...(ignored !== undefined ? { ignored } : {}), ...(tracked !== undefined ? { tracked } : {}) };
  return { fresh, facts: factsFrom({ ...ctx, runningTools, leases, sharedProject, projectEcosystemRunning }, now) };
}

function recheckItem(item, ctx, mods, now) {
  const { fresh, facts } = freshFactsFor(item, ctx, mods, now);
  return { ...mods.cleanup.recheck(item, fresh, facts), fresh };
}

function findCacheDef(reg, toolId, itemKey) {
  if (!toolId || !itemKey) return null;
  const entry = reg.entries.find((e) => e.id === toolId);
  if (!entry) return null;
  return (entry.caches || []).find((c) => c.path === itemKey) || null;
}

// A machine cache's own path re-checked right before removing it: when the
// shipped entry has an `ask` AND the route about to run is the tool's own
// clean_argv, the tool is asked again, and a path it no longer reports is
// skipped rather than removed from under a moved cache. Re-asking is scoped
// to a clean_argv route specifically — that is the one route that hands off
// to the TOOL itself, so it is the one place it matters whether the tool
// would now target somewhere else; a waypost-remove route never runs the
// tool at all, and (per routeFor, scripts/cleanup.mjs, decided already at
// plan time via `askedNonDefault`) is only ever given to a path already
// known to match its own default resolution.
function machinePathStillSafe(item, ctx, mods, route) {
  if (item.scope !== "machine") return { ok: true };
  if (route && route.kind === "tool-clean-argv") {
    const def = findCacheDef(ctx.reg, item.tool, item.item);
    if (def && def.ask && Array.isArray(def.ask.argv) && def.ask.argv.length) {
      const bin = mods.discovery.findOnPath(def.ask.argv[0], { platform: ctx.platform, env: process.env });
      if (bin) {
        let asked;
        try { asked = mods.toolchains.askCache(def.ask, { bin, env: process.env, home: ctx.home, platform: ctx.platform }); }
        catch { asked = { ok: false }; }
        if (asked.ok && !asked.value.includes(item.path)) {
          return { ok: false, reason: "the tool now reports a different cache location — re-plan with `waypost clean`" };
        }
      }
    }
  }
  // Defense in depth: routeFor itself already refuses a waypost-remove
  // route for an asked path whose plan-time askedNonDefault was true —
  // recheck() never changes that field, so this only ever re-states the
  // same refusal the plan already made, never a route that reached here.
  if (item.source === "asked" && item.askedNonDefault === true && route && route.kind === "waypost-remove") {
    return { ok: false, reason: "an asked (non-default) cache path is removed only through its own clean_argv" };
  }
  return { ok: true };
}

// ─── the routes themselves — the only removal calls in this whole tree ──

// `git clean -X` over a 35 GB target/, or `go clean -modcache` over a large
// module cache, can run for minutes — long enough that a short timeout would
// kill the process mid-removal and leave a half-deleted tree, reported as a
// clean "failed" with nothing actually verified. 30 minutes, the same order
// of magnitude `waypost run --heavy`'s own long jobs already run under,
// while still holding this command's own machine-wide slot the whole time.
const REMOVE_TIMEOUT_MS = 30 * 60 * 1000;

function removeItem(item, route, ctx, mods) {
  if (route.kind === "waypost-remove") {
    rmSync(item.path, { recursive: true });
    return;
  }
  if (route.kind === "git-clean-x") {
    const rel = relative(ctx.root, item.path);
    const r = spawnSync("git", ["--literal-pathspecs", "-C", ctx.root, "clean", "-X", "-d", "-f", "--", rel],
      { encoding: "utf8", timeout: REMOVE_TIMEOUT_MS });
    if (r.error) throw r.error;
    if (r.status !== 0) throw new Error(`git clean exited ${r.status}: ${(r.stderr || "").trim().slice(0, 300)}`);
    return;
  }
  if (route.kind === "tool-clean-argv") {
    const bin = mods.discovery.findOnPath(route.argv[0], { platform: ctx.platform, env: process.env });
    if (!bin) throw new Error(`${route.argv[0]} not found on PATH`);
    if (ctx.platform === "win32" && mods.toolchains.BATCH_SHIM_RE.test(bin)) {
      throw new Error(`${route.argv[0]} is a .cmd/.bat shim — refused, the same as asking it`);
    }
    // Project: the manifest directory (the item's own parent) — a tool's
    // project-clean command runs the way it would from a checkout. Machine:
    // home, the same cwd asking it already uses.
    const cwd = item.scope === "project" ? dirname(item.path) : ctx.home;
    const r = spawnSync(bin, route.argv.slice(1), { shell: false, stdio: ["ignore", "pipe", "pipe"], cwd, timeout: REMOVE_TIMEOUT_MS, encoding: "utf8" });
    if (r.error) throw r.error;
    if (r.status !== 0) throw new Error(`${route.argv[0]} exited ${r.status}: ${(r.stderr || "").trim().slice(0, 300)}`);
    return;
  }
  throw new Error("no route");
}

// What a partial git-clean-x left behind, best effort — never blocks the
// result itself if either read fails.
function describeKept(item, ctx, mods) {
  const parts = [];
  let inspected = null;
  try { inspected = mods.sizes.inspectDir(item.path, {}); } catch { /* best effort */ }
  if (inspected && inspected.nested_git) parts.push("a nested repository");
  try {
    const rel = relative(ctx.root, item.path);
    const gf = mods.sizes.gitFacts(ctx.root, [rel]);
    if (gf.tracked.has(rel)) parts.push("tracked file(s)");
  } catch { /* best effort */ }
  return parts.length ? parts.join(" and ") : "some content";
}

// lstat ENOENT is the only "removed" verdict; anything else that still
// exists but reads smaller than it did right before the route ran is
// "partial" — a real success for git-clean-x, which by design never removes
// a tracked file or a nested repository even when this module's own
// pre-checks somehow missed one. Anything else is "failed".
function verifyRemoval(item, ctx, mods, beforeBytes) {
  let st;
  try { st = lstatSync(item.path); }
  catch (e) {
    if (e.code === "ENOENT") return { result: "removed", freed_bytes: Number.isFinite(beforeBytes) ? beforeBytes : 0 };
    return { result: "failed", freed_bytes: 0, reason: `could not verify: ${e.message}` };
  }
  let after = null;
  try { after = mods.sizes.inspectDir(item.path, { metadata: ctx.metadataNames }); } catch { /* leaves after null */ }
  if (after && after.exists && Number.isFinite(after.bytes) && Number.isFinite(beforeBytes) && after.bytes < beforeBytes) {
    return { result: "partial", freed_bytes: beforeBytes - after.bytes, kept: describeKept(item, ctx, mods) };
  }
  return { result: "failed", freed_bytes: 0, reason: "still there after the route ran" };
}

// ─── consent, the log, and the apply loop itself ───────────────────────

const APFS_FREE_SPACE_NOTE = "free space is read with fs.statfsSync; bavail excludes APFS purgeable space, so freed space can read smaller than what was actually removed";

// Rotated at 1 MiB, keeping one previous file (the amended machine-wide-
// limit ADR): checked before every append, so the log itself never grows
// without bound on a machine where `run --heavy` logs one line per job
// indefinitely. renameSync onto an existing `.1` replaces it on every OS
// Node supports this on (POSIX rename(2) always replaces; Node's own
// implementation asks Windows to do the same) — no separate unlink needed.
const CLEAN_LOG_ROTATE_BYTES = 1024 * 1024;

function appendCleanLog(host, line) {
  const dir = ensureMachineStateDir();
  const file = join(dir, `cleanup.${host}.jsonl`);
  try {
    if (statSync(file).size >= CLEAN_LOG_ROTATE_BYTES) renameSync(file, `${file}.1`);
  } catch { /* no file yet — nothing to rotate */ }
  appendFileSync(file, line + "\n", "utf8");
}

function baseLogItem(item) {
  return { id: item.id, scope: item.scope, path: item.path, bytes: item.bytes, class: item.class, route: item.route };
}

function refusedLogItem(r) {
  return { id: r.id, scope: r.scope, path: r.path, bytes: r.bytes, class: r.class, route: r.route, result: "refused", reason: r.reason, freed_bytes: 0, kept: null };
}

export { orderForRemoval, isDescendantOf, freshFactsFor, recheckItem, findCacheDef, machinePathStillSafe, REMOVE_TIMEOUT_MS, removeItem, describeKept, verifyRemoval, APFS_FREE_SPACE_NOTE, CLEAN_LOG_ROTATE_BYTES, appendCleanLog, baseLogItem, refusedLogItem };
