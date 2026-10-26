import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {spawnSync} from "node:child_process";
import {ambientEnv} from "./env.mjs";
import * as facade from "../scripts/lib.mjs";
import * as focused from "../scripts/lib-session-identity.mjs";
import * as sessions from "../scripts/sessions.mjs";

test("session identity preserves facade and caller bindings, arity and read budget",()=>{
  assert.deepEqual(Object.keys(focused).sort(),["sessionId","sessionIdFlag"]);for(const name of Object.keys(focused)){assert.equal(facade[name],focused[name]);assert.equal(focused[name].name,name);assert.equal(focused[name].length,0);}assert.equal(sessions.sessionId,focused.sessionId);assert.ok(readFileSync(new URL("../scripts/lib-session-identity.mjs",import.meta.url)).length<=5000);
});

test("session identity preserves first explicit flag and terminator boundaries",()=>{
  assert.equal(focused.sessionIdFlag(["--id","first","--id","last"]),"first");assert.equal(focused.sessionIdFlag(["--","--id","ignored"]),null);assert.equal(focused.sessionIdFlag(["--id","--"]),null);assert.equal(focused.sessionIdFlag(["--id"]),null);assert.equal(focused.sessionIdFlag(["--id",0]),null);assert.equal(focused.sessionIdFlag(["--id","....","--id","later"]),null);assert.equal(focused.sessionId(["--id","....","--id","later"],{WAYPOST_SESSION_ID:"neutral"}),"neutral");assert.equal(focused.sessionId(["--id","explicit"],null),"explicit");
});

test("session identity keeps env source order and distinct sanitizer algorithms",()=>{
  const keys=["WAYPOST_SESSION_ID","CLAUDE_CODE_SESSION_ID","CLAUDE_SESSION_ID","CODEX_SESSION_ID","CODEX_THREAD_ID","TERM_SESSION_ID","ITERM_SESSION_ID","TMUX_PANE","WT_SESSION","KITTY_WINDOW_ID","SSH_TTY"];
  for(let i=0;i<keys.length;i++){const env=Object.fromEntries(keys.slice(i).map(k=>[k,"lower"]));env[keys[i]]="chosen";env.WAYPOST_HARNESS="codex";assert.equal(focused.sessionId([],env),i===0?"chosen":"codex-chosen",keys[i]);}
  assert.equal(focused.sessionIdFlag(["--id","../explicit/path"]),"_explicit_path");assert.equal(focused.sessionIdFlag(["--id","x".repeat(100)]),"x".repeat(64));assert.equal(focused.sessionId([],{TERM_SESSION_ID:"x".repeat(100),WAYPOST_HARNESS:"codex"}),"codex-"+"x".repeat(24));assert.equal(focused.sessionId([],{CODEX_THREAD_ID:"thread / id",WAYPOST_HARNESS:"raw/prefix"}),"raw/prefix-thread-id");
});

test("session identity retains repeated getter reads and does not read env when a flag wins",()=>{
  let count=0;const trace=[],env=new Proxy({},{get(t,k){trace.push(k);if(k==="WAYPOST_SESSION_ID")return ++count===1?"first":"../second";throw Error("unexpected getter")}});assert.equal(focused.sessionId([],env),"_second");assert.deepEqual(trace,["WAYPOST_SESSION_ID","WAYPOST_SESSION_ID"]);
  const reads=[],terminal=new Proxy({WAYPOST_HARNESS:"codex",CODEX_THREAD_ID:"thread"},{get(t,k){reads.push(k);return t[k]}});assert.equal(focused.sessionId([],terminal),"codex-thread");assert.deepEqual(reads,["WAYPOST_SESSION_ID","WAYPOST_HARNESS","WAYPOST_SESSION_ID","CLAUDE_CODE_SESSION_ID","CLAUDE_SESSION_ID","CODEX_SESSION_ID","CODEX_THREAD_ID","CODEX_THREAD_ID"]);
  assert.equal(focused.sessionId(["--id","winner"],new Proxy({},{get(){throw Error("env must remain unread")}})),"winner");
});

test("session identity keeps inputs immutable and propagates getter and coercion errors",()=>{
  const args=Object.freeze(["node","wp"]),env=Object.freeze({WAYPOST_SESSION_ID:"neutral"});assert.equal(focused.sessionId(args,env),"neutral");assert.deepEqual(args,["node","wp"]);const error=new Error("getter failed");assert.throws(()=>focused.sessionId([],new Proxy({},{get(){throw error}})),e=>e===error);assert.throws(()=>focused.sessionId([],{TERM_SESSION_ID:{toString(){throw error}}}),e=>e===error);assert.throws(()=>focused.sessionIdFlag(null),TypeError);
});

