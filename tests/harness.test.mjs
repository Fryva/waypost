// waypost — harness-agnostic surface tests: the agent roles and their per-harness
// adapters (ADR-0003), and the CLI that every harness shares (ADR-0001).
//   node --test tests/*.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { detectHarnesses, detectHarness } from "../scripts/agents.mjs";
import { storedVaultPath, resolveVaultPath } from "../scripts/lib.mjs";
import { listRoles, roleNames, readRole, renderFor, renderHashOf, installedRoleOf,
  harnessIds, providerIds, detectProvider, hasRoleFiles, harness as harnessOf, PREFIX, HARNESSES,
  instructionTargets, skillsOf, CONFIDENCE } from "../scripts/agents.mjs";
import { skillNames, readSkill, validateSkill, DESCRIPTION_MAX, DESCRIPTIONS_TOTAL_MAX } from "../scripts/skills.mjs";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const Waypost = join(REPO, "bin", "waypost");

function project() {
  const proj = mkdtempSync(join(tmpdir(), "waypost-h-"));
  spawnSync("git", ["init", "-q"], { cwd: proj });
  return proj;
}

function waypost(proj, args, { expectFail = false, session = null, env = {} } = {}) {
  const r = spawnSync(process.execPath, [Waypost, ...args], {
    encoding: "utf8", cwd: proj, timeout: 30000,
    env: { ...process.env, WAYPOST_PROJECT_DIR: proj, WAYPOST_HOME: REPO,
      ...(session ? { WAYPOST_SESSION_ID: session } : {}), ...env },
  });
  if (!expectFail) assert.equal(r.status, 0, `${args.join(" ")}\n${r.stderr}${r.stdout}`);
  return r;
}

function bound() {
  const proj = project();
  const vault = join(proj, "vault");
  waypost(proj, ["bind", vault]);
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
  assert.match(opencode, /^permission:$/m, "current OpenCode gates tools with permission, not a tools map");
  assert.match(opencode, /^ {2}edit: deny$/m, "edits are denied where the harness can enforce it");
  assert.match(opencode, /^ {2}bash: allow$/m,
    "bash stays available — these roles need git diff/log, so the shell half of read-only is prose");
  assert.ok(!/^model:/m.test(opencode), "no model is invented for a harness with no tier mapping");

  const codex = renderFor("codex", role, null);
  assert.match(codex, /^sandbox_mode = "read-only"$/m,
    "Codex is the one harness that can enforce read-only outright — say so in its own words");
  assert.match(codex, /^developer_instructions = """$/m, "the role prompt is the agent's system prompt");
  assert.match(codex, /^model_reasoning_effort = "high"$/m,
    "roles.effort.map (P3-5, C-5) translates the role's max into Codex's own high, not a fixed literal");

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

test("a TOML agent file is valid TOML, and the body block is closed exactly once", () => {
  for (const name of roleNames()) {
    const text = renderFor("codex", readRole(name), null);
    for (const line of text.split("\n")) {
      const kv = line.match(/^([a-z_]+) = (.+)$/);
      if (!kv || kv[2] === '"""') continue;
      assert.doesNotThrow(() => JSON.parse(kv[2]), `${name}: ${kv[1]} is not a quoted TOML string`);
    }
    assert.equal((text.match(/^"""$/gm) || []).length, 1,
      "a stray triple quote would truncate the system prompt without any error");
    assert.match(text, /^developer_instructions = """$/m);
  }
});

test("a role naming a tool outside the neutral vocabulary is rejected at read time", () => {
  const dir = mkdtempSync(join(tmpdir(), "waypost-roles-"));
  mkdirSync(join(dir, "agents"), { recursive: true });
  writeFileSync(join(dir, "agents", "bogus.md"),
    "---\nname: bogus\ndescription: x\ntools: [read, telepathy]\n---\nbody\n", "utf8");
  const r = spawnSync(process.execPath, ["-e",
    `import(${JSON.stringify(join(REPO, "scripts", "agents.mjs"))}).then(m => m.readRole("bogus")).catch(e => { console.log(e.message); })`],
    { encoding: "utf8", env: { ...process.env, WAYPOST_HOME: dir } });
  assert.match(r.stdout, /unknown tool\(s\) telepathy/, "the error names the tool and the file");
});

// C-6: a tool root with no bundled harnesses/ at all is a misconfigured
// WAYPOST_HOME, not "this project uses no harnesses" — every agents/harnesses
// command must fail loudly instead of printing an empty table with exit 0.
test("a bare AGENTS.md that is only waypost's own routing block does not conjure a Codex install (E-1)", () => {
  const proj = project();
  mkdirSync(join(proj, ".pi"), { recursive: true });   // a solo-Pi project
  waypost(proj, ["bind", join(proj, "vault")]);
  waypost(proj, ["agents", "register"]);               // pi's block goes into AGENTS.md
  assert.match(readFileSync(join(proj, "AGENTS.md"), "utf8"), /waypost:agents/, "the block landed");
  // codex's marker is AGENTS.md, but that file is now purely our block: not evidence.
  const r = spawnSync(process.execPath, [join(REPO, "scripts", "agents.mjs"), "list"], {
    encoding: "utf8", cwd: proj, env: { ...process.env, WAYPOST_PROJECT_DIR: proj, WAYPOST_HOME: REPO },
  });
  assert.doesNotMatch(r.stdout, /codex/, "codex must not be detected from a file waypost wrote for pi");
  // …and the documented "idempotent" second run must not scatter a .codex/ tree.
  waypost(proj, ["agents", "install"]);
  assert.ok(!existsSync(join(proj, ".codex")), "no unrequested Codex agents on a re-run");
});

test("a real user-written AGENTS.md still detects codex (E-1 does not over-correct)", () => {
  const proj = project();
  writeFileSync(join(proj, "AGENTS.md"), "# My project rules\n\nUse Codex here.\n", "utf8");
  const detected = (() => {
    const prev = process.env.WAYPOST_PROJECT_DIR;
    process.env.WAYPOST_PROJECT_DIR = proj;
    try { return detectHarnesses(proj); } finally {
      if (prev === undefined) delete process.env.WAYPOST_PROJECT_DIR; else process.env.WAYPOST_PROJECT_DIR = prev;
    }
  })();
  assert.ok(detected.includes("codex"), "genuine AGENTS.md content is real evidence");
});

test("detectHarness falls back to env markers, the way commit trailers already did (E-3)", () => {
  assert.equal(detectHarness({ WAYPOST_HARNESS: "grok" }), "grok", "an explicit label wins");
  assert.equal(detectHarness({ CODEX_HOME: "/x" }), "codex", "…else the registry's env markers");
  assert.equal(detectHarness({}), "unknown", "…else unknown, never a guess");
});

