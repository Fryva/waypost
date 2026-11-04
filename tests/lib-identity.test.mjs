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

test("legacy digit rejection preserves escaped prefixes, Unicode and boundary matches", () => {
  for (const prefix of ["ADR-", "A+B-", "[x].*?\\-", "🚀-", "İ-", "K-", "a\nb-"]) {
    assert.deepEqual(focused.isLegacyNumberedId(prefix + "0123-Slug.MD", { prefix }), { number: "0123", slug: "Slug" });
    assert.deepEqual(focused.isLegacyNumberedId(prefix + "7", { prefix }), { number: "7", slug: null });
    assert.equal(focused.isLegacyNumberedId(prefix + "7\n", { prefix }), null);
    for (const suffix of ["", "slug", "１", "١", "-1"]) assert.equal(focused.isLegacyNumberedId(prefix + suffix, { prefix }), null);
  }
  assert.equal(focused.isLegacyNumberedId("ZZZ-123", { prefix: "ADR-" }), null, "the digit guard never accepts a match itself");
  assert.deepEqual(focused.isLegacyNumberedId("sToRy-0007-Foo.md", { story: true, prefix: {} }), { number: "0007", slug: "Foo" });
  assert.equal(focused.isLegacyNumberedId("", { story: true }), null, "short stem yields NaN and rejects");
  assert.equal(focused.isLegacyNumberedId("story-", { story: true }), null);
});

test("legacy digit rejection leaves non-string anchors and name coercion on the original path", () => {
  const events = [], prefix = { replace(pattern, replacement) { events.push("prefix replace"); return "X-".replace(pattern, replacement); } };
  const name = { [Symbol.toPrimitive](hint) { events.push("name " + hint); return "X-123-slug.md"; } };
  assert.deepEqual(focused.isLegacyNumberedId(name, { prefix }), { number: "123", slug: "slug" });
  assert.deepEqual(events, ["name string", "prefix replace"]);
  assert.deepEqual(focused.isLegacyNumberedId("ADR-4", { prefix: new String("ADR-") }), { number: "4", slug: null });
  for (const bad of [{}, 1, true, Symbol("prefix")]) assert.throws(() => focused.isLegacyNumberedId("slug", { prefix: bad }), TypeError);
  const failure = new Error("coercion failed"); let touched = false;
  assert.throws(() => focused.isLegacyNumberedId({ toString() { throw failure; } }, { prefix: { replace() { touched = true; return "X"; } } }), error => error === failure);
  assert.equal(touched, false);
  assert.throws(() => focused.isLegacyNumberedId(name, null), TypeError);
});
