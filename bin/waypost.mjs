#!/usr/bin/env node
import { REMOVING_DIR, accountStateDir, bindingInfo, ensureMachineStateDir, expandHome, isLinkedWorktree, legacyDirsToMove, legacyStateDirs, machineStateDir, readCleanupSetting, resolveVaultPath, sessionId, sessionIdFlag, stateWriteHint, worktreeTag } from "../scripts/lib.mjs";
import { handleBind, handleScaffold } from "./cli/bind.mjs";
import { applyClean } from "./cli/clean-apply.mjs";
import { gatherCleanContext, isHarnessDetected, planFromContext, printAuditSummary } from "./cli/clean-plan.mjs";
import { GB, INHERITED_HARNESS, INHERITED_PROC, INHERITED_SESSION_ID, ROOT, SCRIPT, SCRIPT_URL, VERSION, bootAuthority, cleanNow, detectedHarnesses, fail, flag, lastCleanNowHonored, opt, passThrough, positionals, projectRoot, readConfig, run, runningHarness, splitAtTerminator, withRegistryHome } from "./cli/core.mjs";
import { purgeLeftovers, renameForRemoval, spawnDeleter } from "./cli/deleter.mjs";
import { refreshProfiles } from "./cli/profile.mjs";
import { APFS_FREE_SPACE_NOTE, appendCleanLog, recheckItem } from "./cli/remove.mjs";
import { EX_TEMPFAIL, REASON_PRINT_MS, WAIT_POLL_MS, claimSlot, delay, legacySlotsDirs, parseDuration, recordAuthority, selfMarker, shellQuote, signalNumber, slotWhere, slotsDir } from "./cli/slots.mjs";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, statfsSync, writeFileSync } from "node:fs";
import { homedir, constants as osConstants, setPriority } from "node:os";
import { join, resolve } from "node:path";

