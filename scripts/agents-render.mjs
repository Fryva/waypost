// waypost — shape-driven role rendering and provenance (ADR-0003/0005).
import { createHash } from "node:crypto";
import { PREFIX, harness, roleSpec, harnessTakesModel } from "./agents-registry.mjs";

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

export function renderFor(id, role, cfg) {
  const h = harness(id);
  const rendered = renderRole(h, role, resolveModel(role, cfg, id));
  return typeof rendered === "string" ? stamp(rendered, role) : stampObject(rendered, role);
}

export { fill };