test("bin/waypost uses its own tree even when the caller exported another WAYPOST_HOME (O-4)", () => {
  const proj = mkdtempSync(join(tmpdir(), "waypost-o4-"));
  const r = spawnSync(process.execPath, [join(REPO, "bin", "waypost"), "harnesses"], {
    encoding: "utf8", cwd: proj, env: { ...process.env, WAYPOST_PROJECT_DIR: proj, WAYPOST_HOME: "/nonexistent/tool-root" },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /21 harnesses known/, "one invocation, one tree: the dispatcher's own");
});

test("a tool root missing harnesses/ makes `agents list` exit non-zero, naming WAYPOST_HOME", () => {
  const home = mkdtempSync(join(tmpdir(), "waypost-nohar-"));
  mkdirSync(join(home, "agents"), { recursive: true });
  writeFileSync(join(home, "agents", "critic.md"),
    "---\nname: critic\ndescription: x\ntools: []\n---\nbody\n", "utf8");
  const proj = mkdtempSync(join(tmpdir(), "waypost-nohar-proj-"));
  // The script run directly, the way a plugin hook would: bin/waypost always
  // pins WAYPOST_HOME to its own tree, so the misconfiguration cannot reach
  // it through the dispatcher (O-4).
  const r = spawnSync(process.execPath, [join(REPO, "scripts", "agents.mjs"), "list"], {
    encoding: "utf8", cwd: proj, env: { ...process.env, WAYPOST_PROJECT_DIR: proj, WAYPOST_HOME: home },
  });
  assert.notEqual(r.status, 0, "a missing bundled registry must not print an empty table with exit 0");
  assert.match(r.stderr + r.stdout, /WAYPOST_HOME/, "the message names the env var that sets the tool root");
});

test("the harness registry is data, and every entry renders every role", () => {
  const ids = harnessIds();
  assert.ok(ids.length >= 8, `the registry ships a real spread of harnesses, got ${ids.length}`);
  for (const id of ids) {
    const h = harnessOf(id);
    assert.ok(h.detect && h.detect.length, `${id}: declares how it is detected`);
    assert.ok(h.roles && h.roles.shape, `${id}: declares a role shape`);
    // A harness can honestly have no per-role file format — then it must say
    // how a role is reached instead, and nothing is rendered for it.
    if (!hasRoleFiles(id)) {
      assert.ok(h.roles_note && h.invoke,
        `${id} has no role files, so it must say why and how a role is reached`);
      continue;
    }
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

test("a harness with no role-file format installs nothing and is not nagged about", () => {
  const { proj } = bound();
  mkdirSync(join(proj, ".dsh"), { recursive: true });          // detected
  const out = waypost(proj, ["agents", "install", "--harness", "dsh"]).stdout;
  assert.match(out, /no role files/, "install says so instead of writing something meaningless");
  assert.ok(!existsSync(join(proj, ".dsh", "agents")), "…and creates nothing");

  const findings = JSON.parse(waypost(proj, ["doctor", "--install", "--json"]).stdout);
  assert.ok(!findings.some((f) => f.check === "agent-roles" && /dsh/.test(f.message)),
    "doctor must not ask why a harness that cannot hold role files has none");

  // The routing block is how such a harness reaches the roles, so it must be a
  // registration target.
  waypost(proj, ["agents", "register"]);
  assert.match(readFileSync(join(proj, "AGENTS.md"), "utf8"), /waypost:agents/);
});

test("a harness that declares no frontmatter fields gets no empty block", () => {
  const dir = mkdtempSync(join(tmpdir(), "waypost-nofm-"));
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
    `})`], { encoding: "utf8", env: { ...process.env, WAYPOST_HOME: dir } });
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
  assert.equal(detectProvider({ WAYPOST_PROVIDER: "whatever" }), "whatever", "an explicit label wins");
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
    const c = h.confidence || (h.verified ? "verified" : "inferred");
    assert.ok(["verified", "documented", "inferred"].includes(c), `${id}: ${c}`);
    if (c === "documented") {
      assert.ok(h.docs, `${id} claims its format is documented — the entry must name the document`);
    }
    if (c === "inferred") {
      assert.ok(h.notes && h.notes.length > 80,
        `${id} is a guess, so the entry must say what was assumed and what to check`);
    }
  }
  // The compact default answers "what applies here"; --all is the reference,
  // and only the reference pays for the whole table.
  const compact = waypost(project(), ["harnesses"]).stdout;
  assert.ok(compact.split("\n").length < 12, `the default view stays small, got:\n${compact}`);
  assert.match(compact, /harnesses known, \d+ model providers/, "…and says what it is not showing");
  const listed = waypost(project(), ["harnesses", "--all"]).stdout;
  assert.match(listed, /MODEL PROVIDERS/, "the two kinds are shown as two kinds");
  assert.match(listed, /inferred|documented/, "and the confidence of each entry is printed, not hidden");
});

test("a project can add a harness without touching the code", () => {
  const { proj } = bound();
  mkdirSync(join(proj, ".waypost", "harnesses"), { recursive: true });
  mkdirSync(join(proj, ".myagent"), { recursive: true });
  writeFileSync(join(proj, ".waypost", "harnesses", "myagent.json"), JSON.stringify({
    id: "myagent", name: "My Agent", detect: [".myagent"],
    roles: { shape: "prompt-md", dir: ".myagent/roles", file: "{prefix}{role}.md", model: false,
             fields: [["description", "{description}"]] },
  }), "utf8");

  const listed = waypost(proj, ["harnesses"]).stdout;
  assert.match(listed, /myagent/, "the registry picks up a project-local entry");
  waypost(proj, ["agents", "install"]);
  const p = join(proj, ".myagent", "roles", `${PREFIX}critic.md`);
  assert.ok(existsSync(p), "and installs into it, with no code change");
  assert.ok(installedRoleOf(readFileSync(p, "utf8")), "with the same provenance contract");
  waypost(proj, ["agents", "uninstall", "--harness", "myagent"]);
  assert.ok(!existsSync(p));
});

// C-1: a typo'd confidence in a project-local override must not sort ahead of
// every bundled, verified entry — nor break the command.
test("a confidence value CONFIDENCE does not know sorts last, not first", () => {
  const { proj } = bound();
  mkdirSync(join(proj, ".waypost", "harnesses"), { recursive: true });
  writeFileSync(join(proj, ".waypost", "harnesses", "zzztest.json"), JSON.stringify({
    id: "zzztest", name: "ZZZ Test", confidence: "experimental", detect: [".zzztest"],
    roles: { shape: "prompt-md", dir: ".zzztest/roles", file: "{prefix}{role}.md", model: false,
             fields: [["description", "{description}"]] },
  }), "utf8");
  const rows = JSON.parse(waypost(proj, ["harnesses", "--json"]).stdout).harnesses;
  const ids = rows.map((r) => r.id);
  assert.ok(ids.includes("claude") && ids.indexOf("zzztest") > ids.indexOf("claude"),
    `an unrecognised confidence must sort after a bundled verified entry, got: ${ids.join(", ")}`);
  assert.equal(ids[ids.length - 1], "zzztest", "and after every other bundled entry too");
});

test("an aggregate harness merges into its shared file and leaves other entries alone", () => {
  const { proj } = bound();
  waypost(proj, ["agents", "install", "--harness", "roo"]);
  const read = () => JSON.parse(readFileSync(join(proj, ".roomodes"), "utf8"));
  assert.deepEqual(read().customModes.map((m) => m.slug).sort(),
    roleNames().map((n) => PREFIX + n).sort(), "every role became a mode");

  const doc = read();
  doc.customModes.push({ slug: "my-mode", name: "mine", roleDefinition: "hand written" });
  writeFileSync(join(proj, ".roomodes"), JSON.stringify(doc, null, 2), "utf8");
  waypost(proj, ["agents", "install", "--harness", "roo"]);
  assert.ok(read().customModes.some((m) => m.slug === "my-mode"), "a user's own mode survives install");

  waypost(proj, ["agents", "uninstall", "--harness", "roo"]);
  assert.deepEqual(read().customModes.map((m) => m.slug), ["my-mode"],
    "uninstall removes only the modes waypost generated");
});

test("uninstall clears nested empty directories, whatever the file is named", () => {
  const { proj } = bound();
  waypost(proj, ["agents", "install", "--harness", "codex"]);      // .codex/agents/waypost-<role>.toml
  assert.ok(existsSync(join(proj, ".codex", "agents", `${PREFIX}critic.toml`)));
  waypost(proj, ["agents", "uninstall", "--harness", "codex"]);
  assert.ok(!existsSync(join(proj, ".codex")),
    "a directory left behind would make detection resurrect the harness");
});

test("a role whose unit is a directory is installed and uninstalled whole", () => {
  const { proj } = bound();
  // Antigravity's agent is .agents/agents/<name>/agent.md — the file template
  // carries a directory segment, which install has to create and uninstall has
  // to walk into. A flat listing saw the directory, could not read it as text,
  // and left the whole harness behind.
  waypost(proj, ["agents", "install", "--harness", "antigravity"]);
  const p = join(proj, ".agents", "agents", `${PREFIX}critic`, "agent.md");
  assert.ok(existsSync(p), "the per-agent directory is created, not assumed");
  assert.ok(installedRoleOf(readFileSync(p, "utf8")), "with the same provenance contract");

  writeFileSync(join(proj, ".agents", "agents", "mine.md"), "hand written\n", "utf8");
  waypost(proj, ["agents", "uninstall", "--harness", "antigravity"]);
  assert.ok(!existsSync(join(proj, ".agents", "agents", `${PREFIX}critic`)),
    "the agent's own directory goes with its file, or detection resurrects the harness");
  assert.ok(existsSync(join(proj, ".agents", "agents", "mine.md")),
    "…and someone else's agent is still theirs");
});

test("install: idempotent, per-harness, and detected harnesses are the default", () => {
  const { proj } = bound();
  mkdirSync(join(proj, ".opencode"), { recursive: true });

  const first = waypost(proj, ["agents", "install"]).stdout;
  assert.ok(/\.opencode\/agents\/waypost-critic\.md/.test(first), "the harness in use is installed");
  assert.ok(!/\.codex\/prompts/.test(first), "a harness this project does not use is left alone");
  assert.ok(!existsSync(join(proj, ".codex")), "no directory is conjured for an unused harness");

  const second = waypost(proj, ["agents", "install"]).stdout;
  assert.ok(!/created|updated/.test(second), `second install is a no-op:\n${second}`);

  const files = readdirSync(join(proj, ".opencode", "agents"));
  assert.deepEqual(files.sort(), roleNames().map((n) => `${PREFIX}${n}.md`).sort());
});

test("install with no harness detected refuses instead of guessing all three", () => {
  const proj = project();          // bare git repo: no CLAUDE.md, no .opencode, no .codex
  waypost(proj, ["bind", join(proj, "vault")]);
  const r = waypost(proj, ["agents", "install"], { expectFail: true });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /no harness detected/);
  for (const d of [".claude", ".opencode", ".codex"]) {
    assert.ok(!existsSync(join(proj, d)), `${d} must not be conjured — detection is by directory, so a guess becomes permanent`);
  }
  waypost(proj, ["agents", "install", "--harness", "codex"]);
  assert.ok(existsSync(join(proj, ".codex", "agents", `${PREFIX}critic.toml`)), "naming one works");
  assert.ok(!existsSync(join(proj, ".claude")), "and only that one");
});

