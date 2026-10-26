import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,realpathSync,writeFileSync,readFileSync,readdirSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {ambientEnv} from "./env.mjs";
import * as facade from "../scripts/lib.mjs";
import * as focused from "../scripts/lib-vault-policy.mjs";
function fixture(t){const root=realpathSync(mkdtempSync(join(tmpdir(),"wp-policy-test-")));t.after(()=>rmSync(root,{recursive:true,force:true}));return root;}

test("vault policy preserves facade bindings, arities and read budget",()=>{
  const arities={vaultConfigPath:1,readVaultConfig:1,selfInstallOff:1,writeVaultConfig:2,isLegacyStory:2};assert.deepEqual(Object.keys(focused).sort(),Object.keys(arities).sort());for(const[n,a]of Object.entries(arities)){assert.equal(facade[n],focused[n]);assert.equal(focused[n].name,n);assert.equal(focused[n].length,a);}assert.ok(readFileSync(new URL("../scripts/lib-vault-policy.mjs",import.meta.url)).length<=4500);
});

test("vault policy distinguishes missing, invalid shapes and fail-closed install policy",t=>{
  const root=fixture(t),file=focused.vaultConfigPath(root);assert.equal(file,join(root,".projectstore.json"));assert.deepEqual(focused.readVaultConfig(root),{});assert.equal(focused.selfInstallOff(root),false);
  for(const value of [[],null,1,false,"text"]){writeFileSync(file,JSON.stringify(value));assert.deepEqual(focused.readVaultConfig(root),{});assert.equal(focused.selfInstallOff(root),true);}
  for(const[value,off]of [[{},false],[{self_install:"OFF"},true],[{self_install:false},true],[{self_install:"FALSE"},true],[{self_install:"on"},false]]){writeFileSync(file,JSON.stringify(value));assert.deepEqual(focused.readVaultConfig(root),value);assert.equal(focused.selfInstallOff(root),off);}
});

test("vault policy corrupt JSON warns in the default reader but install check remains quiet and closed",t=>{
  const root=fixture(t);writeFileSync(focused.vaultConfigPath(root),"{bad");const url=new URL("../scripts/lib-vault-policy.mjs",import.meta.url).href;
  const r=spawnSync(process.execPath,["--input-type=module","-e",`const m=await import(${JSON.stringify(url)});console.log(JSON.stringify({read:m.readVaultConfig(${JSON.stringify(root)}),off:m.selfInstallOff(${JSON.stringify(root)})}));`],{encoding:"utf8",env:ambientEnv()});assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout),{read:{},off:true});assert.equal(r.stderr.split("\n").filter(Boolean).length,1);assert.ok(r.stderr.startsWith(`waypost: vault policy unreadable, using defaults: ${join(root,".projectstore.json")}: `));
});

test("vault policy writer retains exact bytes and errors without extra files",t=>{
  const root=fixture(t),file=focused.vaultConfigPath(root);focused.writeVaultConfig(root,{spec_policy:"required",title:"中文"});const bytes=JSON.stringify({spec_policy:"required",title:"中文"},null,2)+"\n";assert.equal(readFileSync(file,"utf8"),bytes);assert.deepEqual(readdirSync(root),[".projectstore.json"]);
  const circular={};circular.self=circular;assert.throws(()=>focused.writeVaultConfig(root,circular),TypeError);assert.throws(()=>focused.writeVaultConfig(root,1n),TypeError);assert.equal(readFileSync(file,"utf8"),bytes);focused.writeVaultConfig(root,undefined);assert.equal(readFileSync(file,"utf8"),"undefined\n");
});

test("vault policy legacy exemption keeps done and cutoff boundaries",()=>{
  assert.equal(focused.isLegacyStory({status:"planned"},"2026-01-01"),false);assert.equal(focused.isLegacyStory({status:"DONE"},"2026-01-01"),true);assert.equal(focused.isLegacyStory({status:"done",closed_at:"null"},"2026-01-01"),true);assert.equal(focused.isLegacyStory({status:"done",closed_at:"2025-12-31"},"2026-01-01"),true);assert.equal(focused.isLegacyStory({status:"done",closed_at:"2026-01-01"},"2026-01-01"),false);assert.equal(focused.isLegacyStory({status:"done",closed_at:"2027-01-01"},null),true);
});

test("vault policy import adds no I/O, writes or process probes",()=>{
  const url=new URL("../scripts/lib-vault-policy.mjs",import.meta.url).href;
  const code=`import fs from"node:fs";import cp from"node:child_process";import{syncBuiltinESMExports}from"node:module";import{fileURLToPath}from"node:url";const target=fileURLToPath(${JSON.stringify(url)});let calls=0;const blocked=()=>{calls++;throw Error("unexpected action")};for(const name of["readFileSync","realpathSync"]){const original=fs[name];fs[name]=(p,...a)=>String(p instanceof URL?fileURLToPath(p):p)===target?original(p,...a):blocked();}for(const name of["readFile","existsSync","readdirSync","statSync","writeFileSync","appendFileSync","mkdirSync","unlinkSync","renameSync","rmSync"])fs[name]=blocked;cp.spawnSync=blocked;syncBuiltinESMExports();const m=await import(${JSON.stringify(url)});if(calls)throw Error("import action");if(!m.vaultConfigPath("vault").endsWith(".projectstore.json")||!m.isLegacyStory({status:"done"}))throw Error("call controls");if(calls)throw Error("pure action");try{fs.writeFileSync("blocked","x")}catch{}try{cp.spawnSync("blocked")}catch{}if(calls!==2)throw Error("inactive guards");console.log("pure");`;
  const r=spawnSync(process.execPath,["--input-type=module","-e",code],{encoding:"utf8",env:ambientEnv()});assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,"pure\n");
});
