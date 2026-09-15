// waypost — tests for scripts/sizes.mjs and `waypost size` (WP-17 story-1).
// Read-only measurement: every fixture lives under os.tmpdir() and is
// removed again in `after()`, never under the project tree or a real cache.
//   node --test tests/sizes.test.mjs

import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync, mkdirSync, writeFileSync, symlinkSync, linkSync, rmSync, existsSync,
} from "node:fs";
import { basename, join, dirname } from "node:path";
import { tmpdir, homedir, hostname } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  scanProject, scanGlobal, DEFAULT_ENTRY_BUDGET, GIT_CALL_COST,
} from "../scripts/sizes.mjs";
import { loadRegistry } from "../scripts/toolchains.mjs";
import { bootIdentity } from "../scripts/capacity.mjs";
import { hostSlug, processTable } from "../scripts/presence.mjs";
import { machineStateDir } from "../scripts/lib.mjs";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const GB = 1024 ** 3;
const MY_HOST = hostname().split(".")[0];

// `waypost size --global` (WP-18 Decision 4) now claims a machine-wide slot
// while it scans, exactly like `waypost run --heavy`: every test below that
// runs it needs the same isolation tests/slots.test.mjs uses for the real
// slot table — a temp HOME/XDG_STATE_HOME/LOCALAPPDATA, so it never touches
// this machine's actual machine-state directory, plus an idle
// WAYPOST_CAPACITY_PROBE so the claim is not at the mercy of whatever else
// is running on the machine that happens to run this suite.
function slotsDirFor(home) {
  return join(
    machineStateDir({ platform: process.platform, home, env: { XDG_STATE_HOME: home, LOCALAPPDATA: home } }),
    `slots.${hostSlug()}`,
  );
}

function heavyEnv(home, extra = {}) {
  return {
    ...process.env,
    HOME: home,
    XDG_STATE_HOME: home,
    LOCALAPPDATA: home,
    WAYPOST_NO_BEAT: "1",
    WAYPOST_CAPACITY_PROBE: JSON.stringify({ cores: 8, busy: 0, available: 8 * GB, total: 16 * GB }),
    ...extra,
  };
}

// A record naming THIS test process — genuinely alive, on this boot, on this
// host — the cheapest way to manufacture a real "live holder" without
// spawning a second process (mirrors tests/slots.test.mjs's own helper).
function selfSlotRecord(id) {
  const table = process.platform === "win32" ? null : processTable();
  const self = table ? table.get(process.pid) : null;
  return {
    id,
    host: MY_HOST,
    proc: { pid: process.pid, started: self ? self.started : null, comm: basename(process.execPath) },
    boot: bootIdentity(),
    session: "sizes-test",
    harness: "test",
    command: "node -e test",
    started_at: new Date().toISOString(),
  };
}