// ─── setup: one command that leaves the project ready ──────────────────
//
// Reading a manual to configure a tool is time the tool was supposed to save.
// Everything here is derivable: where the vault goes, which harnesses this
// project uses, which repairs are mechanical. So derive it, do it, and print
// what happened — with --dry-run for anyone who wants to look first.
async function handleSetup(args) {
  const dry = flag(args, "--dry-run");
  const say = (l) => process.stdout.write(l + "\n");
  const step = (label, fn) => { if (dry) { say(`would ${label}`); return null; } say(label); return fn(); };

  const existing = readConfig();
  const vault = opt(args, "--vault") || (existing && existing.vault_path) || guessVault();
  say(`project ${projectRoot()}`);

  if (!existing || !existing.vault_path) {
    step(`bind vault ${vault}`, () => handleBind([vault, ...passThrough(args, ["--layout", "--lang"])]));
  } else {
    say(`vault  ${existing.vault_path} (already bound)`);
    step("scaffold any missing layout folders", () => handleScaffold([]));
  }

  // The harness running this command is the one project setup is being run
  // inside, so it is evidence like any other — the same union doctor already
  // makes (scripts/doctor.mjs) and the same reason selfInstall reads
  // detectHarness(). Without it, setup was the one consumer that asked the
  // filesystem alone, and a real project could look empty to it: measured
  // 2026-09-30, from inside a live `codex` session (codex-cli 0.159.2) in a
  // repo with a README and no marker of any kind, `setup --dry-run` answered
  // "no harness detected" while detectHarness() in the same directory
  // answered "codex". Codex exports CODEX_SANDBOX and
  // CODEX_SANDBOX_NETWORK_DISABLED (both declared in harnesses/codex.json) and
  // never creates a project-local .codex/ of its own, so file markers alone
  // cannot see it. `AGENTS.md` had been hiding that: a real Codex project
  // almost always has one, and the marker made the wrong code path give the
  // right answer.
  //
  // This makes no precedence claim between the two sources — they are unioned.
  // A file marker says the project uses that harness; the running process says
  // someone is in it right now, and both can be true.
  //
  // --harness is read first and short-circuits the detection below entirely: an
  // explicit choice is a decision, and a decision must not depend on whether the
  // two sources happened to be readable — or on an ambient process table naming
  // somebody else's harness.
  const harnesses = opt(args, "--harness");
  const detected = harnesses ? [] : [...new Set([
    ...await detectedHarnesses(),
    ...await runningHarness().then((h) => (h ? [h] : [])),
  ])];
  if (harnesses || detected.length) {
    // The list is passed explicitly, not left to the child: `agents install`
    // re-detects from markers on its own, so a harness found only by the
    // running process would be named in the label and then skipped.
    const list = harnesses || detected.join(",");
    const named = list.split(",").join(", ");      // --harness takes a,b; a human reads a, b
    step(`install roles for ${named}`, () => run("agents", ["install", "--harness", list]));
    step(`install skills for ${named}`, () => run("skills", ["install", "--harness", list]));
    step("register the routing block", () => run("agents", ["register"]));
  } else {
    say("no harness detected — run `waypost agents install --harness <id>` once you pick one");
    say("  (`waypost harnesses --all` lists what is supported)");
  }

  // WP-17, the discovery story: the machine and project profiles, under the
  // same refresh rule `waypost profile` uses (missing, older than 30 days, or
  // --refresh — never forced just because setup is running). Discovery is a
  // PATH stat plus a handful of ≤3s subprocess calls, not heavy work in the
  // WP-18 sense, so it takes no machine-wide slot; the machine audit that
  // does is a later story's step, not this one.
  //
  // --dry-run reports what refreshing WOULD do (read-only: load the existing
  // profiles, if any, and say whether each is due) rather than the generic
  // `step()` one-liner every other step uses — "would discover" alone never
  // says whether a fresh profile would be kept or a stale one rebuilt.
  // Set inside the discovery step below when it actually refreshes the
  // machine profile THIS run — the audit step (last, below) reads it to
  // decide whether the machine is its to audit at all this time.
  let machineRefreshedThisRun = false;

  if (dry) {
    say("would discover tools and ecosystems");
    const discovery = await import(SCRIPT_URL("discovery"));
    const presence = await import(SCRIPT_URL("presence"));
    const home = homedir();
    const host = presence.hostSlug();
    const machinePath = discovery.machineProfilePath({ home, host });
    const load = (p) => {
      if (!existsSync(p)) return null;
      try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; }
    };
    const describe = (label, prof) => discovery.needsRefresh(prof, {})
      ? `  would refresh the ${label} profile`
      : `  would keep the ${label} profile (generated ${prof.generated_at})`;
    say(describe("machine", load(machinePath)));
    // Item 6: a project profile at $HOME would write into the user's home
    // directory itself — the same reasoning `waypost size --project`
    // already refuses ($HOME as a project root, scripts/sizes.mjs).
    if (resolve(projectRoot()) === resolve(home)) {
      say("  no project here — machine profile only");
    } else {
      const projectPath = discovery.projectProfilePath({ projectRoot: projectRoot(), host });
      say(describe("project", load(projectPath)));
    }
  } else {
    await step("discover tools and ecosystems", async () => {
      // A discovery failure (an unwritable machine-state directory, a
      // registry that fails to load, …) must not take the rest of setup
      // down with it — the vault is already bound, roles already installed,
      // and the repair step below still matters. Reported inline instead.
      try {
        const r = await refreshProfiles({ force: false });
        machineRefreshedThisRun = Boolean(r.machineRefreshed);
        say(`  machine  ${r.machineRefreshed ? "refreshed" : "kept"} — ${r.machine.tools.length} tool(s), ${r.machine.caches.length} cache path(s)`);
        if (r.noProject) say("  project  no project here — machine profile only");
        else say(`  project  ${r.projectRefreshed ? "refreshed" : "kept"} — ${r.project.ecosystems.length} ecosystem(s)`);
      } catch (e) {
        say(`  discovery failed: ${e.message} — waypost profile to retry`);
      }
    });
  }

  // Not run(): doctor is a diagnostic, and `--fix` only mends what is
  // mechanical — a harness/spec/layout finding it cannot touch must not turn
  // `waypost setup` into a hard failure for having done the mechanical part of
  // its job. spawnSync here so setup can read and print the report itself
  // and add the one line that matters: whether anything still needs a human.
  step("repair the mechanical install findings", () => {
    const r = spawnSync(process.execPath, [SCRIPT("doctor"), "--install", "--fix"], {
      encoding: "utf8", env: { ...process.env, WAYPOST_HOME: ROOT },
    });
    process.stdout.write(r.stdout || "");
    if (r.stderr) process.stderr.write(r.stderr);
    const m = (r.stdout || "").match(/Summary: (\d+) issue/);
    if (m && Number(m[1]) > 0) process.stdout.write(`${m[1]} finding(s) remain — waypost doctor\n`);
  });

  // WP-17, the clean stories (ADR "Disk hygiene by discovery" Decision 6):
  // the audit as setup's own last step, after repair, before the footer.
  // Never takes setup down with it — a slot refusal or any other failure is
  // reported and setup still exits 0; setup itself removes nothing without
  // the same yes `waypost clean --apply` needs, asked at most once here.
  await step("audit build output (project, and the machine if its profile was just refreshed)", async () => {
    try {
      const capacity = await import(SCRIPT_URL("capacity"));
      const presence = await import(SCRIPT_URL("presence"));
      const dir = slotsDir(presence);
      mkdirSync(dir, { recursive: true });
      const where = slotWhere(projectRoot());
      const claim = await claimSlot(dir, ["waypost", "setup", "--audit"], capacity, presence, where);
      if (!claim.ok) {
        say(`  audit skipped: ${claim.reason} — waypost clean`);
        return;
      }
      recordAuthority(claim.file, capacity);
      try {
        const cleanup = await import(SCRIPT_URL("cleanup"));
        const sizes = await import(SCRIPT_URL("sizes"));
        const toolchains = await import(SCRIPT_URL("toolchains"));
        const discovery = await import(SCRIPT_URL("discovery"));
        const mods = { cleanup, sizes, toolchains, presence, discovery };
        const auditNow = cleanNow();
        const ctx = gatherCleanContext(mods, { budget: sizes.DEFAULT_ENTRY_BUDGET, includeMachine: machineRefreshedThisRun });
        const classified = planFromContext(ctx, cleanup, auditNow);
        printAuditSummary(classified, say, ctx.inUseSignal);

        const shouldItems = classified.filter((it) => it.class === "should");
        const isTTY = Boolean(process.stdin.isTTY);
        const harnessDetected = await isHarnessDetected();
        if (shouldItems.length && isTTY && !harnessDetected) {
          const consent = cleanup.consent({ yes: false, reason: null, isTTY, harnessDetected });
          const result = await applyClean({ mode: "should" }, consent, mods, auditNow, { source: "setup", prebuilt: { ctx, classified } });
          if (result.declined) {
            say("  not confirmed — nothing removed");
          } else {
            const removedCount = result.items.filter((i) => i.result === "removed" || i.result === "partial").length;
            say(`  removed ${removedCount} item(s) — waypost clean for the rest`);
          }
        } else if (shouldItems.length) {
          say("  review and remove: waypost clean");
        }
      } finally {
        claim.release();
      }
    } catch (e) {
      say(`  audit failed: ${e.message} — waypost clean to retry`);
    }
  });

  if (!dry) {
    process.stdout.write("\nready. Next:\n");
    process.stdout.write("  waypost next                      what this project needs right now\n");
    process.stdout.write("  waypost brief                     orientation at the start of a session\n");
    process.stdout.write('  waypost draft adr "<decision>" --write\n');
  }
}

