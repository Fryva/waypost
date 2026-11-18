// Waypost CLI: auto-clean.
import { REMOVING_DIR, bindingInfo, readCleanupSetting, resolveVaultPath, treesOverlap } from "../../scripts/lib.mjs";
import { gatherCleanContext, planFromContext } from "./clean-plan.mjs";
import { GB, ROOT, SCRIPT_URL, bootAuthority, cleanNow, lastCleanNowHonored } from "./core.mjs";
import { purgeLeftovers, renameForRemoval, spawnDeleter } from "./deleter.mjs";
import { APFS_FREE_SPACE_NOTE, appendCleanLog, recheckItem } from "./remove.mjs";
import { legacySlotsDirs, selfMarker, slotsDir } from "./slots.mjs";
import { existsSync, readFileSync, realpathSync, statSync, statfsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

// ─── the automatic path at the end of `waypost run --heavy` ────────────
// (the amended machine-wide-limit ADR, Decision 4)

// WAYPOST_AUTOCLEAN_PROBE overrides the automatic path's own deadline, adds
// a synchronous pause after each rename, and substitutes for one statfs
// reading — for hermetic tests only, honoured only under NODE_TEST_CONTEXT
// (the same posture WAYPOST_CLEAN_NOW/WAYPOST_CAPACITY_PROBE already use),
// announced on stderr once. `deadline_ms` may only SHORTEN the real 60s
// deadline, never lengthen it — a test cannot accidentally let a real
// automatic sweep run longer than the ADR allows.
let warnedAutoCleanProbe = false;
function autoCleanProbe() {
  const raw = process.env.WAYPOST_AUTOCLEAN_PROBE;
  if (!raw || !process.env.NODE_TEST_CONTEXT) return null;
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (!parsed || typeof parsed !== "object") return null;
  if (!warnedAutoCleanProbe) {
    warnedAutoCleanProbe = true;
    process.stderr.write("waypost: WAYPOST_AUTOCLEAN_PROBE is set — the automatic cleanup path is not running unmodified (tests only)\n");
  }
  return parsed;
}

function autoCleanPause(ms, count) {
  if (!Number.isFinite(ms) || ms <= 0) return;
  process.stderr.write(`waypost: test pause after ${count} rename(s)\n`);
  const sab = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(sab), 0, 0, ms);
}

// The vault path, read by hand: never readConfig() (which calls fail() —
// process.exit — on a config that exists but will not parse) and never
// bindingInfo()'s own throw either, though it does not throw in normal use.
// `unreadable` (a binding file that EXISTS but will not parse) is the one
// case the automatic path treats as a reason to skip — a config that is
// simply absent is an ordinary "no vault here".
function autoCleanVault() {
  let p;
  try { p = bindingInfo().path; } catch { return { vault: null, unreadable: true }; }
  if (!existsSync(p)) return { vault: null, unreadable: false };
  try {
    const cfg = JSON.parse(readFileSync(p, "utf8"));
    const raw = cfg && typeof cfg === "object" ? cfg.vault_path : null;
    if (!raw) return { vault: null, unreadable: false };
    const resolved = resolveVaultPath(raw);
    return { vault: resolved && existsSync(resolved) ? resolved : null, unreadable: false };
  } catch { return { vault: null, unreadable: true }; }
}

// Items whose owning entry keeps them off the automatic path entirely — a
// generic name, a distributable package inside, or auto: false — distinct
// from an ordinary "should" item nothing else is wrong with. Named in the
// report so "why isn't X touched" has an answer beyond "it wasn't picked".
function autoExcludedReasonOf(item) {
  if (item.scope !== "project" || item.origin === "project") return null;
  if (item.match === "generic") return "a generic name — release output lives there too, removed only by id";
  if (!(item.match === "tag" || item.match === "sure")) return null;
  if (item.holds_package === true) return `holds a distributable package${item.package ? ` (${item.package})` : ""}`;
  if (item.auto === false) return "opted out (auto: false)";
  return null;
}

