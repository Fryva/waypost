// waypost — tests for scripts/discovery.mjs (WP-17, the discovery-and-profile
// story, ADR "Disk hygiene by discovery"). Hermetic: every "tool" here is a
// throwaway shell script on a temp PATH this suite builds itself, every
// platform is injected, and every home/env/host is a fixture — nothing here
// ever touches, probes or asks a real tool on the machine running the tests.
//   node --test tests/discovery.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  findOnPath, detectManifests, machineStateDir, machineProfilePath, projectProfilePath,
  needsRefresh, buildMachineProfile, buildProjectProfile, hostSlug,
} from "../scripts/discovery.mjs";

const ROOTS = [];
function tmpRoot(prefix) {
  const p = mkdtempSync(join(tmpdir(), prefix));
  ROOTS.push(p);
  return p;
}
process.on("exit", () => { for (const p of ROOTS) { try { rmSync(p, { recursive: true, force: true }); } catch { /* best effort */ } } });

// A throwaway "#!/bin/sh" tool: chmod 755, so findOnPath's own executable
// check (POSIX: at least one execute bit) accepts it. Windows batch-shim
// fixtures are written directly where needed — a .cmd's content is never
// run in this suite (the batch-shim guard, tested below, refuses before
// spawning it).
function fakeTool(dir, name, script) {
  const p = join(dir, name);
  writeFileSync(p, script, "utf8");
  chmodSync(p, 0o755);
  return p;
}

function fakeEntry(id, { detectBin, askArgv, askEnv, path = "$XDG_CACHE_HOME/" + id, os = ["darwin", "linux", "win32"] } = {}) {
  return {
    id, name: id, os,
    detect: { bins: [detectBin || id], manifests: [] },
    artifacts: [], skip: [],
    caches: [{
      path, os, confidence: Object.fromEntries(os.map((o) => [o, "verified"])),
      docs: "https://example.com/docs", regenerable: true, clean: `${id} clean`,
      ...(askArgv ? { ask: { argv: askArgv, parse: "line", ...(askEnv ? { env: askEnv } : {}), docs: "https://example.com/ask" } } : {}),
    }],
    locators: [],
  };
}

// ─── findOnPath ───────────────────────────────────────────────────────────

test("findOnPath (POSIX): finds an executable file on PATH, skips a non-executable file and a directory of the same name", () => {
  const dir = tmpRoot("waypost-disc-path-");
  fakeTool(dir, "runnable", "#!/bin/sh\necho hi\n");
  writeFileSync(join(dir, "notexec"), "#!/bin/sh\necho hi\n", "utf8"); // no chmod: not executable
  mkdirSync(join(dir, "adir"));
  const env = { PATH: dir };
  assert.equal(findOnPath("runnable", { platform: "darwin", env }), join(dir, "runnable"));
  assert.equal(findOnPath("notexec", { platform: "darwin", env }), null);
  assert.equal(findOnPath("adir", { platform: "darwin", env }), null);
  assert.equal(findOnPath("nosuch", { platform: "darwin", env }), null);
});

test("findOnPath (win32): PATHEXT search is case-insensitive on both the extension and a real file's own casing, and never runs anything", () => {
  const dir = tmpRoot("waypost-disc-winpath-");
  writeFileSync(join(dir, "Tool.EXE"), "not really a binary", "utf8"); // no chmod needed: win32 skips the exec-bit check
  const found = findOnPath("tool", { platform: "win32", env: { PATH: dir, PATHEXT: ".com;.exe;.bat;.cmd" } });
  assert.equal(found, join(dir, "Tool.EXE"));
});

