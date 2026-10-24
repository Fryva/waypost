#!/usr/bin/env node
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
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, accessSync, constants } from "node:fs";
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
import {
  AGENT_BLOCK_MARKER,
  AGENT_BLOCK_VERSION,
  HARNESSES,
  PREFIX as AGENT_PREFIX,
  detectHarnesses,
  detectHarness,
  harnessIds,
  instructionTargets,
  importsSharedFile,
  importTargets,
  status as agentStatus,
} from "./agents.mjs";
import { status as skillsStatus, skillNames } from "./skills.mjs";
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

export function checkConfig(cfg) {
  if (!cfg) {
    return [finding("install", "issue", "config",
      "No waypost config (.waypost/projectstore.json). Run `waypost bind <vault-path>`.")];
  }
  const out = [];
  if (!cfg.vault_path) out.push(finding("install", "issue", "config", "Config has no vault_path."));
  return out;
}

export function checkVaultPath(cfg) {
  const out = [];
  const vault = cfg.vault_path;
  if (!existsSync(vault)) {
    out.push(finding("install", "issue", "vault-path", `Vault path does not exist: ${vault}`));
    return out;
  }
  try {
    readdirSync(vault);
  } catch {
    out.push(finding("install", "issue", "vault-path", `Vault path is not readable/listable: ${vault}`));
    return out;
  }
  try {
    accessSync(vault, constants.W_OK);
  } catch {
    out.push(finding("install", "issue", "vault-path", `Vault path is not writable: ${vault}`));
  }
  return out;
}

export function checkLayoutTemplates(cfg) {
  const out = [];
  let layout;
  try {
    layout = loadLayout(cfg.layout);
  } catch (e) {
    out.push(finding("install", "issue", "layout", `Layout not loadable: ${e.message}`));
    return out;
  }
  const lang = cfg.language || "en";
  // Layout-driven (PS-SPEC story-001): a command needs a template iff it maps
  // to a declared folder kind ("story" maps through the epic folder; "kanban"
  // through the layout's kanban block). Folders WITHOUT a command (e.g.
  // diagrams) require no template — no false findings for them.
  const kinds = (layout.commands || []).filter((k) => {
    if (k === "kanban") return Boolean(layout.kanban);
    if (k === "story") return Boolean(folderByKind(layout, "epic"));
    return Boolean(folderByKind(layout, k));
  });
  kinds.push("folder-readme");
  for (const k of kinds) {
    const p = join(pluginRoot(), "templates", lang, `${k}.md.tmpl`);
    if (!existsSync(p)) {
      out.push(finding("install", "issue", "templates", `Missing template for language "${lang}": ${k}.md.tmpl`));
    }
  }
  if (!existsSync(join(pluginRoot(), "scaffold", "headings.json"))) {
    out.push(finding("install", "issue", "templates",
      "scaffold/headings.json is missing — heading-registry checks (index headers, acceptance, spec gates) cannot run. Stale/corrupt plugin install?"));
  }
  return out;
}

export function checkAgentsBlock(proj) {
  const out = [];
  let blocks = 0;
  let staleVersions = [];
  // The same files `register` writes to, not just the two at the root: a project
  // that keeps its rules in .claude/CLAUDE.md carries the block there, and a
  // check that cannot see a copy cannot see it stale either. Several files each
  // holding one block is the normal shape — every harness reads its own — so
  // duplication is counted PER FILE, which is the case register cannot produce.
  for (const name of instructionTargets(proj)) {
    const p = join(proj, name);
    if (!existsSync(p)) continue;
    let text;
    try { text = readFileSync(p, "utf8"); } catch { continue; }
    let here = 0;
    for (const m of text.matchAll(AGENT_BLOCK_MARKER)) {
      here++;
      blocks++;
      const v = parseInt(m[1], 10);
      if (v !== AGENT_BLOCK_VERSION) staleVersions.push({ file: name, v });
    }
    if (here > 1) {
      out.push(finding("install", "issue", "agents-block",
        `Duplicated waypost:agents block (${here} markers in ${name}) — keep exactly one per file; register migrates, never duplicates.`, name));
    }
  }
  if (blocks === 0) {
    out.push(finding("install", "info", "agents-block",
      "Agent routing block not registered — the roles exist but no instruction file routes to them. `waypost agents register` writes it."));
  }
  for (const s of staleVersions) {
    out.push(finding("install", "issue", "agents-block",
      `Agents block in ${s.file} is v${s.v}, expected v${AGENT_BLOCK_VERSION} — re-run \`waypost agents register\`.`, s.file));
  }
  return out;
}

// Instruction files against 2026 field practice (the AGENTS.md field guide;
// Anthropic's own "under 200 lines" for CLAUDE.md): a long file costs context
// on every turn and is adhered to less, so length is a warning with a generous
// threshold; and Claude Code reads CLAUDE.md, not AGENTS.md — a project that
// uses Claude and carries the routing block only in AGENTS.md has a block
// Claude never sees. The bridge Anthropic documents is a CLAUDE.md that
// @-imports AGENTS.md, which is what --fix writes.
export const INSTRUCTIONS_MAX_LINES = 300;

