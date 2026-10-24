import "./env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, readFileSync, lstatSync, linkSync, symlinkSync, rmSync, utimesSync } from "node:fs";
import { join, basename } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import * as focused from "../scripts/sizes-measure.mjs";
import * as facade from "../scripts/sizes.mjs";
import { parseFrontmatter } from "../scripts/lib.mjs";
import { checkGuards } from "../scripts/doctor-guards.mjs";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const ADR = "docs/vault/adr/disk-hygiene-by-discovery-a-toolchain-registry-a-machine-and-project-profile-and-cleanup-only-after-a-yes.md";
function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "wp-measure-module-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (rel, text = "payload") => { const p = join(root, rel); mkdirSync(join(p, ".."), { recursive: true }); writeFileSync(p, text); return p; };
  return { root, put };
}
const allocated = p => { const st = lstatSync(p); return process.platform === "win32" ? st.size : st.blocks * 512; };

test("sizes measurement module: five bindings and the eleven-name facade remain compatible", () => {
  for (const k of ["metadataNamesOf", "inspectDir", "cacheCandidates", "measureCaches", "scanGlobal"]) assert.equal(focused[k], facade[k], k);
  assert.deepEqual(Object.keys(focused).sort(), ["cacheCandidates", "dirBytes", "inspectDir", "measureCaches", "metadataNamesOf", "scanGlobal"]);
  assert.deepEqual(Object.keys(facade).sort(), ["DEFAULT_ENTRY_BUDGET", "GIT_CALL_COST", "SUBPROCESS_CALL_COST", "cacheCandidates", "gitFacts", "inspectDir", "keepSuffixesOf", "measureCaches", "metadataNamesOf", "scanGlobal", "scanProject"]);
});

test("sizes measurement module: missing/file/empty-directory facts and root identity stay exact", t => {
  const { root, put } = fixture(t); const file = put("file"); const empty = join(root, "empty"); mkdirSync(empty);
  assert.deepEqual(focused.inspectDir(join(root, "missing")), { exists: false });
  assert.deepEqual(focused.inspectDir(file), { exists: true, is_directory: false, is_symlink: false });
  const st = lstatSync(empty), r = focused.inspectDir(empty);
  assert.equal(r.bytes, allocated(empty)); assert.equal(r.dev, st.dev); assert.equal(r.ino, st.ino);
  assert.equal(r.newest_ms, Math.max(st.mtimeMs, st.ctimeMs));
  assert.equal(r.unreadable, false); assert.equal(r.other_fs, false); assert.equal(r.nested_git, false);
  const missing = focused.dirBytes(join(root, "missing"), new Set(), null);
  assert.equal(missing.unreadable, true); assert.equal(missing.visited, 0); assert.equal(missing.dev, null);
});

test("sizes measurement module: one seen set deduplicates hardlinks across separate cache candidates", t => {
  const { root, put } = fixture(t); const a = join(root, "a"), b = join(root, "b");
  const data = put("a/data", "payload".repeat(100)); mkdirSync(b); linkSync(data, join(b, "hardlink"));
  const seen = new Set(), first = focused.dirBytes(a, seen, null), second = focused.dirBytes(b, seen, null);
  assert.equal(first.bytes + second.bytes, allocated(a) + allocated(b) + allocated(data));
  assert.equal(focused.dirBytes(a, seen, null).bytes, 0);
  const candidates = [{ path: a }, { path: b }]; candidates.dropped = 3;
  const measured = facade.measureCaches(candidates);
  assert.equal(measured.reduce((sum, r) => sum + r.bytes, 0), first.bytes + second.bytes);
  assert.equal(measured.dropped, 3); assert.deepEqual(measured.map(r => r.path), [a, b]);
});

