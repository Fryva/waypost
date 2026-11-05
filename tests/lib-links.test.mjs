import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import * as facade from "../scripts/lib.mjs";
import * as focused from "../scripts/lib-links.mjs";
import {ambientEnv} from "./env.mjs";

function context() {
  const node={path:"adr/alpha.md",type:"adr",identity:"alpha",stem:"alpha",prefix:"adr",story:false};
  const trace=[];
  return {node,trace,ctx:{sourceRel:"source.md",files:[{rel:node.path,name:"alpha.md"},{rel:"loose.md",name:"loose.md"}],index:{nodes:[node],byPath:new Map([[node.path,node]]),byIdentity:new Map([["alpha",[node]]]),byStem:new Map([["alpha",[node]]])},exists:path=>{trace.push(path);return path==="asset.png";}}};
}

test("link leaf preserves facade bindings, arity and read budget",()=>{
  const arities={stripCodeSpans:1,extractLinks:1,resolveLinkTarget:3};
  assert.deepEqual(Object.keys(focused).sort(),Object.keys(arities).sort());
  for(const [name,arity]of Object.entries(arities)){assert.equal(facade[name],focused[name]);assert.equal(focused[name].name,name);assert.equal(focused[name].length,arity);}
  for(const leaf of ["lib-links.mjs","lib-link-extract.mjs"])assert.ok(readFileSync(new URL("../scripts/"+leaf,import.meta.url)).length<=10000,leaf);
});

test("link parser preserves exclusions, aliases, relative links, duplicates and ordering",()=>{
  const text='[first](./first.md#h) [[alpha\\|Alias]] `[[hidden]]` <!--[[comment]]--> [[alpha#h]]\n```\n[[fenced]]\n```\n[web](https://example.com) [[alpha]] [parent](../p.md)';
  assert.deepEqual(focused.extractLinks(text),[{type:"wikilink",target:"alpha"},{type:"wikilink",target:"alpha"},{type:"wikilink",target:"alpha"},{type:"mdlink",target:"./first.md"},{type:"mdlink",target:"../p.md"}]);
  assert.throws(()=>focused.extractLinks(null),TypeError);
  assert.deepEqual(focused.extractLinks("~~~\n[[kept]]\n~~~"),[{type:"wikilink",target:"kept"}]);
});

test("link resolver returns original node objects and preserves kind filtering",()=>{
  const {ctx,node}=context();
  assert.equal(focused.resolveLinkTarget("ALPHA.md","wikilink",ctx).node,node);
  assert.equal(focused.resolveLinkTarget("./adr/alpha.md","mdlink",ctx).node,node);
  ctx.kinds=[];
  assert.deepEqual(focused.resolveLinkTarget("alpha","wikilink",ctx),{outcome:"dead"});
  assert.deepEqual(focused.resolveLinkTarget("./adr/alpha.md","mdlink",ctx),{outcome:"out-of-scope",path:node.path});
  ctx.kinds=null;
  assert.deepEqual(focused.resolveLinkTarget("loose","wikilink",ctx),{outcome:"out-of-scope",path:"loose.md"});
});

test("link resolver retains caller-owned cache identity, lazy initialization and stale reuse",()=>{
  const {ctx}=context();assert.equal(Object.hasOwn(ctx,"_fileSet"),false);
  focused.resolveLinkTarget("alpha","wikilink",ctx);const cache=ctx._fileSet;
  assert.ok(cache instanceof Set);ctx.files.push({rel:"fresh.md",name:"fresh.md"});
  assert.deepEqual(focused.resolveLinkTarget("./fresh.md","mdlink",ctx),{outcome:"dead"});
  assert.equal(ctx._fileSet,cache);
  const other=context().ctx;focused.resolveLinkTarget("alpha","wikilink",other);assert.notEqual(other._fileSet,cache);
  const seed=new Set(["seed.md"]);other._fileSet=seed;
  assert.deepEqual(focused.resolveLinkTarget("./seed.md","mdlink",other),{outcome:"out-of-scope",path:"seed.md"});assert.equal(other._fileSet,seed);
  const frozen=context().ctx;Object.freeze(frozen);assert.throws(()=>focused.resolveLinkTarget("alpha","wikilink",frozen),TypeError);
  const nullCache=context().ctx;nullCache._fileSet=null;focused.resolveLinkTarget("alpha","wikilink",nullCache);assert.ok(nullCache._fileSet instanceof Set);
});

