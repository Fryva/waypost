import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { ambientEnv } from "./env.mjs";
import * as facade from "../scripts/lib.mjs";
import * as leaf from "../scripts/lib-atomic-write.mjs";

test("atomic writer keeps facade bindings and source budget", () => {
  assert.deepEqual(Object.keys(leaf).sort(), ["hostTag", "writeFileAtomic"]);
  for (const [name,arity] of [["hostTag",0],["writeFileAtomic",2]]) {
    assert.equal(facade[name], leaf[name]); assert.equal(leaf[name].name,name); assert.equal(leaf[name].length,arity);
  }
  assert.ok(readFileSync(new URL("../scripts/lib-atomic-write.mjs",import.meta.url)).length <= 5000);
});

test("atomic writer preserves error identity, operation order and cross-host safety using fake PIDs", t => {
  const root=realpathSync(mkdtempSync(join(tmpdir(),"wp-atomic-test-")));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const r=spawnSync(process.execPath,[fileURLToPath(new URL("./helpers/atomic-write-scenarios.mjs",import.meta.url)),new URL("../scripts/lib-atomic-write.mjs",import.meta.url).href,root],{encoding:"utf8",env:ambientEnv()});
  assert.equal(r.status,0,r.stderr);
  const out=JSON.parse(r.stdout); assert.equal(out.results.length,10); assert.equal(out.protectedFiles,81); assert.ok(out.pidReads>2);
});
