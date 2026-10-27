import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {ambientEnv} from "./env.mjs";
import * as facade from "../scripts/lib.mjs";
import * as leaf from "../scripts/lib-machine-state.mjs";

const names=["machineStateDir","ensureMachineStateDir","legacyDirsToMove","legacyStateDirs","legacyStateView","stateWriteHint","REMOVING_DIR","readCleanupSetting","LIMIT_WRITER","accountStateDir","stricterLimit","readLastAutoCleanup"];
const source=readFileSync(new URL("../scripts/lib-machine-state.mjs",import.meta.url),"utf8");

test("machine-state leaf preserves facade bindings, arities and read budget",()=>{
  assert.deepEqual(Object.keys(leaf).sort(),[...names].sort());
  assert.equal(Object.keys(facade).length,100);
  for(const name of names){
    assert.equal(facade[name],leaf[name]);
    if(typeof leaf[name]==="function"){
      assert.equal(leaf[name].name,name);
      assert.equal(leaf[name].length,["stateWriteHint","stricterLimit"].includes(name)?2:0);
    }
  }
  assert.ok(Buffer.byteLength(source)<=14000);
});

test("machine-state leaf performs no machine filesystem or account lookup at import",()=>{
  // Load the exact source via a data URL so the loader's source read is not
  // mistaken for a machine-state read. All leaf dependencies are builtins.
  const probe=`import assert from "node:assert/strict";
import fs from "node:fs"; import os from "node:os";
import {syncBuiltinESMExports} from "node:module";
const calls=[];
for(const [api,keys] of [[fs,["mkdirSync","existsSync","readFileSync","readdirSync","realpathSync"]],[os,["homedir","userInfo"]]])
 for(const key of keys){const fail=()=>{calls.push(key);throw Error("import-time "+key)};if(key==="realpathSync")fail.native=fail;api[key]=fail;}
syncBuiltinESMExports();
const imported=await import("data:text/javascript;base64,"+Buffer.from(process.argv[1]).toString("base64"));
assert.equal(Object.keys(imported).length,12); assert.deepEqual(calls,[]);`;
  const r=spawnSync(process.execPath,["--input-type=module","--eval",probe,source],{encoding:"utf8",env:ambientEnv(),timeout:5000});
  assert.equal(r.status,0,r.stderr);
});
