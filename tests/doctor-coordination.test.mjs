import "./env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, chmodSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import * as focused from "../scripts/doctor-coordination.mjs";
import * as doctor from "../scripts/doctor.mjs";
import { pluginRoot } from "../scripts/lib.mjs";

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "wp-coordination-module-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const gitEnv = { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(root, "no-global-config") };
  const savedGitEnv = Object.fromEntries(Object.keys(gitEnv).map(k => [k, process.env[k]]));
  Object.assign(process.env, gitEnv);
  t.after(() => {
    for (const k of Object.keys(gitEnv)) {
      if (savedGitEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedGitEnv[k];
    }
  });
  const put = (rel, text) => {
    const p = join(root, rel);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, text);
    return p;
  };
  mkdirSync(join(root, "vault"));
  mkdirSync(join(root, "empty-hooks"));
  put(".waypost/projectstore.json", JSON.stringify({ vault_path: "vault", layout: "engineering", coordination_dir: "coord" }));
  put(".gitignore", ".waypost/\ncoord/\n");
  return { root, put, cfg: Object.freeze({ vault_path: join(root, "vault"), layout: "engineering" }) };
}
function withEnv(values, fn) {
  const saved = Object.fromEntries(Object.keys(values).map(k => [k, process.env[k]]));
  Object.assign(process.env, values);
  try { return fn(); } finally {
    for (const k of Object.keys(values)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}
function inProject(root, fn) {
  return withEnv({ WAYPOST_PROJECT_DIR: root, CLAUDE_PROJECT_DIR: root, WAYPOST_HARNESS: "unknown", WAYPOST_PROC: "" }, fn);
}
function git(root, ...args) {
  const r = spawnSync("git", ["-c", "user.name=Waypost Fixture", "-c", "user.email=fixture@example.invalid", "-c", `core.hooksPath=${join(root, "empty-hooks")}`, ...args], {
    cwd: root, encoding: "utf8", env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(root, "no-global-config") },
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
function freeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function files(root) {
  const out = {};
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else out[p.slice(root.length + 1)] = readFileSync(p).toString("base64");
    }
  };
  walk(root);
  return out;
}

test("doctor coordination module: all seven public exports retain identical bindings", () => {
  for (const name of ["checkLauncher", "checkMergeDriver", "checkSharedVaultState", "mergeDriverAccepted", "mergeDriverCommand", "checkVaultGit", "checkProcessTable"]) assert.equal(doctor[name], focused[name], name);
});

test("doctor coordination module: merge driver findings retain ordering, whitelist and foreign path semantics", t => {
  const { root, put, cfg } = fixture(t);
  assert.deepEqual(focused.checkMergeDriver(cfg, root), []);
  git(root, "init", "-q");
  const missingAttributes = { group: "install", level: "warn", check: "merge-driver", message: "Derived views (kanban.md, graph.md, code-map.md, folder indexes) are not marked `merge=waypost-derived` in .gitattributes — two sessions working in parallel will hand you a conflict in a generated file. `waypost doctor --fix` writes it." };
  const missingConfig = { group: "install", level: "warn", check: "merge-driver", message: "The waypost-derived merge driver is not configured in this clone (git config merge.waypost-derived.driver). It is machine-local, so every clone sets it once — `waypost doctor --fix` does." };
  assert.deepEqual(focused.checkMergeDriver(cfg, root), [missingAttributes, missingConfig]);
  put(".gitattributes", "vault/** merge=waypost-derived\n");
  const expected = focused.mergeDriverAccepted();
  assert.deepEqual(expected, ["waypost merge-derived %A %O %B %P", `node ${join(pluginRoot(), "scripts", "merge-derived.mjs").replace(/\\/g, "/")} %A %O %B %P`, `${process.execPath} ${join(pluginRoot(), "scripts", "merge-derived.mjs").replace(/\\/g, "/")} %A %O %B %P`]);
  for (const command of [...expected, "node /foreign/install/scripts/merge-derived.mjs %A %O %B %P", "node Y:\\Other\\scripts\\merge-derived.mjs %A %O %B %P"]) {
    git(root, "config", "merge.waypost-derived.driver", command);
    assert.deepEqual(focused.checkMergeDriver(cfg, root), [], command);
  }
  const broken = "node Y:Otherscriptsmerge-derived.mjs %A %O %B %P";
  git(root, "config", "merge.waypost-derived.driver", broken);
  assert.deepEqual(focused.checkMergeDriver(cfg, root), [{ group: "install", level: "warn", check: "merge-driver", message: `merge.waypost-derived.driver points at a different command than this version installs:\n      configured: ${broken}\n      expected:   ${focused.mergeDriverCommand()}\n      \`waypost doctor --fix\` rewrites it.` }]);
  const before = files(root);
  assert.deepEqual(focused.checkMergeDriver(Object.freeze({ vault_path: join(root, "..", "external") }), root), []);
  assert.deepEqual(files(root), before);
});

test("doctor coordination module: vault git nesting, default root and linked-worktree git file remain accepted", t => {
  const { root, put, cfg } = fixture(t);
  const warning = [{ group: "install", level: "warn", check: "vault-git", message: "Vault is not a git repository — the knowledge has no history/blame/review. Consider `git init` (doctor --fix offers it)." }];
  assert.deepEqual(focused.checkVaultGit(cfg, root), warning);
  git(root, "init", "-q");
  inProject(root, () => assert.deepEqual(focused.checkVaultGit(cfg), []));
  const external = join(root, "..", "absent-external-vault");
  assert.deepEqual(focused.checkVaultGit(Object.freeze({ vault_path: external }), root), warning);
  mkdirSync(join(root, "vault", ".git"));
  assert.deepEqual(focused.checkVaultGit(cfg, join(root, "another-project")), []);
  put("tracked.txt", "fixture\n");
  git(root, "add", "tracked.txt");
  git(root, "commit", "-qm", "fixture");
  const linked = join(root, "sibling");
  git(root, "worktree", "add", "--detach", linked, "HEAD");
  mkdirSync(join(linked, "vault"));
  assert.match(readFileSync(join(linked, ".git"), "utf8"), /^gitdir:/);
  inProject(linked, () => {
    assert.deepEqual(focused.checkVaultGit(Object.freeze({ vault_path: join(linked, "vault") })), []);
    assert.deepEqual(focused.checkMergeDriver(Object.freeze({ vault_path: join(linked, "vault") }), linked).map(f => f.check), ["merge-driver", "merge-driver"]);
  });
});

test("doctor coordination module: merge command detects PATH at call time without executing a found program", { skip: process.platform === "win32" }, t => {
  const { root, put } = fixture(t);
  const sentinel = join(root, "executed");
  const bin = join(root, "pathbin");
  const entry = put("pathbin/waypost", `#!/bin/sh\necho invoked > '${sentinel}'\n`);
  chmodSync(entry, 0o755);
  withEnv({ PATH: bin }, () => assert.equal(focused.mergeDriverCommand(), "waypost merge-derived %A %O %B %P"));
  withEnv({ PATH: join(root, "empty-hooks") }, () => assert.equal(focused.mergeDriverCommand(), `node ${join(pluginRoot(), "scripts", "merge-derived.mjs").replace(/\\/g, "/")} %A %O %B %P`));
  assert.equal(existsSync(sentinel), false);
});

test("doctor coordination module: shared-state findings preserve dedup, order and all files without observations", t => {
  const { root, put, cfg } = fixture(t);
  assert.deepEqual(focused.checkSharedVaultState(null), []);
  assert.deepEqual(focused.checkSharedVaultState(Object.freeze({})), []);
  const name = "s1 (conflicted copy 2026).json";
  put("coord/presence/" + name, "{}");
  put("coord/leases/dead.json", '{"path":"src/a.mjs","session":"gone"}');
  put("vault/.projectstore/leases/dead.json", '{"path":"src/a.mjs","session":"gone"}');
  put("coord/leases/broken.json", "{");
  inProject(root, () => {
    const before = files(root);
    const expected = [
      { group: "vault", level: "warn", check: "shared-state", message: `The sync client left 1 conflicted copy(ies) in .projectstore/presence — two devices wrote at once: ${name}. Delete them once you know which device is authoritative.` },
      { group: "vault", level: "info", check: "shared-state", message: "1 lease(s) are held by sessions that are no longer live (src/a.mjs — gone). They are advisory and will be taken over on the next acquire." },
    ];
    assert.deepEqual(focused.checkSharedVaultState(cfg), expected);
    assert.deepEqual(focused.checkSharedVaultState(cfg), expected);
    assert.deepEqual(files(root), before);
  });
});

test("doctor coordination module: frozen injected launcher reports keep full warnings and issues", () => {
  assert.deepEqual(focused.checkLauncher(freeze({ risk: "none" })), []);
  const checkout = { entry: "/fixture/checkout/bin/waypost", toolRoot: "/fixture/checkout" };
  for (const risk of ["exposed", "broken"]) {
    const r = freeze({ risk, checkout: { ...checkout }, linked: [{ file: "/fixture/path/waypost" }, { file: "/fixture/path/wyp" }] });
    const before = JSON.stringify(r);
    const message = risk === "broken"
      ? `/fixture/path/waypost, /fixture/path/wyp: a symlink to ${checkout.entry}, which has lost its executable bit — the command fails with "permission denied". \`node '${join(checkout.toolRoot, "scripts", "launcher.mjs")}' --write\` replaces the symlink with a shim that does not need the bit.`
      : `/fixture/path/waypost, /fixture/path/wyp: a symlink to ${checkout.entry}, and core.fileMode=false says this checkout is shared with a system that has no executable bit. The next save of bin/waypost from there breaks the command, and git will not restore the bit. \`waypost launcher --write\` replaces the symlink with a shim.`;
    assert.deepEqual(focused.checkLauncher(r), [{ group: "install", level: risk === "broken" ? "issue" : "warn", check: "launcher", message }]);
    assert.equal(JSON.stringify(r), before);
  }
});

test("doctor coordination module: explicit missing and supplied process tables retain platform semantics", () => {
  const expected = process.platform === "win32" ? [] : [{ group: "install", level: "warn", check: "process-table", message: "No process table: liveness falls back to a 24h age guess — a session whose harness has exited reads as live until then, and a running tool is not seen holding its cache directory. Check that `ps` is on PATH and accepts `ps axo pid=,ppid=,lstart=,comm=`; waypost asks for it in the C locale, so a shell's LC_TIME does not matter (WP-19)." }];
  assert.deepEqual(focused.checkProcessTable(null), expected);
  assert.deepEqual(focused.checkProcessTable(new Map()), []);
});