// A vault the project already has, or a conventional place for a new one. Never
// a path outside the project: the vault travels with the repository unless the
// user says otherwise.
function guessVault() {
  const root = projectRoot();
  for (const c of ["vault", "docs/vault", "knowledge", ".vault"]) {
    if (existsSync(join(root, c, "adr")) || existsSync(join(root, c, "epics"))) return join(root, c);
  }
  return join(root, existsSync(join(root, "docs")) ? "docs/vault" : "vault");
}

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
      process.stderr.write(`waypost: ${(stillShort / GB).toFixed(2)} GB over the limit is protected by the 7-day rule — raise it: \`waypost clean --limit <N>\`\n`);
    } else {
      process.stderr.write(`waypost: ${(stillShort / GB).toFixed(2)} GB short of the free-space floor — \`waypost size --global\` (${APFS_FREE_SPACE_NOTE})\n`);
    }
  }
  if (rec.deadline) process.stderr.write("waypost: automatic cleanup stopped at its 60s deadline\n");
  if (rec.excluded.length) process.stderr.write(`waypost: ${rec.excluded.length} idle item(s) never on the automatic path — waypost clean for detail\n`);
  if (rec.nested_skipped) process.stderr.write(`waypost: ${rec.nested_skipped} nested repository/repositories never entered\n`);
}

