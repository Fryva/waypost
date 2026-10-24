#!/usr/bin/env node
import { checkLauncher, checkMergeDriver, checkSharedVaultState, mergeDriverAccepted, mergeDriverCommand, checkVaultGit, checkProcessTable } from "./doctor-coordination.mjs";
export { checkLauncher, checkMergeDriver, checkSharedVaultState, mergeDriverAccepted, mergeDriverCommand, checkVaultGit, checkProcessTable } from "./doctor-coordination.mjs";
import { checkConfig, checkVaultPath, checkLayoutTemplates, checkAgentsBlock, checkInstructionsHygiene, checkEnvEffort, checkEnvModel, checkGitignore, checkAgentRoles, checkAgentSkills } from "./doctor-install.mjs";
export { checkConfig, checkVaultPath, checkLayoutTemplates, checkAgentsBlock, checkInstructionsHygiene, checkEnvEffort, checkEnvModel, checkGitignore, checkAgentRoles, checkAgentSkills, INSTRUCTIONS_MAX_LINES } from "./doctor-install.mjs";
import { scanArtifacts, checkVaultPolicy, checkWikilinks, checkWorkWithoutStory, checkDependencies, checkAdrNumbers } from "./doctor-vault.mjs";
export { scanArtifacts, checkVaultPolicy, checkWikilinks, checkWorkWithoutStory, checkDependencies, checkAdrNumbers } from "./doctor-vault.mjs";
import { checkStoriesAndEpics, checkLifecycleGates } from "./doctor-lifecycle.mjs";
export { checkStoriesAndEpics, checkLifecycleGates } from "./doctor-lifecycle.mjs";
import { checkKanbanSync, checkIndexes, checkIndexHeaders, checkCodeMap, checkGraph } from "./doctor-generated.mjs";
export { checkKanbanSync, checkIndexes, checkIndexHeaders, checkCodeMap, checkGraph } from "./doctor-generated.mjs";
import { checkSpecLinks, checkSpecCoverage, checkSpecAcceptance } from "./doctor-specs.mjs";
export { checkSpecLinks, checkSpecCoverage, checkSpecAcceptance, parseSpecAcceptance } from "./doctor-specs.mjs";
import { checkPortableNames, checkLineEndings } from "./doctor-portability.mjs";
export { checkPortableNames, checkLineEndings } from "./doctor-portability.mjs";
import { walkVaultFiles, checkArtifactIdentity, checkExternalRefsForm, checkArtifactNames } from "./doctor-artifacts.mjs";
export { walkVaultFiles, checkArtifactIdentity, checkExternalRefsForm, checkArtifactNames } from "./doctor-artifacts.mjs";
import { checkCodeRefs, checkSupersedes, checkAcceptanceGate } from "./doctor-integrity.mjs";
export { checkCodeRefs, checkSupersedes, checkAcceptanceGate } from "./doctor-integrity.mjs";
import { checkGuards } from "./doctor-guards.mjs";
export { checkGuards, projectFiles, GUARD_FILE_MAX, GUARD_FILES_MAX } from "./doctor-guards.mjs";
// waypost — doctor.mjs
// Deterministic, no-LLM diagnostics engine. Exports individual check functions
// plus group runners; consumed by `waypost doctor` and by reconcile.
//
// The install group is harness-aware, not Claude-specific: it checks the bind,
// the layout/templates the CLI needs, and whether the agent roles are installed
// and current in each harness this project uses (ADR-0003). Upstream's hook,
// status-line and marketplace checks are gone with the wiring they described.
//
// Read-only by contract: detection never mutates anything. Repairs live behind
// --fix (install side) and reconcile (vault side).
//
// Finding: { group: "install"|"vault", level: "issue"|"warn"|"info",
//            check: "<id>", message: "...", file?: "<path>" }
// The SessionStart line counts level==="issue" only.
//
// CLI: node doctor.mjs [--install] [--vault [<path>]] [--startup] [--json]
//      --vault <path> checks that directory with no binding (CI on a fresh clone).
//      default = --install --vault. --json (and --startup) always exit 0 (a
//      reporting tool); the plain-text report exits 1 when an issue-level
//      finding exists, so `waypost doctor && ...` sees failures.