test("uninstall removes what waypost generated and keeps what it did not", () => {
  const { proj } = bound();
  waypost(proj, ["agents", "install", "--harness", "claude"]);
  const mine = join(proj, ".claude", "agents", `${PREFIX}critic.md`);
  const theirs = join(proj, ".claude", "agents", `${PREFIX}mine.md`);
  writeFileSync(theirs, "---\nname: waypost-mine\n---\nhand written\n", "utf8");

  waypost(proj, ["agents", "uninstall", "--harness", "claude"]);
  assert.ok(!existsSync(mine), "generated role files go");
  assert.equal(readFileSync(theirs, "utf8"), "---\nname: waypost-mine\n---\nhand written\n",
    "a file with no provenance line is not ours to delete");
});

test("a hand-edited role file is stale, and doctor says so as an issue", () => {
  const { proj } = bound();
  waypost(proj, ["agents", "install", "--harness", "claude"]);
  const p = join(proj, ".claude", "agents", `${PREFIX}critic.md`);
  writeFileSync(p, readFileSync(p, "utf8").replace(/@[0-9a-f]{12}/, "@deadbeefcafe"), "utf8");

  const findings = JSON.parse(waypost(proj, ["doctor", "--install", "--json"]).stdout);
  const stale = findings.find((f) => f.check === "agent-roles" && f.level === "issue");
  assert.ok(stale, `expected a stale-role issue, got:\n${JSON.stringify(findings, null, 2)}`);
  assert.match(stale.message, /waypost agents install --harness claude/, "it names the repair");

  waypost(proj, ["doctor", "--fix"]);
  const after = JSON.parse(waypost(proj, ["doctor", "--install", "--json"]).stdout);
  assert.ok(!after.some((f) => f.check === "agent-roles" && f.level === "issue"), "--fix re-renders it");
});

test("agents model: the config pins the model the adapters render", () => {
  const { proj } = bound();
  waypost(proj, ["agents", "model", "default", "sonnet"]);
  waypost(proj, ["agents", "model", "reviewer", "fable"]);
  waypost(proj, ["agents", "install", "--harness", "claude"]);
  const read = (n) => readFileSync(join(proj, ".claude", "agents", `${PREFIX}${n}.md`), "utf8");
  assert.match(read("critic"), /^model: "sonnet"$/m, "the default applies to every role");
  assert.match(read("reviewer"), /^model: "fable"$/m, "a per-role pin wins over the default");
});

test("a harness-blind model pin never reaches a harness whose ids it cannot be valid for", () => {
  const { proj } = bound();
  const out = waypost(proj, ["agents", "model", "default", "sonnet"]).stdout;
  assert.match(out, /applies to: claude\b/, "the CLI says where the pin lands");
  waypost(proj, ["agents", "install", "--harness", "claude,opencode,codex"]);
  const oc = readFileSync(join(proj, ".opencode", "agents", `${PREFIX}critic.md`), "utf8");
  const cx = readFileSync(join(proj, ".codex", "agents", `${PREFIX}critic.toml`), "utf8");
  assert.ok(!/^model:/m.test(oc), "a bare Claude id must not be written where OpenCode wants provider/model");
  assert.ok(!/^model = /m.test(cx), "Codex takes no model from us at all");

  // …and naming one per harness is how you do reach it.
  waypost(proj, ["agents", "model", "harness:opencode", "anthropic/claude-sonnet-4-5"]);
  waypost(proj, ["agents", "install", "--harness", "opencode"]);
  assert.match(readFileSync(join(proj, ".opencode", "agents", `${PREFIX}critic.md`), "utf8"),
    /^model: "anthropic\/claude-sonnet-4-5"$/m);
});

test("changing the model makes installed files stale — the hash covers the render, not just the source", () => {
  const { proj } = bound();
  waypost(proj, ["agents", "install", "--harness", "claude"]);
  let findings = JSON.parse(waypost(proj, ["doctor", "--install", "--json"]).stdout);
  assert.ok(!findings.some((f) => f.check === "agent-roles" && f.level === "issue"), "clean right after install");

  waypost(proj, ["agents", "model", "default", "sonnet"]);
  findings = JSON.parse(waypost(proj, ["doctor", "--install", "--json"]).stdout);
  const stale = findings.find((f) => f.check === "agent-roles" && f.level === "issue");
  assert.ok(stale, "a config change that alters the render must show up as stale");
  assert.match(stale.message, /config or adapter changed/);

  waypost(proj, ["doctor", "--fix"]);
  assert.match(readFileSync(join(proj, ".claude", "agents", `${PREFIX}critic.md`), "utf8"), /^model: "sonnet"$/m);
});

test("install and --fix never overwrite a file waypost did not generate", () => {
  const { proj } = bound();
  const p = join(proj, ".claude", "agents", `${PREFIX}critic.md`);
  mkdirSync(join(proj, ".claude", "agents"), { recursive: true });
  const mine = "---\nname: waypost-critic\ndescription: \"my own critic\"\n---\nhand written, keep me\n";
  writeFileSync(p, mine, "utf8");

  const out = waypost(proj, ["agents", "install", "--harness", "claude"]).stdout;
  assert.match(out, /skipped \(not ours\)/, "install reports the skip rather than doing it silently");
  assert.equal(readFileSync(p, "utf8"), mine, "the user's file survives install");

  const findings = JSON.parse(waypost(proj, ["doctor", "--install", "--json"]).stdout);
  const foreign = findings.find((f) => f.check === "agent-roles-foreign");
  assert.ok(foreign, "doctor reports it under its own check id");
  assert.match(foreign.message, /skip them/);

  waypost(proj, ["doctor", "--fix"]);
  assert.equal(readFileSync(p, "utf8"), mine, "the user's file survives doctor --fix, which is where it used to die");
});

test("a model cannot be pinned for a harness whose files cannot carry one", () => {
  const { proj } = bound();
  // A Cursor rule file has no model field at all — accepting a pin we would
  // then discard is worse than refusing it.
  const r = waypost(proj, ["agents", "model", "harness:cursor", "some/model"], { expectFail: true });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /carry no model/);
  const cfg = JSON.parse(readFileSync(join(proj, ".waypost", "projectstore.json"), "utf8"));
  assert.ok(!(cfg.agents && cfg.agents.per_harness && cfg.agents.per_harness.cursor),
    "and nothing was written to the config");

  // Codex's agent TOML does take `model`, so pinning it is accepted and lands.
  waypost(proj, ["agents", "model", "harness:codex", "gpt-5.4"]);
  waypost(proj, ["agents", "install", "--harness", "codex"]);
  assert.match(readFileSync(join(proj, ".codex", "agents", `${PREFIX}critic.toml`), "utf8"),
    /^model = "gpt-5\.4"$/m);
});

test("uninstall leaves no empty directory for detection to trip over", () => {
  const { proj } = bound();
  waypost(proj, ["agents", "install", "--harness", "all"]);
  waypost(proj, ["agents", "uninstall", "--harness", "all"]);
  for (const d of [".claude", ".opencode", ".codex"]) {
    assert.ok(!existsSync(join(proj, d)),
      `${d} survived uninstall — detection is by directory, so the harness would come back`);
  }
  // …and the repair path must not reinstall behind the user's back either.
  waypost(proj, ["doctor", "--fix"]);
  assert.equal(readdirSync(proj).filter((n) => [".claude", ".opencode", ".codex"].includes(n)).length, 0,
    "doctor --fix put the roles back after an explicit uninstall");
});

test("doctor --fix repairs drift but never installs roles a project has not asked for", () => {
  const { proj } = bound();
  writeFileSync(join(proj, "CLAUDE.md"), "# rules\n", "utf8");   // a harness in use, no roles
  const findings = JSON.parse(waypost(proj, ["doctor", "--install", "--json"]).stdout);
  const info = findings.find((f) => f.check === "agent-roles" && f.level === "info");
  assert.ok(info, "the offer is made as info");

  waypost(proj, ["doctor", "--fix"]);
  assert.ok(!existsSync(join(proj, ".claude", "agents")), "an info-level offer is not a repair");

  // A partially installed set IS drift, and --fix does repair that.
  waypost(proj, ["agents", "install", "--harness", "claude"]);
  rmSync(join(proj, ".claude", "agents", `${PREFIX}critic.md`));
  waypost(proj, ["doctor", "--fix"]);
  assert.ok(existsSync(join(proj, ".claude", "agents", `${PREFIX}critic.md`)), "a missing file is restored");
});

test("a role declaring a vendor model id instead of a tier is rejected", () => {
  const dir = mkdtempSync(join(tmpdir(), "waypost-roles-"));
  mkdirSync(join(dir, "agents"), { recursive: true });
  writeFileSync(join(dir, "agents", "upstreamish.md"),
    "---\nname: upstreamish\ndescription: x\nmodel: opus\ntools: [read]\n---\nbody\n", "utf8");
  const r = spawnSync(process.execPath, ["-e",
    `import(${JSON.stringify(join(REPO, "scripts", "agents.mjs"))}).then(m => m.readRole("upstreamish")).catch(e => console.log(e.message))`],
    { encoding: "utf8", env: { ...process.env, WAYPOST_HOME: dir } });
  assert.match(r.stdout, /not a neutral tier/,
    "an upstream role file must fail loudly, not render with the model silently dropped");
});

