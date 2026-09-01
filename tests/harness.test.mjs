// mps — harness-agnostic surface tests: the agent roles and their per-harness
// adapters (ADR-0003), and the CLI that every harness shares (ADR-0001).
//   node --test tests/*.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { listRoles, roleNames, readRole, renderFor, renderHashOf, installedRoleOf,
  harnessIds, providerIds, detectProvider, harness as harnessOf, PREFIX, HARNESSES } from "../scripts/agents.mjs";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const MPS = join(REPO, "bin", "mps");

function project() {
  const proj = mkdtempSync(join(tmpdir(), "mps-h-"));
  spawnSync("git", ["init", "-q"], { cwd: proj });
  return proj;
}

function mps(proj, args, { expectFail = false } = {}) {
  const r = spawnSync(process.execPath, [MPS, ...args], {
    encoding: "utf8", cwd: proj, timeout: 30000,
    env: { ...process.env, MPS_PROJECT_DIR: proj, MPS_HOME: REPO },
  });
  if (!expectFail) assert.equal(r.status, 0, `${args.join(" ")}\n${r.stderr}${r.stdout}`);
  return r;
}

function bound() {
  const proj = project();
  const vault = join(proj, "vault");
  mps(proj, ["bind", vault]);
  return { proj, vault };
}

// ─── role definitions ──────────────────────────────────────────────────

test("every bundled role is neutral: no harness-specific paths or slash commands", () => {
  const roles = listRoles();
  assert.ok(roles.length >= 3, "the roster ships");
  for (const r of roles) {
    assert.equal(r.name, r.path.split("/").pop().replace(/\.md$/, ""), "name matches filename");
    assert.ok(r.description.length > 40, `${r.name} describes when to invoke it`);
    assert.ok(["reasoning", "balanced", "fast"].includes(r.tier),
      `${r.name} declares a neutral model tier, not a vendor model id: ${r.tier}`);
    assert.ok(r.tools.length, `${r.name} declares tools`);
    const raw = readFileSync(r.path, "utf8");
    assert.ok(!/CLAUDE_PLUGIN_ROOT|\.claude\/projectstore\.json/.test(raw),
      `${r.name} must not name Claude Code's plugin wiring`);
    assert.ok(!/\/projectstore:/.test(raw), `${r.name} must not name upstream slash commands`);
  }
});

// ─── adapters ──────────────────────────────────────────────────────────

test("each harness gets the same role in its own dialect, with provenance", () => {
  const role = readRole("critic");
  const claude = renderFor("claude", role, null);
  assert.match(claude, new RegExp(`^---\\nname: "${PREFIX}critic"$`, "m"), "claude keys agents by name");
  assert.match(claude, /^model: "opus"$/m, "the reasoning tier maps to opus for Claude Code");
  assert.match(claude, /^tools: "Read, Grep, Glob, Bash, WebFetch, WebSearch"$/m);

  const opencode = renderFor("opencode", role, null);
  assert.match(opencode, /^mode: "subagent"$/m, "opencode declares the agent mode");
  assert.match(opencode, /^ {2}write: false$/m, "edits are denied by the tool map");
  assert.match(opencode, /^ {2}edit: false$/m);
  assert.match(opencode, /^ {2}bash: true$/m,
    "bash stays available — these roles need git diff/log, so the shell half of read-only is prose, not enforcement");
  assert.ok(!/^model:/m.test(opencode), "no model is invented for a harness with no stable tier names");

  const codex = renderFor("codex", role, null);
  assert.match(codex, /\$ARGUMENTS/, "codex prompts take their target as an argument");
  assert.match(codex, /READ-ONLY/, "what the tool map cannot enforce is stated in prose");

  for (const [name, text] of [["claude", claude], ["opencode", opencode], ["codex", codex]]) {
    assert.ok(text.includes(`agents/critic.md@${role.hash}`), `${name} carries the source hash`);
    assert.ok(text.includes(role.body.split("\n")[0]), `${name} carries the role prompt itself`);
    const h = renderHashOf(text);
    assert.equal(h.claimed, h.actual, `${name}'s render hash describes the file it is in`);
  }
});

