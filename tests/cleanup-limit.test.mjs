import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import * as owner from "../scripts/cleanup.mjs";
import * as leaf from "../scripts/cleanup-limit.mjs";
import {checkGuards} from "../scripts/doctor-guards.mjs";

test("cleanup limit leaf preserves aliases, arities and a bounded I/O-free surface",()=>{
  const arities={consent:0,formatLimit:1,formatOutcome:1,limitChange:2,limitDecision:0,logLine:1,parseLimit:1,shortfallOf:0};
  assert.deepEqual(Object.keys(leaf),Object.keys(arities));assert.equal(Object.keys(owner).length,24);
  for(const[name,n]of Object.entries(arities)){assert.equal(owner[name],leaf[name]);assert.equal(leaf[name].name,name);assert.equal(leaf[name].length,n);}
  const source=readFileSync(new URL("../scripts/cleanup-limit.mjs",import.meta.url),"utf8");assert.ok(Buffer.byteLength(source)<=12000);assert.doesNotMatch(source,/^import |\bprocess\s*\.|\bDate\s*\./m);
});

test("canonical removal guards detect every cleanup module without selecting CLI writers",t=>{
  const adr=readFileSync(new URL("../docs/vault/adr/disk-hygiene-by-discovery-a-toolchain-registry-a-machine-and-project-profile-and-cleanup-only-after-a-yes.md",import.meta.url),"utf8");
  const all=JSON.parse(adr.split("\n").find(line=>line.startsWith("guards: ")).slice(8));
  const guards=all.filter(g=>g.in==="scripts/cleanup*.mjs");assert.equal(guards.length,2);assert.ok(guards.every(g=>typeof g.forbid==="string"));
  assert.deepEqual(readdirSync(new URL("../scripts/",import.meta.url)).filter(n=>/^cleanup.*\.mjs$/.test(n)).sort(),["cleanup-limit.mjs","cleanup-selection.mjs","cleanup.mjs"]);
  const root=mkdtempSync(join(tmpdir(),"waypost-cleanup-guard-"));t.after(()=>rmSync(root,{recursive:true,force:true}));
  mkdirSync(join(root,"scripts"));mkdirSync(join(root,"bin","cli"),{recursive:true});
  const files=["scripts/cleanup.mjs","scripts/cleanup-limit.mjs","scripts/cleanup-selection.mjs","bin/cli/remove.mjs"];
  const clean="// inert fixture\n",bad=['rmSync("MUST_NOT_RUN");\n','const command = "rm";\n'];
  for(const file of files.slice(0,3))writeFileSync(join(root,file),clean);
  // These are inert source strings inspected by regex, never imported or run.
  writeFileSync(join(root,files[3]),bad.join(""));
  const inspect=list=>checkGuards([{kind:"adr",rel:"adr/cleanup.md",body:"",fm:{status:"accepted",guards:JSON.stringify(list)}}],root,{files});
  assert.deepEqual(inspect(guards),[]);
  for(const file of files.slice(0,3))for(let i=0;i<guards.length;i++){
    writeFileSync(join(root,file),bad[i]);const findings=inspect([guards[i]]);
    assert.equal(findings.length,1);assert.equal(findings[0].level,"issue");assert.equal(findings[0].check,"adr-guard");assert.ok(findings[0].message.includes("matched in "+file+":1"),findings[0].message);
    writeFileSync(join(root,file),clean);
  }
  assert.deepEqual(inspect(guards),[]);
});
