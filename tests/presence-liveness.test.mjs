import "./env.mjs";
import { ambientEnv } from "./env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir, hostname } from "node:os";
import { spawnSync } from "node:child_process";
import * as focused from "../scripts/presence-liveness.mjs";
import * as facade from "../scripts/presence.mjs";
import { coordinationDirs, presenceDir, observationsPath } from "../scripts/presence-storage.mjs";

const NOW = 2000000000000;
const url = new URL("../scripts/presence-liveness.mjs", import.meta.url).href;
function withProject(root, fn) {
  const saved = process.env.WAYPOST_PROJECT_DIR; process.env.WAYPOST_PROJECT_DIR = root;
  try { return fn(); } finally { if (saved === undefined) delete process.env.WAYPOST_PROJECT_DIR; else process.env.WAYPOST_PROJECT_DIR = saved; }
}
function fixture(t, directories = true) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "wp-liveness-module-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, ".waypost"));
  writeFileSync(join(root, ".waypost", "projectstore.json"), JSON.stringify({ vault_path: "vault", coordination_dir: "coord" }));
  const vault = join(root, "vault"), dirs = withProject(root, () => coordinationDirs(vault));
  const primary = join(dirs.primary, "presence"), legacy = join(dirs.legacy, "presence");
  if (directories) for (const d of [primary, legacy]) mkdirSync(d, { recursive: true });
  const obs = withProject(root, () => observationsPath());
  const put = (name, rec, dir = primary) => writeFileSync(join(dir, name), typeof rec === "string" ? rec : JSON.stringify(rec));
  const peers = opts => withProject(root, () => focused.peers(vault, { now: NOW, ...opts }));
  const prune = opts => withProject(root, () => focused.prunePresence(vault, { now: NOW, ...opts }));
  return { root, vault, primary, legacy, obs, put, peers, prune };
}
const record = (session, extra = {}) => ({ session, host: "remote-host", seq: 1, at: new Date(NOW).toISOString(), started_at: "first incarnation", ...extra });
function child(root, code) {
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8", env: { ...ambientEnv(), WAYPOST_PROJECT_DIR: root } });
  assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout);
}

test("presence liveness module: original bindings and namespace27 exclude the shared conflict matcher", () => {
  for (const n of ["LIVE_WINDOW_MS", "peers", "prunePresence"]) assert.equal(focused[n], facade[n], n);
  assert.equal(focused.LIVE_WINDOW_MS, 150000);
  assert.deepEqual(Object.keys(focused).sort(), ["CONFLICT_COPY", "LIVE_WINDOW_MS", "peers", "prunePresence"]);
  assert.deepEqual(Object.keys(facade).sort(), ["BEAT_INTERVAL_MS", "LIVE_WINDOW_MS", "SHARED_TREE_ADVICE", "acquire", "argv0Of", "beat", "clearPresence", "coordinationDirs", "harnessProcess", "hostSlug", "leaseDir", "osTag", "peers", "presenceDir", "processGone", "processTable", "prunePresence", "readLeases", "release", "selfDescriptor", "sharedTree", "sharedWith", "startTicks", "storageOf", "vaultOffset", "vaultRel", "winnerOf"]);
});

test("presence liveness module: importing does not probe or mutate coordination", t => {
  const { root } = fixture(t, false);
  const code = 'import fs from "node:fs";import cp from "node:child_process";import{syncBuiltinESMExports}from"node:module";let calls=0;for(const n of["mkdirSync","writeFileSync","unlinkSync"])fs[n]=()=>{calls++;throw Error("unexpected mutation")};cp.spawnSync=()=>{calls++;throw Error("unexpected probe")};syncBuiltinESMExports();await import(' + JSON.stringify(url) + ');console.log(JSON.stringify(calls));';
  assert.equal(child(root, code), 0);
});

test("presence liveness module: absent directories preserve observations while an existing empty directory evicts them", t => {
  const { primary, obs, peers } = fixture(t, false);
  mkdirSync(dirname(obs), { recursive: true }); const remembered = '{"remembered":{"seq":1}}\n'; writeFileSync(obs, remembered);
  assert.deepEqual(peers().peers, []); assert.equal(readFileSync(obs, "utf8"), remembered);
  mkdirSync(primary, { recursive: true });
  assert.deepEqual(peers().peers, []); assert.deepEqual(JSON.parse(readFileSync(obs, "utf8")), {});
});

test("presence liveness module: stale first sight stays stale until a counter moves; a new incarnation starts fresh", t => {
  const { put, peers } = fixture(t);
  const old = record("peer", { at: new Date(NOW - 21600000).toISOString() }); put("peer.json", old);
  assert.equal(peers().peers[0].live, false);
  assert.equal(peers({ now: NOW + 1 }).peers[0].live, false);
  put("peer.json", { ...old, seq: 2 });
  const moved = peers({ now: NOW + 2 }).peers[0];
  assert.equal(moved.live, true); assert.equal(moved.quiet_ms, 0); assert.equal(moved.basis, "observed locally");
  put("peer.json", { ...old, seq: 2, started_at: "new incarnation", at: new Date(NOW + 3).toISOString() });
  const restarted = peers({ now: NOW + 3 }).peers[0];
  assert.equal(restarted.live, true); assert.equal(restarted.quiet_ms, null); assert.match(restarted.basis, /first sight/);
});