function autoCleanupReport(rec) {
  if (rec.result === "failed") { process.stderr.write(`waypost: automatic cleanup failed — ${rec.reason}\n`); return; }
  if (rec.result === "skipped") { process.stderr.write(`waypost: automatic cleanup skipped — ${rec.reason}\n`); return; }
  if (rec.renamed.length) {
    const bytes = rec.renamed.reduce((s, r) => s + (r.bytes || 0), 0);
    process.stderr.write(`waypost: automatic cleanup renamed ${rec.renamed.length} item(s), ${(bytes / GB).toFixed(2)} GB, for removal\n`);
  }
  const freedBytes = rec.renamed.reduce((s, r) => s + (r.bytes || 0), 0);
  const stillShort = (rec.need || 0) - freedBytes;
  if (stillShort > 0) {
    if (rec.limit.kind === "gb") {
      process.stderr.write(`waypost: ${(stillShort / GB).toFixed(2)} GB over the limit is protected by the 1-day rule — raise it: \`waypost clean --limit <N>\`\n`);
    } else {
      process.stderr.write(`waypost: ${(stillShort / GB).toFixed(2)} GB short of the free-space floor — \`waypost size --global\` (${APFS_FREE_SPACE_NOTE})\n`);
    }
  }
  if (rec.deadline) process.stderr.write("waypost: automatic cleanup stopped at its 60s deadline\n");
  if (rec.excluded.length) process.stderr.write(`waypost: ${rec.excluded.length} idle item(s) never on the automatic path — waypost clean for detail\n`);
  if (rec.nested_skipped) process.stderr.write(`waypost: ${rec.nested_skipped} nested repository/repositories never entered by this tree's walk\n`);
  const walked = (rec.trees || []).filter((t) => t.path && t.walked).length;
  const skippedTrees = (rec.trees || []).filter((t) => t.path && t.skipped).length;
  if (walked || skippedTrees) process.stderr.write(`waypost: other worktrees of this repository: ${walked} walked, ${skippedTrees} skipped — the cleanup log names each\n`);
}

function safeRealpath(p) {
  try { return realpathSync(p); } catch { return p; }
}

// The repository's other work trees (disk-space ADR, Decision 2): every
// `git worktree list` entry but the job's own tree and a bare one, the main
// worktree included. A failed or timed-out git yields `error`.
function otherWorkTrees(common, root, deadline) {
  const timeout = Math.max(1, Math.min(5000, deadline - Date.now()));
  let r;
  try { r = spawnSync("git", ["--git-dir", common, "worktree", "list", "--porcelain"], { encoding: "utf8", timeout }); }
  catch (e) { return { trees: [], error: e.message }; }
  if (r.status !== 0) return { trees: [], error: r.error ? r.error.message : `git worktree list exited ${r.status}` };
  const fold = process.platform === "darwin" || process.platform === "win32";
  const key = (p) => { const r = safeRealpath(p).replace(/\\/g, "/"); return fold ? r.toLowerCase() : r; };
  const ours = key(root);
  const gitDir = key(common);
  const trees = [];
  for (const block of String(r.stdout).split(/\r?\n\r?\n/)) {
    const lines = block.split(/\r?\n/).filter(Boolean);
    const head = lines.find((l) => l.startsWith("worktree "));
    if (!head || lines.includes("bare")) continue;
    const path = head.slice("worktree ".length);
    // A submodule or --separate-git-dir lists its git dir as the main tree.
    const at = key(path);
    if (at === ours || at === gitDir || at.startsWith(gitDir.endsWith("/") ? gitDir : gitDir + "/")) continue;
    trees.push({ path, prunable: lines.some((l) => l === "prunable" || l.startsWith("prunable ")) });
  }
  return { trees, error: null };
}

