#!/usr/bin/env node
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
// CLI: node doctor.mjs [--install] [--vault] [--startup] [--json]
//      default = --install --vault. --json (and --startup) always exit 0 (a
//      reporting tool); the plain-text report exits 1 when an issue-level
//      finding exists, so `waypost doctor && ...` sees failures.

import {
  existsSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  accessSync,
  constants,
} from "node:fs";
import { join, basename, resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  readConfig,
  loadLayout,
  folderByKind,
  parseFrontmatter,
  pluginRoot,
  projectRoot,
  listOf,
  readVaultConfig,
  vaultConfigPath,
  isLegacyStory,
  sectionOf,
  headingLineRe,
  indexHeaderRe,
  evidenceSuffixRe,
  storiesAttributionRe,
  slugIdentity,
  isLegacyNumberedId,
  storyMatchesEntry,
  legalArtifactName,
  stripCodeSpans,
  extractLinks,
  buildNodeIndex,
  refsOf,
  resolveLinkTarget,
  listVaultStoryFiles,
  listEpicDirs,
  listEpicStories,
  openStoryFrom,
  lastVaultActivityMs,
  ENTRY_IGNORE,
  escCell,
  unescCell,
  ignoreEpipe,
} from "./lib.mjs";
import { uncommittedProjectFiles, lastCommitMs } from "./diff-refs.mjs";
import { peers as peersOf, readLeases as readLeasesOf } from "./presence.mjs";
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
  harnessOwnedPaths,
  status as agentStatus,
} from "./agents.mjs";
import { status as skillsStatus, skillNames } from "./skills.mjs";

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

