import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,realpathSync,mkdirSync,writeFileSync,readFileSync,symlinkSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {spawnSync} from "node:child_process";
import {ambientEnv} from "./env.mjs";
import * as facade from "../scripts/lib.mjs";
import * as focused from "../scripts/lib-node-index.mjs";
function fixture(t){const root=realpathSync(mkdtempSync(join(tmpdir(),"wp-node-index-test-")));t.after(()=>rmSync(root,{recursive:true,force:true}));const vault=join(root,"vault"),raw='\ufeff---\r\nid: alpha\r\ntitle: Alpha\r\nstatus: accepted\r\n---\r\n# Alpha\r\n';const files={"adr/README.md":"# Skip\n","adr/0001-alpha.md":raw,"adr/empty.md":'---\nid: ""\nslug: ignored\n---\n',"research/same.md":"---\nslug: alpha\n---\n","epics/E/epic.md":"---\nid: E\n---\n","epics/E/stories/a.md":"---\nid: a\n---\n","epics/E/stories/folder/README.md":"---\nslug: folder\n---\n","epics/E/story-001-stand.md":"---\nid: 1\n---\n","epics/.hidden/stories/hidden.md":"---\nid: hidden\n---\n","epics/_templates/stories/blank.md":"---\nid: blank\n---\n"};for(const[rel,text]of Object.entries(files)){const p=join(vault,rel);mkdirSync(join(p,".."),{recursive:true});writeFileSync(p,text);}mkdirSync(join(vault,"epics/E/stories/bad/README.md"),{recursive:true});writeFileSync(join(root,"non-dir"),"file");const layout={folders:[{kind:"epic",path:"epics"},{kind:"adr",path:"adr",prefix:"adr"},{kind:"research",path:"research"}]};return{root,vault,cfg:{vault_path:vault},layout,raw};}
function child(code){const r=spawnSync(process.execPath,["--input-type=module","-e",code],{encoding:"utf8",env:ambientEnv()});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);}

test("node index preserves facade binding, arity and read budget",()=>{
  assert.deepEqual(Object.keys(focused),["buildNodeIndex"]);assert.equal(facade.buildNodeIndex,focused.buildNodeIndex);assert.equal(focused.buildNodeIndex.name,"buildNodeIndex");assert.equal(focused.buildNodeIndex.length,2);assert.ok(readFileSync(new URL("../scripts/lib-node-index.mjs",import.meta.url)).length<=6000);
});

test("node index preserves layout and story order, raw body and field fallbacks",t=>{
  const{cfg,layout,raw}=fixture(t),index=focused.buildNodeIndex(cfg,layout);assert.deepEqual(index.nodes.slice(0,4).map(n=>n.path),["epics/E/epic.md","epics/E/stories/a.md","epics/E/stories/folder/README.md","epics/E/story-001-stand.md"]);assert.equal(index.nodes.length,7);
  const alpha=index.byPath.get("adr/0001-alpha.md"),empty=index.byPath.get("adr/empty.md"),folder=index.byPath.get("epics/E/stories/folder/README.md");assert.equal(alpha.body,raw);assert.equal(alpha.identity,"alpha");assert.equal(alpha.title,"Alpha");assert.equal(alpha.status,"accepted");assert.equal(empty.identity,"");assert.equal(empty.title,"empty");assert.equal(empty.status,null);assert.equal(index.byIdentity.has("ignored"),false);assert.equal(folder.stem,"folder");assert.equal(folder.story,true);assert.ok(index.byStem.has("story-001-stand"));assert.deepEqual([...index.byPath.keys()],index.nodes.map(n=>n.path));
});

test("node index keeps map aliases, distinct duplicate paths and fresh per-call containers",t=>{
  const{cfg,layout}=fixture(t),adr=layout.folders[1],duplicate={folders:[adr,adr]},index=focused.buildNodeIndex(cfg,duplicate);assert.equal(index.nodes.length,4);assert.equal(index.byPath.get("adr/0001-alpha.md"),index.nodes[2]);assert.deepEqual(index.byIdentity.get("alpha"),[index.nodes[0],index.nodes[2]]);assert.notEqual(index.nodes[0],index.nodes[2]);assert.deepEqual(index.byStem.get("0001-alpha"),[index.nodes[0],index.nodes[2]]);
  for(const map of [index.byPath,index.byIdentity,index.byStem])for(const value of map.values())for(const node of Array.isArray(value)?value:[value])assert.ok(index.nodes.includes(node));
  index.nodes[0].title="caller mutation";const next=focused.buildNodeIndex(cfg,duplicate);for(const key of ["nodes","byPath","byIdentity","byStem"])assert.notEqual(next[key],index[key]);assert.notEqual(next.nodes[0],index.nodes[0]);assert.equal(next.nodes[0].title,"Alpha");
});

