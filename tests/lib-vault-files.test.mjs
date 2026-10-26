import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync,mkdtempSync,realpathSync,mkdirSync,writeFileSync,rmSync,symlinkSync,utimesSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {ambientEnv} from "./env.mjs";
import * as facade from "../scripts/lib.mjs";
import * as focused from "../scripts/lib-vault-files.mjs";

function fixture(t) {
  const root=realpathSync(mkdtempSync(join(tmpdir(),"wp-vault-files-test-")));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const vault=join(root,"vault"),epics=join(vault,"epics"),epic=join(epics,"E"),stories=join(epic,"stories");
  for(const dir of [stories,join(stories,"folder"),join(stories,"bad","README.md"),join(stories,"orphan"),join(epics,"_templates","stories"),join(epics,".hidden","stories"),join(root,"second")])mkdirSync(dir,{recursive:true});
  for(const path of [join(stories,"a.md"),join(stories,".hidden.md"),join(stories,"caps.MD"),join(stories,"folder","README.md"),join(stories,"orphan","nested.md"),join(epic,"story-stand.md"),join(epics,"README.md"),join(epics,"_templates","stories","template.md"),join(epics,".hidden","stories","hidden.md"),join(root,"non-dir")])writeFileSync(path,"fixture\n");
  return {root,vault,epics,epic,stories};
}

test("vault file leaf preserves facade bindings and arity",()=>{
  const contracts={listEpicDirs:1,listStoryFiles:1,listEpicStories:1,storyRefOf:2,storyPathOf:2,realPath:1,pathUnder:2,isInsideVault:2,listVaultStoryFiles:1,lastVaultActivityMs:1};
  assert.deepEqual(Object.keys(focused).sort(),Object.keys(contracts).sort());
  for(const [name,arity]of Object.entries(contracts)){assert.equal(facade[name],focused[name],name);assert.equal(focused[name].name,name);assert.equal(focused[name].length,arity);}
  assert.ok(readFileSync(new URL("../scripts/lib-vault-files.mjs",import.meta.url)).length<=12000,"read-only domain stays within one read");
});

test("vault discovery preserves shapes, sorted order and distinct hidden/README filters",t=>{
  const {vault,epics,epic,stories}=fixture(t);
  assert.deepEqual(focused.listEpicDirs(epics),["E"]);
  const rels=[".hidden.md","a.md","bad/README.md","folder/README.md"];
  assert.deepEqual(focused.listStoryFiles(stories).map(s=>s.rel),rels);
  assert.deepEqual(focused.listEpicStories(epic).map(s=>s.rel),[...rels.map(r=>"stories/"+r),"story-stand.md"]);
  const all=focused.listVaultStoryFiles(vault);
  assert.equal(all.length,7);
  assert.ok(all.includes(join(epics,"_templates","stories","template.md")));
  assert.ok(all.includes(join(epics,".hidden","stories","hidden.md")));
  for(const [ref,path]of [["E/a",join(stories,"a.md")],["E/folder",join(stories,"folder","README.md")],["E/story-stand",join(epic,"story-stand.md")]]){assert.equal(focused.storyRefOf(path,vault),ref);assert.equal(focused.storyPathOf(ref,vault),path);}
  assert.equal(focused.storyPathOf("E/a/ignored",vault),join(stories,"a.md"));
  assert.equal(focused.storyRefOf("E/a/ignored",vault),null);
  assert.equal(focused.storyRefOf("E/missing",vault),null);
  assert.equal(focused.storyRefOf("E/missing"),"E/missing");
});

test("vault discovery keeps missing versus non-directory error boundaries",t=>{
  const {root}=fixture(t),missing=join(root,"missing"),file=join(root,"non-dir");
  assert.deepEqual(focused.listStoryFiles(missing),[]);
  assert.throws(()=>focused.listStoryFiles(file));
  for(const path of [missing,file]){assert.deepEqual(focused.listEpicDirs(path),[]);assert.deepEqual(focused.listEpicStories(path),[]);assert.deepEqual(focused.listVaultStoryFiles(path),[]);assert.equal(focused.lastVaultActivityMs(path),null);}
});

test("vault discovery follows stat symlinks and containment accepts lexical OR real paths",t=>{
  const {root,vault,epics,epic,stories}=fixture(t),alias=join(root,"alias-vault"),outside=join(root,"outside.md"),escape=join(vault,"escape.md");writeFileSync(outside,"outside\n");
  try{symlinkSync(vault,alias,"dir");symlinkSync(outside,escape,"file");symlinkSync(join(stories,"a.md"),join(stories,"link.md"),"file");symlinkSync(join(stories,"folder"),join(stories,"link-dir"),"dir");symlinkSync(join(stories,"missing.md"),join(stories,"broken.md"),"file");symlinkSync(epic,join(epics,"alias"),"dir");}catch(e){if(["EPERM","EACCES","ENOTSUP"].includes(e.code)){t.skip("symlinks unavailable on this host");return;}throw e;}
  assert.deepEqual(focused.listEpicDirs(epics),["E","alias"]);
  const rels=focused.listStoryFiles(stories).map(s=>s.rel);assert.ok(rels.includes("link.md"));assert.ok(rels.includes("link-dir/README.md"));assert.ok(!rels.includes("broken.md"));
  const aliased=join(alias,"epics","E","stories","a.md");assert.equal(focused.isInsideVault(aliased,vault),true);assert.equal(focused.storyRefOf(aliased,vault),"E/a");
  assert.equal(focused.realPath(escape),outside);assert.equal(focused.isInsideVault(escape,vault),true);
  assert.equal(focused.isInsideVault(join(vault,"deleted.md"),vault),true);assert.equal(focused.isInsideVault(join(root,"vault2","x.md"),vault),false);
});

