import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,realpathSync,mkdirSync,writeFileSync,readFileSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {spawnSync} from "node:child_process";
import {ambientEnv} from "./env.mjs";
import * as facade from "../scripts/lib.mjs";
import * as focused from "../scripts/lib-vault-facts.mjs";
function fixture(t){const root=realpathSync(mkdtempSync(join(tmpdir(),"wp-facts-test-")));t.after(()=>rmSync(root,{recursive:true,force:true}));const vault=join(root,"vault");mkdirSync(join(vault,"adr"),{recursive:true});mkdirSync(join(vault,"epics/E/stories/folder"),{recursive:true});writeFileSync(join(vault,".projectstore.json"),'{"spec_policy":"required","lifecycle_gates":"on"}');writeFileSync(join(vault,"adr/README.md"),"# Decisions\n");writeFileSync(join(vault,"adr/one.md"),"# One\n");writeFileSync(join(vault,"epics/E/epic.md"),"# E\n");for(const [rel,title,date]of [["flat.md","Flat","2026-01-01"],["folder/README.md","Folder","2026-02-01"]])writeFileSync(join(vault,"epics/E/stories",rel),`---\nstatus: in-progress\ntitle: ${title}\nstarted_at: ${date}\n---\n`);return{root,vault,cfg:{vault_path:vault,layout:"engineering",language:"en"}};}
const pump=async()=>{for(let i=0;i<80;i++)await Promise.resolve()};

test("vault facts preserve facade async binding and read budget",()=>{
  assert.deepEqual(Object.keys(focused),["gatherVaultFacts"]);assert.equal(facade.gatherVaultFacts,focused.gatherVaultFacts);assert.equal(focused.gatherVaultFacts.name,"gatherVaultFacts");assert.equal(focused.gatherVaultFacts.length,1);assert.equal(focused.gatherVaultFacts.constructor.name,"AsyncFunction");assert.ok(readFileSync(new URL("../scripts/lib-vault-facts.mjs",import.meta.url)).length<=9000);
});

test("vault facts default async reads preserve counts, policy, order and missing vault shape",async t=>{
  const{root,vault,cfg}=fixture(t);const facts=await focused.gatherVaultFacts({...cfg,vault_path:vault+"///"},{budgetMs:5000});assert.equal(facts.vaultPath,vault);assert.equal(facts.specPolicy,"required");assert.equal(facts.lifecycleGates,"on");assert.deepEqual(facts.folders.find(f=>f.kind==="adr").counts,{artifacts:1});assert.deepEqual(facts.folders.find(f=>f.kind==="epic").counts,{epics:1,stories:2});assert.equal(facts.inFlight.status,"ok");assert.deepEqual(facts.inFlight.entries.map(e=>e.title),["Folder","Flat"]);assert.deepEqual(await focused.gatherVaultFacts({vault_path:join(root,"missing")}),{vaultMissing:true,vaultPath:join(root,"missing")});
});

for(const mode of ["timeout-all","partial","late-reject"])test(`vault facts ${mode} preserves late references and timer/read order`,async t=>{
  const{cfg}=fixture(t);const set=globalThis.setTimeout,clear=globalThis.clearTimeout,trace=[],pending=[];let fire,ready=false;globalThis.setTimeout=(fn,ms)=>{trace.push(["timer",ms]);fire=fn;return 77};globalThis.clearTimeout=id=>trace.push(["clear",id]);
  try{const readFile=path=>{trace.push(["read",path]);const read=()=>{if(ready&&mode==="late-reject")throw Error("late failure");return readFileSync(path,"utf8")};if(!ready&&(mode!=="partial"||path.includes("/stories/")||!path.endsWith("README.md")))return new Promise((resolve,reject)=>pending.push(()=>{try{resolve(read())}catch(e){reject(e)}}));return read()};
    const task=focused.gatherVaultFacts(cfg,{budgetMs:17,readFile});await pump();assert.deepEqual(trace[0][0],"read");assert.deepEqual(trace[1][0],"read");assert.deepEqual(trace[2],["timer",17]);fire();const facts=await task,folders=facts.folders,inFlight=facts.inFlight;assert.equal(inFlight.status,"timeout");assert.deepEqual(trace.at(-1),["clear",77]);assert.equal(inFlight.total,0);if(mode==="partial")assert.equal(folders.find(f=>f.kind==="adr").readme,"# Decisions\n");else assert.equal(folders.find(f=>f.kind==="adr").readme,null);
    ready=true;for(const release of pending)release();await pump();await new Promise(setImmediate);assert.equal(facts.folders,folders);assert.equal(facts.inFlight,inFlight);assert.equal(inFlight.status,"timeout");assert.equal(inFlight.total,mode==="late-reject"?0:2);
  }finally{globalThis.setTimeout=set;globalThis.clearTimeout=clear}
});

test("vault facts import adds no I/O, probes, writes or timers",()=>{
  const names=["lib-vault-facts.mjs","lib-vault-policy.mjs","lib-resources.mjs","lib-frontmatter.mjs","lib-vault-files.mjs"],urls=names.map(n=>new URL("../scripts/"+n,import.meta.url).href);
  const code=`import fs from"node:fs";import cp from"node:child_process";import{syncBuiltinESMExports}from"node:module";import{fileURLToPath}from"node:url";const allowed=new Set(${JSON.stringify(urls)}.map(u=>fileURLToPath(u)));let calls=0;const blocked=()=>{calls++;throw Error("unexpected action")};for(const name of["readFileSync","realpathSync"]){const original=fs[name];fs[name]=(p,...a)=>allowed.has(String(p instanceof URL?fileURLToPath(p):p))?original(p,...a):blocked();}for(const name of["readFile","existsSync","readdirSync","statSync","writeFileSync","appendFileSync","mkdirSync","unlinkSync","renameSync","rmSync"])fs[name]=blocked;cp.spawnSync=blocked;const timer=setTimeout;globalThis.setTimeout=blocked;syncBuiltinESMExports();const m=await import(${JSON.stringify(urls[0])});globalThis.setTimeout=timer;if(typeof m.gatherVaultFacts!=="function"||calls)throw Error("import action");try{fs.writeFileSync("blocked","x")}catch{}try{cp.spawnSync("blocked")}catch{}if(calls!==2)throw Error("inactive guards");console.log("pure");`;
  const r=spawnSync(process.execPath,["--input-type=module","-e",code],{encoding:"utf8",env:ambientEnv()});assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,"pure\n");
});
