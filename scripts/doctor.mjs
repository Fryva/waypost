#!/usr/bin/env node
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
import { homedir, platform } from "node:os";
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
import { peers as peersOf, readLeases as readLeasesOf, processTable } from "./presence.mjs";
import { detectHarnesses } from "./agents.mjs";
import { checkTeamAuthority } from './team-diagnostics.mjs';
import { inspect as inspectLauncher, repairCommand as launcherRepair } from "./launcher.mjs";

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

// The command on PATH, when it is npm's symlink into a checkout another operating
// system edits (scripts/launcher.mjs has the whole story). Two levels, because
// "it will break on the next save from the other machine" is worth saying BEFORE
// it breaks: once the bit is gone, `waypost doctor` itself answers "permission
// denied" and this check can only be reached through `node bin/waypost doctor`.
// Never a --fix repair: it writes outside the project, into a directory on PATH.
export function checkLauncher(report = null) {
  let r = report;
  if (!r) { try { r = inspectLauncher(); } catch { return []; } }
  if (r.risk === "none") return [];
  const names = r.linked.map((l) => l.file).join(", ");
  const repair = launcherRepair(r);
  if (r.risk === "broken") {
    return [finding("install", "issue", "launcher",
      `${names}: a symlink to ${r.checkout.entry}, which has lost its executable bit — the command fails with "permission denied". \`${repair}\` replaces the symlink with a shim that does not need the bit.`)];
  }
  return [finding("install", "warn", "launcher",
    `${names}: a symlink to ${r.checkout.entry}, and core.fileMode=false says this checkout is shared with a system that has no executable bit. The next save of bin/waypost from there breaks the command, and git will not restore the bit. \`${repair}\` replaces the symlink with a shim.`)];
}

// Derived views are regenerated, never merged (ADR-0006). Two sessions in two
// harnesses both touch a story, both regenerate the board, and git then asks a
// human to hand-merge two machine-written files. The driver removes that class
// of conflict entirely — but only where the vault is versioned WITH the code,
// which is the only case where the two can conflict in one repository.
export function checkMergeDriver(cfg, proj) {
  if (!existsSync(join(proj, ".git"))) return [];
  const vault = String((cfg && cfg.vault_path) || "");
  if (!vault || !pathUnder(vault, proj)) return [];
  const out = [];
  let attrs = "";
  try { attrs = readFileSync(join(proj, ".gitattributes"), "utf8"); } catch {}
  if (!/merge=waypost-derived/.test(attrs)) {
    out.push(finding("install", "warn", "merge-driver",
      "Derived views (kanban.md, graph.md, code-map.md, folder indexes) are not marked `merge=waypost-derived` in .gitattributes — two sessions working in parallel will hand you a conflict in a generated file. `waypost doctor --fix` writes it."));
  }
  const current = (spawnSync("git", ["config", "--get", "merge.waypost-derived.driver"],
    { cwd: proj, encoding: "utf8" }).stdout || "").trim();
  if (!current) {
    out.push(finding("install", "warn", "merge-driver",
      "The waypost-derived merge driver is not configured in this clone (git config merge.waypost-derived.driver). It is machine-local, so every clone sets it once — `waypost doctor --fix` does."));
  } else if (!mergeDriverAccepted().includes(current) && !FOREIGN_MACHINE_DRIVER_RE.test(current)) {
    // A driver configured by an older version is worse than none: git calls it,
    // it cannot identify the file from git's temp name, and the conflict comes
    // back anyway — with a confusing line of output in front of it.
    out.push(finding("install", "warn", "merge-driver",
      `merge.waypost-derived.driver points at a different command than this version installs:\n      configured: ${current}\n      expected:   ${mergeDriverCommand()}\n      \`waypost doctor --fix\` rewrites it.`));
  }
  return out;
}

// Presence and leases left behind by sessions that are no longer live, and the
// duplicate files a sync client creates when two devices write at once.
export function checkSharedVaultState(cfg) {
  if (!cfg || !cfg.vault_path) return [];
  const out = [];
  let view, leases;
  try {
    // A diagnostic leaves no trace: neither read records what it saw.
    view = peersOf(cfg.vault_path, { persist: false });
    leases = readLeasesOf(cfg.vault_path, { persist: false });
  } catch { return []; }
  if (view.conflicts.length) {
    out.push(finding("vault", "warn", "shared-state",
      `The sync client left ${view.conflicts.length} conflicted copy(ies) in .projectstore/presence — two devices wrote at once: ${view.conflicts.join(", ")}. Delete them once you know which device is authoritative.`));
  }
  const stale = leases.filter((l) => !l.live);
  if (stale.length) {
    out.push(finding("vault", "info", "shared-state",
      `${stale.length} lease(s) are held by sessions that are no longer live (${stale.map((l) => `${l.path} — ${l.session}`).join(", ")}). They are advisory and will be taken over on the next acquire.`));
  }
  if (view.storage.kind !== "local") {
    out.push(finding("vault", "info", "shared-state",
      `Vault is on ${view.storage.provider} (${view.storage.kind}): presence from another device can be up to ~${Math.round(view.storage.lag_ms / 1000)}s behind, so "nobody else is working" is a statement about what has synced, not about the world.`));
  }
  return out;
}