test("register writes exactly one routing block and migrates it in place", () => {
  const { proj } = bound();
  writeFileSync(join(proj, "AGENTS.md"), "# Project rules\n\nkeep me\n", "utf8");
  waypost(proj, ["agents", "register"]);
  let text = readFileSync(join(proj, "AGENTS.md"), "utf8");
  assert.equal((text.match(/<!-- waypost:agents v\d+/g) || []).length, 1);
  assert.ok(text.includes("keep me"), "existing instructions survive");
  for (const n of roleNames()) assert.ok(text.includes(`${PREFIX}${n}`), `${n} is routed`);

  waypost(proj, ["agents", "register"]);
  assert.equal((readFileSync(join(proj, "AGENTS.md"), "utf8").match(/<!-- waypost:agents v\d+/g) || []).length, 1,
    "re-registering replaces, never duplicates");

  waypost(proj, ["agents", "unregister"]);
  assert.ok(!/waypost:agents/.test(readFileSync(join(proj, "AGENTS.md"), "utf8")));
});

// Asking what a destructive command does must not be the same thing as running
// it: `agents unregister --help` used to strip the routing block and exit 0,
// because unknown flags were dropped in silence rather than refused.
test("agents unregister: --help and --dry-run report, they do not remove", () => {
  const { proj } = bound();
  const agents = join(proj, "AGENTS.md");
  writeFileSync(agents, "# Project rules\n\nkeep me\n", "utf8");
  waypost(proj, ["agents", "register"]);
  const registered = readFileSync(agents, "utf8");

  const help = waypost(proj, ["agents", "unregister", "--help"]).stdout;
  assert.match(help, /waypost agents <subcommand>/, "--help prints usage");
  assert.equal(readFileSync(agents, "utf8"), registered, "--help left the file untouched");

  const dry = waypost(proj, ["agents", "unregister", "--dry-run"]).stdout;
  assert.match(dry, /would remove\s+AGENTS\.md/, "--dry-run names what it would remove");
  assert.equal(readFileSync(agents, "utf8"), registered, "--dry-run wrote nothing");

  const bad = waypost(proj, ["agents", "unregister", "--wat"], { expectFail: true });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /unknown flag "--wat"/, "an unknown flag is refused, not ignored");
  assert.equal(readFileSync(agents, "utf8"), registered, "the refusal removed nothing");

  waypost(proj, ["agents", "unregister"]);
  assert.ok(!/waypost:agents/.test(readFileSync(agents, "utf8")), "the bare command still removes");
});

test("agents show prints the prompt alone — a harness with no subagents can pipe it", () => {
  const { proj } = bound();
  const out = waypost(proj, ["agents", "show", "critic", "adr/foo.md"]).stdout;
  assert.match(out, /^Target: adr\/foo\.md$/m, "the target is passed through");
  assert.ok(!out.includes("---\nname:"), "no frontmatter — this is a prompt, not a file");
  assert.ok(out.includes(readRole("critic").body.split("\n")[0]));
});

// ─── skills discovery (WP-14) ───────────────────────────────────────────

