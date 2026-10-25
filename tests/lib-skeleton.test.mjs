import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {ambientEnv} from "./env.mjs";
import * as facade from "../scripts/lib.mjs";
import * as focused from "../scripts/lib-skeleton.mjs";

test("vault skeleton leaf preserves facade constants and function bindings", () => {
  const constants = {PURPOSE_CELL:160,TITLE_CELL:80,PATH_CELL:200,INFLIGHT_CAP:5,ERROR_CELL:500};
  const functions = {truncEnd:2,truncFront:2,folderPurpose:2,renderVaultSkeleton:1};
  assert.deepEqual(Object.keys(focused).sort(), [...Object.keys(constants),...Object.keys(functions)].sort());
  for (const [name,value] of Object.entries(constants)) {
    assert.equal(focused[name], value, name);
    assert.equal(facade[name], focused[name], name);
  }
  for (const [name,arity] of Object.entries(functions)) {
    assert.equal(facade[name], focused[name], name);
    assert.equal(focused[name].name,name);
    assert.equal(focused[name].length,arity);
  }
});

test("vault skeleton leaf stays readable in one pass", () => {
  const source=readFileSync(new URL("../scripts/lib-skeleton.mjs",import.meta.url));
  assert.ok(source.length<=10000,`skeleton leaf is ${source.length} UTF-8 bytes`);
});

test("vault skeleton renders frozen facts and options in all four modes", () => {
  const freeze = value => { if(value && typeof value==="object") {for(const child of Object.values(value))freeze(child);Object.freeze(value);} return value; };
  const facts=freeze({vaultPath:"/v",layoutName:"custom",kanbanFile:"board.md",adrIndex:"decisions/README.md",epicFile:"work/<E>/epic.md",
    folders:[{path:"custom",kind:"diagram",counts:{artifacts:2},readme:"# Folder\n\nA | B purpose.\n## Index\n"},{path:"work",kind:"epic",counts:{epics:1,stories:3},readme:null}],
    inFlight:{status:"ok",entries:[{epic:"E",title:"Working"}],total:1}});
  const before=JSON.stringify(facts);
  for(const folderList of [false,true])for(const folderPurposes of [false,true]) {
    const out=focused.renderVaultSkeleton(facts,Object.freeze({folderList,folderPurposes}));
    assert.ok(out.endsWith("\n"));
    assert.ok(out.includes(folderList ? "- `custom/` diagram: 2" : "| `custom/` | diagram | 2 |"));
    assert.equal(out.includes("A \\| B purpose."),folderPurposes);
    assert.ok(out.includes("1 epics · 3 stories"));
    assert.ok(out.includes("- E · Working"));
  }
  assert.equal(JSON.stringify(facts),before);
});

test("vault skeleton import and rendering perform no I/O, probes or clock reads", () => {
  const url = new URL("../scripts/lib-skeleton.mjs", import.meta.url).href;
  const path = fileURLToPath(url);
  const code = `import fs from "node:fs";import cp from "node:child_process";import {syncBuiltinESMExports} from "node:module";import {fileURLToPath} from "node:url";
    let calls=0;const blocked=()=>{calls++;throw Error("unexpected I/O")};
    const read=fs.readFileSync;fs.readFileSync=(p,...args)=>{const name=p instanceof URL?fileURLToPath(p):String(p);return name===${JSON.stringify(path)}?read(p,...args):blocked()};
    for(const name of ["readFile","writeFileSync","appendFileSync","mkdirSync","unlinkSync","renameSync","rmSync","readdirSync","statSync"])fs[name]=blocked;
    cp.spawnSync=blocked;syncBuiltinESMExports();
    let clockCalls=0;const clockBlocked=()=>{clockCalls++;throw Error("unexpected clock")};
    globalThis.Date=new Proxy(Date,{apply:clockBlocked,construct:clockBlocked,get:(t,p,r)=>p==="now"?clockBlocked:Reflect.get(t,p,r)});
    const m=await import(${JSON.stringify(url)});
    if(m.truncEnd("abc",2)!=="a…"||m.truncFront("abc",2)!=="…c"||m.folderPurpose(null,"adr")!=="adr")throw Error("helper positive control");
    const facts={vaultPath:"/v",folders:[{path:"custom",kind:"epic",counts:{epics:1,stories:3},readme:null}],inFlight:{status:"ok",entries:[{epic:"E",title:"Work"}],total:1}};
    for(const folderList of [false,true])if(!m.renderVaultSkeleton(facts,{folderList}).includes("1 epics · 3 stories"))throw Error("renderer positive control");
    if(clockCalls!==0)throw Error("unexpected import/render clock:"+clockCalls);
    if(calls!==0)throw Error("unexpected import/parser I/O:"+calls);
    try{fs.readFileSync("not-the-module")}catch{};try{cp.spawnSync("probe")}catch{};
    try{Date.now()}catch{};try{Date()}catch{};try{new Date()}catch{};
    if(calls!==2||clockCalls!==3)throw Error("inactive I/O/clock guards");console.log("pure");`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], {encoding:"utf8",env:ambientEnv()});
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "pure\n");
});
