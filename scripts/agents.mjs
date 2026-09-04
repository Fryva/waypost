#!/usr/bin/env node
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
import { join, dirname } from "node:path";
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
} from "./lib.mjs";
import { harnessProcess } from "./presence.mjs";

// ─── Harness registry ──────────────────────────────────────────────────
//
// A harness is DATA, not code: harnesses/<id>.json says where its role files
// live, what shape they are, and whether they can carry a model. Supporting one
// more agent CLI is a JSON file, not a branch in a renderer — which is the only
// way "works with whatever harness you use" can stay true as the field churns.
//
// A project can add or override an entry in <project>/.waypost/harnesses/<id>.json;
// nothing here is a closed list.
//
// Shapes:
//   frontmatter-md  one file per role: YAML frontmatter + the prompt
//   prompt-md       one file per role: optional frontmatter, $ARGUMENTS preamble
//   toml-prompt     one file per role: description/prompt TOML (Gemini CLI)
//   aggregate-json  one shared JSON file holding an array of modes (Roo Code)
//   none            the harness has NO per-role file format at all. Real and
//                   not rare: DeepSeek Harness registers subagents in code, and
//                   several editors only read a rules file. Such an entry is
//                   still worth having — it is detected, it receives the
//                   routing block, and it says how a role is reached instead
//                   (`waypost agents show`, or a harness it can spawn) — but
//                   install writes nothing and doctor must not ask why.

export const AGENT_BLOCK_VERSION = 1;
export const AGENT_BLOCK_MARKER = /<!--\s*waypost:agents v(\d+)/g;
// Roles register under a waypost- prefix in every harness. Bare names (critic,
// planner, reviewer) are common enough that a user's own agent would collide;
// a prefix keeps both, and makes "which of these is ours" a string match.
export const PREFIX = "waypost-";
export const TIERS = ["reasoning", "balanced", "fast"];

function registryDirs() {
  return [
    join(pluginRoot(), "harnesses"),
    join(pluginRoot(), "harnesses", "providers"),
    join(projectRoot(), ".waypost", "harnesses"),
    join(projectRoot(), ".waypost", "harnesses", "providers"),
  ];
}

let _registry = null;
export function registry() {
  if (_registry) return _registry;
  const out = new Map();
  const dirs = registryDirs();
  for (let i = 0; i < dirs.length; i++) {      // project entries override bundled ones
    const dir = dirs[i];
    let names = [];
    try { names = readdirSync(dir).filter((n) => n.endsWith(".json")).sort(); }
    catch {
      // The bundled harnesses/ directory (index 0) is the tool's own data:
      // unreadable means WAYPOST_HOME/CLAUDE_PLUGIN_ROOT points at a
      // misconfigured or partial tool root, not "this project has no
      // harnesses". Every `agents`/`harnesses` command should fail loudly
      // instead of printing an empty table with exit 0. The project-local
      // dirs (and the bundled providers/ subdir) are legitimately optional.
      if (i === 0) {
        throw new Error(
          `Cannot read the bundled harness registry at ${dir} ` +
          `(pluginRoot: ${pluginRoot()}). Check WAYPOST_HOME / CLAUDE_PLUGIN_ROOT.`);
      }
      continue;
    }
    for (const n of names) {
      let h;
      try { h = JSON.parse(readFileSync(join(dir, n), "utf8")); }
      catch (e) { throw new Error(`${join(dir, n)}: not valid JSON — ${e.message}`); }
      const id = h.id || n.replace(/\.json$/, "");
      out.set(id, { ...h, id, source: join(dir, n) });
    }
  }
  _registry = out;
  return out;
}

export function harness(id) {
  const h = registry().get(id);
  if (!h) throw new Error(`Unknown harness: ${id} (known: ${[...registry().keys()].join(", ")})`);
  return h;
}

// A vendor is not a harness. DeepSeek, Kimi, GLM and MiniMax ship MODELS that
// run inside somebody else's harness — usually Claude Code against an
// Anthropic-compatible endpoint. Registering them as harnesses would promise
// role files that have nowhere to go; registering them as providers lets waypost
// name which model produced a commit while installing into the harness that is
// actually running.
export const isProvider = (h) => (typeof h === "string" ? harness(h) : h).kind === "provider";