function callTimeProbe(url) {
  const code=`import os from "node:os";import {syncBuiltinESMExports} from "node:module";
    let value="first.host",calls=0,parent=7,reads=0;os.hostname=()=>{calls++;return value};syncBuiltinESMExports();
    const descriptor=Object.getOwnPropertyDescriptor(process,"ppid");
    // A JS accessor overrides the native ppid accessor on every supported Node.
    // Spreading its descriptor into a data property does not work on Node 20/22.
    Object.defineProperty(process,"ppid",{configurable:true,enumerable:descriptor.enumerable,get(){reads++;return parent}});
    const m=await import(${JSON.stringify(url)});
    process.argv=["node","wp","--id","first default"];process.env={};const first=m.sessionId();
    process.argv=["node","wp"];process.env={WAYPOST_SESSION_ID:"second default"};const second=m.sessionId();const beforeFallback=reads;
    process.env={WAYPOST_HARNESS:"codex"};parent=123;const firstReadback=process.ppid,beforeThird=reads,third=m.sessionId(),thirdReads=reads-beforeThird;
    value="last.host";parent=456;const secondReadback=process.ppid,beforeFourth=reads,fourth=m.sessionId(),fourthReads=reads-beforeFourth;
    Object.defineProperty(process,"ppid",descriptor);
    console.log(JSON.stringify({first,second,beforeFallback,readbacks:[firstReadback,secondReadback],third,fourth,readCounts:[thirdReads,fourthReads],calls}));`;
  const r=spawnSync(process.execPath,["--input-type=module","-e",code],{encoding:"utf8",env:ambientEnv()});
  assert.equal(r.status,0,r.stderr);
  return JSON.parse(r.stdout);
}
function assertCallTime(result) {
  assert.deepEqual(result,{first:"first_default",second:"second_default",beforeFallback:0,readbacks:[123,456],third:"codex-first-123",fourth:"codex-last-456",readCounts:[1,1],calls:2});
}

test("session identity defaults, hostname and ppid remain call-time",()=>{
  assertCallTime(callTimeProbe(new URL("../scripts/lib-session-identity.mjs",import.meta.url).href));
});

test("session identity call-time check rejects import-time ppid capture with a working mock",t=>{
  const root=mkdtempSync(join(tmpdir(),"wp-captured-ppid-"));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const source=readFileSync(new URL("../scripts/lib-session-identity.mjs",import.meta.url),"utf8"),marker="${process.ppid}";
  assert.equal(source.split(marker).length,2,"mutation fixture must replace exactly the fallback read");
  const path=join(root,"captured.mjs");
  writeFileSync(path,"const capturedPpid=process.ppid;\n"+source.replace(marker,"${capturedPpid}"));
  const result=callTimeProbe(pathToFileURL(path).href);
  assert.deepEqual(result.readbacks,[123,456],"the mock still works for the negative control");
  assert.equal(result.beforeFallback,1,"the mutant read ppid at import");
  assert.deepEqual(result.readCounts,[0,0],"the mutant omits both call-time reads");
  assert.equal(result.third,"codex-first-7");assert.equal(result.fourth,"codex-last-7");
  assert.throws(()=>assertCallTime(result),assert.AssertionError);
});

test("session identity import adds no I/O, hostname probes, writes or timers",()=>{
  const url=new URL("../scripts/lib-session-identity.mjs",import.meta.url).href;
  const code=`import fs from"node:fs";import cp from"node:child_process";import os from"node:os";import{syncBuiltinESMExports}from"node:module";import{fileURLToPath}from"node:url";const target=fileURLToPath(${JSON.stringify(url)});let calls=0;const blocked=()=>{calls++;throw Error("unexpected action")};for(const name of["readFileSync","realpathSync"]){const original=fs[name];fs[name]=(p,...a)=>String(p instanceof URL?fileURLToPath(p):p)===target?original(p,...a):blocked();}for(const name of["readFile","existsSync","readdirSync","statSync","writeFileSync","appendFileSync","mkdirSync","unlinkSync","renameSync","rmSync"])fs[name]=blocked;cp.spawnSync=blocked;os.hostname=blocked;const timer=setTimeout;globalThis.setTimeout=blocked;syncBuiltinESMExports();const m=await import(${JSON.stringify(url)});globalThis.setTimeout=timer;if(calls)throw Error("import action");if(m.sessionIdFlag(["--id","flag"])!=="flag"||m.sessionId([],{WAYPOST_SESSION_ID:"neutral"})!=="neutral")throw Error("call controls");if(calls)throw Error("pure action");try{fs.writeFileSync("blocked","x")}catch{}try{cp.spawnSync("blocked")}catch{}try{os.hostname()}catch{}if(calls!==3)throw Error("inactive guards");console.log("pure");`;
  const r=spawnSync(process.execPath,["--input-type=module","-e",code],{encoding:"utf8",env:ambientEnv()});assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,"pure\n");
});