// Item 1 (independent review): a PATH entry that is not itself absolute is
// never searched. Without this, `join(relativeDir, name)` would resolve
// relative to whatever the CALLER's cwd happens to be at lookup time — and,
// worse, askCache later spawns the "found" file with cwd=home, so a
// relative PATH entry that happened to exist relative to the lookup site
// could resolve to (and run) an entirely different file once actually
// spawned relative to home.
test("findOnPath: a relative PATH entry is skipped — never resolved even when it WOULD match the caller's own cwd", () => {
  const root = tmpRoot("waypost-disc-relpath-");
  const relDir = "rel-bin";
  mkdirSync(join(root, relDir), { recursive: true });
  fakeTool(join(root, relDir), "faketool", "#!/bin/sh\necho hi\n");
  const prevCwd = process.cwd();
  try {
    // chdir into root so a naive join(relDir, name) WOULD land on the real
    // fixture — proving the skip is the isAbsolute filter itself, not just
    // a coincidental cwd mismatch (a relative entry resolved against the
    // WRONG directory would also return null, but for the wrong reason).
    process.chdir(root);
    const env = { PATH: relDir };
    assert.equal(findOnPath("faketool", { platform: "darwin", env }), null,
      "a relative PATH entry must never be searched, even though it exists relative to the current cwd");
  } finally {
    process.chdir(prevCwd);
  }
  // Confirms the fixture itself is real: an ABSOLUTE PATH entry does find it.
  const envAbs = { PATH: join(root, relDir) };
  assert.equal(findOnPath("faketool", { platform: "darwin", env: envAbs }), join(root, relDir, "faketool"));
});

test("findOnPath (win32): a relative PATH entry is skipped there too", () => {
  const root = tmpRoot("waypost-disc-relpath-win-");
  mkdirSync(join(root, "rel-bin"), { recursive: true });
  writeFileSync(join(root, "rel-bin", "tool.exe"), "not really a binary", "utf8");
  const prevCwd = process.cwd();
  try {
    process.chdir(root);
    const env = { PATH: "rel-bin", PATHEXT: ".exe" };
    assert.equal(findOnPath("tool", { platform: "win32", env }), null);
  } finally {
    process.chdir(prevCwd);
  }
  const envAbs = { PATH: join(root, "rel-bin"), PATHEXT: ".exe" };
  assert.equal(findOnPath("tool", { platform: "win32", env: envAbs }), join(root, "rel-bin", "tool.exe"));
});

// ─── detectManifests ────────────────────────────────────────────────────

test("detectManifests: matches exact names and *.ext suffixes at the project root only, one hit per entry", () => {
  const root = tmpRoot("waypost-disc-manifests-");
  writeFileSync(join(root, "go.mod"), "module x\n", "utf8");
  writeFileSync(join(root, "app.csproj"), "<Project/>", "utf8");
  mkdirSync(join(root, "sub"));
  writeFileSync(join(root, "sub", "go.mod"), "module y\n", "utf8"); // must NOT be found — root only
  const entries = [
    { id: "go", name: "Go", detect: { manifests: ["go.mod"] } },
    { id: "dotnet", name: ".NET", detect: { manifests: ["*.csproj", "*.sln"] } },
    { id: "rust", name: "Rust", detect: { manifests: ["Cargo.toml"] } },
  ];
  const found = detectManifests(entries, { projectRoot: root });
  assert.deepEqual(found.map((f) => f.id).sort(), ["dotnet", "go"]);
  assert.equal(found.find((f) => f.id === "dotnet").manifest, "app.csproj");
});

// ─── machineStateDir / machineProfilePath / projectProfilePath ──────────

test("machineStateDir resolves per OS from the injected platform and environment (re-exported from lib.mjs — one implementation)", () => {
  const home = join("HOME");
  assert.equal(machineStateDir({ platform: "darwin", env: {}, home }), join(home, "Library", "Application Support", "Waypost"));
  assert.equal(machineStateDir({ platform: "linux", env: {}, home }), join(home, ".local", "state", "waypost"));
  assert.equal(machineStateDir({ platform: "linux", env: { XDG_STATE_HOME: join("XDG") }, home }), join("XDG", "waypost"));
  assert.equal(machineStateDir({ platform: "win32", env: {}, home }), join(home, "AppData", "Local", "Waypost"));
  assert.equal(machineStateDir({ platform: "win32", env: { LOCALAPPDATA: join("LAD") }, home }), join("LAD", "Waypost"));
});

test("machineProfilePath and projectProfilePath: machine.<host>.json in the machine state directory, project.<host>.json under .waypost/state/", () => {
  const home = join("HOME");
  assert.equal(
    machineProfilePath({ platform: "darwin", env: {}, home, host: "h1" }),
    join(home, "Library", "Application Support", "Waypost", "machine.h1.json"),
  );
  assert.equal(
    projectProfilePath({ projectRoot: join("PROJ"), host: "h1" }),
    join("PROJ", ".waypost", "state", "project.h1.json"),
  );
});

