import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {ambientEnv} from "./env.mjs";
import * as owner from "../scripts/capacity.mjs";
import * as leaf from "../scripts/capacity-memory.mjs";
const source=readFileSync(new URL("../scripts/capacity-memory.mjs",import.meta.url),"utf8");

test("memory leaf preserves public binding and bounded owner/leaf surfaces",()=>{
  assert.deepEqual(Object.keys(leaf),["readMemory"]);assert.equal(Object.keys(owner).length,21);
  assert.equal(owner.readMemory,leaf.readMemory);assert.equal(leaf.readMemory.name,"readMemory");assert.equal(leaf.readMemory.length,0);
  assert.ok(Buffer.byteLength(source)<=12000);assert.ok(readFileSync(new URL("../scripts/capacity.mjs",import.meta.url)).length<=24000);
});

test("memory import performs no probing, with a positive invocation control",()=>{
  const probe=`import assert from "node:assert/strict";
const effects=[];globalThis.__wpMemoryImportEffects=effects;
const stub=name=>"export function "+name+"(){globalThis.__wpMemoryImportEffects.push('"+name+"');throw Error('owned '+ '"+name+"')}";
const data=code=>"data:text/javascript;base64,"+Buffer.from(code).toString("base64");
const spec=JSON.stringify("./capacity-probes.mjs"),code=process.argv[1];assert.equal(code.split(spec).length,2);
const deps=data(stub("defaultOs")+stub("defaultReadFile")+stub("defaultRun"));
const imported=await import(data(code.replace(spec,JSON.stringify(deps))));assert.deepEqual(effects,[]);
assert.throws(()=>imported.readMemory(),/owned defaultOs/);assert.deepEqual(effects,["defaultOs"]);`;
  const r=spawnSync(process.execPath,["--input-type=module","--eval",probe,source],{encoding:"utf8",env:ambientEnv(),timeout:5000});assert.equal(r.status,0,r.stderr);
});

test("critical pressure retains fallback probe order and v2 max never tries v1",()=>{
  const calls=[],os={totalmem(){calls.push("total");return 1000},freemem(){calls.push("free");return 100}};
  const r=leaf.readMemory({platform:"darwin",os,run(cmd,args){const key=[cmd,...args].join(" ");calls.push(key);return key==="sysctl -n kern.memorystatus_vm_pressure_level"?"4":null}});
  assert.deepEqual(calls,["total","sysctl -n kern.memorystatus_vm_pressure_level","vm_stat","sysctl -n kern.memorystatus_level","free"]);
  assert.deepEqual(r,{available:0,total:1000,probe:"os.freemem() (lower bound), memory pressure critical"});
  const reads=[];const linux=leaf.readMemory({platform:"linux",os:{totalmem:()=>100000,freemem:()=>1},readFile(path){reads.push(path);return path==="/proc/meminfo"?"MemAvailable: 10 kB\n":path==="/sys/fs/cgroup/memory.max"?"max":null}});
  assert.deepEqual(reads,["/proc/meminfo","/sys/fs/cgroup/memory.max","/sys/fs/cgroup/memory.current"]);assert.equal(linux.available,10240);
});