// How sure we are about an entry's file format. The levels are about EVIDENCE,
// not about how much we like the tool:
//   verified    the format is documented AND has been exercised in that harness
//   documented  taken from the vendor's own documentation (`docs:` names it),
//               but not run here
//   inferred    guessed from a directory convention or a sibling CLI in the
//               same family; the entry's `notes` say what was assumed
export const CONFIDENCE = ["verified", "documented", "inferred"];
export const confidenceOf = (h) =>
  h.confidence || (h.verified ? "verified" : "inferred");

// Ordered ids, most-trusted first: the list is printed to users, and "what is
// known to work" is the useful order. Providers are not in it — nothing
// installs into them. A confidence value CONFIDENCE does not know (a typo in a
// project-local harness override) sorts LAST rather than throwing — a typo in
// one entry must not break every `waypost` command that lists harnesses.
const confidenceRank = (h) => {
  const i = CONFIDENCE.indexOf(confidenceOf(h));
  return i === -1 ? CONFIDENCE.length : i;
};
export const harnessIds = () => [...registry().values()]
  .filter((h) => !isProvider(h))
  .sort((a, b) => (confidenceRank(a) - confidenceRank(b))
    || a.id.localeCompare(b.id))
  .map((h) => h.id);

export const providerIds = () => [...registry().values()]
  .filter(isProvider).map((h) => h.id).sort();

// Which model provider this session is pointed at, if any. Read from the
// environment the way harness detection is: an endpoint override or a vendor
// key. `WAYPOST_PROVIDER` wins, because a guess in a permanent record is worse than
// a blank.
export function detectProvider(env = process.env) {
  if (env.WAYPOST_PROVIDER) return env.WAYPOST_PROVIDER;
  const urls = ["ANTHROPIC_BASE_URL", "ANTHROPIC_API_URL", "OPENAI_BASE_URL", "OPENAI_API_BASE",
    "OPENAI_API_HOST", "LLM_BASE_URL"].map((k) => env[k]).filter(Boolean).join(" ").toLowerCase();
  for (const id of providerIds()) {
    const m = harness(id).match || {};
    if ((m.env || []).some((k) => env[k])) return id;
    if (urls && (m.url_contains || []).some((u) => urls.includes(String(u).toLowerCase()))) return id;
  }
  return null;
}

// Kept as a live getter so the registry stays the single source; existing
// callers (doctor, tests) read it as a list.
export const HARNESSES = new Proxy([], {
  get(_t, prop) {
    const ids = harnessIds();
    const v = ids[prop];
    return typeof v === "function" ? v.bind(ids) : (prop in ids ? ids[prop] : Reflect.get(ids, prop));
  },
  has(_t, prop) { return prop in harnessIds(); },
  ownKeys() { return Reflect.ownKeys(harnessIds()); },
  getOwnPropertyDescriptor(_t, prop) { return Reflect.getOwnPropertyDescriptor(harnessIds(), prop); },
});

const roleSpec = (h) => h.roles || {};

// Whether a harness's file format can carry a model at all. Cursor's `.mdc`
// rule format cannot: there is no per-rule model field, so a role file has
// nowhere to put one. This is a different fact from an empty tier map (Codex's
// `.codex/agents/*.toml` publishes no tier naming, but its `model` field does
// take an explicit id — `roles.model: { tiers: {} }`), and conflating the two
// let `agents model harness:cursor <id>` be accepted and then silently
// discarded.
export function harnessTakesModel(id) {
  return roleSpec(harness(id)).model !== false && roleSpec(harness(id)).model !== undefined;
}

const CLAUDE_TOOLS = {
  read: "Read", grep: "Grep", glob: "Glob", bash: "Bash",
  edit: "Edit", write: "Write", web: "WebFetch, WebSearch",
};

// OpenCode takes an explicit allow/deny map, so the EDIT half of the read-only
// contract is enforced by the harness. The shell half is not: these roles need
// `git diff`, `git log` and `waypost doctor` to do their job, so `bash: true`
// stands and "read-only" there is prose in the role body, exactly as it is
// everywhere else. Say that plainly rather than claiming enforcement the tool
// map does not deliver.
const OPENCODE_TOOLS = ["read", "grep", "glob", "bash", "edit", "write", "patch", "webfetch"];
const COPILOT_TOOLS = { read: "codebase", grep: "search", glob: "search", bash: "runCommands", web: "fetch" };
// Claude-Code-shaped tool names, which several of the newer CLIs adopted
// wholesale (Kimi Code, CodeBuddy, and Qwen's compatibility fields).
const WRITE_TOOLS = ["Write", "Edit", "MultiEdit", "NotebookEdit"];

