// Waypost CLI: setup.
import { handleBind, handleScaffold } from "./bind.mjs";
import { applyClean } from "./clean-apply.mjs";
import { gatherCleanContext, isHarnessDetected, planFromContext, printAuditSummary } from "./clean-plan.mjs";
import { ROOT, SCRIPT, SCRIPT_URL, cleanNow, detectedHarnesses, flag, opt, passThrough, projectRoot, readConfig, run, runningHarness } from "./core.mjs";
import { refreshProfiles } from "./profile.mjs";
import { claimSlot, recordAuthority, slotWhere, slotsDir } from "./slots.mjs";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
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

export { handleSetup, guessVault };