function safeRealpath(p) {
  try { return realpathSync(p); } catch { return p; }
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
    if (ended.signal || ended.interrupted) return void logAndReportAuto(finish("skipped", `ended by ${ended.signal || ended.interrupted}`), host);
    if (ended.spawnFailed) return void logAndReportAuto(finish("skipped", "did not start"), host);
    if (!where || !where.root || !where.common) return void logAndReportAuto(finish("skipped", "not in a git work tree"), host);

    let cleanup;
    try { cleanup = await import(SCRIPT_URL("cleanup")); }
    catch (e) { return void logAndReportAuto(finish("failed", e.message), host); }

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
      return void logAndReportAuto(finish("skipped", "a protected path", { adopted }), host);
    }

    const storage = presence.storageOf(root);
    if (storage.kind !== "local") {
      return void logAndReportAuto(finish("skipped", `on ${storage.provider} (${storage.kind}) — not local storage`, { adopted }), host);
    }

    let rootDev, commonDev;
    try { rootDev = statSync(root).dev; commonDev = statSync(where.common).dev; }
    catch (e) { return void logAndReportAuto(finish("failed", e.message, { adopted }), host); }
    if (commonDev !== rootDev) {
      return void logAndReportAuto(finish("skipped", "the git directory is on another filesystem", { adopted }), host);
    }

    const holdersNow = capacity.readHolders({ dir: slotsDir(presence), dirs: legacySlotsDirs(presence), authority: bootAuthority(capacity) });
    const blocking = capacity.blockingHolder(holdersNow.live, { self: claim.id, root, platform: process.platform, canon: safeRealpath });
    if (blocking) {
      return void logAndReportAuto(finish("skipped", `another heavy job overlaps this tree (${blocking.holder.id})`, { adopted }), host);
    }

    const { vault, unreadable } = autoCleanVault();
    if (unreadable) {
      return void logAndReportAuto(finish("skipped", "the project binding is unreadable", { adopted }), host);
    }
    if (vault) {
      const shared = presence.sharedTree(vault, { self: process.env.WAYPOST_SESSION_ID || null, contain: true });
      if (shared.shared) {
        const who = presence.sharedWith ? presence.sharedWith(shared) : shared.with.map((w) => `${w.session} on ${w.host}`).join("; ");
        return void logAndReportAuto(finish("skipped", `shared with ${who}`, { adopted }), host);
      }
    }

    if (Date.now() > deadline) {
      return void logAndReportAuto(finish("skipped", "deadline", { adopted }), host);
    }

    let sizes, toolchains, discovery;
    try {
      sizes = await import(SCRIPT_URL("sizes"));
      toolchains = await import(SCRIPT_URL("toolchains"));
      discovery = await import(SCRIPT_URL("discovery"));
    } catch (e) { return void logAndReportAuto(finish("failed", e.message, { adopted }), host); }
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

    if (ctx.scan && ctx.scan.stopped_by === "deadline") {
      return void logAndReportAuto(finish("ran", "deadline", {
        counted: 0, need: 0, shortfall: 0, renamed: [], skipped_items: [], stayed: [], excluded: [],
        nested_skipped: ctx.scan.nested_skipped, deadline: true, elapsed_ms: Date.now() - t0,
        deleter_pid: null, adopted, ...(lastCleanNowHonored ? { clock: process.env.WAYPOST_CLEAN_NOW } : {}),
      }), host);
    }

    const now = cleanNow();
    const classified = planFromContext(ctx, cleanup, now);

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
      .map((it) => ({ id: it.id, path: it.rel || it.path, reason: autoExcludedReasonOf(it) }));

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
      const holders = capacity.readHolders({ dir: slotsDir(presence), dirs: oldSlots, authority: bootAuthority(capacity) });
      const hit = capacity.blockingHolder(holders.live, { self: claim.id, root, platform: process.platform, canon: safeRealpath });
      if (hit) { holderBlocked = hit; break; }
      const item = eligible[i];
      const rc = recheckItem(item, ctx, mods, now);
      if (rc.changed || !cleanup.qualifiesForLimit({ ...rc.item, class: rc.class }, now)) {
        skippedItems.push({ id: item.id, path: item.rel || item.path, reason: rc.changed ? "changed since the plan was built" : (rc.reason || "no longer qualifies") });
        continue;
      }
      const renResult = renameForRemoval(item, removingDir, marker);
      if (!renResult.ok) {
        skippedItems.push({ id: item.id, path: item.rel || item.path, reason: renResult.reason });
        continue;
      }
      const bytes = Number.isFinite(rc.fresh.bytes) ? rc.fresh.bytes : item.bytes;
      renamed.push({ id: item.id, path: item.rel || item.path, bytes, name: renResult.name });
      freed += bytes || 0;
      autoCleanPause(probe && probe.pause_ms, renamed.length);
    }
    const stayed = eligible.slice(i).map((it) => ({ id: it.id, path: it.rel || it.path, bytes: it.bytes }));
    const deleterPid = renamed.length ? spawnDeleter(removingDir, renamed.map((r) => r.name), marker) : null;

    const reason = deadlineHit ? "deadline" : (holderBlocked ? `another heavy job overlaps this tree (${holderBlocked.holder.id})` : null);
    return void logAndReportAuto(finish("ran", reason, {
      counted, need, shortfall, renamed, skipped_items: skippedItems.slice(0, 20),
      stayed: stayed.slice(0, 20), excluded: excludedList.slice(0, 20),
      nested_skipped: ctx.scan ? ctx.scan.nested_skipped : 0, deadline: deadlineHit,
      elapsed_ms: Date.now() - t0, deleter_pid: deleterPid, adopted,
      ...(lastCleanNowHonored ? { clock: process.env.WAYPOST_CLEAN_NOW } : {}),
    }), host);
  } catch (e) {
    return void logAndReportAuto(finish("failed", e.message), host);
  }
}

// Lowers waypost's own priority first, so the command and everything it
// starts inherits it — Node maps PRIORITY_BELOW_NORMAL to nice +10 on POSIX,
// below-normal on Windows. No shell, except a .cmd/.bat target on Windows,
// which only cmd.exe can start (the argv is the caller's own command, not
// data from a registry).
// `claim` (not just its own release()) and `where` (the amended machine-
// wide-limit ADR): the automatic cleanup runs AFTER the wrapped command
// exits but BEFORE the slot is released, under the same claim — and needs
// both. Nothing on this whole path may call fail() or readConfig() (both
// call process.exit): a bug in the cleanup must never take the wrapped
// command's own already-decided exit status down with it.
// A probe, not a guess from XDG_RUNTIME_DIR: systemd-run fails the same way
// (exit 1) for an unreachable manager and for a command that exits 1, so the
// choice is made before the job starts.
function ownScopeAvailable(env) {
  const r = spawnSync("systemd-run", ["--user", "--scope", "--quiet", "--collect", "--", "true"], { stdio: "ignore", timeout: 5000, env });
  return r.status === 0;
}