test("sizes measurement module: root symlink rejection and curated top-level symlink acceptance differ", t => {
  const { root, put } = fixture(t); put("target/data"); const target = join(root, "target"), link = join(root, "link");
  try { symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir"); }
  catch (e) { if (e.code === "EPERM" || e.code === "EACCES") { t.skip("Directory links unavailable for this account"); return; } throw e; }
  assert.deepEqual(focused.inspectDir(link), { exists: true, is_directory: false, is_symlink: true });
  assert.equal(focused.measureCaches([{ path: link }]).length, 1);
  const inner = join(target, "cycle"); symlinkSync(target, inner, process.platform === "win32" ? "junction" : "dir");
  const r = focused.inspectDir(target);
  assert.equal(r.bytes, allocated(target) + allocated(join(target, "data")) + allocated(inner));
  assert.equal(r.unreadable, false);
});

test("sizes measurement module: metadata affects age but still counts allocated bytes", t => {
  const { root, put } = fixture(t); const data = put("data"), meta = put(".meta");
  utimesSync(data, 2000000000, 2000000000); utimesSync(meta, 2100000000, 2100000000);
  const names = new Set([basename(root), ".meta"]), before = [...names];
  const r = focused.inspectDir(root, { metadata: names });
  assert.equal(r.newest_ms, Math.max(lstatSync(data).mtimeMs, lstatSync(data).ctimeMs));
  assert.equal(r.bytes, allocated(root) + allocated(data) + allocated(meta));
  assert.deepEqual([...names], before);
  assert.ok(focused.inspectDir(root).newest_ms > r.newest_ms);
  assert.deepEqual([...focused.metadataNamesOf([{ id: "system", metadata_names: [".meta"] }])], [".meta"]);
  assert.equal(focused.metadataNamesOf([]).size, 0);
});

test("sizes measurement module: nested repository stops preserve package and identity facts", t => {
  const { root, put } = fixture(t); put("nested/.git", "gitdir: elsewhere"); put("nested/release.PKG", "package");
  const keepSuffixes = new Set([".pkg"]), full = focused.inspectDir(root, { keepSuffixes });
  assert.equal(full.nested_git, true); assert.equal(full.holds_package, true); assert.equal(full.package, "release.PKG");
  const stopped = focused.inspectDir(root, { keepSuffixes, stopAtGit: true });
  assert.equal(stopped.nested_git, true); assert.equal(stopped.holds_package, false);
  assert.equal(stopped.bytes, allocated(root) + allocated(join(root, "nested")));
  assert.equal(stopped.dev, full.dev); assert.equal(stopped.ino, full.ino);
});

test("sizes measurement module: entry budget and 512-entry deadline cadence remain unchanged", t => {
  const { root, put } = fixture(t);
  for (let i = 0; i < 520; i++) put(`file-${i}`, "");
  const budget = focused.dirBytes(root, new Set(), 1);
  assert.equal(budget.visited, 1); assert.equal(budget.partial, true); assert.equal(budget.bytes, allocated(root));
  const deadline = focused.dirBytes(root, new Set(), null, new Set(), { deadline: 0 });
  assert.equal(deadline.visited, 512); assert.equal(deadline.partial, true);
  assert.equal(focused.dirBytes(root, new Set(), null).visited, 521);
  assert.equal("partial" in focused.inspectDir(root, { deadline: 0 }), false);
});

test("sizes measurement module: current registry policy wins over profile and preserves argv identity", t => {
  const { root, put } = fixture(t); put("cache/data"); const path = join(root, "cache"), argv = ["fixture-tool", "clean"];
  const cache = { path: "fixture-template", os: [process.platform], clean: "current policy", regenerable: true, clean_argv: argv, confidence: { [process.platform]: "inferred" } };
  const registry = { entries: [{ id: "system", metadata_names: [], caches: [cache] }], notes: [] };
  const profile = { caches: [{ tool: "system", item: cache.path, path, source: "fixture", clean: "stale", regenerable: false }, { tool: "removed", item: "old", path }] };
  const before = JSON.stringify({ registry, profile }), rows = focused.cacheCandidates({ registry, profile });
  assert.equal(rows.dropped, 1); assert.equal(rows[0].clean, "current policy"); assert.equal(rows[0].regenerable, true);
  assert.equal(rows[0].clean_argv, argv);
  const measured = focused.measureCaches(rows);
  assert.equal(measured[0].clean_argv, argv); assert.equal(measured.dropped, 1);
  assert.equal(measured[0].bytes, allocated(path) + allocated(join(path, "data")));
  assert.deepEqual(focused.scanGlobal({ registry, profile }), measured);
  assert.equal(JSON.stringify({ registry, profile }), before);
  const corrupt = focused.cacheCandidates({ registry, profile: { caches: "invalid" } });
  assert.equal(corrupt.length, 0); assert.equal(corrupt.dropped, 0);
  cache.os = ["not-this-platform"];
  assert.equal(focused.cacheCandidates({ registry, profile }).dropped, 2);
});

test("sizes measurement module: all three original scanner guards cover the extracted module", t => {
  const { root, put } = fixture(t);
  const { data } = parseFrontmatter(readFileSync(join(REPO, ADR), "utf8"));
  const guards = JSON.parse(data.guards), scanner = guards.filter(g => g.in === "scripts/sizes*.mjs");
  assert.equal(scanner.length, 3); assert.equal(guards.filter(g => g.in === "scripts/cleanup.mjs").length, 2);
  const files = ["scripts/sizes.mjs", "scripts/sizes-measure.mjs"];
  put(files[0], "export const fixture = 1;\n"); put(files[1], "export const fixture = 2;\n");
  const artifact = { kind: "adr", rel: "adr/fixture.md", fm: { status: "accepted", guards: JSON.stringify(scanner) } };
  assert.deepEqual(checkGuards([artifact], root, { files }), []);
  for (const [i, text] of ["rmSync(path);", 'const command = "rm ";', "DerivedData"].entries()) {
    put(files[1], text);
    const hits = checkGuards([{ ...artifact, fm: { ...artifact.fm, guards: JSON.stringify([scanner[i]]) } }], root, { files });
    assert.equal(hits.length, 1); assert.equal(hits[0].level, "issue"); assert.ok(hits[0].message.includes("scripts/sizes-measure.mjs"));
  }
});
