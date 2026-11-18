// waypost — doctor --memory: where Claude Code keeps Memory, its state, its size.
// Groups: A the key and the root, B the state order, C measurements, D the CLI.
// Every test runs under a temporary HOME; the real ~/.claude is never read.
import "./env.mjs";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync as fsMkdtemp, mkdirSync, writeFileSync, readFileSync, readdirSync, lstatSync,
  realpathSync, symlinkSync, existsSync, rmSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { withoutClaudeEnv } from "./env.mjs";
import { projectKey, hash32, memoryLocation, memoryState, memoryLimits, computeMemory } from "../scripts/memory.mjs";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const WAYPOST = join(REPO, "bin", "waypost");

const DIRS = [];
const tmp = (p = "wp-mem-") => { const d = realpathSync(fsMkdtemp(join(tmpdir(), p))); DIRS.push(d); return d; };
after(() => { for (const d of DIRS) rmSync(d, { recursive: true, force: true }); });

function git(cwd, ...args) {
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(cwd, "..", "no-global-config") };
  // A suite run from a git hook inherits these; they would aim the fixture at the real repository.
  for (const k of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR"]) delete env[k];
  const r = spawnSync("git", ["-c", "user.name=Fixture", "-c", "user.email=f@example.invalid", "-c", "protocol.file.allow=always", ...args], {
    cwd, encoding: "utf8", env,
  });
  assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}
const put = (file, text) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text); return file; };
const settings = (file, obj) => put(file, typeof obj === "string" ? obj : JSON.stringify(obj));

// A project directory (not a git repo) and a home, with the Memory dir computed.
function world({ name = "proj" } = {}) {
  const base = tmp();
  const home = join(base, "home");
  const project = join(base, name);
  mkdirSync(home, { recursive: true });
  mkdirSync(project, { recursive: true });
  const loc = memoryLocation(project, home);
  return { base, home, project, loc, dir: loc.dir, index: join(loc.dir, "MEMORY.md") };
}
const st = (w, env = {}, start = w.project) => memoryState({ start, home: w.home, env });

// ---------------------------------------------------------------- A: key, root

test("A: the key replaces every non-alphanumeric code unit and truncates with a hash", () => {
  assert.equal(projectKey("/Users/a/proj.v1_x y"), "-Users-a-proj-v1-x-y");
  assert.equal(projectKey("/Users/a/\u{1F600}x"), "-Users-a---x", "an emoji is two code units, two dashes");
  // 200 characters of the dashed path, "-", then the base-36 absolute hash of the path itself
  assert.equal(projectKey("/" + "a".repeat(250)), "-" + "a".repeat(199) + "-feo44x");
  assert.equal(projectKey("/" + "a".repeat(199)).length, 200, "200 characters are kept whole");
  assert.equal(hash32("ab"), 3105);
});

test("A: a linked worktree keys as the main worktree, from any subdirectory", () => {
  const base = tmp();
  const main = join(base, "main");
  mkdirSync(main);
  git(main, "init", "-q", ".");
  git(main, "commit", "-q", "--allow-empty", "-m", "i");
  git(main, "worktree", "add", "-q", join(base, "wt"), "-b", "b");
  mkdirSync(join(base, "wt", "a", "b"), { recursive: true });
  const home = join(base, "h");
  const want = projectKey(main);
  assert.equal(memoryLocation(main, home).key, want);
  assert.equal(memoryLocation(join(base, "wt"), home).key, want);
  assert.equal(memoryLocation(join(base, "wt", "a", "b"), home).key, want);
  assert.equal(memoryLocation(join(base, "wt"), home).worktree, join(base, "wt"));
});

test("A: a submodule is its own root", () => {
  const base = tmp();
  const src = join(base, "src");
  mkdirSync(src);
  git(src, "init", "-q", ".");
  git(src, "commit", "-q", "--allow-empty", "-m", "i");
  const main = join(base, "main");
  mkdirSync(main);
  git(main, "init", "-q", ".");
  git(main, "submodule", "add", "-q", src, "sub");
  assert.equal(memoryLocation(join(main, "sub"), join(base, "h")).key, projectKey(join(main, "sub")));
});