async function runHeavy(argv, claim, where, mods) {
  try { setPriority(osConstants.priority.PRIORITY_BELOW_NORMAL); }
  catch { /* best-effort: a restricted sandbox must not block the run */ }
  // Linux: if memory runs out anyway, the kernel's OOM killer takes this job
  // first, not the harness beside it (ADR "Memory for heavy work: half the
  // memory up to 2 GB, …"; the job's own scope below keeps systemd from
  // taking the harness down with it). Inherited across fork and exec; raising needs no
  // privilege, lowering would, so a higher value already set is left alone.
  if (process.platform === "linux") {
    try {
      if (Number(readFileSync("/proc/self/oom_score_adj", "utf8")) < 1000) writeFileSync("/proc/self/oom_score_adj", "1000");
    } catch { /* best-effort, like the priority above */ }
  }

  // The command is arbitrary and may itself invoke `waypost` (this project's
  // own test suite does, extensively): it must see the environment it was
  // actually given, not this wrapper's own session/harness identity — pinned
  // onto process.env above by main(), for ITS OWN heartbeat/commit labelling
  // — when that identity was only invented (detected), not passed in. Left
  // leaking through, a nested `waypost` call would skip its OWN derivation
  // (main() only pins when unset) and inherit this wrapper's, which is how a
  // `waypost run --heavy -- node --test …` run once produced a session id
  // collision in an unrelated test.
  // The harness process (WAYPOST_PROC) is always derived, never passed in by a
  // caller, so a nested `waypost` must find its own the same way.
  const childEnv = { ...process.env };
  if (INHERITED_SESSION_ID === undefined) delete childEnv.WAYPOST_SESSION_ID;
  if (INHERITED_HARNESS === undefined) delete childEnv.WAYPOST_HARNESS;
  if (INHERITED_PROC === undefined) delete childEnv.WAYPOST_PROC;

  let [cmd, ...cmdArgs] = argv;
  const useShell = process.platform === "win32" && /\.(cmd|bat)$/i.test(cmd);
  // Linux under a systemd user manager: the job gets a scope of its own. The
  // OOM killer's victim is only half of it — systemd then stops the whole
  // unit the victim sat in (DefaultOOMPolicy=stop), and that unit is the
  // harness's own app scope when the job runs in it: the 2026-09-27 VM
  // incident, reproduced 2026-10-13. `--scope` execs the command in place, so
  // its pid, signals, environment and exit status stay this child's. Without
  // a reachable user manager the command runs as before.
  if (process.platform === "linux" && ownScopeAvailable(childEnv)) {
    cmdArgs = ["--user", "--scope", "--quiet", "--collect", "--", cmd, ...cmdArgs];
    cmd = "systemd-run";
  }

  // A signal THIS wrapper itself caught — set the moment it arrives, so a
  // tool that traps Ctrl-C and exits 130 on its own terms (never actually
  // killed BY the signal, so `signal` below stays null) is treated exactly
  // the same as one the signal killed outright: either way, cleanup must
  // never run against a command that did not finish on its own.
  let interrupted = null;
  let child = null;
  const onSigint = () => { interrupted = "SIGINT"; if (child) { try { child.kill("SIGINT"); } catch {} } };
  const onSigterm = () => { interrupted = "SIGTERM"; if (child) { try { child.kill("SIGTERM"); } catch {} } };
  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);

  let spawnFailed = false;
  let code = null;
  let signal = null;
  try {
    child = spawn(cmd, cmdArgs, { stdio: "inherit", shell: useShell, env: childEnv });
    [code, signal] = await new Promise((res) => {
      child.on("exit", (c, s) => res([c, s]));
      child.on("error", (e) => {
        spawnFailed = true;
        process.stderr.write(`waypost run --heavy: ${e.message}\n`);
        res([127, null]);
      });
    });
  } catch (e) {
    spawnFailed = true;
    process.stderr.write(`waypost run --heavy: ${e.message}\n`);
    code = 127;
  }

  // Default handling again: a signal that arrives DURING the cleanup below
  // ends this process at once (the ADR: "A signal that arrives during the
  // cleanup ends the process at once, with 128+n") — renaming an item
  // before it is ever actually deleted is what keeps that safe.
  process.removeListener("SIGINT", onSigint);
  process.removeListener("SIGTERM", onSigterm);

  const status = signal ? 128 + signalNumber(signal) : (code == null ? 1 : code);
  process.exitCode = status;

  try {
    await autoCleanup({
      claim, where, ended: { status, signal, interrupted, spawnFailed },
      capacity: mods.capacity, presence: mods.presence,
    });
  } catch (e) {
    process.stderr.write(`waypost: automatic cleanup failed: ${e.message}\n`);
  } finally {
    claim.release();
  }
  process.exitCode = status;
}

