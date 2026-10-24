import "./env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as focused from "../scripts/agents-registry.mjs";
import * as facade from "../scripts/agents.mjs";
import { ambientEnv } from "./env.mjs";

const focusedUrl = new URL("../scripts/agents-registry.mjs", import.meta.url).href;
const facadeUrl = new URL("../scripts/agents.mjs", import.meta.url).href;
const REPO = fileURLToPath(new URL("..", import.meta.url));
function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "wp-registry-module-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const rel of ["toolA", "toolB", "projectA", "projectB"]) mkdirSync(join(root, rel));
  const put = (rel, value) => {
    const p = join(root, rel);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, typeof value === "string" ? value : JSON.stringify(value));
    return p;
  };
  return { root, put };
}
function isolated(root, source) {
  const preamble = `import assert from "node:assert/strict";import {writeFileSync,mkdirSync,rmSync} from "node:fs";import {join} from "node:path";const root=process.env.WP_REGISTRY_FIXTURE;const r=await import(process.env.WP_REGISTRY_URL);const a=await import(process.env.WP_AGENTS_URL);`;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", preamble + source], {
    cwd: REPO, encoding: "utf8", timeout: 10000,
    env: { ...ambientEnv(), WAYPOST_HOME: join(root, "toolA"), CLAUDE_PLUGIN_ROOT: "", WAYPOST_PROJECT_DIR: join(root, "projectA"), CLAUDE_PROJECT_DIR: join(root, "projectA"), WAYPOST_HARNESS: "unknown", WAYPOST_PROC: "", WP_REGISTRY_FIXTURE: root, WP_REGISTRY_URL: focusedUrl, WP_AGENTS_URL: facadeUrl },
  });
  assert.equal(result.status, 0, result.stderr);
}

test("agents registry module: fourteen public bindings retain identity and facade namespace stays compatible", () => {
  for (const key of ["AGENT_BLOCK_VERSION", "AGENT_BLOCK_MARKER", "PREFIX", "TIERS", "registry", "harness", "isProvider", "CONFIDENCE", "confidenceOf", "harnessIds", "providerIds", "detectProvider", "HARNESSES", "harnessTakesModel"]) assert.equal(focused[key], facade[key], key);
  assert.deepEqual(Object.keys(facade).sort(), ["AGENT_BLOCK_MARKER", "AGENT_BLOCK_VERSION", "CONFIDENCE", "HARNESSES", "PREFIX", "TIERS", "confidenceOf", "detectHarness", "detectHarnesses", "detectProvider", "gateCheck", "harness", "harnessIds", "harnessOwnedPaths", "harnessTakesModel", "harnessesNamingModels", "hasRoleFiles", "importTargets", "importsSharedFile", "install", "installHarnesses", "installedRoleOf", "instructionTargetFor", "instructionTargets", "isAggregate", "isProvider", "listRoles", "providerIds", "readRole", "register", "registry", "renderBlock", "renderFor", "renderHashOf", "resolveModel", "roleNames", "rolesDir", "rosterFor", "skillsOf", "status", "targetDir", "targetPath", "uninstall", "unregister"]);
  assert.equal("roleSpec" in facade, false);
});

test("agents registry module: imports stay lazy and missing mandatory directory fails only on read", t => {
  const { root } = fixture(t);
  isolated(root, `assert.equal(typeof r.registry,"function");assert.throws(()=>r.registry(),{message:"Cannot read the bundled harness registry at "+join(root,"toolA","harnesses")+" (pluginRoot: "+join(root,"toolA")+"). Check WAYPOST_HOME / CLAUDE_PLUGIN_ROOT."});`);
});

test("agents registry module: one cache slot keys only on plugin root, preserves hits and reloads A B A", t => {
  const { root, put } = fixture(t);
  put("toolA/harnesses/base.json", { id: "base", name: "toolA" });
  put("toolB/harnesses/base.json", { id: "base", name: "toolB" });
  put("projectA/.waypost/harnesses/base.json", { id: "base", name: "projectA" });
  put("projectB/.waypost/harnesses/base.json", { id: "base", name: "projectB" });
  isolated(root, `
    const first=r.registry();assert.equal(first,a.registry());assert.equal(first.get("base").name,"projectA");
    writeFileSync(join(root,"toolA/harnesses/fresh.json"),JSON.stringify({id:"fresh"}));
    assert.equal(r.registry(),first);assert.equal(r.registry().has("fresh"),false);
    process.env.WAYPOST_PROJECT_DIR=join(root,"projectB");process.env.CLAUDE_PROJECT_DIR=join(root,"projectB");
    assert.equal(a.registry(),first);assert.equal(a.harness("base").name,"projectA");
    process.env.WAYPOST_HOME=join(root,"toolB");const second=a.registry();assert.notEqual(second,first);assert.equal(second.get("base").name,"projectB");
    process.env.WAYPOST_HOME=join(root,"toolA");const third=r.registry();assert.notEqual(third,first);assert.notEqual(third,second);assert.equal(third.get("base").name,"projectB");assert.equal(third.has("fresh"),true);assert.equal(a.registry(),third);
  `);
});

