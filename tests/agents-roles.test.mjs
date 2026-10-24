import "./env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { ambientEnv } from "./env.mjs";
import * as focused from "../scripts/agents-roles.mjs";
import * as facade from "../scripts/agents.mjs";

const raw = (name, body = `body-${name}\n`) => `---\nname: ${name}\ndescription: First sentence. Second sentence.\nmodel: balanced\ntools: [read, bash]\n---\n\n${body}`;
function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "wp-role-lifecycle-")));
  const tool = join(root, "tool"), proj = join(root, "project");
  const keys = ["WAYPOST_HOME", "CLAUDE_PLUGIN_ROOT", "WAYPOST_PROJECT_DIR", "CLAUDE_PROJECT_DIR"];
  const before = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  t.after(() => {
    for (const k of keys) if (before[k] === undefined) delete process.env[k]; else process.env[k] = before[k];
    rmSync(root, { recursive: true, force: true });
  });
  process.env.WAYPOST_HOME = tool;
  process.env.CLAUDE_PLUGIN_ROOT = "";
  process.env.WAYPOST_PROJECT_DIR = proj;
  process.env.CLAUDE_PROJECT_DIR = proj;
  const put = (rel, value) => {
    const p = join(root, rel); mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, typeof value === "string" ? value : JSON.stringify(value)); return p;
  };
  mkdirSync(proj);
  put("tool/agents/a.md", raw("a")); put("tool/agents/z.md", raw("z"));
  put("tool/scaffold/layouts/engineering.json", { agents: ["a", "z"] });
  put("tool/harnesses/flat.json", { id: "flat", roles: { shape: "frontmatter-md", dir: ".flat/agents", file: "{prefix}{role}.md", fields: [["description", "{description}"], ["model", "{model}"]], model: { tiers: { balanced: "fixture-model" } } }, skills: { dir: ".agents/skills", reads: [".agents/skills"], notes: "Fixture assumption" }, instructions: ["AGENTS.md", ".flat/AGENTS.md"] });
  put("tool/harnesses/nested.json", { id: "nested", roles: { shape: "frontmatter-md", dir: ".nested/agents", file: "{prefix}{role}/agent.md", fields: [] } });
  put("tool/harnesses/agg.json", { id: "agg", roles: { shape: "aggregate-json", file: ".modes.json", array: "customModes", key: "slug", entry: { slug: "{name}", roleDefinition: "{body}", groups: ["read"] } } });
  put("tool/harnesses/none.json", { id: "none", roles: { shape: "none" }, roles_note: "Fixture has no files" });
  return { root, tool, proj, put };
}

test("agents roles module: fifteen bindings preserve identity and the facade stays compatible", () => {
  const names = ["rolesDir", "roleNames", "readRole", "listRoles", "skillsOf", "rosterFor", "harnessesNamingModels", "targetDir", "harnessOwnedPaths", "targetPath", "isAggregate", "hasRoleFiles", "install", "uninstall", "status"];
  for (const name of names) assert.equal(focused[name], facade[name], name);
  assert.deepEqual(Object.keys(focused).sort(), names.sort());
  assert.equal(Object.keys(facade).length, 44);
});

