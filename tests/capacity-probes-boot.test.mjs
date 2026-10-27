import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {ambientEnv} from "./env.mjs";
import * as owner from "../scripts/capacity.mjs";
import * as boot from "../scripts/capacity-boot.mjs";
import * as probes from "../scripts/capacity-probes.mjs";

test("capacity probe and boot leaves preserve bounded surfaces and public boot aliases",()=>{
  assert.deepEqual(Object.keys(probes),["defaultOs","defaultReadFile","defaultRun","defaultWait"]);
  assert.deepEqual(Object.keys(boot),["AUTHORITY_TIMEOUT_MS","AUTHORITY_WRITE_TIMEOUT_MS","UPTIME_MARGIN_S","authorityOnce","bootAuthority","bootIdentity","confirmBoot","sameBoot","uptimeSaysOtherBoot"]);
  assert.equal(Object.keys(owner).length,21);
  for(const name of Object.keys(boot))assert.equal(owner[name],boot[name]);
  for(const [name,n]of Object.entries({defaultOs:0,defaultReadFile:1,defaultRun:2,defaultWait:1}))assert.equal(probes[name].length,n);
  for(const [name,n]of Object.entries({bootIdentity:0,sameBoot:2,bootAuthority:0,authorityOnce:0,uptimeSaysOtherBoot:2,confirmBoot:2}))assert.equal(boot[name].length,n);
  assert.ok(readFileSync(new URL("../scripts/capacity-probes.mjs",import.meta.url)).length<=2500);
  assert.ok(readFileSync(new URL("../scripts/capacity-boot.mjs",import.meta.url)).length<=9000);
});

test("default wrappers and boot helpers retain controlled call-time and lazy error semantics",()=>{
  const r=spawnSync(process.execPath,[fileURLToPath(new URL("./helpers/capacity-probe-scenarios.mjs",import.meta.url)),new URL("../scripts/capacity.mjs",import.meta.url).href,new URL("../scripts/capacity-probes.mjs",import.meta.url).href],{encoding:"utf8",env:ambientEnv(),timeout:7500,maxBuffer:4*1024*1024});
  assert.equal(r.status,0,r.stderr);const out=JSON.parse(r.stdout);
  assert.equal(out.positiveControls,true);assert.equal(out.restored,true);
  assert.equal(out.results.length,46);assert.equal(out.trace.length,28);
  const result=name=>out.results.find(r=>r.name===name).value;
  assert.equal(result("read-failure"),null);assert.equal(result("run-ok"),"ok");
  for(const name of ["run-nonzero","run-error","run-null","run-throw"])assert.equal(result(name),null);
  assert.deepEqual(result("run-missing-stdout"),{special:"undefined"});
  const spawns=out.trace.filter(row=>row[0]==="spawn");
  assert.deepEqual(spawns[0][3],{shell:false,stdio:["ignore","pipe","ignore"],encoding:"utf8",timeout:2000});
  for(const row of spawns.filter(row=>row[1]==="owned-probe"))assert.deepEqual(row[3],{shell:false,stdio:["ignore","pipe","ignore"],encoding:"utf8",timeout:17});
  assert.deepEqual(result("default-clock-first"),{kind:"epoch",value:90});
  assert.deepEqual(result("default-clock-second"),{kind:"epoch",value:190});
  assert.equal(result("once-after-throw"),null);
});