// waypost run --heavy [--wait <Ns|Nm>] -- <argv…>. No wait: refuse at once,
// with the reason and the exact retry command, exit EX_TEMPFAIL. --wait
// retries every 5 seconds until the deadline, repeating the reason every 30.
async function handleRun(args) {
  if (!flag(args, "--heavy")) fail('run: only "run --heavy -- <argv…>" is supported (see `waypost help`)');
  const { tail: argv } = splitAtTerminator(args);
  if (!argv.length) fail("run --heavy: usage: waypost run --heavy [--wait <Ns|Nm>] -- <argv…>");

  let waitMs = null;
  const waitSpec = opt(args, "--wait");
  if (waitSpec != null) {
    waitMs = parseDuration(waitSpec);
    if (waitMs == null) fail(`run --heavy: --wait expects <N>s or <N>m, got "${waitSpec}"`);
  }

  let capacity, presence;
  try {
    capacity = await import(SCRIPT_URL("capacity"));
    presence = await import(SCRIPT_URL("presence"));
  } catch (e) { fail(`run --heavy: ${e.message}`); }

  const dir = slotsDir(presence);
  try { ensureMachineStateDir(dir); } catch (e) { fail(`run --heavy: ${stateWriteHint(dir, e)}`); }
  const retryCmd = `waypost run --heavy -- ${argv.map(shellQuote).join(" ")}`;
  const deadline = waitMs != null ? Date.now() + waitMs : null;
  let lastPrinted = 0;
  // Computed once, before the wait loop: the command's own working directory
  // never changes while this process waits, and nothing may spawn inside
  // claimSlot's own lock either way.
  const where = slotWhere(process.cwd());

  for (;;) {
    const claim = await claimSlot(dir, argv, capacity, presence, where);
    if (claim.ok) {
      recordAuthority(claim.file, capacity);
      await runHeavy(argv, claim, where, { capacity, presence });
      return;
    }

    const now = Date.now();
    if (deadline == null || now >= deadline) {
      process.stderr.write(`waypost run --heavy: refused — ${claim.reason}\n  retry: ${retryCmd}\n`);
      // A holder whose boot could not be confirmed is kept rather than pruned
      // (WP-18 amendment), so the way out of a phantom has to be said out
      // loud: the only other one is waiting for the 24-hour cap.
      if (/^slots:/.test(String(claim.reason || ""))) {
        process.stderr.write("  who holds it: waypost capacity"
          + "     (a holder that is not really there: waypost capacity --release <id> --force)\n");
      }
      process.exitCode = EX_TEMPFAIL;
      return;
    }
    if (now - lastPrinted >= REASON_PRINT_MS) {
      process.stderr.write(`waypost run --heavy: waiting — ${claim.reason}\n`);
      lastPrinted = now;
    }
    await delay(Math.min(WAIT_POLL_MS, deadline - now));
  }
}

// ─── lease ─────────────────────────────────────────────────────────────
//
// AGENTS.md and this file's own help() document `waypost lease <path…>` — a path
// as the first token, not a subcommand. presence.mjs's own CLI takes
// `lease|acquire|release|list|watch|storage` as its first token, so a path
// forwarded unchanged reads as an unknown subcommand. Insert the implied
// "lease" subcommand unless the caller already named a real one, or gave only
// flags (`waypost lease --json`, read as "list mine, as json" — there is no path
// to lease, so there is nothing to insert "lease" in front of).
const LEASE_SUBCOMMANDS = new Set(["lease", "acquire", "release", "list", "watch", "storage"]);
function leaseArgs(rest) {
  if (!rest.length) return ["list"];
  if (LEASE_SUBCOMMANDS.has(rest[0])) return rest;
  if (rest[0].startsWith("--")) return ["list", ...rest];
  return ["lease", ...rest];
}

// Presence is only useful if it happens without being asked. Every command that
// implies work beats the session's heartbeat, so another device sees this
// session without anyone remembering `waypost sessions --touch`. Never fails the
// command, never runs for a read-only lookup, and WAYPOST_NO_BEAT=1 turns it off.
// "clean" is deliberately NOT here, unlike "size": it is a working command
// that will remove things once --apply lands (the next commit), so it beats
// the heartbeat like any other write-side command; a plan-only run today
// costs one extra beat, which is cheap.
const QUIET_COMMANDS = new Set(["help", "--help", "-h", "version", "--version", "-v",
  "harnesses", "prompt", "skill", "skills", "agents", "log", "storage", "merge-derived", "size", "capacity"]);

async function heartbeat(cmd) {
  if (QUIET_COMMANDS.has(cmd) || process.env.WAYPOST_NO_BEAT) return;
  try {
    // Harness and session id are already resolved and pinned in the environment
    // by main() (G-1, E-3): the child this command spawns (sessions, lease,
    // watch, status, brief) labels the session the way commits do.
    const { beat } = await import(SCRIPT_URL("presence"));
    const cfg = readConfig();
    if (cfg && cfg.vault_path && existsSync(cfg.vault_path)) {
      beat(cfg.vault_path, process.env.WAYPOST_SESSION_ID, { harness: process.env.WAYPOST_HARNESS || null });
    }
  } catch { /* presence is advisory; a command must never fail because of it */ }
}