test("two host names sharing one home keep two machine profiles; two sharing one checkout keep two project profiles", () => {
  const home = join("SHARED-HOME");
  const m1 = machineProfilePath({ platform: "darwin", env: {}, home, host: "alice" });
  const m2 = machineProfilePath({ platform: "darwin", env: {}, home, host: "bob" });
  assert.notEqual(m1, m2);
  assert.ok(m1.endsWith(join("machine.alice.json")));
  assert.ok(m2.endsWith(join("machine.bob.json")));

  const proj = join("SHARED-CHECKOUT");
  const p1 = projectProfilePath({ projectRoot: proj, host: "alice" });
  const p2 = projectProfilePath({ projectRoot: proj, host: "bob" });
  assert.notEqual(p1, p2);
  assert.ok(p1.endsWith(join("project.alice.json")));
  assert.ok(p2.endsWith(join("project.bob.json")));
});

// ─── needsRefresh ────────────────────────────────────────────────────────

test("needsRefresh: missing, unparseable, stale (>30 days), fresh, and force", () => {
  const now = Date.parse("2026-09-15T00:00:00.000Z");
  const DAY = 24 * 60 * 60 * 1000;
  assert.equal(needsRefresh(null, { now }), true, "missing");
  assert.equal(needsRefresh(undefined, { now }), true, "missing");
  assert.equal(needsRefresh({}, { now }), true, "no generated_at at all");
  assert.equal(needsRefresh({ generated_at: "not a date" }, { now }), true, "unparseable date");
  const fresh = { generated_at: new Date(now - 10 * DAY).toISOString() };
  assert.equal(needsRefresh(fresh, { now }), false, "10 days old: fresh");
  const stale = { generated_at: new Date(now - 31 * DAY).toISOString() };
  assert.equal(needsRefresh(stale, { now }), true, "31 days old: stale");
  const boundary = { generated_at: new Date(now - 30 * DAY).toISOString() };
  assert.equal(needsRefresh(boundary, { now }), false, "exactly 30 days: still fresh (strictly greater-than)");
  assert.equal(needsRefresh(fresh, { now, force: true }), true, "force always rebuilds");
});

// ─── buildMachineProfile / buildProjectProfile: now injection ───────────

test("buildMachineProfile / buildProjectProfile: generated_at comes from the injected now, not the real clock", () => {
  const now = Date.parse("2020-01-01T00:00:00.000Z");
  const home = tmpRoot("waypost-disc-now-home-");
  const mp = buildMachineProfile([], { platform: "darwin", env: { PATH: "" }, home, host: "h", now });
  assert.equal(mp.generated_at, new Date(now).toISOString());
  const root = tmpRoot("waypost-disc-now-proj-");
  const pp = buildProjectProfile([], { projectRoot: root, host: "h", now });
  assert.equal(pp.generated_at, new Date(now).toISOString());
});

// ─── buildMachineProfile: an undetected entry still reports its caches ───
//
// `tools` requires detection (detect.bins found on PATH); `caches` does not
// — a cache-path convention is worth reporting via env/default even for a
// tool this machine cannot find a binary for (an IDE, an SDK reached only
// through its own app, a "system"-shaped entry with no bins at all). Only
// ASKING stays gated on detection: an undetected entry's own `ask` (if it
// even has one) is never run, since `bins` is built only from detected
// entries — see the regression test below.

test("buildMachineProfile: an entry with no detect.bins at all still reports its cache, with source env/default, and is absent from tools", () => {
  const home = tmpRoot("waypost-disc-home6-");
  const entries = [{
    id: "nobins", name: "No Bins", os: ["darwin"],
    detect: { bins: [], manifests: [] },
    artifacts: [], skip: [],
    caches: [{
      path: "$HOME/nobins-cache", os: ["darwin"], confidence: { darwin: "verified" },
      docs: "https://example.com", regenerable: true, clean: "x",
    }],
    locators: [],
  }];
  const profile = buildMachineProfile(entries, { platform: "darwin", env: { PATH: "" }, home, host: "h" });
  assert.deepEqual(profile.tools, []);
  const cache = profile.caches.find((c) => c.tool === "nobins");
  assert.ok(cache, JSON.stringify(profile.caches));
  assert.equal(cache.path, join(home, "nobins-cache"));
  assert.equal(cache.source, "default");
});

