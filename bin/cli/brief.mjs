// Waypost CLI: brief.
import { selfInstallOff } from "../../scripts/lib.mjs";
import { SCRIPT_URL, projectRoot, readConfig, withRegistryHome } from "./core.mjs";
import { existsSync } from "node:fs";
import { join } from "node:path";

// ─── brief: the session start also installs its own harness ───────────
//
// `waypost setup` installs roles for the harnesses the PROJECT shows evidence
// of (a .codex/ directory, a CLAUDE.md with the user's own content). A harness
// that simply opens the project for the first time has left no such evidence
// yet — but the session running this command knows what it is (the registry's
// env markers, or WAYPOST_HARNESS, pinned by heartbeat()). So the session-start
// command renders the roles of the harness it runs in when they are absent or
// stale, makes sure that harness's own instruction file carries the routing
// block, and says what it wrote — those files are committed by convention, and
// git carries them to every other machine and harness. Nothing is written when
// nothing is missing; `--no-install` (or WAYPOST_NO_INSTALL=1) reads only, and
// `"self_install": "off"` in the vault policy does the same for every clone.
async function selfInstall(rest) {
  if (rest.includes("--no-install") || process.env.WAYPOST_NO_INSTALL) return;
  const cfg = readConfig();
  if (!cfg || !cfg.vault_path || !existsSync(cfg.vault_path)) return;
  if (selfInstallOff(cfg.vault_path)) return; // the vault said no, for every clone
  let current = process.env.WAYPOST_HARNESS || "unknown";
  try {
    const A = await import(SCRIPT_URL("agents"));
    const S = await import(SCRIPT_URL("skills"));
    withRegistryHome(() => {
      const h = process.env.WAYPOST_HARNESS || A.detectHarness();
      if (!h || h === "unknown" || !A.harnessIds().includes(h)) return;
      current = h;
      const proj = projectRoot();
      const did = [];
      const st = A.status({ proj, cfg, ids: [h] })[0];
      if (st && st.roles.some((r) => r.state === "absent" || r.state === "stale")) {
        const wrote = A.install([h], { proj, cfg }).filter((r) => r.action === "created" || r.action === "updated");
        if (wrote.length) did.push(`installed ${wrote.length} role file(s) into ${(A.harness(h).roles || {}).dir || "its agents directory"}/`);
      }
      const targets = A.instructionTargetFor(h, proj);
      const reg = targets.length ? A.register({ proj, cfg, files: targets }).filter((r) => r.action !== "unchanged") : [];
      if (reg.length) did.push(`${reg[0].action} the routing block in ${reg.map((r) => r.file).join(", ")}`);
      // Skills too: the same standard file for every harness, in the directory
      // this harness discovers (registry data); one copy serves every harness
      // that reads the shared .agents/skills.
      const sk = A.skillsOf(h);
      if (sk) {
        const st = S.status({ proj, ids: [h] })[0];
        if (st && st.skills.some((r) => r.state === "absent" || r.state === "stale")) {
          const wrote = S.install([h], { proj }).filter((r) => r.action === "created" || r.action === "updated");
          if (wrote.length) did.push(`installed ${wrote.length} skill(s) into ${sk.dir}/`);
        }
      }
      if (!did.length) return;
      const note = `This session runs in ${h}, which this project was not set up for yet — ${did.join("; ")}. `
        + "Commit them, so every machine and harness gets the same roles (`waypost brief --no-install` reads only).\n\n";
      (rest.includes("--json") ? process.stderr : process.stdout).write(note);
    });
  } catch (e) {
    process.stderr.write(`waypost brief: could not repair ${current}: ${e.message}\n`
      + "Some files may have been installed before the failure; rerun `waypost brief` after fixing the cause.\n");
  }
}

export { selfInstall };
