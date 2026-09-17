// waypost — tests for scripts/launcher.mjs: the command on PATH as npm's symlink
// into a checkout that loses its executable bit, and the shim that replaces it.
// Everything runs in temp directories with a PATH of its own; nothing on the
// real PATH is read or written.
//   node --test tests/launcher.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, symlinkSync, lstatSync, rmSync, realpathSync } from "node:fs";
import { join, dirname, delimiter } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

import { inspect, installShims, findLaunchers, shimText, SHIM_MARKER } from "../scripts/launcher.mjs";
import { checkLauncher } from "../scripts/doctor.mjs";

const POSIX = process.platform !== "win32";
const ROOTS = [];
process.on("exit", () => { for (const p of ROOTS) { try { rmSync(p, { recursive: true, force: true }); } catch { /* best effort */ } } });

// A checkout with an entry point that prints its arguments, and a bin directory
// holding npm-style symlinks to it.
function fixture({ fileMode = null, execBit = true } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "wp-launcher-")));
  ROOTS.push(root);
  const toolRoot = join(root, "checkout");
  const binDir = join(root, "pathbin");
  mkdirSync(join(toolRoot, "bin"), { recursive: true });
  mkdirSync(binDir);
  const entry = join(toolRoot, "bin", "waypost");
  writeFileSync(entry, "#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify(process.argv.slice(2)));\n");
  chmodSync(entry, execBit ? 0o755 : 0o644);
  if (fileMode !== null) {
    spawnSync("git", ["init", "-q", toolRoot]);
    spawnSync("git", ["-C", toolRoot, "config", "core.fileMode", String(fileMode)]);
  }
  for (const name of ["waypost", "wyp"]) symlinkSync(entry, join(binDir, name));
  const pathEnv = [binDir, dirname(process.execPath)].join(delimiter);
  return { toolRoot, binDir, entry, pathEnv };
}

test("a symlink to an executable entry point in an ordinary checkout is no risk", { skip: !POSIX }, () => {
  const f = fixture({ fileMode: true });
  const r = inspect({ toolRoot: f.toolRoot, pathEnv: f.pathEnv });
  assert.equal(r.risk, "none");
  assert.equal(r.linked.length, 2);
  assert.deepEqual(checkLauncher(r), []);
});

test("core.fileMode=false makes the same symlink exposed, and doctor warns", { skip: !POSIX }, () => {
  const f = fixture({ fileMode: false });
  const r = inspect({ toolRoot: f.toolRoot, pathEnv: f.pathEnv });
  assert.equal(r.risk, "exposed");
  const findings = checkLauncher(r);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].level, "warn");
  assert.equal(findings[0].check, "launcher");
  assert.match(findings[0].message, /`waypost launcher --write`/);
});

test("a lost executable bit is broken, and doctor calls it an issue", { skip: !POSIX }, () => {
  const f = fixture({ fileMode: false, execBit: false });
  const r = inspect({ toolRoot: f.toolRoot, pathEnv: f.pathEnv });
  assert.equal(r.risk, "broken");
  assert.equal(checkLauncher(r)[0].level, "issue");
  // Broken names the node form: `waypost launcher` would not start either.
  assert.match(checkLauncher(r)[0].message, /node '.*scripts\/launcher\.mjs' --write/);
  // The failure this whole file is about: the symlink cannot be executed.
  const viaSymlink = spawnSync(join(f.binDir, "waypost"), ["x"], { encoding: "utf8" });
  assert.notEqual(viaSymlink.status, 0);
});

test("--write replaces the symlinks with shims that run without the bit", { skip: !POSIX }, () => {
  const f = fixture({ fileMode: false, execBit: false });
  const { written } = installShims({ toolRoot: f.toolRoot, pathEnv: f.pathEnv });
  assert.equal(written.length, 2);
  for (const file of written) {
    assert.equal(lstatSync(file).isSymbolicLink(), false);
    assert.ok(readFileSync(file, "utf8").includes(SHIM_MARKER));
  }
  const run = spawnSync(join(f.binDir, "wyp"), ["doctor", "two words"], { encoding: "utf8", env: { ...process.env, PATH: f.pathEnv } });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), ["doctor", "two words"]);

  const after = inspect({ toolRoot: f.toolRoot, pathEnv: f.pathEnv });
  assert.equal(after.risk, "none");
  assert.deepEqual(after.launchers.map((l) => l.kind), ["shim", "shim"]);
  // Idempotent: a second run finds nothing left to replace.
  assert.deepEqual(installShims({ toolRoot: f.toolRoot, pathEnv: f.pathEnv }).written, []);
});

test("a file on PATH that is not waypost's is never touched", { skip: !POSIX }, () => {
  const f = fixture({ fileMode: false, execBit: false });
  const own = join(f.binDir, "waypost");
  rmSync(own);
  writeFileSync(own, "#!/bin/sh\necho mine\n", { mode: 0o755 });
  const { written } = installShims({ toolRoot: f.toolRoot, pathEnv: f.pathEnv });
  assert.deepEqual(written, [join(f.binDir, "wyp")]);
  assert.equal(readFileSync(own, "utf8"), "#!/bin/sh\necho mine\n");
  assert.equal(findLaunchers({ pathEnv: f.pathEnv })[0].kind, "file");
});

test("a symlink to some other checkout is not ours to replace", { skip: !POSIX }, () => {
  const f = fixture({ fileMode: false });
  const other = fixture({ fileMode: false, execBit: false });
  const r = inspect({ toolRoot: other.toolRoot, pathEnv: f.pathEnv });
  assert.equal(r.linked.length, 0);
  assert.equal(r.risk, "none");
});

test("paths with spaces and quotes survive the shim", { skip: !POSIX }, () => {
  const text = shimText({ node: "/opt/my node/bin/node", entry: "/Users/o'brien/check out/bin/waypost" });
  assert.match(text, /exec '\/opt\/my node\/bin\/node' '\/Users\/o'\\''brien\/check out\/bin\/waypost' "\$@"/);
});

test("`waypost launcher` is routed through bin/waypost", { skip: !POSIX }, () => {
  const REPO = dirname(dirname(new URL(import.meta.url).pathname));
  // A PATH with node and nothing else: no launcher of ours on it, so no risk, whatever the machine.
  const env = { ...process.env, PATH: dirname(process.execPath) };
  const run = spawnSync(process.execPath, [join(REPO, "bin", "waypost"), "launcher", "--json"], { encoding: "utf8", env });
  assert.equal(run.status, 0, run.stderr);
  const report = JSON.parse(run.stdout);
  assert.equal(report.risk, "none");
  assert.deepEqual(report.launchers.map((l) => l.kind), ["missing", "missing"]);
});

test("Windows is out of scope: no launchers, no risk", () => {
  const r = inspect({ toolRoot: tmpdir(), pathEnv: "", platform: "win32" });
  assert.equal(r.risk, "none");
  assert.deepEqual(r.launchers, []);
});