function listMd(dir) {
  try {
    return readdirSync(dir).filter((n) => n.endsWith(".md"));
  } catch {
    return [];
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
    const agents = join(proj, "AGENTS.md");
    let agentsHasBlock = false;
    try { agentsHasBlock = AGENT_BLOCK_MARKER.test(readFileSync(agents, "utf8")); AGENT_BLOCK_MARKER.lastIndex = 0; } catch {}
    if (agentsHasBlock) {
      const reaches = ["CLAUDE.md", ".claude/CLAUDE.md"].some((f) => {
        const p = join(proj, f);
        if (!existsSync(p)) return false;
        if (importsSharedFile(p, "AGENTS.md")) return true;
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

// Derived views are regenerated, never merged (ADR-0006). Two sessions in two
// harnesses both touch a story, both regenerate the board, and git then asks a
// human to hand-merge two machine-written files. The driver removes that class
// of conflict entirely — but only where the vault is versioned WITH the code,
// which is the only case where the two can conflict in one repository.
export function checkMergeDriver(cfg, proj) {
  if (!existsSync(join(proj, ".git"))) return [];
  const vault = String((cfg && cfg.vault_path) || "");
  if (!vault || !vault.startsWith(proj + "/")) return [];
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

// ─── Cross-device / cross-OS checks (ADR-0007) ─────────────────────────
//
// A vault shared between macOS, Windows and Linux fails in ways that are
// invisible from any single one of them: a filename legal here cannot be
// checked out there, two artifacts differing only in case collapse into one on
// a case-insensitive filesystem, and CRLF normalisation turns every file a
// Windows session touches into a whole-file diff that conflicts with everything.
const WIN_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

export function checkPortableNames(cfg, vaultFiles) {
  const out = [];
  const seen = new Map();
  // walkVaultFiles yields { rel, name }; accept a plain string too so the check
  // can be driven directly from a list of paths.
  for (const entry of vaultFiles || []) {
    const rel = typeof entry === "string" ? entry : entry.rel;
    const bad = [];
    // Every SEGMENT, not just the filename: a directory named "epics " is as
    // fatal to a Windows checkout as a file named "con.md", and only the whole
    // path shows it.
    for (const seg of rel.split("/")) {
      if (/[<>:"|?*]/.test(seg)) bad.push('one of <>:"|?* — illegal in a Windows path');
      if (/[ .]$/.test(seg)) bad.push(`a segment ending in a space or dot ("${seg}") — Windows silently drops it`);
      if (WIN_RESERVED.test(seg)) bad.push(`a reserved device name on Windows ("${seg}")`);
      // eslint-disable-next-line no-control-regex
      if (/[\u0000-\u001f]/.test(seg)) bad.push("a control character");
    }
    if (bad.length) {
      out.push(finding("vault", "warn", "portable-names",
        `"${rel}" cannot be checked out on Windows: it contains ${[...new Set(bad)].join("; ")}.`, rel));
    }
    const key = rel.toLowerCase();
    if (seen.has(key) && seen.get(key) !== rel) {
      out.push(finding("vault", "issue", "portable-names",
        `"${rel}" and "${seen.get(key)}" differ only in case — on macOS and Windows one of them cannot exist, so a clone there loses a file.`, rel));
    } else seen.set(key, rel);
    if (rel.length > 180) {
      out.push(finding("vault", "info", "portable-names",
        `"${rel}" is ${rel.length} characters — close to the 260-character path limit a Windows clone still has by default.`, rel));
    }
  }
  return out;
}

// Without an eol policy, a Windows session commits CRLF and every subsequent
// diff is the whole file — which then conflicts with every parallel edit. This
// is the cheapest possible defence and belongs beside the merge driver.
export function checkLineEndings(cfg, proj) {
  if (!existsSync(join(proj, ".git"))) return [];
  let attrs = "";
  try { attrs = readFileSync(join(proj, ".gitattributes"), "utf8"); } catch {}
  const line = attrs.match(/^\*\s+text=auto.*$/m);
  if (!line) {
    return [finding("install", "warn", "line-endings",
      "No `* text=auto eol=lf` in .gitattributes — a session on Windows will commit CRLF and every file it touches becomes a whole-file diff that conflicts with everyone else's edits. `waypost doctor --fix` writes it.")];
  }
  if (!/\beol=/.test(line[0])) {
    return [finding("install", "warn", "line-endings",
      `\`${line[0].trim()}\` in .gitattributes pins normalisation but not the checkout ending, so git falls back to core.eol=native and a checkout on Windows still writes CRLF into the working tree — invisibly, because check-in normalises back and \`git status\` stays clean. \`waypost doctor --fix\` appends \`eol=lf\`.`)];
  }
  return [];
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
const FOREIGN_MACHINE_DRIVER_RE = /merge-derived(\.mjs)? %A %O %B %P$/;

export function mergeDriverAccepted() {
  return [
    "waypost merge-derived %A %O %B %P",
    `node ${join(pluginRoot(), "scripts", "merge-derived.mjs")} %A %O %B %P`,
    `${process.execPath} ${join(pluginRoot(), "scripts", "merge-derived.mjs")} %A %O %B %P`,
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
  return `node ${join(pluginRoot(), "scripts", "merge-derived.mjs")} %A %O %B %P`;
}

export function checkVaultGit(cfg, proj = projectRoot()) {
  if (existsSync(join(cfg.vault_path, ".git"))) return [];
  // A vault INSIDE the project repository is already versioned by it. Running
  // `git init` there would create a nested repository: the outer repo would
  // start seeing a gitlink where files used to be, and the vault's own history
  // would live in a directory nobody clones. The whole point of the check is
  // "this knowledge has history" — inside the repo, it does.
  if (String(cfg.vault_path || "").startsWith(proj + "/") && existsSync(join(proj, ".git"))) return [];
  return [finding("install", "warn", "vault-git",
    "Vault is not a git repository — the knowledge has no history/blame/review. Consider `git init` (doctor --fix offers it).")];
}

// ─── Vault checks ──────────────────────────────────────────────────────

// Collect every structured artifact with parsed frontmatter.
export function scanArtifacts(cfg, layout) {
  const vault = cfg.vault_path;
  const artifacts = [];
  const push = (abs, rel, kind) => {
    let md;
    try { md = readFileSync(abs, "utf8"); } catch { return; }
    artifacts.push({ abs, rel, kind, fm: parseFrontmatter(md).data, body: md });
  };
  for (const folder of layout.folders) {
    const dir = join(vault, folder.path);
    if (!existsSync(dir)) continue;
    if (folder.kind === "epic") {
      for (const id of listEpicDirs(dir)) {
        const epicMd = join(dir, id, "epic.md");
        if (existsSync(epicMd)) push(epicMd, `${folder.path}/${id}/epic.md`, "epic");
        // listEpicStories sees all three story shapes (flat, folder, and
        // standalone epics/<id>/story-*.md) — a manual stories/*.md glob
        // silently dropped the other two from every vault-side check.
        for (const s of listEpicStories(join(dir, id))) {
          push(s.abs, `${folder.path}/${id}/${s.rel}`, "story");
        }
      }
    } else {
      for (const f of listMd(dir)) {
        if (f === "README.md") continue;
        push(join(dir, f), `${folder.path}/${f}`, folder.kind);
      }
    }
  }
  return artifacts;
}

// status ↔ kanban: generate the expected board with the real generator and
// text-diff it against disk, ignoring the generated_at stamp (upstream ADR-005).
export function checkKanbanSync(cfg) {
  const vault = cfg.vault_path;
  const onDisk = join(vault, "kanban.md");
  if (!existsSync(onDisk)) {
    return [finding("vault", "info", "kanban", "No kanban.md yet — run waypost kanban to create the board.")];
  }
  const r = spawnSync(process.execPath, [join(pluginRoot(), "scripts", "kanban.mjs")], {
    encoding: "utf8",
    timeout: 10000,
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectRoot() },
  });
  if (r.status !== 0) {
    return [finding("vault", "warn", "kanban", `kanban generator failed: ${(r.stderr || "").trim()}`)];
  }
  let expected;
  try { expected = JSON.parse(r.stdout).content; } catch {
    return [finding("vault", "warn", "kanban", "kanban generator returned unparseable output.")];
  }
  const norm = (s) => s.split("\n").filter((l) => !l.startsWith("generated_at:")).join("\n").trimEnd();
  if (norm(expected) !== norm(readFileSync(onDisk, "utf8"))) {
    return [finding("vault", "issue", "kanban",
      "kanban.md is out of sync with story frontmatter — run waypost kanban (or reconcile).", "kanban.md")];
  }
  return [];
}

// Folder README index rows ↔ artifact frontmatter.
export function checkIndexes(cfg, layout, artifacts) {
  const out = [];
  const vault = cfg.vault_path;
  // The title cell tolerates an escaped `\|` (reconcile/draft escape a `|`
  // in a title so it cannot split the row into an extra column) — `[^|]+`
  // alone would stop at the escaped pipe and misread the rest of the row as
  // the status/date columns, producing a false index finding on a perfectly
  // reconciled row.
  const rowRx = /^\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|((?:\\\||[^|])+)\|([^|]+)\|([^|]+)\|/;
  for (const folder of layout.folders) {
    const readme = join(vault, folder.path, "README.md");
    if (!existsSync(readme)) continue;
    let rows = [];
    for (const line of readFileSync(readme, "utf8").split("\n")) {
      const m = line.match(rowRx);
      if (m) rows.push({ label: m[1], target: m[2].replace(/^\.\//, ""), title: unescCell(m[3]).trim(), status: m[4].trim() });
    }
    const indexed = new Set();
    for (const row of rows) {
      const rel = `${folder.path}/${row.target}`;
      indexed.add(rel);
      const art = artifacts.find((a) => a.rel === rel);
      if (!art) {
        out.push(finding("vault", "issue", "index",
          `${folder.path}/README.md row "${row.label}" points at a missing file: ${row.target}`, `${folder.path}/README.md`));
        continue;
      }
      const fmStatus = (art.fm.status || "").trim();
      if (fmStatus && row.status && fmStatus !== row.status) {
        out.push(finding("vault", "issue", "index",
          `${folder.path}/README.md lists "${row.label}" as "${row.status}" but its frontmatter says "${fmStatus}".`, art.rel));
      }
      const fmTitle = (art.fm.title || "").trim();
      if (fmTitle && row.title && fmTitle !== row.title) {
        out.push(finding("vault", "warn", "index",
          `${folder.path}/README.md title for "${row.label}" differs from frontmatter title.`, art.rel));
      }
    }
    for (const a of artifacts) {
      const inFolder = folder.kind === "epic"
        ? a.kind === "epic" && a.rel.startsWith(`${folder.path}/`)
        : a.kind === folder.kind && a.rel === `${folder.path}/${basename(a.rel)}`;
      if (inFolder && !indexed.has(a.rel)) {
        out.push(finding("vault", "warn", "index",
          `${a.rel} is not listed in ${folder.path}/README.md's index.`, a.rel));
      }
    }
  }
  return out;
}

// Fence/inline-code stripping lives in lib.mjs (stripCodeSpans) — one
// definition shared with the link-graph extractor, so "not a link/checkbox
// when inside code" means the same thing everywhere.

// RAW lines outside fenced blocks — for checks that must both MATCH (fence-
// immune) and REPORT the line verbatim (backticks intact in the message).
function linesOutsideFences(s) {
  const out = [];
  let fenced = false;
  for (const line of s.split("\n")) {
    if (/^\s*```/.test(line)) { fenced = !fenced; continue; }
    if (!fenced) out.push(line);
  }
  return out;
}

// Epic id of a story artifact, derived from the layout's epic folder path —
// never from a hardcoded segment index (custom layouts may nest the folder).
function epicIdOf(storyRel, epicFolderPath) {
  if (!storyRel.startsWith(epicFolderPath + "/")) return null;
  return storyRel.slice(epicFolderPath.length + 1).split("/")[0];
}

export function checkStoriesAndEpics(artifacts) {
  const out = [];
  for (const a of artifacts) {
    if (a.kind === "story" && (a.fm.status || "").toLowerCase() === "done") {
      const sec = sectionOf(a.body, "acceptance") || "";
      const unchecked = (stripCodeSpans(sec).match(/- \[ \]/g) || []).length;
      if (unchecked > 0) {
        out.push(finding("vault", "warn", "acceptance",
          `Story is "done" with ${unchecked} unchecked acceptance criteria.`, a.rel));
      }
    }
    if ((a.fm.review_status || "") === "reviewed" && (!a.fm.reviewed_at || a.fm.reviewed_at === "null")) {
      out.push(finding("vault", "issue", "review-status",
        `review_status is "reviewed" but reviewed_at is empty.`, a.rel));
    }
  }
  for (const epic of artifacts.filter((a) => a.kind === "epic")) {
    if ((epic.fm.status || "").toLowerCase() !== "done") continue;
    const dir = epic.rel.replace(/\/epic\.md$/, "");
    const open = artifacts.filter((s) =>
      s.kind === "story" && s.rel.startsWith(dir + "/") && (s.fm.status || "").toLowerCase() !== "done");
    if (open.length) {
      out.push(finding("vault", "issue", "epic-status",
        `Epic is "done" while ${open.length} child stor${open.length === 1 ? "y is" : "ies are"} not.`, epic.rel));
    }
  }
  return out;
}

// Folder README whose index table header matches no registered form — the
// silent-rebuildIndex-null class of failure (ru indexes never reconciled for
// the whole life of the feature). Standard form is 4 columns; extra hand-kept
// columns (e.g. a 5-column specs index) are flagged for migration, since
// reconcile would drop them.
export function checkIndexHeaders(cfg, layout) {
  const out = [];
  const headerRe = indexHeaderRe();
  for (const folder of layout.folders) {
    const readme = join(cfg.vault_path, folder.path, "README.md");
    if (!existsSync(readme)) continue;
    const lines = readFileSync(readme, "utf8").split("\n");
    const headIdx = lines.findIndex((l, i) =>
      /^\|.*\|\s*$/.test(l) && /^\|[-\s|]+\|\s*$/.test(lines[i + 1] || ""));
    if (headIdx === -1) continue; // no table at all — nothing to lint
    if (!headerRe.test(lines[headIdx])) {
      out.push(finding("vault", "warn", "index-header",
        `${folder.path}/README.md index header "${lines[headIdx].trim()}" matches no registered form — reconcile cannot rebuild this index (standard form: | File | Title | Status | Date |, localized forms in scaffold/headings.json).`,
        `${folder.path}/README.md`));
    }
  }
  return out;
}

// ─── Spec checks (PS-SPEC story-006, upstream ADR-007 Decisions 2/3/5/6) ────────
//
// All spec gates are no-ops unless the VAULT policy says spec_policy=required.
// Link integrity (checkSpecLinks) runs whenever specs exist — dead links are
// defects regardless of policy.

function specStatusOf(spec) {
  return String(spec.fm.status || "draft").toLowerCase();
}

// Filename stem used for story identity matching; a folder-shape story
// (stories/<name>/README.md) is identified by its folder name.
function storyStemOf(storyRel) {
  const b = basename(storyRel);
  return b === "README.md" ? basename(dirname(storyRel)) : b.replace(/\.md$/, "");
}

// Resolve a spec's `stories:` entry "<epic-id>/<story-id>" to a story
// artifact. Tiered via the shared matcher (SPEC-002 contract 5): exact fm.id,
// exact filename stem, legacy story-NNN prefix fallback — the strongest tier
// wins across the epic's stories, and a tie within it is a reported
// ambiguity, never a silent first match.
function resolveSpecStory(entry, artifacts, epicFolderPath) {
  const m = String(entry).match(/^([^/]+)\/(.+)$/);
  if (!m) return { error: `not in <epic-id>/<story-id> form: "${entry}"` };
  const [, epicId, storyId] = m;
  let best = 0;
  let hits = [];
  for (const a of artifacts) {
    if (a.kind !== "story" || epicIdOf(a.rel, epicFolderPath) !== epicId) continue;
    const tier = storyMatchesEntry(storyId, { id: a.fm.id, stem: storyStemOf(a.rel) });
    if (!tier) continue;
    if (best === 0 || tier < best) { best = tier; hits = [a]; }
    else if (tier === best) hits.push(a);
  }
  if (hits.length === 1) return { story: hits[0] };
  if (hits.length > 1) {
    return { error: `ambiguous — "${storyId}" matches ${hits.map((a) => storyStemOf(a.rel)).join(", ")}; qualify the reference` };
  }
  return { error: `no story in ${epicFolderPath}/${epicId} matches "${storyId}" (by exact id:, exact filename stem, or legacy story-NNN prefix)` };
}

// The ONE spec resolver (SPEC-002 contract 5) — shared by checkSpecLinks,
// checkSpecCoverage and checkSpecAcceptance: dual-keying only some of them
// would let the others silently skip a resolvable spec (their "dead link
// already reported" premise breaks). Exact fm.id wins (grandfathered
// SPEC-NNN entries hit here); normalized filename-stem candidates (legacy
// prefix stripped, case-insensitive) resolve slug-form references to
// grandfathered SPEC-NNN-<slug>.md files. Cross-spec identity clashes are
// the identity check's finding, so first-wins here stays deterministic.
function buildSpecResolver(artifacts, layout = null) {
  const prefix = layout ? folderByKind(layout, "spec")?.prefix ?? null : null;
  const byId = new Map();
  const byStem = new Map();
  for (const s of artifacts.filter((a) => a.kind === "spec")) {
    const id = String(s.fm.id || "");
    if (id && !byId.has(id)) byId.set(id, s);
    for (const c of slugIdentity(basename(s.rel), { prefix }).candidates) {
      if (!byStem.has(c.id)) byStem.set(c.id, s);
    }
  }
  return (ref) => byId.get(String(ref)) ?? byStem.get(String(ref).toLowerCase()) ?? null;
}

// Parse a spec's Acceptance section into items:
// { checked, text, stories: [bare story ids] | null (unattributed) }
export function parseSpecAcceptance(spec) {
  const sec = sectionOf(spec.body, "spec_acceptance");
  if (sec === null) return null;
  const attrRe = storiesAttributionRe();
  const items = [];
  for (const line of linesOutsideFences(sec)) {
    const m = line.match(/^\s*-\s*\[( |x|X)\]\s*(.*)$/);
    if (!m) continue;
    const checked = m[1].toLowerCase() === "x";
    const text = m[2];
    // Full-width colon accepted for the same reason as the evidence suffix: a zh
    // spec writing `— stories：PS-X/story-foo` must attribute the item to that
    // story, not silently fall through to "applies to every covered story".
    const attr = text.match(attrRe);
    const stories = attr
      ? attr[1].split(",").map((s) => s.trim()).filter(Boolean)
      : null;
    items.push({ checked, text, stories });
  }
  return items;
}

export function checkSpecLinks(cfg, layout, artifacts) {
  const out = [];
  const epicFolder = folderByKind(layout, "epic");
  if (!epicFolder) return out;
  const specs = artifacts.filter((a) => a.kind === "spec");
  const resolveSpec = buildSpecResolver(artifacts, layout);

  for (const spec of specs) {
    for (const entry of listOf(spec.fm, "stories")) {
      const r = resolveSpecStory(entry, artifacts, epicFolder.path);
      if (r.error) {
        out.push(finding("vault", "issue", "spec-links",
          `Spec "${spec.fm.id}" stories entry "${entry}" does not resolve: ${r.error}.`, spec.rel));
      } else if (spec.fm.id &&
                 !listOf(r.story.fm, "specs").some((ref) => resolveSpec(ref) === spec)) {
        // Membership through the SAME resolver — a slug-form back-reference
        // to a grandfathered SPEC-NNN file is a valid link, not a gap.
        out.push(finding("vault", "warn", "spec-links",
          `Spec "${spec.fm.id}" covers ${entry} but the story's \`specs:\` list lacks "${spec.fm.id}" (bidirectional link).`, r.story.rel));
      }
    }
  }
  for (const story of artifacts.filter((a) => a.kind === "story")) {
    for (const id of listOf(story.fm, "specs")) {
      const spec = resolveSpec(id);
      if (!spec) {
        out.push(finding("vault", "issue", "spec-links",
          `Story lists spec "${id}" which does not exist in specs/.`, story.rel));
      } else {
        const epicId = epicIdOf(story.rel, epicFolder.path);
        const stem = storyStemOf(story.rel);
        const covered = listOf(spec.fm, "stories").some((e) => {
          const m = String(e).match(/^([^/]+)\/(.+)$/);
          return m && m[1] === epicId &&
            storyMatchesEntry(m[2], { id: story.fm.id, stem }) > 0;
        });
        if (!covered) {
          out.push(finding("vault", "warn", "spec-links",
            `Story lists spec "${id}" but that spec's \`stories:\` does not list it back.`, story.rel));
        }
      }
    }
    // Block-sequence YAML trap: parseFrontmatter is line-based; `specs:` with
    // an empty parsed value while the raw FRONTMATTER shows a block list means
    // the list is invisible to every deterministic check.
    const fmBlock = story.body.match(/^---\r?\n[\s\S]*?\r?\n---/);
    if (story.fm.specs === "" && fmBlock && /\nspecs:\s*\n\s+-\s/.test(fmBlock[0])) {
      out.push(finding("vault", "issue", "spec-links",
        "`specs:` uses block-sequence YAML which projectstore cannot parse — use inline flow: specs: [\"SPEC-001\"].", story.rel));
    }
  }
  return out;
}

// In-scope story = status beyond planned, not legacy-exempt.
function specScopeStatus(fm) {
  const s = String(fm.status || "").toLowerCase();
  return ["in-progress", "in_progress", "review", "done"].includes(s) ? s : null;
}

export function checkSpecCoverage(artifacts, vaultCfg, layout = null) {
  if ((vaultCfg.spec_policy || "optional") !== "required") return [];
  const out = [];
  const since = vaultCfg.spec_policy_since || null;
  const resolveSpec = buildSpecResolver(artifacts, layout);

  for (const story of artifacts.filter((a) => a.kind === "story")) {
    const status = specScopeStatus(story.fm);
    if (!status) continue;
    if (isLegacyStory(story.fm, since)) continue;
    const ids = listOf(story.fm, "specs");
    if (!ids.length) {
      out.push(finding("vault", "issue", "spec-coverage",
        `Story is ${status} with no covering spec (spec_policy: required — every story needs a spec).`, story.rel));
      continue;
    }
    for (const id of ids) {
      const spec = resolveSpec(id);
      if (!spec) continue; // dead link already reported by spec-links (same resolver)
      const st = specStatusOf(spec);
      if (status === "done") {
        if (!["active", "superseded"].includes(st)) {
          out.push(finding("vault", "issue", "spec-status",
            `Story is done while covering spec "${id}" is ${st} — a story may close only against an active spec.`, story.rel));
        }
      } else if (st === "draft") {
        out.push(finding("vault", "warn", "spec-status",
          `Story is ${status} while covering spec "${id}" is still draft — the spec must go active before implementation.`, story.rel));
      }
    }
  }
  return out;
}

// Additive acceptance oracle (upstream ADR-007 Decision 3): a done story requires every
// spec acceptance item ATTRIBUTED to it (bare ids resolved against that spec's
// own stories list) — plus every UNATTRIBUTED item — checked, in every
// covering spec.
export function checkSpecAcceptance(layout, artifacts, vaultCfg) {
  if ((vaultCfg.spec_policy || "optional") !== "required") return [];
  const out = [];
  const since = vaultCfg.spec_policy_since || null;
  const epicFolder = folderByKind(layout, "epic");
  if (!epicFolder) return out;
  const resolveSpec = buildSpecResolver(artifacts, layout);
  const ambiguousReported = new Set(); // spec-scoped: one finding per spec+item

  for (const story of artifacts.filter((a) => a.kind === "story")) {
    if (String(story.fm.status || "").toLowerCase() !== "done") continue;
    if (isLegacyStory(story.fm, since)) continue;
    const epicId = epicIdOf(story.rel, epicFolder.path);
    const stem = storyStemOf(story.rel);

    for (const id of listOf(story.fm, "specs")) {
      const spec = resolveSpec(id);
      if (!spec) continue;
      const items = parseSpecAcceptance(spec);
      if (items === null) {
        out.push(finding("vault", "warn", "spec-acceptance",
          `Covering spec "${id}" has no Acceptance section — its criteria cannot gate this story.`, spec.rel));
        continue;
      }
      const coveredEntries = listOf(spec.fm, "stories");
      for (const item of items) {
        let applies;
        if (item.stories === null) {
          applies = true; // unattributed → applies to all covered stories
        } else {
          // Bare ids resolve against THIS spec's own stories list.
          applies = item.stories.some((bare) =>
            coveredEntries.some((e) => {
              const m = String(e).match(/^([^/]+)\/(.+)$/);
              return m && m[1] === epicId && bare === m[2] &&
                storyMatchesEntry(bare, { id: story.fm.id, stem }) > 0;
            }));
          const ambiguous = item.stories.some((bare) =>
            coveredEntries.filter((e) => {
              const m = String(e).match(/^([^/]+)\/(.+)$/);
              return m && bare === m[2];
            }).length > 1);
          const ambKey = `${spec.rel}|${item.text}`;
          if (ambiguous && !ambiguousReported.has(ambKey)) {
            ambiguousReported.add(ambKey);
            out.push(finding("vault", "warn", "ambiguous-attribution",
              `Spec "${id}" acceptance item attributes bare id(s) "${item.stories.join(", ")}" that match more than one covered epic — qualify as <epic-id>/<story-id>.`, spec.rel));
          }
        }
        if (applies && !item.checked) {
          out.push(finding("vault", "issue", "spec-acceptance",
            `Story is done but spec "${id}" acceptance item is unchecked: "${item.text.slice(0, 80)}".`, story.rel));
        }
      }
    }
  }
  return out;
}

// ─── Lifecycle gates (PS-SPEC story-008) — behind lifecycle_gates=on ───

export function checkLifecycleGates(artifacts, vaultCfg) {
  const gates = String(vaultCfg.lifecycle_gates || "off").toLowerCase();
  if (!["on", "true"].includes(gates)) return [];
  const out = [];
  const since = vaultCfg.spec_policy_since || null;
  const evidenceRe = evidenceSuffixRe();

  for (const story of artifacts.filter((a) => a.kind === "story")) {
    if (String(story.fm.status || "").toLowerCase() !== "done") continue;
    if (isLegacyStory(story.fm, since)) continue;

    const acc = sectionOf(story.body, "acceptance");
    if (acc !== null) {
      // Raw lines (fence-immune matching, verbatim reporting — backticks kept).
      for (const line of linesOutsideFences(acc)) {
        const m = line.match(/^\s*-\s*\[(x|X)\]\s*(.*)$/);
        if (m && !evidenceRe.test(m[2])) {
          out.push(finding("vault", "warn", "evidence",
            `Checked acceptance criterion carries no evidence suffix ("— evidence: <test | command | file:line>"): "${m[2].slice(0, 70)}".`, story.rel));
        }
      }
    }

    const plan = sectionOf(story.body, "implementation_plan");
    if (plan !== null && (!story.fm.plan_updated_at || story.fm.plan_updated_at === "null")) {
      out.push(finding("vault", "warn", "plan-gate",
        "Story has an Implementation Plan section but no plan_updated_at — the plan bypassed the waypost story plan gate.", story.rel));
    }
    const summary = sectionOf(story.body, "final_summary");
    if (summary === null) {
      out.push(finding("vault", "warn", "final-summary",
        "Done story has no Final Summary section (lifecycle_gates: on requires a close-out record).", story.rel));
    }
    if (plan === null) {
      out.push(finding("vault", "warn", "plan-gate",
        "Done story has no Implementation Plan section (lifecycle_gates: on requires the plan to live in the story).", story.rel));
    }
  }
  return out;
}

// Suggestion for existing binds: specs exist but no vault policy declared.
// vaultCfg already degraded a parse failure to {} (readVaultConfig's own
// stderr warning) — a re-read here is the only way doctor can tell "no
// policy file" apart from "a policy file that no longer parses", and the
// second one silently drops spec_policy: required to optional with no other
// signal at all.
export function checkVaultPolicy(cfg, layout, artifacts, vaultCfg) {
  const out = [];
  const p = vaultConfigPath(cfg.vault_path);
  if (existsSync(p)) {
    try {
      JSON.parse(readFileSync(p, "utf8"));
    } catch (e) {
      out.push(finding("vault", "issue", "vault-policy",
        `<vault>/.projectstore.json is not valid JSON (${e.message}) — spec_policy and lifecycle_gates fall back to their defaults until it is fixed.`,
        ".projectstore.json"));
    }
  }
  const hasSpecs = artifacts.some((a) => a.kind === "spec");
  if (hasSpecs && !vaultCfg.spec_policy) {
    out.push(finding("vault", "info", "spec-policy",
      "Vault contains specs but declares no spec_policy — consider enabling spec-first: add { \"spec_policy\": \"required\" } to <vault>/.projectstore.json (doctor gates activate)."));
  }
  if (vaultCfg.spec_policy === "required" && !vaultCfg.spec_policy_since) {
    out.push(finding("vault", "warn", "spec-policy",
      "spec_policy is required but spec_policy_since is missing — the legacy exemption cannot be evaluated; stamp it with the enable date (ISO-8601)."));
  }
  // G-2: both gates are read as `["on", "true"].includes(...)` — anything else,
  // including a plausible-looking "yes", is silently off. Warn rather than let
  // a typo disable a gate the project believes it turned on.
  const GATE_VALUES = new Set(["on", "off", "true", "false"]);
  for (const key of ["lifecycle_gates", "acceptance_gate"]) {
    const raw = vaultCfg[key];
    if (raw === undefined || raw === null) continue;
    if (!GATE_VALUES.has(String(raw).toLowerCase())) {
      out.push(finding("vault", "warn", "vault-policy",
        `${key}: ${JSON.stringify(raw)} in <vault>/.projectstore.json is not on/off/true/false — it is read as off, silently.`,
        ".projectstore.json"));
    }
  }
  return out;
}

// One shared recursive walk of the vault's markdown files (dotfiles
// skipped). scanArtifacts only sees layout-declared folders — vault-wide
// claims (wikilink targets, identity uniqueness, filename shapes) must use
// this walk instead, or folder-shape story READMEs and loose notes go blind.
export function walkVaultFiles(vault) {
  const files = []; // { rel, name } — rel is /-joined relative to the vault root
  const walk = (dir, relDir) => {
    for (const n of readdirSync(dir)) {
      if (n.startsWith(".")) continue;
      const p = join(dir, n);
      let st;
      try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) walk(p, relDir ? `${relDir}/${n}` : n);
      else if (n.endsWith(".md")) files.push({ rel: relDir ? `${relDir}/${n}` : n, name: n });
    }
  };
  walk(vault, "");
  return files;
}

// Body links resolved through the ONE shared resolver (spec:
// vault-link-graph-derived-view-and-shared-link-resolver): dead stays an
// issue, ambiguous (multiple node candidates — invisible to the old
// basename-set check) is a NEW warn, out-of-scope (the target exists but
// is not an artifact: kanban, code-map, READMEs, attachments) is silent at
// every level. A deliberate, documented behavior change in both
// directions: tiered matching also accepts links the exact-basename check
// rejected (number-stripped slug readings), and path-qualified links now
// resolve as paths — a wrong relative depth is dead here even though
// Obsidian's basename fallback happens to heal it. The graph generator
// consumes the same resolver, so a dead edge in graph.md and a dead-link
// finding here are the same fact reported twice.
export function checkWikilinks(cfg, artifacts, vaultFiles = null, nodeIndex = null) {
  const out = [];
  const files = vaultFiles ?? walkVaultFiles(cfg.vault_path);
  let index = nodeIndex;
  if (!index) {
    try { index = buildNodeIndex(cfg, loadLayout(cfg.layout)); } catch (e) {
      // A silent no-op check would read as "links are fine" — say why not.
      return [finding("vault", "warn", "wikilink", `Link check skipped — node index failed: ${e.message}`)];
    }
  }
  for (const a of artifacts) {
    const ctx = {
      sourceRel: a.rel,
      index,
      files,
      exists: (rel) => existsSync(join(cfg.vault_path, rel)),
    };
    for (const link of extractLinks(a.body)) {
      const r = resolveLinkTarget(link.target, link.type, ctx);
      if (r.outcome === "dead") {
        out.push(link.type === "wikilink"
          ? finding("vault", "issue", "wikilink", `Dead wiki-link [[${link.target}]].`, a.rel)
          : finding("vault", "issue", "rel-link", `Dead relative link (${link.target}).`, a.rel));
      } else if (r.outcome === "ambiguous") {
        out.push(finding("vault", "warn", "wikilink",
          `Ambiguous wiki-link [[${link.target}]] — matches ${r.candidates.join(", ")}; qualify with a path.`, a.rel));
      }
    }
  }
  return out;
}

// ─── Artifact identity & filename shapes (upstream ADR-010 / SPEC-002 4, 7) ─────

// Infrastructure names carry no topic identity: README.md is every folder's
// index, epic.md every epic's root, kanban.md the board.
const INFRA_NAMES = new Set(["README.md", "epic.md", "kanban.md"]);

// Normalized slug-identity uniqueness per identity scope (a kind folder; an
// epic for stories), on candidate sets — so `upstream ADR-003-foo.md` vs `foo.md`
// and `story-006-foo.md` vs `story-foo.md` collide with no rename ever
// having happened. Severity keys on each member's ERA, decided by
// frontmatter where the filename alone is ambiguous (a digit-leading
// story stem reads as either era; the exact machine id settles it):
//   - two as-written twins (flat story + folder-shape namesake) → issue;
//   - a new-era name overlapping a certain legacy one → issue (the exact
//     case the pre-write guard exists to prevent);
//   - any member of undecidable era (digit-leading, no fm evidence) → warn;
//   - all members certainly legacy (same slug, different numbers) → info —
//     in the numbered era the number WAS the identity, so this was legal
//     and grandfathering must not turn it into a defect (contract 6).
// Duplicate display numbers are info: numbers are reference metadata
// (upstream ADR-010), duplicates confuse humans but identify nothing.
export function checkArtifactIdentity(layout, vaultFiles, artifacts = []) {
  const out = [];
  const fmByRel = new Map(artifacts.map((a) => [a.rel, a.fm]));
  // Era of one directory entry: "new" | "legacy" | "uncertain".
  const eraOf = (entry, opts) => {
    const idn = slugIdentity(entry.name, opts);
    if (!idn.legacyNumber) return "new";
    const fm = fmByRel.get(entry.rel);
    const fmId = fm && fm.id != null ? String(fm.id) : "";
    if (fmId) {
      const machineId = opts.story ? `story-${idn.primary}` : idn.primary;
      if (fmId.toLowerCase() === machineId) return "new"; // exact machine id = slug era
      if (isLegacyNumberedId(fmId, opts)) return "legacy";
    }
    const num = fm && fm.number != null ? String(fm.number).trim() : "";
    if (num && num !== "null") return "legacy";
    return idn.digitLeading ? "uncertain" : "legacy"; // prefix-anchored names are confident
  };
  const scopes = [];
  const epicFolder = folderByKind(layout, "epic");
  for (const f of layout.folders) {
    if (f.kind === "epic") continue;
    const entries = vaultFiles
      .filter((x) => dirname(x.rel) === f.path && !INFRA_NAMES.has(x.name))
      .map((x) => ({ name: x.name, rel: x.rel }));
    scopes.push({ label: f.path, entries, opts: { prefix: f.prefix || null } });
  }
  if (epicFolder) {
    const byEpic = new Map();
    for (const x of vaultFiles) {
      if (!x.rel.startsWith(epicFolder.path + "/")) continue;
      const parts = x.rel.split("/");
      let entry = null; // stories/<f>.md | stories/<dir>/README.md | standalone story-*.md
      if (parts.length === 4 && parts[2] === "stories") entry = { name: parts[3], rel: x.rel };
      else if (parts.length === 5 && parts[2] === "stories" && parts[4] === "README.md") entry = { name: parts[3], rel: x.rel };
      else if (parts.length === 3 && parts[2].startsWith("story-")) entry = { name: parts[2], rel: x.rel };
      if (!entry || INFRA_NAMES.has(entry.name)) continue;
      if (!byEpic.has(parts[1])) byEpic.set(parts[1], []);
      byEpic.get(parts[1]).push(entry);
    }
    for (const [epicId, entries] of byEpic) {
      scopes.push({ label: `${epicFolder.path}/${epicId}`, entries, opts: { story: true } });
    }
  }

  for (const { label, entries, opts } of scopes) {
    const groups = new Map(); // candidate identity -> hits
    const numbers = new Map(); // normalized display number -> entries
    for (const entry of entries) {
      const idn = slugIdentity(entry.name, opts);
      for (const c of idn.candidates) {
        if (!groups.has(c.id)) groups.set(c.id, []);
        groups.get(c.id).push({ entry, via: c.via, digitLeading: idn.digitLeading });
      }
      if (idn.legacyNumber) {
        const k = String(parseInt(idn.legacyNumber, 10));
        if (!numbers.has(k)) numbers.set(k, []);
        numbers.get(k).push(entry);
      }
    }
    const reported = new Set(); // one finding per file group, not per shared candidate
    for (const [ident, hits] of groups) {
      const uniq = [...new Map(hits.map((h) => [h.entry.rel, h])).values()];
      if (uniq.length < 2) continue;
      const key = uniq.map((h) => h.entry.rel).sort().join("|");
      if (reported.has(key)) continue;
      reported.add(key);
      const selfOnly = uniq.every((h) => h.via === "self");
      const classed = uniq.map((h) => ({ h, era: eraOf(h.entry, opts) }));
      const level = selfOnly ? "issue"
        // Overlap reached via the legacy reading of a PROVEN slug-era file
        // (its machine id is the full stem) is spurious — the file's real
        // identity is the unstripped slug.
        : classed.some(({ h, era }) => h.via !== "self" && era === "new") ? "warn"
        : classed.some(({ era }) => era === "uncertain") ? "warn"
        : classed.every(({ era }) => era === "legacy") ? "info"
        : "issue"; // a new-era name colliding with a certain legacy one
      const note = level === "warn" ? "; the overlap depends on a legacy reading that frontmatter does not confirm"
        : level === "info" ? "; all carry legacy numbers — legal in the numbered era, duplicate topic is hygiene"
        : "";
      out.push(finding("vault", level, "identity",
        `Same normalized identity "${ident}" in ${label}: ${uniq.map((h) => h.entry.name).join(", ")} — two artifacts claim one topic${note}.`,
        uniq[0].entry.rel));
    }
    for (const [num, ents] of numbers) {
      if (new Set(ents.map((e) => e.rel)).size < 2) continue;
      out.push(finding("vault", "info", "identity",
        `Display number ${num} is carried by ${ents.length} artifacts in ${label}: ${ents.map((e) => e.name).join(", ")} — numbers are reference metadata, and duplicates confuse humans.`,
        ents[0].rel));
    }
  }
  return out;
}

// Block-form YAML trap for `external_refs` (SPEC-002 contract 3): the
// line-based parseFrontmatter reads a block map as an empty scalar, so every
// deterministic consumer goes blind — the same guard class protects `specs:`
// in checkSpecLinks. Applies to every artifact kind that carries the field.
export function checkExternalRefsForm(artifacts) {
  const out = [];
  for (const a of artifacts) {
    if (a.fm.external_refs !== "") continue;
    const fmBlock = a.body.match(/^---\r?\n[\s\S]*?\r?\n---/);
    if (fmBlock && /\nexternal_refs:\s*\n\s+\S/.test(fmBlock[0])) {
      out.push(finding("vault", "issue", "external-refs",
        "`external_refs:` uses block-form YAML which projectstore cannot parse — use inline flow: external_refs: {jira: \"ABC-123\"}.", a.rel));
    }
  }
  return out;
}

// Filename-shape checks over the WHOLE vault walk (SPEC-002 contract 7):
// sync-conflict shapes by blacklist at warn (a legal-form whitelist would
// flag hand-created legacy notes), cross-folder basename collisions at info
// (short wiki-links to that basename become ambiguous).
export function checkArtifactNames(vaultFiles) {
  const out = [];
  const byName = new Map();
  for (const x of vaultFiles) {
    const bad = legalArtifactName(x.name);
    if (bad) {
      out.push(finding("vault", "warn", "artifact-name",
        `Sync-conflict filename shape — ${bad}. Merge or remove; sync engines leave these beside the original.`, x.rel));
    }
    if (INFRA_NAMES.has(x.name)) continue;
    if (!byName.has(x.name)) byName.set(x.name, []);
    byName.get(x.name).push(x.rel);
  }
  for (const [name, rels] of byName) {
    if (rels.length < 2) continue;
    out.push(finding("vault", "info", "artifact-name",
      `Basename "${name}" appears in ${rels.length} folders (${rels.map((r) => dirname(r)).join(", ")}) — short wiki-links [[${name.replace(/\.md$/, "")}]] are ambiguous.`,
      rels[0]));
  }
  return out;
}

// code_refs: status-aware (upstream ADR-004) — an unresolved path is an issue for
// in-progress / done artifacts and a warning at any other status (ADR-0009: an ADR
// is never in either state, so its refs used to go unchecked entirely). Globs are
// skipped in v1 (documented). Story refs must fall under the parent epic's refs
// (subset) — that is how drift between the two levels is caught.


// A path annotated as not-yet-there or gone is a promise, not a claim: exempt at
// every status. Suffix only — a real path cannot end in "(deleted)".
const REF_ANNOTATION = /\((?:deleted|waiting|planned)\)$/i;

// Untracked work, after the fact (spec contract 18). The reminder fires at the
// moment of the act and cannot see Bash-mediated writes at all; this is the
// backstop, and it is where the reported incident was actually caught — at
// "done". Warn, never issue: spikes and hotfixes legitimately produce this
// state, and an issue would poison the SessionStart line.
export function checkWorkWithoutStory(cfg, proj) {
  const out = [];
  if (!cfg || !cfg.vault_path) return out;

  // The same predicate the hook uses, fed by a plain read: doctor is not on a
  // hot path and needs no budget, but it must not answer a different question.
  const files = listVaultStoryFiles(cfg.vault_path);
  const fms = [];
  let unreadable = 0;
  for (const f of files) {
    try { fms.push(parseFrontmatter(readFileSync(f, "utf8")).data); } catch { unreadable++; }
  }
  if (unreadable > 0 && !openStoryFrom(fms)) {
    // A diagnostic that goes quiet because it could not read is a false clean.
    out.push(finding("vault", "warn", "work-without-story",
      `Could not read ${unreadable} story file(s), so "is any story in progress" is unproven — this check is inconclusive rather than clean.`));
    return out;
  }
  if (openStoryFrom(fms)) return out;

  // ENTRY_IGNORE, not the shared set: waypost bind writes AGENTS.md,
  // CLAUDE.md and .gitignore in a session that by construction has no story, so
  // the shared set would make this fire on every project's first run.
  const all = uncommittedProjectFiles(proj, ENTRY_IGNORE);
  if (all === null) return out; // not a git repo, shallow, no commits, detached
  // Neither the vault's own artifacts nor a harness's generated files are work
  // on the codebase: a fresh `setup` scaffolds the vault and installs roles in
  // a session that by construction has no story, and counted every one (G-6).
  const under = (f, p) => f === p || f.startsWith(`${p}/`);
  const vaultAbs = resolve(cfg.vault_path);
  const vaultRel = vaultAbs.startsWith(`${resolve(proj)}/`) ? vaultAbs.slice(resolve(proj).length + 1) : null;
  let owned = [];
  try { owned = harnessOwnedPaths(); } catch { /* an unreadable registry is doctor's own finding, not this check's */ }
  const dirty = all.filter((f) => !(vaultRel && under(f, vaultRel)) && !owned.some((p) => under(f, p)));

  // The other half: work that WAS committed, with no story to attribute it to.
  // In a repo of small frequent commits that is the common shape, and a
  // dirty-tree-only check would never see it.
  const vaultMs = lastVaultActivityMs(cfg.vault_path);
  const commitMs = lastCommitMs(proj);
  const committedSince = vaultMs !== null && commitMs !== null && commitMs > vaultMs;

  if (dirty.length === 0 && !committedSince) return out;

  // Upstream could add "and a reminder already fired N times" here, because a
  // hook was counting. Without hooks there is no such counter and no honest way
  // to claim one — the finding says what is on disk and nothing more.
  const what = [];
  if (dirty.length) what.push(`${dirty.length} uncommitted source file(s)`);
  if (committedSince) what.push("commits newer than the vault's last activity");
  out.push(finding("vault", "warn", "work-without-story",
    `${what.join(" and ")} in the project, and no story is in progress. If this is feature-sized work, open it in the vault: \`waypost draft story <EPIC> "<title>" --write\`.`));
  return out;
}

// supersedes / superseded_by (ADR-0009). graph.mjs renders these edges but never
// verifies them, so a dangling or one-directional declaration produced a
// plausible-looking graph. Severity follows the spec<->story precedent: asymmetry
// is a warning (a union is legal to write in one edit), a target that resolves to
// nothing is an issue.
//
// Resolution goes through resolveLinkTarget and refsOf — the same resolver and the
// same field reader graph.mjs uses. A private lookup here was the first version of
// this check and it was wrong twice over: it missed the bare-scalar form these
// fields are normally written in, and it rejected legal slug and case variants that
// the shared resolver accepts, turning a correct vault red.
export function checkSupersedes(index, files) {
  const out = [];
  const ctx = { index, files, kinds: null };
  const seen = new Set();
  const add = (level, rel, message) => {
    const k = `${rel}\u0000${level}\u0000${message}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(finding("vault", level, "supersedes", message, rel));
  };
  const resolve = (entry, kind) =>
    resolveLinkTarget(entry, "ref", { ...ctx, sourceRel: null, kinds: kind ? [kind] : null });
  const declaresBack = (target, key, self) =>
    refsOf(target.fm, key).some((e) => {
      const r = resolve(e, self.type);
      return r.outcome === "node" && r.node.path === self.path;
    });

  for (const node of index.nodes) {
    for (const [key, mirror] of [["supersedes", "superseded_by"], ["superseded_by", "supersedes"]]) {
      for (const entry of refsOf(node.fm, key)) {
        const r = resolve(entry, node.type);
        if (r.outcome === "ambiguous") {
          add("issue", node.path, `${key} "${entry}" is ambiguous — it matches ${r.candidates.join(", ")}.`);
          continue;
        }
        if (r.outcome !== "node") {
          // Before calling it missing, look outside this kind: a research note
          // superseded by an ADR is a true statement, and reporting it as
          // "not an artifact" was both false and unfixable without deleting the
          // declaration. The graph does not render that edge, which is worth
          // saying — but it is not an error.
          const anywhere = resolveLinkTarget(entry, "ref", { ...ctx, sourceRel: null, kinds: null });
          if (anywhere.outcome === "node") {
            add("warn", node.path,
              `${key} "${entry}" resolves to ${anywhere.node.path} (kind: ${anywhere.node.type}) — `
              + `graph.mjs reads these fields for adr only, so the edge is not rendered.`);
            continue;
          }
          if (anywhere.outcome === "ambiguous") {
            // Ambiguous OUTSIDE this kind is not "not an artifact" either — it is
            // "an artifact, just not uniquely which one", the same fact the
            // in-kind branch above already reports correctly.
            add("issue", node.path, `${key} "${entry}" is ambiguous — it matches ${anywhere.candidates.join(", ")}.`);
            continue;
          }
          add("issue", node.path, `${key} names "${entry}", which is not an artifact in this vault.`);
          continue;
        }
        if (r.node.path === node.path) {
          add("issue", node.path, `${key} points at the artifact itself.`);
          continue;
        }
        if (!declaresBack(r.node, mirror, node)) {
          add("warn", node.path,
            `${key} "${entry}" is one-directional — ${r.node.path} does not declare ${mirror} back.`);
        }
      }
    }
    // The replaced side must say so, whichever end declared the relation: a live
    // status on a withdrawn decision is how a reader acts on it anyway.
    const replaced = [];
    for (const entry of refsOf(node.fm, "supersedes")) {
      const r = resolve(entry, node.type);
      if (r.outcome === "node" && r.node.path !== node.path) replaced.push(r.node);
    }
    if (refsOf(node.fm, "superseded_by").length) replaced.push(node);
    for (const target of replaced) {
      if ((target.fm.status || "").toLowerCase() !== "superseded") {
        add("warn", target.path,
          `Declared as replaced, but its status is "${target.fm.status || "—"}", not "superseded".`);
      }
    }
  }
  return out;
}

// The acceptance gate (ADR-0009). Its own key, not lifecycle_gates: that switch is
// story-scoped, every finding under it is a warning, and `waypost bind` recommends
// turning it on — so hanging an issue-level policy there would enrol projects that
// only ever agreed to story gates.
//
// The invariant is narrow on purpose: acceptance must not happen while the review
// question is still open. Any explicit answer satisfies it — `reviewed`, `n/a`,
// `waived`, or a project's own word for "consciously not reviewed". Only silence
// (`pending`, empty) fails, so a project supplies its own vocabulary without this
// check having to know it.
const REVIEW_UNANSWERED = new Set(["", "pending", "todo", "unknown", "null"]);

export function checkAcceptanceGate(artifacts, vaultCfg) {
  const gate = String(vaultCfg.acceptance_gate || "off").toLowerCase();
  if (!["on", "true"].includes(gate)) return [];
  // Only kinds whose template carries the field: a runbook has no review_status,
  // and demanding one would be asking for a field that does not exist.
  const kinds = new Set(["adr", "spec", "research"]);
  const out = [];
  for (const a of artifacts) {
    if (!kinds.has(a.kind)) continue;
    if ((a.fm.status || "").toLowerCase() !== "accepted") continue;
    const review = String(a.fm.review_status || "").trim().toLowerCase();
    if (REVIEW_UNANSWERED.has(review)) {
      out.push(finding("vault", "issue", "acceptance-gate",
        `status is "accepted" while review_status is "${a.fm.review_status || "—"}" `
        + `(acceptance_gate: on — record the review outcome before accepting).`, a.rel));
    }
  }
  return out;
}

export function checkCodeRefs(artifacts, proj, epicFolderPath = "epics") {
  const out = [];
  const epicRefs = new Map();
  for (const e of artifacts.filter((a) => a.kind === "epic")) {
    epicRefs.set(e.rel.replace(/\/epic\.md$/, ""), listOf(e.fm, "code_refs"));
  }
  for (const a of artifacts) {
    const refs = listOf(a.fm, "code_refs");
    if (!refs.length) continue;
    const status = (a.fm.status || "").toLowerCase();
    const level = ["in-progress", "in_progress", "done"].includes(status) ? "issue" : "warn";
    for (const ref of refs) {
      const path = ref.trim();
      if (path.includes("*") || REF_ANNOTATION.test(path)) continue;
      if (!existsSync(join(proj, path))) {
        out.push(finding("vault", level, "code-refs",
          `code_refs path "${ref}" does not resolve inside the project (status: ${status || "—"}).`, a.rel));
      }
    }
    if (a.kind === "story") {
      // epicIdOf, not a `/stories/[^/]+$` regex: that shape only matches the
      // flat form and silently returns the story's own rel unchanged for a
      // folder-shape (`stories/<slug>/README.md`) or standalone
      // (`epics/<id>/story-<slug>.md`) story — losing the epic lookup for
      // two of the three story shapes.
      const epicId = epicIdOf(a.rel, epicFolderPath);
      const dir = epicId ? `${epicFolderPath}/${epicId}` : null;
      const parent = (dir && epicRefs.get(dir)) || [];
      if (!parent.length) {
        out.push(finding("vault", "warn", "code-refs",
          "Story has code_refs but its epic has none — set the epic's footprint first.", a.rel));
      } else {
        const norm = (r) => r.replace(/\/+$/, "");
        for (const ref of refs) {
          if (!parent.some((p) => norm(ref).startsWith(norm(p)))) {
            out.push(finding("vault", "warn", "code-refs",
              `Story code_ref "${ref}" falls outside the parent epic's code_refs.`, a.rel));
          }
        }
      }
    }
  }
  return out;
}

// code-map.md staleness: regenerate with the real generator and compare
// (same pattern as the kanban check).
export function checkCodeMap(cfg) {
  const p = join(cfg.vault_path, "code-map.md");
  if (!existsSync(p)) return [];
  const r = spawnSync(process.execPath, [join(pluginRoot(), "scripts", "codemap.mjs")], {
    encoding: "utf8",
    timeout: 10000,
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectRoot() },
  });
  if (r.status !== 0) return [finding("vault", "warn", "code-map", "codemap generator failed.")];
  let expected;
  try { expected = JSON.parse(r.stdout).content; } catch {
    return [finding("vault", "warn", "code-map", "codemap generator returned unparseable output.")];
  }
  const norm = (s) => s.split("\n").filter((l) => !l.startsWith("generated_at:")).join("\n").trimEnd();
  if (norm(expected) !== norm(readFileSync(p, "utf8"))) {
    return [finding("vault", "issue", "code-map",
      "code-map.md is stale against frontmatter code_refs — run waypost codemap (or reconcile).", "code-map.md")];
  }
  return [];
}

// graph.md staleness: regenerate with the real generator and compare —
// kanban's variant of the pattern, INCLUDING its missing-file info
// (checkCodeMap stays silent on a missing file; the graph deliberately
// picks the louder branch, because bare reconcile never re-mints a deleted
// graph.md — this info is the standing signal; spec contract 6).
export function checkGraph(cfg) {
  const p = join(cfg.vault_path, "graph.md");
  if (!existsSync(p)) {
    return [finding("vault", "info", "graph", "No graph.md yet — run waypost graph to create the link graph.")];
  }
  const r = spawnSync(process.execPath, [join(pluginRoot(), "scripts", "graph.mjs")], {
    encoding: "utf8",
    timeout: 10000,
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectRoot() },
  });
  if (r.status !== 0) return [finding("vault", "warn", "graph", `graph generator failed: ${(r.stderr || "").trim()}`)];
  let expected;
  try { expected = JSON.parse(r.stdout).content; } catch {
    return [finding("vault", "warn", "graph", "graph generator returned unparseable output.")];
  }
  const norm = (s) => s.split("\n").filter((l) => !l.startsWith("generated_at:")).join("\n").trimEnd();
  if (norm(expected) !== norm(readFileSync(p, "utf8"))) {
    return [finding("vault", "issue", "graph",
      "graph.md is out of sync with vault links — run waypost graph (or reconcile).", "graph.md")];
  }
  return [];
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
    ...checkSupersedes(nodeIndex, vaultFiles),
    ...checkAcceptanceGate(artifacts, vaultCfg),
    ...checkWorkWithoutStory(cfg, projectRoot()),
    ...checkCodeMap(cfg),
    ...checkGraph(cfg),
  );
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

function icon(level) {
  return level === "issue" ? "✖" : level === "warn" ? "⚠" : "ℹ";
}

function report(findings, groups) {
  const ver = waypostVersion();
  const lines = [`waypost doctor — v${ver || "?"}, ${new Date().toISOString().slice(0, 10)}`];
  for (const g of groups) {
    const fs = findings.filter((f) => f.group === g);
    lines.push("", `## ${g} (${fs.filter((f) => f.level === "issue").length} issue(s), ${fs.filter((f) => f.level === "warn").length} warning(s))`);
    if (!fs.length) lines.push("  ✓ clean");
    for (const f of fs) {
      lines.push(`  ${icon(f.level)} [${f.check}] ${f.message}${f.file ? `  — ${f.file}` : ""}`);
    }
  }
  const issues = findings.filter((f) => f.level === "issue").length;
  const warns = findings.filter((f) => f.level === "warn").length;
  lines.push("", `Summary: ${issues} issue(s), ${warns} warning(s). ${issues ? "Repairs: `waypost doctor --fix` (install), `waypost reconcile --write` (vault)." : "Vault and wiring look healthy."}`);
  return lines.join("\n");
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
    const rel = cfg.vault_path.startsWith(proj + "/") ? cfg.vault_path.slice(proj.length + 1) : null;
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

function main() {
  ignoreEpipe();
  const args = process.argv.slice(2);
  const wantJson = args.includes("--json");
  const wantFix = args.includes("--fix");
  const startup = args.includes("--startup");
  let install = args.includes("--install");
  let vault = args.includes("--vault");
  if (!install && !vault && !startup) { install = true; vault = true; }

  const cfg = readConfig();
  const proj = projectRoot();

  if (startup) {
    const r = runStartupChecks(cfg, proj);
    process.stdout.write(JSON.stringify(r) + "\n");
    return;
  }

  const findings = [];
  const groups = [];
  if (install) { groups.push("install"); findings.push(...runInstallChecks(cfg, proj)); }
  if (vault && cfg && cfg.vault_path && existsSync(cfg.vault_path)) {
    groups.push("vault");
    findings.push(...runVaultChecks(cfg));
  } else if (vault) {
    groups.push("vault");
    findings.push(finding("vault", "info", "vault", "Vault checks skipped — no usable vault (see install issues)."));
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
