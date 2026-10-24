import "./env.mjs";
import { ambientEnv } from "./env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, hostname } from "node:os";
import { spawnSync } from "node:child_process";
import * as focused from "../scripts/presence-storage.mjs";
import * as facade from "../scripts/presence.mjs";

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "wp-storage-module-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, ".waypost"));
  const config = data => writeFileSync(join(root, ".waypost", "projectstore.json"), JSON.stringify({ vault_path: "vault", ...data }));
  config({});
  const git = (...args) => {
    const env = { ...ambientEnv(), GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(root, "no-global") };
    for (const k of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR"]) delete env[k];
    const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", env });
    assert.equal(r.status, 0, r.stderr);
  };
  return { root, config, git };
}
function withProject(root, fn) {
  const saved = process.env.WAYPOST_PROJECT_DIR; process.env.WAYPOST_PROJECT_DIR = root;
  try { return fn(); } finally { if (saved === undefined) delete process.env.WAYPOST_PROJECT_DIR; else process.env.WAYPOST_PROJECT_DIR = saved; }
}
function child(code) {
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8", env: ambientEnv() });
  assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout);
}
const url = new URL("../scripts/presence-storage.mjs", import.meta.url).href;

test("presence storage module: five shared bindings and namespace27 exclude internal path helpers", () => {
  const publicNames = ["storageOf", "coordinationDirs", "presenceDir", "leaseDir", "hostSlug"];
  for (const n of publicNames) assert.equal(focused[n], facade[n], n);
  assert.deepEqual(Object.keys(focused).sort(), [...publicNames, "legacyPresenceDir", "legacyLeaseDir", "observationsPath"].sort());
  assert.deepEqual(Object.keys(facade).sort(), ["BEAT_INTERVAL_MS", "LIVE_WINDOW_MS", "SHARED_TREE_ADVICE", "acquire", "argv0Of", "beat", "clearPresence", "coordinationDirs", "harnessProcess", "hostSlug", "leaseDir", "osTag", "peers", "presenceDir", "processGone", "processTable", "prunePresence", "readLeases", "release", "selfDescriptor", "sharedTree", "sharedWith", "startTicks", "storageOf", "vaultOffset", "vaultRel", "winnerOf"]);
});

test("presence storage module: import alone does not probe storage or Git", () => {
  const r = child('import cp from "node:child_process";import{syncBuiltinESMExports}from"node:module";let calls=0;cp.spawnSync=()=>{calls++;throw Error("unexpected probe")};syncBuiltinESMExports();await import(' + JSON.stringify(url) + ');console.log(JSON.stringify(calls));');
  assert.equal(r, 0);
});

test("presence storage module: cloud and UNC shortcuts retain precedence, delays and fresh objects", () => {
  const inputs = [
    ["/iCloud Drive/Dropbox/x", "iCloud"], ["/Dropbox/x", "Dropbox"], ["C:\\Dropbox\\x", "Dropbox"],
    ["/Google Drive/x", "Google Drive"], ["/My Drive/x", "Google Drive"],
    ["/OneDrive/x", "OneDrive"], ["/Yandex.Disk/x", "Yandex Disk"],
  ];
  for (const [path, provider] of inputs) assert.deepEqual(focused.storageOf(path), { kind: "cloud", provider, lag_ms: 60000, settle_ms: 4000 });
  assert.deepEqual(focused.storageOf("\\\\server\\share"), { kind: "network", provider: "UNC share", lag_ms: 3000, settle_ms: 1500 });
  const a = focused.storageOf("/Dropbox/x"); a.lag_ms = 1;
  assert.equal(focused.storageOf("/Dropbox/x").lag_ms, 60000);
});

test("presence storage module: mount probing preserves longest-prefix fallback, errors and call-time results", () => {
  const code = 'import cp from "node:child_process";import{syncBuiltinESMExports}from"node:module";let mode=0,calls=[];cp.spawnSync=(cmd,args,opts)=>{calls.push({cmd,args,timeout:opts.timeout});if(mode===3)throw Error("probe failed");if(cmd==="df")return mode===0?{status:0,stdout:"Filesystem Type Blocks\\nfixture nfs 0\\n"}:{status:1,stdout:""};return{status:0,stdout:"dev on / (apfs)\\ndev on /fixture (smbfs)\\ndev on /fixture/deep (nfs)\\n"};};syncBuiltinESMExports();const P=await import(' + JSON.stringify(url) + ');const before={...process.env};const first=P.storageOf("/fixture/deep/x");mode=1;const deep=P.storageOf("/fixture/deep/x");const boundary=P.storageOf("/fixture/deeper/x");mode=3;const failed=P.storageOf("/fixture/x");console.log(JSON.stringify({first,deep,boundary,failed,calls,unchanged:JSON.stringify(before)===JSON.stringify({...process.env})}));';
  const r = child(code);
  if (process.platform === "win32") {
    assert.equal(r.first.kind, "local"); assert.deepEqual(r.calls, []);
  } else {
    assert.equal(r.first.provider, "nfs"); assert.equal(r.deep.provider, "nfs");
    assert.equal(r.boundary.provider, "smbfs"); assert.equal(r.failed.kind, "local");
    assert.deepEqual(r.calls[0], { cmd: "df", args: ["-P", "-T", "/fixture/deep/x"], timeout: 3000 });
    assert.equal(r.calls.filter(c => c.cmd === "mount").length, 2);
  }
  assert.equal(r.unchanged, true);
});

