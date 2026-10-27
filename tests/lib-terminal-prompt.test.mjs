import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {ambientEnv} from "./env.mjs";
import * as facade from "../scripts/lib.mjs";
import * as leaf from "../scripts/lib-terminal-prompt.mjs";

test("terminal prompt preserves facade binding, arity and read budget",()=>{
  assert.deepEqual(Object.keys(leaf),["askYesNo"]);assert.equal(Object.keys(facade).length,100);
  assert.equal(facade.askYesNo,leaf.askYesNo);assert.equal(leaf.askYesNo.name,"askYesNo");assert.equal(leaf.askYesNo.length,1);
  assert.ok(readFileSync(new URL("../scripts/lib-terminal-prompt.mjs",import.meta.url)).length<=4000);
});

test("terminal prompt preserves controlled stdio defaults, races, cleanup and error boundaries",()=>{
  const r=spawnSync(process.execPath,[fileURLToPath(new URL("./helpers/terminal-prompt-scenarios.mjs",import.meta.url)),new URL("../scripts/lib-terminal-prompt.mjs",import.meta.url).href],{encoding:"utf8",env:ambientEnv(),timeout:5000,maxBuffer:2*1024*1024});
  assert.equal(r.status,0,r.stderr);const out=JSON.parse(r.stdout);assert.equal(out.results.length,26);
});