// Machine state moved to one root on every OS (the global-rules ADR,
// Decision 1). Whatever an older version left under its own root — on Windows
// one per packaged harness — moves on the first command that finds it; a
// failure is reported and retried next time, never fatal.
async function migrateStateIfNeeded() {
  // The suite's own children never move a developer's real state; a budget
  // still waiting in an old root refuses on its own (run-budget.mjs), so
  // leaving the move for later never opens anything.
  if (process.env.WAYPOST_NO_STATE_MIGRATION === "1") return;
  try {
    // Only roots under this process's own home, or any when that home is the
    // account's: a command run with HOME/USERPROFILE pointed elsewhere never
    // carries the owner's real state there (lib.mjs legacyDirsToMove).
    const from = legacyDirsToMove();
    // A root with something to move that this process may not move: say why,
    // and what to do — otherwise the budget refusal is a dead end.
    const movable = new Set(from);
    const all = legacyStateDirs();
    const stuck = all.filter((d) => !movable.has(d));
    if (stuck.length) {
      const mig0 = await import(SCRIPT_URL("state-migrate"));
      let account = null;
      try { account = (await import("node:os")).userInfo().homedir; } catch {}
      for (const d of stuck) {
        if (!mig0.pendingEntries(d).length) continue;
        process.stderr.write(`waypost: machine state: ${d} is not moved — this process's home (${homedir()}) is not the account's own (${account || "unknown"}). Run any waypost command as the account itself, or move its files into ${accountStateDir() || "the account's own ~/.local/state/waypost"} by hand.\n`);
      }
    }
    if (!from.length) return;
    const mig = await import(SCRIPT_URL("state-migrate"));
    if (!from.some((d) => mig.pendingEntries(d).length)) return;
    const [presence, capacity] = await Promise.all([import(SCRIPT_URL("presence")), import(SCRIPT_URL("capacity"))]);
    const report = await mig.migrateMachineState({ to: machineStateDir(), from, deps: { presence, capacity } });
    for (const line of report) process.stderr.write(`waypost: machine state: ${line}\n`);
  } catch (e) {
    process.stderr.write(`waypost: machine state: could not move it yet (${e.message}) — tried again next run\n`);
  }
}