// The frontmatter is parsed by three different YAML readers we do not control.
// Node ships no YAML parser, so this asserts the plain-scalar rules that matter
// rather than parsing: a value must be quoted, or must contain nothing that
// ends a plain scalar. It is the rule that ": " inside an unquoted description
// broke — nine of fifteen files, in every harness.
function assertFrontmatterScalars(text, where) {
  const fm = text.split("\n---\n")[0].replace(/^---\n/, "");
  for (const line of fm.split("\n")) {
    const kv = line.match(/^([A-Za-z][\w-]*): (.+)$/);
    if (!kv) continue;
    const [, key, raw] = kv;
    const v = raw.trim();
    if (/^".*"$/.test(v) || /^'.*'$/.test(v)) {
      assert.doesNotThrow(() => JSON.parse(v.startsWith('"') ? v : JSON.stringify(v.slice(1, -1))),
        `${where}: ${key} is quoted but not a valid scalar`);
      continue;
    }
    if (/^(true|false|null|\d+(\.\d+)?)$/.test(v)) continue;
    if (v.startsWith("[")) {           // a flow sequence, emitted as JSON
      assert.doesNotThrow(() => JSON.parse(v), `${where}: ${key} looks like a list but is not valid JSON/YAML flow`);
      continue;
    }
    assert.ok(!v.includes(": "), `${where}: unquoted ${key} contains ": " — ends the plain scalar, breaks the file`);
    assert.ok(!/ #/.test(v), `${where}: unquoted ${key} contains " #" — starts a comment`);
    assert.ok(!/^[[\]{}&*!|>%@`]/.test(v), `${where}: unquoted ${key} starts with a YAML indicator`);
  }
}

test("every render of every role has parseable frontmatter", () => {
  // Only the shapes that HAVE frontmatter: an aggregate entry is an object and
  // a TOML command is not YAML at all — those are covered by the registry test.
  const yamlish = harnessIds().filter((id) => ["frontmatter-md", "prompt-md"].includes(harnessOf(id).roles.shape));
  assert.ok(yamlish.length >= 3);
  for (const name of roleNames()) {
    const role = readRole(name);
    for (const h of yamlish) {
      assertFrontmatterScalars(renderFor(h, role, null), `${h}/${name}`);
      assertFrontmatterScalars(renderFor(h, role, { agents: { default: { model: "sonnet" } } }), `${h}/${name} (pinned)`);
    }
  }
});

test("a TOML command file is valid TOML, and the prompt inside it is closed", () => {
  for (const name of roleNames()) {
    const text = renderFor("gemini", readRole(name), null);
    const lines = text.split("\n");
    assert.match(lines[0], /^description = "/, "description is a quoted TOML string");
    assert.doesNotThrow(() => JSON.parse(lines[0].replace(/^description = /, "")));
    assert.equal((text.match(/^"""$/gm) || []).length, 1, "the prompt's closing delimiter appears exactly once");
    assert.match(text, /^prompt = """$/m);
    assert.ok(!text.split('prompt = """')[1].includes('"""\n\n'), "nothing follows the closed prompt");
  }
});

test("a role naming a tool outside the neutral vocabulary is rejected at read time", () => {
  const dir = mkdtempSync(join(tmpdir(), "mps-roles-"));
  mkdirSync(join(dir, "agents"), { recursive: true });
  writeFileSync(join(dir, "agents", "bogus.md"),
    "---\nname: bogus\ndescription: x\ntools: [read, telepathy]\n---\nbody\n", "utf8");
  const r = spawnSync(process.execPath, ["-e",
    `import(${JSON.stringify(join(REPO, "scripts", "agents.mjs"))}).then(m => m.readRole("bogus")).catch(e => { console.log(e.message); })`],
    { encoding: "utf8", env: { ...process.env, MPS_HOME: dir } });
  assert.match(r.stdout, /unknown tool\(s\) telepathy/, "the error names the tool and the file");
});

test("the harness registry is data, and every entry renders every role", () => {
  const ids = harnessIds();
  assert.ok(ids.length >= 8, `the registry ships a real spread of harnesses, got ${ids.length}`);
  for (const id of ids) {
    const h = harnessOf(id);
    assert.ok(h.detect && h.detect.length, `${id}: declares how it is detected`);
    assert.ok(h.roles && h.roles.shape, `${id}: declares a role shape`);
    for (const name of roleNames()) {
      const out = renderFor(id, readRole(name), null);
      const text = typeof out === "string" ? out : JSON.stringify(out, null, 2);
      assert.ok(installedRoleOf(text), `${id}/${name}: carries provenance whatever the shape`);
      const hh = renderHashOf(text);
      assert.equal(hh.claimed, hh.actual, `${id}/${name}: the render hash describes what it is in`);
      assert.ok(text.includes(readRole(name).body.split("\n")[0]), `${id}/${name}: carries the prompt`);
    }
  }
});

test("a harness that declares no frontmatter fields gets no empty block", () => {
  const dir = mkdtempSync(join(tmpdir(), "mps-nofm-"));
  mkdirSync(join(dir, "harnesses"), { recursive: true });
  mkdirSync(join(dir, "agents"), { recursive: true });
  writeFileSync(join(dir, "agents", "solo.md"),
    "---\nname: solo\ndescription: a role\ntools: [read]\n---\nBODY LINE\n", "utf8");
  writeFileSync(join(dir, "harnesses", "bare.json"), JSON.stringify({
    id: "bare", detect: [".bare"],
    roles: { shape: "prompt-md", dir: ".bare", file: "{prefix}{role}.md", model: false },
  }), "utf8");
  const r = spawnSync(process.execPath, ["-e",
    `import(${JSON.stringify(join(REPO, "scripts", "agents.mjs"))}).then(m => {` +
    `  const t = m.renderFor("bare", m.readRole("solo"), null);` +
    `  console.log(JSON.stringify(t.slice(0, 40)));` +
    `})`], { encoding: "utf8", env: { ...process.env, MPS_HOME: dir } });
  const head = JSON.parse(r.stdout.trim());
  assert.ok(!head.startsWith("---\n---"),
    "an empty frontmatter block is a block that parses to nothing, not the absence of one");
  assert.match(head, /^<!-- generated by/);
});

test("providers are vendors of models, not harnesses, and are kept apart from them", () => {
  const ids = harnessIds();
  for (const p of providerIds()) {
    assert.ok(!ids.includes(p), `${p} ships models, not role files — installing into it has no meaning`);
    const h = harnessOf(p);
    assert.equal(h.kind, "provider");
    assert.ok((h.runs_in || []).length, `${p} must say which harnesses it is actually driven from`);
    assert.ok((h.match && (h.match.env || h.match.url_contains || []).length), `${p} must say how it is detected`);
  }
  assert.ok(providerIds().includes("deepseek") && providerIds().includes("moonshot"),
    "the vendors people actually point their harness at are named");
  assert.ok(harnessIds().includes("kimi") && harnessIds().includes("qwen") && harnessIds().includes("zcode"),
    "…and a vendor that ships its OWN CLI is a harness, not just a provider");
});

test("the provider is detected from the endpoint or the vendor key, and never guessed", () => {
  assert.equal(detectProvider({ MPS_PROVIDER: "whatever" }), "whatever", "an explicit label wins");
  assert.equal(detectProvider({ ANTHROPIC_BASE_URL: "https://api.moonshot.ai/anthropic" }), "moonshot",
    "the vendor ships a harness (`kimi`) AND models; the provider id is the vendor, so the two never collide");
  assert.equal(detectProvider({ OPENAI_BASE_URL: "https://api.deepseek.com/v1" }), "deepseek");
  assert.equal(detectProvider({ DASHSCOPE_API_KEY: "sk-x" }), "dashscope");
  assert.equal(detectProvider({ ANTHROPIC_BASE_URL: "https://open.bigmodel.cn/api/anthropic" }), "glm");
  assert.equal(detectProvider({}), null, "no evidence, no claim");
});

test("every registry entry declares how confident we are in its file format", () => {
  for (const id of [...harnessIds()]) {
    const h = harnessOf(id);
    const c = h.confidence || (h.verified ? "verified" : "experimental");
    assert.ok(["verified", "documented", "inferred"].includes(c), `${id}: ${c}`);
    if (c === "documented") {
      assert.ok(h.docs, `${id} claims its format is documented — the entry must name the document`);
    }
    if (c === "inferred") {
      assert.ok(h.notes && h.notes.length > 80,
        `${id} is a guess, so the entry must say what was assumed and what to check`);
    }
  }
  const listed = mps(project(), ["harnesses"]).stdout;
  assert.match(listed, /MODEL PROVIDERS/, "the two kinds are shown as two kinds");
  assert.match(listed, /inferred|documented/, "and the confidence of each entry is printed, not hidden");
});

test("a project can add a harness without touching the code", () => {
  const { proj } = bound();
  mkdirSync(join(proj, ".mps", "harnesses"), { recursive: true });
  mkdirSync(join(proj, ".myagent"), { recursive: true });
  writeFileSync(join(proj, ".mps", "harnesses", "myagent.json"), JSON.stringify({
    id: "myagent", name: "My Agent", detect: [".myagent"],
    roles: { shape: "prompt-md", dir: ".myagent/roles", file: "{prefix}{role}.md", model: false,
             fields: [["description", "{description}"]] },
  }), "utf8");

  const listed = mps(proj, ["harnesses"]).stdout;
  assert.match(listed, /myagent/, "the registry picks up a project-local entry");
  mps(proj, ["agents", "install"]);
  const p = join(proj, ".myagent", "roles", `${PREFIX}critic.md`);
  assert.ok(existsSync(p), "and installs into it, with no code change");
  assert.ok(installedRoleOf(readFileSync(p, "utf8")), "with the same provenance contract");
  mps(proj, ["agents", "uninstall", "--harness", "myagent"]);
  assert.ok(!existsSync(p));
});

test("an aggregate harness merges into its shared file and leaves other entries alone", () => {
  const { proj } = bound();
  mps(proj, ["agents", "install", "--harness", "roo"]);
  const read = () => JSON.parse(readFileSync(join(proj, ".roomodes"), "utf8"));
  assert.deepEqual(read().customModes.map((m) => m.slug).sort(),
    roleNames().map((n) => PREFIX + n).sort(), "every role became a mode");

  const doc = read();
  doc.customModes.push({ slug: "my-mode", name: "mine", roleDefinition: "hand written" });
  writeFileSync(join(proj, ".roomodes"), JSON.stringify(doc, null, 2), "utf8");
  mps(proj, ["agents", "install", "--harness", "roo"]);
  assert.ok(read().customModes.some((m) => m.slug === "my-mode"), "a user's own mode survives install");

  mps(proj, ["agents", "uninstall", "--harness", "roo"]);
  assert.deepEqual(read().customModes.map((m) => m.slug), ["my-mode"],
    "uninstall removes only the modes mps generated");
});

test("uninstall clears nested empty directories, whatever the file is named", () => {
  const { proj } = bound();
  mps(proj, ["agents", "install", "--harness", "gemini"]);     // .gemini/commands/mps/<role>.toml — no prefix in the name
  assert.ok(existsSync(join(proj, ".gemini", "commands", "mps", "critic.toml")));
  mps(proj, ["agents", "uninstall", "--harness", "gemini"]);
  assert.ok(!existsSync(join(proj, ".gemini")),
    "a namespace directory left behind would make detection resurrect the harness");
});

test("install: idempotent, per-harness, and detected harnesses are the default", () => {
  const { proj } = bound();
  mkdirSync(join(proj, ".opencode"), { recursive: true });

  const first = mps(proj, ["agents", "install"]).stdout;
  assert.ok(/\.opencode\/agent\/mps-critic\.md/.test(first), "the harness in use is installed");
  assert.ok(!/\.codex\/prompts/.test(first), "a harness this project does not use is left alone");
  assert.ok(!existsSync(join(proj, ".codex")), "no directory is conjured for an unused harness");

  const second = mps(proj, ["agents", "install"]).stdout;
  assert.ok(!/created|updated/.test(second), `second install is a no-op:\n${second}`);

  const files = readdirSync(join(proj, ".opencode", "agent"));
  assert.deepEqual(files.sort(), roleNames().map((n) => `${PREFIX}${n}.md`).sort());
});

test("install with no harness detected refuses instead of guessing all three", () => {
  const proj = project();          // bare git repo: no CLAUDE.md, no .opencode, no .codex
  mps(proj, ["bind", join(proj, "vault")]);
  const r = mps(proj, ["agents", "install"], { expectFail: true });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /no harness detected/);
  for (const d of [".claude", ".opencode", ".codex"]) {
    assert.ok(!existsSync(join(proj, d)), `${d} must not be conjured — detection is by directory, so a guess becomes permanent`);
  }
  mps(proj, ["agents", "install", "--harness", "codex"]);
  assert.ok(existsSync(join(proj, ".codex", "prompts", `${PREFIX}critic.md`)), "naming one works");
  assert.ok(!existsSync(join(proj, ".claude")), "and only that one");
});

test("uninstall removes what mps generated and keeps what it did not", () => {
  const { proj } = bound();
  mps(proj, ["agents", "install", "--harness", "claude"]);
  const mine = join(proj, ".claude", "agents", `${PREFIX}critic.md`);
  const theirs = join(proj, ".claude", "agents", `${PREFIX}mine.md`);
  writeFileSync(theirs, "---\nname: mps-mine\n---\nhand written\n", "utf8");

  mps(proj, ["agents", "uninstall", "--harness", "claude"]);
  assert.ok(!existsSync(mine), "generated role files go");
  assert.equal(readFileSync(theirs, "utf8"), "---\nname: mps-mine\n---\nhand written\n",
    "a file with no provenance line is not ours to delete");
});

test("a hand-edited role file is stale, and doctor says so as an issue", () => {
  const { proj } = bound();
  mps(proj, ["agents", "install", "--harness", "claude"]);
  const p = join(proj, ".claude", "agents", `${PREFIX}critic.md`);
  writeFileSync(p, readFileSync(p, "utf8").replace(/@[0-9a-f]{12}/, "@deadbeefcafe"), "utf8");

  const findings = JSON.parse(mps(proj, ["doctor", "--install", "--json"]).stdout);
  const stale = findings.find((f) => f.check === "agent-roles" && f.level === "issue");
  assert.ok(stale, `expected a stale-role issue, got:\n${JSON.stringify(findings, null, 2)}`);
  assert.match(stale.message, /mps agents install --harness claude/, "it names the repair");

  mps(proj, ["doctor", "--fix"]);
  const after = JSON.parse(mps(proj, ["doctor", "--install", "--json"]).stdout);
  assert.ok(!after.some((f) => f.check === "agent-roles" && f.level === "issue"), "--fix re-renders it");
});

test("agents model: the config pins the model the adapters render", () => {
  const { proj } = bound();
  mps(proj, ["agents", "model", "default", "sonnet"]);
  mps(proj, ["agents", "model", "reviewer", "fable"]);
  mps(proj, ["agents", "install", "--harness", "claude"]);
  const read = (n) => readFileSync(join(proj, ".claude", "agents", `${PREFIX}${n}.md`), "utf8");
  assert.match(read("critic"), /^model: "sonnet"$/m, "the default applies to every role");
  assert.match(read("reviewer"), /^model: "fable"$/m, "a per-role pin wins over the default");
});

test("a harness-blind model pin never reaches a harness whose ids it cannot be valid for", () => {
  const { proj } = bound();
  const out = mps(proj, ["agents", "model", "default", "sonnet"]).stdout;
  assert.match(out, /applies to: claude\b/, "the CLI says where the pin lands");
  mps(proj, ["agents", "install", "--harness", "claude,opencode,codex"]);
  const oc = readFileSync(join(proj, ".opencode", "agent", `${PREFIX}critic.md`), "utf8");
  const cx = readFileSync(join(proj, ".codex", "prompts", `${PREFIX}critic.md`), "utf8");
  assert.ok(!/^model:/m.test(oc), "a bare Claude id must not be written where OpenCode wants provider/model");
  assert.ok(!/^model:/m.test(cx), "Codex takes no model from us at all");

  // …and naming one per harness is how you do reach it.
  mps(proj, ["agents", "model", "harness:opencode", "anthropic/claude-sonnet-4-5"]);
  mps(proj, ["agents", "install", "--harness", "opencode"]);
  assert.match(readFileSync(join(proj, ".opencode", "agent", `${PREFIX}critic.md`), "utf8"),
    /^model: "anthropic\/claude-sonnet-4-5"$/m);
});

test("changing the model makes installed files stale — the hash covers the render, not just the source", () => {
  const { proj } = bound();
  mps(proj, ["agents", "install", "--harness", "claude"]);
  let findings = JSON.parse(mps(proj, ["doctor", "--install", "--json"]).stdout);
  assert.ok(!findings.some((f) => f.check === "agent-roles" && f.level === "issue"), "clean right after install");

  mps(proj, ["agents", "model", "default", "sonnet"]);
  findings = JSON.parse(mps(proj, ["doctor", "--install", "--json"]).stdout);
  const stale = findings.find((f) => f.check === "agent-roles" && f.level === "issue");
  assert.ok(stale, "a config change that alters the render must show up as stale");
  assert.match(stale.message, /config or adapter changed/);

  mps(proj, ["doctor", "--fix"]);
  assert.match(readFileSync(join(proj, ".claude", "agents", `${PREFIX}critic.md`), "utf8"), /^model: "sonnet"$/m);
});

test("install and --fix never overwrite a file mps did not generate", () => {
  const { proj } = bound();
  const p = join(proj, ".claude", "agents", `${PREFIX}critic.md`);
  mkdirSync(join(proj, ".claude", "agents"), { recursive: true });
  const mine = "---\nname: mps-critic\ndescription: \"my own critic\"\n---\nhand written, keep me\n";
  writeFileSync(p, mine, "utf8");

  const out = mps(proj, ["agents", "install", "--harness", "claude"]).stdout;
  assert.match(out, /skipped \(not ours\)/, "install reports the skip rather than doing it silently");
  assert.equal(readFileSync(p, "utf8"), mine, "the user's file survives install");

  const findings = JSON.parse(mps(proj, ["doctor", "--install", "--json"]).stdout);
  const foreign = findings.find((f) => f.check === "agent-roles-foreign");
  assert.ok(foreign, "doctor reports it under its own check id");
  assert.match(foreign.message, /skip them/);

  mps(proj, ["doctor", "--fix"]);
  assert.equal(readFileSync(p, "utf8"), mine, "the user's file survives doctor --fix, which is where it used to die");
});

test("a model cannot be pinned for a harness whose files cannot carry one", () => {
  const { proj } = bound();
  const r = mps(proj, ["agents", "model", "harness:codex", "some/model"], { expectFail: true });
  assert.notEqual(r.status, 0, "accepting a key we then discard is worse than refusing it");
  assert.match(r.stderr, /carry no model/);
  const cfg = JSON.parse(readFileSync(join(proj, ".mps", "projectstore.json"), "utf8"));
  assert.ok(!(cfg.agents && cfg.agents.per_harness && cfg.agents.per_harness.codex),
    "and nothing was written to the config");
  mps(proj, ["agents", "model", "harness:opencode", "anthropic/claude-sonnet-4-5"]);
});

test("uninstall leaves no empty directory for detection to trip over", () => {
  const { proj } = bound();
  mps(proj, ["agents", "install", "--harness", "all"]);
  mps(proj, ["agents", "uninstall", "--harness", "all"]);
  for (const d of [".claude", ".opencode", ".codex"]) {
    assert.ok(!existsSync(join(proj, d)),
      `${d} survived uninstall — detection is by directory, so the harness would come back`);
  }
  // …and the repair path must not reinstall behind the user's back either.
  mps(proj, ["doctor", "--fix"]);
  assert.equal(readdirSync(proj).filter((n) => [".claude", ".opencode", ".codex"].includes(n)).length, 0,
    "doctor --fix put the roles back after an explicit uninstall");
});

test("doctor --fix repairs drift but never installs roles a project has not asked for", () => {
  const { proj } = bound();
  writeFileSync(join(proj, "CLAUDE.md"), "# rules\n", "utf8");   // a harness in use, no roles
  const findings = JSON.parse(mps(proj, ["doctor", "--install", "--json"]).stdout);
  const info = findings.find((f) => f.check === "agent-roles" && f.level === "info");
  assert.ok(info, "the offer is made as info");

  mps(proj, ["doctor", "--fix"]);
  assert.ok(!existsSync(join(proj, ".claude", "agents")), "an info-level offer is not a repair");

  // A partially installed set IS drift, and --fix does repair that.
  mps(proj, ["agents", "install", "--harness", "claude"]);
  rmSync(join(proj, ".claude", "agents", `${PREFIX}critic.md`));
  mps(proj, ["doctor", "--fix"]);
  assert.ok(existsSync(join(proj, ".claude", "agents", `${PREFIX}critic.md`)), "a missing file is restored");
});

test("a role declaring a vendor model id instead of a tier is rejected", () => {
  const dir = mkdtempSync(join(tmpdir(), "mps-roles-"));
  mkdirSync(join(dir, "agents"), { recursive: true });
  writeFileSync(join(dir, "agents", "upstreamish.md"),
    "---\nname: upstreamish\ndescription: x\nmodel: opus\ntools: [read]\n---\nbody\n", "utf8");
  const r = spawnSync(process.execPath, ["-e",
    `import(${JSON.stringify(join(REPO, "scripts", "agents.mjs"))}).then(m => m.readRole("upstreamish")).catch(e => console.log(e.message))`],
    { encoding: "utf8", env: { ...process.env, MPS_HOME: dir } });
  assert.match(r.stdout, /not a neutral tier/,
    "an upstream role file must fail loudly, not render with the model silently dropped");
});

test("register writes exactly one routing block and migrates it in place", () => {
  const { proj } = bound();
  writeFileSync(join(proj, "AGENTS.md"), "# Project rules\n\nkeep me\n", "utf8");
  mps(proj, ["agents", "register"]);
  let text = readFileSync(join(proj, "AGENTS.md"), "utf8");
  assert.equal((text.match(/<!-- mps:agents v\d+/g) || []).length, 1);
  assert.ok(text.includes("keep me"), "existing instructions survive");
  for (const n of roleNames()) assert.ok(text.includes(`${PREFIX}${n}`), `${n} is routed`);

  mps(proj, ["agents", "register"]);
  assert.equal((readFileSync(join(proj, "AGENTS.md"), "utf8").match(/<!-- mps:agents v\d+/g) || []).length, 1,
    "re-registering replaces, never duplicates");

  mps(proj, ["agents", "unregister"]);
  assert.ok(!/mps:agents/.test(readFileSync(join(proj, "AGENTS.md"), "utf8")));
});

test("agents show prints the prompt alone — a harness with no subagents can pipe it", () => {
  const { proj } = bound();
  const out = mps(proj, ["agents", "show", "critic", "adr/foo.md"]).stdout;
  assert.match(out, /^Target: adr\/foo\.md$/m, "the target is passed through");
  assert.ok(!out.includes("---\nname:"), "no frontmatter — this is a prompt, not a file");
  assert.ok(out.includes(readRole("critic").body.split("\n")[0]));
});

// ─── the shared CLI ────────────────────────────────────────────────────

test("bind scaffolds the layout and refuses a silent rebind", () => {
  const { proj, vault } = bound();
  for (const d of ["adr", "specs", "epics", "research", "concepts", "meetings", "ops", "diagrams"]) {
    assert.ok(existsSync(join(vault, d, "README.md")), `${d}/README.md`);
  }
  const cfg = JSON.parse(readFileSync(join(proj, ".mps", "projectstore.json"), "utf8"));
  assert.equal(cfg.vault_path, vault);
  assert.equal(cfg.layout, "engineering");

  const r = mps(proj, ["bind", join(proj, "other")], { expectFail: true });
  assert.notEqual(r.status, 0, "a rebind elsewhere needs --force");
  assert.match(r.stderr, /--force/);
});

test("bind rejects an unknown layout or language before touching anything", () => {
  const proj = project();
  const bad = mps(proj, ["bind", join(proj, "v"), "--layout", "nope"], { expectFail: true });
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /unknown layout/);
  assert.ok(!existsSync(join(proj, ".mps")), "nothing was written");
});

test("draft --write creates the artifact and reconciles the derived views", () => {
  const { proj, vault } = bound();
  mps(proj, ["draft", "adr", "Use Postgres", "--write"]);
  const adr = join(vault, "adr", "use-postgres.md");
  assert.ok(existsSync(adr), "the artifact lands at its slug");
  assert.match(readFileSync(join(vault, "adr", "README.md"), "utf8"), /use-postgres/,
    "the folder index row is regenerated, not hand-patched");

  const again = mps(proj, ["draft", "adr", "Use Postgres", "--write"], { expectFail: true });
  assert.notEqual(again.status, 0, "creating the same identity twice is refused");

  mps(proj, ["draft", "epic", "PS-1", "First epic", "--write"]);
  mps(proj, ["draft", "story", "PS-1", "First story", "--write"]);
  assert.match(readFileSync(join(vault, "kanban.md"), "utf8"), /First story/, "the board picked it up");

  mps(proj, ["graph"]);
  assert.ok(existsSync(join(vault, "graph.md")));
  mps(proj, ["codemap"]);
  assert.ok(existsSync(join(vault, "code-map.md")));
});

test("draft without --write writes nothing and previews the JSON", () => {
  const { proj, vault } = bound();
  const out = JSON.parse(mps(proj, ["draft", "adr", "Only a draft"]).stdout);
  assert.equal(out.kind, "adr");
  assert.ok(out.content.includes("# Only a draft"));
  assert.ok(!existsSync(out.path), "a preview is not a write");
  assert.ok(!existsSync(join(vault, "kanban.md")), "and it reconciles nothing");
});

test("story gates: preview by default, applied with --write", () => {
  const { proj, vault } = bound();
  mps(proj, ["draft", "epic", "PS-1", "E", "--write"]);
  mps(proj, ["draft", "story", "PS-1", "S", "--write"]);
  const story = join(vault, "epics", "PS-1", "stories", "story-s.md");

  mps(proj, ["story", "plan", story]);
  assert.match(readFileSync(story, "utf8"), /status: planned/, "a preview does not stamp the file");

  mps(proj, ["story", "plan", story, "--write"]);
  const planned = readFileSync(story, "utf8");
  assert.match(planned, /status: in-progress/);
  assert.match(planned, /plan_updated_at: "20/);

  mps(proj, ["story", "close", story, "--write"]);
  const closed = readFileSync(story, "utf8");
  assert.match(closed, /status: done/);
  assert.match(closed, /closed_at: "20/);
  assert.match(readFileSync(join(vault, "kanban.md"), "utf8"), /## Done\n\n- \[x\]/,
    "closing moves the card, because the board is derived");
});

test("a freshly bound and scaffolded project is clean under doctor", () => {
  const { proj } = bound();
  mps(proj, ["agents", "install", "--harness", "claude"]);
  mps(proj, ["agents", "register"]);
  mps(proj, ["doctor", "--fix"]);
  const findings = JSON.parse(mps(proj, ["doctor", "--json"]).stdout);
  const issues = findings.filter((f) => f.level === "issue");
  assert.deepEqual(issues, [], `no issues expected:\n${JSON.stringify(issues, null, 2)}`);
});

test("doctor names the missing bind rather than the harness that is missing", () => {
  const proj = project();
  const findings = JSON.parse(mps(proj, ["doctor", "--json"]).stdout);
  const cfg = findings.find((f) => f.check === "config");
  assert.ok(cfg, "the unbound project is reported");
  assert.match(cfg.message, /\.mps\/projectstore\.json/);
  assert.ok(!/\.claude/.test(cfg.message), "the canonical path is not Claude's");
});

test("brief is the session-start packet, on demand and without a hook", () => {
  const { proj, vault } = bound();
  mps(proj, ["draft", "epic", "PS-1", "E", "--write"]);
  mps(proj, ["draft", "story", "PS-1", "S", "--write"]);
  const out = mps(proj, ["brief"]).stdout;
  assert.ok(out.includes(vault), "it names the vault it is orienting in");
  assert.match(out, /## Where things live/);
  assert.match(out, /\| `adr\/` \| adr \|/, "folders come from the layout");
  assert.ok(!out.includes("Use Postgres"), "a skeleton carries no artifact content");
});

test("sessions: the registry is reachable by command from any harness", () => {
  const { proj, vault } = bound();
  const touched = mps(proj, ["sessions", "--touch", "--id", "alpha", "--json"]).stdout;
  assert.match(touched, /"touched": true/);
  const listed = JSON.parse(mps(proj, ["sessions", "--id", "beta", "--json"]).stdout);
  assert.ok(listed.active.some((s) => s.id === "alpha"), "another session sees it");
  assert.ok(existsSync(join(vault, ".projectstore", "sessions", "alpha.json")));

  const outside = mps(proj, ["sessions", "--touch", "--id", "alpha", "--file", join(proj, "x.md")], { expectFail: true });
  assert.notEqual(outside.status, 0, "activity is vault-scoped");
});

test("unknown commands and unbound vaults fail loudly, never silently", () => {
  const proj = project();
  for (const args of [["nope"], ["draft"], ["scaffold"], ["brief"], ["sessions"]]) {
    const r = mps(proj, args, { expectFail: true });
    assert.notEqual(r.status, 0, `${args.join(" ")} should exit non-zero`);
  }
});

test("help lists every command the dispatcher actually implements", () => {
  const proj = project();
  const help = mps(proj, ["help"]).stdout;
  for (const cmd of ["bind", "scaffold", "status", "draft", "story", "kanban", "graph", "codemap",
    "reconcile", "doctor", "diff-refs", "agents", "harnesses", "prompt", "skill", "sessions", "brief"]) {
    assert.ok(help.includes(cmd), `help mentions ${cmd}`);
  }
  assert.ok(help.includes("harnesses"), "help points at the registry rather than enumerating it");
});

test("prompts and skills print, and name no upstream slash command", () => {
  const proj = project();
  const list = mps(proj, ["prompt"]).stdout;
  assert.match(list, /adr/);
  for (const name of ["adr", "story", "review"]) {
    const text = mps(proj, ["prompt", name]).stdout;
    assert.ok(!/\/projectstore:/.test(text), `${name} names no upstream slash command`);
    assert.ok(!/CLAUDE_PLUGIN_ROOT/.test(text), `${name} names no Claude plugin path`);
  }
  const skill = mps(proj, ["skill", "decision-detector"]).stdout;
  assert.ok(!/\/projectstore:/.test(skill));
});

// Drop a line's // comment, tracking quote state so a "//" inside a string (or a
// URL) is not mistaken for one. Good enough for this codebase, and its failure
// mode is a false pass, never a false alarm.
function stripLineComment(line) {
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === "\\") i++;
      else if (c === q) q = null;
    } else if (c === '"' || c === "'" || c === "`") q = c;
    else if (c === "/" && line[i + 1] === "/") return line.slice(0, i);
  }
  return line;
}

test("no user-facing message cites an ADR this fork does not have", () => {
  // Upstream's numbers survive in comments (marked "upstream ADR-00N"), which is
  // fine — a reader of the source can place them. A finding shown to a user is
  // different: "(ADR-008)" sends them to docs/decisions/ for a file that is not
  // there. Comments are stripped, so this checks the strings that ship.
  const have = new Set(readdirSync(join(REPO, "docs", "decisions"))
    .map((n) => (n.match(/^(\d{4})-/) || [])[1]).filter(Boolean));
  for (const f of readdirSync(join(REPO, "scripts")).filter((n) => n.endsWith(".mjs"))) {
    const code = readFileSync(join(REPO, "scripts", f), "utf8")
      .split("\n").map(stripLineComment).join("\n");
    for (const m of code.matchAll(/ADR-(\d+)/g)) {
      const n = m[1].padStart(4, "0");
      assert.ok(have.has(n), `scripts/${f} cites ADR-${m[1]} in shipped text, but docs/decisions/ has no ${n}-*.md`);
    }
  }
});
