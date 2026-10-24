#!/usr/bin/env node
import { AGENT_BLOCK_VERSION, AGENT_BLOCK_MARKER, PREFIX, TIERS, registry, harness, isProvider, CONFIDENCE, confidenceOf, harnessIds, providerIds, detectProvider, HARNESSES, harnessTakesModel, roleSpec } from "./agents-registry.mjs";
export { AGENT_BLOCK_VERSION, AGENT_BLOCK_MARKER, PREFIX, TIERS, registry, harness, isProvider, CONFIDENCE, confidenceOf, harnessIds, providerIds, detectProvider, HARNESSES, harnessTakesModel } from "./agents-registry.mjs";
import { resolveModel, installedRoleOf, renderHashOf, renderFor, fill } from "./agents-render.mjs";
export { resolveModel, installedRoleOf, renderHashOf, renderFor } from "./agents-render.mjs";
import { detectHarnesses, detectHarness, installHarnesses, gateCheck, BLOCK_RE } from "./agents-detection.mjs";
export { detectHarnesses, detectHarness, installHarnesses, gateCheck } from "./agents-detection.mjs";
// waypost — agents.mjs
// Harness-neutral agent roles + per-harness adapters (ADR-0003).
//
// One source of truth: agents/<role>.md, whose frontmatter is neutral
// (name / description / mode / model tier / effort / access / tools). Each
// harness gets that same role rendered into ITS native format:
//
//   claude    .claude/agents/waypost-<role>.md      (subagent, model opus/sonnet/haiku)
//   opencode  .opencode/agent/waypost-<role>.md     (mode: subagent, tools map)
//   codex     .codex/prompts/waypost-<role>.md      (custom prompt, fresh context)
//
// Everything a harness cannot express natively is still reachable the same
// way from all of them: `waypost agents show <role>` prints the raw prompt, so a
// harness with neither subagents nor prompt files can spawn a fresh context
// with it (e.g. `codex exec "$(waypost agents show critic)"`).
//
// Generated files carry a provenance line with the source hash, so doctor can
// tell "installed and current" from "installed and stale" without an LLM.
//
// CLI: node agents.mjs list|show|install|uninstall|register|unregister|model [args]

import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync, unlinkSync, rmdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  pluginRoot,
  projectRoot,
  readConfig,
  writeConfig,
  parseFrontmatter,
  loadLayout,
  ignoreEpipe,
  pathUnder,
} from "./lib.mjs";


// A role naming a tool outside this vocabulary would render as a nonexistent
// tool for Claude Code and be silently dropped by OpenCode. Fail at read time,
// where the message can name the file, rather than at use time in the harness.
const TOOL_VOCABULARY = new Set(["read", "grep", "glob", "bash", "edit", "write", "web"]);


// ─── Role definitions ──────────────────────────────────────────────────

export function rolesDir() {
  return join(pluginRoot(), "agents");
}

export function roleNames() {
  let dir;
  try {
    dir = rolesDir();
    return readdirSync(dir)
      .filter((n) => n.endsWith(".md"))
      .map((n) => n.replace(/\.md$/, ""))
      .sort();
  } catch {
    // Same reasoning as registry(): the bundled agents/ directory is the
    // tool's own data, so unreadable means a misconfigured WAYPOST_HOME /
    // CLAUDE_PLUGIN_ROOT, not "no roles" — fail loudly instead of an empty list.
    throw new Error(
      `Cannot read the bundled role directory at ${dir} ` +
      `(pluginRoot: ${pluginRoot()}). Check WAYPOST_HOME / CLAUDE_PLUGIN_ROOT.`);
  }
}

// Memoized on (path, mtime, size): status() asks for every role of every
// harness, so with a dozen entries this was re-reading and re-hashing the same
// five files sixty times per `waypost doctor`.
const _roleCache = new Map();

export function readRole(name) {
  const p = join(rolesDir(), `${name}.md`);
  if (!existsSync(p)) throw new Error(`No such role: ${name} (expected ${p})`);
  let key = null;
  try {
    const st = statSync(p);
    key = `${p}:${st.mtimeMs}:${st.size}`;
    if (_roleCache.has(key)) return _roleCache.get(key);
  } catch { /* fall through to an uncached read */ }
  const role = parseRole(p, readFileSync(p, "utf8"), name);
  if (key) _roleCache.set(key, role);
  return role;
}