// Why another work tree stays off this sweep (the ADR's skip list), or null.
// A live session counts when its root is the tree or inside it; one rooted
// above it counts only while it holds a lease, which cannot be matched to
// this tree's items (keys are relative to the holder's root).
function workTreeSkipReason(tree, { cleanup, presence, capacity, claim, commonDev, home, sessions, leaseHolders }) {
  if (tree.prunable) return "prunable";
  if (!existsSync(tree.path)) return "missing";
  const wt = safeRealpath(tree.path);
  let dev;
  try { dev = statSync(wt).dev; } catch (e) { return e.message; }
  if (dev !== commonDev) return "on another filesystem than the git directory";
  if (cleanup.refusePath(wt, { home, platform: process.platform })) return "a protected path";
  const storage = presence.storageOf(wt);
  if (storage.kind !== "local") return `on ${storage.provider} (${storage.kind}) — not local storage`;
  const holders = capacity.readHolders({ dir: slotsDir(presence), dirs: legacySlotsDirs(presence), authority: bootAuthority(capacity) });
  const blocking = capacity.blockingHolder(holders.live, { self: claim.id, root: wt, platform: process.platform, canon: safeRealpath });
  if (blocking) return `a heavy job overlaps it (${blocking.holder.id})`;
  const inside = (p) => { const pc = safeRealpath(p); return treesOverlap(pc, wt, { platform: process.platform }) && pc.length >= wt.length; };
  const live = sessions.find((p) => p.project_root && inside(p.project_root));
  if (live) return `a live session works there (${live.session}${live.host ? ` on ${live.host}` : ""})`;
  const above = (p) => { const pc = safeRealpath(p); return treesOverlap(pc, wt, { platform: process.platform }) && pc.length < wt.length; };
  const leasing = sessions.find((p) => p.project_root && leaseHolders.has(p.session) && above(p.project_root));
  if (leasing) return `a live session above it holds a lease (${leasing.session}${leasing.host ? ` on ${leasing.host}` : ""})`;
  return null;
}

// One JSONL line (matching scripts/cleanup.mjs's own logLine shape by
// hand — see `finish` above) plus the stderr report, for every outcome
// autoCleanup reaches past the very first (silent) check. A log-write
// failure here is reported inline, never thrown — the outcome itself was
// real work already decided, and losing the log must not hide it.
function logAndReportAuto(rec, host) {
  const line = JSON.stringify({ v: 1, ...rec });
  try { appendCleanLog(host, line); }
  catch (e) { process.stderr.write(`waypost: automatic cleanup's log line was not written: ${e.message}\n`); }
  autoCleanupReport(rec);
  return rec;
}