test("presence liveness module: future and invalid timestamps are safe, window boundary is strict, persist false leaves cache unchanged", t => {
  const { put, obs, peers } = fixture(t);
  put("future.json", record("future", { at: new Date(NOW + 21600000).toISOString() }));
  put("invalid.json", record("invalid", { at: "invalid" }));
  const first = peers({ persist: false }); assert.ok(first.peers.every(p => p.live)); assert.equal(existsSync(obs), false);
  peers(); const before = readFileSync(obs, "utf8"), window = focused.LIVE_WINDOW_MS + first.storage.lag_ms;
  assert.ok(peers({ now: NOW + window, persist: false }).peers.every(p => !p.live));
  assert.ok(peers({ windowMs: 0, persist: false }).peers.every(p => p.live === (first.storage.lag_ms > 0)));
  assert.equal(readFileSync(obs, "utf8"), before);
});

test("presence liveness module: a torn record retains observations and a missing record is evicted", t => {
  const { primary, put, obs, peers } = fixture(t);
  put("peer.json", record("peer")); peers(); const known = readFileSync(obs, "utf8");
  put("peer.json", "{bad");
  assert.deepEqual(peers().peers, []); assert.equal(readFileSync(obs, "utf8"), known);
  unlinkSync(join(primary, "peer.json"));
  assert.deepEqual(peers().peers, []); assert.deepEqual(JSON.parse(readFileSync(obs, "utf8")), {});
});

test("presence liveness module: primary wins duplicates, conflicts survive, dry-run and apply count one peer across both files", t => {
  const { primary, legacy, put, peers, prune } = fixture(t), old = record("dup", { at: new Date(NOW - 172800000).toISOString() });
  put("dup.json", old); put("dup.json", { ...old, seq: 9 }, legacy);
  const conflicts = ["dup 2.json", "dup conflicted copy.json", "dup (конфликт).json", "dup.sync-conflict-.json"];
  for (const n of conflicts) { assert.equal(focused.CONFLICT_COPY.test(n), true); put(n, "conflict", legacy); }
  const view = peers({ persist: false });
  assert.equal(view.peers.length, 1); assert.equal(view.peers[0].seq, 1);
  assert.deepEqual(view.peers[0].files, [join(primary, "dup.json"), join(legacy, "dup.json")]);
  assert.deepEqual([...view.conflicts].sort(), [...conflicts].sort());
  assert.equal(prune({ dryRun: true }), 1); assert.equal(existsSync(join(primary, "dup.json")), true);
  assert.equal(prune(), 1);
  assert.equal(existsSync(join(primary, "dup.json")), false); assert.equal(existsSync(join(legacy, "dup.json")), false);
  assert.deepEqual(readdirSync(legacy).sort(), conflicts.sort());
});

test("presence liveness module: one process snapshot per read and pruning preserves self, live and process-alive peers", t => {
  const { root, vault, put } = fixture(t), host = hostname().split(".")[0], old = new Date(NOW - 172800000).toISOString();
  const proc = { pid: 987654320, started: "Tue Sep 15 14:51:13 2026" };
  put("alive.json", record("alive", { host, at: old, proc }));
  put("gone.json", record("gone", { host, proc: { ...proc, pid: 987654321 } }));
  put("self.json", record("self", { host, at: old, proc: { ...proc, pid: 987654321 } }));
  put("fresh.json", record("fresh")); put("old.json", record("old", { at: old }));
  const code = 'import cp from "node:child_process";import{syncBuiltinESMExports}from"node:module";const real=cp.spawnSync;let probes=0;cp.spawnSync=(cmd,...args)=>cmd==="ps"?(probes++,{status:0,stdout:"  987654320 1 Tue Sep 15 14:51:13 2026 /fixture/runner\\n"}):real(cmd,...args);syncBuiltinESMExports();const P=await import(' + JSON.stringify(url) + ');const fs=await import("node:fs");const view=P.peers(' + JSON.stringify(vault) + ',{self:"self",now:' + NOW + ',persist:false});const first=probes;const dry=P.prunePresence(' + JSON.stringify(vault) + ',{self:"self",now:' + NOW + ',dryRun:true});const removed=P.prunePresence(' + JSON.stringify(vault) + ',{self:"self",now:' + NOW + '});console.log(JSON.stringify({first,dry,removed,probes,peers:view.peers,files:fs.readdirSync(' + JSON.stringify(withProject(root, () => presenceDir(vault))) + ').sort()}));';
  const r = child(root, code);
  if (process.platform === "win32") {
    assert.equal(r.first, 0); assert.equal(r.removed, 2); // old and old-age alive: no process evidence on this platform.
  } else {
    assert.equal(r.first, 1); assert.equal(r.probes, 3); assert.equal(r.dry, 2); assert.equal(r.removed, 2);
    assert.equal(r.peers.find(p => p.session === "alive").process_alive, true);
    assert.equal(r.peers.find(p => p.session === "gone").ended, true);
    assert.deepEqual(r.files, ["alive.json", "fresh.json", "self.json"]);
  }
});

test("presence liveness module: an unlink failure preserves the existing logical removal count", t => {
  const { root, vault, primary, put } = fixture(t);
  put("old.json", record("old", { at: new Date(NOW - 172800000).toISOString() }));
  const file = join(primary, "old.json");
  const code = 'import fs from "node:fs";import{syncBuiltinESMExports}from"node:module";fs.unlinkSync=()=>{throw Error("fixture refusal")};syncBuiltinESMExports();const P=await import(' + JSON.stringify(url) + ');const count=P.prunePresence(' + JSON.stringify(vault) + ',{now:' + NOW + '});console.log(JSON.stringify({count,exists:fs.existsSync(' + JSON.stringify(file) + ')}));';
  assert.deepEqual(child(root, code), { count: 1, exists: true });
});
