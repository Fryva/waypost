import "./host-home.mjs";
import "./env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync, chmodSync, mkdirSync } from "node:fs";
import * as hostMod from "../scripts/presence-host.mjs";
import { leftoversOf } from "../bin/cli/deleter.mjs";
import { sharedTree } from "../scripts/presence-checkout.mjs";
import { join } from "node:path";
import { tmpdir, hostname } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { leaseRunEnd } from "../scripts/presence-lease-groups.mjs";

const HOST_MODULE = fileURLToPath(new URL("../scripts/presence-host.mjs", import.meta.url));
const short = hostname().split(".")[0];

function home(t) {
  const h = mkdtempSync(join(tmpdir(), "wp-host-id-"));
  t.after(() => { try { chmodSync(h, 0o700); } catch {} rmSync(h, { recursive: true, force: true }); });
  return h;
}
// A fresh process per call: hostId() is memoized per process.
function run(h, code) {
  const r = spawnSync(process.execPath, ["--input-type=module", "-e",
    `import * as m from ${JSON.stringify(HOST_MODULE)}; ${code}`], { encoding: "utf8", env: { ...process.env, HOME: h, USERPROFILE: h } });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}
const stateFiles = (h) => readdirSync(join(h, ".local", "state", "waypost")).filter((n) => n.startsWith("host-id."));

test("hostId: minted once, stable across calls and processes", (t) => {
  const h = home(t);
  const [a, again] = run(h, "console.log(JSON.stringify([m.hostId(), m.hostId()]))");
  assert.match(a, /^(?:[0-9a-f]{32}|r-[0-9a-f-]{36})$/);
  assert.equal(again, a);
  assert.equal(run(h, "console.log(JSON.stringify(m.hostId()))"), a);
  assert.equal(stateFiles(h).length, 1);
  assert.equal(readFileSync(join(h, ".local", "state", "waypost", stateFiles(h)[0]), "utf8").trim(), a);
});

// Two accounts of one machine (two HOMEs) must agree on the host: it decides
// "never reaped while its process runs here". Needs an OS machine id.
test("hostId: two HOMEs on one machine share one id when the OS gives a machine id", (t) => {
  const a = run(home(t), "console.log(JSON.stringify(m.hostId()))");
  const b = run(home(t), "console.log(JSON.stringify(m.hostId()))");
  if (/^r-/.test(a)) return t.skip("no OS machine id available on this host");
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.equal(a, b);
});

test("hostId: an empty or broken cache file is replaced, a random id is upgraded", (t) => {
  const h = home(t);
  const dir = join(h, ".local", "state", "waypost");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `host-id.${short.replace(/[^\w.-]+/g, "_")}`);
  writeFileSync(file, "");
  const a = run(h, "console.log(JSON.stringify(m.hostId()))");
  assert.match(a, /^(?:[0-9a-f]{32}|r-[0-9a-f-]{36})$/);
  assert.equal(readFileSync(file, "utf8").trim(), a);
  assert.deepEqual(readdirSync(dir).filter((n) => n.startsWith("host-id.")), [file.slice(dir.length + 1)]);
  writeFileSync(file, "garbage");
  assert.equal(run(h, "console.log(JSON.stringify(m.hostId()))"), a.startsWith("r-") ? readFileSync(file, "utf8").trim() : a);
});

test("hostId: an unusable state directory gives null and sameHost falls back to the name", (t) => {
  const h = home(t);
  // A file where the "state" directory must be: mkdir fails on every platform.
  mkdirSync(join(h, ".local"));
  writeFileSync(join(h, ".local", "state"), "not a directory");
  const out = run(h, `const s = ${JSON.stringify(short)}; console.log(JSON.stringify([m.hostId(), m.sameHost({ host: s }), m.sameHost({ host: s, host_id: "x" }), m.sameHost({ host: "other" })]))`);
  assert.deepEqual(out, [null, true, true, false]);
});