export function checkInstructionsHygiene(proj) {
  const out = [];
  for (const name of ["AGENTS.md", "CLAUDE.md", ".claude/CLAUDE.md"]) {
    const p = join(proj, name);
    if (!existsSync(p)) continue;
    let lines;
    try { lines = readFileSync(p, "utf8").split("\n").length; } catch { continue; }
    if (lines > INSTRUCTIONS_MAX_LINES) {
      out.push(finding("install", "warn", "instructions-size",
        `${name} is ${lines} lines — it is read on every turn, and agents adhere less to long instruction files (field practice: 150–200 at the root). Move long material into linked docs or nested files.`, name));
    }
  }
  const running = detectHarness();
  const claudeUsed = detectHarnesses(proj).includes("claude") || running === "claude";
  if (claudeUsed) {
    // Claude Code resolves an `@path` against the importing file, so
    // `@AGENTS.md` in .claude/CLAUDE.md names .claude/AGENTS.md — an import
    // that loads nothing and says nothing (WP-19).
    for (const f of ["CLAUDE.md", ".claude/CLAUDE.md"]) {
      for (const t of importTargets(join(proj, f))) {
        if (existsSync(t)) continue;
        out.push(finding("install", "warn", "claude-import-missing",
          `${f} imports ${relative(proj, t).replace(/\\/g, "/")}, which does not exist: Claude Code resolves an import against the importing file, so nothing is loaded. In .claude/CLAUDE.md the root AGENTS.md is \`@../AGENTS.md\`.`, f));
      }
    }
    const agents = join(proj, "AGENTS.md");
    let agentsHasBlock = false;
    try { agentsHasBlock = AGENT_BLOCK_MARKER.test(readFileSync(agents, "utf8")); AGENT_BLOCK_MARKER.lastIndex = 0; } catch {}
    if (agentsHasBlock) {
      const reaches = ["CLAUDE.md", ".claude/CLAUDE.md"].some((f) => {
        const p = join(proj, f);
        if (!existsSync(p)) return false;
        if (importsSharedFile(p, agents)) return true;
        try { const has = AGENT_BLOCK_MARKER.test(readFileSync(p, "utf8")); AGENT_BLOCK_MARKER.lastIndex = 0; return has; } catch { return false; }
      });
      if (!reaches) {
        out.push(finding("install", "warn", "claude-bridge",
          "Claude Code reads CLAUDE.md, not AGENTS.md: the routing block in AGENTS.md never reaches it. `waypost doctor --fix` writes a CLAUDE.md that imports it (`@AGENTS.md`)."));
      }
    }
  }
  return out;
}

// upstream ADR-008 made `effort` unconfigurable per project, which promotes this env var
// from a curiosity to the ONLY thing that can move our agents off `effort: max`.
// It beats frontmatter, so a value set for cost or latency silently drops all
// five agents below the quality floor the plugin advertises — exactly the class
// of silent downgrade doctor exists to name.
export function checkEnvEffort() {
  const v = process.env.CLAUDE_CODE_EFFORT_LEVEL;
  if (!v) return [];
  return [finding("install", "warn", "env-effort",
    `CLAUDE_CODE_EFFORT_LEVEL=${v} is set — it overrides the bundled agents' "effort: max" frontmatter, so every waypost role installed for Claude Code runs at "${v}" regardless of what \`agents/*.md\` declares. Unset the variable to restore the roles' own effort.`)];
}

export function checkEnvModel() {
  if (process.env.CLAUDE_CODE_SUBAGENT_MODEL) {
    return [finding("install", "warn", "env-model",
      `CLAUDE_CODE_SUBAGENT_MODEL=${process.env.CLAUDE_CODE_SUBAGENT_MODEL} is set — it overrides the model every waypost role declares, including anything pinned with \`waypost agents model\`.`)];
  }
  return [];
}

export function checkGitignore(proj) {
  if (!existsSync(join(proj, ".git"))) return [];
  let lines = [];
  try {
    lines = readFileSync(join(proj, ".gitignore"), "utf8").split("\n").map((l) => l.trim());
  } catch {}
  if (lines.includes(".waypost/") || lines.includes(".waypost")) return [];
  // The bind config names a machine-local absolute path and the state dir is
  // per-session runtime — neither survives a clone meaningfully. The generated
  // harness role files are the opposite: committing them is how a team gets the
  // same roles, so they are never suggested here.
  const wanted = [".waypost/projectstore.json", ".waypost/state/"];
  const missing = wanted.filter((w) => !lines.includes(w));
  if (!missing.length) return [];
  return [finding("install", "warn", "gitignore",
    `Machine-specific files not gitignored: ${missing.join(", ")} (or ignore ".waypost/" wholesale).`)];
}

