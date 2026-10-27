import "./env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as owner from "../scripts/model-strength.mjs";
import * as transport from "../scripts/model-strength-fetch.mjs";

test("strength fetch transport remains internal and within source budgets", () => {
  assert.deepEqual(Object.keys(transport), ["fetchArena"]);
  assert.equal(transport.fetchArena.length, 3);
  assert.equal(transport.fetchArena.name, "fetchArena");
  assert.deepEqual(Object.keys(owner), ["compileCalibrationPolicyV2", "discoverStrength", "loadStrengthSources", "parseArenaRows", "parseCalibration", "refreshDue"]);
  const source = readFileSync(new URL("../scripts/model-strength-fetch.mjs", import.meta.url), "utf8");
  assert.ok(Buffer.byteLength(source) <= 4500);
  assert.doesNotMatch(source, /^import /m);
  assert.ok(Buffer.byteLength(readFileSync(new URL("../scripts/model-strength.mjs", import.meta.url))) <= 24000);
});

test("strength fetch transport bounds paging and streams without actual HTTP or timers", () => {
  const r = spawnSync(process.execPath, [
    fileURLToPath(new URL("./helpers/strength-fetch-scenarios.mjs", import.meta.url)),
    fileURLToPath(new URL("../scripts/model-strength-fetch.mjs", import.meta.url)),
  ], { encoding: "utf8", timeout: 10000 });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.signal, null);
  const out = JSON.parse(r.stdout);
  assert.equal(out.rows.length, 30);
  assert.equal(out.positiveGlobalFetchControl, true);
  assert.equal(out.concurrentIsolation, true);
  assert.deepEqual(out.unexpectedAttempts, []);
});
