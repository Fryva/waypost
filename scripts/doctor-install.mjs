// waypost — harness installation diagnostics; Doctor retains orchestration and repairs.
import { existsSync, readFileSync, readdirSync, accessSync, constants } from "node:fs";
import { join, relative } from "node:path";
import { loadLayout, folderByKind, pluginRoot } from "./lib.mjs";
import {
  AGENT_BLOCK_MARKER, AGENT_BLOCK_VERSION, HARNESSES, PREFIX as AGENT_PREFIX,
  detectHarnesses, detectHarness, harnessIds, instructionTargets,
  importsSharedFile, importTargets, status as agentStatus,
} from "./agents.mjs";
import { status as skillsStatus, skillNames } from "./skills.mjs";

function finding(group, level, check, message, file) {
  const f = { group, level, check, message };
  if (file) f.file = file;
  return f;
}

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

