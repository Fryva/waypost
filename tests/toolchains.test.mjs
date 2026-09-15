// waypost — tests for scripts/toolchains.mjs and the shipped toolchains/*.json
// registry (WP-17, the registry story and the discovery story). Loader +
// schema, and the loaded registry never executes anything a project's own
// entry names — the askCache/resolveCachePaths section below is the one
// exception, and it only ever runs a throwaway shell script this suite
// wrote itself on a temp PATH, exactly the way tests/discovery.test.mjs does.
//   node --test tests/toolchains.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, readdirSync, rmSync, realpathSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { loadRegistry, registryDirs, applicableLocators, askCache, resolveCachePaths } from "../scripts/toolchains.mjs";
import { scanProject } from "../scripts/sizes.mjs";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const OS_VALUES = ["darwin", "linux", "win32"];

const ROOTS = [];
function tmpRoot(prefix) {
  const p = mkdtempSync(join(tmpdir(), prefix));
  ROOTS.push(p);
  return p;
}
process.on("exit", () => { for (const p of ROOTS) { try { rmSync(p, { recursive: true, force: true }); } catch { /* best effort */ } } });

function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout;
}

function projectWithToolchain(fileName, contents) {
  const root = tmpRoot("waypost-toolchains-project-");
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  mkdirSync(join(root, ".waypost", "toolchains"), { recursive: true });
  writeFileSync(join(root, ".waypost", "toolchains", fileName), typeof contents === "string" ? contents : JSON.stringify(contents), "utf8");
  return root;
}

// A project with no .waypost/toolchains/ at all — loadRegistry then returns
// exactly the shipped entries, unmerged, which is what the schema tests
// below exercise through the same public loader every caller uses.
function shippedOnly() {
  return loadRegistry({ projectRoot: tmpRoot("waypost-toolchains-noproj-") }).entries;
}

// ─── schema: every shipped toolchains/<id>.json ─────────────────────────

test("toolchains/<id>.json: id equals the filename", () => {
  const [shippedDir] = registryDirs(REPO);
  const files = readdirSync(shippedDir).filter((n) => n.endsWith(".json"));
  assert.ok(files.length > 30, "the whole ported registry should be here");
  const entries = shippedOnly();
  for (const f of files) {
    const id = f.replace(/\.json$/, "");
    const e = entries.find((x) => x.id === id);
    assert.ok(e, `${f}: no loaded entry with id ${JSON.stringify(id)}`);
  }
  assert.equal(entries.length, files.length);
});

test("toolchains/<id>.json: os is a non-empty subset of darwin/linux/win32, covering every cache's and every locator's own os", () => {
  for (const e of shippedOnly()) {
    assert.ok(Array.isArray(e.os) && e.os.length > 0, `${e.id}: os must be a non-empty array — the OSes this tool runs on`);
    for (const o of e.os) assert.ok(OS_VALUES.includes(o), `${e.id}: os value ${JSON.stringify(o)} is not valid`);
    for (const c of e.caches || []) {
      for (const o of c.os) assert.ok(e.os.includes(o), `${e.id}: cache ${c.path} lists os ${o}, missing from the entry's own os ${JSON.stringify(e.os)}`);
    }
    for (const l of e.locators || []) {
      for (const o of l.os) assert.ok(e.os.includes(o), `${e.id}: locator ${l.name} lists os ${o}, missing from the entry's own os ${JSON.stringify(e.os)}`);
    }
  }
});

test("toolchains/<id>.json: every cache item's confidence has exactly one key per OS in its own os list", () => {
  for (const e of shippedOnly()) {
    for (const c of e.caches || []) {
      const confKeys = Object.keys(c.confidence || {}).sort();
      const os = [...c.os].sort();
      assert.deepEqual(confKeys, os, `${e.id} ${c.path}: confidence keys ${JSON.stringify(confKeys)} != os ${JSON.stringify(os)}`);
      for (const level of Object.values(c.confidence)) {
        assert.ok(["verified", "documented", "inferred"].includes(level), `${e.id} ${c.path}: bad confidence level ${level}`);
      }
    }
  }
});