async function main() {
  const onFail = name => err => fail(`requested ./cli/${name}.mjs: ${err.message}`);
  const argv = process.argv.slice(2);
  // The detached deleter's own entry point (spawnDeleter above), dispatched
  // before anything else in this function: not a session, so none of the
  // --project/heartbeat/harness-detection machinery below applies to a
  // process nobody is watching.
  if (argv[0] === "__waypost-delete") { await (0,(await import("./cli/deleter.mjs").catch(onFail("deleter")))["handleInternalDelete"])(argv.slice(1)); return; }
  // A stdio MCP connection is not a new harness session. Keep stdout strictly
  // protocol-only and do not touch parent membership or advisory presence.
  if (argv[0] === "team-mcp") { run("team-mcp", argv.slice(1)); return; }
  if (argv[0] === "team-mcp-config") { (0,(await import("./cli/mcp-config.mjs").catch(onFail("mcp-config")))["installMcpConfig"])(argv.slice(1)); return; }
  // --project is recognised ONLY in the leading position, before the command
  // name — not anywhere in argv, or a positional argument that happens to
  // equal it (a search term, say) would be swallowed as a global flag (A-8).
  let i = 0;
  while (i < argv.length) {
    if (argv[i] === "--project" && argv[i + 1] !== undefined) {
      process.env.WAYPOST_PROJECT_DIR = resolve(expandHome(argv[i + 1]));
      i += 2;
    } else break;
  }
  const args = argv.slice(i);

  // Harness first, then the session id — in that order, once, here (G-1). The
  // id carries the harness as a prefix, and deriving it before the harness was
  // known used to split one session in two: `8-48df-…` from a command that ran
  // before anything pinned WAYPOST_HARNESS, `claude-8-48df-…` from one that ran
  // after — two presence records, two trailer values, one session. Detection
  // reads the registry, which may hold project overrides, so it runs after
  // --project is known. process.ppid genuinely is the shell or harness that
  // invoked the CLI here — not inside a script bin/waypost spawns, whose parent
  // pid is bin/waypost itself and differs on every invocation. Every child this
  // process spawns inherits both via `env: { ...process.env }`.
  const [cmd = "", ...rest] = args;
  if (cmd && !["help", "--help", "-h", "version", "--version", "-v"].includes(cmd)) await migrateStateIfNeeded();
  // The harness process first (ADR-0007 amendment): the scripts this command
  // spawns beat as well, and from inside them the nearest ancestor is this very
  // process, gone the moment the command ends — and harness detection reads it
  // too, since env markers are inherited across nested harnesses while the
  // process is not. One `ps` per working command.
  if (!process.env.WAYPOST_PROC && !QUIET_COMMANDS.has(cmd)) {
    try {
      const { harnessProcess } = await import(SCRIPT_URL("presence"));
      const p = harnessProcess();
      if (p) process.env.WAYPOST_PROC = JSON.stringify(p);
    } catch { /* no process table: the counter rules stay */ }
  }
  if (!process.env.WAYPOST_HARNESS) {
    try {
      const { detectHarness } = await import(SCRIPT_URL("agents"));
      // Pinned like every read in handleSetup: this is the first registry read
      // of the process, and an unpinned one would both take its answer from a
      // foreign WAYPOST_HOME and prime the memo every later read inherits.
      const h = withRegistryHome(() => detectHarness());
      if (h && h !== "unknown") process.env.WAYPOST_HARNESS = h;
    } catch { /* detection is best-effort; a null harness is still valid */ }
  }
  // An explicit `--id` outranks an id inherited from the environment — the
  // precedence sessionId() documents, and which a pre-set WAYPOST_SESSION_ID
  // used to win against here: under a harness that exports its own id,
  // `sessions --touch --id X` wrote a record for X and beat another one for
  // the ambient session, so one command registered two live sessions.
  const idFromFlag = sessionIdFlag(process.argv);
  if (idFromFlag) process.env.WAYPOST_SESSION_ID = idFromFlag;
  else if (!process.env.WAYPOST_SESSION_ID) process.env.WAYPOST_SESSION_ID = sessionId(process.argv);
  // In a linked worktree an id that came from the environment (a wrapper's
  // constant WAYPOST_SESSION_ID, a Claude session driving two worktrees)
  // would make two live worktrees write one presence record and one lease
  // name; qualify it by the worktree, once, deterministically (ADR-0010).
  // An explicit --id means what it says.
  if (!idFromFlag && isLinkedWorktree()) {
    const tag = `-wt${worktreeTag()}`;
    if (!process.env.WAYPOST_SESSION_ID.endsWith(tag)) process.env.WAYPOST_SESSION_ID += tag;
  }
  await heartbeat(cmd);

  switch (cmd) {
    case "": (0,(await import("./cli/status.mjs").catch(onFail("status")))["handleDefault"])(); break;
    case "setup": await handleSetup(rest); break;
    case "next": (0,(await import("./cli/status.mjs").catch(onFail("status")))["handleNext"])(rest); break;
    case "bind": case "init": (0,(await import("./cli/bind.mjs").catch(onFail("bind")))["handleBind"])(rest); break;
    case "scaffold": (0,(await import("./cli/bind.mjs").catch(onFail("bind")))["handleScaffold"])(rest); break;
    case "draft": (0,(await import("./cli/artifacts.mjs").catch(onFail("artifacts")))["handleDraft"])(rest); break;
    case "story": await (0,(await import("./cli/artifacts.mjs").catch(onFail("artifacts")))["handleStory"])(rest); break;
    case "graph": {
      const forPath = opt(rest, "--for");
      if (forPath) (0,(await import("./cli/views.mjs").catch(onFail("views")))["handleGraphQuery"])(forPath, rest); else (0,(await import("./cli/views.mjs").catch(onFail("views")))["handleDerived"])("graph", rest);
      break;
    }
    case "kanban": case "codemap": (0,(await import("./cli/views.mjs").catch(onFail("views")))["handleDerived"])(cmd, rest); break;
    case "search": (0,(await import("./cli/views.mjs").catch(onFail("views")))["handleSearch"])(rest); break;
    case "reconcile": (0,(await import("./cli/views.mjs").catch(onFail("views")))["handleReconcile"])(rest); break;
    case "doctor": run("doctor", rest); break;
    case "diff-refs": run("diff-refs", rest); break;
    case "size": await (0,(await import("./cli/size.mjs").catch(onFail("size")))["handleSize"])(rest); break;
    case "clean": await (0,(await import("./cli/clean.mjs").catch(onFail("clean")))["handleClean"])(rest); break;
    case "profile": await (0,(await import("./cli/profile.mjs").catch(onFail("profile")))["handleProfile"])(rest); break;
    case "capacity": await (0,(await import("./cli/capacity.mjs").catch(onFail("capacity")))["handleCapacity"])(rest); break;
    case "run": await handleRun(rest); break;
    case "agents": run("agents", rest); break;
    case "harnesses": run("agents", ["harnesses", ...rest]); break;
    case "sessions": run("sessions", rest); break;
    case "team": run("team-cli", rest); break;
    case "ready": run("ready", rest); break;
    case "brief": await (0,(await import("./cli/brief.mjs").catch(onFail("brief")))["selfInstall"])(rest); run("brief", rest.filter((a) => a !== "--no-install")); break;
    case "commit": run("commit", rest); break;
    case "merge": run("commit", ["--merge", ...rest]); break;
    case "log": run("commit", ["--log", ...rest]); break;
    case "merge-derived": run("merge-derived", rest); break;
    case "lease": run("presence", leaseArgs(rest)); break;
    case "storage": run("presence", ["storage"]); break;
    case "watch": run("presence", ["watch", ...rest]); break;
    case "tokens": run("tokens", rest); break;
    case "prompt": (0,(await import("./cli/help.mjs").catch(onFail("help")))["printDoc"])("prompts", positionals(rest)[0]); break;
    case "skill": (0,(await import("./cli/help.mjs").catch(onFail("help")))["printDoc"])("skills", positionals(rest)[0], "SKILL.md"); break;
    case "skills": run("skills", rest); break;
    case "launcher": run("launcher", rest); break;
    case "status": await (0,(await import("./cli/status.mjs").catch(onFail("status")))["handleStatus"])(); break;
    case "version": case "--version": case "-v": process.stdout.write(`${VERSION}\n`); break;
    case "help": case "--help": case "-h": (0,(await import("./cli/help.mjs").catch(onFail("help")))["help"])(); break;
    default:
      process.stderr.write(`waypost: unknown command "${cmd}"\n\n`);
      (0,(await import("./cli/help.mjs").catch(onFail("help")))["help"])();
      process.exit(1);
  }
}

main().catch((e) => fail(e && e.message ? e.message : String(e)));
