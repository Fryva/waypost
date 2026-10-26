import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync,mkdtempSync,realpathSync,mkdirSync,writeFileSync,copyFileSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {pathToFileURL} from "node:url";
import {spawnSync} from "node:child_process";
import {ambientEnv} from "./env.mjs";
import * as facade from "../scripts/lib.mjs";
import * as focused from "../scripts/lib-resources.mjs";

function fixture(t){const root=realpathSync(mkdtempSync(join(tmpdir(),"wp-resource-test-")));t.after(()=>rmSync(root,{recursive:true,force:true}));return root;}
function child(code){const r=spawnSync(process.execPath,["--input-type=module","-e",code],{encoding:"utf8",env:ambientEnv()});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);}

test("resource leaf preserves facade bindings, arity and read budget",()=>{
  const arities={pluginRoot:0,loadLayout:1,folderByKind:2,loadTemplate:2,renderTemplate:2};assert.deepEqual(Object.keys(focused).sort(),Object.keys(arities).sort());
  for(const [name,arity]of Object.entries(arities)){assert.equal(facade[name],focused[name]);assert.equal(focused[name].name,name);assert.equal(focused[name].length,arity);}
  assert.ok(readFileSync(new URL("../scripts/lib-resources.mjs",import.meta.url)).length<=4000);
});

test("resource template rendering preserves coercion, JSON, inherited keys and missing variables",()=>{
  const values=Object.assign(Object.create({inherited:"prototype"}),{title:'"\n中文',items:["a",2],nil:null,unset:undefined});
  assert.equal(focused.renderTemplate("{{title_json}}|{{items}}|{{nil}}|{{unset}}|{{inherited}}|{{missing}}|{{missing_json}}",values),JSON.stringify(values.title)+'|["a",2]|null|undefined|prototype||""');
  assert.equal(focused.renderTemplate("{{x}} {{x_json}}",{x:1n}),'1 "1"');
  assert.throws(()=>focused.renderTemplate("{{x}}",{x:[1n]}),TypeError);
  assert.throws(()=>focused.renderTemplate(null,{}),TypeError);assert.throws(()=>focused.renderTemplate("{{x}}",null),TypeError);
});

test("resource folder lookup returns the original first matching object",()=>{
  const a={kind:"adr"},b={kind:"adr"};assert.equal(focused.folderByKind({folders:[a,b]},"adr"),a);assert.equal(focused.folderByKind({folders:[a]},"story"),null);assert.throws(()=>focused.folderByKind({},"adr"),TypeError);
});

test("resource root keeps call-time overrides and percent-decoded default in a path with spaces",t=>{
  const root=join(fixture(t),"tool root 中文"),scripts=join(root,"scripts");mkdirSync(scripts,{recursive:true});const target=join(scripts,"lib-resources.mjs");copyFileSync(new URL("../scripts/lib-resources.mjs",import.meta.url),target);
  const url=pathToFileURL(target).href;
  const result=child(`delete process.env.WAYPOST_HOME;delete process.env.CLAUDE_PLUGIN_ROOT;const m=await import(${JSON.stringify(url)});const out=[m.pluginRoot()];process.env.CLAUDE_PLUGIN_ROOT="relative legacy";out.push(m.pluginRoot());process.env.WAYPOST_HOME="relative neutral";out.push(m.pluginRoot());process.env.WAYPOST_HOME="";out.push(m.pluginRoot());delete process.env.CLAUDE_PLUGIN_ROOT;out.push(m.pluginRoot());console.log(JSON.stringify(out));`);
  assert.deepEqual(result,[root,"relative legacy","relative neutral","relative legacy",root]);
});