function parseRole(p, raw, name) {
  const { data, body } = parseFrontmatter(raw);
  const tools = String(data.tools || "")
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const unknown = tools.filter((t) => !TOOL_VOCABULARY.has(t));
  if (unknown.length) {
    throw new Error(
      `${p}: unknown tool(s) ${unknown.join(", ")} — the neutral vocabulary is ${[...TOOL_VOCABULARY].join(", ")}`);
  }
  // `model:` here is a TIER, not a vendor id. An upstream role file says
  // `model: opus`, which used to fall through resolveModel as an unknown key
  // and render with no model line at all — a silent downgrade, in the exact
  // format this fork asks people to migrate from.
  const tier = data.model || "balanced";
  if (!TIERS.includes(tier)) {
    throw new Error(
      `${p}: model: ${tier} is not a neutral tier — use one of ${TIERS.join(", ")}`
      + " (a vendor id belongs in the config: `waypost agents model`)");
  }
  // Two descriptions, and the difference is a token budget: `summary` is what
  // goes into every generated harness file and into the routing block, because
  // a harness injects every agent's description into the MAIN context of every
  // session. The long `description` stays here for `waypost agents list` and for
  // humans reading the source. Five roles × 110 tokens of prose was 554 tokens
  // paid on every turn of every session to say five things twice.
  const description = String(data.description || "").trim();
  return {
    name: data.name || name,
    description,
    summary: String(data.summary || description.split(/(?<=\.)\s/)[0] || description).trim().slice(0, 200),
    mode: data.mode || "subagent",
    tier,
    effort: data.effort || null,
    access: data.access || "read-only",
    tools,
    body: body.replace(/^\n+/, ""),
    path: p,
    hash: createHash("sha256").update(raw).digest("hex").slice(0, 12),
  };
}

export function listRoles() {
  return roleNames().map(readRole);
}

// Where a harness discovers project-level Agent Skills (WP-14, the open
// SKILL.md standard). `dir` is the one directory waypost installs into for
// that harness — `.agents/skills` whenever the harness reads it, so tools that
// share the directory share one copy; `reads` is every directory it discovers,
// so a doctor can tell ours from theirs. The evidence discipline is the roles':
// `documented` names the vendor page, `inferred` says what was assumed. `null`
// means the harness has no project-level skills discovery; `skills_note` says
// why. The standard itself defines no discovery path — every entry here comes
// from that harness's own documentation, never from a convention.
export function skillsOf(id) {
  const h = harness(id);
  const s = h.skills;
  if (s === null || s === undefined) return null;
  const bad = (m) => { throw new Error(`${id}: skills.${m}`); };
  if (typeof s !== "object" || Array.isArray(s)) bad("must be an object or null");
  if (typeof s.dir !== "string" || !s.dir) bad("dir must name a directory");
  const reads = Array.isArray(s.reads) && s.reads.length ? s.reads : [s.dir];
  if (!reads.includes(s.dir)) bad("reads must include dir");
  const confidence = s.confidence || "inferred";
  if (!CONFIDENCE.includes(confidence)) bad(`confidence ${JSON.stringify(s.confidence)} is not one of ${CONFIDENCE.join(", ")}`);
  if (confidence !== "inferred" && !/^https?:\/\//.test(String(s.docs || ""))) bad(`${confidence} needs docs (a URL)`);
  if (confidence === "inferred" && !String(s.notes || "").trim()) bad("inferred needs notes saying what was assumed");
  return { dir: s.dir, reads, confidence, docs: s.docs || null, notes: s.notes || null };
}

// Roster the bound layout declares, intersected with what actually ships —
// a layout naming a role we do not have is a layout bug, not an install one.
export function rosterFor(cfg) {
  const have = new Set(roleNames());
  let want = null;
  try {
    want = loadLayout((cfg && cfg.layout) || "engineering").agents || null;
  } catch { /* unknown layout: fall back to everything bundled */ }
  return (want || [...have]).filter((n) => have.has(n));
}


// Which harnesses a harness-blind pin (`default`, `per_agent`) can reach: only
// those whose registry entry maps the neutral tiers onto real model ids.
export const harnessesNamingModels = () =>
  harnessIds().filter((id) => Object.values((roleSpec(harness(id)).model || {}).tiers || {}).some(Boolean));


export function targetDir(id, proj = projectRoot()) {
  const spec = roleSpec(harness(id));
  const rel = spec.dir || dirname(spec.file || "");
  return join(proj, rel);
}

// Paths a harness owns inside a project — its generated role files and its
// own routing file — as repo-relative prefixes. Registry data, not a list here,
// so a new harness JSON brings its own.
export function harnessOwnedPaths() {
  const out = new Set();
  for (const h of registry().values()) {
    const r = h.roles || {};
    if (r.dir) out.add(String(r.dir).replace(/\/+$/, ""));
    else if (r.file && !String(r.file).includes("{")) out.add(r.file);
    for (const f of h.instructions || []) if (f.includes("/")) out.add(f);
    if (h.skills && h.skills.dir) out.add(String(h.skills.dir).replace(/\/+$/, ""));
  }
  return [...out];
}

export function targetPath(id, roleName, proj = projectRoot()) {
  const h = harness(id);
  const spec = roleSpec(h);
  if (spec.shape === "aggregate-json") return join(proj, spec.file);
  return join(targetDir(id, proj), fill(spec.file, { prefix: PREFIX, role: roleName }));
}

export const isAggregate = (id) => roleSpec(harness(id)).shape === "aggregate-json";
export const hasRoleFiles = (id) => {
  const shape = roleSpec(harness(id)).shape;
  return Boolean(shape) && shape !== "none";
};


// ─── Install / uninstall / status ──────────────────────────────────────

// An aggregate harness keeps every mode in one file it shares with the user's
// own modes, so writing it is a merge, not a write: ours are the entries whose
// key starts with the prefix, and everything else is carried over untouched.
function readAggregate(h, p) {
  const spec = roleSpec(h);
  if (!existsSync(p)) return { doc: {}, list: [] };
  let doc;
  try { doc = JSON.parse(readFileSync(p, "utf8")); }
  catch (e) { throw new Error(`${p}: not valid JSON — ${e.message}. Fix or move it; waypost will not overwrite a file it cannot read.`); }
  return { doc, list: Array.isArray(doc[spec.array]) ? doc[spec.array] : [] };
}

function writeAggregate(h, p, doc, list) {
  const spec = roleSpec(h);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify({ ...doc, [spec.array]: list }, null, 2) + "\n", "utf8");
}