test("A: a bare repository with a worktree keys as the bare directory", () => {
  const base = tmp();
  const bare = join(base, "bare.git");
  mkdirSync(bare);
  git(bare, "init", "-q", "--bare", ".");
  git(bare, "worktree", "add", "-q", "--orphan", join(base, "bwt"));
  assert.ok(existsSync(join(base, "bwt", ".git")));
  assert.equal(memoryLocation(join(base, "bwt"), join(base, "h")).key, projectKey(bare));
});

test("A: --separate-git-dir: the repository is its own root, a worktree of it keys as the git directory", () => {
  const base = tmp();
  const sep = join(base, "sep");
  mkdirSync(sep);
  git(sep, "init", "-q", "--separate-git-dir", join(base, "sepgit"), ".");
  git(sep, "commit", "-q", "--allow-empty", "-m", "i");
  git(sep, "worktree", "add", "-q", join(base, "sepwt"), "-b", "b");
  const home = join(base, "h");
  assert.equal(memoryLocation(sep, home).key, projectKey(sep));
  assert.equal(memoryLocation(join(base, "sepwt"), home).key, projectKey(join(base, "sepgit")));
});

test("A: a symlinked path keys by its realpath", () => {
  const base = tmp();
  mkdirSync(join(base, "real.dir"));
  symlinkSync(join(base, "real.dir"), join(base, "link"));
  assert.equal(memoryLocation(join(base, "link"), join(base, "h")).key, projectKey(join(base, "real.dir")));
});

test("A: a path over 200 characters is truncated and hashed", () => {
  const base = tmp();
  const deep = join(base, "d".repeat(100), "e.f".repeat(40));
  mkdirSync(deep, { recursive: true });
  const key = memoryLocation(deep, join(base, "h")).key;
  assert.equal(key, projectKey(deep));
  assert.match(key, /^-[A-Za-z0-9-]{199}-[0-9a-z]{1,8}$/);
  assert.equal(key.slice(0, 200), deep.replace(/[^a-zA-Z0-9]/g, "-").slice(0, 200));
});

test("A: an NFD path keys as NFC and an emoji as two dashes", () => {
  const base = tmp();
  const nfd = join(base, "nfd-café");
  const emoji = join(base, "emoji-\u{1F600}-x");
  mkdirSync(nfd);
  mkdirSync(emoji);
  assert.ok(memoryLocation(nfd, join(base, "h")).key.endsWith("-nfd-caf-"), "e + U+0301 composes to one dash, not 'e-'");
  assert.ok(memoryLocation(emoji, join(base, "h")).key.endsWith("-emoji----x"));
});

// ------------------------------------------------------------- B: state order

test("B: default is absent, then exists once MEMORY.md is there", () => {
  const w = world();
  assert.equal(st(w).state, "absent");
  put(w.index, "# idx\n");
  assert.deepEqual([st(w).state, st(w).source], ["exists", "default"]);
});

