// waypost — Agent Skills: the open SKILL.md standard, shipped by waypost and
// installed into each harness's skills directory (WP-14).
//
// A skill is a directory with a SKILL.md whose frontmatter carries `name` and
// `description`; a harness loads only those two at startup and the body when
// a task matches — which is why every description here is a trigger, and why
// their total is pinned by a test (ADR-0008). The bundled skills live in
// `skills/` of the tool root and are the source of truth; an installed copy
// carries `metadata.waypost-source` and `metadata.waypost-hash`, which is how
// `status()` tells a current copy from a stale one or a hand-edited one, and
// how install knows a file is ours before overwriting it. Where a harness
// discovers skills is registry data (`skillsOf`, harnesses/*.json): eleven
// harnesses read the shared `.agents/skills/`, so one copy there serves them
// all; the rest get their brand directory. No rendering per harness: the
// standard's whole point is that one file works everywhere.
//
// CLI: node skills.mjs install [--harness <a,b>|all] [--json]
//      node skills.mjs list [--json]
//      node skills.mjs uninstall [--harness <a,b>|all] [--json]
//      node skills.mjs validate [--json]

import {
  existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync, unlinkSync, rmdirSync,
} from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { readConfig, projectRoot, pluginRoot, ignoreEpipe } from "./lib.mjs";
import { harnessIds, harness, skillsOf, detectHarnesses, HARNESSES } from "./agents.mjs";

export const SKILL_PREFIX = "waypost-";
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MARK_RE = /^ {2}waypost-hash: ([0-9a-f]{12})\s*$/m;
const SOURCE_RE = /^ {2}waypost-source: (\S+)\s*$/m;
// The standing-context budget, in characters (ADR-0008 uses the same stand-in
// for tokens): a description is a trigger, not a manual.
export const DESCRIPTION_MAX = 230;
export const DESCRIPTIONS_TOTAL_MAX = 2100;

export function sourceDir() { return join(pluginRoot(), "skills"); }

export function skillNames() {
  if (!existsSync(sourceDir())) return [];
  return readdirSync(sourceDir())
    .filter((n) => !n.startsWith(".") && existsSync(join(sourceDir(), n, "SKILL.md")))
    .sort();
}

// The standard's frontmatter is scalars, so a line reader is enough here.
export function parseSkill(text) {
  const m = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return null;
  const fields = {};
  for (const line of m[1].split(/\r?\n/)) {
    const f = line.match(/^([\w-]+):\s*(.*)$/);
    if (f) fields[f[1]] = f[2].trim();
  }
  return { fields, body: m[2] };
}

const hashOf = (text) => createHash("sha256").update(text).digest("hex").slice(0, 12);

function filesUnder(dir, base = dir) {
  const out = [];
  for (const n of readdirSync(dir).sort()) {
    if (n.startsWith(".")) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...filesUnder(p, base));
    else out.push(relative(base, p).split(sep).join("/"));
  }
  return out;
}

export function readSkill(name) {
  const dir = join(sourceDir(), name);
  const p = join(dir, "SKILL.md");
  const text = readFileSync(p, "utf8");
  const parsed = parseSkill(text);
  return {
    name, dir, text, hash: hashOf(text),
    description: parsed ? parsed.fields.description || "" : "",
    fields: parsed ? parsed.fields : {},
    body: parsed ? parsed.body : text,
    files: filesUnder(dir),
  };
}

export function listSkills() { return skillNames().map(readSkill); }

// The rules of the standard (agentskills.io/specification) plus ours: the
// prefix, the license iFlow requires, and the description budget.
export function validateSkill(name) {
  const problems = [];
  const s = readSkill(name);
  const f = s.fields;
  if (!parseSkill(s.text)) return [`${name}: SKILL.md has no frontmatter`];
  if (f.name !== name) problems.push(`${name}: frontmatter name ${JSON.stringify(f.name || "")} must equal the directory name`);
  if (!NAME_RE.test(name) || name.length > 64) problems.push(`${name}: name must be 1-64 chars, lowercase letters, digits and single hyphens`);
  if (!name.startsWith(SKILL_PREFIX)) problems.push(`${name}: bundled skills carry the ${SKILL_PREFIX} prefix`);
  if (!f.description) problems.push(`${name}: description is required`);
  else if (f.description.length > 1024) problems.push(`${name}: description is ${f.description.length} chars, the standard allows 1024`);
  else if (f.description.length > DESCRIPTION_MAX) problems.push(`${name}: description is ${f.description.length} chars — it is paid for on every turn, keep it under ${DESCRIPTION_MAX}`);
  if (!f.license) problems.push(`${name}: license is required (iFlow refuses a skill without one)`);
  const lines = s.body.split("\n").length;
  if (lines > 500) problems.push(`${name}: body is ${lines} lines, the standard recommends under 500 — move detail to references/`);
  if (MARK_RE.test(s.text)) problems.push(`${name}: a source skill must not carry waypost-hash — that is the installed copy's mark`);
  return problems;
}

