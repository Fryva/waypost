import "./env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, hostname } from "node:os";
import { spawnSync } from "node:child_process";
import * as focused from "../scripts/presence-process.mjs";
import * as facade from "../scripts/presence.mjs";

function env(t, values) {
  const old = new Map(Object.keys(values).map(k => [k, process.env[k]]));
  for (const [k, v] of Object.entries(values)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  t.after(() => { for (const [k, v] of old) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
}
function fakePs(t, body) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "wp-process-module-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  env(t, { PATH: root, WAYPOST_PROC: undefined, LC_ALL: "ru_RU.UTF-8", WP_PROCESS_MARK: join(root, "calls") });
  const put = body => writeFileSync(join(root, "ps"), "#!/bin/sh\n" + body + "\n", { mode: 0o755 });
  put(body);
  return { root, put };
}
const me = hostname().split(".")[0];
const row = { pid: 42, ppid: 1, started: "old", ticks: 8, comm: "/opt/runner", argv0: "runtime" };
const record = (proc = row, host = me) => ({ host, proc });

test("presence process module: five shared bindings and the facade namespace stay exact", () => {
  const names = ["argv0Of", "harnessProcess", "processGone", "processTable", "startTicks"];
  assert.deepEqual(Object.keys(focused).sort(), names);
  for (const n of names) assert.equal(focused[n], facade[n], n);
  assert.deepEqual(Object.keys(facade).sort(), ["BEAT_INTERVAL_MS", "LIVE_WINDOW_MS", "SHARED_TREE_ADVICE", "acquire", "argv0Of", "beat", "clearPresence", "coordinationDirs", "harnessProcess", "hostSlug", "leaseDir", "osTag", "peers", "presenceDir", "processGone", "processTable", "prunePresence", "readLeases", "release", "selfDescriptor", "sharedTree", "sharedWith", "startTicks", "storageOf", "vaultOffset", "vaultRel", "winnerOf"]);
});

test("presence process module: import alone starts no subprocess or process-file read", () => {
  const url = new URL("../scripts/presence-process.mjs", import.meta.url).href;
  const script = 'import fs from "node:fs"; import cp from "node:child_process"; import {syncBuiltinESMExports} from "node:module"; fs.readFileSync=()=>{throw Error("unexpected read")};cp.spawnSync=()=>{throw Error("unexpected spawn")};syncBuiltinESMExports();await import(' + JSON.stringify(url) + ');console.log("lazy");';
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout.trim(), "lazy");
});

test("presence process module: pinned evidence precedes the table and is read on every call", t => {
  env(t, { WAYPOST_PROC: '{"pid":77,"custom":"preserved"}' });
  assert.deepEqual(focused.harnessProcess(null, 50), { pid: 77, custom: "preserved" });
  process.env.WAYPOST_PROC = '{"pid":78}';
  assert.deepEqual(focused.harnessProcess(new Map(), 50), { pid: 78 });
  for (const value of ["{bad", "null", '{"pid":0}']) {
    process.env.WAYPOST_PROC = value;
    assert.equal(focused.harnessProcess(null, 50), null);
    assert.deepEqual(focused.harnessProcess(new Map([[42, row]]), 42), { pid: 42, started: "old", ticks: 8, comm: "runner", argv0: "runtime" });
  }
});

test("presence process module: shell wrappers, dead ends, cycles and the depth limit remain bounded", t => {
  env(t, { WAYPOST_PROC: undefined });
  const table = new Map([[50, { pid: 50, ppid: 42, comm: "/bin/-zsh" }], [42, row]]);
  assert.equal(focused.harnessProcess(table, 50).pid, 42);
  assert.equal(focused.harnessProcess(table, 51), null);
  assert.equal(focused.harnessProcess(table, 1), null);
  table.set(50, { pid: 50, ppid: 50, comm: "sandbox-exec" });
  assert.equal(focused.harnessProcess(table, 50), null);
  for (let i = 100; i < 132; i++) table.set(i, { pid: i, ppid: i + 1, comm: "env" });
  table.set(132, row);
  assert.equal(focused.harnessProcess(table, 100), null);
  assert.equal(focused.harnessProcess(table, 101).pid, 42);
});

test("presence process module: missing evidence and foreign hosts remain unknown without a table read", () => {
  const table = new Map([[42, row]]);
  for (const rec of [null, {}, record(null), record({ pid: 0 }), record(row, "another-host")]) assert.equal(focused.processGone(rec, table), null);
  assert.equal(focused.processGone(record(), null), null);
  assert.equal(focused.processGone(record({ ...row, pid: "42" }), table), false);
  assert.equal(focused.processGone(record({ ...row, pid: 43 }), table), true);
});

test("presence process module: ticks override wall-clock drift, with the legacy string fallback preserved", () => {
  const table = new Map([[42, { ...row, started: "after sleep" }]]);
  assert.equal(focused.processGone(record(), table), false);
  assert.equal(focused.processGone(record({ ...row, ticks: 7 }), table), true);
  assert.equal(focused.processGone(record({ ...row, ticks: null }), table), true);
  assert.equal(focused.processGone(record({ ...row, ticks: null, started: "after sleep" }), table), false);
  assert.equal(focused.processGone(record({ ...row, ticks: null, started: null }), table), false);
  assert.equal(focused.startTicks(-1), null); assert.equal(focused.argv0Of(-1), null);
});

test("presence process module: null suppresses probing while undefined probes at call time", t => {
  if (process.platform === "win32") {
    assert.equal(focused.processTable(), null);
    return;
  }
  const { root } = fakePs(t, 'printf x >> "$WP_PROCESS_MARK"\nprintf "  42 1 Tue Sep 15 14:51:13 2026 /opt/runner\\n"');
  assert.equal(focused.harnessProcess(null, 42), null);
  assert.equal(focused.processGone(record(), null), null);
  assert.equal(focused.processGone(record(row, "another-host")), null);
  assert.equal(existsSync(join(root, "calls")), false);
  assert.equal(focused.harnessProcess(undefined, 42).pid, 42);
  assert.equal(focused.processGone(record({ ...row, ticks: null, started: "Tue Sep 15 14:51:13 2026" })), false);
  assert.equal(readFileSync(join(root, "calls"), "utf8"), "xx");
});

test("presence process module: ps argv/locale are child-only and repeated probes are uncached", t => {
  if (process.platform === "win32") { assert.equal(focused.processTable(), null); return; }
  const { put } = fakePs(t, 'if [ "$LC_ALL" != C ] || [ "$1" != axo ] || [ "$2" != "pid=,ppid=,lstart=,comm=" ]; then exit 2; fi\nprintf "  987654320 1 Tue Sep 15 14:51:13 2026 /fixture/first\\n"');
  const before = { ...process.env }, a = focused.processTable();
  assert.equal(a.get(987654320).comm, "/fixture/first");
  assert.equal(a.get(987654320).started, "Tue Sep 15 14:51:13 2026");
  assert.equal(a.get(987654320).ticks, null);
  put('printf "  987654321 1 Tue Sep 15 14:51:13 2026 /fixture/second\\n"');
  const b = focused.processTable();
  assert.equal(b.has(987654320), false); assert.equal(b.get(987654321).comm, "/fixture/second");
  assert.deepEqual({ ...process.env }, before);
  for (const body of ["exit 3", "exit 0", 'printf "malformed\\n"']) { put(body); assert.equal(focused.processTable(), null); }
  process.env.PATH = ""; assert.equal(focused.processTable(), null);
});