import { renderDoctorReport } from "./doctor-report.mjs";
import { existsSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  readConfig,
  loadLayout,
  folderByKind,
  pluginRoot,
  projectRoot,
  readVaultConfig,
  selfInstallOff,
  headingLineRe,
  buildNodeIndex,
  escCell,
  ignoreEpipe,
  pathUnder,
} from "./lib.mjs";
import { detectHarnesses } from "./agents.mjs";
import { checkTeamAuthority } from './team-diagnostics.mjs';

function finding(group, level, check, message, file) {
  const f = { group, level, check, message };
  if (file) f.file = file;
  return f;
}

function waypostVersion() {
  try {
    return JSON.parse(readFileSync(join(pluginRoot(), "package.json"), "utf8")).version;
  } catch {
    return null;
  }
}

// ─── Install checks ────────────────────────────────────────────────────

// ─── Runners ───────────────────────────────────────────────────────────

export function runInstallChecks(cfg, proj) {
  const out = [...checkConfig(cfg)];
  if (!cfg || !cfg.vault_path) return out;
  out.push(...checkVaultPath(cfg));
  if (out.some((f) => f.check === "vault-path" && f.level === "issue")) return out;
  out.push(
    ...checkLayoutTemplates(cfg),
    ...checkAgentRoles(proj, cfg),
    ...checkAgentSkills(proj, cfg),
    ...checkAgentsBlock(proj),
    ...checkInstructionsHygiene(proj),
    ...checkEnvModel(),
    ...checkEnvEffort(),
    ...checkGitignore(proj),
    ...checkVaultGit(cfg, proj),
    ...checkMergeDriver(cfg, proj),
    ...checkLineEndings(cfg, proj),
    ...checkProcessTable(),
    ...checkLauncher(),
  );
  return out;
}

export function runVaultChecks(cfg) {
  let layout;
  try { layout = loadLayout(cfg.layout); } catch (e) {
    return [finding("vault", "issue", "layout", `Layout not loadable: ${e.message}`)];
  }
  const artifacts = scanArtifacts(cfg, layout);
  // Vault-side policy read ONCE (upstream ADR-007 Decision 4): spec gates and lifecycle
  // gates key off <vault>/.projectstore.json, never the machine-local config.
  const vaultCfg = readVaultConfig(cfg.vault_path);
  const findings = [...checkKanbanSync(cfg), ...checkIndexes(cfg, layout, artifacts)];
  // Registry-dependent checks: a missing/corrupt scaffold/headings.json must
  // become a finding, never a crash that swallows the whole report.
  const guarded = [
    () => checkIndexHeaders(cfg, layout),
    () => checkStoriesAndEpics(artifacts),
    () => checkSpecLinks(cfg, layout, artifacts),
    () => checkSpecCoverage(artifacts, vaultCfg, layout),
    () => checkSpecAcceptance(layout, artifacts, vaultCfg),
    () => checkLifecycleGates(artifacts, vaultCfg),
  ];
  for (const step of guarded) {
    try { findings.push(...step()); } catch (e) {
      findings.push(finding("vault", "issue", "registry", e.message));
      break;
    }
  }
  const vaultFiles = walkVaultFiles(cfg.vault_path); // one walk, four consumers
  const nodeIndex = buildNodeIndex(cfg, layout);       // one index, two consumers
  findings.push(
    ...checkVaultPolicy(cfg, layout, artifacts, vaultCfg),
    ...checkWikilinks(cfg, artifacts, vaultFiles, nodeIndex),
    ...checkArtifactIdentity(layout, vaultFiles, artifacts),
    ...checkArtifactNames(vaultFiles),
    ...checkPortableNames(cfg, vaultFiles),
    ...checkSharedVaultState(cfg),
    ...checkExternalRefsForm(artifacts),
    ...checkCodeRefs(artifacts, projectRoot(), folderByKind(layout, "epic")?.path),
    ...checkDependencies(cfg.vault_path),
    ...checkAdrNumbers(cfg.vault_path, folderByKind(layout, "adr")?.path || "adr"),
    ...checkSupersedes(nodeIndex, vaultFiles),
    ...checkAcceptanceGate(artifacts, vaultCfg),
    ...checkWorkWithoutStory(cfg, projectRoot()),
    ...checkCodeMap(cfg),
    ...checkGraph(cfg),
  );
  // Outside the stop-on-throw loop by design (ADR-0011): a guard's failure to
  // evaluate is its own finding, never a reason to hide the other checks.
  findings.push(...checkTeamAuthority(cfg.vault_path));
  try { findings.push(...checkGuards(artifacts, projectRoot())); }
  catch (e) { findings.push(finding("vault", "warn", "adr-guard", `guards not evaluated: ${e.message}`)); }
  return findings;
}