test("toolchains/<id>.json: a cache with a 'documented' OS carries docs (a URL), a cache with an 'inferred' OS carries notes", () => {
  for (const e of shippedOnly()) {
    for (const c of e.caches || []) {
      const levels = Object.values(c.confidence || {});
      if (levels.includes("documented")) {
        assert.match(c.docs || "", /^https:\/\//, `${e.id} ${c.path}: documented needs a docs URL, got ${JSON.stringify(c.docs)}`);
      }
      if (levels.includes("inferred")) {
        assert.ok(typeof c.notes === "string" && c.notes.length > 0, `${e.id} ${c.path}: inferred needs notes`);
      }
    }
  }
});

test("toolchains/<id>.json: regenerable is a boolean on every artifact and every cache", () => {
  for (const e of shippedOnly()) {
    for (const a of e.artifacts || []) {
      assert.equal(typeof a.regenerable, "boolean", `${e.id} artifact ${JSON.stringify(a.name || a.prefix || a.pattern)}: regenerable missing or not boolean`);
      assert.ok(["sure", "generic"].includes(a.match), `${e.id} artifact: match must be sure or generic, got ${a.match}`);
      assert.ok(typeof a.clean === "string" && a.clean.length > 0, `${e.id} artifact: clean text missing`);
    }
    for (const c of e.caches || []) {
      assert.equal(typeof c.regenerable, "boolean", `${e.id} cache ${c.path}: regenerable missing or not boolean`);
    }
  }
});

test("toolchains/<id>.json: no docs URL is invented — every docs value is a plain https URL", () => {
  for (const e of shippedOnly()) {
    for (const c of e.caches || []) {
      if (c.docs != null) assert.match(c.docs, /^https:\/\/\S+$/, `${e.id} ${c.path}: docs is not a bare URL`);
    }
  }
});

test("toolchains/<id>.json: every shipped ask is a well-formed argv+parse, with docs and, for json/kv, a key (WP-17, the discovery story)", () => {
  for (const e of shippedOnly()) {
    for (const c of e.caches || []) {
      if (!("ask" in c)) continue;
      const a = c.ask;
      const where = `${e.id} ${c.path} ask`;
      assert.ok(Array.isArray(a.argv) && a.argv.length > 0, `${where}: argv must be a non-empty array`);
      for (const tok of a.argv) assert.equal(typeof tok, "string", `${where}: argv entries must be strings, got ${JSON.stringify(a.argv)}`);
      assert.ok(["line", "json", "kv"].includes(a.parse), `${where}: parse must be line/json/kv, got ${JSON.stringify(a.parse)}`);
      if (a.parse === "json" || a.parse === "kv") {
        assert.equal(typeof a.key, "string", `${where}: parse ${a.parse} needs a string key`);
        assert.ok(a.key.length > 0, `${where}: key must not be empty`);
      }
      if ("env" in a) {
        assert.ok(a.env && typeof a.env === "object" && !Array.isArray(a.env), `${where}: env must be an object`);
        for (const [k, v] of Object.entries(a.env)) {
          assert.equal(typeof k, "string", `${where}: env key must be a string`);
          assert.equal(typeof v, "string", `${where}: env.${k} must be a string, got ${JSON.stringify(v)}`);
        }
      }
      assert.match(a.docs || "", /^https:\/\/\S+$/, `${where}: docs must be a bare https URL, got ${JSON.stringify(a.docs)}`);
    }
  }
});

// ─── the project-entry allowlist ─────────────────────────────────────────

test("a project toolchain entry: disallowed fields are dropped and reported, valid artifacts survive", () => {
  const root = projectWithToolchain("myapp.json", {
    id: "myapp", name: "My App", detect: { bins: ["evil"], manifests: ["myapp.toml"] },
    artifacts: [{ name: "buildout", match: "sure", regenerable: true, clean: "rm buildout" }],
    caches: [{ path: "$HOME/.myapp", os: ["darwin"], confidence: { darwin: "verified" }, regenerable: true, clean: "x" }],
    skip: ["vendor"], locators: [{ name: "made-up", os: ["darwin"], collect: [".x"] }],
    ask: { argv: ["myapp", "cache-dir"] }, clean_argv: ["myapp", "clean"], processes: ["myapp"],
    detectors: ["stale-myapp"],
  });
  const { entries, notes } = loadRegistry({ projectRoot: root });
  const e = entries.find((x) => x.id === "myapp");
  assert.ok(e, "the new project-only entry is added");
  assert.deepEqual(e.artifacts.map((a) => a.name), ["buildout"]);
  assert.deepEqual(e.detect.manifests, ["myapp.toml"]);
  assert.deepEqual(e.detect.bins, [], "detect.bins never comes from a project entry");
  assert.deepEqual(e.caches, [], "a project entry carries no machine caches");
  assert.deepEqual(e.skip, [], "a project entry carries no skip list");
  assert.deepEqual(e.locators, [], "a project entry carries no locators");

  const file = join(".waypost", "toolchains", "myapp.json");
  const droppedFields = notes.filter((n) => n.file === file).map((n) => n.field);
  for (const f of ["detect.bins", "caches", "skip", "locators", "ask", "clean_argv", "processes", "detectors"]) {
    assert.ok(droppedFields.includes(f), `expected a note dropping ${f}, got ${JSON.stringify(droppedFields)}`);
  }
});

test("a project toolchain entry: an artifact name with a slash, or '..', is refused and reported", () => {
  const root = projectWithToolchain("bad.json", {
    id: "bad", name: "Bad",
    artifacts: [
      { name: "../escape", match: "sure", regenerable: true, clean: "x" },
      { name: "sub/dir", match: "sure", regenerable: true, clean: "x" },
      { prefix: "../nope-", match: "sure", regenerable: true, clean: "x" },
      { name: "ok-artifact", match: "sure", regenerable: true, clean: "x" },
    ],
  });
  const { entries, notes } = loadRegistry({ projectRoot: root });
  const e = entries.find((x) => x.id === "bad");
  assert.deepEqual(e.artifacts.map((a) => a.name || a.prefix), ["ok-artifact"], "only the valid artifact survives");
  const file = join(".waypost", "toolchains", "bad.json");
  const reasons = notes.filter((n) => n.file === file);
  assert.ok(reasons.some((n) => n.field === "artifacts[0].name"), JSON.stringify(reasons));
  assert.ok(reasons.some((n) => n.field === "artifacts[1].name"), JSON.stringify(reasons));
  assert.ok(reasons.some((n) => n.field === "artifacts[2].prefix"), JSON.stringify(reasons));
});

test("a project toolchain entry: a pattern is always dropped, even one that compiles — patterns come only from the shipped registry", () => {
  const root = projectWithToolchain("patterned.json", {
    id: "patterned", name: "Patterned",
    artifacts: [
      { pattern: "^\\.?derived[-_]?data", flags: "i", match: "generic", regenerable: true, clean: "x" },
      { name: "ok-artifact", match: "sure", regenerable: true, clean: "x" },
    ],
  });
  const { entries, notes } = loadRegistry({ projectRoot: root });
  const e = entries.find((x) => x.id === "patterned");
  assert.deepEqual(e.artifacts.map((a) => a.name), ["ok-artifact"], "the pattern-only artifact does not survive — it has nothing left once the pattern is dropped");
  const file = join(".waypost", "toolchains", "patterned.json");
  const reasons = notes.filter((n) => n.file === file);
  assert.ok(reasons.some((n) => n.field === "artifacts[0].pattern" && /patterns come only from the shipped registry/.test(n.reason)), JSON.stringify(reasons));
});

test("a project toolchain entry: an artifact's clean_argv and path are dropped and reported, not carried into the registry", () => {
  const root = projectWithToolchain("sneaky.json", {
    id: "sneaky", name: "Sneaky",
    artifacts: [{
      name: "output", match: "sure", regenerable: true, clean: "x",
      clean_argv: ["rm", "-rf", "/"], path: "/etc/passwd",
    }],
  });
  const { entries, notes } = loadRegistry({ projectRoot: root });
  const e = entries.find((x) => x.id === "sneaky");
  const a = e.artifacts.find((x) => x.name === "output");
  assert.ok(a, "the artifact itself survives — only the unrecognized keys are stripped");
  assert.ok(!("clean_argv" in a) && !("path" in a), JSON.stringify(a));
  const file = join(".waypost", "toolchains", "sneaky.json");
  const reasons = notes.filter((n) => n.file === file);
  assert.ok(reasons.some((n) => n.field === "artifacts[0].clean_argv"), JSON.stringify(reasons));
  assert.ok(reasons.some((n) => n.field === "artifacts[0].path"), JSON.stringify(reasons));
});

test("a project toolchain entry: an artifact with no regenerable, or an invalid match, is handled safely", () => {
  const root = projectWithToolchain("halfbaked.json", {
    id: "halfbaked", name: "Half-baked",
    artifacts: [
      { name: "noregen", match: "sure", clean: "x" },
      { name: "badmatch", match: "maybe", regenerable: true, clean: "x" },
    ],
  });
  const { entries, notes } = loadRegistry({ projectRoot: root });
  const e = entries.find((x) => x.id === "halfbaked");
  const noregen = e.artifacts.find((x) => x.name === "noregen");
  assert.ok(noregen, "an artifact with no regenerable field still survives");
  assert.equal(noregen.regenerable, false, "a missing regenerable defaults to the safe value, false");
  assert.ok(!e.artifacts.some((x) => x.name === "badmatch"), "an invalid match value drops the whole artifact");
  const file = join(".waypost", "toolchains", "halfbaked.json");
  assert.ok(notes.some((n) => n.file === file && n.field === "artifacts[1].match"), JSON.stringify(notes));
});

test("a project toolchain entry: a manifest outside the project is refused, and an infinite stale_days is omitted", () => {
  // Raw JSON text: 1e999 parses to Infinity, which JSON.stringify could not write.
  const root = projectWithToolchain("paths.json",
    '{"id":"paths","detect":{"manifests":["ok.toml","../../etc/passwd","sub/Cargo.toml"]},'
    + '"artifacts":[{"name":"inf","match":"sure","regenerable":true,"stale_days":1e999}]}');
  const { entries, notes } = loadRegistry({ projectRoot: root });
  const e = entries.find((x) => x.id === "paths");
  assert.deepEqual(e.detect.manifests, ["ok.toml"]);
  const file = join(".waypost", "toolchains", "paths.json");
  for (const f of ["detect.manifests[1]", "detect.manifests[2]"]) {
    assert.ok(notes.some((n) => n.file === file && n.field === f), `expected a note for ${f}: ${JSON.stringify(notes)}`);
  }
  assert.equal("stale_days" in e.artifacts[0], false, "a non-finite stale_days is omitted");
});

test("applicableLocators: the shipped darwin-only locator is offered on darwin and never on linux or win32", () => {
  const entries = shippedOnly();
  assert.ok(applicableLocators(entries, "darwin").some((l) => l.name === "xcode-derived-data"));
  for (const p of ["linux", "win32"]) assert.deepEqual(applicableLocators(entries, p), [], p);
});

test("a project toolchain entry with a shipped id EXTENDS that entry's artifacts, leaving its caches untouched", () => {
  const root = projectWithToolchain("swiftpm.json", {
    id: "swiftpm", name: "Swift Package Manager (project override, ignored)",
    artifacts: [{ name: "MyCustomBuildDir", match: "sure", regenerable: true, clean: "rm -rf MyCustomBuildDir" }],
  });
  const shipped = shippedOnly().find((e) => e.id === "swiftpm");
  const { entries } = loadRegistry({ projectRoot: root });
  const merged = entries.find((e) => e.id === "swiftpm");
  assert.equal(merged.artifacts.length, shipped.artifacts.length + 1);
  assert.ok(merged.artifacts.some((a) => a.name === ".build"), "the shipped artifact is kept");
  assert.ok(merged.artifacts.some((a) => a.name === "MyCustomBuildDir"), "the project's own artifact is added");
  assert.deepEqual(merged.caches, shipped.caches, "machine caches come only from the shipped registry");
});

test("invalid JSON in a project toolchain file produces a note, never a crash", () => {
  const root = projectWithToolchain("broken.json", "{ not json");
  const { entries, notes } = loadRegistry({ projectRoot: root });
  assert.ok(entries.length > 30, "the shipped registry still loads");
  const file = join(".waypost", "toolchains", "broken.json");
  const note = notes.find((n) => n.file === file);
  assert.ok(note && /invalid JSON/.test(note.reason), JSON.stringify(notes));
});

test("a project toolchain entry with no id is dropped with a note, not a crash", () => {
  const root = projectWithToolchain("noid.json", { name: "No id here" });
  const { entries, notes } = loadRegistry({ projectRoot: root });
  assert.ok(entries.length > 30);
  const file = join(".waypost", "toolchains", "noid.json");
  assert.ok(notes.some((n) => n.file === file && n.field === "id"), JSON.stringify(notes));
});

// ─── a project artifact the scan then counts ─────────────────────────────

test("scanProject: a project's own toolchain artifact is found and counted, sure match, no git-ignore needed", () => {
  const root = projectWithToolchain("myproj.json", {
    id: "myproj", name: "My Project's Own Build Output",
    artifacts: [{ name: "myoutput", match: "sure", regenerable: true, clean: "rm -rf myoutput" }],
  });
  mkdirSync(join(root, "myoutput"), { recursive: true });
  writeFileSync(join(root, "myoutput", "artifact.bin"), Buffer.alloc(1000, 1));
  git(root, ["add", ".waypost"]);
  git(root, ["commit", "-q", "-m", "init"]);

  const out = scanProject(root);
  assert.ok(out.dirs.some((d) => d.path === "myoutput"), JSON.stringify(out.dirs));
});

test("scanProject: a project's own toolchain artifact with match:generic still needs git-ignore, like any other generic name", () => {
  const root = projectWithToolchain("myproj2.json", {
    id: "myproj2", name: "My Project (generic-match artifact)",
    artifacts: [{ name: "maybeoutput", match: "generic", regenerable: true, clean: "rm -rf maybeoutput" }],
  });
  writeFileSync(join(root, ".gitignore"), "/maybeoutput\n", "utf8");
  mkdirSync(join(root, "maybeoutput"), { recursive: true });
  writeFileSync(join(root, "maybeoutput", "artifact.bin"), Buffer.alloc(1000, 1));
  git(root, ["add", ".gitignore", ".waypost"]);
  git(root, ["commit", "-q", "-m", "init"]);

  const out = scanProject(root);
  assert.ok(out.dirs.some((d) => d.path === "maybeoutput"), JSON.stringify(out.dirs));
});

// ─── askCache / resolveCachePaths: parse kinds and dedup ranking ────────

function fakeTool(dir, name, script) {
  const p = join(dir, name);
  writeFileSync(p, script, "utf8");
  chmodSync(p, 0o755);
  return p;
}

test("askCache: parse 'json' reads a string key, and a 'kv' key's text after it on the matching line", () => {
  const bin = tmpRoot("waypost-toolchains-askbin-");
  const jsonTool = fakeTool(bin, "jsontool", '#!/bin/sh\necho \'{"cacheDir": "/abs/from/json"}\'\n');
  const jr = askCache({ argv: ["jsontool"], parse: "json", key: "cacheDir" }, { bin: jsonTool, home: bin, platform: "darwin" });
  assert.deepEqual(jr, { ok: true, value: ["/abs/from/json"] });

  const kvTool = fakeTool(bin, "kvtool", '#!/bin/sh\necho "info : global-packages: /abs/from/kv"\n');
  const kr = askCache({ argv: ["kvtool"], parse: "kv", key: "global-packages:" }, { bin: kvTool, home: bin, platform: "darwin" });
  assert.deepEqual(kr, { ok: true, value: ["/abs/from/kv"] });
});

test("askCache: parse 'json' with an array key (conda's pkgs_dirs shape) keeps every absolute string entry as its own value", () => {
  const bin = tmpRoot("waypost-toolchains-askbin2-");
  const tool = fakeTool(bin, "condatool", '#!/bin/sh\necho \'{"pkgs_dirs": ["/abs/one", "/abs/two", "relative/three"]}\'\n');
  const r = askCache({ argv: ["condatool"], parse: "json", key: "pkgs_dirs" }, { bin: tool, home: bin, platform: "darwin" });
  // The absolute-path filter applies to every value regardless of parse
  // kind, so the one relative entry in the array is dropped here too.
  assert.deepEqual(r, { ok: true, value: ["/abs/one", "/abs/two"] });
});

test("askCache: a non-zero exit, unparseable JSON, and a missing kv line are all reported, never thrown", () => {
  const bin = tmpRoot("waypost-toolchains-askbin3-");
  const failTool = fakeTool(bin, "failtool", "#!/bin/sh\nexit 2\n");
  assert.equal(askCache({ argv: ["failtool"], parse: "line" }, { bin: failTool, home: bin, platform: "darwin" }).ok, false);

  const badJsonTool = fakeTool(bin, "badjsontool", "#!/bin/sh\necho 'not json'\n");
  const badJson = askCache({ argv: ["badjsontool"], parse: "json", key: "x" }, { bin: badJsonTool, home: bin, platform: "darwin" });
  assert.equal(badJson.ok, false);
  assert.match(badJson.note, /could not parse/);

  const noKvTool = fakeTool(bin, "nokvtool", "#!/bin/sh\necho 'nothing relevant here'\n");
  const noKv = askCache({ argv: ["nokvtool"], parse: "kv", key: "global-packages:" }, { bin: noKvTool, home: bin, platform: "darwin" });
  assert.equal(noKv.ok, false);
});

test("askCache: a .cmd/.bat batch shim is refused on win32 before ever spawning it", () => {
  const bin = tmpRoot("waypost-toolchains-askbin4-");
  // Content is never run — the guard returns before spawnSync.
  const shim = join(bin, "shim.cmd");
  writeFileSync(shim, "@echo off\r\necho should-never-run\r\n", "utf8");
  const r = askCache({ argv: ["shim"], parse: "line" }, { bin: shim, home: bin, platform: "win32" });
  assert.deepEqual(r, { ok: false, note: "batch shim skipped" });
});

// Item 1 (independent review): askCache's own defense-in-depth check — the
// normal call path (scripts/discovery.mjs's findOnPath) never hands it a
// relative `bin` any more (a relative PATH entry is skipped there), but
// askCache is the one place that ever spawns it, with cwd=home, so a
// relative `bin` here would silently run whatever that name resolves to
// under home — never the file discovery actually found.
test("askCache: a relative bin is refused before ever spawning it", () => {
  const bin = tmpRoot("waypost-toolchains-relbin-");
  const tool = join(bin, "faketool");
  writeFileSync(tool, "#!/bin/sh\necho /should/never/run\n", { mode: 0o755 });
  const r = askCache({ argv: ["faketool"], parse: "line" }, { bin: "faketool", home: bin, platform: "darwin" });
  assert.deepEqual(r, { ok: false, note: "bin is not an absolute path" });
});

// Item 7 (independent review): askCache normalizes what it gets back — a
// tool's own trailing separator (dotnet's `dotnet nuget locals … --list`
// really does print "…/packages/", trailing slash included) must not stop
// the SAME directory reported two ways from deduplicating.
test("askCache: a trailing separator is stripped so two spellings of the same path dedupe", () => {
  const bin = tmpRoot("waypost-toolchains-normbin-");
  const tool = fakeTool(bin, "trailingslash", "#!/bin/sh\necho /home/x/.nuget/packages/\n");
  const r = askCache({ argv: ["trailingslash"], parse: "line" }, { bin: tool, home: bin, platform: "darwin" });
  assert.deepEqual(r, { ok: true, value: ["/home/x/.nuget/packages"] });
});

test("resolveCachePaths: an asked path with a trailing separator dedupes against the SAME item's own env/default template with none", () => {
  const bin = tmpRoot("waypost-toolchains-normbin2-");
  const home = tmpRoot("waypost-toolchains-normhome2-");
  const tool = fakeTool(bin, "trailingslash2", `#!/bin/sh\necho "${join(home, ".nuget", "packages")}/"\n`);
  const entries = [{
    id: "dotnetlike", caches: [{
      path: "$HOME/.nuget/packages", os: ["linux"], regenerable: true, clean: "x",
      ask: { argv: ["trailingslash2"], parse: "line" },
    }],
  }];
  const out = resolveCachePaths(entries, { home, env: {}, platform: "linux", ask: true, bins: { trailingslash2: tool } });
  assert.equal(out.length, 1, `expected exactly one deduped entry, got ${JSON.stringify(out)}`);
  assert.equal(out[0].path, join(home, ".nuget", "packages"));
  assert.equal(out[0].source, "asked");
});

// Item 8 (independent review — tests for the criteria themselves, not just
// the mechanics): no shell means an argv token is passed through to the
// spawned tool literally, never expanded — spawnSync's own shell:false
// already guarantees this; this proves it end to end through askCache with
// a token containing real shell metacharacters.
test("askCache: no shell — an argv token containing shell metacharacters like $(...) arrives at the fake tool literally, never expanded", () => {
  const bin = tmpRoot("waypost-toolchains-noshell-");
  const marker = join(bin, "marker.txt");
  const tool = fakeTool(bin, "noshelltool", `#!/bin/sh\nprintf '%s' "$1" > "${marker}"\necho /abs/path\n`);
  const literalToken = "$(echo shell-would-expand-this)";
  const r = askCache({ argv: ["noshelltool", literalToken], parse: "line" }, { bin: tool, home: bin, platform: "darwin" });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(readFileSync(marker, "utf8"), literalToken, "the token must arrive exactly as written, never shell-expanded");
});

// cwd=home: the fake tool prints its own working directory (a shell
// builtin, `pwd` — no external binary, per the sleep-flake lesson above).
// realpathSync on both sides absorbs a symlinked tmpdir (macOS's /tmp ->
// /private/tmp) without which this could spuriously fail on some hosts.
test("askCache: the ask runs with cwd = home, not the caller's own cwd", () => {
  const bin = tmpRoot("waypost-toolchains-cwdbin-");
  const home = tmpRoot("waypost-toolchains-cwdhome-");
  const tool = fakeTool(bin, "pwdtool", "#!/bin/sh\npwd\n");
  const r = askCache({ argv: ["pwdtool"], parse: "line" }, { bin: tool, home, platform: "darwin" });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(realpathSync(r.value[0]), realpathSync(home));
});

// stdin closed: a fake tool that tries to `read` a line from stdin gets an
// immediate EOF (read fails at once) rather than blocking — proving stdin
// really is closed (stdio: ["ignore", …]), since an inherited, still-open
// stdin with nothing written to it would leave `read` blocked until the
// timeout, and this completes well under it.
test("askCache: stdin is closed — a fake tool that tries to read from it gets EOF at once, not a hang", () => {
  const bin = tmpRoot("waypost-toolchains-stdinbin-");
  const tool = fakeTool(bin, "readtool", "#!/bin/sh\nread x\necho /abs/answered\n");
  const started = Date.now();
  const r = askCache({ argv: ["readtool"], parse: "line" }, { bin: tool, home: bin, platform: "darwin", timeoutMs: 3000 });
  const elapsed = Date.now() - started;
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.value[0], "/abs/answered");
  assert.ok(elapsed < 2000, `expected read to fail at once on closed stdin, took ${elapsed}ms`);
});