test("buildMachineProfile: an entry whose detect.bins are declared but none is found on PATH still reports its cache, and its own ask is never attempted (bins is built only from detected entries)", () => {
  const bin = tmpRoot("waypost-disc-bin7-");
  const home = tmpRoot("waypost-disc-home7-");
  // "toolnotonpath" is never written to `bin` — findOnPath must fail for it.
  const entries = [fakeEntry("notonpath", {
    detectBin: "toolnotonpath", askArgv: ["toolnotonpath", "cache", "dir"],
    path: "$HOME/notonpath-cache", os: ["darwin"],
  })];
  const profile = buildMachineProfile(entries, { platform: "darwin", env: { PATH: bin }, home, host: "h" });
  assert.deepEqual(profile.tools, [], "not detected: its own bin is nowhere on PATH");
  const cache = profile.caches.find((c) => c.tool === "notonpath");
  assert.ok(cache, JSON.stringify(profile.caches));
  assert.equal(cache.path, join(home, "notonpath-cache"));
  assert.equal(cache.source, "default", "never asked — an undetected entry's ask command is never looked up");
  assert.equal("ask_note" in cache, false, "no note either: the ask was never attempted, not attempted-and-failed");
});

// ─── buildMachineProfile: asking ─────────────────────────────────────────

test("buildMachineProfile: a fake tool that reports a moved cache is asked, and the path carries source 'asked'", () => {
  const bin = tmpRoot("waypost-disc-bin-");
  const moved = tmpRoot("waypost-disc-moved-cache-");
  fakeTool(bin, "faketool", `#!/bin/sh\necho "${moved}"\n`);
  const home = tmpRoot("waypost-disc-home-");
  const entries = [fakeEntry("fake", { detectBin: "faketool", askArgv: ["faketool", "cache", "dir"], os: ["darwin"] })];
  const profile = buildMachineProfile(entries, { platform: "darwin", env: { PATH: bin }, home, host: "h1" });
  assert.deepEqual(profile.tools, [{ id: "fake", name: "fake", bin: join(bin, "faketool") }]);
  const cache = profile.caches.find((c) => c.tool === "fake");
  assert.ok(cache, JSON.stringify(profile.caches));
  assert.equal(cache.path, moved);
  assert.equal(cache.source, "asked");
  assert.equal("ask_note" in cache, false, "a successful ask carries no ask_note");
});

test("buildMachineProfile: when the ask's own binary is not found (though the tool itself is detected), the cache falls back to env, then default, each with its own source", () => {
  const bin = tmpRoot("waypost-disc-bin2-");
  fakeTool(bin, "faketool-detect", "#!/bin/sh\necho detected\n"); // present: makes the entry detected
  // "faketool-ask-missing" (the ask's own argv[0]) is deliberately absent.
  const home = tmpRoot("waypost-disc-home2-");
  const entries = [fakeEntry("fake3", {
    detectBin: "faketool-detect", askArgv: ["faketool-ask-missing", "cache", "dir"],
    path: "$XDG_CACHE_HOME/fake3", os: ["linux"],
  })];

  const withEnv = buildMachineProfile(entries, { platform: "linux", env: { PATH: bin, XDG_CACHE_HOME: join(home, "xdgcache") }, home, host: "h" });
  const cacheEnv = withEnv.caches.find((c) => c.tool === "fake3");
  assert.equal(cacheEnv.source, "env");
  assert.equal(cacheEnv.path, join(home, "xdgcache", "fake3"));

  const withoutEnv = buildMachineProfile(entries, { platform: "linux", env: { PATH: bin }, home, host: "h" });
  const cacheDefault = withoutEnv.caches.find((c) => c.tool === "fake3");
  assert.equal(cacheDefault.source, "default");
  assert.equal(cacheDefault.path, join(home, ".cache", "fake3"));
});

test("buildMachineProfile: a fake tool that hangs is reported with a note, and discovery continues within its timeout", () => {
  const bin = tmpRoot("waypost-disc-bin3-");
  // A builtin-only busy loop, not `sleep`: the ask's own env is deliberately
  // restricted to this one fake-tool PATH entry (no /bin, no /usr/bin), so
  // an external `sleep` binary is never found there — under that PATH, `sh`
  // reports "command not found" and falls straight through to `echo`,
  // returning almost instantly instead of hanging (found the hard way: a
  // flake under a loaded `npm test` run, passing this "hang" in ~5ms with a
  // real answer). `:` and `while`/`do`/`done` are shell grammar/builtins, so
  // this loops forever regardless of PATH, and is genuinely killed by the
  // timeout below.
  fakeTool(bin, "faketool-hang", "#!/bin/sh\nwhile :; do :; done\necho /should/not/appear\n");
  const home = tmpRoot("waypost-disc-home3-");
  const entries = [fakeEntry("fakehang", { detectBin: "faketool-hang", askArgv: ["faketool-hang", "cache", "dir"], os: ["darwin"] })];
  const started = Date.now();
  const profile = buildMachineProfile(entries, { platform: "darwin", env: { PATH: bin }, home, host: "h", timeoutMs: 250 });
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 2500, `expected the hang to be cut short by timeoutMs, took ${elapsed}ms`);
  const cache = profile.caches.find((c) => c.tool === "fakehang");
  assert.equal(cache.source, "default");
  assert.match(cache.ask_note, /timed out/);
});

