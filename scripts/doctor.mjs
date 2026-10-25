#!/usr/bin/env node
import { applyFixes } from "./doctor-repairs.mjs";
export { applyFixes } from "./doctor-repairs.mjs";
import { checkLauncher, checkMergeDriver, checkSharedVaultState, mergeDriverAccepted, checkVaultGit, checkProcessTable } from "./doctor-coordination.mjs";
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
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
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
} from "./lib.mjs";
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

function report(findings, groups, { compactChecks = false } = {}) {
  return renderDoctorReport(findings, groups, {
    version: waypostVersion(),
    date: new Date().toISOString().slice(0, 10),
    compactChecks,
  });
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
  const wantFull = args.includes("--full");
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
  process.stdout.write(report(findings, groups, { compactChecks: !wantFull && !wantFix }) + "\n");
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
