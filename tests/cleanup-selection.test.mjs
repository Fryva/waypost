import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as owner from "../scripts/cleanup.mjs";
import * as selection from "../scripts/cleanup-selection.mjs";

test("cleanup selection keeps seven direct facade bindings within the source budgets", () => {
  const arities = { countedBytes: 1, limitNeed: 2, orderOldestFirst: 1, pickUnderLimit: 2, qualifiesForLimit: 1 };
  assert.deepEqual(Object.keys(selection), ["DAY_MS", "DEFAULT_PROJECT_STALE_DAYS", ...Object.keys(arities)]);
  assert.equal(Object.keys(owner).length, 24);
  for (const [name, arity] of Object.entries(arities)) {
    assert.equal(owner[name], selection[name], name);
    assert.equal(selection[name].name, name);
    assert.equal(selection[name].length, arity);
  }
  assert.equal(selection.DAY_MS, 86400000);
  assert.equal(selection.DEFAULT_PROJECT_STALE_DAYS, 7);
  for (const name of ["DAY_MS", "DEFAULT_PROJECT_STALE_DAYS"]) assert.equal(owner[name], selection[name]);
  const source = readFileSync(new URL("../scripts/cleanup-selection.mjs", import.meta.url), "utf8");
  assert.ok(Buffer.byteLength(source) <= 9000);
  assert.ok(Buffer.byteLength(readFileSync(new URL("../scripts/cleanup.mjs", import.meta.url))) <= 24000);
  assert.doesNotMatch(source, /^import |\bprocess\s*\./m);
});

test("cleanup selection reads the clock at call time even before an early return", () => {
  const original = Date.now;
  let calls = 0;
  // Patch after importing both modules: an initialization-time snapshot must fail.
  Date.now = () => { calls++; return 2000000000000; };
  try {
    assert.equal(selection.qualifiesForLimit({ class: "keep" }), false);
    assert.equal(calls, 1);
    assert.deepEqual(selection.limitNeed([], { kind: "off" }), { counted: 0, need: 0, eligible: [] });
    assert.equal(calls, 2);
    const untouched = new Proxy([], { get() { throw new Error("off must not inspect items"); } });
    assert.deepEqual(owner.pickUnderLimit(untouched, { kind: "off" }), new Set());
    assert.equal(calls, 3);
    assert.deepEqual(selection.pickUnderLimit(untouched, null, 0), new Set());
    assert.equal(calls, 3);
    const item = { class: "should", scope: "project", origin: "shipped", match: "sure", ignored: true, newest_ms: 2000000000000 - 8 * selection.DAY_MS };
    assert.equal(selection.qualifiesForLimit(item), true);
    assert.equal(calls, 4);
    assert.deepEqual(owner.classify([], {}, { limit: { kind: "off" } }), []);
    assert.equal(calls, 5);
  } finally {
    Date.now = original;
  }
});