test("buildMachineProfile: a fake tool that fails (non-zero exit) is reported with a note, discovery continues", () => {
  const bin = tmpRoot("waypost-disc-bin4-");
  fakeTool(bin, "faketool-fail", "#!/bin/sh\nexit 3\n");
  const home = tmpRoot("waypost-disc-home4-");
  const entries = [fakeEntry("fakefail", { detectBin: "faketool-fail", askArgv: ["faketool-fail", "cache", "dir"], os: ["darwin"] })];
  const profile = buildMachineProfile(entries, { platform: "darwin", env: { PATH: bin }, home, host: "h" });
  const cache = profile.caches.find((c) => c.tool === "fakefail");
  assert.equal(cache.source, "default");
  assert.match(cache.ask_note, /exit 3/);
});

test("buildMachineProfile: an asked value that is not an absolute path is ignored, falling back to env/default with a note", () => {
  const bin = tmpRoot("waypost-disc-bin5-");
  fakeTool(bin, "faketool-rel", "#!/bin/sh\necho relative/cache/path\n");
  const home = tmpRoot("waypost-disc-home5-");
  const entries = [fakeEntry("fakerel", { detectBin: "faketool-rel", askArgv: ["faketool-rel", "cache", "dir"], os: ["darwin"] })];
  const profile = buildMachineProfile(entries, { platform: "darwin", env: { PATH: bin }, home, host: "h" });
  const cache = profile.caches.find((c) => c.tool === "fakerel");
  assert.equal(cache.source, "default");
  assert.equal(cache.path, join(home, ".cache", "fakerel"));
  assert.match(cache.ask_note, /not an absolute path/);
});

// ─── win32: PATHEXT detection + batch-shim ask skipped ──────────────────

test("buildMachineProfile (win32): the tool is found through PATHEXT, and a .cmd shim's ask is skipped with a note rather than run", () => {
  const bin = tmpRoot("waypost-disc-winbin-");
  // Content is never executed on any platform this suite runs on — the
  // batch-shim guard refuses before askCache ever spawns anything.
  writeFileSync(join(bin, "faketool.CMD"), "@echo off\r\necho C:\\WRONG\\PATH\r\n", "utf8");
  const home = tmpRoot("waypost-disc-winhome-");
  const localAppData = join(home, "AppData", "Local");
  const entries = [fakeEntry("fakewin", {
    detectBin: "faketool", askArgv: ["faketool", "cache", "dir"],
    path: "$LOCALAPPDATA/fakewin", os: ["win32"],
  })];
  const profile = buildMachineProfile(entries, {
    platform: "win32", env: { PATH: bin, PATHEXT: ".COM;.EXE;.BAT;.CMD", LOCALAPPDATA: localAppData }, home, host: "h",
  });
  assert.equal(profile.tools[0].bin, join(bin, "faketool.CMD"));
  const cache = profile.caches.find((c) => c.tool === "fakewin");
  assert.equal(cache.source, "env", "the $LOCALAPPDATA token itself came from the environment");
  assert.equal(cache.path, `${localAppData}/fakewin`);
  assert.match(cache.ask_note, /batch shim skipped/);
});

// ─── sanity ───────────────────────────────────────────────────────────────

test("hostSlug is re-exported from presence.mjs — one host key, one place", () => {
  assert.equal(typeof hostSlug, "function");
  assert.equal(typeof hostSlug(), "string");
});

test("node --check passes on scripts/discovery.mjs", async () => {
  const { spawnSync } = await import("node:child_process");
  const { dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
  const r = spawnSync(process.execPath, ["--check", join(REPO, "scripts", "discovery.mjs")], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});
