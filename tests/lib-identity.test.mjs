import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {ambientEnv} from "./env.mjs";
import * as facade from "../scripts/lib.mjs";
import * as focused from "../scripts/lib-identity.mjs";

test("artifact identity leaf preserves facade bindings and function contracts", () => {
  const contracts = {"isLegacyNumberedId": 1, "slugIdentity": 1, "storyMatchesEntry": 1, "legalArtifactName": 1, "displayNumberOf": 2, "compareArtifactOrder": 2, "findSlugCollision": 2};
  assert.deepEqual(Object.keys(focused).sort(), Object.keys(contracts).sort());
  for (const [name, arity] of Object.entries(contracts)) {
    assert.equal(facade[name], focused[name], name);
    assert.equal(focused[name].name, name);
    assert.equal(focused[name].length, arity);
  }
});

test("artifact identity leaf stays readable in one pass", () => {
  const source = readFileSync(new URL("../scripts/lib-identity.mjs", import.meta.url));
  assert.ok(source.length <= 9000, `identity leaf is ${source.length} UTF-8 bytes`);
});

test("artifact identity leaf returns the first collision without sorting or mutating input", () => {
  const names = Object.freeze(["story-009-foo.md", "story-006-foo.md"]);
  assert.equal(focused.findSlugCollision("story-foo.md", names, {story:true}).with, "story-009-foo.md");
  const reverse = Object.freeze([...names].reverse());
  assert.equal(focused.findSlugCollision("story-foo.md", reverse, {story:true}).with, "story-006-foo.md");
  assert.deepEqual(names, ["story-009-foo.md", "story-006-foo.md"]);
  assert.deepEqual(reverse, ["story-006-foo.md", "story-009-foo.md"]);
});

test("artifact identity leaf import and calls perform no I/O or probes", () => {
  const url = new URL("../scripts/lib-identity.mjs", import.meta.url).href;
  const path = fileURLToPath(url);
  const code = `import fs from "node:fs";import cp from "node:child_process";import {syncBuiltinESMExports} from "node:module";import {fileURLToPath} from "node:url";
    let calls=0;const blocked=()=>{calls++;throw Error("unexpected I/O")};
    const read=fs.readFileSync;fs.readFileSync=(p,...args)=>{const name=p instanceof URL?fileURLToPath(p):String(p);return name===${JSON.stringify(path)}?read(p,...args):blocked()};
    for(const name of ["readFile","writeFileSync","appendFileSync","mkdirSync","unlinkSync","renameSync","rmSync","readdirSync","statSync"])fs[name]=blocked;
    cp.spawnSync=blocked;syncBuiltinESMExports();
    const m=await import(${JSON.stringify(url)});
    if(m.isLegacyNumberedId("A+B-004-x",{prefix:"A+B-"})?.slug!=="x")throw Error("regex escape positive control");
    if(m.slugIdentity("story-006-foo.md",{story:true}).legacyNumber!=="006")throw Error("identity positive control");
    if(m.storyMatchesEntry("story-001",{id:"story-001",stem:"other"})!==1||!m.legalArtifactName("foo copy.md"))throw Error("matcher positive control");
    if(m.displayNumberOf({number:"042"},"foo.md")!=="042"||m.compareArtifactOrder({slug:"a"},{slug:"b"})>=0)throw Error("order positive control");
    if(m.findSlugCollision("foo.md",["ADR-003-foo.md"],{prefix:"ADR-"})?.with!=="ADR-003-foo.md")throw Error("collision positive control");
    if(calls!==0)throw Error("unexpected import/parser I/O:"+calls);
    try{fs.readFileSync("not-the-module")}catch{};try{cp.spawnSync("probe")}catch{};
    if(calls!==2)throw Error("inactive I/O guards");console.log("pure");`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], {encoding:"utf8",env:ambientEnv()});
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "pure\n");
});
