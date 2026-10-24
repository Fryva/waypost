import "./env.mjs";
import { ambientEnv } from "./env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir, hostname } from "node:os";
import { spawnSync } from "node:child_process";
import * as focused from "../scripts/presence-checkout.mjs";
import * as facade from "../scripts/presence.mjs";
import { projectRoot, gitCommonDir } from "../scripts/lib.mjs";
import { presenceDir, observationsPath } from "../scripts/presence-storage.mjs";
const NOW = 2000000000000;
function fixture(t, git = true) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "wp-checkout-module-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, ".waypost")); mkdirSync(join(root, "vault"));
  writeFileSync(join(root, ".waypost", "projectstore.json"), JSON.stringify({ vault_path: "vault" }));
  if (git) {
    const env = ambientEnv(); for (const k of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR"]) delete env[k];
    const r = spawnSync("git", ["-C", root, "init", "-q"], { encoding: "utf8", env }); assert.equal(r.status, 0, r.stderr);
  }
  return { root, vault: join(root, "vault") };
}
function withProject(root, fn) {
  const old = process.env.WAYPOST_PROJECT_DIR; process.env.WAYPOST_PROJECT_DIR = root;
  try { return fn(); } finally { if (old === undefined) delete process.env.WAYPOST_PROJECT_DIR; else process.env.WAYPOST_PROJECT_DIR = old; }
}
const peer = (session, root, common, extra = {}) => ({ session, live: true, self: false, host: "foreign-host", harness: "codex", os: "other", project_root: root, common_dir: common, ...extra });
const view = peers => ({ peers });

test("presence checkout module: five original bindings and namespace27 keep helpers private", () => {
  const names = ["SHARED_TREE_ADVICE", "sharedTree", "sharedWith", "vaultOffset", "vaultRel"];
  assert.deepEqual(Object.keys(focused).sort(), names);
  for (const n of names) assert.equal(focused[n], facade[n], n);
  assert.deepEqual(Object.keys(facade).sort(), ["BEAT_INTERVAL_MS", "LIVE_WINDOW_MS", "SHARED_TREE_ADVICE", "acquire", "argv0Of", "beat", "clearPresence", "coordinationDirs", "harnessProcess", "hostSlug", "leaseDir", "osTag", "peers", "presenceDir", "processGone", "processTable", "prunePresence", "readLeases", "release", "selfDescriptor", "sharedTree", "sharedWith", "startTicks", "storageOf", "vaultOffset", "vaultRel", "winnerOf"]);
});

test("presence checkout module: import alone performs no probes or coordination writes", () => {
  const url = new URL("../scripts/presence-checkout.mjs", import.meta.url).href;
  const code = 'import fs from "node:fs";import cp from "node:child_process";import{syncBuiltinESMExports}from"node:module";let calls=0;for(const n of["mkdirSync","writeFileSync","unlinkSync"])fs[n]=()=>{calls++;throw Error("unexpected write")};cp.spawnSync=()=>{calls++;throw Error("unexpected probe")};syncBuiltinESMExports();await import(' + JSON.stringify(url) + ');console.log(calls);';
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8", env: ambientEnv() });
  assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout.trim(), "0");
});