function installAggregate(id, { proj, cfg }) {
  const h = harness(id);
  const spec = roleSpec(h);
  const p = targetPath(id, null, proj);
  const { doc, list } = readAggregate(h, p);
  const out = [];
  let next = [...list];
  for (const name of rosterFor(cfg)) {
    const role = readRole(name);
    const entry = renderFor(id, role, cfg);
    const slug = entry[spec.key];
    const at = next.findIndex((e) => e && e[spec.key] === slug);
    const before = at === -1 ? null : next[at];
    if (before && !installedRoleOf(JSON.stringify(before))) {
      out.push({ harness: id, role: name, path: `${p}#${slug}`, action: "skipped (not ours)" });
      continue;
    }
    if (before && JSON.stringify(before) === JSON.stringify(entry)) {
      out.push({ harness: id, role: name, path: `${p}#${slug}`, action: "unchanged" });
      continue;
    }
    if (at === -1) next.push(entry); else next[at] = entry;
    out.push({ harness: id, role: name, path: `${p}#${slug}`, action: before ? "updated" : "created" });
  }
  if (out.some((r) => ["created", "updated"].includes(r.action))) writeAggregate(h, p, doc, next);
  return out;
}

export function install(harnesses, { proj = projectRoot(), cfg = readConfig() } = {}) {
  const out = [];
  for (const id of harnesses) {
    if (!hasRoleFiles(id)) {
      out.push({ harness: id, role: null, path: null, action: "no role files",
        note: harness(id).roles_note || "this harness has no per-role file format" });
      continue;
    }
    if (isAggregate(id)) { out.push(...installAggregate(id, { proj, cfg })); continue; }
    for (const name of rosterFor(cfg)) {
      const role = readRole(name);
      const p = targetPath(id, name, proj);
      const content = renderFor(id, role, cfg);
      const before = existsSync(p) ? readFileSync(p, "utf8") : null;
      if (before === content) {
        out.push({ harness: id, role: name, path: p, action: "unchanged" });
        continue;
      }
      // A file under our prefix that we did not generate is someone's own
      // agent. Overwriting it is data loss, and doctor's own warning about it
      // says "install would overwrite them" — which used to be true, including
      // when `doctor --fix` ran install on the strength of that very warning.
      if (before !== null && !installedRoleOf(before)) {
        out.push({ harness: id, role: name, path: p, action: "skipped (not ours)" });
        continue;
      }
      // The unit is not always a file directly under the target directory:
      // Antigravity's is a directory of its own (.agents/agents/<name>/agent.md),
      // so the parent is made per file. Making the target alone left the nested
      // case failing on write, and made an empty directory for a roster that
      // wrote nothing.
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, content, "utf8");
      out.push({ harness: id, role: name, path: p, action: before === null ? "created" : "updated" });
    }
  }
  return out;
}

