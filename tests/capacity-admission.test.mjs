import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import * as owner from "../scripts/capacity.mjs";
import * as leaf from "../scripts/capacity-admission.mjs";

test("admission leaf preserves public bindings, arity and bounded probe-free source",()=>{
  const names=["CORES_PER_SLOT","JOB_CORE_DIVISOR","JOB_MEMORY_CAP","JOB_MEMORY_DIVISOR","canStart"];
  assert.deepEqual(Object.keys(leaf),names);assert.equal(Object.keys(owner).length,21);
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
