import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import * as owner from "../scripts/capacity.mjs";
import * as leaf from "../scripts/capacity-admission.mjs";

test("admission leaf preserves public bindings, arity and bounded probe-free source",()=>{
  const names=["CORES_PER_SLOT","JOB_CORE_DIVISOR","JOB_DISK_CAP","JOB_DISK_DIVISOR","JOB_MEMORY_CAP","JOB_MEMORY_DIVISOR","SYSTEM_DISK_CAP","SYSTEM_DISK_FRACTION","canStart","diskShare","systemReserve"];
  assert.deepEqual(Object.keys(leaf),names);assert.equal(Object.keys(owner).length,28);
  for(const name of names)assert.equal(owner[name],leaf[name]);
  assert.equal(leaf.canStart.name,"canStart");assert.equal(leaf.canStart.length,0);
  const source=readFileSync(new URL("../scripts/capacity-admission.mjs",import.meta.url),"utf8");
  assert.ok(Buffer.byteLength(source)<=5000);
  assert.doesNotMatch(source,/^import |\bprocess\s*\.|\bDate\s*\./m);
});

test("admission calls preserve frozen inputs and independent returned decisions",()=>{
  const input=Object.freeze({cores:8,busy:0,available:16*1024**3,total:16*1024**3,holders:0,max:"1"});
  const before=JSON.stringify(input),first=leaf.canStart(input),second=leaf.canStart(input);
  assert.deepEqual(first,second);assert.notEqual(first,second);
  first.can_start=-99;first.reason="owned mutation";
  assert.deepEqual(leaf.canStart(input),second);assert.equal(JSON.stringify(input),before);
});

const GiB=1024**3;
const roomy={cores:8,busy:0,available:16*GiB,total:16*GiB};

test("disk: a job's share is min(20 GiB, 20 % of the filesystem); the env only raises it",()=>{
  assert.equal(leaf.diskShare(460*GiB),20*GiB);
  assert.equal(leaf.diskShare(30*GiB),6*GiB);
  assert.equal(leaf.diskShare(460*GiB,"50"),50*GiB);
  assert.equal(leaf.diskShare(460*GiB,"5"),20*GiB,"a smaller value changes nothing");
  assert.equal(leaf.diskShare(460*GiB,"nope"),20*GiB);
});

test("disk: the system reserve is min(30 GiB, 15 %) and binds before any job",()=>{
  assert.equal(leaf.systemReserve(460*GiB),30*GiB);
  assert.equal(leaf.systemReserve(40*GiB),6*GiB);
  const r=leaf.canStart({...roomy,disk:{free:48*GiB,total:460*GiB}});
  assert.equal(r.can_start,0);assert.equal(r.system_disk,30*GiB);
  assert.equal(r.reason,"disk: 48.0 GB free, a heavy job needs 50.0 GB free (30.0 GB system reserve + 20.0 GB for this job) — waypost clean, waypost size --global");
});

test("disk: 460 GB disk — the first job at 50 GB free, a second beside it at 70 GB",()=>{
  const at=(free,holders=0)=>leaf.canStart({...roomy,disk:{free:free*GiB,total:460*GiB},holders}).can_start;
  assert.equal(at(50),1);assert.equal(at(69),1);assert.equal(at(70),2);
  assert.equal(at(69,1),0);assert.equal(at(70,1),1);
  const r=leaf.canStart({...roomy,disk:{free:60*GiB,total:460*GiB},holders:1});
  assert.match(r.reason,/needs 70\.0 GB free \(30\.0 GB system reserve \+ 20\.0 GB for 1 running heavy job\(s\) \+ 20\.0 GB for this job\)/);
});

test("disk: unreadable is cannot start; not measured binds nothing",()=>{
  const r=leaf.canStart({...roomy,disk:{free:NaN,total:NaN}});
  assert.equal(r.can_start,0);assert.equal(r.reason,"disk: free space unknown");
  assert.equal(leaf.canStart(roomy).can_start,2);
  assert.equal(leaf.canStart(roomy).job_disk,null);
});

test("disk: an earlier dimension that binds is named first",()=>{
  const r=leaf.canStart({...roomy,available:0,disk:{free:0,total:460*GiB}});
  assert.match(r.reason,/^memory:/);
});

test("readDisk: one statfs reading of the given path, NaN when it throws",()=>{
  assert.deepEqual(owner.readDisk("/x",()=>({bavail:3,bsize:GiB,blocks:10})),{free:3*GiB,total:10*GiB,path:"/x"});
  const bad=owner.readDisk("/y",()=>{throw new Error("ENOENT");});
  assert.ok(Number.isNaN(bad.free)&&Number.isNaN(bad.total));
});

test("measure: WAYPOST_CAPACITY_PROBE disk figures are optional; given, they bind",async()=>{
  const probe=(extra)=>({WAYPOST_CAPACITY_PROBE:JSON.stringify({...roomy,...extra})});
  assert.equal((await owner.measure({env:probe({})})).disk,null);
  const r=await owner.measure({env:probe({free:45*GiB,disk_total:460*GiB})});
  assert.equal(r.can_start,0);assert.match(r.reason,/^disk: 45\.0 GB free/);
});