// A role naming a tool outside this vocabulary would render as a nonexistent
// tool for Claude Code and be silently dropped by OpenCode. Fail at read time,
// where the message can name the file, rather than at use time in the harness.
const TOOL_VOCABULARY = new Set(["read", "grep", "glob", "bash", "edit", "write", "web"]);

// YAML plain scalars end at ": ", so an unquoted description containing one
// ("Suggest-only: every proposal…") makes the whole frontmatter unparseable.
// Every value we emit goes through here; JSON's string syntax is a valid YAML
// double-quoted scalar.
const scalar = (v) => JSON.stringify(String(v));

// The deny half: a harness that inherits every tool by default needs the
// read-only contract expressed as a blocklist, not an allowlist.
function renderDenied(style, role) {
  if (role.access !== "read-only") return null;
  if (style === "yaml-list") return "\n" + WRITE_TOOLS.map((t) => `  - ${t}`).join("\n");
  if (style === "claude" || style === "comma") return scalar(WRITE_TOOLS.join(", "));
  return null;
}

function renderTools(style, role) {
  if (style === "claude" || style === "comma") return scalar(role.tools.map((t) => CLAUDE_TOOLS[t] || t).join(", "));
  if (style === "yaml-list") {
    const names = role.tools.flatMap((t) => (CLAUDE_TOOLS[t] || t).split(", "));
    return "\n" + names.map((n) => `  - ${n}`).join("\n");
  }
  if (style === "copilot-list") {
    const names = [...new Set(role.tools.map((t) => COPILOT_TOOLS[t]).filter(Boolean))];
    return `[${names.map(scalar).join(", ")}]`;
  }
  if (style === "opencode-permission") {
    // Current OpenCode: `permission` with allow/ask/deny, which is what actually
    // gates the tool. The older `tools:` booleans are legacy.
    const rows = [["edit", role.access === "read-only" ? "deny" : "allow"],
      ["bash", "allow"], ["webfetch", role.tools.includes("web") ? "allow" : "deny"]];
    return "\n" + rows.map(([k, v]) => `  ${k}: ${v}`).join("\n");
  }
  if (style === "opencode-map") {
    const allowed = new Set(role.tools.flatMap((t) => (t === "web" ? ["webfetch"] : [t])));
    if (role.access === "read-only") for (const w of ["edit", "write", "patch"]) allowed.delete(w);
    return "\n" + OPENCODE_TOOLS.map((t) => `  ${t}: ${allowed.has(t)}`).join("\n");
  }
  return null;
}

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

// Model precedence, per harness:
//   agents.per_harness.<harness>.model   — the only way to name a model for a
//                                          harness with no tier mapping
//   agents.per_agent.<role>.model
//   agents.default.model                 — both apply ONLY where the registry
//                                          maps tiers onto real model ids
//   the tier mapping itself
//
// The middle two are deliberately harness-blind, so they must not reach a
// harness whose model ids they cannot be valid for: `waypost agents model default
// sonnet` used to write a bare Claude id into .opencode/agent, where OpenCode
// wants `provider/model`. Naming a model there is possible, but per harness.
export function resolveModel(role, cfg, id) {
  if (!harnessTakesModel(id)) return null;
  const a = (cfg && cfg.agents) || {};
  const perHarness = a.per_harness && a.per_harness[id] && a.per_harness[id].model;
  if (perHarness) return perHarness;
  const tiers = (roleSpec(harness(id)).model || {}).tiers || {};
  if (Object.values(tiers).some(Boolean)) {
    const perRole = a.per_agent && a.per_agent[role.name] && a.per_agent[role.name].model;
    const dflt = a.default && a.default.model;
    if (perRole || dflt) return perRole || dflt;
  }
  return tiers[role.tier] || null;
}

// Which harnesses a harness-blind pin (`default`, `per_agent`) can reach: only
// those whose registry entry maps the neutral tiers onto real model ids.
export const harnessesNamingModels = () =>
  harnessIds().filter((id) => Object.values((roleSpec(harness(id)).model || {}).tiers || {}).some(Boolean));

// Provenance. The line carries two hashes: `src` names the definition a reader
// should go edit, `render` is a hash of the rendered file with the provenance
// line itself removed — hashing only the source made every drift that does not
// touch agents/*.md invisible (a changed model, a changed adapter).
//
// The mark is emitted on a line of its own and wrapped in whatever passes for a
// comment in that shape, so the same line-removal recomputes the hash for
// markdown, TOML and a JSON string field alike.
const MARK = "@@WAYPOST_PROVENANCE@@";
const PROV_RE = /^.*generated by `waypost agents install` from agents\/[\w-]+\.md@[0-9a-f]+ render:[0-9a-f]+.*$/gm;