test("node index skips read failures but propagates outer directory failures",t=>{
  const{root,vault,cfg,layout}=fixture(t),url=new URL("../scripts/lib-node-index.mjs",import.meta.url).href;const out=child(`import fs from"node:fs";import{syncBuiltinESMExports}from"node:module";const m=await import(${JSON.stringify(url)}),read=fs.readFileSync,list=fs.readdirSync;fs.readFileSync=(p,...a)=>{if(p===${JSON.stringify(join(vault,"adr/0001-alpha.md"))})throw Object.assign(Error("read failure"),{code:"EIO"});return read(p,...a)};syncBuiltinESMExports();const paths=m.buildNodeIndex(${JSON.stringify(cfg)},${JSON.stringify(layout)}).nodes.map(n=>n.path);fs.readdirSync=(p,...a)=>{if(p===${JSON.stringify(join(vault,"adr"))})throw Object.assign(Error("directory failure"),{code:"EIO"});return list(p,...a)};syncBuiltinESMExports();let error;try{m.buildNodeIndex(${JSON.stringify(cfg)},${JSON.stringify(layout)})}catch(e){error={message:e.message,code:e.code}}console.log(JSON.stringify({paths,error}));`);assert.ok(!out.paths.includes("adr/0001-alpha.md"));assert.deepEqual(out.error,{message:"directory failure",code:"EIO"});assert.throws(()=>focused.buildNodeIndex({vault_path:root},{folders:[{kind:"adr",path:"non-dir"}]}));assert.deepEqual(focused.buildNodeIndex({vault_path:join(root,"missing")},layout).nodes,[]);
});

test("node index preserves lexical symlink paths and stat-following discovery",t=>{
  const{vault,cfg,layout}=fixture(t);try{symlinkSync(join(vault,"adr/0001-alpha.md"),join(vault,"adr/link.md"),"file");symlinkSync(join(vault,"epics/E"),join(vault,"epics/alias"),"dir");symlinkSync(join(vault,"no-target"),join(vault,"epics/E/stories/broken.md"),"file");}catch(e){if(["EPERM","EACCES","ENOTSUP"].includes(e.code)){t.skip("symlinks unavailable on host");return;}throw e;}
  const index=focused.buildNodeIndex(cfg,layout);assert.equal(index.byPath.get("adr/link.md").abs,join(vault,"adr/link.md"));assert.ok(index.byPath.has("epics/alias/stories/a.md"));assert.equal(index.byPath.has("epics/E/stories/broken.md"),false);assert.equal(index.byIdentity.get("alpha").length,3);
});

test("node index import adds no I/O, probes, writes or timers",()=>{
  const urls=["lib-node-index.mjs","lib-frontmatter.mjs","lib-identity.mjs","lib-vault-files.mjs"].map(n=>new URL("../scripts/"+n,import.meta.url).href);
  const code=`import fs from"node:fs";import cp from"node:child_process";import{syncBuiltinESMExports}from"node:module";import{fileURLToPath}from"node:url";const allowed=new Set(${JSON.stringify(urls)}.map(u=>fileURLToPath(u)));let calls=0;const blocked=()=>{calls++;throw Error("unexpected action")};for(const name of["readFileSync","realpathSync"]){const original=fs[name];fs[name]=(p,...a)=>allowed.has(String(p instanceof URL?fileURLToPath(p):p))?original(p,...a):blocked();}for(const name of["readFile","existsSync","readdirSync","statSync","writeFileSync","appendFileSync","mkdirSync","unlinkSync","renameSync","rmSync"])fs[name]=blocked;cp.spawnSync=blocked;const timer=setTimeout;globalThis.setTimeout=blocked;syncBuiltinESMExports();const m=await import(${JSON.stringify(urls[0])});globalThis.setTimeout=timer;if(calls)throw Error("import action");if(m.buildNodeIndex({vault_path:"unused"},{folders:[]}).nodes.length)throw Error("empty index control");if(calls)throw Error("empty call action");try{fs.writeFileSync("blocked","x")}catch{}try{cp.spawnSync("blocked")}catch{}if(calls!==2)throw Error("inactive guards");console.log("pure");`;
  const r=spawnSync(process.execPath,["--input-type=module","-e",code],{encoding:"utf8",env:ambientEnv()});assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,"pure\n");
});

test("node index filesystem calls add no writes or process probes",t=>{
  const{cfg,layout}=fixture(t),url=new URL("../scripts/lib-node-index.mjs",import.meta.url).href;const out=child(`import fs from"node:fs";import cp from"node:child_process";import{syncBuiltinESMExports}from"node:module";let calls=0;const blocked=()=>{calls++;throw Error("unexpected mutation")};for(const name of["writeFileSync","appendFileSync","mkdirSync","unlinkSync","renameSync","rmSync"])fs[name]=blocked;cp.spawnSync=blocked;syncBuiltinESMExports();const m=await import(${JSON.stringify(url)});const count=m.buildNodeIndex(${JSON.stringify(cfg)},${JSON.stringify(layout)}).nodes.length;if(calls)throw Error("mutation");try{fs.writeFileSync("blocked","x")}catch{}try{cp.spawnSync("blocked")}catch{}console.log(JSON.stringify({count,calls}));`);assert.deepEqual(out,{count:7,calls:2});
});