test("every bundled harness says where it discovers Agent Skills, with evidence", () => {
  let withSkills = 0, shared = 0;
  for (const id of harnessIds()) {
    const s = skillsOf(id);
    if (s === null) {
      assert.ok(String(harnessOf(id).skills_note || "").trim(), `${id}: a harness without skills says why (skills_note)`);
      continue;
    }
    withSkills++;
    assert.match(s.dir, /^\.[\w.-]+\/skills$/, `${id}: dir is a project-level skills directory`);
    assert.ok(s.reads.includes(s.dir), `${id}: reads includes dir`);
    assert.ok(CONFIDENCE.includes(s.confidence), `${id}: confidence`);
    if (s.confidence !== "inferred") assert.match(String(s.docs), /^https?:\/\//, `${id}: ${s.confidence} needs the vendor page`);
    if (s.confidence === "inferred") assert.ok(s.notes, `${id}: inferred says what was assumed`);
    // One copy for every tool that reads the shared directory.
    if (s.reads.includes(".agents/skills")) { shared++; assert.equal(s.dir, ".agents/skills", `${id}: installs into the shared directory it reads`); }
  }
  assert.ok(withSkills >= 20, `${withSkills} harnesses read skills`);
  assert.ok(shared >= 10, `${shared} of them read .agents/skills`);
  // A bad entry is refused loudly, never silently defaulted.
  assert.throws(() => {
    const h = harnessOf("codex");
    const saved = h.skills; h.skills = { dir: ".x/skills", confidence: "documented" };
    try { skillsOf("codex"); } finally { h.skills = saved; }
  }, /documented needs docs/);
});

test("`waypost harnesses` shows the skills directory and --json carries the object", () => {
  const proj = project();
  const out = JSON.parse(waypost(proj, ["harnesses", "--json"]).stdout);
  assert.equal(out.harnesses.find((h) => h.id === "codex").skills.dir, ".agents/skills");
  assert.equal(out.harnesses.find((h) => h.id === "claude").skills.dir, ".claude/skills");
  assert.equal(out.harnesses.find((h) => h.id === "qm").skills, null);
  assert.match(out.harnesses.find((h) => h.id === "qm").skills_note, /deployment directory/);
  const text = waypost(proj, ["harnesses", "--all"]).stdout;
  assert.match(text, /codex\s+documented\s+\.codex\/agents\s+\.agents\/skills/);
  assert.match(text, /qm\s+documented\s+— no role files\s+— no skills/);
});

test("a harness started from inside another is detected by its process, not by the inherited env markers", () => {
  const both = { CLAUDECODE: "1", CLAUDE_CODE_ENTRYPOINT: "cli", OPENCODE: "1" };
  const withProc = (comm) => ({ ...both, WAYPOST_PROC: JSON.stringify({ pid: 1, started: "x", comm }) });
  assert.equal(detectHarness(withProc("opencode")), "opencode", "OpenCode spawned from Claude Code is OpenCode");
  assert.equal(detectHarness(withProc("claude")), "claude");
  assert.equal(detectHarness(withProc("codex")), "codex", "the process alone is enough when env says nothing about it");
  assert.equal(detectHarness(withProc("Electron")), "claude", "an IDE helper says nothing, so env order decides as before");
  assert.equal(detectHarness({ ...withProc("opencode"), WAYPOST_HARNESS: "pi" }), "pi", "an explicit WAYPOST_HARNESS still wins");
});

// ─── Agent Skills (WP-14) ───────────────────────────────────────────────

test("every bundled skill is a valid Agent Skill, and their descriptions fit the standing-context budget", () => {
  const names = skillNames();
  assert.ok(names.length >= 10, `the bundled set: ${names.join(", ")}`);
  for (const n of names) assert.deepEqual(validateSkill(n), [], n);
  const descs = names.map((n) => readSkill(n).description);
  for (const d of descs) assert.ok(d.length <= DESCRIPTION_MAX, `${d.length} chars: ${d.slice(0, 50)}…`);
  const total = descs.join("").length;
  // Loaded at startup by every harness that reads skills, so paid for on every
  // turn (ADR-0008). Characters stand in for tokens, as in the routing-block test.
  assert.ok(total <= DESCRIPTIONS_TOTAL_MAX, `${total} chars of skill descriptions in the standing context`);
});

test("skills install once per shared directory, notice hand edits, and leave foreign files alone", () => {
  const { proj } = bound();
  const out = waypost(proj, ["skills", "install", "--harness", "claude,codex,opencode"]).stdout;
  assert.ok(existsSync(join(proj, ".claude", "skills", "waypost-draft", "SKILL.md")), "claude reads its brand directory");
  assert.ok(existsSync(join(proj, ".agents", "skills", "waypost-draft", "SKILL.md")), "codex and opencode share .agents/skills");
  assert.ok(!existsSync(join(proj, ".codex", "skills")) && !existsSync(join(proj, ".opencode", "skills")), "no brand copy where the shared directory is read");
  assert.equal((out.match(/^created/gm) || []).length, 2 * skillNames().length, "one copy per directory, not per harness");
  assert.ok(!detectHarnesses(proj).includes("antigravity"), "our own skills in .agents/ are not evidence that Antigravity is used");
  mkdirSync(join(proj, ".agents", "agents"), { recursive: true });
  assert.ok(detectHarnesses(proj).includes("antigravity"), "anything else in .agents/ is");
  rmSync(join(proj, ".agents", "agents"), { recursive: true });
  const installed = readFileSync(join(proj, ".agents", "skills", "waypost-draft", "SKILL.md"), "utf8");
  assert.match(installed, /^name: waypost-draft$/m);
  assert.match(installed, /^  waypost-hash: [0-9a-f]{12}$/m, "provenance lives in the standard's metadata map");
  const current = JSON.parse(waypost(proj, ["skills", "list", "--harness", "codex", "--json"]).stdout).targets[0].skills;
  assert.ok(current.every((s) => s.state === "current"), JSON.stringify(current));

  writeFileSync(join(proj, ".agents", "skills", "waypost-draft", "SKILL.md"), installed + "\nlocal note\n", "utf8");
  const foreign = "---\nname: waypost-search\ndescription: mine\n---\n";
  writeFileSync(join(proj, ".agents", "skills", "waypost-search", "SKILL.md"), foreign, "utf8");
  const after = JSON.parse(waypost(proj, ["skills", "list", "--harness", "codex", "--json"]).stdout).targets[0].skills;
  assert.equal(after.find((s) => s.name === "waypost-draft").state, "stale");
  assert.equal(after.find((s) => s.name === "waypost-search").state, "foreign");
  const again = waypost(proj, ["skills", "install", "--harness", "codex"]).stdout;
  assert.match(again, /updated\s+.*waypost-draft/);
  assert.match(again, /skipped \(not ours\)\s+.*waypost-search/);
  assert.equal(readFileSync(join(proj, ".agents", "skills", "waypost-search", "SKILL.md"), "utf8"), foreign, "a foreign file is never overwritten");
  const removed = waypost(proj, ["skills", "uninstall", "--harness", "codex"]).stdout;
  assert.match(removed, /kept \(not ours\)\s+.*waypost-search/);
  assert.ok(!existsSync(join(proj, ".agents", "skills", "waypost-draft")), "ours removed");
  assert.ok(existsSync(join(proj, ".agents", "skills", "waypost-search", "SKILL.md")), "theirs kept");
});

test("doctor reports missing or stale skills for the harnesses in use, and --fix reinstalls", () => {
  const { proj } = bound();
  mkdirSync(join(proj, ".codex"), { recursive: true });
  const before = JSON.parse(waypost(proj, ["doctor", "--json"], { expectFail: true }).stdout);
  const info = before.find((f) => f.check === "agent-skills" && /\.agents\/skills/.test(f.message));
  assert.ok(info && info.level === "info", JSON.stringify(before.filter((f) => f.check === "agent-skills")));
  waypost(proj, ["skills", "install", "--harness", "codex"]);
  const p = join(proj, ".agents", "skills", "waypost-story", "SKILL.md");
  writeFileSync(p, readFileSync(p, "utf8") + "\nedited\n", "utf8");
  const stale = JSON.parse(waypost(proj, ["doctor", "--json"], { expectFail: true }).stdout)
    .find((f) => f.check === "agent-skills" && f.level === "issue");
  assert.ok(stale && /edited by hand/.test(stale.message), JSON.stringify(stale));
  waypost(proj, ["doctor", "--install", "--fix"], { expectFail: true });
  const clean = JSON.parse(waypost(proj, ["doctor", "--json"], { expectFail: true }).stdout);
  assert.ok(!clean.some((f) => f.check === "agent-skills" && f.level === "issue"), "--fix reinstalled it");
});

test("brief installs the skills of the harness it runs in, next to its roles", () => {
  const { proj } = bound();
  const first = waypost(proj, ["brief"], { env: { WAYPOST_HARNESS: "codex" } }).stdout;
  assert.match(first, /installed \d+ skill\(s\) into \.agents\/skills\//);
  assert.ok(existsSync(join(proj, ".agents", "skills", "waypost-commit", "SKILL.md")));
  const second = waypost(proj, ["brief"], { env: { WAYPOST_HARNESS: "codex" } }).stdout;
  assert.doesNotMatch(second, /installed \d+ skill/, "nothing to do the second time");
});

test("`waypost skill` prints a bundled skill by short or full name; setup installs skills for detected harnesses", () => {
  const { proj } = bound();
  assert.match(waypost(proj, ["skill", "decision-detector"]).stdout, /^name: waypost-decision-detector$/m);
  assert.match(waypost(proj, ["skill", "waypost-decision-detector"]).stdout, /^name: waypost-decision-detector$/m);
  assert.match(waypost(proj, ["skill"]).stdout, /waypost-draft/);
  mkdirSync(join(proj, ".opencode"), { recursive: true });
  waypost(proj, ["setup"]);
  assert.ok(existsSync(join(proj, ".agents", "skills", "waypost-draft", "SKILL.md")), "opencode reads .agents/skills");
});

test("doctor: instruction-file hygiene — length is a warning, and Claude gets its bridge to AGENTS.md", () => {
  const { proj } = bound();
  writeFileSync(join(proj, "AGENTS.md"), "# rules\n", "utf8");   // codex's marker, the user's own content
  mkdirSync(join(proj, ".claude"), { recursive: true });         // claude's marker
  waypost(proj, ["agents", "register"]);
  const doctor = () => JSON.parse(waypost(proj, ["doctor", "--install", "--json"], { expectFail: true }).stdout);
  const bridge = doctor().find((f) => f.check === "claude-bridge");
  assert.ok(bridge && bridge.level === "warn", "the block sits in AGENTS.md, which Claude Code does not read");
  waypost(proj, ["doctor", "--install", "--fix"], { expectFail: true });
  assert.match(readFileSync(join(proj, "CLAUDE.md"), "utf8"), /^@AGENTS\.md$/m, "--fix writes the documented bridge");
  assert.ok(!doctor().some((f) => f.check === "claude-bridge"));
  waypost(proj, ["agents", "register"]);
  assert.doesNotMatch(readFileSync(join(proj, "CLAUDE.md"), "utf8"), /waypost:agents/,
    "a CLAUDE.md that imports AGENTS.md is not a second target for the block");

  writeFileSync(join(proj, "AGENTS.md"), readFileSync(join(proj, "AGENTS.md"), "utf8") + "- rule\n".repeat(320), "utf8");
  const size = doctor().find((f) => f.check === "instructions-size");
  assert.ok(size && size.level === "warn" && /AGENTS\.md is \d+ lines/.test(size.message), JSON.stringify(size));

  // No false positive on this repository: .claude/CLAUDE.md is `@AGENTS.md`.
  const here = JSON.parse(waypost(REPO, ["doctor", "--install", "--json"], { expectFail: true }).stdout);
  assert.ok(!here.some((f) => f.check === "claude-bridge" || f.check === "instructions-size"),
    JSON.stringify(here.filter((f) => /claude-bridge|instructions-size/.test(f.check))));
});

// ─── the shared CLI ────────────────────────────────────────────────────

test("bind scaffolds the layout and refuses a silent rebind", () => {
  const { proj, vault } = bound();
  for (const d of ["adr", "specs", "epics", "research", "concepts", "meetings", "ops", "diagrams"]) {
    assert.ok(existsSync(join(vault, d, "README.md")), `${d}/README.md`);
  }
  const cfg = JSON.parse(readFileSync(join(proj, ".waypost", "projectstore.json"), "utf8"));
  assert.equal(cfg.vault_path, "vault", "a vault inside the project is stored relative to it");
  assert.equal(cfg.layout, "engineering");

  const r = waypost(proj, ["bind", join(proj, "other")], { expectFail: true });
  assert.notEqual(r.status, 0, "a rebind elsewhere needs --force");
  assert.match(r.stderr, /--force/);
});

test("bind rejects an unknown layout or language before touching anything", () => {
  const proj = project();
  const bad = waypost(proj, ["bind", join(proj, "v"), "--layout", "nope"], { expectFail: true });
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /unknown layout/);
  assert.ok(!existsSync(join(proj, ".waypost")), "nothing was written");
});

// A-2: a layout typed correctly at `bind` time but later hand-edited (or
// carried over from a machine with a project-local layout this one lacks)
// used to surface as a raw ENOENT from handleScaffold's own readFileSync.
test("scaffold: a hand-edited config with a bad layout gives the clean bind-time message (A-2)", () => {
  const { proj } = bound();
  const cfgPath = join(proj, ".waypost", "projectstore.json");
  const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
  cfg.layout = "nope";
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), "utf8");
  const r = waypost(proj, ["scaffold"], { expectFail: true });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /unknown layout "nope"/);
  assert.doesNotMatch(r.stderr, /ENOENT/, "a bad layout must not surface as a raw filesystem error");
});

test("draft --write creates the artifact and reconciles the derived views", () => {
  const { proj, vault } = bound();
  waypost(proj, ["draft", "adr", "Use Postgres", "--write"]);
  const adr = join(vault, "adr", "use-postgres.md");
  assert.ok(existsSync(adr), "the artifact lands at its slug");
  assert.match(readFileSync(join(vault, "adr", "README.md"), "utf8"), /use-postgres/,
    "the folder index row is regenerated, not hand-patched");

  const again = waypost(proj, ["draft", "adr", "Use Postgres", "--write"], { expectFail: true });
  assert.notEqual(again.status, 0, "creating the same identity twice is refused");

  waypost(proj, ["draft", "epic", "PS-1", "First epic", "--write"]);
  waypost(proj, ["draft", "story", "PS-1", "First story", "--write"]);
  assert.match(readFileSync(join(vault, "kanban.md"), "utf8"), /First story/, "the board picked it up");

  waypost(proj, ["graph"]);
  assert.ok(existsSync(join(vault, "graph.md")));
  waypost(proj, ["codemap"]);
  assert.ok(existsSync(join(vault, "code-map.md")));
});

