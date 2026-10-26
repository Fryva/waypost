import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,realpathSync,mkdirSync,writeFileSync,readFileSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {spawnSync} from "node:child_process";
import {ambientEnv} from "./env.mjs";
import * as facade from "../scripts/lib.mjs";
import * as focused from "../scripts/lib-artifact-names.mjs";
function fixture(t){const root=realpathSync(mkdtempSync(join(tmpdir(),"wp-name-test-")));t.after(()=>rmSync(root,{recursive:true,force:true}));const dir=join(root,"numbers");mkdirSync(dir);for(const name of["SPEC-002-note.md","spec-009-any.txt","A[001.txt","A.004.md","A-555.md","X+007","XX888","other.md"])writeFileSync(join(dir,name),"fixture\n");mkdirSync(join(dir,"SpEc-013-folder"));writeFileSync(join(root,"non-dir"),"file");return{root,dir};}
function child(code){const r=spawnSync(process.execPath,["--input-type=module","-e",code],{encoding:"utf8",env:ambientEnv()});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);}

test("artifact names preserve facade bindings, arity and read budget",()=>{
  assert.deepEqual(Object.keys(focused).sort(),["nextNumber","slugify"]);for(const[name,arity]of Object.entries({slugify:1,nextNumber:2})){assert.equal(facade[name],focused[name]);assert.equal(focused[name].name,name);assert.equal(focused[name].length,arity);}assert.ok(readFileSync(new URL("../scripts/lib-artifact-names.mjs",import.meta.url)).length<=3000);
});

test("artifact slugs preserve Cyrillic, Unicode, punctuation and non-normalized accents",()=>{
  for(const[input,expected]of [["Привет Мир","privet-mir"],["Ёжик","ezhik"],["ЪЬ","untitled"],["中文 方案","中文-方案"],["１２３","１２３"],["é","é"],["e\u0301","e"],["😀🚀","untitled"],["a_b/c.d","abcd"],["  A---B\tC  ","a-b-c"],["","untitled"]])assert.equal(focused.slugify(input),expected,input);
});

test("artifact slugs use the supplied lowercase method and preserve its errors",()=>{
  for(const value of [null,undefined,0,{},[]])assert.throws(()=>focused.slugify(value),TypeError);
  const trace=[],input={get toLowerCase(){trace.push("get");return()=>{trace.push("call");return "CUSTOM Ё"}}};assert.equal(focused.slugify(input),"CUSTOM-Ё");assert.deepEqual(trace,["get","call"]);
  const error=new Error("lowercase failure");assert.throws(()=>focused.slugify({toLowerCase(){throw error}}),e=>e===error);
});

test("legacy numbering keeps prefix escaping, case, directories, extensions and fresh reads",t=>{
  const{dir}=fixture(t);assert.equal(focused.nextNumber(dir,"SPEC-"),"014");assert.equal(focused.nextNumber(dir,"SPEC-",0),"14");assert.equal(focused.nextNumber(dir,"SPEC-",5),"00014");assert.equal(focused.nextNumber(dir,"A["),"002");assert.equal(focused.nextNumber(dir,"A."),"005");assert.equal(focused.nextNumber(dir,"X+"),"008");assert.equal(focused.nextNumber(dir,"missing"),"001");writeFileSync(join(dir,"spec-100.bin"),"new\n");assert.equal(focused.nextNumber(dir,"SPEC-"),"101");
});

test("legacy numbering preserves missing-directory and prefix-before-listing error order",t=>{
  const{root,dir}=fixture(t);assert.equal(focused.nextNumber(join(root,"missing"),null),"001");assert.throws(()=>focused.nextNumber(dir,null),TypeError);assert.throws(()=>focused.nextNumber(join(root,"non-dir"),null),TypeError);assert.throws(()=>focused.nextNumber(join(root,"non-dir"),"SPEC-"));
  const url=new URL("../scripts/lib-artifact-names.mjs",import.meta.url).href;const out=child(`import fs from"node:fs";import{syncBuiltinESMExports}from"node:module";const trace=[],exists=fs.existsSync,list=fs.readdirSync;fs.existsSync=(...a)=>{trace.push("exists");return exists(...a)};fs.readdirSync=(...a)=>{trace.push("list");return list(...a)};syncBuiltinESMExports();const m=await import(${JSON.stringify(url)});trace.length=0;const prefix={get replace(){trace.push("get prefix");return function(...a){trace.push("call prefix");return "SPEC-".replace(...a)}}};const value=m.nextNumber(${JSON.stringify(dir)},prefix);const first=[...trace];trace.length=0;let error;try{m.nextNumber(${JSON.stringify(dir)},null)}catch(e){error=e.name}console.log(JSON.stringify({value,first,error,last:trace}));`);assert.deepEqual(out,{value:"014",first:["exists","get prefix","call prefix","list"],error:"TypeError",last:["exists"]});
});

test("artifact name import adds no I/O, probes, writes or timers",()=>{
  const url=new URL("../scripts/lib-artifact-names.mjs",import.meta.url).href;const code=`import fs from"node:fs";import cp from"node:child_process";import{syncBuiltinESMExports}from"node:module";import{fileURLToPath}from"node:url";const target=fileURLToPath(${JSON.stringify(url)});let calls=0;const blocked=()=>{calls++;throw Error("unexpected action")};for(const name of["readFileSync","realpathSync"]){const original=fs[name];fs[name]=(p,...a)=>String(p instanceof URL?fileURLToPath(p):p)===target?original(p,...a):blocked();}for(const name of["readFile","existsSync","readdirSync","statSync","writeFileSync","appendFileSync","mkdirSync","unlinkSync","renameSync","rmSync"])fs[name]=blocked;cp.spawnSync=blocked;const timer=setTimeout;globalThis.setTimeout=blocked;syncBuiltinESMExports();const m=await import(${JSON.stringify(url)});globalThis.setTimeout=timer;if(calls||m.slugify("Привет")!=="privet"||typeof m.nextNumber!=="function")throw Error("import/call control");try{fs.writeFileSync("blocked","x")}catch{}try{cp.spawnSync("blocked")}catch{}if(calls!==2)throw Error("inactive guards");console.log("pure");`;
  const r=spawnSync(process.execPath,["--input-type=module","-e",code],{encoding:"utf8",env:ambientEnv()});assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,"pure\n");
});

test("artifact name calls add no writes or process probes",t=>{
  const{dir}=fixture(t),url=new URL("../scripts/lib-artifact-names.mjs",import.meta.url).href;const out=child(`import fs from"node:fs";import cp from"node:child_process";import{syncBuiltinESMExports}from"node:module";let calls=0;const blocked=()=>{calls++;throw Error("unexpected mutation")};for(const name of["writeFileSync","appendFileSync","mkdirSync","unlinkSync","renameSync","rmSync"])fs[name]=blocked;cp.spawnSync=blocked;syncBuiltinESMExports();const m=await import(${JSON.stringify(url)});const value=m.nextNumber(${JSON.stringify(dir)},"SPEC-"),slug=m.slugify("Hello World");if(calls)throw Error("mutation");try{fs.writeFileSync("blocked","x")}catch{}try{cp.spawnSync("blocked")}catch{}console.log(JSON.stringify({value,slug,calls}));`);assert.deepEqual(out,{value:"014",slug:"hello-world",calls:2});
});
