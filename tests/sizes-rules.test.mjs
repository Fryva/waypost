import "./env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { compileArtifacts, ownerOf, compileLocatorOwners, isSureName, isMaybeName, keepSuffixesOf } from "../scripts/sizes-rules.mjs";
import * as facade from "../scripts/sizes.mjs";

test("sizes rules: shipped ownership beats project name, prefix and pattern overrides", () => {
  const entries = [
    { id: "project", origin: "project", artifacts: [{ name: "build", match: "sure" }, { prefix: "pre", match: "sure" }, { name: "pattern-x", match: "sure" }] },
    { id: "shipped", artifacts: [{ name: "build", match: "generic" }, { prefix: "pre", match: "generic" }, { pattern: "^pattern-", match: "generic" }] },
  ];
  const c = compileArtifacts(entries);
  for (const n of ["build", "prefix", "pattern-x"]) {
    assert.equal(ownerOf(n, c).tool, "shipped");
    assert.equal(isSureName(n, c), false); assert.equal(isMaybeName(n, c), true);
  }
  assert.equal(ownerOf("missing", c), null);
});

test("sizes rules: last exact owner and first matching prefix/pattern retain their order", () => {
  const c = compileArtifacts([
    { id: "first", artifacts: [{ name: "exact" }, { prefix: "p" }, { pattern: "^r" }] },
    { id: "last", artifacts: [{ name: "exact" }, { prefix: "prefix" }, { pattern: "^regex" }] },
    { id: "project", origin: "project", artifacts: [{ name: "fresh", match: "sure" }, { pattern: "^only-project" }] },
  ]);
  assert.equal(ownerOf("exact", c).tool, "last");
  assert.equal(ownerOf("prefix", c).tool, "first");
  assert.equal(ownerOf("regex", c).tool, "first");
  assert.equal(isSureName("fresh", c), true);
  assert.equal(ownerOf("only-project", c), null);
});

test("sizes rules: artifact origin wins; auto policy and argv references remain exact", () => {
  const argv = ["fixture", "clean"];
  const entries = [{ id: "fixture", artifacts: [
    { name: "shipped", auto: false, stale_days: Infinity, clean_argv: argv },
    { name: "project", origin: "project", auto: false, stale_days: 7, clean_argv: argv },
    { pattern: "[", name: "invalid" }, {},
  ], skip: ["dependency"] }];
  const a = compileArtifacts(entries), b = compileArtifacts(entries);
  assert.equal(ownerOf("shipped", a).auto, false);
  assert.equal(ownerOf("shipped", a).stale_days, null);
  assert.equal(ownerOf("project", a).auto, undefined);
  assert.equal(ownerOf("project", a).origin, "project");
  assert.equal(ownerOf("project", a).stale_days, 7);
  assert.equal(ownerOf("shipped", a).clean_argv, argv);
  assert.equal(ownerOf("invalid", a), null);
  assert.notEqual(a.skip, b.skip); assert.notEqual(a.ownerByName, b.ownerByName);
  assert.notEqual(a.ownerByPrefix, b.ownerByPrefix); assert.notEqual(a.ownerByPattern, b.ownerByPattern);
  a.skip.add("extra"); assert.equal(b.skip.has("extra"), false);
  assert.deepEqual([...b.skip], [".git", "dependency"]);
});

test("sizes rules: global pattern object and lastIndex survive repeated lookups", () => {
  const entries = [{ id: "fixture", artifacts: [{ pattern: "^x", flags: "g", match: "sure" }] }];
  const a = compileArtifacts(entries), re = a.ownerByPattern[0].re;
  assert.equal(isSureName("x", a), true); assert.equal(re.lastIndex, 1);
  assert.equal(isSureName("x", a), false); assert.equal(re.lastIndex, 0);
  assert.equal(a.ownerByPattern[0].re, re);
  assert.notEqual(compileArtifacts(entries).ownerByPattern[0].re, re);
});

test("sizes rules: first locator owns duplicates with fresh containers and original argv", () => {
  const argv = ["fixture"];
  const entries = [
    { id: "first", locators: [{ name: "same", regenerable: false, stale_days: 2, clean_argv: argv }, { name: "defaults" }] },
    { id: "last", locators: [{ name: "same", regenerable: true }] },
  ];
  const a = compileLocatorOwners(entries), b = compileLocatorOwners(entries);
  assert.notEqual(a, b); assert.notEqual(a.get("same"), b.get("same"));
  assert.equal(a.get("same").tool, "first"); assert.equal(a.get("same").regenerable, false);
  assert.equal(a.get("same").clean_argv, argv); assert.equal(a.get("same").stale_days, 2);
  assert.deepEqual(a.get("defaults"), { tool: "first", origin: "shipped", regenerable: null, stale_days: null, clean: null, clean_argv: null });
});

test("sizes rules: suffix normalization keeps the facade binding without leaking helpers", () => {
  assert.equal(keepSuffixesOf, facade.keepSuffixesOf);
  assert.deepEqual([...keepSuffixesOf([{ id: "system", auto_keep_suffixes: [".PKG", ".zip", ".PKG"] }])], [".pkg", ".zip"]);
  assert.equal(keepSuffixesOf([]).size, 0);
  for (const n of ["compileArtifacts", "ownerOf", "compileLocatorOwners", "isSureName", "isMaybeName"]) assert.equal(n in facade, false);
});