test("B: DISABLE_AUTO_MEMORY in a settings env block: 1 gives off, 0 beats the other switches", () => {
  const w = world();
  const user = join(w.home, ".claude", "settings.json");
  settings(user, { env: { CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" } });
  const off = st(w);
  assert.equal(off.state, "off");
  assert.match(off.source, /^CLAUDE_CODE_DISABLE_AUTO_MEMORY in .*settings\.json$/);
  settings(user, { autoMemoryEnabled: false, env: { CLAUDE_CODE_DISABLE_AUTO_MEMORY: "0" } });
  assert.equal(st(w, { CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" }).state, "absent", "settings =0 beats autoMemoryEnabled:false and the process's =1");
});

test("B: the switch only in the process gives off; =0 there never turns Memory on", () => {
  const w = world();
  assert.deepEqual([st(w, { CLAUDE_CODE_DISABLE_AUTO_MEMORY: "true" }).state, st(w, { CLAUDE_CODE_DISABLE_AUTO_MEMORY: "true" }).source],
    ["off", "CLAUDE_CODE_DISABLE_AUTO_MEMORY in the environment"]);
  settings(join(w.home, ".claude", "settings.json"), { autoMemoryEnabled: false });
  assert.equal(st(w, { CLAUDE_CODE_DISABLE_AUTO_MEMORY: "0" }).state, "off");
  assert.match(st(w, { CLAUDE_CODE_DISABLE_AUTO_MEMORY: "0" }).source, /^autoMemoryEnabled: false in /);
});

test("B: the legacy ~/.claude.json env block counts, below the settings files", () => {
  const w = world();
  put(join(w.home, ".claude.json"), JSON.stringify({ env: { CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" } }));
  assert.equal(st(w).state, "off");
  settings(join(w.home, ".claude", "settings.json"), { env: { CLAUDE_CODE_DISABLE_AUTO_MEMORY: "0" } });
  assert.equal(st(w).state, "absent");
  put(join(w.home, ".claude.json"), "{ not json");
  assert.equal(st(w).state, "absent", "an unreadable ~/.claude.json is ignored");
});

test("B: user, project and local settings merge; the project file comes from the worktree's own root", () => {
  const base = tmp();
  const main = join(base, "main");
  mkdirSync(main);
  git(main, "init", "-q", ".");
  git(main, "commit", "-q", "--allow-empty", "-m", "i");
  git(main, "worktree", "add", "-q", join(base, "wt"), "-b", "b");
  const home = join(base, "h");
  const at = (start, env = {}) => memoryState({ start, home, env });
  assert.equal(at(main).state, "absent");
  settings(join(base, "wt", ".claude", "settings.json"), { autoMemoryEnabled: false });
  assert.equal(at(join(base, "wt")).state, "off", "the linked worktree's own project settings apply to it");
  assert.equal(at(main).state, "absent", "and not to the main worktree");
  rmSync(join(base, "wt", ".claude"), { recursive: true });
  settings(join(main, ".claude", "settings.local.json"), { autoMemoryEnabled: false });
  const local = at(join(base, "wt"));
  assert.equal(local.state, "off", "local settings are read in the canonical root");
  assert.ok(local.source.endsWith(join(main, ".claude", "settings.local.json")));
  settings(join(home, ".claude", "settings.json"), { autoMemoryEnabled: false });
  settings(join(main, ".claude", "settings.local.json"), { env: { CLAUDE_CODE_DISABLE_AUTO_MEMORY: "0" } });
  assert.equal(at(main).state, "absent", "a later file's false switch skips autoMemoryEnabled from an earlier one");
});

test("B: a settings file that is not valid JSON gives off, JSONC included", () => {
  const w = world();
  const user = join(w.home, ".claude", "settings.json");
  settings(user, '{ "autoMemoryEnabled": true, }');
  const trailing = st(w);
  assert.equal(trailing.state, "off");
  assert.equal(trailing.source, `${user} unreadable`);
  settings(user, '{ // comment\n "env": {} }');
  assert.equal(st(w).state, "off");
  settings(user, "");
  assert.equal(st(w).state, "absent", "an empty file is no settings");
  settings(user, "[]");
  assert.equal(st(w).state, "off");
});

test("B: off beats overridden; overridden alone is reported", () => {
  const w = world();
  assert.equal(st(w, { CLAUDE_COWORK_MEMORY_PATH_OVERRIDE: "/srv/mem" }).state, "overridden");
  assert.equal(st(w, { CLAUDE_COWORK_MEMORY_PATH_OVERRIDE: "/srv/mem", CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" }).state, "off");
  assert.deepEqual([st(w, { CLAUDE_CODE_REMOTE_MEMORY_DIR: "/srv/mem" }).state, st(w, { CLAUDE_CODE_REMOTE_MEMORY_DIR: "/srv/mem" }).source],
    ["overridden", "CLAUDE_CODE_REMOTE_MEMORY_DIR"]);
  assert.equal(st(w, { CLAUDE_CONFIG_DIR: join(w.base, "elsewhere") }).source, "CLAUDE_CONFIG_DIR");
  assert.equal(st(w, { CLAUDE_CONFIG_DIR: join(w.base, "elsewhere"), CLAUDE_CODE_PROJECT_DIR_NAME: "x" }).source, "CLAUDE_CONFIG_DIR");
  const user = join(w.home, ".claude", "settings.json");
  settings(user, { autoMemoryDirectory: "~/notes" });
  assert.equal(st(w).state, "overridden");
  assert.match(st(w).source, /^autoMemoryDirectory in /);
  settings(user, { autoMemoryDirectory: "/srv/notes" });
  assert.equal(st(w).state, "overridden");
});

test("B: CLAUDE_CONFIG_DIR at ~/.claude does not override, by realpath", () => {
  const w = world();
  mkdirSync(join(w.home, ".claude"), { recursive: true });
  symlinkSync(join(w.home, ".claude"), join(w.base, "alias"));
  assert.equal(st(w, { CLAUDE_CONFIG_DIR: join(w.home, ".claude") }).state, "absent");
  assert.equal(st(w, { CLAUDE_CONFIG_DIR: join(w.base, "alias") }).state, "absent");
});

test("B: invalid override values are ignored", () => {
  const w = world();
  const user = join(w.home, ".claude", "settings.json");
  for (const bad of ["rel/path", "/x", "/ok\0x", "", 5, "~/../up", "~/a/../../up", "~/"]) {
    settings(user, { autoMemoryDirectory: bad });
    assert.equal(st(w).state, "absent", `autoMemoryDirectory ${JSON.stringify(bad)}`);
  }
  rmSync(user);
  const cfg = join(w.home, ".claude");
  mkdirSync(cfg, { recursive: true });
  for (const name of ["bad name!", "con", "NUL", "x".repeat(65), ""]) {
    assert.equal(st(w, { CLAUDE_CONFIG_DIR: cfg, CLAUDE_CODE_PROJECT_DIR_NAME: name }).state, "absent", `PROJECT_DIR_NAME ${name}`);
  }
  assert.equal(st(w, { CLAUDE_CODE_PROJECT_DIR_NAME: "good-name" }).state, "absent", "without CLAUDE_CONFIG_DIR it moves nothing");
  assert.equal(st(w, { CLAUDE_CONFIG_DIR: cfg, CLAUDE_CODE_PROJECT_DIR_NAME: "good-name" }).state, "overridden");
  assert.equal(st(w, { CLAUDE_COWORK_MEMORY_PATH_OVERRIDE: "relative" }).state, "absent");
  assert.equal(st(w, { CLAUDE_COWORK_MEMORY_PATH_OVERRIDE: "~/notes" }).state, "absent", "no ~ for the Cowork override");
  assert.equal(st(w, { CLAUDE_CONFIG_DIR: cfg, CLAUDE_CODE_PROJECT_DIR_NAME: "com0" }).state, "absent");
});

test("B: override values are normalized as Claude Code does; any remote Memory dir overrides", () => {
  const w = world();
  const user = join(w.home, ".claude", "settings.json");
  for (const good of ["/srv/../notes", "~/a/../b", "~/notes"]) {
    settings(user, { autoMemoryDirectory: good });
    assert.equal(st(w).state, "overridden", `autoMemoryDirectory ${good}`);
  }
  rmSync(user);
  assert.equal(st(w, { CLAUDE_COWORK_MEMORY_PATH_OVERRIDE: "/srv/../cowork" }).state, "overridden");
  assert.equal(st(w, { CLAUDE_CODE_REMOTE_MEMORY_DIR: "relative/remote" }).source, "CLAUDE_CODE_REMOTE_MEMORY_DIR");
});

test("B: a mover in the owner's own env blocks overrides; in a project's settings env it does not", () => {
  const w = world();
  const elsewhere = join(w.base, "other-config");
  mkdirSync(elsewhere, { recursive: true });
  settings(join(w.project, ".claude", "settings.json"), { env: { CLAUDE_CONFIG_DIR: elsewhere, CLAUDE_CODE_REMOTE_MEMORY_DIR: "/r" } });
  assert.equal(st(w).state, "absent", "project settings env is filtered by Claude Code");
  settings(join(w.home, ".claude", "settings.json"), { env: { CLAUDE_CONFIG_DIR: elsewhere } });
  assert.equal(st(w).source, "CLAUDE_CONFIG_DIR");
  rmSync(join(w.home, ".claude", "settings.json"));
  settings(join(w.home, ".claude.json"), { env: { CLAUDE_CODE_REMOTE_MEMORY_DIR: "/r" } });
  assert.equal(st(w).source, "CLAUDE_CODE_REMOTE_MEMORY_DIR");
});

test("B: per-process flags are info in every state, never off; =0 prints nothing", async () => {
  const w = world();
  const flagged = (env) => computeMemory({ start: w.project, home: w.home, env });
  for (const k of ["CLAUDE_CODE_SIMPLE", "CLAUDE_CODE_SAFE_MODE", "CLAUDE_CODE_REMOTE"]) {
    const r = await flagged({ [k]: "1" });
    assert.equal(r.state, "absent", `${k}=1 is not off`);
    const f = r.findings.filter((x) => x.check === "memory-process-flag");
    assert.equal(f.length, 1);
    assert.equal(f[0].level, "info");
    assert.ok(f[0].message.startsWith(k));
    assert.equal((await flagged({ [k]: "0" })).findings.length, 0);
  }
  const off = await flagged({ CLAUDE_CODE_SIMPLE: "1", CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" });
  assert.equal(off.state, "off");
  assert.equal(off.findings.length, 1);
  const over = await flagged({ CLAUDE_CODE_SAFE_MODE: "yes", CLAUDE_COWORK_MEMORY_PATH_OVERRIDE: "/srv/m" });
  assert.deepEqual([over.state, over.dir, over.findings.length], ["overridden", null, 1]);
});

// ------------------------------------------------------------ C: measurements

const lines = (n, len = 20) => Array.from({ length: n }, (_, i) => `- line ${i} ${"x".repeat(len)}`).join("\n");
async function measure(text, extra = () => {}) {
  const w = world();
  put(w.index, text);
  extra(w);
  const r = await computeMemory({ start: w.project, home: w.home, env: {} });
  return { w, r, by: (check) => r.findings.filter((f) => f.check === check) };
}

test("C: the registry carries Claude Code's limit", async () => {
  assert.deepEqual(await memoryLimits(), { lines: 200, chars: 25000 });
});

test("C: a Cyrillic index between 25000 characters and 25000 bytes is not an issue", async () => {
  const text = Array.from({ length: 100 }, () => "я".repeat(240)).join("\n");
  assert.ok(text.length < 25000 && Buffer.byteLength(text) > 25000);
  const { r, by } = await measure(text);
  assert.equal(r.findings.some((f) => f.level === "issue"), false);
  assert.equal(by("memory-index-limit")[0].level, "warn", "over 80% of the limit, under the limit");
});

test("C: over 25000 characters or over 200 lines is an issue; the trim and the newline count are Claude Code's", async () => {
  assert.equal((await measure("x".repeat(25001))).by("memory-index-limit")[0].level, "issue");
  assert.equal((await measure("x".repeat(25000))).by("memory-index-limit")[0].level, "warn");
  assert.equal((await measure("\n\n  " + "x".repeat(25000) + "  \n\n")).by("memory-index-limit")[0].level, "warn", "trimmed before counting");
  const l = (n) => Array.from({ length: n }, () => "x").join("\n");
  assert.equal((await measure(l(201))).by("memory-index-limit")[0].level, "issue");
  assert.equal((await measure(l(200) + "\n")).by("memory-index-limit")[0].level, "warn", "200 lines plus a trailing newline is 200 lines");
});

test("C: the warning starts over 80% of the limit", async () => {
  assert.equal((await measure("x".repeat(20000))).by("memory-index-limit").length, 0);
  assert.equal((await measure("x".repeat(20001))).by("memory-index-limit")[0].level, "warn");
  const l = (n) => Array.from({ length: n }, () => "x").join("\n");
  assert.equal((await measure(l(160))).by("memory-index-limit").length, 0);
  assert.equal((await measure(l(161))).by("memory-index-limit")[0].level, "warn");
});

test("C: a pointer to a missing topic is an issue; a present one is not; URLs are not pointers", async () => {
  const { by } = await measure("- [a](a.md) — here\n- [b](b.md) — gone\n- [c](https://example.com/x.md)\n- [d](sub/d.md#top)\n",
    (w) => { put(join(w.dir, "a.md"), "a"); put(join(w.dir, "sub", "d.md"), "d"); });
  assert.equal(by("memory-dead-pointer").length, 1);
  assert.equal(by("memory-dead-pointer")[0].level, "issue");
  assert.match(by("memory-dead-pointer")[0].message, /1 pointer\(s\).*b\.md/);
});

test("C: a topic over 50000 characters warns, counted in characters; others are info", async () => {
  const { by } = await measure("- [big](big.md)\n- [cyr](cyr.md)\n- [exact](exact.md)\n",
    (w) => {
      put(join(w.dir, "big.md"), "x".repeat(50001));
      put(join(w.dir, "cyr.md"), "я".repeat(30000));
      put(join(w.dir, "exact.md"), "x".repeat(50000));
      put(join(w.dir, "stray.md"), "s");
    });
  assert.equal(by("memory-topic-size").length, 1);
  assert.equal(by("memory-topic-size")[0].level, "warn");
  assert.match(by("memory-topic-size")[0].message, /^1 topic\(s\).*big\.md \(50001\)/);
  assert.match(by("memory-orphan-topic")[0].message, /^1 topic\(s\) with no pointer.*stray\.md/);
  assert.equal(by("memory-orphan-topic")[0].level, "info");
});

test("C: the three longest pointer lines are reported, at most one finding per kind", async () => {
  const idx = [1, 2, 3, 4, 5].map((n) => `- [t${n}](t${n}.md) ${"y".repeat(n * 10)}`).join("\n");
  const { r, by } = await measure(idx, (w) => { for (let n = 1; n <= 5; n++) put(join(w.dir, `t${n}.md`), "t"); });
  assert.equal(by("memory-long-lines").length, 1);
  assert.match(by("memory-long-lines")[0].message, /line 5 \(\d+ chars\), line 4 \(\d+ chars\), line 3/);
  const kinds = r.findings.map((f) => f.check);
  assert.equal(new Set(kinds).size, kinds.length);
});

test("C: Memory under the older key is reported when its realpath differs", async () => {
  const w = world({ name: "proj.v1" });
  const old = join(w.home, ".claude", "projects", w.project.replace(/\//g, "-"), "memory", "MEMORY.md");
  put(old, "# old\n");
  put(w.index, "# new\n");
  const r = await computeMemory({ start: w.project, home: w.home, env: {} });
  assert.equal(r.findings.filter((f) => f.check === "memory-old-key").length, 1);
  assert.equal((await computeMemory({ start: w.project, home: w.home, env: {} })).state, "exists");
});

// ------------------------------------------------------------------- D: CLI

function cli(w, args, { env = {}, project = w.project } = {}) {
  return spawnSync(process.execPath, [WAYPOST, "doctor", ...args], {
    encoding: "utf8", cwd: project, timeout: 30000,
    env: { ...withoutClaudeEnv(), HOME: w.home, USERPROFILE: w.home, WAYPOST_PROJECT_DIR: project, WAYPOST_NO_BEAT: "1", ...env },
  });
}
const FIRST = /^memory: (exists|absent|overridden|off)/;

function snapshot(root) {
  const out = [];
  const walk = (p, rel) => {
    let s;
    try { s = lstatSync(p); } catch { out.push(`${rel}: missing`); return; }
    if (s.isDirectory()) {
      out.push(`${rel}/ dir`);
      for (const n of readdirSync(p).sort()) walk(join(p, n), `${rel}/${n}`);
    } else out.push(`${rel}: ${s.size} ${createHash("sha256").update(readFileSync(p)).digest("hex")}`);
  };
  walk(root, "projects");
  return out.join("\n");
}

test("D: the first stdout line names the state, in all four states, for an unbound project", () => {
  const w = world();
  const absent = cli(w, ["--memory"]);
  assert.equal(absent.status, 0, absent.stderr);
  assert.equal(absent.stdout.split("\n")[0], `memory: absent ${w.dir}`);
  put(w.index, "# idx\n");
  assert.equal(cli(w, ["--memory"]).stdout.split("\n")[0], `memory: exists ${w.dir}`);
  const over = cli(w, ["--memory"], { env: { CLAUDE_COWORK_MEMORY_PATH_OVERRIDE: "/srv/mem" } });
  assert.equal(over.stdout.split("\n")[0], "memory: overridden — CLAUDE_COWORK_MEMORY_PATH_OVERRIDE");
  const off = cli(w, ["--memory"], { env: { CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1", CLAUDE_CODE_SIMPLE: "1" } });
  assert.equal(off.stdout.split("\n")[0], "memory: off — CLAUDE_CODE_DISABLE_AUTO_MEMORY in the environment");
  assert.equal(off.stdout.split("\n").filter(Boolean).length, 2, "the line plus the process-flag info");
  assert.equal(off.status, 0);
  for (const out of [absent, over, off]) assert.match(out.stdout, FIRST);
});

test("D: a broken or memory-less harness record still prints the first line", () => {
  const w = world();
  put(w.index, "x".repeat(26000));
  const rec = join(w.project, ".waypost", "harnesses", "claude.json");
  put(rec, "{ not json");
  const broken = cli(w, ["--memory"]);
  assert.match(broken.stdout, FIRST);
  assert.equal(broken.stdout.split("\n")[0], `memory: exists ${w.dir}`);
  assert.match(broken.stdout, /limits unknown: the harness registry did not load/);
  assert.equal(broken.status, 0, "an unknown limit cannot be an issue");
  put(rec, JSON.stringify({ id: "claude" }));
  const bare = cli(w, ["--memory"]);
  assert.match(bare.stdout, /limits unknown: the claude harness record has no memory field/);
});

test("D: --json carries {state, dir, source, findings} and exits 0 even on an issue", () => {
  const w = world();
  put(w.index, "- [gone](gone.md)\n");
  const r = cli(w, ["--memory", "--json"]);
  assert.equal(r.status, 0);
  const j = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(j), ["state", "dir", "source", "findings"]);
  assert.deepEqual([j.state, j.dir, j.source], ["exists", w.dir, "default"]);
  assert.ok(j.findings.some((f) => f.level === "issue" && f.check === "memory-dead-pointer"));
  const off = JSON.parse(cli(w, ["--memory", "--json"], { env: { CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" } }).stdout);
  assert.deepEqual([off.state, off.dir], ["off", null]);
});

test("D: a dead pointer or an over-limit index exits 1 in text mode", () => {
  const w = world();
  put(w.index, "- [gone](gone.md)\n");
  const r = cli(w, ["--memory"]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /✖ \[memory-dead-pointer\]/);
  put(w.index, "x".repeat(25001));
  assert.equal(cli(w, ["--memory"]).status, 1);
});

test("D: --memory --fix is refused", () => {
  const w = world();
  put(w.index, "# idx\n");
  const r = cli(w, ["--memory", "--fix"]);
  assert.equal(r.status, 2);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /--memory is read-only/);
});

test("D: the .claude/projects tree is byte-identical after a run, absent state included", () => {
  const w = world();
  const tree = join(w.home, ".claude", "projects");
  const before = snapshot(tree);
  cli(w, ["--memory"]);
  cli(w, ["--memory", "--json"]);
  assert.equal(snapshot(tree), before, "absent: nothing is created");
  assert.equal(existsSync(tree), false);
  put(w.index, "- [a](a.md)\n- [gone](gone.md)\n");
  put(join(w.dir, "a.md"), "a");
  put(join(w.dir, "orphan.md"), "o");
  const filled = snapshot(tree);
  cli(w, ["--memory"]);
  cli(w, ["--memory", "--json"]);
  assert.equal(snapshot(tree), filled);
});

test("D: default doctor, next and brief do not mention Memory or change with it", () => {
  const w = world();
  const run = (...args) => spawnSync(process.execPath, [WAYPOST, ...args], {
    encoding: "utf8", cwd: w.project, timeout: 30000,
    env: { ...withoutClaudeEnv(), HOME: w.home, USERPROFILE: w.home, WAYPOST_PROJECT_DIR: w.project, WAYPOST_NO_BEAT: "1" },
  });
  // A bound project, so the three commands run their real checks.
  const bound = run("bind", "vault");
  assert.equal(bound.status, 0, bound.stderr);
  const cmds = [["doctor", "--vault"], ["next"], ["brief", "--no-install"]];
  const without = cmds.map((c) => run(...c));
  assert.match(without[0].stdout, /vault/);
  put(w.index, "x".repeat(26000) + "\n- [gone](gone.md)\n");
  const withMem = cmds.map((c) => run(...c));
  const stable = (t) => t.replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, "<ts>");
  without.forEach((r, i) => {
    assert.equal(stable(withMem[i].stdout), stable(r.stdout));
    assert.equal(withMem[i].status, r.status);
    assert.doesNotMatch(r.stdout, /memory/i);
  });
});
