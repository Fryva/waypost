import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import cp from "node:child_process";
import {syncBuiltinESMExports} from "node:module";
import {createHash} from "node:crypto";
const owner=await import(process.argv[2]),probes=await import(process.argv[3]);
const surface=api=>Object.fromEntries(Object.entries(api).map(([k,v])=>[k,typeof v==="function"?{type:typeof v,name:v.name,arity:v.length,sha:createHash("sha256").update(String(v)).digest("hex")}:{type:typeof v,value:v}]));
const api=surface(owner),wrappers=surface(probes),trace=[],results=[];
const saved=[[fs,"readFileSync",fs.readFileSync],[cp,"spawnSync",cp.spawnSync],...['availableParallelism','loadavg','cpus','totalmem','freemem','uptime'].map(k=>[os,k,os[k]])];
const originalTimer=globalThis.setTimeout,originalNow=Date.now;
let readAction="owned read",runAction={status:0,stdout:"owned stdout"},timerCallback,tick=100000;
const capture=(name,fn)=>{try{results.push({name,value:fn()});}catch(e){results.push({name,error:{name:e.name,message:e.message}});}};
try{
  fs.readFileSync=(path,encoding)=>{trace.push(["read",path,encoding]);return typeof readAction==="function"?readAction():readAction;};
  cp.spawnSync=(cmd,args,options)=>{trace.push(["spawn",cmd,args,options]);return typeof runAction==="function"?runAction():runAction;};
  for(const k of ['availableParallelism','loadavg','cpus','totalmem','freemem','uptime'])os[k]=()=>{trace.push(["os",k]);return k==="uptime"?10:8;};
  syncBuiltinESMExports();
  // Positive controls fail on harmless nonexistent targets before any default
  // system command or boot path can run if builtin mocks did not take effect.
  assert.equal(probes.defaultReadFile("waypost-owned-nonexistent-read"),"owned read");
  assert.equal(probes.defaultRun("waypost-owned-nonexistent-probe",["a"]),"owned stdout");
  assert.deepEqual(trace[0],["read","waypost-owned-nonexistent-read","utf8"]);
  assert.equal(trace[1][0],"spawn");
  const a=probes.defaultOs(),b=probes.defaultOs();assert.notEqual(a,b);
  for(const k of Object.keys(a))assert.equal(a[k],os[k]);
  results.push({name:"os-object",value:{fresh:true,keys:Object.keys(a),bindings:true}});
  capture("read-ok",()=>probes.defaultReadFile("owned"));
  readAction=()=>{throw Error("owned read failure")};capture("read-failure",()=>probes.defaultReadFile("owned"));assert.equal(results.at(-1).value,null);
  for(const[name,action]of [["run-ok",{status:0,stdout:"ok"}],["run-nonzero",{status:2,stdout:"ignored"}],["run-error",{status:0,error:new Error("owned failure")}],["run-null",null],["run-throw",()=>{throw Error("owned spawn failure")}],["run-missing-stdout",{status:0}]]){
    runAction=action;capture(name,()=>probes.defaultRun("owned-probe",["x"],17));
  }
  globalThis.setTimeout=(...args)=>{trace.push(["timer",typeof args[0],args[1],args.length]);timerCallback=args[0];return {owned:true};};
  let settled=false;const pending=probes.defaultWait(19);pending.then(()=>{settled=true});await Promise.resolve();assert.equal(settled,false);assert.equal(typeof timerCallback,"function");timerCallback();await pending;assert.equal(settled,true);results.push({name:"timer",value:{manual:true,settled}});
  const fakeOS={uptime:()=>10};
  capture("linux-id",()=>owner.bootIdentity({platform:"linux",readFile:p=>{trace.push(["boot-read",p]);return " id \n"},os:fakeOS,now:100000}));
  capture("linux-fallback",()=>owner.bootIdentity({platform:"linux",readFile:()=>null,os:fakeOS,now:100000}));
  capture("darwin-id",()=>owner.bootIdentity({platform:"darwin",run:(...args)=>{trace.push(["boot-run",...args]);return "{ sec = 1234, usec = 0 }"},os:fakeOS,now:100000}));
  capture("darwin-fallback",()=>owner.bootIdentity({platform:"darwin",run:()=>null,os:fakeOS,now:100000}));
  capture("other-fallback",()=>owner.bootIdentity({platform:"other",os:fakeOS,now:100000}));
  for(const delta of [120,121])capture("epoch-"+delta,()=>owner.sameBoot({kind:"epoch",value:1000},{kind:"epoch",value:1000+delta}));
  capture("same-id",()=>owner.sameBoot({kind:"boot_id",value:"x"},{kind:"boot_id",value:"x"}));
  capture("different-kind",()=>owner.sameBoot({kind:"epoch",value:1},{kind:"boot_id",value:1}));
  capture("null-boot",()=>owner.sameBoot(null,null));
  for(const value of [" 123 \n","0","", "  ","-1","1.5",null])capture("authority-"+String(value),()=>owner.bootAuthority({platform:"win32",run:(...args)=>{trace.push(["authority-run",...args]);return value}}));
  capture("authority-timeout",()=>owner.bootAuthority({platform:"win32",timeoutMs:7,run:(...args)=>{trace.push(["authority-run",...args]);return "456"}}));
  capture("authority-other",()=>owner.bootAuthority({platform:"linux",run:()=>{throw Error("unexpected run")}}));
  let reads=0;const mutable={platform:"win32",run:()=>{throw Error("stale probes reference")}};
  const once=owner.authorityOnce(mutable);assert.equal(reads,0);mutable.run=()=>{reads++;return "71"};
  const first=once();assert.equal(once(),first);assert.equal(reads,1);
  const independent=owner.authorityOnce(mutable)();assert.notEqual(first,independent);assert.equal(reads,2);
  results.push({name:"once-reference",value:{first,independent,reads,lazy:true,cachedIdentity:true}});
  let nullReads=0;const nullOnce=owner.authorityOnce({platform:"win32",run:()=>{nullReads++;return null}});assert.equal(nullOnce(),null);assert.equal(nullOnce(),null);assert.equal(nullReads,1);results.push({name:"once-null",value:nullReads});
  let throws=0;const throwsOnce=owner.authorityOnce({platform:"win32",run:()=>{throws++;throw new RangeError("owned authority failure")}});
  capture("once-throw",()=>throwsOnce());capture("once-after-throw",()=>throwsOnce());assert.equal(throws,1);assert.equal(results.at(-1).value,null);
  for(const now of [94,95,100,NaN])capture("uptime-"+String(now),()=>owner.uptimeSaysOtherBoot({uptime:100},now));
  capture("uptime-missing",()=>owner.uptimeSaysOtherBoot({},1));
  for(const[name,rec,asked]of [["same",{authority:{kind:"a",value:1}},{kind:"a",value:1}],["different",{authority:{kind:"a",value:1}},{kind:"a",value:2}],["kind",{authority:{kind:"a",value:1}},{kind:"b",value:1}],["missing",{},null]])capture("confirm-"+name,()=>owner.confirmBoot(rec,asked));
  Date.now=()=>{trace.push(["now",tick]);return tick};
  capture("default-clock-first",()=>owner.bootIdentity({platform:"other"}));tick=200000;
  capture("default-clock-second",()=>owner.bootIdentity({platform:"other"}));
  runAction={status:0,stdout:" 999 "};capture("default-authority",()=>owner.bootAuthority({platform:"win32"}));
  readAction=" default-id \n";capture("default-read",()=>owner.bootIdentity({platform:"linux"}));
}finally{
  for(const[object,key,value]of saved)object[key]=value;
  globalThis.setTimeout=originalTimer;Date.now=originalNow;syncBuiltinESMExports();
}
const encode=(_k,v)=>v===undefined?{special:"undefined"}:typeof v==="number"&&!Number.isFinite(v)?{special:String(v)}:v;
process.stdout.write(JSON.stringify({api,wrappers,results,trace,positiveControls:true,restored:true},encode));