// SessionStart subset: install/fs checks only (never the vault group — upstream ADR-005
// Decision 4). Aborts past the budget rather than reporting a false "clean".
export function runStartupChecks(cfg, proj, budgetMs = 150) {
  const started = Date.now();
  const steps = [
    () => checkConfig(cfg),
    () => (cfg && cfg.vault_path ? checkVaultPath(cfg) : []),
    () => checkAgentsBlock(proj),
    () => checkGitignore(proj),
    () => checkEnvModel(),
    () => checkEnvEffort(),
  ];
  const findings = [];
  for (const step of steps) {
    if (Date.now() - started > budgetMs) return { skipped: true, count: 0, findings };
    try { findings.push(...step()); } catch {}
  }
  return { skipped: false, count: findings.filter((f) => f.level === "issue").length, findings };
}

// ─── CLI ───────────────────────────────────────────────────────────────

function report(findings, groups) {
  return renderDoctorReport(findings, groups, {
    version: waypostVersion(),
    date: new Date().toISOString().slice(0, 10),
  });
}

// ─── Repairs (--fix, install group only) ───────────────────────────────
//
// Every repair here is mechanical and reversible by hand: appending gitignore
// lines, `git init` in the vault, re-rendering role files from agents/*.md,
// re-writing the routing block in place. Anything requiring judgement stays a
// finding. Vault-side repairs are reconcile's job, never this flag's.
export function applyFixes(cfg, proj, findings) {
  const done = [];
  const has = (check, level = null) =>
    findings.some((f) => f.check === check && (!level || f.level === level));

  if (has("gitignore")) {
    const p = join(proj, ".gitignore");
    let text = "";
    try { text = readFileSync(p, "utf8"); } catch {}
    const lines = text.split("\n").map((l) => l.trim());
    const add = [".waypost/projectstore.json", ".waypost/state/"].filter((w) => !lines.includes(w));
    if (add.length) {
      writeFileSync(p, `${text.replace(/\s*$/, "")}\n${add.join("\n")}\n`, "utf8");
      done.push(`.gitignore += ${add.join(", ")}`);
    }
  }

  if (has("vault-git") && cfg && cfg.vault_path) {
    const r = spawnSync("git", ["init", "-q", cfg.vault_path], { encoding: "utf8" });
    done.push(r.status === 0 ? `git init ${cfg.vault_path}` : `git init failed: ${(r.stderr || "").trim()}`);
  }

  // `agent-roles` only — never `agent-roles-foreign`, whose whole content is
  // "there is a file here that is not ours". install skips those anyway; not
  // triggering on them keeps the two facts independent.
  //
  // And never on `info` either: the info case is "this harness has no waypost roles
  // at all", which is a choice the user has not made yet. Repairing it turned
  // `--fix` into an installer — after `waypost agents uninstall`, the next `--fix`
  // put all fifteen files back.
  if (has("line-endings")) {
    const p = join(proj, ".gitattributes");
    let text = "";
    try { text = readFileSync(p, "utf8"); } catch {}
    {
      const existing = text.match(/^\*\s+text=auto.*$/m);
      if (existing && !/\beol=/.test(existing[0])) {
        // eol= is the load-bearing half: without it the rule normalises on
        // check-in and leaves checkout to core.eol, which is CRLF on Windows.
        writeFileSync(p, text.replace(existing[0], `${existing[0].trimEnd()} eol=lf`), "utf8");
        done.push(".gitattributes: `* text=auto` += eol=lf (checkout ending was left to core.eol)");
      } else if (!existing) {
        const block = "\n# waypost: one line-ending policy, or a Windows session's first commit\n"
          + "# rewrites every file it touches and conflicts with every parallel edit.\n"
          + "# eol=lf is not decoration: without it checkout falls back to core.eol.\n"
          + "* text=auto eol=lf\n*.md text eol=lf\n*.mjs text eol=lf\n";
        writeFileSync(p, `${text.replace(/\s*$/, "")}${text.trim() ? "\n" : ""}${block}`, "utf8");
        done.push(".gitattributes += text=auto eol=lf (one line-ending policy for every OS)");
      }
    }
  }

  if (has("merge-driver") && cfg && cfg.vault_path) {
    const rel = pathUnder(cfg.vault_path, proj);
    if (rel) {
      const p = join(proj, ".gitattributes");
      let text = "";
      try { text = readFileSync(p, "utf8"); } catch {}
      if (!/merge=waypost-derived/.test(text)) {
        const block = [
          "", "# waypost: derived views are regenerated from the artifacts, never merged.",
          "# `waypost merge-derived` re-derives them; see docs/vault/adr/0006-*.md.",
          `${rel}/kanban.md merge=waypost-derived`,
          `${rel}/graph.md merge=waypost-derived`,
          `${rel}/code-map.md merge=waypost-derived`,
          `${rel}/**/README.md merge=waypost-derived`, "",
        ].join("\n");
        writeFileSync(p, `${text.replace(/\s*$/, "")}${text.trim() ? "\n" : ""}${block}`, "utf8");
        done.push(".gitattributes += merge=waypost-derived for the derived views");
      }
      const a = spawnSync("git", ["config", "merge.waypost-derived.driver", mergeDriverCommand()], { cwd: proj, encoding: "utf8" });
      spawnSync("git", ["config", "merge.waypost-derived.name", "regenerate waypost derived views"], { cwd: proj, encoding: "utf8" });
      done.push(a.status === 0 ? "git config merge.waypost-derived.driver" : `git config failed: ${(a.stderr || "").trim()}`);
    }
  }

  if (has("agent-roles", "issue") || has("agent-roles", "warn")) {
    const harnesses = detectHarnesses(proj);
    if (harnesses.length) {
      const r = spawnSync(process.execPath,
        [join(pluginRoot(), "scripts", "agents.mjs"), "install", "--harness", harnesses.join(",")],
        { encoding: "utf8", env: { ...process.env, WAYPOST_PROJECT_DIR: proj } });
      done.push(r.status === 0
        ? `agents install --harness ${harnesses.join(",")}`
        : `agents install failed: ${(r.stderr || "").trim()}`);
    }
  }

  if (has("agent-skills", "issue") || has("agent-skills", "warn")) {
    const harnesses = detectHarnesses(proj);
    if (harnesses.length) {
      const r = spawnSync(process.execPath,
        [join(pluginRoot(), "scripts", "skills.mjs"), "install", "--harness", harnesses.join(",")],
        { encoding: "utf8", env: { ...process.env, WAYPOST_PROJECT_DIR: proj } });
      done.push(r.status === 0
        ? `skills install --harness ${harnesses.join(",")}`
        : `skills install failed: ${(r.stderr || "").trim()}`);
    }
  }

  if (has("claude-import-missing")) {
    // A bare `@NAME` written as if from the project root — the usual shape of
    // the mistake — is rewritten to the path that reaches that root file from
    // the importing file's directory. Anything else is left for the owner.
    for (const f of ["CLAUDE.md", ".claude/CLAUDE.md"]) {
      const p = join(proj, f);
      if (!existsSync(p)) continue;
      const before = readFileSync(p, "utf8");
      const after = before.replace(/^@(\S+)(\s*)$/gm, (line, raw, tail) => {
        if (raw.includes("/") || raw.startsWith("~")) return line;
        if (existsSync(resolve(dirname(p), raw)) || !existsSync(join(proj, raw))) return line;
        return `@${relative(dirname(p), join(proj, raw)).replace(/\\/g, "/")}${tail}`;
      });
      if (after !== before) {
        writeFileSync(p, after, "utf8");
        done.push(`${f}: import rewritten to resolve against the file itself`);
      }
    }
  }

  if (has("claude-bridge")) {
    const p = join(proj, "CLAUDE.md");
    const before = existsSync(p) ? readFileSync(p, "utf8") : "";
    writeFileSync(p, before.trim() ? `@AGENTS.md\n\n${before}` : "@AGENTS.md\n", "utf8");
    done.push(before.trim() ? "CLAUDE.md: `@AGENTS.md` import added at the top" : "CLAUDE.md created with `@AGENTS.md` (Claude Code reads it, not AGENTS.md)");
  }

  if (has("agents-block", "issue")) {
    const r = spawnSync(process.execPath,
      [join(pluginRoot(), "scripts", "agents.mjs"), "register"],
      { encoding: "utf8", env: { ...process.env, WAYPOST_PROJECT_DIR: proj } });
    done.push(r.status === 0 ? "agents register" : `agents register failed: ${(r.stderr || "").trim()}`);
  }

  return done;
}