// Are the roles installed, and do they match agents/<role>.md as it ships?
// A harness is only reported when the project actually uses it — a Codex-only
// project has no reason to hear about .claude/agents.
export function checkAgentRoles(proj, cfg) {
  const out = [];
  let state;
  try { state = agentStatus({ proj, cfg }); } catch (e) {
    return [finding("install", "warn", "agent-roles", `Agent roles not readable: ${e.message}`)];
  }
  // The harness running this check is in use too, whether or not the project
  // shows evidence of it yet: a first session from a new harness leaves none,
  // and `waypost next` from that session must still say "install my roles".
  const running = detectHarness();
  const used = [...new Set([...detectHarnesses(proj),
    ...(running !== "unknown" && harnessIds().includes(running) ? [running] : [])])];
  const anyInstalled = state.some((h) => h.roles.some((r) => r.state !== "absent"));
  for (const h of state) {
    // A harness with no per-role file format has nothing to install, so there is
    // nothing to be missing or stale about it.
    if (h.roles.every((r) => r.state === "n/a")) continue;
    const relevant = used.includes(h.harness) || h.roles.some((r) => r.state !== "absent");
    if (!relevant) continue;
    const stale = h.roles.filter((r) => r.state === "stale");
    const absent = h.roles.filter((r) => r.state === "absent");
    const foreign = h.roles.filter((r) => r.state === "foreign");
    if (stale.length) {
      const why = [...new Set(stale.map((r) => r.reason).filter(Boolean))].join("; ");
      out.push(finding("install", "issue", "agent-roles",
        `${h.harness}: ${stale.length} role file(s) no longer match what install would write (${stale.map((r) => r.role).join(", ")}${why ? ` — ${why}` : ""}) — re-run \`waypost agents install --harness ${h.harness}\`.`));
    }
    // Its OWN check id, not `agent-roles`: --fix keys repairs off the id, and a
    // foreign file is precisely the thing no repair may touch.
    if (foreign.length) {
      out.push(finding("install", "warn", "agent-roles-foreign",
        `${h.harness}: ${foreign.map((r) => AGENT_PREFIX + r.role).join(", ")} exist under the waypost- prefix but were not generated by waypost — install and --fix skip them. Rename them if they are yours, or delete them to let install take the name.`));
    }
    if (absent.length && absent.length < h.roles.length) {
      out.push(finding("install", "warn", "agent-roles",
        `${h.harness}: ${absent.length} of ${h.roles.length} roles missing (${absent.map((r) => r.role).join(", ")}) — \`waypost agents install --harness ${h.harness}\`.`));
    }
    if (absent.length === h.roles.length && used.includes(h.harness)) {
      out.push(finding("install", "info", "agent-roles",
        `${h.harness} is used by this project but has no waypost roles — \`waypost agents install --harness ${h.harness}\` renders them.`));
    }
  }
  if (!anyInstalled && !used.length) {
    out.push(finding("install", "info", "agent-roles",
      `No harness detected in this project — \`waypost agents install --harness <${HARNESSES.join("|")}>\` when you pick one.`));
  }
  return out;
}

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

// The bundled Agent Skills, in the directory each harness discovers (WP-14).
// Mirrors checkAgentRoles: one verdict per distinct directory, and only for
// harnesses the project uses or the one running this check.
export function checkAgentSkills(proj, cfg) {
  const out = [];
  let rows;
  try { rows = skillsStatus({ proj }); } catch (e) {
    return [finding("install", "warn", "agent-skills", `Agent skills not readable: ${e.message}`)];
  }
  const running = detectHarness();
  const used = new Set([...detectHarnesses(proj),
    ...(running !== "unknown" && harnessIds().includes(running) ? [running] : [])]);
  for (const t of rows) {
    const relevant = t.harnesses.some((h) => used.has(h)) || t.skills.some((s) => s.state !== "absent");
    if (!relevant) continue;
    const who = t.harnesses.filter((h) => used.has(h)).join(", ") || t.harnesses.join(", ");
    const stale = t.skills.filter((s) => s.state === "stale");
    const absent = t.skills.filter((s) => s.state === "absent");
    const foreign = t.skills.filter((s) => s.state === "foreign");
    if (stale.length) {
      const why = [...new Set(stale.map((s) => s.reason).filter(Boolean))].join("; ");
      out.push(finding("install", "issue", "agent-skills",
        `${t.dir} (${who}): ${stale.length} skill(s) no longer match what install would write (${stale.map((s) => s.name).join(", ")}${why ? ` — ${why}` : ""}) — re-run \`waypost skills install\`.`));
    }
    if (foreign.length) {
      out.push(finding("install", "warn", "agent-skills-foreign",
        `${t.dir} (${who}): ${foreign.map((s) => s.name).join(", ")} exist under the waypost- prefix but were not generated by waypost — install and --fix skip them.`));
    }
    if (absent.length && absent.length < t.skills.length) {
      out.push(finding("install", "warn", "agent-skills",
        `${t.dir} (${who}): ${absent.length} of ${t.skills.length} skills missing (${absent.map((s) => s.name).join(", ")}) — \`waypost skills install\`.`));
    }
    if (absent.length === t.skills.length && t.harnesses.some((h) => used.has(h))) {
      out.push(finding("install", "info", "agent-skills",
        `${who} reads skills from ${t.dir}/ but has no waypost skills there — \`waypost skills install\` puts the ${skillNames().length} bundled ones in.`));
    }
  }
  return out;
}

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
