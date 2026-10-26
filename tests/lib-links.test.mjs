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
  assert.ok(readFileSync(new URL("../scripts/lib-links.mjs",import.meta.url)).length<=10000);
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
  const urls=["lib-links.mjs","lib-identity.mjs"].map(name=>new URL("../scripts/"+name,import.meta.url).href);
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
