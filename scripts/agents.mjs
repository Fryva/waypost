#!/usr/bin/env node
import { AGENT_BLOCK_VERSION, AGENT_BLOCK_MARKER, PREFIX, harness, isProvider, confidenceOf, harnessIds, providerIds, detectProvider, HARNESSES, harnessTakesModel, roleSpec } from "./agents-registry.mjs";
export { AGENT_BLOCK_VERSION, AGENT_BLOCK_MARKER, PREFIX, TIERS, registry, harness, isProvider, CONFIDENCE, confidenceOf, harnessIds, providerIds, detectProvider, HARNESSES, harnessTakesModel } from "./agents-registry.mjs";
export { resolveModel, installedRoleOf, renderHashOf, renderFor } from "./agents-render.mjs";
import { detectHarnesses, detectHarness, installHarnesses, gateCheck, BLOCK_RE } from "./agents-detection.mjs";
export { detectHarnesses, detectHarness, installHarnesses, gateCheck } from "./agents-detection.mjs";
import { rolesDir, roleNames, readRole, listRoles, skillsOf, rosterFor, harnessesNamingModels, targetDir, harnessOwnedPaths, targetPath, isAggregate, hasRoleFiles, install, uninstall, status } from "./agents-roles.mjs";
export { rolesDir, roleNames, readRole, listRoles, skillsOf, rosterFor, harnessesNamingModels, targetDir, harnessOwnedPaths, targetPath, isAggregate, hasRoleFiles, install, uninstall, status } from "./agents-roles.mjs";
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

import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  pluginRoot,
  projectRoot,
  readConfig,
  writeConfig,
  ignoreEpipe,
} from "./lib.mjs";


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