test("agents roles module: import is lazy and missing role directories fail only on use", t => {
  const { root } = fixture(t);
  const missing = join(root, "missing");
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(new URL("../scripts/agents-roles.mjs", import.meta.url).href)});const a=await import(${JSON.stringify(new URL("../scripts/agents.mjs", import.meta.url).href)});try{a.roleNames();process.exitCode=1;}catch(e){if(!e.message.startsWith("Cannot read the bundled role directory"))throw e;}`], { encoding: "utf8", timeout: 10000, env: { ...ambientEnv(), WAYPOST_HOME: missing, CLAUDE_PLUGIN_ROOT: "", WAYPOST_PROJECT_DIR: root, CLAUDE_PROJECT_DIR: root } });
  assert.equal(child.status, 0, child.stderr);
  assert.throws(() => focused.readRole("missing"), /No such role: missing/);
});

test("agents roles module: one cache shares mutable objects and keys only path, mtime and size", t => {
  const { put, tool } = fixture(t);
  const p = join(tool, "agents/a.md"), original = raw("a");
  utimesSync(p, 2000000000, 2000000000);
  const first = facade.readRole("a");
  assert.equal(focused.readRole("a"), first);
  first.tools.push("web");
  assert.equal(focused.readRole("a").tools.at(-1), "web");
  put("tool/agents/a.md", original.replace("body-a", "othera"));
  utimesSync(p, 2000000000, 2000000000);
  assert.equal(focused.readRole("a"), first); // Same metadata intentionally remains a hit.
  put("tool/agents/a.md", raw("a", "Longer body\n"));
  utimesSync(p, 2000000001, 2000000001);
  const second = focused.readRole("a");
  assert.notEqual(second, first); assert.equal(second.body, "Longer body\n");
  put("tool/agents/a.md", original); utimesSync(p, 2000000000, 2000000000);
  assert.equal(focused.readRole("a"), first); // Old cache entries are retained.
});

test("agents roles module: parsing defaults, hashes, closed vocabularies and roster fallback stay intact", t => {
  const { tool, put } = fixture(t);
  const r = focused.readRole("a");
  assert.equal(r.summary, "First sentence."); assert.equal(r.mode, "subagent");
  assert.equal(r.access, "read-only"); assert.equal(r.effort, null);
  assert.deepEqual(r.tools, ["read", "bash"]);
  assert.equal(r.hash, createHash("sha256").update(raw("a")).digest("hex").slice(0, 12));
  assert.deepEqual(focused.roleNames(), ["a", "z"]);
  assert.equal(focused.listRoles()[0], r);
  put("tool/agents/bad.md", raw("bad").replace("[read, bash]", "[read, forbidden]"));
  assert.throws(() => focused.readRole("bad"), { message: `${join(tool, "agents/bad.md")}: unknown tool(s) forbidden — the neutral vocabulary is read, grep, glob, bash, edit, write, web` });
  put("tool/agents/bad.md", raw("bad").replace("model: balanced", "model: vendor-model"));
  assert.throws(() => focused.readRole("bad"), /model: vendor-model is not a neutral tier/);
  rmSync(join(tool, "agents/bad.md"));
  put("tool/scaffold/layouts/custom.json", { agents: ["z", "missing", "a", "z"] });
  assert.deepEqual(focused.rosterFor({ layout: "custom" }), ["z", "a", "z"]);
  put("tool/scaffold/layouts/custom.json", { agents: [] });
  assert.deepEqual(focused.rosterFor({ layout: "custom" }), []);
  put("tool/scaffold/layouts/custom.json", "{");
  assert.deepEqual(focused.rosterFor({ layout: "custom" }), ["a", "z"]);
  assert.deepEqual(focused.rosterFor({ layout: "missing" }), ["a", "z"]);
});

test("agents roles module: skills metadata keeps array identity and paths remain registry-driven", t => {
  const { proj } = fixture(t); const h = facade.harness("flat");
  const skills = focused.skillsOf("flat");
  assert.equal(skills.reads, h.skills.reads); assert.equal(skills.confidence, "inferred");
  assert.equal(focused.skillsOf("none"), null);
  assert.deepEqual(focused.harnessesNamingModels(), ["flat"]);
  assert.equal(focused.targetDir("flat"), join(proj, ".flat/agents"));
  assert.equal(focused.targetPath("nested", "a"), join(proj, ".nested/agents/waypost-a/agent.md"));
  assert.equal(focused.targetPath("agg", "a"), join(proj, ".modes.json"));
  assert.equal(focused.isAggregate("agg"), true); assert.equal(focused.hasRoleFiles("none"), false);
  assert.ok(focused.harnessOwnedPaths().includes(".flat/AGENTS.md"));
  assert.equal(focused.harnessOwnedPaths().includes("AGENTS.md"), false);
  h.skills.confidence = "documented";
  assert.throws(() => focused.skillsOf("flat"), /documented needs docs/);
});

test("agents roles module: flat lifecycle preserves state reasons, repairs and user neighbors", t => {
  const { proj, put } = fixture(t); const opts = { proj, cfg: {} };
  assert.deepEqual(focused.status({ ...opts, ids: ["flat"] })[0].roles.map(r => r.state), ["absent", "absent"]);
  assert.deepEqual(focused.install(["flat"], opts).map(r => r.action), ["created", "created"]);
  assert.deepEqual(focused.install(["flat"], opts).map(r => r.action), ["unchanged", "unchanged"]);
  const states = cfg => focused.status({ proj, cfg, ids: ["flat"] })[0].roles;
  assert.deepEqual(states({}).map(r => [r.state, r.reason]), [["current", null], ["current", null]]);
  const p = focused.targetPath("flat", "z", proj);
  writeFileSync(p, readFileSync(p, "utf8") + "Manual drift\n");
  assert.equal(states({})[1].reason, "edited by hand");
  assert.equal(states({ agents: { per_harness: { flat: { model: "other-model" } } } })[0].reason, "source, config or adapter changed");
  assert.deepEqual(focused.install(["flat"], opts).map(r => r.action), ["unchanged", "updated"]);
  put("project/.flat/user.txt", "Keep this\n");
  focused.uninstall(["flat"], { proj });
  assert.equal(existsSync(join(proj, ".flat/agents")), false);
  assert.equal(readFileSync(join(proj, ".flat/user.txt"), "utf8"), "Keep this\n");
});

test("agents roles module: foreign roles survive nested install and provenance-only uninstall", t => {
  const { proj, put } = fixture(t);
  const p = put("project/.nested/agents/waypost-a/agent.md", "User role\n");
  put("project/.nested/agents/waypost-z/user.txt", "Neighbor\n");
  assert.deepEqual(focused.install(["nested"], { proj, cfg: {} }).map(r => r.action), ["skipped (not ours)", "created"]);
  assert.deepEqual(focused.status({ proj, cfg: {}, ids: ["nested"] })[0].roles.map(r => r.state), ["foreign", "current"]);
  focused.uninstall(["nested"], { proj });
  assert.equal(readFileSync(p, "utf8"), "User role\n");
  assert.equal(readFileSync(join(proj, ".nested/agents/waypost-z/user.txt"), "utf8"), "Neighbor\n");
  assert.equal(existsSync(focused.targetPath("nested", "z", proj)), false);
});

test("agents roles module: aggregate merge preserves foreign collisions, user modes and metadata", t => {
  const { proj, put } = fixture(t);
  const original = { metadata: "keep", customModes: [{ slug: "user-mode", roleDefinition: "User prompt" }, { slug: "waypost-a", roleDefinition: "Foreign collision" }] };
  const p = put("project/.modes.json", original);
  assert.deepEqual(focused.install(["agg"], { proj, cfg: {} }).map(r => r.action), ["skipped (not ours)", "created"]);
  assert.equal(JSON.parse(readFileSync(p, "utf8")).customModes.length, 3);
  focused.uninstall(["agg"], { proj });
  assert.deepEqual(JSON.parse(readFileSync(p, "utf8")), original);
  rmSync(p);
  focused.install(["agg"], { proj, cfg: {} }); focused.uninstall(["agg"], { proj });
  assert.equal(existsSync(p), false);
});

test("agents roles module: malformed aggregate reports absent but refuses destructive lifecycle writes", t => {
  const { proj, put } = fixture(t); const p = put("project/.modes.json", "{");
  assert.deepEqual(focused.status({ proj, cfg: {}, ids: ["agg"] })[0].roles.map(r => r.state), ["absent", "absent"]);
  assert.throws(() => focused.install(["agg"], { proj, cfg: {} }), /not valid JSON.*will not overwrite/);
  assert.throws(() => focused.uninstall(["agg"], { proj }), /not valid JSON.*will not overwrite/);
  assert.equal(readFileSync(p, "utf8"), "{");
});

test("agents roles module: absent, foreign and n-a status do not parse invalid role bodies", t => {
  const { proj, put } = fixture(t);
  put("tool/agents/a.md", raw("a").replace("[read, bash]", "[forbidden]"));
  assert.throws(() => focused.readRole("a"), /unknown tool/);
  assert.equal(focused.status({ proj, cfg: {}, ids: ["flat"] })[0].roles[0].state, "absent");
  put("project/.flat/agents/waypost-a.md", "Foreign role\n");
  assert.equal(focused.status({ proj, cfg: {}, ids: ["flat"] })[0].roles[0].state, "foreign");
  assert.deepEqual(focused.status({ proj, cfg: {}, ids: ["none"] })[0].roles.map(r => r.state), ["n/a", "n/a"]);
  assert.equal(focused.install(["none"], { proj, cfg: {} })[0].action, "no role files");
});
