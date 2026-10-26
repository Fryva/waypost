import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,realpathSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
import {ambientEnv} from "./env.mjs";
import * as facade from "../scripts/lib.mjs";
import * as leaf from "../scripts/lib-legacy-sessions.mjs";

test("legacy session helpers preserve facade bindings, arities and read budget",()=>{
  const arities={sessionsDir:1,sessionFilePath:2,ensureSessionsDir:1,writeSession:3,touchSession:2,cleanupStaleSessions:1};
  assert.deepEqual(Object.keys(leaf).sort(),Object.keys(arities).sort());assert.equal(Object.keys(facade).length,100);
  for(const[name,arity]of Object.entries(arities)){assert.equal(facade[name],leaf[name]);assert.equal(leaf[name].name,name);assert.equal(leaf[name].length,arity);}
  assert.ok(readFileSync(new URL("../scripts/lib-legacy-sessions.mjs",import.meta.url)).length<=6000);
});

test("legacy session paths retain the upstream service directory",()=>{
  assert.equal(leaf.sessionsDir("vault"),join("vault",".projectstore","sessions"));
  assert.equal(leaf.sessionFilePath("vault","session-id"),join("vault",".projectstore","sessions","session-id.json"));
});

test("legacy session files preserve controlled clock, errors and protected owned fixtures",t=>{
  const root=realpathSync(mkdtempSync(join(tmpdir(),"wp-legacy-session-test-")));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const r=spawnSync(process.execPath,[fileURLToPath(new URL("./helpers/legacy-session-scenarios.mjs",import.meta.url)),new URL("../scripts/lib-legacy-sessions.mjs",import.meta.url).href,root],{encoding:"utf8",env:ambientEnv(),maxBuffer:4*1024*1024});
  assert.equal(r.status,0,r.stderr);const out=JSON.parse(r.stdout);assert.equal(out.results.length,18);assert.ok(out.protectedCount>=50);
});
