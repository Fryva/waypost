// Waypost CLI: profile.
import { writeFileAtomic } from "../../scripts/lib.mjs";
import { SCRIPT_URL, fail, flag, projectRoot, tildeHome } from "./core.mjs";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

// ─── profile ─────────────────────────────────────────────────────────────
//
// WP-17, the discovery story, ADR Decision 2: the machine and project
// profiles — the scheme of what waypost works with. discovery.mjs is
// compute only (detection, asking, no fs writes); this is the one place
// that reads the previous profile, decides whether it is due (missing,
// older than 30 days, or --refresh — discovery.mjs's needsRefresh), rebuilds
// it, and writes it back atomically — the same division every other write
// in this file keeps with its scripts/*.mjs collaborator. Shared by
// `waypost profile` and `waypost setup`'s own discovery step, so both apply
// the exact same refresh rule.
async function refreshProfiles({ force = false } = {}) {
  const discovery = await import(SCRIPT_URL("discovery"));
  const toolchains = await import(SCRIPT_URL("toolchains"));
  const presence = await import(SCRIPT_URL("presence"));
  const root = projectRoot();
  const host = presence.hostSlug();
  const home = homedir();
  const reg = toolchains.loadRegistry({ projectRoot: root, platform: process.platform });

  const machinePath = discovery.machineProfilePath({ home, host });
  // A profile that exists but does not parse is treated exactly like a
  // missing one — needsRefresh(null, …) is always true — so a hand-edited or
  // half-written file is silently repaired on the next refresh rather than
  // wedging this command the way an unreadable projectstore.json must not.
  const load = (p) => {
    if (!existsSync(p)) return null;
    try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; }
  };

  let machine = load(machinePath);
  const machineRefreshed = discovery.needsRefresh(machine, { force });
  if (machineRefreshed) {
    machine = discovery.buildMachineProfile(reg.entries, { home, host });
    mkdirSync(dirname(machinePath), { recursive: true });
    writeFileAtomic(machinePath, JSON.stringify(machine, null, 2) + "\n");
  }

  // Item 6: a project AT $HOME (no project bound, cwd left at the user's
  // home, WAYPOST_PROJECT_DIR unset or pointed at ~) must never get a
  // project.<host>.json written into ~/.waypost/state/ — the same "no
  // project here" `waypost size --project` already enforces by refusing to
  // scan $HOME (scripts/sizes.mjs). No project profile is built at all.
  const noProject = resolve(root) === resolve(home);
  let project = null, projectPath = null, projectRefreshed = false;
  if (!noProject) {
    projectPath = discovery.projectProfilePath({ projectRoot: root, host });
    project = load(projectPath);
    projectRefreshed = discovery.needsRefresh(project, { force });
    if (projectRefreshed) {
      project = discovery.buildProjectProfile(reg.entries, { projectRoot: root, host });
      mkdirSync(dirname(projectPath), { recursive: true });
      writeFileAtomic(projectPath, JSON.stringify(project, null, 2) + "\n");
    }
  }

  return { host, machine, machinePath, machineRefreshed, project, projectPath, projectRefreshed, noProject, notes: reg.notes };
}

async function handleProfile(args) {
  let r;
  try {
    r = await refreshProfiles({ force: flag(args, "--refresh") });
  } catch (e) { fail(`profile: ${e.message}`); }

  if (flag(args, "--json")) {
    process.stdout.write(JSON.stringify({ machine: r.machine, project: r.noProject ? null : r.project, notes: r.notes }, null, 2) + "\n");
    return;
  }

  process.stdout.write(`host  ${r.host}\n`);
  process.stdout.write(`machine  ${tildeHome(r.machinePath)}  (${r.machineRefreshed ? "refreshed" : "kept"}, ${r.machine.generated_at})\n`);
  process.stdout.write(`  ${r.machine.platform}/${r.machine.arch}\n`);
  for (const t of r.machine.tools) process.stdout.write(`  tool       ${t.name} (${t.id})  ${t.bin}\n`);
  for (const c of r.machine.caches) {
    process.stdout.write(`  cache      ${tildeHome(c.path)}  [${c.tool} · ${c.source}]${c.ask_note ? `  (asked: ${c.ask_note})` : ""}\n`);
  }
  if (r.noProject) {
    process.stdout.write("no project here — machine profile only\n");
  } else {
    process.stdout.write(`project  ${tildeHome(r.projectPath)}  (${r.projectRefreshed ? "refreshed" : "kept"}, ${r.project.generated_at})\n`);
    for (const e of r.project.ecosystems) process.stdout.write(`  ecosystem  ${e.name} (${e.id})  ${e.manifest}\n`);
  }
  // ADR Decision 1: a project's own .waypost/toolchains/ entry may only be
  // data — every dropped field is a project author reaching for something
  // this profile refuses to run, so it belongs here, not just in doctor.
  if (r.notes.length) {
    process.stdout.write(`\n${r.notes.length} note(s) from .waypost/toolchains/:\n`);
    for (const n of r.notes) process.stdout.write(`  ${n.file}${n.field ? ` (${n.field})` : ""}: ${n.reason}\n`);
  }
}

export { refreshProfiles, handleProfile };