test("presence storage module: nonrepository and observing-host paths retain the single-location shape", t => {
  const { root } = fixture(t), vault = join(root, "vault");
  withProject(root, () => {
    assert.deepEqual(focused.coordinationDirs(vault), { primary: join(vault, ".projectstore"), legacy: null, common: null });
    assert.equal(focused.legacyPresenceDir(vault), null); assert.equal(focused.legacyLeaseDir(vault), null);
    assert.equal(focused.presenceDir(vault), join(vault, ".projectstore", "presence"));
    const host = hostname().split(".")[0].replace(/[^\w.-]+/g, "_");
    assert.equal(focused.hostSlug(), host);
    assert.equal(focused.observationsPath(), join(root, ".waypost", "state", "peers." + host + ".json"));
  });
});

test("presence storage module: one mutable cache uses raw vault spelling and project root, with sticky config", t => {
  const { root, config } = fixture(t), vault = join(root, "vault");
  const other = join(root, "other"); mkdirSync(other);
  withProject(root, () => {
    const a = focused.coordinationDirs(vault);
    assert.equal(a, facade.coordinationDirs(vault));
    a.marker = "shared"; assert.equal(facade.coordinationDirs(vault).marker, "shared");
    config({ coordination_dir: "changed" });
    assert.equal(focused.coordinationDirs(vault), a);
    assert.equal(a.primary, join(vault, ".projectstore"));
    const spelling = focused.coordinationDirs(vault + "/");
    assert.notEqual(spelling, a); assert.equal(spelling.primary, join(root, "changed"));
    const b = withProject(other, () => focused.coordinationDirs(vault));
    assert.notEqual(b, a); assert.equal(focused.coordinationDirs(vault), a);
  });
});

test("presence storage module: Git common directory, outside vault and root-vault keys remain distinct", t => {
  const { root, git } = fixture(t); git("init", "-q");
  withProject(root, () => {
    const vault = join(root, "docs", "vault"), c = focused.coordinationDirs(vault);
    assert.equal(c.primary, join(root, ".git", "waypost", "docs-vault"));
    assert.equal(c.common, join(root, ".git")); assert.equal(c.legacy, join(vault, ".projectstore"));
    assert.equal(focused.legacyPresenceDir(vault), join(c.legacy, "presence"));
    assert.equal(focused.legacyLeaseDir(vault), join(c.legacy, "leases"));
    assert.equal(focused.coordinationDirs(root).primary, join(root, ".git", "waypost", "vault"));
    const away = join(root, "..", "outside-vault");
    assert.deepEqual(focused.coordinationDirs(away), { primary: join(away, ".projectstore"), legacy: null, common: join(root, ".git") });
  });
});

test("presence storage module: absolute and coinciding legacy overrides preserve resolution", t => {
  const { root, config } = fixture(t), absolute = join(root, "absolute");
  withProject(root, () => {
    config({ coordination_dir: absolute });
    assert.equal(focused.coordinationDirs(join(root, "first")).primary, absolute);
    config({ coordination_dir: "second/.projectstore" });
    const c = focused.coordinationDirs(join(root, "second"));
    assert.equal(c.primary, join(root, "second", ".projectstore")); assert.equal(c.legacy, null);
  });
});

test("presence storage module: linked worktree inherits the main binding and override", t => {
  const { root, config, git } = fixture(t); git("init", "-q");
  writeFileSync(join(root, "tracked"), "fixture"); git("add", "tracked");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture");
  const linked = join(root, "linked"); git("worktree", "add", "-q", "--detach", linked);
  config({ coordination_dir: "coord" });
  const a = withProject(root, () => focused.coordinationDirs(join(root, "vault")));
  const b = withProject(linked, () => focused.coordinationDirs(join(linked, "vault")));
  assert.notEqual(a, b); assert.equal(a.primary, join(root, "coord")); assert.equal(b.primary, a.primary);
  assert.equal(b.common, join(root, ".git")); assert.equal(b.legacy, join(linked, "vault", ".projectstore"));
});