test("vault activity uses fresh visible Markdown mtimes and excludes hidden/non-Markdown files",t=>{
  const {root}=fixture(t),dir=join(root,"activity");mkdirSync(join(dir,"sub"),{recursive:true});mkdirSync(join(dir,".hidden"));
  for(const [name,stamp]of [["old.md",1000],["new.md",2000],["sub/nested.md",3000],[".hidden/ignored.md",9000],[".top.md",10000],["data.txt",11000]]){const path=join(dir,name);writeFileSync(path,"fixture\n");utimesSync(path,stamp,stamp);}
  assert.equal(focused.lastVaultActivityMs(dir),3000000);utimesSync(join(dir,"sub","nested.md"),4000,4000);assert.equal(focused.lastVaultActivityMs(dir),4000000);rmSync(join(dir,"sub","nested.md"));assert.equal(focused.lastVaultActivityMs(dir),2000000);
});

test("vault paths read default platform and cwd at call time",t=>{
  const {root}=fixture(t),url=new URL("../scripts/lib-vault-files.mjs",import.meta.url).href;
  assert.equal(focused.pathUnder("/Vault/A","/vault",{platform:"win32"}),"A");assert.equal(focused.pathUnder("/Vault/A","/vault",{platform:"darwin"}),null);
  const code=`const m=await import(${JSON.stringify(url)});const descriptor=Object.getOwnPropertyDescriptor(process,"platform");Object.defineProperty(process,"platform",{...descriptor,value:"win32"});const win=m.pathUnder("/Vault/A","/vault");Object.defineProperty(process,"platform",{...descriptor,value:"darwin"});const darwin=m.pathUnder("/Vault/A","/vault");Object.defineProperty(process,"platform",descriptor);const first=m.realPath("missing");process.chdir("second");const second=m.realPath("missing");console.log(JSON.stringify({win,darwin,first,second}));`;
  const r=spawnSync(process.execPath,["--input-type=module","-e",code],{encoding:"utf8",cwd:root,env:ambientEnv()});assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout),{win:"A",darwin:null,first:join(root,"missing"),second:join(root,"second","missing")});
});

test("vault file leaf import performs no I/O or probes", () => {
  const url = new URL("../scripts/lib-vault-files.mjs", import.meta.url).href;
  const path = fileURLToPath(url);
  const code = `import fs from "node:fs";import cp from "node:child_process";import {syncBuiltinESMExports} from "node:module";import {fileURLToPath} from "node:url";
    let calls=0;const blocked=()=>{calls++;throw Error("unexpected I/O")};
    const read=fs.readFileSync;fs.readFileSync=(p,...args)=>{const name=p instanceof URL?fileURLToPath(p):String(p);return name===${JSON.stringify(path)}?read(p,...args):blocked()};
    for(const name of ["readFile","writeFileSync","appendFileSync","mkdirSync","unlinkSync","renameSync","rmSync","readdirSync","statSync","existsSync"])fs[name]=blocked;
    const real=fs.realpathSync;fs.realpathSync=(p,...args)=>{const name=p instanceof URL?fileURLToPath(p):String(p);return name===${JSON.stringify(path)}?real(p,...args):blocked()};
    cp.spawnSync=blocked;syncBuiltinESMExports();
    const m=await import(${JSON.stringify(url)});
    if(typeof m.listStoryFiles!=="function")throw Error("import positive control");
    if(calls!==0)throw Error("unexpected import/parser I/O:"+calls);
    try{fs.readFileSync("not-the-module")}catch{};try{cp.spawnSync("probe")}catch{};
    try{fs.existsSync("not-the-module")}catch{};try{fs.realpathSync("not-the-module")}catch{};
    if(calls!==4)throw Error("inactive I/O guards");console.log("pure");`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], {encoding:"utf8",env:ambientEnv()});
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "pure\n");
});

test("vault file calls add no writes or probes",t=>{
  const {vault,epics,epic,stories}=fixture(t),url=new URL("../scripts/lib-vault-files.mjs",import.meta.url).href;
  const code=`import fs from "node:fs";import cp from "node:child_process";import{syncBuiltinESMExports}from"node:module";let calls=0;const denied=()=>{calls++;throw Error("unexpected mutation/probe")};for(const name of["writeFileSync","appendFileSync","mkdirSync","unlinkSync","renameSync","rmSync"])fs[name]=denied;cp.spawnSync=denied;syncBuiltinESMExports();const m=await import(${JSON.stringify(url)});const v=${JSON.stringify(vault)},s=${JSON.stringify(stories)},e=${JSON.stringify(epic)},es=${JSON.stringify(epics)};m.listEpicDirs(es);m.listStoryFiles(s);m.listEpicStories(e);m.storyRefOf(s+"/a.md",v);m.storyPathOf("E/a",v);m.realPath(s+"/a.md");m.pathUnder(s+"/a.md",v);m.isInsideVault(s+"/a.md",v);m.listVaultStoryFiles(v);m.lastVaultActivityMs(v);if(calls!==0)throw Error("unexpected writes/probes");try{fs.writeFileSync("blocked","x")}catch{};try{cp.spawnSync("blocked")}catch{};if(calls!==2)throw Error("inactive guards");console.log("readonly");`;
  const r=spawnSync(process.execPath,["--input-type=module","-e",code],{encoding:"utf8",env:ambientEnv()});assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,"readonly\n");
});