export function uninstall(harnesses, { proj = projectRoot() } = {}) {
  const out = [];
  for (const id of harnesses) {
    if (!hasRoleFiles(id)) continue;
    if (isAggregate(id)) {
      const h = harness(id);
      const spec = roleSpec(h);
      const p = targetPath(id, null, proj);
      if (!existsSync(p)) continue;
      const { doc, list } = readAggregate(h, p);
      const keep = list.filter((e) => !(e && String(e[spec.key] || "").startsWith(PREFIX) && installedRoleOf(JSON.stringify(e))));
      if (keep.length === list.length) continue;
      for (const e of list.filter((x) => !keep.includes(x))) out.push({ harness: id, path: `${p}#${e[spec.key]}`, action: "removed" });
      // A file that now holds nothing but our absence is ours to remove; one
      // with the user's own modes in it is not.
      if (!keep.length && Object.keys(doc).length <= 1) { unlinkSync(p); out.push({ harness: id, path: p, action: "removed (empty)" }); }
      else writeAggregate(h, p, doc, keep);
      continue;
    }
    const dir = targetDir(id, proj);
    // Walked, not listed: where the unit of a role is a directory rather than a
    // file (.agents/agents/<name>/agent.md), a flat readdir saw the directory,
    // failed to read it as text, and removed nothing at all.
    const files = [];
    const walk = (d) => {
      let entries = [];
      try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p); else files.push(p);
      }
    };
    walk(dir);
    const emptied = new Set([dir]);
    for (const p of files) {
      // The provenance line is the only test, not the filename: a harness whose
      // namespace is the directory (Gemini's .gemini/commands/waypost/critic.toml)
      // carries no prefix in the name, and filtering on one silently left every
      // such file behind. Reading is also the stricter check — a file a user
      // wrote is never ours, whatever it is called.
      let text;
      try { text = readFileSync(p, "utf8"); } catch { continue; }
      if (!installedRoleOf(text)) continue;
      unlinkSync(p);
      emptied.add(dirname(p));
      out.push({ harness: id, path: p, action: "removed" });
    }
    // An emptied .codex/ is still a .codex/, and detectHarnesses reads
    // directories — so leaving the shell behind made uninstall undo itself at
    // the next install or `doctor --fix`. Walk up while the directories are
    // empty and still inside the project: a nested target like
    // .gemini/commands/waypost leaves two shells behind, not one, and a per-agent
    // directory leaves three. Deepest first, so the parent is tried after the
    // last child that could still be holding it.
    for (const start of [...emptied].sort((a, b) => b.length - a.length)) {
      for (let d = start; pathUnder(d, proj); d = dirname(d)) {
        try { rmdirSync(d); out.push({ harness: id, path: d, action: "removed (empty)" }); }
        catch { break; }
      }
    }
  }
  return out;
}

// Per-harness install state, the shape doctor reports on.
//
// Staleness is decided by comparing against what install would write RIGHT NOW,
// not against the source alone: the render also depends on the config's model
// and on the adapters, and a check that ignores those reports "current" for a
// file that no longer matches anything.
export function status({ proj = projectRoot(), cfg = readConfig(), ids = harnessIds() } = {}) {
  const roster = rosterFor(cfg);
  return ids.map((id) => {
    if (!hasRoleFiles(id)) {
      return { harness: id, dir: null, roles: roster.map((name) => ({ role: name, state: "n/a", path: null })) };
    }
    const agg = isAggregate(id);
    const spec = roleSpec(harness(id));
    let list = [];
    if (agg) {
      try { ({ list } = readAggregate(harness(id), targetPath(id, null, proj))); } catch { list = []; }
    }
    const roles = roster.map((name) => {
      const p = targetPath(id, name, proj);
      const found = agg
        ? list.find((e) => e && e[spec.key] === PREFIX + name)
        : (existsSync(p) ? readFileSync(p, "utf8") : null);
      // Absent is decided by the filesystem alone: rendering a role only to
      // compare it against nothing is the most expensive way to learn that.
      if (!found) return { role: name, state: "absent", path: p };
      const text = agg ? JSON.stringify(found, null, 2) : found;
      if (!installedRoleOf(text)) return { role: name, state: "foreign", path: p };
      const self = renderHashOf(text);
      const edited = self && self.claimed !== self.actual;
      const wouldWrite = renderFor(id, readRole(name), cfg);
      const same = agg ? JSON.stringify(wouldWrite) === JSON.stringify(found) : wouldWrite === found;
      return {
        role: name,
        state: !edited && same ? "current" : "stale",
        reason: edited ? "edited by hand" : (same ? null : "source, config or adapter changed"),
        path: p,
      };
    });
    return { harness: id, dir: agg ? targetPath(id, null, proj) : targetDir(id, proj), roles };
  });
}

// ─── Routing block ─────────────────────────────────────────────────────

export function renderBlock(cfg) {
  const tmpl = readFileSync(join(pluginRoot(), "templates", "agents-block.md.tmpl"), "utf8");
  const roles = rosterFor(cfg).map((n) => `- \`${PREFIX}${n}\` — ${readRole(n).summary}`).join("\n");
  return tmpl
    .replace(/\{\{version\}\}/g, String(AGENT_BLOCK_VERSION))
    .replace(/\{\{roles\}\}/g, roles);
}