test("sameHost: ids decide when both sides have one; names only for legacy records", (t) => {
  const h = home(t);
  const id = run(h, "console.log(JSON.stringify(m.hostId()))");
  const out = run(h, `const s = ${JSON.stringify(short)}; console.log(JSON.stringify([
    m.sameHost({ host: s, host_id: ${JSON.stringify(id)} }),
    m.sameHost({ host: s, host_id: "another-machine-same-name" }),
    m.sameHost({ host: "renamed", host_id: ${JSON.stringify(id)} }),
    m.sameHost({ host: s }),
    m.sameHost({ host: "other" }),
    m.sameHost(null)]))`);
  assert.deepEqual(out, [true, false, true, true, false, false]);
});

test("processGone: a same-named foreign machine's live record is not ours to judge", (t) => {
  const h = home(t);
  const id = run(h, "console.log(JSON.stringify(m.hostId()))");
  const out = run(h, `const { processGone } = await import(${JSON.stringify(HOST_MODULE.replace("presence-host", "presence-process"))});
    const s = ${JSON.stringify(short)}, table = new Map();
    const proc = { pid: 999999, started: "x", ticks: 1 };
    console.log(JSON.stringify([
      processGone({ host: s, host_id: "foreign", proc }, table),
      processGone({ host: s, host_id: ${JSON.stringify(id)}, proc }, table),
      processGone({ host: s, proc }, table)]))`);
  assert.deepEqual(out, [null, true, true]);
});

test("leaseRunEnd: groups adjacent same-owner single-line rows only", () => {
  const r = (path, session = "s", host = "h", harness = "c") => ({ path, session, host, harness });
  const rows = [r("a"), r("b"), r("c", "t"), r("d\nx", "t"), r("e", "t"), r("f", "t", "h", null)];
  assert.equal(leaseRunEnd(rows, 0), 2);
  assert.equal(leaseRunEnd(rows, 2), 3);
  assert.equal(leaseRunEnd(rows, 3), 4);
  assert.equal(leaseRunEnd(rows, 4), 5);
  assert.equal(leaseRunEnd(rows, 5), 6);
});

test("sharedTree: a same-named foreign machine with the same root is a shared checkout", (t) => {
  const root = mkdtempSync(join(tmpdir(), "wp-host-shared-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const old = process.env.WAYPOST_PROJECT_DIR; process.env.WAYPOST_PROJECT_DIR = root;
  t.after(() => { if (old === undefined) delete process.env.WAYPOST_PROJECT_DIR; else process.env.WAYPOST_PROJECT_DIR = old; });
  const peer = (host_id) => ({ session: "p", live: true, self: false, host: short, host_id, harness: "codex", os: "x", project_root: root, common_dir: null });
  const vault = join(root, "vault");
  assert.equal(sharedTree(vault, { view: { peers: [peer("another-machine")] } }).shared, true);
  assert.equal(sharedTree(vault, { view: { peers: [peer(hostMod.hostId())] } }).shared, false);
});

test("deleter leftoversOf: a marker from a same-named foreign machine is left, ours is adopted when dead", (t) => {
  const common = mkdtempSync(join(tmpdir(), "wp-host-deleter-"));
  t.after(() => rmSync(common, { recursive: true, force: true }));
  const dir = join(common, "waypost-removing");
  mkdirSync(dir);
  for (const [name, host_id] of [["foreign", "another-machine"], ["ours", hostMod.hostId()]]) {
    mkdirSync(join(dir, name));
    writeFileSync(join(dir, `${name}.json`), JSON.stringify({ host: short, host_id, proc: { pid: 1 } }));
  }
  const capacity = { bootIdentity: () => null, authorityOnce: () => null, slotLive: () => false };
  const r = leftoversOf(common, capacity, { processTable: () => new Map() });
  assert.deepEqual(r.leave.map((x) => x.name), ["foreign"]);
  assert.deepEqual(r.adopt.map((x) => x.name), ["ours"]);
});
