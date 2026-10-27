import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {spawnSync} from "node:child_process";
import {ambientEnv} from "./env.mjs";
import * as leaf from "../scripts/token-collect.mjs";
import * as owner from "../scripts/tokens.mjs";
const source=readFileSync(new URL("../scripts/token-collect.mjs",import.meta.url),"utf8");

test("transcript collector has a bounded private surface and owner stays below budget",()=>{
  assert.deepEqual(Object.keys(leaf),["collect"]);assert.equal(leaf.collect.length,3);assert.equal(leaf.collect.name,"collect");
  assert.equal(Object.keys(owner).length,6);assert.equal("collect" in owner,false);
  assert.ok(Buffer.byteLength(source)<=12000);
  assert.ok(readFileSync(new URL("../scripts/tokens.mjs",import.meta.url)).length<=24000);
});

test("collector import performs no source reads, reductions or analyzer creation",()=>{
  // Use the exact leaf source; data URLs separate loader reads from collector
  // reads, and dependency sentinels detect even swallowed import-time calls.
  const probe=`import assert from "node:assert/strict";
import fs from "node:fs"; import {syncBuiltinESMExports} from "node:module";
const effects=[];globalThis.__wpCollectorImportEffects=effects;
for(const name of ["readFileSync","existsSync","readdirSync"])fs[name]=()=>{effects.push(name);throw Error("import-time "+name)};
syncBuiltinESMExports();
const moduleURL=code=>"data:text/javascript;base64,"+Buffer.from(code).toString("base64");
const stub=name=>"export function "+name+"(){globalThis.__wpCollectorImportEffects.push('"+name+"');throw Error('import-time dependency')}";
let code=process.argv[1];
for(const [path,body]of [["./token-navigation.mjs",stub("createNavigationAnalyzer")],["./token-requests.mjs",stub("ingest")+stub("countCommandRuns")]]){
 const spec=JSON.stringify(path);assert.equal(code.split(spec).length,2);code=code.replace(spec,JSON.stringify(moduleURL(body)));
}
const imported=await import(moduleURL(code));assert.deepEqual(Object.keys(imported),["collect"]);assert.deepEqual(effects,[]);`;
  const r=spawnSync(process.execPath,["--input-type=module","--eval",probe,source],{encoding:"utf8",env:ambientEnv(),timeout:5000});
  assert.equal(r.status,0,r.stderr);
});

test("collector keeps subagent attribution, request-period ownership, coverage and call isolation",()=>{
  const root=mkdtempSync(join(tmpdir(),"waypost-collect-"));
  try{
    const dir=join(root,"history"),subs=join(dir,"s","subagents");mkdirSync(subs,{recursive:true});
    const usage=output=>({input_tokens:7,cache_creation_input_tokens:0,cache_read_input_tokens:0,output_tokens:output});
    const rec=(id,time,output)=>({type:"assistant",requestId:id,timestamp:time,message:{model:"m",usage:usage(output),content:[]}});
    writeFileSync(join(subs,"a.meta.json"),JSON.stringify({agentType:"waypost-critic"}));
    writeFileSync(join(subs,"a.jsonl"),JSON.stringify(rec("shared","2026-10-02T00:00:00Z",2))+"\n");
    writeFileSync(join(dir,"s.jsonl"),[rec("shared","2026-10-02T01:00:00Z",9),rec("boundary","2026-10-01T23:59:00Z",1),rec("boundary","2026-10-02T00:05:00Z",4)].map(JSON.stringify).join("\n")+"\n{broken\nnull\n");
    const all=leaf.collect(dir,{},root),again=leaf.collect(dir,{},root);
    assert.notEqual(all.rows,again.rows);assert.notEqual(all.rows.get("shared"),again.rows.get("shared"));
    assert.equal(all.rows.get("shared").bucket,"agent: waypost-critic");assert.equal(all.rows.get("shared").output,9);
    assert.equal(all.audit.coverage.malformed_json_lines,1);assert.equal(all.audit.coverage.invalid_records,1);
    const period=leaf.collect(dir,{since:"2026-10-02",until:"2026-10-03"},root);
    assert.equal(period.rows.has("shared"),true);assert.equal(period.rows.has("boundary"),false);assert.equal(period.excludedRequestIds.has("boundary"),true);
    assert.equal(period.audit.coverage.boundary_crossing_requests,1);
  }finally{rmSync(root,{recursive:true,force:true});}
});