// Claude Code's `@AGENTS.md` / `@./AGENTS.md` import syntax: a line that is
// nothing but an import of a shared instruction file. Captures the basename
// (without extension) so the caller can check it names the SPECIFIC shared
// file found, not just any AGENTS/CLAUDE mention.
// An `@path` line on its own, the form Claude Code expands. The path is
// resolved against the importing file's own directory, as Claude Code does —
// so in .claude/CLAUDE.md `@AGENTS.md` means .claude/AGENTS.md, and only
// `@../AGENTS.md` reaches the root one (WP-19).
const IMPORT_LINE_RE = /^@(\S+)\s*$/gm;

// Claude Code does not expand an import inside a code fence or an HTML
// comment, so neither counts here: a fenced `@dataclass` is not an import, and
// a fenced example `@AGENTS.md` does not carry the block.
function importableText(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, "");
}

export function importTargets(ownPath) {
  let text;
  try { text = readFileSync(ownPath, "utf8"); } catch { return []; }
  return [...importableText(text).matchAll(IMPORT_LINE_RE)]
    .map((m) => m[1])
    .filter((t) => !t.startsWith("~") && !/^[a-z]+:\/\//i.test(t))
    .map((t) => resolve(dirname(ownPath), t));
}

// True when `ownPath` @-imports the file at `sharedPath` — the shared file
// then reaches the harness through that import, so writing the block into
// ownPath too would be a second copy of standing context the harness reads on
// every turn (ADR-0008).
export function importsSharedFile(ownPath, sharedPath) {
  return importTargets(ownPath).some((t) => relative(t, resolve(sharedPath)) === "");
}

// Where the routing block goes: every instruction file the project already has,
// plus the file each DETECTED harness reads. AGENTS.md is the common one, but a
// Cursor-only or Gemini-only project has never heard of it — the registry says
// what that harness reads instead, and the block is written there too.
// Where one harness reads its instructions in this project: its own file when
// present (or the shared file that own file @-imports), else the shared file
// when present, else the first own path it declares, else the first declared.
export function instructionTargetFor(id, proj = projectRoot()) {
  const declared = harness(id).instructions || [];
  if (!declared.length) return [];
  // One target per harness, and never a second copy of the same block beside a
  // file the harness already reads. Which file counts is registry data, not a
  // guess: `instructions_shared_ok: false` marks a harness whose own notes say
  // AGENTS.md support is undocumented, so its own path must exist even when a
  // shared file does.
  const own = declared.filter((f) => f.includes("/"));
  const ownPresent = own.filter((f) => existsSync(join(proj, f)));
  const sharedOk = harness(id).instructions_shared_ok !== false;
  // A shared candidate that @-imports another existing shared candidate
  // (CLAUDE.md → AGENTS.md, the bridge Anthropic documents) defers to it:
  // the block reaches the harness through the import, once.
  const sharedCandidates = declared.filter((f) => !f.includes("/") && existsSync(join(proj, f)));
  const shared = sharedCandidates.find((f) => !sharedCandidates.some((g) => g !== f && importsSharedFile(join(proj, f), join(proj, g))));
  if (ownPresent.length) {
    // The harness loads all of these files together, so one import of the
    // shared file anywhere among them already carries the block (G-1: this
    // repo's .claude/CLAUDE.md is `@../AGENTS.md`) — then no own file is a
    // target, or the block would be read twice. With no import anywhere, each
    // own file keeps today's behaviour.
    const imported = sharedOk && shared && [...ownPresent, ...sharedCandidates]
      .some((f) => f !== shared && importsSharedFile(join(proj, f), join(proj, shared)));
    return imported ? [shared] : ownPresent;
  }
  if (sharedOk && shared) return [shared];
  if (own.length) return [own[0]];
  return [shared || declared[0]];
}

export function instructionTargets(proj = projectRoot()) {
  // A root CLAUDE.md that @-imports AGENTS.md already carries the block through
  // that import (the G-1 rule, which used to cover only .claude/CLAUDE.md):
  // writing it there too would put it in Claude's context twice.
  const out = new Set(["AGENTS.md", "CLAUDE.md"].filter((f) => existsSync(join(proj, f))
    && !(f === "CLAUDE.md" && existsSync(join(proj, "AGENTS.md")) && importsSharedFile(join(proj, f), join(proj, "AGENTS.md")))));
  for (const id of detectHarnesses(proj)) for (const f of instructionTargetFor(id, proj)) out.add(f);
  return [...out];
}

// Register into every instruction file the project actually has. Idempotent:
// an existing block is replaced in place (never duplicated), which is also how
// a version bump propagates.
export function register({ proj = projectRoot(), cfg = readConfig(), files = null } = {}) {
  const block = renderBlock(cfg);
  const targets = files || instructionTargets(proj);
  const out = [];
  for (const f of (targets.length ? targets : ["AGENTS.md"])) {
    const p = join(proj, f);
    const before = existsSync(p) ? readFileSync(p, "utf8") : "";
    // A file we are creating gets the block and nothing else; appending to an
    // empty string left two blank lines at the top of every new instruction file.
    const next = BLOCK_RE.test(before)
      ? before.replace(BLOCK_RE, block)
      : (before.trim() ? `${before.replace(/\s*$/, "")}\n\n${block}` : block);
    BLOCK_RE.lastIndex = 0;
    if (next === before) { out.push({ file: f, action: "unchanged" }); continue; }
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, next, "utf8");
    out.push({ file: f, action: before ? "updated" : "created" });
  }
  return out;
}