test("draft without --write previews cheaply, and --json still gives everything", () => {
  const { proj, vault } = bound();
  const preview = waypost(proj, ["draft", "adr", "Only a draft"]).stdout;
  assert.match(preview, /^would create .*adr\/only-a-draft\.md$/m);
  assert.ok(preview.length < 900, `a preview is a decision aid, not a copy of the file:\n${preview}`);
  assert.ok(!preview.includes("## Consequences"),
    "the whole rendered template in a preview is several hundred tokens of what is about to be on disk");

  const out = JSON.parse(waypost(proj, ["draft", "adr", "Only a draft", "--json"]).stdout);
  assert.equal(out.kind, "adr");
  assert.ok(out.content.includes("# Only a draft"), "--json is still the complete payload");
  assert.ok(!existsSync(out.path), "a preview is not a write");
  assert.ok(!existsSync(join(vault, "kanban.md")), "and it reconciles nothing");
});

test("story gates: preview by default, applied with --write", () => {
  const { proj, vault } = bound();
  waypost(proj, ["draft", "epic", "PS-1", "E", "--write"]);
  waypost(proj, ["draft", "story", "PS-1", "S", "--write"]);
  const story = join(vault, "epics", "PS-1", "stories", "story-s.md");

  waypost(proj, ["story", "plan", story]);
  assert.match(readFileSync(story, "utf8"), /status: planned/, "a preview does not stamp the file");

  waypost(proj, ["story", "plan", story, "--write"]);
  const planned = readFileSync(story, "utf8");
  assert.match(planned, /status: in-progress/);
  assert.match(planned, /plan_updated_at: "20/);

  waypost(proj, ["story", "close", story, "--write"]);
  const closed = readFileSync(story, "utf8");
  assert.match(closed, /status: done/);
  assert.match(closed, /closed_at: "20/);
  assert.match(readFileSync(join(vault, "kanban.md"), "utf8"), /## Done\n\n- \[x\]/,
    "closing moves the card, because the board is derived");
});

test("a freshly bound and scaffolded project is clean under doctor", () => {
  const { proj } = bound();
  waypost(proj, ["agents", "install", "--harness", "claude"]);
  waypost(proj, ["agents", "register"]);
  waypost(proj, ["doctor", "--fix"]);
  const findings = JSON.parse(waypost(proj, ["doctor", "--json"]).stdout);
  const issues = findings.filter((f) => f.level === "issue");
  assert.deepEqual(issues, [], `no issues expected:\n${JSON.stringify(issues, null, 2)}`);
});

test("doctor names the missing bind rather than the harness that is missing", () => {
  const proj = project();
  const findings = JSON.parse(waypost(proj, ["doctor", "--json"]).stdout);
  const cfg = findings.find((f) => f.check === "config");
  assert.ok(cfg, "the unbound project is reported");
  assert.match(cfg.message, /\.waypost\/projectstore\.json/);
  assert.ok(!/\.claude/.test(cfg.message), "the canonical path is not Claude's");
});

test("brief is the session-start packet, on demand and without a hook", () => {
  const { proj, vault } = bound();
  waypost(proj, ["draft", "epic", "PS-1", "E", "--write"]);
  waypost(proj, ["draft", "story", "PS-1", "S", "--write"]);
  const out = waypost(proj, ["brief"]).stdout;
  assert.ok(out.includes(vault), "it names the vault it is orienting in");
  assert.match(out, /## Where things live/);
  assert.match(out, /\| `adr\/` \| adr \|/, "folders come from the layout");
  assert.ok(!out.includes("Use Postgres"), "a skeleton carries no artifact content");
});

test("a harness that opens the project for the first time gets its roles from its own first brief", () => {
  const { proj } = bound();
  writeFileSync(join(proj, "CLAUDE.md"), "# house rules\n", "utf8"); // a Claude-only project so far
  const codex = (args) => waypost(proj, args, { env: { WAYPOST_HARNESS: "codex" } });

  const first = codex(["brief"]).stdout;
  assert.match(first, /This session runs in codex/);
  assert.match(first, /installed \d+ role file\(s\) into \.codex\/agents\//);
  assert.match(first, /created the routing block in \.codex\/AGENTS\.md/,
    "no shared AGENTS.md exists, so the block goes to codex's own file rather than creating one on its behalf");
  assert.ok(existsSync(join(proj, ".codex", "agents", `${PREFIX}critic.toml`)));
  assert.match(readFileSync(join(proj, ".codex", "AGENTS.md"), "utf8"), /<!-- waypost:agents/);
  assert.ok(!existsSync(join(proj, "AGENTS.md")), "the project's shared files are left as the user had them");
  assert.equal(readFileSync(join(proj, "CLAUDE.md"), "utf8"), "# house rules\n",
    "only the running harness's own instruction file is touched");
  assert.match(first, /## Where things live/, "and the brief itself still follows");

  const second = codex(["brief"]).stdout;
  assert.doesNotMatch(second, /This session runs in codex/, "nothing to do the second time");

  rmSync(join(proj, ".codex"), { recursive: true });
  const off = codex(["brief", "--no-install"]).stdout;
  assert.ok(!existsSync(join(proj, ".codex")), "--no-install reads only");
  assert.doesNotMatch(off, /This session runs in codex/);

  // Without a brief, the running harness still counts as in use: `next` and
  // `doctor` name its missing roles even though the project shows no codex marker.
  const findings = JSON.parse(codex(["doctor", "--json"]).stdout);
  const f = findings.find((x) => x.check === "agent-roles" && /codex/.test(x.message));
  assert.ok(f, JSON.stringify(findings.filter((x) => x.check === "agent-roles")));
  assert.match(f.message, /waypost agents install --harness codex/);
  assert.match(codex(["next"]).stdout, /agents install/);

  const unknown = waypost(proj, ["brief"], { env: { WAYPOST_HARNESS: "unknown" } });
  assert.doesNotMatch(unknown.stdout, /This session runs in/, "no harness, nothing to install");
});

test("sessions: the registry is reachable by command from any harness", () => {
  const { proj, vault } = bound();
  const touched = waypost(proj, ["sessions", "--touch", "--id", "alpha", "--json"]).stdout;
  assert.match(touched, /"touched": true/);
  const listed = JSON.parse(waypost(proj, ["sessions", "--id", "beta", "--json"]).stdout);
  assert.ok(listed.active.some((s) => s.id === "alpha"), "another session sees it");
  assert.ok(existsSync(join(vault, ".projectstore", "sessions", "alpha.json")));
});

test("unknown commands and unbound vaults fail loudly, never silently", () => {
  const proj = project();
  for (const args of [["nope"], ["draft"], ["scaffold"], ["brief"], ["sessions"]]) {
    const r = waypost(proj, args, { expectFail: true });
    assert.notEqual(r.status, 0, `${args.join(" ")} should exit non-zero`);
  }
});

test("help lists every command the dispatcher actually implements", () => {
  const proj = project();
  const help = waypost(proj, ["help"]).stdout;
  for (const cmd of ["bind", "scaffold", "status", "draft", "story", "kanban", "graph", "codemap",
    "reconcile", "doctor", "diff-refs", "agents", "harnesses", "prompt", "skill", "sessions", "brief"]) {
    assert.ok(help.includes(cmd), `help mentions ${cmd}`);
  }
  assert.ok(help.includes("harnesses"), "help points at the registry rather than enumerating it");
});

test("prompts and skills print, and name no upstream slash command", () => {
  const proj = project();
  const list = waypost(proj, ["prompt"]).stdout;
  assert.match(list, /adr/);
  for (const name of ["adr", "story", "review"]) {
    const text = waypost(proj, ["prompt", name]).stdout;
    assert.ok(!/\/projectstore:/.test(text), `${name} names no upstream slash command`);
    assert.ok(!/CLAUDE_PLUGIN_ROOT/.test(text), `${name} names no Claude plugin path`);
  }
  const skill = waypost(proj, ["skill", "decision-detector"]).stdout;
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
  // different: "(ADR-008)" sends them to docs/vault/adr/ for a file that is not
  // there. Comments are stripped, so this checks the strings that ship.
  const have = new Set(readdirSync(join(REPO, "docs", "decisions"))
    .map((n) => (n.match(/^(\d{4})-/) || [])[1]).filter(Boolean));
  for (const f of readdirSync(join(REPO, "scripts")).filter((n) => n.endsWith(".mjs"))) {
    const code = readFileSync(join(REPO, "scripts", f), "utf8")
      .split("\n").map(stripLineComment).join("\n");
    for (const m of code.matchAll(/ADR-(\d+)/g)) {
      const n = m[1].padStart(4, "0");
      assert.ok(have.has(n), `scripts/${f} cites ADR-${m[1]} in shipped text, but docs/vault/adr/ has no ${n}-*.md`);
    }
  }
});

// ─── token economy ─────────────────────────────────────────────────────
//
// Everything below is a budget, not a style preference. The routing block and
// the role descriptions sit in the context of EVERY turn of every session, and
// `waypost brief` starts every session — so a paragraph added here is paid for
// hundreds of times. Characters stand in for tokens: the ratio is stable enough
// for a ceiling, and it needs no tokenizer.

test("the standing context stays small — it is re-read on every turn", () => {
  const { proj } = bound();
  writeFileSync(join(proj, "CLAUDE.md"), "# rules\n", "utf8");
  waypost(proj, ["agents", "install", "--harness", "claude"]);
  waypost(proj, ["agents", "register"]);

  const block = readFileSync(join(proj, "CLAUDE.md"), "utf8")
    .match(/<!-- waypost:agents[\s\S]*?<!-- \/waypost:agents -->/)[0];
  assert.ok(block.length < 1400, `routing block is ${block.length} chars — it is in every turn`);

  // What a harness injects into the main context is the description of each
  // agent, not its prompt. That is why roles carry a short `summary`.
  const descriptions = roleNames().map((n) =>
    readFileSync(join(proj, ".claude", "agents", `${PREFIX}${n}.md`), "utf8")
      .match(/^description: (.*)$/m)[1]);
  for (const d of descriptions) {
    assert.ok(d.length < 230, `a per-role description of ${d.length} chars is paid for on every turn: ${d}`);
  }
  assert.ok(descriptions.join("").length < 700, "five descriptions, together, stay under ~150 tokens");
});

test("routine commands answer without pasting the vault into the context", () => {
  const { proj } = bound();
  waypost(proj, ["draft", "epic", "PS-1", "Epic", "--write"]);
  for (let i = 0; i < 12; i++) waypost(proj, ["draft", "adr", `Decision number ${i}`, "--write"]);
  waypost(proj, ["graph"]);

  const budgets = [
    [["brief"], 2200, "starts every session"],
    [["status"], 900, "asked whenever orientation is lost"],
    [["doctor"], 2000, "run before finishing work"],
    [["harnesses"], 700, "a lookup, not a reference dump"],
    [["agents", "list"], 900, "same"],
    [["search", "Decision number 7"], 900, "a search returns pointers, not documents"],
  ];
  for (const [args, max, why] of budgets) {
    const out = waypost(proj, args).stdout;
    assert.ok(out.length < max, `\`waypost ${args.join(" ")}\` is ${out.length} chars (budget ${max}) — ${why}`);
  }
});

test("a query beats reading a derived view whole, and the gap widens with the vault", () => {
  const { proj, vault } = bound();
  waypost(proj, ["draft", "epic", "PS-1", "Epic", "--write"]);
  for (let i = 0; i < 12; i++) waypost(proj, ["draft", "adr", `Decision number ${i}`, "--write"]);
  waypost(proj, ["graph"]);

  const whole = readFileSync(join(vault, "graph.md"), "utf8");
  const one = waypost(proj, ["graph", "--for", "adr/decision-number-7.md"]).stdout;
  assert.match(one, /decision-number-7/);
  assert.ok(one.length * 5 < whole.length,
    `one node cost ${one.length} chars against ${whole.length} for the file — at 200 artifacts the file is the whole budget`);

  const missing = waypost(proj, ["graph", "--for", "adr/not-a-node.md"], { expectFail: true });
  assert.notEqual(missing.status, 0, "an unknown node is an error, not an empty answer");
  assert.match(missing.stderr, /vault-relative path/, "…and it says what a node key looks like");
});

// ─── setup and judgement ───────────────────────────────────────────────

test("one command leaves a project ready, and says what it did", () => {
  const proj = project();
  writeFileSync(join(proj, "CLAUDE.md"), "# rules\n", "utf8");   // a harness in use

  const dry = waypost(proj, ["setup", "--dry-run"]).stdout;
  assert.match(dry, /would bind vault/, "a dry run explains itself before touching anything");
  assert.ok(!existsSync(join(proj, ".waypost")), "…and touches nothing");

  const out = waypost(proj, ["setup"]).stdout;
  assert.match(out, /install roles for claude/, "the harness in use is detected, not asked about");
  assert.ok(existsSync(join(proj, ".waypost", "projectstore.json")), "bound");
  assert.ok(existsSync(join(proj, "vault", "adr", "README.md")), "vault scaffolded at a conventional path");
  assert.ok(existsSync(join(proj, ".claude", "agents", `${PREFIX}critic.md`)), "roles installed");
  assert.match(readFileSync(join(proj, "CLAUDE.md"), "utf8"), /waypost:agents/, "roles routed");
  assert.match(readFileSync(join(proj, ".gitignore"), "utf8"), /\.waypost\//, "mechanical findings repaired");

  const again = waypost(proj, ["setup"]).stdout;
  assert.match(again, /already bound/, "running it twice is safe and says so");
});

test("re-binding the same vault keeps the language and layout the project chose", () => {
  const proj = project();
  const read = () => JSON.parse(readFileSync(join(proj, ".waypost", "projectstore.json"), "utf8"));
  waypost(proj, ["bind", join(proj, "vault"), "--lang", "ru"]);
  waypost(proj, ["bind", join(proj, "vault")]);
  assert.equal(read().language, "ru", "a flag not repeated is not a request to reset");
  assert.equal(read().layout, "engineering");
  waypost(proj, ["bind", join(proj, "vault"), "--lang", "en"]);
  assert.equal(read().language, "en", "an explicit flag still changes it");
});

test("the binding follows the checkout: stored relative inside the project, resolved where the tree is mounted", () => {
  const { proj } = bound();
  const stored = () => JSON.parse(readFileSync(join(proj + "-elsewhere", ".waypost", "projectstore.json"), "utf8")).vault_path;
  // The same tree under another path — what a second machine, or another OS,
  // sees of a checkout shared between them (ADR-0007 addendum).
  const moved = proj + "-elsewhere";
  renameSync(proj, moved);
  const st = waypost(moved, ["status"]).stdout;
  assert.ok(st.includes(`vault   ${join(moved, "vault")}`), st);
  assert.doesNotMatch(st, /missing/, "the binding must not point at the old mount");
  assert.equal(waypost(moved, ["doctor", "--install"], { expectFail: true }).stdout.includes("vault_path"), false);
  // Saving the config through the tool keeps the relative form.
  waypost(moved, ["agents", "model", "default", "sonnet"]);
  assert.equal(stored(), "vault", "writeConfig re-relativises what readConfig resolved");
  // A vault outside the project has nothing to be relative to.
  const other = project();
  const away = mkdtempSync(join(tmpdir(), "waypost-away-"));
  waypost(other, ["bind", away]);
  assert.equal(JSON.parse(readFileSync(join(other, ".waypost", "projectstore.json"), "utf8")).vault_path, away);
  // The pure rules, including the vault that IS the project.
  const prev = process.env.WAYPOST_PROJECT_DIR;
  process.env.WAYPOST_PROJECT_DIR = moved;
  try {
    assert.equal(storedVaultPath(moved), ".");
    assert.equal(storedVaultPath(join(moved, "docs", "vault")), "docs/vault");
    assert.equal(storedVaultPath(away), away);
    assert.equal(resolveVaultPath("."), moved);
    assert.equal(resolveVaultPath("docs/vault"), join(moved, "docs", "vault"));
    assert.equal(resolveVaultPath(away), away);
    assert.equal(resolveVaultPath(undefined), undefined, "an unbound config stays unbound");
  } finally {
    if (prev === undefined) delete process.env.WAYPOST_PROJECT_DIR; else process.env.WAYPOST_PROJECT_DIR = prev;
  }
});

test("setup adopts a vault the project already has instead of making a second one", () => {
  const proj = project();
  mkdirSync(join(proj, "docs", "vault", "adr"), { recursive: true });
  waypost(proj, ["setup"]);
  const cfg = JSON.parse(readFileSync(join(proj, ".waypost", "projectstore.json"), "utf8"));
  assert.match(cfg.vault_path, /docs\/vault$/, "an existing vault is found, not duplicated");
});

test("`waypost next` ranks what to do, and `waypost` alone answers the two real questions", () => {
  const proj = project();
  assert.match(waypost(proj, []).stdout, /not set up[\s\S]*waypost setup/,
    "an unconfigured project is told the one command that configures it");

  waypost(proj, ["setup"]);
  waypost(proj, ["draft", "epic", "PS-1", "Epic", "--write"]);
  waypost(proj, ["draft", "story", "PS-1", "Story", "--write"]);
  writeFileSync(join(proj, "vault", "kanban.md"), "hand-broken\n", "utf8");

  const next = waypost(proj, ["next"]).stdout;
  assert.match(next, /kanban\.md is out of sync/, "a real inconsistency is surfaced");
  assert.match(next, /waypost reconcile --write/, "…with the command that fixes it");
  assert.ok(next.length < 900, `next is a decision aid, not a report: ${next.length} chars`);

  waypost(proj, ["reconcile", "--write"]);
  const clean = waypost(proj, ["next"]).stdout;
  assert.ok(!/kanban/.test(clean), "and it stops mentioning what is fixed");
});

test("presence beats on its own, so another device sees this session without being told", () => {
  const proj = project();
  waypost(proj, ["setup"]);
  waypost(proj, ["doctor"], { session: "auto-1" });          // any working command
  const state = JSON.parse(waypost(proj, ["sessions", "--json"], { session: "auto-2" }).stdout);
  assert.ok(state.active.some((s) => s.id === "auto-1"),
    "a session that only ran doctor is still visible to the next device");
});

// ─── --project / --home (P2-8, A-8/A-9) ─────────────────────────────────

test("--project/--home only capture a value when they lead argv, not a token that follows the command", () => {
  const { proj, vault } = bound();
  // `status` ignores its own argv entirely, so this isolates main()'s global
  // flag scan: a trailing "--project somewhere-else" used to be stripped out
  // and silently repointed WAYPOST_PROJECT_DIR (A-8), making an already-bound
  // project report as unbound.
  const r = waypost(proj, ["status", "--project", "somewhere-else"]);
  assert.match(r.stdout, new RegExp(vault.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    "status still reports the real bound vault, not one derived from a trailing token");
});

test("a leading --project expands `~` the same way `bind` does", () => {
  const fakeHome = mkdtempSync(join(tmpdir(), "waypost-home-"));
  const target = join(fakeHome, "proj");
  mkdirSync(target, { recursive: true });
  spawnSync("git", ["init", "-q"], { cwd: target });
  const r = spawnSync(process.execPath, [Waypost, "--project", "~/proj", "bind", join(target, "vault")], {
    encoding: "utf8", env: { ...process.env, WAYPOST_HOME: REPO, HOME: fakeHome },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(target, ".waypost", "projectstore.json")),
    "~ resolved against HOME (A-9), not as a literal two-character path segment");
});

// ── Instruction files found through real use ───────────────────────────
//
// Three defects a downstream project hit while running the contour for real:
// the block never reached a project whose rules live in .claude/CLAUDE.md, it
// was written twice for a harness that already had an instruction file, and the
// duplicate check could not see either copy.

test("register: the block reaches .claude/CLAUDE.md, the layout many projects use", () => {
  const proj = mkdtempSync(join(tmpdir(), "wp-instr-"));
  mkdirSync(join(proj, ".claude"), { recursive: true });
  writeFileSync(join(proj, ".claude", "CLAUDE.md"), "# rules\n\nproject rules live here\n", "utf8");

  const r = spawnSync(process.execPath, [Waypost, "agents", "register"], {
    encoding: "utf8", cwd: proj, env: { ...process.env, WAYPOST_PROJECT_DIR: proj, WAYPOST_HOME: REPO },
  });
  assert.equal(r.status, 0, r.stderr);
  const text = readFileSync(join(proj, ".claude", "CLAUDE.md"), "utf8");
  assert.match(text, /waypost:agents/, "a project keeping rules there used to need a local adapter override");
  assert.match(text, /^# rules$/m, "the existing content is kept");
  assert.ok(!existsSync(join(proj, "CLAUDE.md")), "and no second instruction file is invented at the root");
});

test("register: a harness that already has an instruction file gets no second one", () => {
  const proj = mkdtempSync(join(tmpdir(), "wp-instr2-"));
  mkdirSync(join(proj, ".codex"), { recursive: true });
  writeFileSync(join(proj, "AGENTS.md"), "# agents\n", "utf8");

  spawnSync(process.execPath, [Waypost, "agents", "register"], {
    encoding: "utf8", cwd: proj, env: { ...process.env, WAYPOST_PROJECT_DIR: proj, WAYPOST_HOME: REPO },
  });
  assert.match(readFileSync(join(proj, "AGENTS.md"), "utf8"), /waypost:agents/);
  assert.ok(!existsSync(join(proj, ".codex", "AGENTS.md")),
    "codex declares AGENTS.md and .codex/AGENTS.md; writing both made it read its own routing twice");
});

test("doctor: one block per instruction file is correct, two in one file is not", () => {
  const proj = mkdtempSync(join(tmpdir(), "wp-instr3-"));
  mkdirSync(join(proj, ".claude"), { recursive: true });
  writeFileSync(join(proj, ".claude", "CLAUDE.md"), "# rules\n", "utf8");
  writeFileSync(join(proj, "AGENTS.md"), "# agents\n", "utf8");
  const run = (args) => spawnSync(process.execPath, [Waypost, ...args], {
    encoding: "utf8", cwd: proj, env: { ...process.env, WAYPOST_PROJECT_DIR: proj, WAYPOST_HOME: REPO },
  });
  run(["bind", join(proj, "vault")]); // install checks need a bound vault to run
  run(["agents", "register"]);

  const clean = JSON.parse(run(["doctor", "--install", "--json"]).stdout);
  assert.ok(!clean.some((f) => f.check === "agents-block"),
    "two files each holding one block is the normal shape — every harness reads its own");

  const p = join(proj, "AGENTS.md");
  writeFileSync(p, readFileSync(p, "utf8") + readFileSync(p, "utf8"), "utf8");
  const dirty = JSON.parse(run(["doctor", "--install", "--json"]).stdout);
  const dup = dirty.find((f) => f.check === "agents-block");
  assert.ok(dup, "two blocks in one file is what register cannot produce, so it is a defect");
  assert.match(dup.message, /in AGENTS\.md/);
});

test("register: a harness documented not to read AGENTS.md still gets its own file", () => {
  // windsurf/cline/trae/lingma/roo carry instructions_shared_ok: false because
  // their own notes say AGENTS.md support is undocumented. A rule that stopped at
  // "a shared file exists, so we are done" silently removed their integration.
  for (const [dir, own] of [
    [".windsurf", ".windsurf/rules/waypost-agents.md"],
    [".clinerules", ".clinerules/waypost-agents.md"],
    [".trae", ".trae/rules/project_rules.md"],
  ]) {
    const proj = mkdtempSync(join(tmpdir(), "wp-shared-"));
    mkdirSync(join(proj, dir), { recursive: true });
    writeFileSync(join(proj, "AGENTS.md"), "# agents\n", "utf8");
    spawnSync(process.execPath, [Waypost, "agents", "register"], {
      encoding: "utf8", cwd: proj, env: { ...process.env, WAYPOST_PROJECT_DIR: proj, WAYPOST_HOME: REPO },
    });
    assert.match(readFileSync(join(proj, own), "utf8"), /waypost:agents/,
      `${own} must carry the block even though AGENTS.md exists`);
  }
});

test("register: a harness that does read the shared file gets one target, not two", () => {
  const proj = mkdtempSync(join(tmpdir(), "wp-shared2-"));
  mkdirSync(join(proj, ".codex"), { recursive: true });
  mkdirSync(join(proj, ".claude"), { recursive: true });
  writeFileSync(join(proj, "AGENTS.md"), "# agents\n", "utf8");
  spawnSync(process.execPath, [Waypost, "agents", "register"], {
    encoding: "utf8", cwd: proj, env: { ...process.env, WAYPOST_PROJECT_DIR: proj, WAYPOST_HOME: REPO },
  });
  assert.match(readFileSync(join(proj, "AGENTS.md"), "utf8"), /waypost:agents/);
  assert.ok(!existsSync(join(proj, ".codex", "AGENTS.md")), "codex reads AGENTS.md; a second copy is read twice");
  assert.ok(!existsSync(join(proj, ".claude", "CLAUDE.md")), "so does Claude Code");
});

test("register: an existing .claude/CLAUDE.md is preferred over inventing one", () => {
  const proj = mkdtempSync(join(tmpdir(), "wp-shared3-"));
  mkdirSync(join(proj, ".claude"), { recursive: true });
  writeFileSync(join(proj, ".claude", "CLAUDE.md"), "# rules\n", "utf8");
  spawnSync(process.execPath, [Waypost, "agents", "register"], {
    encoding: "utf8", cwd: proj, env: { ...process.env, WAYPOST_PROJECT_DIR: proj, WAYPOST_HOME: REPO },
  });
  assert.match(readFileSync(join(proj, ".claude", "CLAUDE.md"), "utf8"), /waypost:agents/);
  assert.ok(!existsSync(join(proj, "CLAUDE.md")));
});

// G-1: this repository's own layout — .claude/CLAUDE.md is the one line
// `@AGENTS.md` — used to get the routing block written into BOTH files, so
// Claude Code read it twice (once through the import, once directly).
test("instructionTargets: an own file that @-imports AGENTS.md is not itself a target", () => {
  const proj = mkdtempSync(join(tmpdir(), "wp-shared4-"));
  mkdirSync(join(proj, ".claude"), { recursive: true });
  writeFileSync(join(proj, "AGENTS.md"), "# agents\n", "utf8");
  writeFileSync(join(proj, ".claude", "CLAUDE.md"), "@AGENTS.md\n", "utf8");
  assert.deepEqual(instructionTargets(proj), ["AGENTS.md"],
    "the import already reaches Claude Code; a second copy is twice the standing context");
});

test("instructionTargets: an own file with no import keeps today's behaviour (both targets)", () => {
  const proj = mkdtempSync(join(tmpdir(), "wp-shared5-"));
  mkdirSync(join(proj, ".claude"), { recursive: true });
  writeFileSync(join(proj, "AGENTS.md"), "# agents\n", "utf8");
  writeFileSync(join(proj, ".claude", "CLAUDE.md"), "# project-specific rules, no import\n", "utf8");
  const targets = instructionTargets(proj);
  assert.ok(targets.includes("AGENTS.md"));
  assert.ok(targets.includes(".claude/CLAUDE.md"),
    "with no import, .claude/CLAUDE.md must still get the block — Claude Code has no other way to see it");
});