test("agents registry module: four directory precedence, sorted insertion and filename fallback remain exact", t => {
  const { root, put } = fixture(t);
  put("toolA/harnesses/z.json", { id: "same", name: "bundled" });
  const fallback = put("toolA/harnesses/a.json", { name: "fallback" });
  put("toolA/harnesses/providers/same.json", { id: "same", kind: "provider", name: "bundled provider" });
  put("projectA/.waypost/harnesses/same.json", { id: "same", name: "local harness" });
  const final = put("projectA/.waypost/harnesses/providers/same.json", { id: "same", kind: "provider", name: "local provider" });
  put("toolA/harnesses/ignored.JSON", "{");
  isolated(root, `
    const map=r.registry();assert.deepEqual([...map.keys()],["a","same"]);
    assert.deepEqual(map.get("a"),{name:"fallback",id:"a",source:${JSON.stringify(fallback)}});
    assert.deepEqual(map.get("same"),{id:"same",kind:"provider",name:"local provider",source:${JSON.stringify(final)}});
    assert.deepEqual(r.harnessIds(),["a"]);assert.deepEqual(r.providerIds(),["same"]);
  `);
});

test("agents registry module: confidence ordering, provider evidence and model metadata preserve defaults", t => {
  const { root, put } = fixture(t);
  for (const h of [{ id: "z", verified: true }, { id: "a", confidence: "verified" }, { id: "d", confidence: "documented", roles: { model: {} } }, { id: "i", roles: { model: false } }, { id: "u", confidence: "typo" }]) put("toolA/harnesses/" + h.id + ".json", h);
  put("toolA/harnesses/providers/p.json", { id: "p", kind: "provider", match: { env: ["P_KEY"], url_contains: ["P.EXAMPLE"] } });
  put("toolA/harnesses/providers/q.json", { id: "q", kind: "provider", match: { env: ["Q_KEY"] } });
  isolated(root, `
    assert.deepEqual(r.harnessIds(),["a","z","d","i","u"]);assert.deepEqual(r.providerIds(),["p","q"]);
    assert.equal(r.confidenceOf({verified:true}),"verified");assert.equal(r.confidenceOf({verified:false}),"inferred");assert.equal(r.confidenceOf({confidence:"typo",verified:true}),"typo");
    assert.equal(r.harnessTakesModel("a"),false);assert.equal(r.harnessTakesModel("d"),true);assert.equal(r.harnessTakesModel("i"),false);
    assert.equal(r.isProvider("p"),true);assert.equal(r.isProvider({kind:"provider"}),true);assert.equal(r.isProvider("a"),false);
    assert.equal(r.detectProvider({WAYPOST_PROVIDER:"explicit",P_KEY:"yes"}),"explicit");
    assert.equal(r.detectProvider({P_KEY:"yes",Q_KEY:"yes"}),"p");assert.equal(r.detectProvider({OPENAI_API_HOST:"HTTPS://P.EXAMPLE/V1"}),"p");assert.equal(r.detectProvider({Q_KEY:"yes"}),"q");assert.equal(r.detectProvider({}),null);
    assert.throws(()=>r.harness("missing"),{message:"Unknown harness: missing (known: a, d, i, u, z, p, q)"});
  `);
});

test("agents registry module: facade shares mutable constants, regexp state and a live array Proxy", t => {
  const { root, put } = fixture(t);
  put("toolA/harnesses/one.json", { id: "one" });
  isolated(root, `
    assert.equal(r.HARNESSES,a.HARNESSES);assert.equal(Array.isArray(a.HARNESSES),true);assert.deepEqual([...a.HARNESSES],["one"]);
    r.registry().set("two",{id:"two"});assert.equal(a.HARNESSES.includes("two"),true);assert.equal(a.HARNESSES.length,2);assert.deepEqual(Object.keys(a.HARNESSES),["0","1"]);
    assert.equal(r.AGENT_BLOCK_MARKER,a.AGENT_BLOCK_MARKER);r.AGENT_BLOCK_MARKER.lastIndex=7;assert.equal(a.AGENT_BLOCK_MARKER.lastIndex,7);r.AGENT_BLOCK_MARKER.lastIndex=0;
    assert.equal(r.TIERS,a.TIERS);r.TIERS.push("fixture");assert.equal(a.TIERS.at(-1),"fixture");assert.equal(r.CONFIDENCE,a.CONFIDENCE);r.CONFIDENCE.push("fixture");assert.equal(a.CONFIDENCE.at(-1),"fixture");
  `);
});

test("agents registry module: malformed JSON errors name the file and failures do not poison the cache", t => {
  const { root, put } = fixture(t);
  const bad = put("toolA/harnesses/bad.json", "{");
  isolated(root, `
    let detail;try{JSON.parse("{")}catch(e){detail=e.message}
    assert.throws(()=>r.registry(),{message:${JSON.stringify(bad)}+": not valid JSON — "+detail});
    writeFileSync(${JSON.stringify(bad)},JSON.stringify({id:"fixed"}));assert.deepEqual([...r.registry().keys()],["fixed"]);
  `);
});

test("agents registry module: optional non-directories are ignored while bundled non-directory is fatal", t => {
  const { root, put } = fixture(t);
  put("toolA/harnesses/base.json", { id: "base" });
  put("toolA/harnesses/providers", "not a directory");
  put("projectA/.waypost/harnesses", "not a directory");
  isolated(root, `
    assert.deepEqual([...r.registry().keys()],["base"]);
    process.env.WAYPOST_HOME=join(root,"toolB");writeFileSync(join(root,"toolB/harnesses"),"not a directory");
    assert.throws(()=>r.registry(),{message:"Cannot read the bundled harness registry at "+join(root,"toolB/harnesses")+" (pluginRoot: "+join(root,"toolB")+"). Check WAYPOST_HOME / CLAUDE_PLUGIN_ROOT."});
  `);
});