// Every form this tool is willing to have installed. The shared-worktree case
// the portable form exists for is exactly the one where two machines resolve
// `waypost` differently, and a strict comparison would have them rewriting each
// other's value on every `--fix`.
// G-7: two machines sharing one .git without `waypost` on PATH each write
// `node /<their own path>/merge-derived.mjs …` — a value that is genuinely
// theirs, not a stale value to rewrite. mergeDriverAccepted() only knows THIS
// machine's absolute paths (the two `node`/execPath forms above are built
// from this pluginRoot()); this pattern recognises any machine's equivalent
// invocation by its stable suffix, so `--fix` does not fight another clone.
// Another machine's own path to the same script — a .git shared between
// machines, or a checkout that lives somewhere else. It has to LOOK like a
// path: a value whose separators a shell has already eaten
// (`Y:DocumentsWaypostscriptsmerge-derived.mjs`) names nothing on any machine,
// and is drift to repair rather than someone else's arrangement to respect.
const FOREIGN_MACHINE_DRIVER_RE = /[\\/]merge-derived(\.mjs)? %A %O %B %P$/;

// git does not run a merge driver itself: it hands the command line to a
// shell, and on Windows that is git's own `sh`, where a backslash escapes
// whatever follows it. `node Y:\Documents\…\merge-derived.mjs %A %O %B %P`
// reaches node as `Y:Documents…merge-derived.mjs` — measured on Windows:
// MODULE_NOT_FOUND, and the merge hands back a conflict in a generated file,
// which is the one thing this driver exists to prevent. Node opens a
// `/`-spelled path on Windows perfectly well, and git spells its own paths
// that way too, so that is the spelling that goes into .git/config.
function driverScript() {
  return join(pluginRoot(), "scripts", "merge-derived.mjs").replace(/\\/g, "/");
}

export function mergeDriverAccepted() {
  return [
    "waypost merge-derived %A %O %B %P",
    `node ${driverScript()} %A %O %B %P`,
    `${process.execPath} ${driverScript()} %A %O %B %P`,
  ];
}

export function mergeDriverCommand() {
  // Prefer the CLI on PATH: `process.execPath` pins a versioned interpreter
  // (…/Cellar/node/25.6.1/bin/node) that a package upgrade removes, and an
  // absolute plugin path is wrong for anyone sharing one .git between machines.
  // Fall back to a plain `node` — still portable across interpreter upgrades —
  // when waypost is not installed on PATH.
  const onPath = spawnSync("command -v waypost", { encoding: "utf8", shell: true });
  if (onPath.status === 0 && (onPath.stdout || "").trim()) return "waypost merge-derived %A %O %B %P";
  return `node ${driverScript()} %A %O %B %P`;
}

export function checkVaultGit(cfg, proj = projectRoot()) {
  if (existsSync(join(cfg.vault_path, ".git"))) return [];
  // A vault INSIDE the project repository is already versioned by it. Running
  // `git init` there would create a nested repository: the outer repo would
  // start seeing a gitlink where files used to be, and the vault's own history
  // would live in a directory nobody clones. The whole point of the check is
  // "this knowledge has history" — inside the repo, it does.
  if (pathUnder(cfg.vault_path, proj) && existsSync(join(proj, ".git"))) return [];
  return [finding("install", "warn", "vault-git",
    "Vault is not a git repository — the knowledge has no history/blame/review. Consider `git init` (doctor --fix offers it).")];
}

// ─── Runners ───────────────────────────────────────────────────────────

// A missing process table is not a vault problem and never makes the vault look
// wrong — which is exactly why it needs saying out loud. Everything that decides
// "is that session still alive?" degrades to a 24h age guess without it: a
// session whose harness exited yesterday reads as live until tomorrow, a
// cleanup run cannot see that a tool is using its cache directory, and the
// machine-wide-limit consent gate falls back to env markers an agent could set
// itself. There is no repair to offer, so this is a warning naming the two
// things worth checking rather than an issue.
// `table` is injectable so the warning can be asserted on any host: a host
// whose `ps` speaks another locale cannot be produced on demand, and a check
// that only ever runs clean is a check nothing holds. An explicit `null` stands
// for "the parse came back empty".
export function checkProcessTable(table) {
  if (platform() === "win32") return [];
  if (table === undefined) {
    try { table = processTable(); } catch { table = null; }
  }
  if (table) return [];
  return [finding("install", "warn", "process-table",
    "No process table: liveness falls back to a 24h age guess — a session whose harness has exited reads as live until then, and a running tool is not seen holding its cache directory. Check that `ps` is on PATH and accepts `ps axo pid=,ppid=,lstart=,comm=`; waypost asks for it in the C locale, so a shell's LC_TIME does not matter (WP-19).")];
}

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