const provText = (role, h) =>
  `generated by \`waypost agents install\` from agents/${role.name}.md@${role.hash} render:${h}`
  + " — edit the source, not this file";

// Drops the provenance line in either state: the placeholder before stamping,
// the real line after. Both must go, or the hash a file claims is not the hash
// its own content produces.
const withoutProvenance = (text) =>
  String(text).split("\n")
    .filter((l) => !l.includes(MARK) && !/generated by `waypost agents install` from agents\//.test(l))
    .join("\n");

const hashOf = (text) => createHash("sha256").update(withoutProvenance(text)).digest("hex").slice(0, 12);

function stamp(text, role) {
  return text.replace(MARK, provText(role, hashOf(text)));
}

// Same contract for a shape whose unit is an object rather than a file: hash
// the entry as it will be serialized, minus the provenance line.
function stampObject(entry, role) {
  const h = hashOf(JSON.stringify(entry, null, 2));
  const out = {};
  for (const [k, v] of Object.entries(entry)) {
    out[k] = typeof v === "string" ? v.replace(MARK, provText(role, h)) : v;
  }
  return out;
}

export function installedRoleOf(text) {
  const m = String(text).match(
    /generated by `waypost agents install` from agents\/([\w-]+)\.md@([0-9a-f]+) render:([0-9a-f]+)/);
  return m ? { role: m[1], hash: m[2], render: m[3] } : null;
}

// The render hash a file claims, recomputed from the file itself. A file whose
// body was edited by hand no longer matches its own line.
export function renderHashOf(text) {
  const marker = installedRoleOf(text);
  if (!marker) return null;
  return { claimed: marker.render, actual: hashOf(text) };
}

// ─── Renderers, one per shape ──────────────────────────────────────────

// Fields are declared per harness as ordered [key, template] pairs; a field
// whose value resolves empty is dropped, which is how "this harness has no
// model" and "this role declares no effort" collapse into the same rule.
function fill(tpl, vars) {
  return String(tpl).replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null ? "" : String(vars[k])));
}

// No fields means no frontmatter: an empty `---\n---` block is not "no
// metadata", it is a metadata block that parses to nothing, and a harness that
// reads rules as plain markdown then shows two dashes to the model.
// `roles.effort.map` is the same value-mapping mechanism `roles.model.tiers`
// already is for models, applied to the one other field a harness may want in
// its own vocabulary: `{max: "high", high: "high", ...}` turns the role's
// neutral tier into whatever word that harness's own reasoning-effort field
// expects. Passed through unchanged where the harness declares no map, or the
// role's own effort has no entry in it.
function mapEffort(spec, raw) {
  const map = (spec.effort || {}).map;
  return map && map[raw] ? map[raw] : raw;
}

function frontmatter(fields, vars, role, spec) {
  if (!fields || !fields.length) return null;
  const lines = ["---"];
  for (const [key, tpl] of fields || []) {
    let value;
    if (tpl === "{tools}") value = renderTools((spec.tools || {}).style, role);
    else if (tpl === "{denied_tools}") value = renderDenied((spec.tools || {}).style, role);
    else if (tpl === "{model}") value = vars.model ? scalar(vars.model) : null;
    else if (tpl === "{effort}") value = vars.effort ? scalar(mapEffort(spec, vars.effort)) : null;
    else if (/^\{\w+\}$/.test(tpl)) {
      const raw = vars[tpl.slice(1, -1)];
      value = raw ? scalar(raw) : null;
    } else value = /^(true|false|\d+)$/.test(tpl) ? tpl : scalar(fill(tpl, vars));
    if (value == null || value === '""') continue;
    lines.push(value.startsWith("\n") ? `${key}:${value}` : `${key}: ${value}`);
  }
  lines.push("---");
  return lines.join("\n");
}

// A harness with no subagent type gets the contract in prose, because a prompt
// file is the fresh context and nothing else will state it.
function preamble(role, h) {
  return [
    `Run as the waypost **${role.name}** role, in this fresh context.`,
    "",
    "Target: $ARGUMENTS",
    "",
    role.access === "read-only"
      ? "This role is READ-ONLY: inspect, verify and report. Do not edit, stage or commit anything — every fix goes back through the approval-gated `waypost` flow.\n"
      : "",
    "---",
    "",
  ].join("\n");
}

