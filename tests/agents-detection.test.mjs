import "./env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { ambientEnv } from "./env.mjs";
import * as focused from "../scripts/agents-detection.mjs";
import * as facade from "../scripts/agents.mjs";

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "wp-detection-module-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (rel, value) => {
    const p = join(root, rel);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, typeof value === "string" ? value : JSON.stringify(value));
    return p;
  };
  return { root, put };
}
function gateFixture(t) {
  const f = fixture(t);
  f.put("shipped/a.json", { id: "alpha", process: ["alpha"], env: ["ALPHA"] });
  f.put("shipped/b.json", { id: "beta", process: ["beta"], env: ["BETA"] });
  f.put("shipped/p.json", { id: "vendor", kind: "provider", process: ["vendor"], env: ["VENDOR"] });
  f.put("local/a.json", { id: "alpha", kind: "provider", process: ["weakened"], env: ["EXTRA"] });
  f.put("local/bad.json", "{");
  f.dirs = [join(f.root, "shipped"), join(f.root, "local")];
  return f;
}
const block = "<!-- waypost:agents v3 -->\nGenerated only\n<!-- /waypost:agents -->\n";

test("agents detection module: four facade bindings retain identity and private regexp stays private", () => {
  for (const key of ["detectHarnesses", "detectHarness", "installHarnesses", "gateCheck"]) assert.equal(facade[key], focused[key], key);
  assert.deepEqual(Object.keys(focused).sort(), ["BLOCK_RE", "detectHarness", "detectHarnesses", "gateCheck", "installHarnesses"]);
  assert.equal("BLOCK_RE" in facade, false);
  assert.equal(Object.keys(facade).length, 44);
});

