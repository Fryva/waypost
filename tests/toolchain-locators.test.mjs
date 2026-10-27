import "./env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as owner from "../scripts/toolchains.mjs";
import * as locators from "../scripts/toolchain-locators.mjs";

test("toolchain locators preserve the facade and bounded builtin-only leaf", () => {
  assert.deepEqual(Object.keys(locators), ["applicableLocators", "runLocator"]);
  assert.equal(Object.keys(owner).length, 8);
  for (const [name, arity] of [["applicableLocators", 1], ["runLocator", 2]]) {
    assert.equal(owner[name], locators[name]);
    assert.equal(locators[name].name, name);
    assert.equal(locators[name].length, arity);
  }
  const source = readFileSync(new URL("../scripts/toolchain-locators.mjs", import.meta.url), "utf8");
  assert.ok(Buffer.byteLength(source) <= 6000);
  assert.ok(Buffer.byteLength(readFileSync(new URL("../scripts/toolchains.mjs", import.meta.url))) <= 24000);
  const imports = [...source.matchAll(/^import .* from "([^"]+)";/gm)].map(m => m[1]);
  assert.deepEqual(imports, ["node:fs", "node:path", "node:child_process"]);
});

test("toolchain queried facades retain their own mutable shim patterns", async () => {
  const a = await import("../scripts/toolchains.mjs?locator-owner-a");
  const b = await import("../scripts/toolchains.mjs?locator-owner-b");
  assert.notEqual(a.BATCH_SHIM_RE, b.BATCH_SHIM_RE);
  a.BATCH_SHIM_RE.lastIndex = 7;
  assert.equal(b.BATCH_SHIM_RE.lastIndex, 0);
  assert.equal((await import("../scripts/toolchains.mjs?locator-owner-a")).BATCH_SHIM_RE.lastIndex, 7);
  // Stateless locator aliases are shared; mutable cache and pattern stay in the owner.
  assert.equal(a.runLocator, locators.runLocator);
  assert.equal(b.applicableLocators, locators.applicableLocators);
});

test("toolchain locators keep import silence, budget ordering and isolated native probes", () => {
  const r = spawnSync(process.execPath, [
    fileURLToPath(new URL("./helpers/toolchain-locator-scenarios.mjs", import.meta.url)),
    fileURLToPath(new URL("../scripts/toolchain-locators.mjs", import.meta.url)),
  ], { encoding: "utf8", timeout: 10000 });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.signal, null);
  const output = JSON.parse(r.stdout);
  assert.equal(output.rows.length, 22);
  assert.equal(output.positiveControls, 3);
  assert.deepEqual(output.unexpectedAttempts, []);
});