// The installed copy: the source with provenance in the standard's own
// `metadata` map. Harnesses read the map with a real YAML parser; waypost
// reads the two lines back with a regex, since its own frontmatter reader is
// line-based and cannot see a block map (ADR-0009).
export function render(skill) {
  const m = skill.text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const head = m[1];
  const tail = skill.text.slice(m[0].length);
  const meta = `metadata:\n  waypost-source: skills/${skill.name}/SKILL.md\n  waypost-hash: ${skill.hash}`;
  return `---\n${head}\n${meta}\n---\n${tail}`;
}

export function installedMarker(text) {
  const h = String(text).match(MARK_RE);
  if (!h) return null;
  const s = String(text).match(SOURCE_RE);
  return { hash: h[1], source: s ? s[1] : null };
}

// One row per distinct directory: harnesses that share `.agents/skills` share
// one copy and one verdict.
export function targetsFor(ids, proj = projectRoot()) {
  const byDir = new Map();
  for (const id of ids) {
    const s = skillsOf(id);
    if (!s) continue;
    const abs = join(proj, s.dir);
    if (!byDir.has(s.dir)) byDir.set(s.dir, { dir: s.dir, abs, harnesses: [] });
    byDir.get(s.dir).harnesses.push(id);
  }
  return [...byDir.values()];
}

export function status({ proj = projectRoot(), ids = harnessIds() } = {}) {
  const sources = listSkills();
  return targetsFor(ids, proj).map((t) => ({
    ...t,
    skills: sources.map((s) => {
      const p = join(t.abs, s.name, "SKILL.md");
      if (!existsSync(p)) return { name: s.name, state: "absent", path: p };
      const text = readFileSync(p, "utf8");
      const mark = installedMarker(text);
      if (!mark) return { name: s.name, state: "foreign", path: p };
      if (mark.hash !== s.hash) return { name: s.name, state: "stale", path: p, reason: "source changed" };
      if (text !== render(s)) return { name: s.name, state: "stale", path: p, reason: "edited by hand" };
      return { name: s.name, state: "current", path: p };
    }),
  }));
}

export function install(ids, { proj = projectRoot() } = {}) {
  const out = [];
  const sources = listSkills();
  for (const id of ids) {
    if (!skillsOf(id)) out.push({ harness: id, dir: null, skill: null, path: null, action: "no skills directory", note: harness(id).skills_note || null });
  }
  for (const t of targetsFor(ids, proj)) {
    for (const s of sources) {
      const dir = join(t.abs, s.name);
      const p = join(dir, "SKILL.md");
      const content = render(s);
      const before = existsSync(p) ? readFileSync(p, "utf8") : null;
      const row = { harness: t.harnesses.join(","), dir: t.dir, skill: s.name, path: p };
      if (before === content) { out.push({ ...row, action: "unchanged" }); continue; }
      if (before !== null && !installedMarker(before)) { out.push({ ...row, action: "skipped (not ours)" }); continue; }
      mkdirSync(dir, { recursive: true });
      writeFileSync(p, content, "utf8");
      // Supporting files travel verbatim; SKILL.md is the only rendered one.
      for (const f of s.files) {
        if (f === "SKILL.md") continue;
        const dst = join(dir, f);
        mkdirSync(dirname(dst), { recursive: true });
        writeFileSync(dst, readFileSync(join(s.dir, f)));
      }
      out.push({ ...row, action: before === null ? "created" : "updated" });
    }
  }
  return out;
}

