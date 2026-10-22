// Waypost CLI: clean-plan.
import { machineStateDir, readCleanupSetting } from "../../scripts/lib.mjs";
import { GB, SCRIPT_URL, projectRoot, readConfig, tildeHome } from "./core.mjs";
import { existsSync, lstatSync, readFileSync, statfsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

// Whether a harness is running right now, checked the way the machine-wide-
// limit ADR's own gate checks it: WAYPOST_HARNESS is never trusted alone to
// say "no harness" (it could just be unset by whatever is asking) — the
// SAME detection is also run with it forced empty, so the real process
// ancestry and the registry's own env markers still have their say either
// way. Any failure along the way (the agents module itself, or the
// detection call) is read as "no harness detected" — the terminal check is
// the other half of this gate, so a session with neither a TTY nor a
// harness still needs --yes --reason regardless.
async function isHarnessDetected() {
  try {
    const agents = await import(SCRIPT_URL("agents"));
    if (agents.detectHarness(process.env) !== "unknown") return true;
    if (agents.detectHarness({ ...process.env, WAYPOST_HARNESS: "" }) !== "unknown") return true;
    return false;
  } catch {
    return false;
  }
}

// Gathers every project- and machine-scope item, plus every fact
// classification needs, once — the plan, `--apply` and `setup`'s own audit
// all build from this same context, so "should" always re-plans against the
// current state rather than a stale earlier run. `budget` bounds the
// project walk the way `waypost size` itself can be bounded (`clean` stays
// unbounded, its own existing behaviour; `setup`'s audit passes
// DEFAULT_ENTRY_BUDGET, the same fixed count `doctor` uses, so it stays
// deterministic there too). `includeMachine: false` skips the machine scope
// entirely — no profile read, no cache candidates resolved — for a caller
// that already knows this run has nothing fresh to say about it (`setup`,
// when discovery did not just refresh the machine profile).
// `root`/`vault` (the amended machine-wide-limit ADR's automatic path):
// override the project root and the vault instead of deriving them from
// projectRoot()/readConfig() — the automatic path may call neither
// (readConfig() calls fail(), which exits the process, and projectRoot()
// would read whatever WAYPOST_PROJECT_DIR happens to be at the MOMENT this
// runs, when autoCleanup wants the root it already resolved via slotWhere).
// `"vault" in opts` distinguishes "the caller resolved vault by hand, even
// to null" from "the caller never mentioned it" — handleClean and setup's
// own audit never pass it, and keep today's readConfig()-based lookup.
// `walk` forwards straight to scanProject (stopAtGit/locators/deadline);
// every default reproduces today's behaviour exactly.
function gatherCleanContext({ cleanup, sizes, toolchains, presence, discovery }, opts = {}) {
  const { budget = null, includeMachine = true, walk = {} } = opts;
  const root = opts.root || projectRoot();
  const home = homedir();
  const stateDir = machineStateDir();
  const platform = process.platform;

  // The vault, if any — read early: a lease is stored keyed the same way
  // `presence.vaultRel` spells it (vault-relative when the leased path sits
  // inside the bound vault, project-relative otherwise), and that function
  // is one-way — resolving a lease's own string back to an absolute path
  // would be genuinely ambiguous (the same relative string can spell a real
  // path under EITHER root). Every project item is instead run through the
  // SAME vaultRel() a lease went through, and compared as strings — no
  // inversion needed either way.
  const vault = "vault" in opts ? opts.vault : (() => {
    const cfg = readConfig();
    return cfg && cfg.vault_path && existsSync(cfg.vault_path) ? cfg.vault_path : null;
  })();

  const reg = toolchains.loadRegistry({ projectRoot: root, platform });
  const metadataNames = sizes.metadataNamesOf(reg.entries);

  // A project root that is itself home, an ancestor of home, or a
  // filesystem/drive root can never be a project to scan — scanProject
  // itself throws for $HOME and "/" outright, and an ancestor of home is no
  // safer a target. Reusing cleanup.refusePath here (home only, no `root`/
  // `stateDir` — those would make every path trivially "refused") is the
  // same protected-path logic every item is already checked against. Plan
  // the machine scope only, rather than throwing `waypost clean` (or
  // setup's own audit) down with it — there being no project bound here is
  // an ordinary state, not a failure.
  const projectScopeRefused = cleanup.refusePath(root, { home, platform });

  // Project scope: the project root is never an item (rootItem: false); a
  // batched git check-ignore/ls-files over every match this walk found, once,
  // gives classification the ignored/tracked facts it needs per item. A
  // locator match's own `path` is already absolute (outside the project),
  // so it never enters that batch.
  let projectItems = [];
  let projectEcosystems = [];
  let scan = null;
  if (!projectScopeRefused) {
    scan = sizes.scanProject(root, {
      registry: reg, rootItem: false, budget,
      stopAtGit: walk.stopAtGit, locators: walk.locators, deadline: walk.deadline,
    });
    const relCandidates = scan.dirs.filter((d) => d.match !== "locator").map((d) => d.path);
    const gf = sizes.gitFacts(root, relCandidates);
    projectItems = scan.dirs.map((d) => {
      const abs = d.match === "locator" ? d.path : resolve(root, d.path);
      return {
        scope: "project", path: abs, rel: d.match === "locator" ? null : d.path,
        leaseRel: vault ? presence.vaultRel(abs, vault) : abs,
        bytes: d.bytes, newest_ms: d.newest_ms, nested_git: d.nested_git,
        in_nested_repo: d.in_nested_repo, unreadable: d.unreadable, other_fs: d.other_fs, partial: d.partial, match: d.match,
        tool: d.tool, origin: d.origin, regenerable: d.regenerable, stale_days: d.stale_days,
        clean: d.clean, clean_argv: d.clean_argv, dev: d.dev, ino: d.ino,
        auto: d.auto, holds_package: d.holds_package, package: d.package,
        ignored: d.match === "locator" ? undefined : gf.ignored.has(d.path),
        tracked: d.match === "locator" ? undefined : gf.tracked.has(d.path),
      };
    });
    // The project's own detected ecosystems (scripts/discovery.mjs) — a tag
    // or generic match carries no owning tool of its own (see
    // classifyItem's projectEcosystemRunning check), so this is the only
    // in-use signal available for either kind.
    projectEcosystems = discovery.detectManifests(reg.entries, { projectRoot: root });
  }

  // Machine scope: a fresh profile's own caches (facts only — policy is
  // reattached from THIS registry, same as `size --global`), plus any
  // registry cache item the profile does not carry — measured directly, the
  // static fallback path `size --global` uses without a profile at all.
  const host = presence.hostSlug();
  const machineItems = [];
  if (includeMachine) {
    const machinePath = discovery.machineProfilePath({ home, host });
    let machine = null;
    if (existsSync(machinePath)) {
      try { machine = JSON.parse(readFileSync(machinePath, "utf8")); } catch { machine = null; }
    }
    const freshProfile = machine && machine.platform === platform
      && Array.isArray(machine.caches) && !discovery.needsRefresh(machine, {});
    const profileCaches = freshProfile ? sizes.scanGlobal({ profile: machine, registry: reg, platform }) : [];
    const covered = new Set(profileCaches.map((c) => c.path));
    // Same (tool, item) key as a profile cache, covered at ITS path above —
    // used below to tell a genuinely separate static candidate apart from a
    // leftover at a tool's OLD default location after its cache moved.
    const coveredKeys = new Set(profileCaches.map((c) => `${c.tool}::${c.item}`));
    const staticCandidates = sizes.cacheCandidates({ home, env: process.env, platform, registry: reg })
      .filter((c) => !covered.has(c.path));
    const extraCaches = sizes.measureCaches(staticCandidates, { metadata: metadataNames });
    // The plain env/default path of every cache item, for comparing an
    // "asked" path against — computed once, resolved with no asking at
    // all, so an asked path that merely happens to agree with the default
    // is never treated as if it had moved (see routeFor's own
    // askedNonDefault check, decided here at plan time rather than only
    // discovered later at apply time).
    const defaultOnly = toolchains.resolveCachePaths(reg.entries, { home, env: process.env, platform, ask: false });
    const defaultPathsByKey = new Map();
    for (const c of defaultOnly) {
      const key = `${c.tool}::${c.item}`;
      if (!defaultPathsByKey.has(key)) defaultPathsByKey.set(key, new Set());
      defaultPathsByKey.get(key).add(c.path);
    }
    // `staleLeftover`: this candidate's own (tool, item) key is ALSO
    // resolved by the fresh profile, but at a DIFFERENT path — the tool's
    // cache moved, and this is what is left at the OLD default location.
    // Its own clean_argv would clean the tool's CURRENT (active) location,
    // never this one, so a route built from it would always be shown in
    // the plan and always skipped or fail at apply — clean_argv is
    // stripped here instead, so routeFor falls through to waypost's own
    // removal, the one route that actually reaches this specific path.
    const pushMachineItem = (c, { staleLeftover = false } = {}) => {
      const key = `${c.tool}::${c.item}`;
      const askedNonDefault = c.source === "asked" && !(defaultPathsByKey.get(key) || new Set()).has(c.path);
      machineItems.push({
        scope: "machine", path: c.path, rel: null,
        // `item` (the cache's own raw path template) and `source` ("asked"
        // vs. "env"/"default") are what the removal path re-checks a moved
        // cache and an asked-only path against — see machinePathStillSafe()
        // below. `askedNonDefault` is what routeFor itself already used to
        // decide the route shown in THIS plan.
        item: c.item ?? null, source: c.source ?? null, askedNonDefault,
        bytes: c.bytes, newest_ms: c.newest_ms,
        nested_git: false, in_nested_repo: false, unreadable: c.unreadable, other_fs: c.other_fs, partial: false, match: null,
        tool: c.tool, origin: null, regenerable: c.regenerable, stale_days: c.stale_days,
        clean: c.clean, clean_argv: staleLeftover ? null : c.clean_argv, clean_docs: c.clean_docs ?? null,
        manual: c.manual, dev: c.dev, ino: c.ino,
      });
    };
    for (const c of profileCaches) pushMachineItem(c);
    for (const c of extraCaches) pushMachineItem(c, { staleLeftover: coveredKeys.has(`${c.tool}::${c.item}`) });
  }

  // Facts outside the walk: the live process table (never on win32; null
  // either way when `ps` itself is unavailable or fails — presence.mjs's
  // own processTable() folds every such case into null, so `table === null`
  // is the one signal that means "no live process table, protection here is
  // by recent modification time only" — the plan's own inUseSignal below),
  // the other live sessions' leases on a path inside this project, and
  // whether a live session on another host shares this checkout — all
  // advisory, exactly as ADR-0007 already treats them, and all skipped
  // gracefully when there is no bound vault to read them from.
  const table = platform === "win32" ? null : presence.processTable();
  const comms = table ? [...table.values()].map((p) => p.comm).filter(Boolean) : [];
  const runningTools = cleanup.runningTools(reg.entries, comms);
  const projectEcosystemRunning = projectEcosystems.some((e) => runningTools.has(e.id));
  const inUseSignal = table ? "process-table" : "recency-only";

  let leases = [];
  let sharedProject = false;
  if (vault) {
    const sess = process.env.WAYPOST_SESSION_ID || null;
    leases = presence.readLeases(vault, { self: sess })
      .filter((l) => l.live && !l.mine)
      .map((l) => ({ path: l.path, session: l.session, host: l.host }));
    sharedProject = presence.sharedTree(vault, { self: sess }).shared;
  }

  return {
    root, home, stateDir, platform, vault, reg, metadataNames, host, scan,
    projectItems, machineItems, runningTools, leases, sharedProject,
    projectEcosystems, projectEcosystemRunning, inUseSignal,
  };
}

function factsFrom(ctx, now) {
  return {
    now, home: ctx.home, root: ctx.root, stateDir: ctx.stateDir, platform: ctx.platform,
    runningTools: ctx.runningTools, leases: ctx.leases, sharedProject: ctx.sharedProject,
    projectEcosystemRunning: ctx.projectEcosystemRunning,
  };
}

// `limit`/`shortfall`/`dev` (the amended machine-wide-limit ADR): the
// ACTIVE cleanup-limit setting, if any — activeLimitFor() below — so the
// manual plan's own `picked` marks exactly what the automatic path at the
// end of `waypost run --heavy` would pick right now, without ever renaming
// anything itself. Every other caller (setup's own audit, applyClean's
// re-plan for "should"/an id) omits them, unaffected: `picked` never
// changes an item's own class or route.
function planFromContext(ctx, cleanup, now, { limit = null, shortfall = 0, dev = null } = {}) {
  return cleanup.classify([...ctx.projectItems, ...ctx.machineItems], factsFrom(ctx, now), { now, limit, shortfall, dev });
}

// The setting `waypost clean --limit` last wrote for this host, resolved to
// exactly what classify()/pickUnderLimit() need: the limit itself, plus —
// only for `free:<P>%` — the shortfall against ONE `fs.statfsSync` reading
// of the root and the root's own device (cleanup.limitNeed's own device
// restriction). `off`, or no setting at all, is "no limit" — the same as
// never passing one.
function activeLimitFor(root, cleanup, presence) {
  const setting = readCleanupSetting({ host: presence.hostSlug() });
  if (!setting || !setting.limit || setting.limit.kind === "off") return { limit: null, shortfall: 0, dev: null };
  const limit = setting.limit;
  if (limit.kind !== "free") return { limit, shortfall: 0, dev: null };
  let shortfall = 0;
  let dev = null;
  try {
    const s = statfsSync(root);
    shortfall = cleanup.shortfallOf({ size: s.blocks * s.bsize, avail: s.bavail * s.bsize }, limit.percent);
  } catch { /* best effort — statfs failed, need reads as 0 */ }
  try { dev = lstatSync(root).dev; } catch { /* best effort — no device restriction without it */ }
  return { limit, shortfall, dev };
}

function formatPlanItem(it) {
  return {
    id: it.id, scope: it.scope, path: it.path, ...(it.rel ? { rel: it.rel } : {}),
    bytes: it.bytes, class: it.class, reason: it.reason, route: it.route,
    match: it.match, tool: it.tool, stale_days: it.stale_days, newest_ms: it.newest_ms,
    picked: it.picked,
    // A "can" item flagged manual has no route waypost will ever run — its
    // own clean/clean_docs are shown instead, so the plan itself carries
    // the instructions rather than only the reason it stopped there.
    ...(it.manual === true ? { manual: true } : {}),
    ...(it.clean ? { clean: it.clean } : {}),
    ...(it.clean_docs ? { clean_docs: it.clean_docs } : {}),
  };
}

function formatPlan(classified, ctx, now) {
  return {
    host: ctx.host, root: ctx.root, generated_at: new Date(now).toISOString(),
    in_use_signal: ctx.inUseSignal, items: classified.map(formatPlanItem),
  };
}

function printCleanPlan(result) {
  process.stdout.write(`host  ${result.host}\n`);
  process.stdout.write(`root  ${tildeHome(result.root)}\n`);
  if (result.in_use_signal === "recency-only") {
    process.stdout.write("(no live process table — in-use protection is by recent modification time only)\n");
  }
  if (result.leftovers && result.leftovers.handed_off.length) {
    process.stdout.write(`(${result.leftovers.handed_off.length} leftover item(s) from an interrupted run handed to the deleter)\n`);
  }
  let any = false;
  for (const cls of ["should", "can", "keep"]) {
    const items = result.items.filter((it) => it.class === cls).sort((a, b) => b.bytes - a.bytes);
    if (!items.length) continue;
    any = true;
    process.stdout.write(`\n${cls} (${items.length})\n`);
    for (const it of items) {
      const where = it.rel || tildeHome(it.path);
      process.stdout.write(`  ${it.id}  ${(it.bytes / GB).toFixed(2)} GB  [${it.scope}]  ${where}\n    ${it.reason}\n`);
      if (it.manual && it.clean) process.stdout.write(`    manual: ${it.clean}\n`);
    }
  }
  if (!any) process.stdout.write("\nnothing found\n");
}

// setup's own audit report: a count and a GB total per class, then the five
// largest items overall, whatever class they are in — the two things worth
// knowing before deciding whether to look further with `waypost clean`.
function printAuditSummary(classified, say, inUseSignal) {
  if (inUseSignal === "recency-only") {
    say("  (no live process table — in-use protection is by recent modification time only)");
  }
  for (const cls of ["should", "can", "keep"]) {
    const items = classified.filter((it) => it.class === cls);
    const gb = items.reduce((sum, it) => sum + (it.bytes || 0), 0) / GB;
    say(`  ${cls}  ${items.length} item(s), ${gb.toFixed(2)} GB`);
  }
  const largest = [...classified].sort((a, b) => b.bytes - a.bytes).slice(0, 5);
  if (largest.length) {
    say("  largest:");
    for (const it of largest) {
      const where = it.rel || tildeHome(it.path);
      const manualNote = it.manual && it.clean ? ` — manual: ${it.clean}` : "";
      say(`    ${(it.bytes / GB).toFixed(2)} GB  [${it.class}]  ${where}${manualNote}`);
    }
  }
}

export { isHarnessDetected, gatherCleanContext, factsFrom, planFromContext, activeLimitFor, formatPlanItem, formatPlan, printCleanPlan, printAuditSummary };
