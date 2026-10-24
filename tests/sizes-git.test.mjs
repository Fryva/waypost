import "./env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { gitFacts, gitIgnoredSet, gitTrackedDirs, GIT_CALL_COST, SUBPROCESS_CALL_COST } from "../scripts/sizes-git.mjs";
import * as facade from "../scripts/sizes.mjs";

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "wp-git-module-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // All in-process Git calls inherit these fixture-only settings; restore even on failure.
  const keys = ["GIT_CONFIG_GLOBAL", "GIT_CONFIG_NOSYSTEM", "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"];
  const saved = new Map(keys.map(k => [k, process.env[k]]));
  for (const k of keys) delete process.env[k];
  process.env.GIT_CONFIG_GLOBAL = join(root, "no-global"); process.env.GIT_CONFIG_NOSYSTEM = "1";
  t.after(() => { for (const [k, v] of saved) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
  const run = (...args) => { const r = spawnSync("git", ["--literal-pathspecs", "-C", root, ...args], { encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); };
  const put = (rel, data = "payload") => { const p = join(root, rel); mkdirSync(join(p, ".."), { recursive: true }); writeFileSync(p, data); };
  run("init", "-q"); put(".gitignore", "ignored/\n");
  put("tracked/a[1].txt"); put("tracked/a1.txt"); put("ignored/data"); put("untracked/data");
  run("add", "--", ".gitignore", "tracked/a[1].txt");
  return { root, put, run };
}
const paths = ["tracked", "tracked/a[1].txt", "tracked/a1.txt", "ignored", "untracked", "missing"];
const packed = r => ({ repo: r.repo, ignored: [...r.ignored], tracked: [...r.tracked] });

test("sizes Git: original constants and bindings remain public without exposing helpers", () => {
  assert.equal(GIT_CALL_COST, 1000); assert.equal(SUBPROCESS_CALL_COST, 1000);
  assert.equal(gitFacts, facade.gitFacts); assert.equal(GIT_CALL_COST, facade.GIT_CALL_COST);
  assert.equal("gitIgnoredSet" in facade, false); assert.equal("gitTrackedDirs" in facade, false);
});

test("sizes Git: ignored, tracked directories and literal metacharacter files stay distinct", t => {
  const { root } = fixture(t);
  assert.deepEqual([...gitIgnoredSet(root, paths)], ["ignored"]);
  assert.deepEqual([...gitTrackedDirs(root, paths)], ["tracked", "tracked/a[1].txt"]);
  assert.deepEqual(packed(gitFacts(root, paths)), { repo: true, ignored: ["ignored"], tracked: ["tracked", "tracked/a[1].txt"] });
  assert.deepEqual(packed(gitFacts(root, [])), { repo: true, ignored: [], tracked: [] });
});

test("sizes Git: exhausted time preserves opposite ignore and tracking fallbacks", t => {
  const { root } = fixture(t);
  assert.equal(gitIgnoredSet(root, paths, 0).size, 0);
  assert.deepEqual([...gitTrackedDirs(root, paths, 0)], paths);
  assert.deepEqual(packed(gitFacts(root, paths, 0)), { repo: true, ignored: [], tracked: paths });
  const outside = join(root, "outside"); mkdirSync(outside);
  // A directory below a repository remains a repository, even without a local marker.
  assert.deepEqual(packed(gitFacts(outside, ["data"], 0)), { repo: true, ignored: [], tracked: ["data"] });
});

test("sizes Git: missing binary and damaged index fail conservatively", t => {
  const { root, put } = fixture(t), oldPath = process.env.PATH;
  process.env.PATH = "";
  try {
    assert.equal(gitIgnoredSet(root, paths).size, 0);
    assert.deepEqual([...gitTrackedDirs(root, paths)], paths);
    assert.deepEqual(packed(gitFacts(root, paths)), { repo: true, ignored: [], tracked: paths });
  } finally { if (oldPath === undefined) delete process.env.PATH; else process.env.PATH = oldPath; }
  put(".git/index", "broken index");
  assert.equal(gitIgnoredSet(root, paths).size, 0);
  assert.deepEqual([...gitTrackedDirs(root, paths)], paths);
  assert.deepEqual(packed(gitFacts(root, paths)), { repo: true, ignored: [], tracked: paths });
});

test("sizes Git: broken marker/HEAD and ancestor marker differ from a nonrepository", t => {
  const { root, put } = fixture(t);
  put(".git/HEAD", "broken head");
  assert.deepEqual(packed(gitFacts(root, paths)), { repo: true, ignored: [], tracked: paths });
  const bare = realpathSync(mkdtempSync(join(tmpdir(), "wp-nonrepo-module-")));
  t.after(() => rmSync(bare, { recursive: true, force: true }));
  assert.deepEqual(packed(gitFacts(bare, paths, 0)), { repo: false, ignored: [], tracked: [] });
  writeFileSync(join(bare, ".git"), "gitdir: missing");
  const child = join(bare, "child"); mkdirSync(child);
  for (const dir of [bare, child]) assert.deepEqual(packed(gitFacts(dir, paths)), { repo: true, ignored: [], tracked: paths });
});