export function unregister({ proj = projectRoot(), dryRun = false } = {}) {
  const out = [];
  for (const f of new Set([...instructionTargets(proj), "AGENTS.md", "CLAUDE.md"])) {
    const p = join(proj, f);
    if (!existsSync(p)) continue;
    const before = readFileSync(p, "utf8");
    const next = before.replace(BLOCK_RE, "").replace(/\s*$/, "\n");
    BLOCK_RE.lastIndex = 0;
    if (next === before) continue;
    if (!dryRun) writeFileSync(p, next, "utf8");
    out.push({ file: f, action: dryRun ? "would remove" : "removed" });
  }
  return out;
}

// ─── CLI ───────────────────────────────────────────────────────────────

function die(msg) {
  process.stderr.write(`waypost agents: ${msg}\n`);
  process.exit(1);
}

// No detection and no --harness is NOT "then do all of them": that used to
// create .claude/, .opencode/ and .codex/ in a project that uses none, and
// detection is by directory, so the guess made itself true forever after.
function harnessArg(rest, cfg, { running = false } = {}) {
  const i = rest.indexOf("--harness");
  const raw = i !== -1 ? rest[i + 1] : null;
  if (raw === "all") return HARNESSES;
  if (!raw) {
    const seen = running ? installHarnesses() : detectHarnesses();
    if (seen.length) return seen;
    // The old second line named three of now twenty-one detect paths (C-4) —
    // the id list above is already self-sufficient; `--json` (unfiltered,
    // unlike the default text view) carries every harness's own detect array.
    die(`no harness detected in this project — name one: --harness ${HARNESSES.join("|")} (or all).\n`
      + "       `waypost harnesses --json` lists every harness and what its detection looks for.");
  }
  const list = raw.split(",").map((s) => s.trim());
  for (const h of list) if (!HARNESSES.includes(h)) die(`unknown harness "${h}" (known: ${HARNESSES.join(", ")}, all)`);
  return list;
}

const USAGE = `waypost agents <subcommand>

  list [--json] [-v]        roles + per-harness install state
  harnesses [--json] [-a]   every harness roles can be rendered for (-a: all)
  show <role> [target]      print the role prompt (fresh-context handoff)
  install [--harness <id>[,<id>…]|all] [--json]
                            render the roles into this project's harnesses
  uninstall [--harness <id>[,<id>…]|all] [--json]
                            remove generated role files
  register                  write the routing block into AGENTS.md / CLAUDE.md
  unregister [--dry-run]    remove that routing block again
  model <role|default|harness:<name>> <id>
                            pin a model for a role or a harness
`;

// Which flags each subcommand actually understands. Anything else is a typo or
// a wrong assumption, and for a destructive subcommand that difference matters:
// `unregister --help` used to strip the routing block and report success,
// because unknown flags were dropped in silence. They are an error now.
const FLAGS = {
  list: ["--json", "--verbose", "-v"],
  harnesses: ["--json", "--all", "-a"],
  show: [],
  install: ["--json", "--harness"],
  uninstall: ["--json", "--harness"],
  register: [],
  unregister: ["--dry-run"],
  model: [],
};

function checkFlags(sub, rest) {
  const known = FLAGS[sub] || [];
  // `--harness <id>` takes a value; that value is not itself a flag.
  const values = new Set();
  rest.forEach((a, i) => { if (a === "--harness") values.add(i + 1); });
  for (const [i, a] of rest.entries()) {
    if (values.has(i) || a === "--" || !a.startsWith("-")) continue;
    if (known.includes(a)) continue;
    die(`unknown flag "${a}" for \`agents ${sub}\` `
      + (known.length ? `(accepts ${known.join(", ")})` : "(accepts no flags)")
      + "\n       `waypost agents --help` lists every subcommand.");
  }
}