test("link resolver preserves callback ordering, escape refusal and callback exceptions",()=>{
  const {ctx,trace}=context();
  assert.deepEqual(focused.resolveLinkTarget("../escape.md","mdlink",ctx),{outcome:"out-of-scope"});assert.deepEqual(trace,[]);
  assert.deepEqual(focused.resolveLinkTarget("./asset.png","mdlink",ctx),{outcome:"out-of-scope",path:"asset.png"});
  assert.deepEqual(focused.resolveLinkTarget("./missing.md","mdlink",ctx),{outcome:"dead"});assert.deepEqual(trace,["asset.png","missing.md"]);
  const error=new Error("callback failure");ctx.exists=()=>{throw error};assert.throws(()=>focused.resolveLinkTarget("./missing.md","mdlink",ctx),e=>e===error);
  const repeated=context();repeated.ctx.index.byIdentity.set("alpha",[repeated.node,repeated.node]);assert.equal(focused.resolveLinkTarget("alpha","wikilink",repeated.ctx).node,repeated.node);
});

test("link leaf imports and executes without filesystem I/O or process probes",()=>{
  const urls=["lib-links.mjs","lib-identity.mjs","lib-link-extract.mjs"].map(name=>new URL("../scripts/"+name,import.meta.url).href);
  const code=`import fs from "node:fs";import cp from "node:child_process";import {syncBuiltinESMExports} from "node:module";import {fileURLToPath} from "node:url";
  const allowed=new Set(${JSON.stringify(urls)}.map(u=>fileURLToPath(u)));let calls=0;const blocked=()=>{calls++;throw Error("unexpected I/O")};
  for(const name of ["readFileSync","realpathSync"]){const original=fs[name];fs[name]=(p,...args)=>allowed.has(p instanceof URL?fileURLToPath(p):String(p))?original(p,...args):blocked();}
  for(const name of ["readFile","writeFileSync","appendFileSync","mkdirSync","unlinkSync","renameSync","rmSync","existsSync","readdirSync","statSync"])fs[name]=blocked;cp.spawnSync=blocked;syncBuiltinESMExports();
  const m=await import(${JSON.stringify(urls[0])});if(calls)throw Error("import I/O");
  // After import no loader reads are needed; reject reads of even the module itself.
  fs.readFileSync=blocked;fs.realpathSync=blocked;syncBuiltinESMExports();
  if(m.stripCodeSpans("text")!=="text"||m.extractLinks("[[x]]").length!==1)throw Error("parser control");
  const node={path:"x.md",type:"adr"},ctx={sourceRel:"s.md",files:[{rel:"x.md",name:"x.md"}],index:{nodes:[node],byPath:new Map([["x.md",node]]),byIdentity:new Map([["x",[node]]]),byStem:new Map()}};
  if(m.resolveLinkTarget("x","wikilink",ctx).node!==node)throw Error("resolver control");if(calls)throw Error("call I/O");
  try{fs.readFileSync("blocked")}catch{}try{cp.spawnSync("blocked")}catch{}if(calls!==2)throw Error("inactive guards");console.log("pure");`;
  const result=spawnSync(process.execPath,["--input-type=module","-e",code],{encoding:"utf8",env:ambientEnv()});assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,"pure\n");
});

test("legacy link matching preserves per-node getters, callback nulls and repeated-call freshness", () => {
  const events = [], callbackReturns = [];
  const nodes = Array.from({ length: 4 }, (_, i) => ({
    path: `adr/${i}.md`,
    get type() { events.push(`type ${i}`); return i === 3 ? "spec" : "adr"; },
    get story() { events.push(`story ${i}`); return false; },
    get prefix() { events.push(`prefix ${i}`); return "ADR-"; },
    get stem() { events.push(`stem ${i}`); return `ADR-004-choice-${i}`; },
  }));
  const actualFilter = nodes.filter;
  nodes.filter = function(predicate) {
    return actualFilter.call(this, (node, i, all) => { const value = predicate(node, i, all); callbackReturns.push(value); return value; });
  };
  const ctx = { sourceRel: "source.md", index: { nodes, byIdentity: new Map(), byStem: new Map(), byPath: new Map() }, files: [], kinds: ["adr"] };
  assert.deepEqual(focused.resolveLinkTarget("missing", "ref", ctx), { outcome: "dead" });
  assert.deepEqual(callbackReturns, [null, null, null, false]);
  assert.deepEqual(events, ["type 0", "story 0", "prefix 0", "type 1", "story 1", "prefix 1", "type 2", "story 2", "prefix 2", "type 3"]);
  events.length = 0; callbackReturns.length = 0;
  assert.deepEqual(focused.resolveLinkTarget("ADR-004", "ref", ctx), { outcome: "ambiguous", candidates: ["adr/0.md", "adr/1.md", "adr/2.md"] });
  assert.deepEqual(callbackReturns, [true, true, true, false]);
  assert.deepEqual(events, ["type 0", "story 0", "prefix 0", "stem 0", "type 1", "story 1", "prefix 1", "stem 1", "type 2", "story 2", "prefix 2", "stem 2", "type 3"]);
  ctx.index.nodes = [{ path: "adr/new.md", type: "adr", prefix: "ADR-", stem: "ADR-005-new" }];
  assert.equal(focused.resolveLinkTarget("ADR-005", "ref", ctx).node, ctx.index.nodes[0]);
});

