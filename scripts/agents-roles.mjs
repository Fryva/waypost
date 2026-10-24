// waypost — role definitions, metadata and installed-role lifecycle (ADR-0003/0005).
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync, unlinkSync, rmdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { pluginRoot, projectRoot, readConfig, parseFrontmatter, loadLayout, pathUnder } from "./lib.mjs";
import { PREFIX, TIERS, registry, harness, CONFIDENCE, harnessIds, roleSpec } from "./agents-registry.mjs";
import { installedRoleOf, renderHashOf, renderFor, fill } from "./agents-render.mjs";

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