test("agents detection module: imports stay lazy even with no bundled registry", t => {
  const { root } = fixture(t);
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(new URL("../scripts/agents-detection.mjs", import.meta.url).href)});const a=await import(${JSON.stringify(new URL("../scripts/agents.mjs", import.meta.url).href)});try{a.registry();process.exitCode=1;}catch(e){if(!e.message.startsWith("Cannot read the bundled harness registry"))throw e;}`], {
    encoding: "utf8", timeout: 10000,
    env: { ...ambientEnv(), WAYPOST_HOME: root, CLAUDE_PLUGIN_ROOT: "", WAYPOST_PROJECT_DIR: root, CLAUDE_PROJECT_DIR: root },
  });
  assert.equal(child.status, 0, child.stderr);
});

test("agents detection module: marker detection ignores generated-only files and own shared skills", t => {
  const { root, put } = fixture(t);
  assert.deepEqual(focused.detectHarnesses(root), []);
  put("AGENTS.md", block);
  assert.deepEqual(focused.detectHarnesses(root), []);
  put("AGENTS.md", "User instructions\n" + block);
  assert.deepEqual(focused.detectHarnesses(root), ["codex"]);
  put("AGENTS.md", "  \n");
  mkdirSync(join(root, ".agents", "skills", "waypost-test"), { recursive: true });
  put(".agents/.hidden", "ignored");
  assert.deepEqual(focused.detectHarnesses(root), []);
  mkdirSync(join(root, ".agents", "skills", "user-skill"));
  assert.deepEqual(focused.detectHarnesses(root), ["antigravity"]);
  rmSync(join(root, ".agents"), { recursive: true });
  mkdirSync(join(root, ".agents"));
  assert.deepEqual(focused.detectHarnesses(root), ["antigravity"]);
});

test("agents detection module: attribution preserves explicit, process, argv0 and env precedence", t => {
  assert.equal(focused.detectHarness({ WAYPOST_HARNESS: "custom-label", CLAUDECODE: "1" }), "custom-label");
  assert.equal(focused.detectHarness({ WAYPOST_PROC: '{"comm":"codex"}', CLAUDECODE: "1" }), "codex");
  assert.equal(focused.detectHarness({ WAYPOST_PROC: '{"comm":"renamed","argv0":"opencode"}', CLAUDECODE: "1" }), "opencode");
  assert.equal(focused.detectHarness({ WAYPOST_PROC: "{", CLAUDECODE: "1" }), "claude");
  assert.equal(focused.detectHarness({}), "unknown");
  const previous = process.env.WAYPOST_PROC;
  delete process.env.WAYPOST_PROC;
  t.after(() => { if (previous === undefined) delete process.env.WAYPOST_PROC; else process.env.WAYPOST_PROC = previous; });
  const table = new Map([[10, { pid: 10, ppid: 11, comm: "codex" }], [11, { pid: 11, ppid: 1, comm: "claude" }]]);
  assert.equal(focused.detectHarness({ CLAUDECODE: "1" }, { table, ppid: 10 }), "codex");
  const registry = facade.registry(); const id = "detection-test-provider";
  assert.equal(registry.has(id), false);
  registry.set(id, { id, kind: "provider", env: ["DETECTION_TEST_PROVIDER"], process: ["testvendor"] });
  t.after(() => registry.delete(id));
  assert.equal(focused.detectHarness({ WAYPOST_PROC: '{"comm":"testvendor"}' }), "unknown");
  // Attribution's env loop includes provider entries; consent deliberately does not.
  assert.equal(focused.detectHarness({ DETECTION_TEST_PROVIDER: "1" }), id);
});

test("agents detection module: install adds only a known running harness without changing marker detection", t => {
  const { root } = fixture(t);
  mkdirSync(join(root, ".pi"));
  const previous = process.env.WAYPOST_HARNESS;
  t.after(() => { if (previous === undefined) delete process.env.WAYPOST_HARNESS; else process.env.WAYPOST_HARNESS = previous; });
  process.env.WAYPOST_HARNESS = "codex";
  assert.deepEqual(focused.installHarnesses(root), ["pi", "codex"]);
  assert.deepEqual(focused.detectHarnesses(root), ["pi"]);
  process.env.WAYPOST_HARNESS = "unknown";
  assert.deepEqual(focused.installHarnesses(root), ["pi"]);
  process.env.WAYPOST_HARNESS = "pi";
  assert.deepEqual(focused.installHarnesses(root), ["pi"]);
});

test("agents detection module: gate rereads additive evidence and ignores labels and providers", t => {
  const { dirs, put } = gateFixture(t);
  const result = focused.gateCheck({ dirs, env: { ALPHA: "1", EXTRA: "1", VENDOR: "1" }, table: null });
  assert.deepEqual(result, { harness: "alpha", via: "env", evidence: true, process_table: false, ancestors: [], markers: [{ harness: "alpha", var: "ALPHA" }, { harness: "alpha", var: "EXTRA" }] });
  assert.equal(focused.gateCheck({ dirs, env: { WAYPOST_HARNESS: "alpha", WAYPOST_PROC: '{"comm":"alpha"}', VENDOR: "1" }, table: null }).evidence, false);
  assert.equal(focused.gateCheck({ dirs, env: { LATER: "1" }, table: null }).evidence, false);
  put("local/a.json", { id: "alpha", env: ["LATER"] });
  assert.equal(focused.gateCheck({ dirs, env: { LATER: "1" }, table: null }).harness, "alpha");
});

test("agents detection module: gate keeps process authority, closest ancestor and argv0 matching", t => {
  const { dirs } = gateFixture(t);
  const table = new Map([[10, { pid: 10, ppid: 11, comm: "node" }], [11, { pid: 11, ppid: 12, comm: "/Applications/Alpha/alpha" }], [12, { pid: 12, ppid: 1, comm: "beta" }]]);
  const result = focused.gateCheck({ dirs, table, ppid: 10, env: { BETA: "1" } });
  assert.equal(result.harness, "alpha"); assert.equal(result.via, "process");
  assert.deepEqual(result.ancestors.map(p => p.pid), [10, 11, 12]);
  table.set(10, { pid: 10, ppid: 11, comm: "renamed", argv0: "alpha" });
  assert.equal(focused.gateCheck({ dirs, table, ppid: 10, env: {} }).ancestors[0].argv0, "alpha");
  table.set(10, { pid: 10, ppid: 1, comm: "weakened" });
  assert.equal(focused.gateCheck({ dirs, table, ppid: 10, env: {} }).evidence, false);
  assert.equal(focused.gateCheck({ dirs, table: new Map(), env: {} }).process_table, true);
});

test("agents detection module: gate caps cycles and ancestor depth at 128 and preserves directory errors", t => {
  const { root, dirs, put } = gateFixture(t);
  const table = new Map(Array.from({ length: 130 }, (_, i) => [i + 2, { pid: i + 2, ppid: i + 3, comm: i === 127 ? "alpha" : "node" }]));
  const call = () => focused.gateCheck({ dirs, table, ppid: 2, env: {} });
  assert.equal(call().harness, "alpha"); assert.equal(call().ancestors.length, 128);
  table.get(129).comm = "node"; table.get(130).comm = "alpha";
  assert.equal(call().evidence, false);
  const cycle = focused.gateCheck({ dirs, table: new Map([[7, { pid: 7, ppid: 7, comm: "node" }]]), ppid: 7, env: {} });
  assert.equal(cycle.ancestors.length, 128); assert.equal(cycle.evidence, false);
  for (const invalid of [undefined, []]) assert.throws(() => focused.gateCheck({ dirs: invalid, table: null, env: {} }), { message: "gateCheck: dirs is required" });
  assert.throws(() => focused.gateCheck({ dirs: [join(root, "missing")], table: null, env: {} }), /gateCheck: cannot read the shipped harness registry at/);
  put("not-dir", "file");
  assert.equal(focused.gateCheck({ dirs: [dirs[0], join(root, "not-dir")], table: null, env: { ALPHA: "1" } }).harness, "alpha");
});

test("agents detection module: detection and routing share the same regexp state", t => {
  const { root, put } = fixture(t);
  put("AGENTS.md", "User instructions\n" + block);
  focused.BLOCK_RE.lastIndex = 5;
  facade.register({ proj: root, cfg: {}, files: ["AGENTS.md"] });
  assert.equal(focused.BLOCK_RE.lastIndex, 0);
  assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8").match(/<!-- waypost:agents v/g).length, 1);
  focused.BLOCK_RE.lastIndex = 17;
  assert.deepEqual(facade.detectHarnesses(root), ["codex"]);
  assert.equal(focused.BLOCK_RE.lastIndex, 0);
  focused.BLOCK_RE.lastIndex = 9;
  facade.unregister({ proj: root });
  assert.equal(focused.BLOCK_RE.lastIndex, 0);
  assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), "User instructions\n");
});