function writeSlotRecord(dir, rec) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${rec.id}.json`), JSON.stringify(rec, null, 2) + "\n", "utf8");
}

// ─── fixtures ────────────────────────────────────────────────────────────

const ROOTS = [];
function tmpRoot(prefix) {
  const p = mkdtempSync(join(tmpdir(), prefix));
  ROOTS.push(p);
  return p;
}
after(() => { for (const p of ROOTS) rmSync(p, { recursive: true, force: true }); });

function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout;
}

// One fixture covering every project-scan acceptance criterion at once: a
// tagged custom target dir with a nested (also tagged) per-triple
// subdirectory, a git-ignored generic name next to a tracked one of the same
// name, two unambiguous names, and a node_modules the walk must never enter.
function makeProjectFixture() {
  const root = tmpRoot("waypost-sizes-project-");
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  // Root-anchored, so it matches only the top-level build/, not src/build/.
  writeFileSync(join(root, ".gitignore"), "/build\n", "utf8");

  mkdirSync(join(root, "tgt", "aarch64"), { recursive: true });
  writeFileSync(join(root, "tgt", "CACHEDIR.TAG"), "Signature: 8a477f597d28d172789f06886806bc55\n", "utf8");
  writeFileSync(join(root, "tgt", "aarch64", "CACHEDIR.TAG"), "Signature: 8a477f597d28d172789f06886806bc55\n", "utf8");
  writeFileSync(join(root, "tgt", "aarch64", "binary"), "x".repeat(1000), "utf8");

  mkdirSync(join(root, "build"), { recursive: true });
  writeFileSync(join(root, "build", "output.o"), "ignored-output", "utf8");
  mkdirSync(join(root, "src", "build"), { recursive: true });
  writeFileSync(join(root, "src", "build", "kept.txt"), "tracked", "utf8");
  git(root, ["add", "src/build", ".gitignore"]);
  git(root, ["commit", "-q", "-m", "init"]);

  mkdirSync(join(root, ".build"), { recursive: true });
  writeFileSync(join(root, ".build", "o.o"), "x", "utf8");
  mkdirSync(join(root, "cmake-build-debug"), { recursive: true });
  writeFileSync(join(root, "cmake-build-debug", "o.o"), "x", "utf8");

  mkdirSync(join(root, "node_modules", "x", "dist"), { recursive: true });
  writeFileSync(join(root, "node_modules", "x", "dist", "index.js"), "x", "utf8");

  return root;
}

// A generic name recurring at every breadth-first level, each one ignored:
// a real monorepo shape (many nested modules, each with its own build/),
// and the one that made per-level git calls expensive without a charge
// against the budget — 30 levels need up to 60 subprocesses to fully
// resolve.
function makeDeepGenericFixture(levels = 30) {
  const root = tmpRoot("waypost-sizes-deep-generic-");
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  writeFileSync(join(root, ".gitignore"), "**/build/\n", "utf8");
  let cur = root;
  for (let i = 0; i < levels; i++) {
    cur = join(cur, `src${i}`);
    mkdirSync(cur, { recursive: true });
    const b = join(cur, "build");
    mkdirSync(b, { recursive: true });
    writeFileSync(join(b, "out.o"), Buffer.alloc(2000, 5));
    writeFileSync(join(cur, "file.txt"), "code", "utf8");
  }
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "init"]);
  return root;
}

// ─── scanProject: the walk invariants ───────────────────────────────────

test("scanProject: outermost tag only, git-ignored vs. tracked generic names, unambiguous names anywhere, node_modules never entered", () => {
  const root = makeProjectFixture();
  const out = scanProject(root);
  assert.equal(out.complete, true);
  const paths = out.dirs.map((d) => d.path).sort();
  assert.deepEqual(paths, [".build", "build", "cmake-build-debug", "tgt"].sort());
  assert.ok(!out.dirs.some((d) => d.path.startsWith("tgt/")), "only the outermost tag counts, not the nested aarch64 tag");
  assert.ok(!out.dirs.some((d) => d.path === "src/build"), "a tracked directory with the same generic name does not count");
  assert.ok(!out.dirs.some((d) => d.path.includes("node_modules")), "node_modules is never entered, so nothing inside it can match either");
});

test("scanProject: a generic-named directory git does NOT ignore is walked, so an unambiguous name nested inside it is still found", () => {
  // Regression: a MAYBE_NAMES directory used to be classified once, at
  // discovery time, and never revisited even when it turned out not to be
  // an artifact — so nothing inside it was ever found.
  const root = tmpRoot("waypost-sizes-walk-notignored-");
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  writeFileSync(join(root, ".gitignore"), "build/\n", "utf8"); // does not match bin/
  mkdirSync(join(root, "bin", "__pycache__"), { recursive: true });
  writeFileSync(join(root, "bin", "tool.py"), "print(1)\n", "utf8");
  writeFileSync(join(root, "bin", "__pycache__", "tool.pyc"), "x".repeat(1000), "utf8");
  git(root, ["add", "bin/tool.py", ".gitignore"]);
  git(root, ["commit", "-q", "-m", "init"]);

  const out = scanProject(root);
  const paths = out.dirs.map((d) => d.path);
  assert.ok(paths.includes("bin/__pycache__"), JSON.stringify(paths));
  assert.ok(!paths.includes("bin"), "bin/ itself is not ignored, so it is not an artifact");
});

test("scanProject: a generic-named directory that git ignores but that holds a tracked file is not counted, and is walked instead", () => {
  // A directory an ignore rule matches can still hold a file someone force-
  // added — reporting it as an artifact would point a cleanup step at
  // tracked work, which is exactly the failure mode a read-only measurement
  // tool must never cause.
  const root = tmpRoot("waypost-sizes-ignored-tracked-");
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  writeFileSync(join(root, ".gitignore"), "build/\n", "utf8");
  mkdirSync(join(root, "build"), { recursive: true });
  writeFileSync(join(root, "build", "kept.txt"), "tracked content", "utf8"); // force-added below
  writeFileSync(join(root, "build", "output.o"), "untracked build output", "utf8");
  git(root, ["add", "-f", "build/kept.txt", ".gitignore"]);
  git(root, ["commit", "-q", "-m", "init"]);

  const out = scanProject(root);
  assert.ok(!out.dirs.some((d) => d.path === "build"), JSON.stringify(out.dirs));
});

test("scanProject: per-level summation measures a shallow artifact even when the budget stops before going deeper", () => {
  // Regression: discovery of the whole tree used to run to completion (or
  // to the budget) before any summation happened, so a budget that only
  // reached the top level reported bytes_at_least: 0 — a useless lower
  // bound. Summation now happens level by level, so a shallow match is
  // measured before the walk ever starts on a deeper, budget-exhausting one.
  const root = tmpRoot("waypost-sizes-per-level-budget-");
  git(root, ["init", "-q"]);
  mkdirSync(join(root, ".build"), { recursive: true });
  writeFileSync(join(root, ".build", "blob.bin"), Buffer.alloc(50000, 9));
  mkdirSync(join(root, "deep"), { recursive: true });
  for (let i = 0; i < 20; i++) {
    mkdirSync(join(root, "deep", `sub${i}`), { recursive: true });
    writeFileSync(join(root, "deep", `sub${i}`, "f.txt"), "x", "utf8");
  }

  const budget = 10; // discovers and sums .build at level 0, stops inside "deep"
  const out = scanProject(root, { budget });
  assert.equal(out.complete, false);
  assert.equal(out.entries_visited, budget);
  assert.ok(out.bytes_at_least > 0, `expected a positive lower bound, got ${out.bytes_at_least}`);
  const build = out.dirs.find((d) => d.path === ".build");
  assert.ok(build && build.bytes > 0 && build.partial === false, JSON.stringify(out.dirs));
});

test("scanProject: a normal fixture reports a small, exact subprocess_calls count", () => {
  const root = makeProjectFixture();
  const out = scanProject(root);
  // One call to resolve the top-level "build" (ignored, so a second call
  // checks it for tracked content too), one more to resolve "src/build"
  // one level down (not ignored — the .gitignore is root-anchored — so no
  // tracked-content call is needed for it): 3 in total. No .xcodeproj/
  // .xcworkspace anywhere in this fixture, so no plutil calls either.
  assert.equal(out.subprocess_calls, 3);
});

test("scanProject: a tree whose generic names recur at many levels stops deterministically at the default budget, with subprocess_calls bounded by it", () => {
  const root = makeDeepGenericFixture(30);
  const out1 = scanProject(root, { budget: DEFAULT_ENTRY_BUDGET });
  const out2 = scanProject(root, { budget: DEFAULT_ENTRY_BUDGET });
  assert.equal(out1.complete, false);
  assert.ok(out1.entries_visited <= DEFAULT_ENTRY_BUDGET);
  // Each unresolved level would need up to two more calls; the walk never
  // spawns one it cannot afford, so the total charged for subprocess calls
  // alone cannot exceed the budget.
  assert.ok(out1.subprocess_calls * GIT_CALL_COST <= DEFAULT_ENTRY_BUDGET,
    `subprocess_calls=${out1.subprocess_calls} at GIT_CALL_COST=${GIT_CALL_COST} exceeds the budget ${DEFAULT_ENTRY_BUDGET}`);
  assert.ok(out1.subprocess_calls > 0);
  assert.deepEqual(out1, out2, "two runs of the same tree with the same budget give the same result");
});

test("scanProject: an unbounded scan of that same deep tree finds and counts all of them, and reports the subprocess calls it took", () => {
  const root = makeDeepGenericFixture(30);
  const out = scanProject(root, { budget: null });
  assert.equal(out.complete, true);
  assert.equal(out.dirs.length, 30);
  assert.equal(out.subprocess_calls, 60); // check-ignore + ls-files, once per level
});

test("scanProject: a derived-data-style generic name (any spelling) is resolved like MAYBE_NAMES — ignored+untracked counts once as a unit, tracked is walked", () => {
  // Regression: a custom Xcode derived-data directory kept inside the
  // project (e.g. ".derivedData/", ignored via the project's own
  // .gitignore) used to only be found through a nested generic name deep
  // inside it (its own Build/…/target), rather than counted once as a
  // whole unit — exactly the shape a project with a custom in-tree derived-
  // data directory has.
  const root = tmpRoot("waypost-sizes-deriveddata-");
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  writeFileSync(join(root, ".gitignore"), ".derivedData/\n", "utf8");
  mkdirSync(join(root, ".derivedData", "Build", "Intermediates.noindex", "XCBuildData", "PIFCache", "target"), { recursive: true });
  writeFileSync(join(root, ".derivedData", "Build", "Intermediates.noindex", "XCBuildData", "PIFCache", "target", "f.o"), "x".repeat(500), "utf8");
  // A plausible tracked dataset directory sharing the "derived_data" spelling.
  mkdirSync(join(root, "derived_data"), { recursive: true });
  writeFileSync(join(root, "derived_data", "dataset.csv"), "a,b,c\n", "utf8");
  git(root, ["add", "derived_data/dataset.csv", ".gitignore"]);
  git(root, ["commit", "-q", "-m", "init"]);

  const out = scanProject(root);
  const paths = out.dirs.map((d) => d.path);
  assert.ok(paths.includes(".derivedData"), JSON.stringify(paths));
  assert.ok(!paths.some((p) => p.includes("target")), "the nested generic name inside it is never independently listed");
  assert.ok(!paths.includes("derived_data"), "a tracked derived_data directory does not count as an artifact");
});

test("scanProject: a project root that is itself a symlink to a directory is followed (only the root)", () => {
  const real = tmpRoot("waypost-sizes-symroot-real-");
  mkdirSync(join(real, ".build"), { recursive: true });
  writeFileSync(join(real, ".build", "o.o"), "x", "utf8");
  const parent = tmpRoot("waypost-sizes-symroot-link-");
  const link = join(parent, "link-to-real");
  symlinkSync(real, link);

  assert.doesNotThrow(() => scanProject(link));
  const out = scanProject(link);
  assert.ok(out.dirs.some((d) => d.path === ".build"), JSON.stringify(out.dirs));
});

test("scanProject: a directory symlink loop does not hang the scan and is never followed", () => {
  const root = tmpRoot("waypost-sizes-loop-");
  mkdirSync(join(root, ".build", "sub"), { recursive: true });
  writeFileSync(join(root, ".build", "sub", "f.txt"), "x", "utf8");
  symlinkSync(join(root, ".build"), join(root, ".build", "sub", "self")); // a directory symlinked into itself
  const t0 = Date.now();
  const out = scanProject(root);
  const ms = Date.now() - t0;
  assert.ok(ms < 5000, `scan took ${ms}ms — the loop may have been followed`);
  assert.deepEqual(out.dirs.map((d) => d.path), [".build"]);
});

test("scanProject: two hard links to one file are counted once, like du", () => {
  const linked = tmpRoot("waypost-sizes-hardlink-");
  mkdirSync(join(linked, ".build"), { recursive: true });
  writeFileSync(join(linked, ".build", "a.bin"), Buffer.alloc(200000, 1));
  linkSync(join(linked, ".build", "a.bin"), join(linked, ".build", "b.bin"));

  const single = tmpRoot("waypost-sizes-hardlink-control-");
  mkdirSync(join(single, ".build"), { recursive: true });
  writeFileSync(join(single, ".build", "a.bin"), Buffer.alloc(200000, 1));

  const linkedBytes = scanProject(linked).dirs.find((d) => d.path === ".build").bytes;
  const singleBytes = scanProject(single).dirs.find((d) => d.path === ".build").bytes;
  assert.equal(linkedBytes, singleBytes, "a second hard link to the same file must add nothing");
});

test("scanProject: --budget below the tree's entry count stops deterministically and marks a matched directory partial", () => {
  const root = makeProjectFixture();
  const budget = 5;
  const out1 = scanProject(root, { budget });
  const out2 = scanProject(root, { budget });
  assert.equal(out1.complete, false);
  assert.equal(out1.entries_visited, budget);
  assert.equal(out1.entry_budget, budget);
  assert.ok(typeof out1.bytes_at_least === "number");
  assert.ok(out1.dirs.some((d) => d.partial === true), JSON.stringify(out1.dirs));
  assert.deepEqual(out1, out2, "two runs of the same tree with the same budget give the same result");
});

test("scanProject: an unbounded scan always reports complete:true and no partial directory", () => {
  const root = makeProjectFixture();
  const out = scanProject(root);
  assert.equal(out.complete, true);
  assert.ok(out.dirs.every((d) => d.partial === false));
  assert.equal(out.entry_budget, null);
});

test("scanProject: refuses $HOME and / as a project root", () => {
  assert.throws(() => scanProject(homedir()), /\$HOME/);
  assert.throws(() => scanProject("/"), /refusing to scan \//);
  // The injectable `home` (used below for the DerivedData fixture) is
  // refused the same way — it is not a separate code path.
  const fakeHome = tmpRoot("waypost-sizes-fakehome-");
  assert.throws(() => scanProject(fakeHome, { home: fakeHome }), /\$HOME/);
});

test("scanProject: does not refuse an ordinary subdirectory of $HOME", () => {
  const sub = tmpRoot("waypost-sizes-realsub-");
  assert.doesNotThrow(() => scanProject(sub));
});

// macOS only: DerivedData is matched by the WorkspacePath recorded in its own
// info.plist, read via `plutil` — a system tool, not something to fake with a
// dependency. `home` is injectable precisely so this never touches the real
// ~/Library/Developer/Xcode/DerivedData. Narrowed first by the basename of
// an .xcodeproj/.xcworkspace the walk actually found inside the project, so
// the fixture must contain one — a bare WorkspacePath is no longer enough.
test("scanProject: Xcode DerivedData outside the project is matched by its recorded WorkspacePath, narrowed by the .xcodeproj basename the walk found (macOS)", { skip: process.platform !== "darwin" }, () => {
  const home = tmpRoot("waypost-sizes-xcode-home-");
  const project = tmpRoot("waypost-sizes-xcode-project-");
  mkdirSync(join(project, "Foo.xcodeproj"), { recursive: true }); // the walk must see this to narrow by "Foo"
  const dd = join(home, "Library", "Developer", "Xcode", "DerivedData", "Foo-abcdefgh");
  mkdirSync(join(dd, "Build"), { recursive: true });
  writeFileSync(join(dd, "Build", "big.o"), "x".repeat(4000), "utf8");
  const plist = join(dd, "info.plist");
  const create = spawnSync("plutil", ["-create", "xml1", plist]);
  assert.equal(create.status, 0, create.stderr);
  const insert = spawnSync("plutil", ["-insert", "WorkspacePath", "-string", join(project, "Foo.xcodeproj"), plist]);
  assert.equal(insert.status, 0, insert.stderr);

  const out = scanProject(project, { home });
  assert.ok(out.dirs.some((d) => d.path === dd), JSON.stringify(out.dirs));
  assert.ok(out.subprocess_calls >= 1, "the plutil confirmation call is counted");

  // A DerivedData folder whose name does not start with a basename the walk
  // found is never even asked about via plutil, regardless of what its own
  // WorkspacePath says.
  const unrelated = join(home, "Library", "Developer", "Xcode", "DerivedData", "SomeOtherApp-zzzzzzzz");
  mkdirSync(unrelated, { recursive: true });
  const unrelatedPlist = join(unrelated, "info.plist");
  spawnSync("plutil", ["-create", "xml1", unrelatedPlist]);
  spawnSync("plutil", ["-insert", "WorkspacePath", "-string", join(project, "Foo.xcodeproj"), unrelatedPlist]);
  const out2 = scanProject(project, { home });
  assert.ok(!out2.dirs.some((d) => d.path === unrelated), "not matched: its name does not start with a basename the walk found");

  // A DerivedData folder whose prefix DOES match but whose own workspace
  // lies elsewhere is still excluded by the plutil confirmation.
  const other = join(home, "Library", "Developer", "Xcode", "DerivedData", "Foo-zzzzzzzz");
  mkdirSync(other, { recursive: true });
  const otherPlist = join(other, "info.plist");
  spawnSync("plutil", ["-create", "xml1", otherPlist]);
  spawnSync("plutil", ["-insert", "WorkspacePath", "-string", "/somewhere/else/Foo.xcodeproj", otherPlist]);
  const out3 = scanProject(project, { home });
  assert.ok(!out3.dirs.some((d) => d.path === other));
});

// ─── scanGlobal ──────────────────────────────────────────────────────────

// The registry's own schema (every id, os, confidence, docs/notes rule) is
// covered by tests/toolchains.test.mjs — this file only exercises the walk
// and the audit that consume it.

// scanGlobal has no entry budget (only scanProject does — the ADR bounds
// only the walk `doctor` repeats on every call) and this development
// machine's CoreSimulator device tree alone is tens of gigabytes of small
// files, so a real, unfiltered run legitimately takes tens of seconds. That
// cost is paid once, in the end-to-end CLI test below, rather than twice.

test("scanGlobal: with a temp HOME, only fixtures under it are found, and no path outside it leaks in", () => {
  const home = tmpRoot("waypost-sizes-home-");
  mkdirSync(join(home, ".cargo", "registry"), { recursive: true });
  writeFileSync(join(home, ".cargo", "registry", "f.bin"), Buffer.alloc(50000, 2));
  const out = scanGlobal({ home, env: {}, platform: process.platform });
  const hit = out.find((e) => e.path === join(home, ".cargo", "registry"));
  assert.ok(hit, "the fixture under the temp HOME is found");
  assert.ok(hit.bytes > 0);
  assert.ok(out.every((e) => e.path.startsWith(home) || !e.path.startsWith(homedir())), "nothing from the real home leaks in");
});

test("scanGlobal: an unset Windows env var skips that entry instead of guessing a fallback", () => {
  const home = tmpRoot("waypost-sizes-win-");
  mkdirSync(join(home, ".cargo", "registry"), { recursive: true });
  writeFileSync(join(home, ".cargo", "registry", "f.bin"), Buffer.alloc(10000, 3));
  const out = scanGlobal({ home, env: {}, platform: "win32" });
  assert.ok(out.some((e) => e.path === join(home, ".cargo", "registry")), "a $HOME-based entry still resolves without LOCALAPPDATA");
  assert.ok(!out.some((e) => e.path.includes("npm-cache")), "an entry needing LOCALAPPDATA is skipped, not guessed, when it is unset");
});

test("scanGlobal: a trailing * is expanded by prefix-matching the parent directory's own entries, no glob library", () => {
  const home = tmpRoot("waypost-sizes-star-");
  const base = join(home, "Library", "Caches", "Google");
  mkdirSync(join(base, "AndroidStudio2024.2"), { recursive: true });
  mkdirSync(join(base, "AndroidStudio2023.1"), { recursive: true });
  mkdirSync(join(base, "Other"), { recursive: true }); // must not match the prefix
  writeFileSync(join(base, "AndroidStudio2024.2", "f.bin"), Buffer.alloc(5000, 1));
  const out = scanGlobal({ home, env: {}, platform: "darwin" });
  const hits = out.filter((e) => e.path.includes("AndroidStudio"));
  assert.equal(hits.length, 2, JSON.stringify(out.map((e) => e.path)));
  assert.ok(!out.some((e) => e.path.endsWith("Other")));
});

// scanGlobal({ profile, registry }) (WP-17, the discovery story; hardened per
// independent review): a fresh machine profile's own `caches` are measured
// directly, but the profile holds FACTS only — { tool, item, path, source,
// ask_note? } — never policy (clean/regenerable/confidence/docs/notes).
// `item` is the cache item's own raw path template, a stable key; scanGlobal
// reattaches policy from the CURRENT `registry`, matched by (tool, item), so
// a fix to `regenerable`/`clean` in the registry is visible at once, and an
// item the registry no longer carries is skipped (never measured) and
// counted on the returned array's own `.dropped` property.
test("scanGlobal({ profile, registry }): measures the profile's own path, re-attaching policy from the registry by (tool, item)", () => {
  const home = tmpRoot("waypost-sizes-profile-");
  const fixture = join(home, "asked-cache-dir");
  mkdirSync(fixture, { recursive: true });
  writeFileSync(join(fixture, "f.bin"), Buffer.alloc(12345, 1));
  const profile = {
    host: "h1", platform: "darwin", arch: "arm64", generated_at: new Date().toISOString(),
    tools: [],
    caches: [{ tool: "faketool", item: "$HOME/asked-cache-dir", path: fixture, source: "asked" }],
  };
  const registry = {
    entries: [{
      id: "faketool", os: ["darwin"],
      caches: [{
        path: "$HOME/asked-cache-dir", os: ["darwin"], confidence: { darwin: "verified" },
        docs: "https://example.com", notes: null, regenerable: true, clean: "faketool clean",
      }],
    }],
  };
  const out = scanGlobal({ profile, platform: "darwin", registry });
  assert.equal(out.length, 1);
  assert.equal(out[0].path, fixture);
  assert.equal(out[0].source, "asked");
  assert.equal(out[0].tool, "faketool");
  assert.equal(out[0].clean, "faketool clean");
  assert.equal(out[0].regenerable, true);
  assert.equal(out[0].confidence, "verified");
  assert.ok(out[0].bytes >= 12345);
  assert.equal(out.dropped, 0);
});

test("scanGlobal({ profile, registry }): editing regenerable/clean in the registry is visible immediately, the profile itself is never touched", () => {
  const home = tmpRoot("waypost-sizes-policychange-");
  const fixture = join(home, "cache-dir");
  mkdirSync(fixture, { recursive: true });
  writeFileSync(join(fixture, "f.bin"), Buffer.alloc(1000, 1));
  const profile = { caches: [{ tool: "faketool", item: "$HOME/cache-dir", path: fixture, source: "default" }] };
  const entryWith = (regenerable, clean) => ({ entries: [{ id: "faketool", os: ["darwin"], caches: [{
    path: "$HOME/cache-dir", os: ["darwin"], confidence: { darwin: "verified" }, regenerable, clean,
  }] }] });

  const before = scanGlobal({ profile, platform: "darwin", registry: entryWith(false, "old clean text") });
  assert.equal(before[0].regenerable, false);
  assert.equal(before[0].clean, "old clean text");

  const after = scanGlobal({ profile, platform: "darwin", registry: entryWith(true, "new clean text") });
  assert.equal(after[0].regenerable, true, "a fixed regenerable is visible without refreshing the profile");
  assert.equal(after[0].clean, "new clean text");
});

test("scanGlobal({ profile, registry }): a cache item no longer in the registry is not measured, and counted via out.dropped", () => {
  const home = tmpRoot("waypost-sizes-dropped-");
  const fixture = join(home, "gone-from-registry");
  mkdirSync(fixture, { recursive: true });
  writeFileSync(join(fixture, "f.bin"), Buffer.alloc(1000, 1));
  const profile = { caches: [{ tool: "faketool", item: "$HOME/gone-from-registry", path: fixture, source: "default" }] };
  const out = scanGlobal({ profile, platform: "darwin", registry: { entries: [] } }); // faketool's entry no longer exists
  assert.equal(out.length, 0, "the dropped item is not measured");
  assert.equal(out.dropped, 1);
});

test("scanGlobal({ profile }): a profile whose caches is not an array is treated as empty, not thrown", () => {
  const out = scanGlobal({ profile: { caches: "not an array" }, registry: { entries: [] } });
  assert.equal(out.length, 0);
  assert.equal(out.dropped, 0);
});

// ─── bin/waypost size ────────────────────────────────────────────────────

function runBin(args, opts = {}) {
  const r = spawnSync(process.execPath, [join(REPO, "bin", "waypost"), ...args], {
    encoding: "utf8", env: { ...process.env, WAYPOST_NO_BEAT: "1" }, cwd: REPO, timeout: 15000, ...opts,
  });
  return r;
}

test("bin/waypost size --project --json: pure JSON, in the shape scanProject returns", () => {
  const root = makeProjectFixture();
  const r = runBin(["size", "--project", root, "--json"]);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.root, root);
  assert.ok(Array.isArray(out.dirs));
});

test("bin/waypost size --project (human output): GB figures and paths, no bound vault needed", () => {
  const root = makeProjectFixture();
  const r = runBin(["size", "--project", root]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^\d+\.\d GB$/m);
  assert.match(r.stdout, /GB\s+.*\.build/);
});

test("bin/waypost size --budget <n>: a small budget is honoured end to end and reported as stopped", () => {
  const root = makeProjectFixture();
  const r = runBin(["size", "--project", root, "--budget", "3", "--json"]);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.complete, false);
  assert.equal(out.entries_visited, 3);
  const human = runBin(["size", "--project", root, "--budget", "3"]);
  assert.match(human.stdout, /^≥ \d+\.\d GB \(stopped after 3 entries/m);
});

test("bin/waypost size --project refuses $HOME and /", () => {
  const home = runBin(["size", "--project", homedir()]);
  assert.notEqual(home.status, 0);
  assert.match(home.stderr, /\$HOME/);
  const root = runBin(["size", "--project", "/"]);
  assert.notEqual(root.status, 0);
  assert.match(root.stderr, /refusing to scan \//);
});

test("bin/waypost size --global: human output shows only entries at or above 0.1 GB, --json has all", () => {
  // os.homedir() honours $HOME on POSIX, so a fixture HOME keeps this fast
  // and deterministic instead of paying for a real, unbounded scan of every
  // cache on the machine running the tests (see the note above).
  const home = tmpRoot("waypost-sizes-global-cli-");
  mkdirSync(join(home, ".cargo", "registry"), { recursive: true });
  writeFileSync(join(home, ".cargo", "registry", "big.bin"), Buffer.alloc(150_000_000, 7)); // ~0.14 GB
  mkdirSync(join(home, ".android", "cache"), { recursive: true });
  writeFileSync(join(home, ".android", "cache", "small.bin"), Buffer.alloc(1000, 1)); // well under 0.1 GB
  // WP-18 Decision 4: this scan now claims a machine-wide slot, so it needs
  // the same isolation as the machine-state directory itself (heavyEnv above).
  const env = heavyEnv(home);
  const runWithHome = (args) => spawnSync(process.execPath, [join(REPO, "bin", "waypost"), ...args], {
    encoding: "utf8", env, cwd: REPO, timeout: 15000,
  });

  const json = runWithHome(["size", "--global", "--json"]);
  assert.equal(json.status, 0, json.stderr);
  const { caches: all, notes } = JSON.parse(json.stdout);
  assert.ok(Array.isArray(notes));
  assert.ok(all.some((e) => e.path === join(home, ".cargo", "registry") && e.tool === "rust" && e.source === "default"), JSON.stringify(all));
  assert.ok(all.some((e) => e.path === join(home, ".android", "cache") && e.tool === "android"), JSON.stringify(all));
  for (const e of all) assert.ok(existsSync(e.path), `${e.path} reported but does not exist`);

  const human = runWithHome(["size", "--global"]);
  assert.equal(human.status, 0, human.stderr);
  assert.match(human.stdout, /registry/, human.stdout);
  assert.match(human.stdout, /\[rust · default\]/, human.stdout);
  assert.doesNotMatch(human.stdout, /\.android[\\/]cache/, "an entry under 0.1 GB is not named in the human output");
  assert.match(human.stdout, /more below 0\.1 GB/, human.stdout);
});

test("bin/waypost size --global: exits 75 when a slot is already held and WAYPOST_HEAVY_MAX=1", () => {
  const home = tmpRoot("waypost-sizes-global-heavy-");
  const dir = slotsDirFor(home);
  writeSlotRecord(dir, selfSlotRecord("held-by-this-test")); // this process itself: genuinely alive
  const env = heavyEnv(home, { WAYPOST_HEAVY_MAX: "1" });
  const r = spawnSync(process.execPath, [join(REPO, "bin", "waypost"), "size", "--global"], {
    encoding: "utf8", env, cwd: REPO, timeout: 15000,
  });
  assert.equal(r.status, 75, r.stderr);
  assert.match(r.stderr, /refused/);
  assert.match(r.stderr, /retry: waypost size --global/);
});

test("bin/waypost size --project --json rejects a non-integer --budget", () => {
  const r = runBin(["size", "--project", REPO, "--budget", "abc"]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /--budget/);
});

test("bin/waypost help lists size", () => {
  const r = runBin(["help"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^\s+size /m);
});

// ─── sanity on this exact checkout ───────────────────────────────────────

test("node --check passes on scripts/sizes.mjs and bin/waypost", () => {
  for (const f of ["scripts/sizes.mjs", "bin/waypost"]) {
    const r = spawnSync(process.execPath, ["--check", join(REPO, f)], { encoding: "utf8" });
    assert.equal(r.status, 0, `${f}: ${r.stderr}`);
  }
});

test("the disk-hygiene ADR's three guards select scripts/sizes.mjs and all pass (no finding for this ADR)", () => {
  const r = runBin(["doctor", "--json"]);
  const findings = JSON.parse(r.stdout);
  const adrFile = "adr/disk-hygiene-by-discovery-a-toolchain-registry-a-machine-and-project-profile-and-cleanup-only-after-a-yes.md";
  const ours = findings.filter((f) => f.file === adrFile);
  assert.deepEqual(ours, [], JSON.stringify(ours));
});

test("DEFAULT_ENTRY_BUDGET is exported for doctor's future use, and is a sane positive integer", () => {
  assert.ok(Number.isInteger(DEFAULT_ENTRY_BUDGET) && DEFAULT_ENTRY_BUDGET > 0);
});