test("resource reads stay fresh and retain missing and invalid resource errors",t=>{
  const root=fixture(t);mkdirSync(join(root,"scaffold/layouts"),{recursive:true});mkdirSync(join(root,"templates/en"),{recursive:true});writeFileSync(join(root,"scaffold/layouts/live.json"),'{"value":1}');writeFileSync(join(root,"scaffold/layouts/bad.json"),'{bad');writeFileSync(join(root,"templates/en/live.md.tmpl"),'first');
  const url=new URL("../scripts/lib-resources.mjs",import.meta.url).href;
  const result=child(`import{writeFileSync}from"node:fs";process.env.WAYPOST_HOME=${JSON.stringify(root)};const m=await import(${JSON.stringify(url)});const first=[m.loadLayout("live").value,m.loadTemplate("en","live")];writeFileSync(${JSON.stringify(join(root,"scaffold/layouts/live.json"))},'{"value":2}');writeFileSync(${JSON.stringify(join(root,"templates/en/live.md.tmpl"))},"second");const next=[m.loadLayout("live").value,m.loadTemplate("en","live")];let missing,bad,template;try{m.loadLayout("missing")}catch(e){missing=e.message}try{m.loadLayout("bad")}catch(e){bad=e.name}try{m.loadTemplate("en","missing")}catch(e){template=e.message}console.log(JSON.stringify({first,next,missing,bad,template}));`);
  assert.deepEqual(result.first,[1,"first"]);assert.deepEqual(result.next,[2,"second"]);assert.equal(result.missing,`Layout not found: missing (expected at ${join(root,"scaffold/layouts/missing.json")})`);assert.equal(result.bad,"SyntaxError");assert.equal(result.template,"Template not found: templates/en/missing.md.tmpl");
});

test("facade heading cache retains retry, shared object and independent query-import ownership",t=>{
  const root=fixture(t),a=join(root,"A"),b=join(root,"B");for(const dir of[a,b])mkdirSync(join(dir,"scaffold"),{recursive:true});writeFileSync(join(a,"scaffold/headings.json"),'{bad');writeFileSync(join(b,"scaffold/headings.json"),JSON.stringify({headings:{x:{en:["B"]}}}));
  const url=new URL("../scripts/lib.mjs",import.meta.url).href;
  const result=child(`import{writeFileSync}from"node:fs";process.env.WAYPOST_HOME=${JSON.stringify(a)};const A=await import(${JSON.stringify(url+"?resources-A")});let failed=false;try{A.loadHeadingsRegistry()}catch{failed=true}writeFileSync(${JSON.stringify(join(a,"scaffold/headings.json"))},JSON.stringify({headings:{x:{en:["A"]}}}));const ra=A.loadHeadingsRegistry();ra.headings.x.en[0]="mutated";process.env.WAYPOST_HOME=${JSON.stringify(b)};const B=await import(${JSON.stringify(url+"?resources-B")});const rb=B.loadHeadingsRegistry();console.log(JSON.stringify({failed,a:A.heading("x"),b:B.heading("x"),different:ra!==rb,sameA:A.loadHeadingsRegistry()===ra,sameB:B.loadHeadingsRegistry()===rb}));`);
  assert.deepEqual(result,{failed:true,a:"mutated",b:"B",different:true,sameA:true,sameB:true});
});

test("resource leaf import performs no own I/O, writes or process probes",()=>{
  const url=new URL("../scripts/lib-resources.mjs",import.meta.url).href;
  const code=`import fs from"node:fs";import cp from"node:child_process";import{syncBuiltinESMExports}from"node:module";import{fileURLToPath}from"node:url";const target=fileURLToPath(${JSON.stringify(url)});let calls=0;const blocked=()=>{calls++;throw Error("unexpected I/O")};for(const name of["readFileSync","realpathSync"]){const original=fs[name];fs[name]=(p,...a)=>String(p instanceof URL?fileURLToPath(p):p)===target?original(p,...a):blocked();}for(const name of["readFile","existsSync","readdirSync","statSync","writeFileSync","appendFileSync","mkdirSync","unlinkSync","renameSync","rmSync"])fs[name]=blocked;cp.spawnSync=blocked;syncBuiltinESMExports();const m=await import(${JSON.stringify(url)});if(calls)throw Error("import I/O");fs.readFileSync=blocked;fs.realpathSync=blocked;syncBuiltinESMExports();process.env.WAYPOST_HOME="call-time root";if(m.pluginRoot()!=="call-time root"||m.renderTemplate("{{x}}",{x:"ok"})!=="ok"||m.folderByKind({folders:[]},"adr")!==null)throw Error("call controls");if(calls)throw Error("pure call I/O");try{fs.writeFileSync("blocked","x")}catch{}try{cp.spawnSync("blocked")}catch{}if(calls!==2)throw Error("inactive guards");console.log("pure");`;
  const result=spawnSync(process.execPath,["--input-type=module","-e",code],{encoding:"utf8",env:ambientEnv()});assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,"pure\n");
});