test("legacy link matching keeps stateful non-string prefixes and exceptions live", () => {
  const failure = new Error("second replace"), events = [];
  const prefix = { replace() { events.push("replace"); if (events.length === 2) throw failure; return "ADR-"; } };
  const nodes = [0, 1].map(i => ({ path: `adr/${i}.md`, type: "adr", prefix, stem: `ADR-004-${i}` }));
  const ctx = { sourceRel: "source.md", index: { nodes, byIdentity: new Map(), byStem: new Map(), byPath: new Map() }, files: [], kinds: ["adr"] };
  assert.throws(() => focused.resolveLinkTarget("ADR-004", "ref", ctx), error => error === failure);
  assert.deepEqual(events, ["replace", "replace"]);
  ctx.index.nodes = [{ path: "adr/bad.md", type: "adr", prefix: 1, stem: "anything" }];
  assert.throws(() => focused.resolveLinkTarget("missing", "ref", ctx), TypeError);
});

test("legacy link matching retains raw anchors, duplicates and higher tier precedence", () => {
  const first = { path: "z.md", type: "adr", prefix: "ADR-", stem: "adr-004-first" };
  const second = { path: "a.md", type: "adr", prefix: "adr-", stem: "ADR-004-second" };
  const index = { nodes: [first, first, second, { ...first }], byPath: new Map(), byIdentity: new Map(), byStem: new Map() };
  const ctx = { sourceRel: "source.md", index, files: [], kinds: ["adr"] };
  assert.deepEqual(focused.resolveLinkTarget("ADR-004", "ref", ctx), { outcome: "ambiguous", candidates: ["a.md", "z.md", "z.md"] });
  index.byIdentity.set("adr-004", [first]);
  Object.defineProperty(index, "nodes", { get() { throw Error("tier 3 must remain lazy"); } });
  assert.equal(focused.resolveLinkTarget("ADR-004", "ref", ctx).node, first);
});

test("link-family guards inspect stripped prose and preserve joined delimiters", () => {
  for (const removed of ["`cut`", "<!--cut-->", "```\ncut\n```"])
    assert.deepEqual(focused.extractLinks(`[${removed}[joined]] [x]${removed}(./joined.md)`), [
      { type: "wikilink", target: "joined" }, { type: "mdlink", target: "./joined.md" },
    ]);
  for (const text of ["", "ordinary prose", "[ ] unchecked", "`[[hidden]]` <!-- [x](./hidden.md) -->"])
    assert.deepEqual(focused.extractLinks(text), []);
  assert.deepEqual(focused.extractLinks("[[only]]"), [{ type: "wikilink", target: "only" }]);
  assert.deepEqual(focused.extractLinks("](./without-opening-bracket.md)"), [{ type: "mdlink", target: "./without-opening-bracket.md" }]);
});

test("link-family guards retain non-string replace/matchAll calls and error identities", () => {
  for (const failAt of [null, 1, 2]) {
    const calls = [], failure = new Error("matchAll failed"); let matches = 0;
    const text = {
      replace(re, replacement) { calls.push(["replace", re.source, replacement]); return this; },
      get includes() { throw Error("non-string includes must not be read"); },
      matchAll(re) {
        calls.push(["matchAll", re.source]);
        if (++matches === failAt) throw failure;
        return [["ignored", matches === 1 ? "target" : "./target.md"]];
      },
    };
    if (failAt) assert.throws(() => focused.extractLinks(text), error => error === failure);
    else assert.deepEqual(focused.extractLinks(text), [{ type: "wikilink", target: "target" }, { type: "mdlink", target: "./target.md" }]);
    assert.deepEqual(calls.slice(0, 3).map(call => call[0]), ["replace", "replace", "replace"]);
    assert.equal(calls.length, 3 + (failAt || 2));
  }
  for (const input of [null, undefined, 42]) assert.throws(() => focused.extractLinks(input), TypeError);
  const failure = new Error("replace failed");
  assert.throws(() => focused.extractLinks({ replace() { throw failure; } }), error => error === failure);
});