function main() {
  ignoreEpipe();
  const [sub = "list", ...rest] = process.argv.slice(2);
  // Help is answered before any subcommand runs: asking what a command does
  // must never be the same thing as running it.
  if (["help", "--help", "-h"].includes(sub) || rest.includes("--help") || rest.includes("-h")) {
    process.stdout.write(USAGE);
    return;
  }
  checkFlags(sub, rest);
  const cfg = readConfig();
  const json = rest.includes("--json");
  switch (sub) {
    case "list": {
      const st = status({ cfg });
      if (json) { process.stdout.write(JSON.stringify({ roles: listRoles().map(({ body, ...r }) => r), install: st }, null, 2) + "\n"); return; }
      const verbose = rest.includes("--verbose") || rest.includes("-v");
      for (const r of listRoles()) {
        process.stdout.write(`${PREFIX}${r.name.padEnd(14)} ${r.summary}\n`);
        if (verbose) process.stdout.write(`  [${r.tier}/${r.effort || "default"}, ${r.access}] ${r.description}\n`);
      }
      // Only harnesses that have something installed, plus a count of the rest:
      // a project on one harness paid for fifteen lines about the others.
      const shown = st.filter((h) => h.roles.some((x) => x.state !== "absent" && x.state !== "n/a"));
      process.stdout.write("\nInstalled:\n");
      for (const h of (verbose ? st : shown)) {
        const by = h.roles.reduce((a, x) => ({ ...a, [x.state]: (a[x.state] || 0) + 1 }), {});
        process.stdout.write(`  ${h.harness.padEnd(10)} ${Object.entries(by).map(([k, v]) => `${v} ${k}`).join(", ")}\n`);
      }
      if (!verbose) {
        if (!shown.length) process.stdout.write("  (none yet — `waypost agents install`)\n");
        process.stdout.write(`  …and ${st.length - shown.length} harness(es) with none. \`waypost agents list -v\` for everything.\n`);
      }
      return;
    }
    case "harnesses": {
      const rows = harnessIds().map((id) => {
        const h = harness(id);
        const spec = roleSpec(h);
        return {
          id, name: h.name || id, vendor: h.vendor || null, confidence: confidenceOf(h), docs: h.docs || null,
          shape: spec.shape || "none",
          target: spec.shape === "aggregate-json" ? spec.file : (spec.dir || null),
          skills: skillsOf(id), skills_note: h.skills_note || null,
          takes_model: harnessTakesModel(id), detect: h.detect || [], invoke: h.invoke || null,
          source: h.source, notes: h.notes || null,
        };
      });
      const provs = providerIds().map((id) => {
        const h = harness(id);
        return { id, name: h.name || id, vendor: h.vendor || null, kind: "provider",
          runs_in: h.runs_in || [], detected: detectProvider() === id, notes: h.notes || null };
      });
      if (json) { process.stdout.write(JSON.stringify({ harnesses: rows, providers: provs }, null, 2) + "\n"); return; }
      const used = new Set(detectHarnesses());
      const here = detectProvider();
      const all = rest.includes("--all") || rest.includes("-a");
      // Default view answers "what applies to me": the harnesses this project
      // uses. The full table is a reference, and a reference read into an
      // agent's context on every look is a tax.
      const visible = all ? rows : rows.filter((r) => used.has(r.id));
      for (const r of visible) {
        process.stdout.write(
          `${(used.has(r.id) ? "* " : "  ")}${r.id.padEnd(11)} ${r.confidence.padEnd(12)} ${String(r.target || "— no role files").padEnd(24)} ${String(r.skills ? r.skills.dir : "— no skills").padEnd(18)} ${r.name}\n`);
        if (r.invoke && (all || used.has(r.id))) process.stdout.write(`              invoke: ${r.invoke}\n`);
      }
      if (!all) {
        process.stdout.write(visible.length ? "" : "no harness detected in this project\n");
        process.stdout.write(`${rows.length} harnesses known, ${provs.length} model providers — \`waypost harnesses --all\` lists them.\n`);
        if (here) process.stdout.write(`provider in this environment: ${here}\n`);
        return;
      }
      process.stdout.write("\nMODEL PROVIDERS (not harnesses — they run inside one of the above)\n");
      for (const p of provs) {
        process.stdout.write(`${p.detected ? "* " : "  "}${p.id.padEnd(11)} ${String(p.vendor || "").padEnd(16)} ${p.name}`
          + `${p.runs_in.length ? `  — usually via ${p.runs_in.slice(0, 3).join(", ")}` : ""}\n`);
      }
      process.stdout.write(
        "\n* = detected in this project (harnesses) or in this environment (providers).\n"
        + "verified = documented AND exercised here · documented = taken from the vendor's own docs (see\n"
        + "`waypost harnesses --json` for the URL), not run here · inferred = guessed from a convention; the\n"
        + "entry says what was assumed. Add or override an entry with a JSON file in .waypost/harnesses/\n"
        + "(providers in .waypost/harnesses/providers/) — see docs/harnesses.md.\n"
        + (here ? `\nThis session looks like it is talking to ${here}; install the roles for the harness you\nactually run (\`waypost agents install\`), and waypost will record ${here} as the provider on each commit.\n` : ""));
      return;
    }
    case "show": {
      const name = rest[0];
      if (!name) die('show <role> — one of: ' + roleNames().join(", "));
      const role = readRole(name.replace(new RegExp(`^${PREFIX}`), ""));
      const target = rest.slice(1).filter((a) => !a.startsWith("--")).join(" ");
      process.stdout.write((target ? `Target: ${target}\n\n` : "") + role.body);
      return;
    }
    case "install": {
      const res = install(harnessArg(rest, cfg, { running: true }), { cfg });
      if (json) { process.stdout.write(JSON.stringify(res, null, 2) + "\n"); return; }
      for (const r of res) {
        process.stdout.write(`${r.action.padEnd(18)} ${r.path || r.harness}\n`);
        if (r.note) process.stdout.write(`                   ${r.note}\n`);
      }
      if (res.some((r) => r.action.startsWith("skipped"))) {
        process.stdout.write("\nSkipped files were not generated by waypost — rename them if they are yours,\nor delete them to let install take the name.\n");
      }
      // A registry entry names its own follow-up step, if it has one (C-3: the
      // old code hardcoded a Codex-specific hint that had gone stale — Codex's
      // shape needs none, ZCode's does — one field, read for every harness).
      const hinted = new Set();
      for (const r of res) {
        if (hinted.has(r.harness)) continue;
        hinted.add(r.harness);
        const note = harness(r.harness).after_install;
        if (note) process.stdout.write(`\n${note}\n`);
      }
      return;
    }
    case "uninstall": {
      const res = uninstall(harnessArg(rest, cfg));
      if (json) { process.stdout.write(JSON.stringify(res, null, 2) + "\n"); return; }
      if (!res.length) process.stdout.write("nothing to remove\n");
      for (const r of res) process.stdout.write(`removed  ${r.path}\n`);
      return;
    }
    case "register": {
      const res = register({ cfg });
      for (const r of res) process.stdout.write(`${r.action.padEnd(9)} ${r.file}\n`);
      return;
    }
    case "unregister": {
      const dryRun = rest.includes("--dry-run");
      const res = unregister({ dryRun });
      if (!res.length) process.stdout.write("no routing block found\n");
      for (const r of res) process.stdout.write(`${r.action.padEnd(12)} ${r.file}\n`);
      return;
    }
    case "model": {
      const [who, model] = rest.filter((a) => !a.startsWith("--"));
      if (!who || !model) {
        die('model <role|default|harness:<name>> <model-id>\n'
          + `       roles: ${roleNames().join(", ")} · harnesses: ${HARNESSES.join(", ")}`);
      }
      const next = { ...(cfg || {}) };
      if (!next.vault_path) die("no bound vault — run `waypost bind <vault-path>` first");
      next.agents = next.agents || {};
      let key;
      if (who.startsWith("harness:")) {
        const h = who.slice("harness:".length);
        if (!HARNESSES.includes(h)) die(`unknown harness "${h}" (known: ${HARNESSES.join(", ")})`);
        if (!harnessTakesModel(h)) {
          die(`${h} prompt files carry no model — the model is the ${h} session's, not ours.\n`
            + `       Set it in ${h}'s own configuration; waypost would accept the key and discard it.`);
        }
        next.agents.per_harness = next.agents.per_harness || {};
        next.agents.per_harness[h] = { ...(next.agents.per_harness[h] || {}), model };
        key = `per_harness.${h}`;
      } else if (who === "default") {
        next.agents.default = { ...(next.agents.default || {}), model };
        key = "default";
      } else {
        if (!roleNames().includes(who)) die(`unknown role "${who}" (known: ${roleNames().join(", ")}, default, harness:<name>)`);
        next.agents.per_agent = next.agents.per_agent || {};
        next.agents.per_agent[who] = { ...(next.agents.per_agent[who] || {}), model };
        key = `per_agent.${who}`;
      }
      writeConfig(next);
      process.stdout.write(`agents.${key}.model = ${model}\n`);
      // `default` and `per_agent` are harness-blind, so they only reach the
      // harnesses whose model ids they can be valid for. Say which, rather than
      // let the user discover it by reading a generated file.
      if (!who.startsWith("harness:")) {
        const named = harnessesNamingModels();
        process.stdout.write(`applies to: ${named.join(", ")} (for the others use \`waypost agents model harness:<name> <id>\`)\n`);
      }
      process.stdout.write("Re-run `waypost agents install` to re-render the harness files.\n");
      return;
    }
    default:
      die(`unknown subcommand "${sub}" (list|harnesses|show|install|uninstall|register|unregister|model)`);
  }
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  // Every throw in here is a usage or a definition error, and both read better
  // as one line than as a stack trace: `agents show nope` used to dump the
  // whole frame stack at the user.
  try { main(); } catch (e) { die(e && e.message ? e.message : String(e)); }
}