// The whole automatic path, run under the slot `run --heavy` still holds
// (the ADR, Decision 4), in the exact order the ADR lists its conditions.
// `ended` carries how the wrapped command finished: `status` (its own exit
// status, for the log's own `exit` field), `signal` (the signal that
// actually killed it, if any), `interrupted` (a signal THIS wrapper caught,
// even when the child then exited on its own terms — a tool trapping
// Ctrl-C and exiting 130 itself is treated exactly the same as one the
// signal killed outright), and `spawnFailed`. Every early return past the
// very first is logged (`kind: "auto"`) and briefly reported on stderr;
// the very first (no setting at all) is silent — a machine that never set
// a limit must see nothing from this at all.
async function autoCleanup({ claim, where, ended, capacity, presence }) {
  const host = presence.hostSlug();
  const setting = readCleanupSetting({ host });
  if (!setting || !setting.limit || setting.limit.kind === "off") return;

  const t0 = Date.now();
  const probe = autoCleanProbe();
  const deadlineMs = probe && Number.isFinite(probe.deadline_ms) ? Math.min(60000, probe.deadline_ms) : 60000;
  const deadline = t0 + deadlineMs;
  const session = process.env.WAYPOST_SESSION_ID || null;
  const limit = setting.limit;

  // Builds the log record only — never writes or reports it (logAndReportAuto
  // does that, right after every call site below): the very first checks run
  // before `cleanup` is even imported, so this cannot depend on
  // cleanup.logLine — it matches that function's own shape (v:1, plus every
  // field given) by hand instead.
  const finish = (result, reason, fields = {}) => ({
    kind: "auto", at: new Date().toISOString(), host, session,
    cwd: where ? where.cwd : null, root: where ? where.root : null,
    exit: ended.status, limit, result, reason: reason || null,
    ...fields,
  });

  try {
    if (ended.signal || ended.interrupted) return logAndReportAuto(finish("skipped", `ended by ${ended.signal || ended.interrupted}`), host);
    if (ended.spawnFailed) return logAndReportAuto(finish("skipped", "did not start"), host);
    if (!where || !where.root || !where.common) return logAndReportAuto(finish("skipped", "not in a git work tree"), host);

    let cleanup;
    try { cleanup = await import(SCRIPT_URL("cleanup")); }
    catch (e) { return logAndReportAuto(finish("failed", e.message), host); }

    // Pinned to the executable's own tree, never WAYPOST_HOME: an agent
    // pointing that elsewhere must not be able to steer which registry the
    // automatic path reads, the same reasoning as the gate in `--limit`.
    process.env.WAYPOST_PROJECT_DIR = where.root;
    const root = where.root;

    // First, whatever the conditions below decide (the ADR: "Any cleanup,
    // manual or automatic, first purges what an interrupted run left").
    const purge = purgeLeftovers(where, { capacity, presence });
    const adopted = purge.handed_off.length;

    const home = safeRealpath(homedir());
    if (cleanup.refusePath(root, { home, platform: process.platform })) {
      return logAndReportAuto(finish("skipped", "a protected path", { adopted }), host);
    }

    const storage = presence.storageOf(root);
    if (storage.kind !== "local") {
      return logAndReportAuto(finish("skipped", `on ${storage.provider} (${storage.kind}) — not local storage`, { adopted }), host);
    }

    let rootDev, commonDev;
    try { rootDev = statSync(root).dev; commonDev = statSync(where.common).dev; }
    catch (e) { return logAndReportAuto(finish("failed", e.message, { adopted }), host); }
    if (commonDev !== rootDev) {
      return logAndReportAuto(finish("skipped", "the git directory is on another filesystem", { adopted }), host);
    }

    const holdersNow = capacity.readHolders({ dir: slotsDir(presence), dirs: legacySlotsDirs(presence), authority: bootAuthority(capacity) });
    const blocking = capacity.blockingHolder(holdersNow.live, { self: claim.id, root, platform: process.platform, canon: safeRealpath });
    if (blocking) {
      return logAndReportAuto(finish("skipped", `another heavy job overlaps this tree (${blocking.holder.id})`, { adopted }), host);
    }

    const { vault, unreadable } = autoCleanVault();
    if (unreadable) {
      return logAndReportAuto(finish("skipped", "the project binding is unreadable", { adopted }), host);
    }
    if (vault) {
      const shared = presence.sharedTree(vault, { self: process.env.WAYPOST_SESSION_ID || null, contain: true });
      if (shared.shared) {
        const who = presence.sharedWith ? presence.sharedWith(shared) : shared.with.map((w) => `${w.session} on ${w.host}`).join("; ");
        return logAndReportAuto(finish("skipped", `shared with ${who}`, { adopted }), host);
      }
    }

    if (Date.now() > deadline) {
      return logAndReportAuto(finish("skipped", "deadline", { adopted }), host);
    }

    let sizes, toolchains, discovery;
    try {
      sizes = await import(SCRIPT_URL("sizes"));
      toolchains = await import(SCRIPT_URL("toolchains"));
      discovery = await import(SCRIPT_URL("discovery"));
    } catch (e) { return logAndReportAuto(finish("failed", e.message, { adopted }), host); }
    const mods = { cleanup, sizes, toolchains, presence, discovery };

    // The registry itself, not only its own resolution above: loadRegistry
    // (inside gatherCleanContext) reads pluginRoot(), which honours
    // WAYPOST_HOME/CLAUDE_PLUGIN_ROOT — pinned to this executable's own
    // tree for exactly as long as that one call needs it.
    const savedHome = process.env.WAYPOST_HOME;
    process.env.WAYPOST_HOME = ROOT;
    let ctx;
    try {
      ctx = gatherCleanContext(mods, { root, vault, includeMachine: false, walk: { stopAtGit: true, locators: false, deadline } });
    } finally {
      if (savedHome === undefined) delete process.env.WAYPOST_HOME; else process.env.WAYPOST_HOME = savedHome;
    }

    // The walk can finish in time and still leave its git calls cut at the
    // deadline: their conservative answer counts nothing, which must read as
    // the deadline, not as a quiet "ran, nothing to do".
    if (ctx.scan && (ctx.scan.stopped_by === "deadline" || Date.now() >= deadline)) {
      return logAndReportAuto(finish("ran", "deadline", {
        counted: 0, need: 0, shortfall: 0, renamed: [], skipped_items: [], stayed: [], excluded: [],
        nested_skipped: ctx.scan.nested_skipped, deadline: true, elapsed_ms: Date.now() - t0,
        deleter_pid: null, adopted, ...(lastCleanNowHonored ? { clock: process.env.WAYPOST_CLEAN_NOW } : {}),
      }), host);
    }

    const now = cleanNow();
    // Decision 2: the repository is one project for the limit — every other
    // work tree is walked by the same rules, items counted and picked
    // together; `ctxOf` keeps each item's context for its re-check.
    const ctxOf = new Map();
    const classified = [];
    const addTree = (c) => { for (const it of planFromContext(c, cleanup, now)) { ctxOf.set(it, c); classified.push(it); } };
    addTree(ctx);
    const trees = [];
    const listed = otherWorkTrees(where.common, root, deadline);
    if (listed.error) trees.push({ path: null, skipped: `could not list worktrees: ${listed.error}` });
    let sessions = [];
    let leaseHolders = new Set();
    if (vault && listed.trees.length) {
      try {
        sessions = presence.peers(vault, { self: session }).peers.filter((p) => p.live && !p.self);
        leaseHolders = new Set(presence.readLeases(vault, { self: session }).filter((l) => l.live && !l.mine).map((l) => l.session));
      } catch (e) { sessions = null; trees.push({ path: null, skipped: `live sessions unreadable: ${e.message}` }); }
    } else if (listed.trees.length) {
      trees.push({ path: null, note: "no bound vault — no live sessions to check" });
    }
    // Other trees' walks get 2/3 of the time left; the rest is for renames.
    const walkDeadline = Math.min(deadline, Date.now() + Math.floor((deadline - Date.now()) * 2 / 3));
    for (const tree of listed.trees) {
      if (Date.now() >= walkDeadline) { trees.push({ path: safeRealpath(tree.path), skipped: "deadline" }); continue; }
      const why = sessions === null ? "live sessions unreadable"
        : workTreeSkipReason(tree, { cleanup, presence, capacity, claim, commonDev, home, sessions, leaseHolders });
      if (why) { trees.push({ path: safeRealpath(tree.path), skipped: why }); continue; }
      const wt = safeRealpath(tree.path);
      process.env.WAYPOST_HOME = ROOT;
      let c;
      try {
        c = gatherCleanContext(mods, { root: wt, vault, includeMachine: false, walk: { stopAtGit: true, locators: false, deadline: walkDeadline } });
      } catch (e) { trees.push({ path: safeRealpath(tree.path), skipped: e.message }); continue; }
      finally {
        if (savedHome === undefined) delete process.env.WAYPOST_HOME; else process.env.WAYPOST_HOME = savedHome;
      }
      if (c.scan && (c.scan.stopped_by === "deadline" || Date.now() >= walkDeadline)) {
        trees.push({ path: wt, skipped: "deadline" }); continue;
      }
      // The re-check right before a rename runs under the sweep's deadline.
      c.deadline = deadline;
      addTree(c);
      trees.push({ path: wt, walked: true });
    }
    const label = (it) => (ctxOf.get(it) === ctx ? (it.rel || it.path) : it.path);

    let shortfall = 0;
    let dev = null;
    if (limit.kind === "free") {
      if (probe && probe.statfs) {
        shortfall = cleanup.shortfallOf({ size: probe.statfs.size, avail: probe.statfs.avail }, limit.percent);
      } else {
        try {
          const s = statfsSync(root);
          shortfall = cleanup.shortfallOf({ size: s.blocks * s.bsize, avail: s.bavail * s.bsize }, limit.percent);
        } catch { /* best effort — shortfall stays 0 */ }
      }
      try { dev = statSync(root).dev; } catch { /* best effort */ }
    }
    const { counted, need, eligible } = cleanup.limitNeed(classified, limit, now, { shortfall, dev });
    // "should" alone would miss a generic name — capped at "can" by
    // classifyItem itself, never "should", however idle — so this checks
    // every non-"keep" item instead: the report's own point is "why isn't
    // this on the automatic path", and a generic name is exactly such a
    // case, not merely idle.
    const excludedList = classified
      .filter((it) => it.class !== "keep" && autoExcludedReasonOf(it))
      .map((it) => ({ id: it.id, path: label(it), reason: autoExcludedReasonOf(it) }));

    const removingDir = join(where.common, REMOVING_DIR);
    const marker = selfMarker(capacity, presence);
    const renamed = [];
    const skippedItems = [];
    let freed = 0;
    let deadlineHit = false;
    let holderBlocked = null;
    const oldSlots = legacySlotsDirs(presence);
    let i = 0;
    for (; i < eligible.length; i++) {
      if (freed >= need) break;
      if (Date.now() > deadline) { deadlineHit = true; break; }
      const item = eligible[i];
      const itemCtx = ctxOf.get(item) || ctx;
      const holders = capacity.readHolders({ dir: slotsDir(presence), dirs: oldSlots, authority: bootAuthority(capacity) });
      const hit = capacity.blockingHolder(holders.live, { self: claim.id, root: itemCtx.root, platform: process.platform, canon: safeRealpath });
      if (hit) { holderBlocked = hit; break; }
      const rc = recheckItem(item, itemCtx, mods, now);
      if (rc.changed || !cleanup.qualifiesForLimit({ ...rc.item, class: rc.class }, now)) {
        skippedItems.push({ id: item.id, path: label(item), reason: rc.changed ? "changed since the plan was built" : (rc.reason || "no longer qualifies") });
        continue;
      }
      const renResult = renameForRemoval(item, removingDir, marker);
      if (!renResult.ok) {
        skippedItems.push({ id: item.id, path: label(item), reason: renResult.reason });
        continue;
      }
      const bytes = Number.isFinite(rc.fresh.bytes) ? rc.fresh.bytes : item.bytes;
      renamed.push({ id: item.id, path: label(item), bytes, name: renResult.name });
      freed += bytes || 0;
      autoCleanPause(probe && probe.pause_ms, renamed.length);
    }
    const stayed = eligible.slice(i).map((it) => ({ id: it.id, path: label(it), bytes: it.bytes }));
    const deleterPid = renamed.length ? spawnDeleter(removingDir, renamed.map((r) => r.name), marker) : null;

    const reason = deadlineHit ? "deadline" : (holderBlocked ? `another heavy job overlaps a tree being cleaned (${holderBlocked.holder.id})` : null);
    return logAndReportAuto(finish("ran", reason, {
      counted, need, shortfall, renamed, skipped_items: skippedItems.slice(0, 20), trees,
      stayed: stayed.slice(0, 20), excluded: excludedList.slice(0, 20),
      nested_skipped: ctx.scan ? ctx.scan.nested_skipped : 0, deadline: deadlineHit,
      elapsed_ms: Date.now() - t0, deleter_pid: deleterPid, adopted,
      ...(lastCleanNowHonored ? { clock: process.env.WAYPOST_CLEAN_NOW } : {}),
    }), host);
  } catch (e) {
    return logAndReportAuto(finish("failed", e.message), host);
  }
}

export { warnedAutoCleanProbe, autoCleanProbe, autoCleanPause, autoCleanVault, autoExcludedReasonOf, autoCleanupReport, safeRealpath, logAndReportAuto, autoCleanup };