export function uninstall(ids, { proj = projectRoot() } = {}) {
  const out = [];
  for (const t of targetsFor(ids, proj)) {
    for (const s of listSkills()) {
      const dir = join(t.abs, s.name);
      const p = join(dir, "SKILL.md");
      if (!existsSync(p)) continue;
      if (!installedMarker(readFileSync(p, "utf8"))) { out.push({ dir: t.dir, skill: s.name, path: p, action: "kept (not ours)" }); continue; }
      for (const f of filesUnder(dir).reverse()) { try { unlinkSync(join(dir, f)); } catch {} }
      try { rmdirSync(dir); } catch {}
      out.push({ dir: t.dir, skill: s.name, path: p, action: "removed" });
    }
    try { if (existsSync(t.abs) && readdirSync(t.abs).length === 0) rmdirSync(t.abs); } catch {}
  }
  return out;
}

function idsFrom(rest) {
  const i = rest.indexOf("--harness");
  const raw = i !== -1 ? rest[i + 1] : null;
  if (raw === "all") return HARNESSES;
  if (raw) {
    const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
    const bad = ids.filter((id) => !harnessIds().includes(id));
    if (bad.length) { process.stderr.write(`waypost skills: unknown harness ${bad.join(", ")} (known: ${HARNESSES.join(", ")})\n`); process.exit(1); }
    return ids;
  }
  const seen = detectHarnesses();
  if (!seen.length) { process.stderr.write(`waypost skills: no harness detected in this project — name one: --harness ${HARNESSES.join("|")} (or all)\n`); process.exit(1); }
  return seen;
}

function main() {
  ignoreEpipe();
  const [sub = "list", ...rest] = process.argv.slice(2);
  const json = rest.includes("--json");
  const cfg = readConfig();
  switch (sub) {
    case "validate": {
      const problems = skillNames().flatMap(validateSkill);
      if (json) { process.stdout.write(JSON.stringify({ skills: skillNames(), problems }, null, 2) + "\n"); }
      else process.stdout.write(problems.length ? problems.map((p) => `✗ ${p}\n`).join("") : `${skillNames().length} skill(s) valid\n`);
      if (problems.length) process.exit(1);
      return;
    }
    case "install": {
      if (!cfg || !cfg.vault_path) { process.stderr.write("waypost skills: no bound vault — run `waypost bind <vault-path>` first\n"); process.exit(1); }
      const res = install(idsFrom(rest));
      if (json) { process.stdout.write(JSON.stringify(res, null, 2) + "\n"); return; }
      for (const r of res) process.stdout.write(`${r.action.padEnd(18)} ${r.path || r.harness}${r.note ? `  — ${r.note}` : ""}\n`);
      if (res.some((r) => r.action.startsWith("skipped"))) process.stdout.write("\nSkipped files were not generated by waypost — rename them if they are yours,\nor delete them to let install take the name.\n");
      return;
    }
    case "uninstall": {
      const res = uninstall(idsFrom(rest));
      if (json) { process.stdout.write(JSON.stringify(res, null, 2) + "\n"); return; }
      if (!res.length) process.stdout.write("nothing to remove\n");
      for (const r of res) process.stdout.write(`${r.action.padEnd(18)} ${r.path}\n`);
      return;
    }
    case "list": {
      const ids = rest.includes("--harness") ? idsFrom(rest) : (detectHarnesses().length ? detectHarnesses() : harnessIds());
      const rows = status({ ids });
      if (json) { process.stdout.write(JSON.stringify({ sources: skillNames(), targets: rows }, null, 2) + "\n"); return; }
      process.stdout.write(`bundled: ${skillNames().join(", ")}\n\n`);
      if (!rows.length) { process.stdout.write("no harness with a skills directory here — `waypost skills install --harness <id>`\n"); return; }
      for (const t of rows) {
        const counts = {};
        for (const s of t.skills) counts[s.state] = (counts[s.state] || 0) + 1;
        process.stdout.write(`${t.dir.padEnd(20)} ${t.harnesses.join(",").padEnd(28)} ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}\n`);
      }
      return;
    }
    default:
      process.stderr.write(`waypost skills: unknown subcommand ${sub} (install, list, uninstall, validate)\n`);
      process.exit(1);
  }
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) main();
