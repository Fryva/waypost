import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import * as owner from "../scripts/tokens.mjs";
import * as leaf from "../scripts/token-requests.mjs";

test("token request leaf preserves bindings, arities and bounded import-free surface",()=>{
  assert.deepEqual(Object.keys(leaf),["countCommandRuns","ingest"]);
  assert.equal(Object.keys(owner).length,6);
  assert.equal(owner.ingest,leaf.ingest);assert.equal(owner.countCommandRuns,leaf.countCommandRuns);
  assert.equal(leaf.ingest.name,"ingest");assert.equal(leaf.ingest.length,3);
  assert.equal(leaf.countCommandRuns.name,"countCommandRuns");assert.equal(leaf.countCommandRuns.length,2);
  const source=readFileSync(new URL("../scripts/token-requests.mjs",import.meta.url),"utf8");
  assert.ok(Buffer.byteLength(source)<=6000);assert.doesNotMatch(source,/^import /m);
});

test("request reduction retains row ownership, partial completeness and sticky invalid/conflict flags",()=>{
  const rows=new Map(),record=(usage,ids=[])=>({requestId:"r",message:{model:"m",usage,content:ids.map(id=>({type:"tool_use",id}))}});
  leaf.ingest(rows,record({input_tokens:10},["a"]),{bucket:"first"});
  const row=rows.get("r");assert.equal(row.usageComplete,false);
  const full={input_tokens:10,cache_creation_input_tokens:0,cache_read_input_tokens:0,output_tokens:7};
  leaf.ingest(rows,record(full,["a","b"]),{bucket:"later"});
  assert.equal(rows.get("r"),row);assert.equal(row.bucket,"first");assert.equal(row.usageComplete,true);
  leaf.ingest(rows,record({...full,input_tokens:11,output_tokens:2}),{});
  assert.equal(row.input,10);assert.equal(row.output,7);assert.equal(row.conflictingUsage,true);
  leaf.ingest(rows,record({...full,input_tokens:-1}),{});leaf.ingest(rows,record(full),{});
  assert.equal(row.invalidUsage,true);assert.equal(row.conflictingUsage,true);assert.equal(row.usageComplete,false);
  assert.deepEqual([...row.toolIds],["a","b"]);
});

test("command runs keep session boundaries, stable ties and existing caller counts",()=>{
  const rows=new Map([[1,{kind:"cmd",session:"s",bucket:"a",ts:"1"}],[2,{kind:"cmd",session:"s",bucket:"b",ts:"1"}],[3,{kind:"cmd",session:"s",bucket:"a",ts:"1"}],[4,{kind:"cmd",session:"other",bucket:"a",ts:"0"}],[5,{kind:"main",session:"s",bucket:"ignored",ts:"0"}]]);
  const before=JSON.stringify([...rows]),calls=new Map([["s|a",4],["existing",7]]);
  leaf.countCommandRuns(rows,calls);assert.equal(calls.get("s|a"),6);assert.equal(calls.get("s|b"),1);assert.equal(calls.get("other|a"),1);assert.equal(calls.get("existing"),7);assert.equal(calls.has("s|ignored"),false);
  leaf.countCommandRuns(rows,calls);assert.equal(calls.get("s|a"),8);assert.equal(JSON.stringify([...rows]),before);
});