test("code stripping preserves sequential joins and incomplete notation", () => {
  for (const [input, expected] of [
    ["", ""], ["plain prose", "plain prose"],
    ["before ```hidden``` after", "before  after"],
    ["```unterminated", "`unterminated"], ["`unterminated", "`unterminated"],
    ["<!--unterminated", "<!--unterminated"], ["~~~kept~~~", "~~~kept~~~"],
    ["`cut```hidden```cut`", ""],
    ["<!```hidden```--hidden-->", ""], ["<!`hidden`--hidden-->", ""],
    // HTML removal is last: newly joined inline notation is not stripped again.
    ["`<!--hidden-->`", ""], ["`<!--hidden-->\n`", "`\n`"],
    ["[[kept]] `[[hidden]]` <!--[[hidden]]-->", "[[kept]]  "],
  ]) assert.equal(focused.stripCodeSpans(input), expected, input);
  assert.equal(focused.stripCodeSpans(new String("`hidden` [[kept]]")), " [[kept]]");
});

test("code stripping keeps custom replacement order and original exception identities", () => {
  const sources = [/```[\s\S]*?```/g, /`[^`\n]*`/g, /<!--[\s\S]*?-->/g].map(re => re.source);
  for (const failAt of [null, 1, 2, 3]) {
    const trace = [], failure = new Error("replace failed");
    const input = {
      get includes() { throw Error("non-string includes must not be read"); },
      replace(re, replacement) { trace.push([re.source, replacement]); if (trace.length === failAt) throw failure; return this; },
    };
    if (failAt) assert.throws(() => focused.stripCodeSpans(input), error => error === failure);
    else assert.equal(focused.stripCodeSpans(input), input);
    assert.deepEqual(trace, sources.slice(0, failAt || 3).map(source => [source, ""]));
  }
  const input = { replace() { return "`hidden`<!--hidden-->[[kept]]"; }, get includes() { throw Error("non-string includes"); } };
  assert.equal(focused.stripCodeSpans(input), "[[kept]]");
  for (const value of [null, undefined, 42]) assert.throws(() => focused.stripCodeSpans(value), TypeError);
});


test("code stripping preserves replacement getter failures across intermediate objects", () => {
  for (const failureStage of [1, 2, 3]) {
    const trace = [], failure = new Error("replacement getter");
    const stage = i => ({
      get includes() { throw Error("non-string includes"); },
      get replace() {
        trace.push(`get ${i}`); if (i === failureStage) throw failure;
        return function() { assert.equal(this, objects[i - 1]); trace.push(`call ${i}`); return objects[i]; };
      },
    });
    const objects = [stage(1), stage(2), stage(3)];
    assert.throws(() => focused.stripCodeSpans(objects[0]), error => error === failure);
    assert.deepEqual(trace, Array.from({ length: failureStage - 1 }, (_, i) => [`get ${i + 1}`, `call ${i + 1}`]).flat().concat(`get ${failureStage}`));
  }
});

test("bare-link lookup tables match the plain scans for ring 2, legacy tier 3 and kind scoping",()=>{
  const node=(stem,type="adr",prefix="adr-")=>({path:`${type}/${stem}.md`,type,identity:stem+"!",stem,prefix,story:false});
  const nodes=[node("adr-0002-b"),node("adr-0002-a"),node("adr-0007-only"),node("ADR-0009-Case"),node("adr-x-y"),node("spec-0002-s","spec","spec-")];
  const files=[...nodes.map(n=>({rel:n.path,name:n.stem+".md"})),{rel:"README.md",name:"README.md"},{rel:"a/README.md",name:"README.md"},{rel:"a/Loose.MD",name:"Loose.MD"}];
  const index={nodes,byPath:new Map(nodes.map(n=>[n.path,n])),byIdentity:new Map(),byStem:new Map()};
  const ctx=extra=>({sourceRel:"s.md",files,index,...extra});
  const r=(t,x)=>focused.resolveLinkTarget(t,"wikilink",ctx(x));
  assert.deepEqual(r("ADR-0002"),{outcome:"ambiguous",candidates:["adr/adr-0002-a.md","adr/adr-0002-b.md"]});
  assert.equal(r("adr-0007").node,nodes[2]);
  assert.equal(r("adr-0009").node,nodes[3]);
  assert.equal(r("adr-x").outcome,"dead","a non-numbered prefix is not a legacy id");
  assert.equal(r("spec-0002").node,nodes[5]);
  assert.equal(r("adr-0002",{kinds:["spec"]}).outcome,"dead");
  assert.deepEqual(r("readme"),{outcome:"out-of-scope"});
  assert.deepEqual(r("loose.md"),{outcome:"out-of-scope",path:"a/Loose.MD"});
  assert.equal(r("missing").outcome,"dead");
  nodes.push(node("adr-0007-late"));
  assert.equal(r("adr-0007").outcome,"ambiguous","a grown node list rebuilds the table");
});