test("resolveCachePaths: a duplicate path across cache items keeps the best-sourced one (asked > env > default)", () => {
  const bin = tmpRoot("waypost-toolchains-dedupbin-");
  const home = tmpRoot("waypost-toolchains-deduphome-");
  const askedPath = join(home, ".cache", "dup"); // matches the second entry's own DEFAULT resolution
  const tool = fakeTool(bin, "duptool", `#!/bin/sh\necho "${askedPath}"\n`);
  const entries = [
    {
      id: "dup-a", caches: [{
        path: "$XDG_CACHE_HOME/dup", os: ["linux"], regenerable: true, clean: "x",
        ask: { argv: ["duptool"], parse: "line" },
      }],
    },
    {
      id: "dup-b", caches: [{ path: "$XDG_CACHE_HOME/dup", os: ["linux"], regenerable: true, clean: "x" }],
    },
  ];
  const out = resolveCachePaths(entries, { home, env: {}, platform: "linux", ask: true, bins: { duptool: tool } });
  const hits = out.filter((c) => c.path === askedPath);
  assert.equal(hits.length, 1, "the duplicate path is deduplicated to one entry");
  assert.equal(hits[0].source, "asked", "the asked entry outranks the plain-default one sharing its path");
});

test("node --check passes on scripts/toolchains.mjs", () => {
  const r = spawnSync(process.execPath, ["--check", join(REPO, "scripts", "toolchains.mjs")], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});
