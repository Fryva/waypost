import "./env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ambientEnv } from "./env.mjs";
import * as focused from "../scripts/agents-render.mjs";
import * as facade from "../scripts/agents.mjs";

const role = () => ({ name: "fixture", summary: 'Check: "quoted"\nnext', mode: "subagent", tier: "reasoning", effort: "max", access: "read-only", tools: ["read", "grep", "glob", "bash", "web"], body: 'Inspect the code.\nA triple quote: """\n', hash: "abcdef123456" });
function entry(t, spec) {
  const map = facade.registry();
  const id = "waypost-render-test-fixture";
  assert.equal(map.has(id), false);
  const value = { id, source: "fixture.json", roles: { shape: "frontmatter-md", dir: ".fixture", file: "{prefix}{role}.md", ...spec } };
  map.set(id, value);
  t.after(() => map.delete(id));
  return value;
}
function checked(text) {
  const hash = focused.renderHashOf(text);
  assert.ok(hash);
  assert.equal(hash.claimed, hash.actual);
  return text;
}

test("agents render module: four facade bindings are identical and fill stays private", () => {
  for (const key of ["resolveModel", "installedRoleOf", "renderHashOf", "renderFor"]) assert.equal(facade[key], focused[key], key);
  assert.deepEqual(Object.keys(focused).sort(), ["fill", "installedRoleOf", "renderFor", "renderHashOf", "resolveModel"]);
  assert.equal("fill" in facade, false);
  assert.equal(Object.keys(facade).length, 44);
});

test("agents render module: importing both modules does not read the registry", t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "wp-render-lazy-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(new URL("../scripts/agents-render.mjs", import.meta.url).href)});const a=await import(${JSON.stringify(new URL("../scripts/agents.mjs", import.meta.url).href)});try{a.registry();process.exitCode=1;}catch(e){if(!e.message.startsWith("Cannot read the bundled harness registry"))throw e;}`], {
    encoding: "utf8", timeout: 10000,
    env: { ...ambientEnv(), WAYPOST_HOME: root, CLAUDE_PLUGIN_ROOT: "", WAYPOST_PROJECT_DIR: root, CLAUDE_PROJECT_DIR: root },
  });
  assert.equal(child.status, 0, child.stderr);
});

test("agents render module: YAML fields preserve quoting, order, denial and immutable inputs", t => {
  const h = entry(t, { fields: [["description", "{description}"], ["tools", "{tools}"], ["disallowedTools", "{denied_tools}"], ["effort", "{effort}"], ["enabled", "true"], ["empty", "{absent}"]], tools: { style: "claude" }, effort: { map: { max: "high" } } });
  const r = role(); const before = structuredClone(r);
  const text = checked(focused.renderFor(h.id, r, {}));
  const description = String.raw`description: "Check: \"quoted\"\nnext"`;
  assert.ok(text.startsWith(`---\n${description}\ntools: "Read, Grep, Glob, Bash, WebFetch, WebSearch"\ndisallowedTools: "Write, Edit, MultiEdit, NotebookEdit"\neffort: "high"\nenabled: true\n---\n`));
  assert.ok(text.endsWith(r.body));
  assert.deepEqual(r, before);
  assert.deepEqual(focused.installedRoleOf(text), { role: r.name, hash: r.hash, render: focused.renderHashOf(text).actual });
  const drift = focused.renderHashOf(text + "changed\n");
  assert.notEqual(drift.claimed, drift.actual);
  assert.equal(focused.installedRoleOf("foreign prompt"), null);
  assert.equal(focused.renderHashOf("foreign prompt"), null);
});

test("agents render module: tool vocabularies and write denial keep each native shape", t => {
  const h = entry(t, { fields: [["tools", "{tools}"], ["denied", "{denied_tools}"]] });
  const r = role();
  const cases = [
    ["comma", 'tools: "Read, Grep, Glob, Bash, WebFetch, WebSearch"', 'denied: "Write, Edit, MultiEdit, NotebookEdit"'],
    ["yaml-list", "tools:\n  - Read\n  - Grep\n  - Glob\n  - Bash\n  - WebFetch\n  - WebSearch", "denied:\n  - Write\n  - Edit\n  - MultiEdit\n  - NotebookEdit"],
    ["copilot-list", 'tools: ["codebase", "search", "runCommands", "fetch"]', null],
    ["opencode-permission", "tools:\n  edit: deny\n  bash: allow\n  webfetch: allow", null],
    ["opencode-map", "tools:\n  read: true\n  grep: true\n  glob: true\n  bash: true\n  edit: false\n  write: false\n  patch: false\n  webfetch: true", null],
  ];
  for (const [style, tools, denied] of cases) {
    h.roles.tools = { style };
    const text = checked(focused.renderFor(h.id, r, {}));
    assert.ok(text.includes(tools), style);
    if (denied) assert.ok(text.includes(denied), style);
    else assert.equal(text.includes("denied:"), false, style);
  }
  h.roles.tools = { style: "opencode-permission" };
  assert.ok(focused.renderFor(h.id, { ...r, access: "write", tools: [] }, {}).includes("edit: allow\n  bash: allow\n  webfetch: deny"));
  h.roles.tools = { style: "comma" };
  assert.equal(focused.renderFor(h.id, { ...r, access: "write" }, {}).includes("denied:"), false);
  h.roles.tools = { style: "opencode-map" };
  const writable = { ...r, tools: [...r.tools, "edit", "write", "patch"] };
  assert.ok(focused.renderFor(h.id, writable, {}).includes("edit: false\n  write: false\n  patch: false"));
  assert.ok(focused.renderFor(h.id, { ...writable, access: "write" }, {}).includes("edit: true\n  write: true\n  patch: true"));
  h.roles.tools = { style: "unknown" };
  assert.ok(focused.renderFor(h.id, r, {}).startsWith("---\n---\n<!--"));
});