function renderRole(h, role, model) {
  const spec = roleSpec(h);
  const vars = {
    prefix: PREFIX, role: role.name, name: PREFIX + role.name,
    description: role.summary, mode: role.mode, effort: role.effort,
    model, body: role.body,
  };
  switch (spec.shape) {
    case "frontmatter-md": {
      const fm = frontmatter(spec.fields, vars, role, spec);
      return `${fm ? fm + "\n" : ""}<!-- ${MARK} -->\n\n${role.body}`;
    }
    case "prompt-md": {
      const fm = frontmatter(spec.fields, vars, role, spec);
      return `${fm ? fm + "\n" : ""}<!-- ${MARK} -->\n\n${preamble(role, h)}${role.body}`;
    }
    case "toml-prompt":
    case "toml": {
      const q = (v) => JSON.stringify(String(v));
      const bodyKey = spec.body_key || "prompt";
      const head = (spec.fields || [["description", "{description}"]]).map(([k, tpl]) => {
        const v = tpl === "{effort}" ? (vars.effort ? mapEffort(spec, vars.effort) : null)
          : /^\{\w+\}$/.test(tpl) ? vars[tpl.slice(1, -1)] : fill(tpl, vars);
        return v ? `${k} = ${q(v)}` : null;
      }).filter(Boolean);
      // A TOML basic multi-line string ends at the first unescaped `"""`, so a
      // prompt containing one would truncate the file silently.
      const body = (spec.preamble === false ? "" : preamble(role, h)) + role.body;
      return [
        ...head,
        `# ${MARK}`,
        `${bodyKey} = """`,
        body.replace(/"""/g, '\\"\\"\\"'),
        '"""',
        "",
      ].join("\n");
    }
    case "aggregate-json": {
      const entry = {};
      for (const [k, tpl] of Object.entries(spec.entry || {})) {
        entry[k] = Array.isArray(tpl) ? tpl : fill(tpl, vars);
      }
      // The provenance line has to live inside a value, because JSON has no
      // comments: the role definition is a prompt, so it can carry it.
      const key = Object.keys(spec.entry).find((k) => String(spec.entry[k]).includes("{body}")) || "roleDefinition";
      entry[key] = `${entry[key]}\n\n${MARK}`;
      return entry;
    }
    default:
      throw new Error(`${h.id}: unknown role shape "${spec.shape}" in ${h.source}`);
  }
}

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

export function renderFor(id, role, cfg) {
  const h = harness(id);
  const rendered = renderRole(h, role, resolveModel(role, cfg, id));
  return typeof rendered === "string" ? stamp(rendered, role) : stampObject(rendered, role);
}

// Which harnesses this project already uses. Detection is by directory or by a
// file the harness itself owns, never by env: a Codex user must not have
// .claude/ conjured for them, and a shared project may carry several.
export function detectHarnesses(proj = projectRoot()) {
  return harnessIds().filter((id) => (harness(id).detect || []).some((p) => markerCounts(join(proj, p))));
}

// A detection marker is evidence the USER uses a harness. A file whose entire
// content is waypost's own routing block is not: waypost wrote it, as another
// harness's instruction target (E-1). `AGENTS.md` is `codex`'s marker AND the
// block target for nine other harnesses, so a solo-Pi project's `waypost setup`
// used to write AGENTS.md, then read it back as "codex is used here" and, on the
// next run, install an unrequested Codex agent set. Strip our block; a marker
// counts when the user's own content (or a directory, or a file we never write)
// remains. An empty file is not evidence either.
function markerCounts(abs) {
  if (!existsSync(abs)) return false;
  let text;
  try { text = readFileSync(abs, "utf8"); } catch { return directoryCounts(abs); }
  return text.replace(BLOCK_RE, "").trim().length > 0;
}

// A directory is evidence unless everything in it is waypost's own skills:
// `waypost skills install` puts one copy into the shared `.agents/skills/` for
// the eleven harnesses that read it, and `.agents/` is also Antigravity's
// detection marker — so a Codex project's skills used to read back as "this
// project uses Antigravity" and install an unrequested agent set (the E-1
// loop again, one directory up). Roles are different: they are installed for a
// harness on purpose, so they stay evidence.
function directoryCounts(abs) {
  let names;
  try { names = readdirSync(abs).filter((n) => !n.startsWith(".")); } catch { return true; }
  if (!names.length) return true; // an empty directory is the user's, as before
  for (const n of names) {
    if (n !== "skills") return true;
    let inner;
    try { inner = readdirSync(join(abs, n)).filter((x) => !x.startsWith(".")); } catch { return true; }
    if (inner.some((x) => !x.startsWith(PREFIX))) return true;
  }
  return false;
}

// The running harness, from an explicit WAYPOST_HARNESS or, failing that, the
// env markers each registry entry declares — the same detection commit.mjs used
// for its trailers, lifted here so presence, sessions, leases and watch label a
// session the same way commits do (E-3) instead of showing "?".
// Env markers are inherited: a harness spawned from inside another (OpenCode
// started from a Claude Code session, a Codex run from Cursor's terminal)
// carries the outer harness's variables too, and the first registry entry
// whose markers matched used to win — the live OpenCode run of 2026-09-04
// recorded itself as `claude` and installed Claude's roles. The process that
// actually runs the session is better evidence: when the nearest non-shell
// ancestor (harnessProcess) is a harness this registry knows, that harness
// wins; env decides only when the process says nothing.
export function detectHarness(env = process.env) {
  if (env.WAYPOST_HARNESS) return env.WAYPOST_HARNESS;
  const byProcess = harnessOfProcess(env);
  if (byProcess) return byProcess;
  for (const [id, h] of registry()) {
    if ((h.env || []).some((k) => env[k])) return id;
  }
  return "unknown";
}

function harnessOfProcess(env) {
  let proc = null;
  try {
    if (env.WAYPOST_PROC) proc = JSON.parse(env.WAYPOST_PROC);
    else if (env === process.env) proc = harnessProcess();
  } catch { proc = null; }
  const comm = proc && proc.comm ? String(proc.comm).toLowerCase() : "";
  if (!comm) return null;
  // The binary's first word, so `claude`, `codex`, `opencode`, `gemini`,
  // `cursor-agent` all resolve; an Electron helper resolves to nothing.
  const word = comm.split(/[^a-z0-9]+/)[0];
  for (const [id, h] of registry()) {
    if (h.kind === "provider") continue;
    if (word === id || (h.process || []).includes(word)) return id;
  }
  return null;
}

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
      for (let d = start; d.startsWith(proj + "/"); d = dirname(d)) {
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
export function status({ proj = projectRoot(), cfg = readConfig() } = {}) {
  const roster = rosterFor(cfg);
  return harnessIds().map((id) => {
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

const BLOCK_RE = /<!--\s*waypost:agents v\d+[\s\S]*?<!--\s*\/waypost:agents\s*-->\n?/g;

// Claude Code's `@AGENTS.md` / `@./AGENTS.md` import syntax: a line that is
// nothing but an import of a shared instruction file. Captures the basename
// (without extension) so the caller can check it names the SPECIFIC shared
// file found, not just any AGENTS/CLAUDE mention.
const IMPORT_RE = /^@\.?\/?(AGENTS|CLAUDE)\.md\s*$/m;

// True when `ownFile`'s own text already @-imports `sharedFile` (its
// basename, e.g. "AGENTS.md") — the shared file then reaches the harness
// through that import, so writing the block into ownFile too would be a
// second copy of standing context the harness reads on every turn (ADR-0008).
export function importsSharedFile(ownPath, sharedFile) {
  let text;
  try { text = readFileSync(ownPath, "utf8"); } catch { return false; }
  const m = text.match(IMPORT_RE);
  return !!m && `${m[1]}.md` === sharedFile;
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
  const shared = sharedCandidates.find((f) => !sharedCandidates.some((g) => g !== f && importsSharedFile(join(proj, f), g)));
  if (ownPresent.length) {
    // An own file that itself @-imports the shared one already reaches the
    // harness through that import (G-1: this repo's own .claude/CLAUDE.md
    // is `@AGENTS.md`) — write the block into the shared file only. An own
    // file with no such import keeps today's behaviour.
    return [...new Set(ownPresent.map((f) =>
      (sharedOk && shared && importsSharedFile(join(proj, f), shared)) ? shared : f))];
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
    && !(f === "CLAUDE.md" && existsSync(join(proj, "AGENTS.md")) && importsSharedFile(join(proj, f), "AGENTS.md"))));
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
function harnessArg(rest, cfg) {
  const i = rest.indexOf("--harness");
  const raw = i !== -1 ? rest[i + 1] : null;
  if (raw === "all") return HARNESSES;
  if (!raw) {
    const seen = detectHarnesses();
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
      const res = install(harnessArg(rest, cfg), { cfg });
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