// Whether a directory looks like a vault of its layout at all: an empty or
// unrelated directory would otherwise pass every check vacuously.
function layoutFolderIn(cfg) {
  let layout;
  try { layout = loadLayout(cfg.layout); } catch { return true; } // runVaultChecks reports it
  return layout.folders.some((f) => existsSync(join(cfg.vault_path, f.path)));
}

function main() {
  ignoreEpipe();
  const args = process.argv.slice(2);
  const wantJson = args.includes("--json");
  const wantFix = args.includes("--fix");
  const startup = args.includes("--startup");
  let install = args.includes("--install");
  let vault = args.includes("--vault");
  if (!install && !vault && !startup) { install = true; vault = true; }
  // `--vault <path>`: check that directory with no binding (a fresh clone, CI).
  // Through the environment, so the generators spawned below see the same vault.
  if (args.some((a) => a.startsWith("--vault="))) {
    process.stderr.write("waypost doctor: --vault takes its path as the next argument: --vault <path>\n");
    process.exit(2);
  }
  const vi = args.indexOf("--vault");
  const vaultArg = vi !== -1 && args[vi + 1] && !args[vi + 1].startsWith("-") ? args[vi + 1] : null;
  if (vaultArg) process.env.WAYPOST_VAULT = resolve(vaultArg);

  const cfg = readConfig();
  const proj = projectRoot();

  if (startup) {
    const r = runStartupChecks(cfg, proj);
    process.stdout.write(JSON.stringify(r) + "\n");
    return;
  }

  const findings = [];
  const groups = [];
  if (install) {
    groups.push("install");
    // With self-install off in the vault policy, "no roles / no skills / no
    // block yet" is the chosen state, not advice: drop those notes (and with
    // them `next`'s install items). Partial or stale installs still report.
    const optedOut = cfg && cfg.vault_path && existsSync(cfg.vault_path) && selfInstallOff(cfg.vault_path);
    findings.push(...runInstallChecks(cfg, proj).filter((f) =>
      !(optedOut && f.level === "info" && ["agent-roles", "agent-skills", "agents-block"].includes(f.check))));
  }
  if (vault && vaultArg && !(existsSync(cfg.vault_path) && statSync(cfg.vault_path).isDirectory())) {
    groups.push("vault");
    findings.push(finding("vault", "issue", "vault", `No vault at ${vaultArg}: the path is not a directory.`));
  } else if (vault && vaultArg && !layoutFolderIn(cfg)) {
    groups.push("vault");
    findings.push(finding("vault", "issue", "vault",
      `${vaultArg} holds none of the ${cfg.layout} layout's folders — not a vault, or the wrong path.`));
  } else if (vault && cfg && cfg.vault_path && existsSync(cfg.vault_path)) {
    groups.push("vault");
    findings.push(...runVaultChecks(cfg));
  } else if (vault) {
    groups.push("vault");
    // An explicit `--vault` skips the install checks that would otherwise report the missing
    // binding, so a missing vault there is an issue: `doctor --vault` in CI must not pass on a
    // fresh clone with no vault (it printed "healthy" and exited 0 before 2026-10-11).
    findings.push(args.includes("--vault")
      ? finding("vault", "issue", "vault", "No usable vault: bind one with `waypost bind <path>` (`.waypost/` is per checkout, so a fresh clone needs it too).")
      : finding("vault", "info", "vault", "Vault checks skipped — no usable vault (see install issues)."));
  }

  if (wantJson) {
    process.stdout.write(JSON.stringify(findings, null, 2) + "\n");
    return;
  }
  process.stdout.write(report(findings, groups) + "\n");
  // Text mode only, and only when NOT repairing — --json/--startup stay a
  // reporting tool (exit 0 always), matching upstream ADR-005's "a script
  // parses the JSON, a human reads the text" split. Without this,
  // `waypost doctor && ...` never saw a failure. --fix is exempt: its findings
  // are the PRE-repair snapshot, and a fixable issue this same call just
  // resolved must not make `waypost doctor --fix` (or `waypost setup`, which runs it
  // internally) report failure for having done its job.
  if (!wantFix && findings.some((f) => f.level === "issue")) process.exitCode = 1;
  if (!wantFix) return;
  const done = applyFixes(cfg, proj, findings.filter((f) => f.group === "install"));
  process.stdout.write("\n## repairs\n" + (done.length
    ? done.map((d) => `  ✓ ${d}`).join("\n")
    : "  nothing mechanical to repair") + "\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