test("agents render module: model precedence and unsupported formats retain policy", t => {
  const h = entry(t, { fields: [["model", "{model}"]], model: { tiers: { reasoning: "tier-model" } } });
  const r = role();
  const cfg = { agents: { default: { model: "default-model" }, per_agent: { fixture: { model: "role-model" } }, per_harness: { [h.id]: { model: "harness-model" } } } };
  assert.equal(focused.resolveModel(r, cfg, h.id), "harness-model");
  delete cfg.agents.per_harness[h.id];
  assert.equal(focused.resolveModel(r, cfg, h.id), "role-model");
  delete cfg.agents.per_agent.fixture;
  assert.equal(focused.resolveModel(r, cfg, h.id), "default-model");
  assert.equal(focused.resolveModel(r, {}, h.id), "tier-model");
  h.roles.model.tiers = {};
  assert.equal(focused.resolveModel(r, cfg, h.id), null);
  cfg.agents.per_harness[h.id] = { model: "explicit-model" };
  assert.ok(checked(focused.renderFor(h.id, r, cfg)).includes('model: "explicit-model"'));
  h.roles.model = false;
  assert.equal(focused.resolveModel(r, cfg, h.id), null);
  assert.equal(focused.renderFor(h.id, r, cfg).includes("model:"), false);
});

test("agents render module: prompt and TOML shapes retain preamble, effort and triple quote escaping", t => {
  const h = entry(t, { shape: "prompt-md", fields: [] });
  const r = role();
  const prompt = checked(focused.renderFor(h.id, r, {}));
  assert.ok(prompt.startsWith("<!--"));
  assert.ok(prompt.includes("This role is READ-ONLY: inspect, verify and report."));
  assert.ok(prompt.includes("Target: $ARGUMENTS"));
  assert.equal(focused.renderFor(h.id, { ...r, access: "write" }, {}).includes("This role is READ-ONLY"), false);
  h.roles.shape = "toml-prompt";
  h.roles.fields = [["description", "{description}"], ["effort", "{effort}"]];
  h.roles.effort = { map: { max: "high" } };
  h.roles.body_key = "developer_instructions";
  for (const shape of ["toml-prompt", "toml"]) {
    h.roles.shape = shape;
    const toml = checked(focused.renderFor(h.id, r, {}));
    assert.ok(toml.includes('effort = "high"'));
    assert.ok(toml.includes('developer_instructions = """\n'));
    assert.ok(toml.includes(String.raw`A triple quote: \"\"\"`));
    assert.equal(toml.split('"""').length - 1, 2);
    assert.ok(toml.endsWith('"""\n'));
  }
  h.roles.preamble = false;
  assert.equal(focused.renderFor(h.id, r, {}).includes("Target: $ARGUMENTS"), false);
});

test("agents render module: aggregate preserves array identity and reports unknown shapes", t => {
  const groups = ["read", "command"];
  const h = entry(t, { shape: "aggregate-json", entry: { slug: "{name}", groups, roleDefinition: "{body}" } });
  const r = role();
  const output = focused.renderFor(h.id, r, {});
  assert.equal(output.groups, groups);
  assert.equal(output.slug, "waypost-fixture");
  assert.equal(h.roles.entry.roleDefinition, "{body}");
  checked(JSON.stringify(output, null, 2));
  h.roles.shape = "unknown";
  assert.throws(() => focused.renderFor(h.id, r, {}), { message: `${h.id}: unknown role shape "unknown" in fixture.json` });
});

test("agents render module: shared fill keeps target paths while role cache remains in facade", t => {
  const h = entry(t, {});
  assert.equal(focused.fill("{prefix}{role}-{missing}-{zero}", { prefix: "wp-", role: "critic", zero: 0 }), "wp-critic--0");
  assert.equal(facade.targetPath(h.id, "critic", join(tmpdir(), "project")), join(tmpdir(), "project", ".fixture", "waypost-critic.md"));
  const r = facade.readRole("critic");
  assert.equal(facade.readRole("critic"), r);
  focused.renderFor(h.id, r, {});
  assert.equal(facade.readRole("critic"), r);
});
