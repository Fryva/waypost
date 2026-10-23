import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { checkGuards, projectFiles, GUARD_FILE_MAX, GUARD_FILES_MAX } from "../scripts/doctor-guards.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "wp-guard-module-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
function adr(status, guards) {
  return Object.freeze({ kind: "adr", rel: "adr/one.md", body: "---\nstatus: fixture\n---\n",
    fm: Object.freeze({ status, guards: JSON.stringify(guards) }) });
}

test("doctor guards module: exact findings, immutable inputs and declarative non-execution", t => {
  const root = fixture(t);
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src/a.mjs"), "header\nunsafe\n");
  writeFileSync(join(root, "src/a.test.mjs"), "unsafe\n");
  writeFileSync(join(root, "src/b.mjs"), "missing\n");
  const marker = join(root, "MUST_NOT_RUN");
  const forbid = { forbid: "unsafe", in: "src/**/*.mjs", not_in: "src/**/*.test.mjs", why: "reject unsafe" };
  const artifacts = Object.freeze([
    adr("accepted", [forbid, { require: "^header$", in: "src/*.mjs", not_in: "src/*.test.mjs", why: "need header" },
      { check: `touch ${marker}`, why: "declarative only" }]),
    adr("proposed", [forbid]), adr("superseded", [forbid]),
  ]);
  const files = Object.freeze(["src/a.mjs", "src/a.test.mjs", "src/b.mjs"]);
  const before = JSON.stringify({ artifacts, files });
  assert.deepEqual(checkGuards(artifacts, root, { files }), [
    { group: "vault", level: "issue", check: "adr-guard", message: 'adr/one.md: forbid "unsafe" matched in src/a.mjs:2 — reject unsafe', file: "adr/one.md" },
    { group: "vault", level: "issue", check: "adr-guard", message: 'adr/one.md: require "^header$" missing in src/b.mjs — need header', file: "adr/one.md" },
    { group: "vault", level: "info", check: "adr-guard", message: `adr/one.md: check \`touch ${marker}\` encodes this decision (declarative only) — it runs in the project's own test suite; doctor never executes it.`, file: "adr/one.md" },
    { group: "vault", level: "info", check: "adr-guard", message: 'would fail: adr/one.md: forbid "unsafe" matched in src/a.mjs:2 — reject unsafe', file: "adr/one.md" },
  ]);
  assert.equal(JSON.stringify({ artifacts, files }), before);
  assert.ok(!existsSync(marker));
});

test("doctor guards module: explicit empty files and metadata keep discovery lazy", t => {
  for (const artifacts of [
    [adr("accepted", [{ check: "never run", why: "metadata" }])],
    [adr("superseded", [{ forbid: "unsafe", in: "*.mjs", why: "obsolete" }])],
    [adr("accepted", [{ forbid: "unsafe", in: "*.mjs", why: "explicit list" }])],
  ]) {
    const root = fixture(t);
    const explicit = artifacts[0].fm.guards.includes("explicit list");
    const findings = checkGuards(artifacts, root, explicit ? { files: [] } : undefined);
    if (explicit) assert.match(findings[0].message, /selects no file/);
    writeFileSync(join(root, "later.mjs"), "unsafe\n");
    assert.deepEqual(projectFiles(root), ["later.mjs"], "no earlier enumeration populated the cache");
  }
});

test("doctor guards module: file/count bounds keep their exact thresholds", t => {
  const root = fixture(t);
  assert.equal(GUARD_FILE_MAX, 1048576);
  assert.equal(GUARD_FILES_MAX, 5000);
  writeFileSync(join(root, "at.mjs"), "x".repeat(GUARD_FILE_MAX));
  writeFileSync(join(root, "over.mjs"), "x".repeat(GUARD_FILE_MAX + 1));
  const artifacts = [adr("accepted", [{ require: "missing", in: "*.mjs", why: "boundary" }])];
  const findings = checkGuards(artifacts, root, { files: ["at.mjs", "over.mjs"] });
  assert.deepEqual(findings.map(f => [f.level, f.message]), [
    ["warn", "adr/one.md guard 1: 1 file(s) over 1048576 bytes skipped."],
    ["issue", 'adr/one.md: require "missing" missing in at.mjs — boundary'],
  ]);
  const tooMany = checkGuards(artifacts, root, { files: Array(GUARD_FILES_MAX + 1).fill("at.mjs") });
  assert.deepEqual(tooMany.map(f => [f.level, f.message]), [
    ["warn", 'adr/one.md guard 1: in "*.mjs" selects 5001 files, more than 5000 — narrow it; not evaluated.'],
  ]);
});

test("doctor guards module: fallback excludes service directories and retains the same cached array", t => {
  const root = fixture(t);
  for (const dir of [".git", "node_modules", ".waypost", "src"]) {
    mkdirSync(join(root, dir));
    writeFileSync(join(root, dir, "file.mjs"), "x");
  }
  // An unusable .git directory makes Git discovery fail and selects the old walk.
  const files = projectFiles(root);
  assert.deepEqual(files, ["src/file.mjs"]);
  writeFileSync(join(root, "later.mjs"), "later");
  assert.strictEqual(projectFiles(root), files);
  assert.deepEqual(files, ["src/file.mjs"], "cache invalidation is deliberately unchanged");
});

test("doctor guards module: Git discovery includes tracked/untracked and excludes ignored files", t => {
  const root = fixture(t);
  execFileSync("git", ["init", "-q", root]);
  writeFileSync(join(root, ".gitignore"), "ignored.mjs\n");
  for (const name of ["tracked.mjs", "untracked.mjs", "ignored.mjs"]) writeFileSync(join(root, name), "x");
  execFileSync("git", ["-C", root, "add", "tracked.mjs"]);
  assert.deepEqual([...projectFiles(root)].sort(), [".gitignore", "tracked.mjs", "untracked.mjs"]);
});

test("doctor guards module: ADR non-execution selector protects the extracted source", async t => {
  const { readFileSync } = await import("node:fs");
  const { parseFrontmatter } = await import("../scripts/lib.mjs");
  const raw = readFileSync(new URL("../docs/vault/adr/0011-decisions-that-check-themselves.md", import.meta.url), "utf8");
  const rules = JSON.parse(parseFrontmatter(raw).data.guards);
  const forbid = rules.find(g => g.forbid);
  const requireRule = rules.find(g => g.require);
  assert.equal(forbid.in, "scripts/doctor*.mjs");
  assert.equal(requireRule.in, "scripts/doctor.mjs");
  const root = fixture(t);
  mkdirSync(join(root, "scripts"));
  const files = ["scripts/doctor.mjs", "scripts/doctor-guards.mjs"];
  writeFileSync(join(root, files[0]), "checkGuards(artifacts, project);\n");
  writeFileSync(join(root, files[1]), 'spawnSync("git", ["ls-files"]);\n');
  assert.deepEqual(checkGuards([adr("accepted", rules)], root, { files }), []);
  writeFileSync(join(root, files[1]), "spawnSync(g.check);\n");
  const findings = checkGuards([adr("accepted", rules)], root, { files });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].level, "issue");
  assert.match(findings[0].message, /scripts\/doctor-guards\.mjs:1/);
});