test("presence checkout module: lease paths remain vault-relative, project-relative or lexical absolute", t => {
  const { root, vault } = fixture(t, false);
  withProject(root, () => {
    assert.equal(focused.vaultRel(join(vault, "a"), vault), "a");
    assert.equal(focused.vaultRel("vault/a", vault), "a");
    assert.equal(focused.vaultRel("src/a", vault), "src/a");
    const outside = root + "-suffix/a";
    assert.equal(focused.vaultRel(outside, vault), outside.replace(/\\/g, "/"));
    assert.equal(focused.vaultRel(vault, vault), "");
    assert.equal(focused.vaultRel(root, vault), "");
    assert.equal(focused.vaultRel(join(root, "alias", "a"), vault), "alias/a");
    assert.equal(focused.vaultOffset(vault + "/"), "vault");
    assert.equal(focused.vaultOffset(root), "."); assert.equal(focused.vaultOffset(null), null);
    assert.equal(focused.vaultOffset(root + "-suffix"), null);
    assert.equal(focused.vaultOffset(vault.replace(/\\/g, "/").replace(/\//g, "\\")), "vault");
  });
});

test("presence checkout module: root is read at call time without path-resolution memoization", t => {
  const { root, vault } = fixture(t, false), nested = join(root, "nested");
  mkdirSync(nested);
  withProject(root, () => assert.equal(focused.vaultRel("src/a", vault), "src/a"));
  withProject(nested, () => {
    assert.equal(projectRoot(), nested);
    assert.equal(focused.vaultRel("src/a", vault), "src/a");
    assert.equal(focused.vaultRel(join(root, "src", "a"), vault), join(root, "src", "a").replace(/\\/g, "/"));
    assert.equal(focused.vaultOffset(vault), null);
  });
});

test("presence checkout module: foreign same-root is shared; self, quiet and same-host roots are excluded", t => {
  const { root, vault } = fixture(t);
  withProject(root, () => {
    const common = gitCommonDir(), me = hostname().split(".")[0];
    const injected = view([peer("foreign", root, common), peer("local", root, common, { host: me }), peer("self", root, common, { self: true }), peer("quiet", root, common, { live: false })]);
    const before = JSON.stringify(injected), r = focused.sharedTree(vault, { view: injected });
    assert.equal(r.shared, true); assert.deepEqual(r.with.map(p => p.session), ["foreign"]);
    assert.equal(r.with[0].basis, "same project root"); assert.equal(JSON.stringify(injected), before);
  });
});

test("presence checkout module: sibling classification precedes host filtering and retired vault offset has no authority", t => {
  const { root, vault } = fixture(t);
  withProject(root, () => {
    const common = gitCommonDir(), me = hostname().split(".")[0];
    const r = focused.sharedTree(vault, { view: view([
      peer("same-host-sibling", root + "-sibling", common, { host: me }),
      peer("missing-host-sibling", root + "-other", common, { host: null }),
      peer("retired", root + "-unrelated", "/different-common", { vault_rel: "vault" }),
    ]) });
    assert.equal(r.shared, false); assert.deepEqual(r.with, []);
    assert.deepEqual(r.siblings.map(p => p.session), ["same-host-sibling", "missing-host-sibling"]);
  });
});

test("presence checkout module: containment accepts ancestors and descendants with native case policy, exact mode stays lexical", t => {
  const { root, vault } = fixture(t);
  withProject(root, () => {
    for (const p of [dirname(root), join(root, "child")]) {
      const v = view([peer("peer", p, "/different-common")]);
      assert.equal(focused.sharedTree(vault, { view: v }).shared, false);
      assert.equal(focused.sharedTree(vault, { view: v, contain: true }).shared, true);
    }
    assert.equal(focused.sharedTree(vault, { view: view([peer("prefix", root + "-other", "/different-common")]), contain: true }).shared, false);
    const upper = view([peer("case", root.toUpperCase(), "/different-common")]);
    assert.equal(focused.sharedTree(vault, { view: upper }).shared, false);
    assert.equal(focused.sharedTree(vault, { view: upper, contain: true }).shared, process.platform === "darwin" || process.platform === "win32");
  });
});

test("presence checkout module: cloud fallback requires another host and absent peer repository evidence", t => {
  const { root } = fixture(t, false), cloud = join(root, "Dropbox", "project"); mkdirSync(cloud, { recursive: true });
  withProject(cloud, () => {
    const r = focused.sharedTree(join(cloud, "vault"), { view: view([
      peer("unknown-repository", "/elsewhere", null),
      peer("other-repository", "/elsewhere", "/other-common"),
      peer("same-host", "/elsewhere", null, { host: hostname().split(".")[0] }),
    ]) });
    assert.equal(r.storage.kind, "cloud"); assert.equal(r.shared, true);
    assert.deepEqual(r.with.map(p => p.session), ["unknown-repository"]);
    assert.equal(r.with[0].basis, "project root on Dropbox");
  });
});

test("presence checkout module: supplied view bypasses peers, persist false leaves observations and normal reads record them", t => {
  const { root, vault } = fixture(t);
  withProject(root, () => {
    const dir = presenceDir(vault), common = gitCommonDir(); mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "peer.json"), JSON.stringify({ session: "peer", host: "foreign-host", seq: 1, at: new Date(NOW).toISOString(), started_at: "fixture", project_root: root, common_dir: common }));
    const injected = { peers: [], storage: { kind: "caller-data" } };
    const r = focused.sharedTree(vault, { view: injected, now: NOW, persist: true });
    assert.equal(r.shared, false); assert.notEqual(r.storage.kind, "caller-data"); assert.equal(existsSync(observationsPath()), false);
    assert.equal(focused.sharedTree(vault, { now: NOW, persist: false }).shared, true);
    assert.equal(existsSync(observationsPath()), false);
    assert.equal(focused.sharedTree(vault, { now: NOW }).shared, true);
    assert.equal(existsSync(observationsPath()), true);
  });
});

test("presence checkout module: advice and peer formatter retain the public text contract", () => {
  assert.match(focused.SHARED_TREE_ADVICE, /waypost commit -- <paths>/);
  assert.match(focused.SHARED_TREE_ADVICE, /waypost lease list/);
  assert.equal(focused.sharedWith({ with: [] }), "");
  assert.equal(focused.sharedWith({ with: [{ session: "one", host: "a", harness: "codex", basis: "same project root" }, { session: "two", host: "b", harness: null, basis: "shared" }] }), "one on a (codex), same project root; two on b, shared");
});
