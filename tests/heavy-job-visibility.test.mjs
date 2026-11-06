// waypost — a live heavy job is seen by the agents Waypost starts itself and
// named by `brief` and `status` (WP-18, story "Agents waypost starts itself
// see a live heavy job, and brief and status name it").
//
// Every child gets HOME (and the state-root variables) pointing at a temporary
// directory, so nothing here reads or writes the real slot table.
//
//   node --test tests/heavy-job-visibility.test.mjs

import "./host-home.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hostname, tmpdir } from "node:os";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";

import { bootIdentity } from "../scripts/capacity.mjs";
import { heavyJobLine, liveHeavyJobs, peersDir, readPeers, registerPeer } from "../scripts/heavy-jobs.mjs";
import * as capacityMod from "../scripts/capacity.mjs";
import * as presenceMod from "../scripts/presence.mjs";
import { acquireLock, releaseLock } from "../scripts/machine-lock.mjs";
import { claimSlot } from "../bin/cli/slots.mjs";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { existsSync, readdirSync, realpathSync } from "node:fs";
import { machineStateDir } from "../scripts/lib.mjs";
import { hostSlug, processTable, startTicks } from "../scripts/presence.mjs";
import { assertNoHeavyJob, createNativeEndpoint, createNativeModelInventoryEndpoint } from "../scripts/team-transport.mjs";
import { assertPeerTableWritable } from "../scripts/heavy-jobs.mjs";
import { chmodSync } from "node:fs";
import { brief } from "../scripts/brief.mjs";
import { ambientEnv } from "./env.mjs";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const WAYPOST = join(REPO, "bin", "waypost");
const GB = 1024 ** 3;
const HOST = hostname().split(".")[0];
const JOB = { id: "j1", command: "xcodebuild -scheme App", host: "mac", started_at: "2026-11-05T10:00:00.000Z" };

function tmpHome() { return mkdtempSync(join(tmpdir(), "waypost-heavy-vis-")); }
function env(home, extra = {}) {
  return {
    ...ambientEnv(), HOME: home, USERPROFILE: home, XDG_STATE_HOME: home, LOCALAPPDATA: home,
    WAYPOST_NO_BEAT: "1",
    WAYPOST_CAPACITY_PROBE: JSON.stringify({ cores: 8, busy: 0, available: 8 * GB, total: 16 * GB }),
    ...extra,
  };
}
function slotsDir(home) { return join(machineStateDir({ home }), `slots.${hostSlug()}`); }
function cli(args, e) { return spawnSync(process.execPath, [WAYPOST, ...args], { encoding: "utf8", env: e, cwd: e.HOME, timeout: 15000 }); }

// A live record for `pid` on this boot and host, written into home's slot table.
function writeLive(home, pid, extra = {}) {
  const table = process.platform === "win32" ? null : processTable();
  const row = table ? table.get(pid) : null;
  const rec = {
    id: `rec-${pid}`, host: HOST, boot: bootIdentity(), started_at: new Date().toISOString(),
    proc: { pid, started: row ? row.started : null, ticks: startTicks(pid), comm: basename(process.execPath) },
    command: "node -e job", ...extra,
  };
  mkdirSync(slotsDir(home), { recursive: true });
  writeFileSync(join(slotsDir(home), `${rec.id}.json`), JSON.stringify(rec), "utf8");
  return rec;
}
async function helper() {
  const h = spawn(process.execPath, ["-e", "setTimeout(()=>{}, 8000)"]);
  await new Promise((r) => setTimeout(r, 300)); // let it appear in the process table
  return h;
}

// ─── team: the peer factories refuse beside a live job ───────────────────

test("assertNoHeavyJob: a live job refuses and names it; none, or the go-ahead, passes", () => {
  assert.throws(() => assertNoHeavyJob({ heavyJobs: () => [JOB] }, {}), (e) => {
    assert.equal(e.code, "heavy-job-live");
    assert.match(e.message, /`xcodebuild -scheme App` on mac since 2026-11-05T10:00:00.000Z/);
    assert.match(e.message, /WAYPOST_BESIDE_HEAVY=1/);
    assert.deepEqual(e.heavy_jobs, [{ id: "j1", command: "xcodebuild -scheme App", host: "mac", since: JOB.started_at }]);
    return true;
  });
  assert.doesNotThrow(() => assertNoHeavyJob({ heavyJobs: () => [] }, {}));
  assert.doesNotThrow(() => assertNoHeavyJob({ heavyJobs: () => [JOB] }, { WAYPOST_BESIDE_HEAVY: "1" }));
});

test("assertNoHeavyJob: fetchImpl is a seam only for an already-running OpenCode server", () => {
  const fetchImpl = async () => { throw new Error("unused"); };
  assert.doesNotThrow(() => assertNoHeavyJob({ fetchImpl }, {}, { harness: "opencode" }));
  // A Codex or Claude peer still spawns for real; an injected fetch changes nothing there.
  // (Reads the real machine: only the no-throw path is asserted when nothing is live.)
  const live = liveHeavyJobs();
  if (live.length) assert.throws(() => assertNoHeavyJob({ fetchImpl }, {}, { harness: "codex" }), { code: "heavy-job-live" });
});

test("createNativeEndpoint and the inventory endpoint never spawn a peer beside a live job", async () => {
  let spawned = 0;
  const deps = { heavyJobs: () => [JOB], spawnProcess: () => { spawned++; throw new Error("must not spawn"); } };
  const d = { managed: true, harness: "codex", cwd: REPO, mode: "read-only" };
  await assert.rejects(createNativeEndpoint(d, deps), { code: "heavy-job-live" });
  await assert.rejects(createNativeEndpoint({ ...d, harness: "opencode", spawn_server: true }, deps), { code: "heavy-job-live" });
  await assert.rejects(createNativeModelInventoryEndpoint(d, deps), { code: "heavy-job-live" });
  assert.equal(spawned, 0);
});

test("without a live job the factories behave as before (the descriptor check still decides)", async () => {
  await assert.rejects(createNativeEndpoint({ harness: "claude" }, { heavyJobs: () => [] }), { code: "invalid-native-descriptor" });
});

test("heavyJobLine: a long command is cut, so the standing context stays small", () => {
  const line = heavyJobLine({ ...JOB, command: "node --test " + "tests/x.test.mjs ".repeat(200) });
  assert.ok(line.length < 160, line);
  assert.doesNotMatch(heavyJobLine({ ...JOB, command: "bash -c 'a\nb'" }), /\n/);
  assert.match(line, /^`node --test tests\/x\.test\.mjs .*…` on mac since /);
});

// ─── the reading: live holders minus the job we run inside ───────────────

test("liveHeavyJobs: a sibling's live slot is seen; our own slot is not, by id or by ancestry", async () => {
  const home = tmpHome();
  const h = await helper();
  try {
    assert.deepEqual(liveHeavyJobs({ home }), []);
    const sibling = writeLive(home, h.pid);
    assert.deepEqual(liveHeavyJobs({ home }).map((j) => j.id), [sibling.id]);
    assert.deepEqual(liveHeavyJobs({ home, env: { WAYPOST_HEAVY_SLOT: `x,${sibling.id}` } }), []);
    if (process.platform !== "win32") {
      // This test process holds a slot; the helper is its child, so for the
      // helper that slot is the job it runs inside.
      rmSync(join(slotsDir(home), `${sibling.id}.json`));
      const parent = writeLive(home, process.pid);
      assert.deepEqual(liveHeavyJobs({ home, pid: 1 }).map((j) => j.id), [parent.id]);
      assert.deepEqual(liveHeavyJobs({ home, pid: h.pid }), []);
      assert.deepEqual(liveHeavyJobs({ home }), [], "the process itself holds it");
    }
  } finally { h.kill(); rmSync(home, { recursive: true, force: true }); }
});

// ─── status and brief name it, and say nothing when there is none ────────

test("status: a live heavy job is one line naming command, host and since; none is no line", async () => {
  const home = tmpHome();
  const h = await helper();
  try {
    let r = cli(["status"], env(home));
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stdout, /^heavy /m);
    const rec = writeLive(home, h.pid, { command: "cargo build" });
    r = cli(["status"], env(home));
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, new RegExp(`^heavy   \`cargo build\` on ${HOST} since ${rec.started_at} — no agents beside it$`, "m"));
  } finally { h.kill(); rmSync(home, { recursive: true, force: true }); }
});

test("status inside `run --heavy` does not report the job it runs in", () => {
  const home = tmpHome();
  try {
    const r = cli(["run", "--heavy", "--", process.execPath, WAYPOST, "status"], env(home));
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^waypost /m);
    assert.doesNotMatch(r.stdout, /^heavy /m);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("brief: a live heavy job is a line and a fact; none adds neither", async () => {
  const vault = mkdtempSync(join(tmpdir(), "waypost-heavy-vault-"));
  try {
    const cfg = { vault_path: vault, layout: "engineering" };
    const quiet = await brief(cfg, { heavyJobs: () => [] });
    assert.doesNotMatch(quiet.text, /heavy job live/);
    assert.equal(quiet.facts.heavy_jobs, undefined);
    const loud = await brief(cfg, { heavyJobs: () => [JOB] });
    assert.match(loud.text, /^heavy job live: `xcodebuild -scheme App` on mac since 2026-11-05T10:00:00.000Z — no agents beside it \(waypost capacity\)$/m);
    assert.deepEqual(loud.facts.heavy_jobs, [{ id: "j1", command: "xcodebuild -scheme App", host: "mac", since: JOB.started_at }]);
  } finally { rmSync(vault, { recursive: true, force: true }); }
});

// ─── the other order: a heavy job started while team peers run ───────────
// (story "A heavy job started while waypost team peers run sees them and does
// not start beside them"). Peer records live beside the slot table.

function writePeer(home, pid, extra = {}) {
  const table = process.platform === "win32" ? null : processTable();
  const row = table ? table.get(pid) : null;
  const rec = {
    id: `peer-${pid}`, kind: "peer", host: HOST, boot: bootIdentity(), started_at: new Date().toISOString(),
    proc: { pid, started: row ? row.started : null, ticks: startTicks(pid), comm: null },
    harness: "codex", command: "codex app-server", ...extra,
  };
  const dir = peersDir({ home });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${rec.id}.json`), JSON.stringify(rec), "utf8");
  return rec;
}
const peerIds = (home) => readPeers({ home }).live.map((p) => p.id);

test("registerPeer: writes a live record, follows the job's pid, and release removes it", async () => {
  const home = tmpHome();
  const h = await helper();
  try {
    const reg = await registerPeer({ home, harness: "claude", command: "claude -p", heavyJobs: () => [] });
    assert.deepEqual(peerIds(home), [reg.id]);
    reg.setJob(h.pid);
    const [live] = readPeers({ home }).live;
    assert.equal(live.proc.pid, h.pid, "the record now names the peer itself");
    assert.equal(live.owner.pid, process.pid, "and keeps the waypost process as owner");
    reg.release(); reg.release();
    assert.deepEqual(readdirSync(peersDir({ home })), []);
  } finally { h.kill(); rmSync(home, { recursive: true, force: true }); }
});

test("registerPeer: refuses beside a live heavy job and writes nothing; the owner's go-ahead passes", async () => {
  const home = tmpHome();
  try {
    await assert.rejects(registerPeer({ home, env: {}, heavyJobs: () => [JOB] }), { code: "heavy-job-live" });
    assert.deepEqual(readdirSync(peersDir({ home })), []);
    const reg = await registerPeer({ home, env: { WAYPOST_BESIDE_HEAVY: "1" }, heavyJobs: () => [JOB] });
    assert.deepEqual(peerIds(home), [reg.id]);
    reg.release();
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("a peer start and a heavy claim exclude each other through the one slot lock", async () => {
  const home = tmpHome();
  const slots = join(machineStateDir({ home }), `slots.${hostSlug()}`);
  mkdirSync(slots, { recursive: true });
  const lock = await acquireLock(slots, presenceMod, capacityMod);
  try {
    // The claim keeps its immediate refusal; the registration waits, then fails closed.
    const claim = await claimSlot(slots, ["true"], capacityMod, presenceMod, null, { agents: true });
    assert.equal(claim.ok, false);
    assert.match(claim.reason, /slot lock is busy/);
    await assert.rejects(registerPeer({ home, heavyJobs: () => [], lockWaitMs: 300 }), { code: "peer-registration-failed" });
    assert.deepEqual(readdirSync(peersDir({ home })), []);
  } finally { releaseLock(lock); }
  // Lock free again: the registration sees a slot claimed meanwhile and refuses.
  const h = await helper();
  try {
    writeLive(home, h.pid, { command: "cargo build" });
    await assert.rejects(registerPeer({ home }), (e) => { assert.equal(e.code, "heavy-job-live"); assert.match(e.message, /cargo build/); return true; });
  } finally { h.kill(); rmSync(home, { recursive: true, force: true }); }
});

test("peer liveness: a peer that died on its own stops blocking while waypost lives", async () => {
  const home = tmpHome();
  const h = await helper();
  try {
    writePeer(home, h.pid, { owner: { pid: process.pid } });
    assert.deepEqual(peerIds(home), [`peer-${h.pid}`]);
    h.kill();
    await new Promise((r) => h.once("exit", r));
    assert.deepEqual(peerIds(home), []);
    assert.deepEqual(readPeers({ home }).stale.map((p) => p.id), [`peer-${h.pid}`]);
  } finally { h.kill(); rmSync(home, { recursive: true, force: true }); }
});

test("claimSlot: only a caller that asks (run --heavy) is refused by live peers; clean/size/setup are not", async () => {
  // claimSlot reads peers from the process's own HOME (host-home.mjs points it at a throwaway one).
  const home = process.env.HOME;
  const slots = join(machineStateDir({ home }), `slots.${hostSlug()}`);
  mkdirSync(slots, { recursive: true });
  const h = await helper();
  const peer = writePeer(home, h.pid);
  // claimSlot measures with process.env: a fixed machine, not the loaded real one.
  const probe = process.env.WAYPOST_CAPACITY_PROBE;
  process.env.WAYPOST_CAPACITY_PROBE = JSON.stringify({ cores: 8, busy: 0, available: 8 * GB, total: 16 * GB });
  try {
    const refused = await claimSlot(slots, ["true"], capacityMod, presenceMod, null, { agents: true });
    assert.equal(refused.ok, false);
    assert.equal(refused.code, "agents-live");
    assert.match(refused.reason, new RegExp(`codex peer pid ${h.pid} .*${peer.id}`));
    const plain = await claimSlot(slots, ["true"], capacityMod, presenceMod, null);
    assert.equal(plain.ok, true, plain.reason); plain.release();
    const beside = await claimSlot(slots, ["true"], capacityMod, presenceMod, null, { agents: true, beside: true });
    assert.equal(beside.ok, true, beside.reason); beside.release();
  } finally {
    if (probe === undefined) delete process.env.WAYPOST_CAPACITY_PROBE; else process.env.WAYPOST_CAPACITY_PROBE = probe;
    h.kill(); rmSync(peersDir({ home }), { recursive: true, force: true });
  }
});

test("run --heavy beside a live peer: exit 75, the command never runs, the peer and the way out are named", async () => {
  const home = tmpHome();
  const h = await helper();
  const marker = join(home, "ran");
  const touch = [process.execPath, "-e", `require("fs").writeFileSync(${JSON.stringify(marker)}, "x")`];
  try {
    const peer = writePeer(home, h.pid);
    let r = cli(["run", "--heavy", "--", ...touch], env(home));
    assert.equal(r.status, 75, r.stderr);
    assert.equal(existsSync(marker), false);
    assert.match(r.stderr, /agents live — codex peer pid \d+ `codex app-server` since .*peer-/);
    assert.match(r.stderr, /capacity --release <id> --force/);
    // The heavy-job go-ahead is inherited by every peer; it does not open this order.
    r = cli(["run", "--heavy", "--", ...touch], env(home, { WAYPOST_BESIDE_HEAVY: "1" }));
    assert.equal(r.status, 75, r.stderr);
    r = cli(["run", "--heavy", "--beside-agents", "--", ...touch], env(home));
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /starting beside live agents \(--beside-agents\) — codex peer pid \d+ `codex app-server`/);
    assert.equal(existsSync(marker), true);
    // capacity names it (text and JSON) and releases it with --force while live.
    r = cli(["capacity"], env(home));
    assert.match(r.stdout, /agents live \(waypost team\) — run --heavy refuses beside them:\n  codex peer pid/);
    const j = JSON.parse(cli(["capacity", "--json"], env(home)).stdout);
    assert.deepEqual(j.agents_live.map((p) => [p.id, p.pid]), [[peer.id, h.pid]]);
    assert.equal(cli(["capacity", "--release", peer.id], env(home)).status, 1);
    r = cli(["capacity", "--release", peer.id, "--force"], env(home));
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(peerIds(home), []);
    r = cli(["capacity", "--json"], env(home));
    assert.deepEqual(JSON.parse(r.stdout).agents_live, []);
    assert.doesNotMatch(cli(["capacity"], env(home)).stdout, /agents live/);
  } finally { h.kill(); rmSync(home, { recursive: true, force: true }); }
});

test("run --heavy --wait starts once the peer ends, not before; the claim prunes its record", async () => {
  const home = tmpHome();
  const short = spawn(process.execPath, ["-e", "setTimeout(()=>{}, 2500)"]);
  await new Promise((r) => setTimeout(r, 300));
  const marker = join(home, "ran");
  try {
    writePeer(home, short.pid);
    const started = Date.now();
    const child = spawn(process.execPath, [WAYPOST, "run", "--heavy", "--wait", "30s", "--", process.execPath, "-e",
      `require("fs").writeFileSync(${JSON.stringify(marker)}, String(Date.now()))`], { env: env(home), cwd: home });
    let ended = 0;
    short.once("exit", () => { ended = Date.now(); });
    const code = await new Promise((r) => child.once("exit", r));
    assert.equal(code, 0);
    assert.ok(ended > 0 && Number(readFileSync(marker, "utf8")) >= ended, "ran only after the peer ended");
    assert.ok(Date.now() - started < 20000);
    assert.deepEqual(readdirSync(peersDir({ home })), [], "the stale record was pruned");
  } finally { short.kill(); rmSync(home, { recursive: true, force: true }); }
});

// A fake peer process: no pid, so nothing ever signals a real process.
function childMock(handle, config) {
  const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.stdin = { write(s) { queueMicrotask(() => { const m = JSON.parse(s); if (m.method === "config/read") child.stdout.write(JSON.stringify(config ? { id: m.id, result: { config } } : { id: m.id, error: { code: -32601, message: "unavailable" } }) + "\n"); else handle(m, (x) => child.stdout.write(JSON.stringify(x) + "\n")); }); } };
  child.kill = () => { queueMicrotask(() => child.emit("close", 0)); return true; };
  return child;
}
function fakeRegistry() {
  const live = new Set(); let n = 0; const calls = [];
  return { live, calls, registerPeer: async (meta) => { const id = ++n; calls.push(meta); live.add(id); return { setJob() {}, release() { live.delete(id); } }; } };
}

test("transport: a Codex restart leaves exactly one live record, and the closed peer none", async () => {
  const cwd = realpathSync(tmpdir());
  const reg = fakeRegistry();
  const endpoint = await createNativeEndpoint({ harness: "codex", managed: true, cwd, reasoning: "low" }, {
    heavyJobs: () => [], registerPeer: reg.registerPeer,
    spawnProcess: () => childMock((m, emit) => {
      if (m.method === "initialize") emit({ id: m.id, result: {} });
      if (m.method === "thread/start") emit({ id: m.id, result: { thread: { id: "owned", sessionId: "owned", cwd, ephemeral: true, turns: [], forkedFromId: null }, model: "fixture", modelProvider: "fixture", reasoningEffort: "low", sandbox: { type: "readOnly", networkAccess: false } } });
      if (m.method === "mcpServerStatus/list") emit({ id: m.id, result: { data: [], nextCursor: null } });
      if (m.method === "app/installed") emit({ id: m.id, result: { apps: [] } });
    }, { mcp_servers: { fixture_server: { enabled: true, command: "never execute" } } }),
  });
  assert.equal(reg.calls.length, 2, "the restart registered again");
  assert.equal(reg.live.size, 1);
  assert.deepEqual(reg.calls.map((c) => c.harness), ["codex", "codex"]);
  await endpoint.stopAndWait();
  assert.equal(reg.live.size, 0);
});

test("transport: a spawn that throws releases its record; inventory and injected spawns register nothing", async () => {
  const cwd = realpathSync(tmpdir());
  const reg = fakeRegistry();
  await assert.rejects(createNativeEndpoint({ harness: "claude", managed: true, cwd }, {
    heavyJobs: () => [], registerPeer: reg.registerPeer, spawnProcess: () => { throw new Error("spawn failed"); } }), /spawn failed/);
  assert.equal(reg.calls.length, 1);
  assert.equal(reg.live.size, 0);
  // The metadata-only inventory endpoint is not a conversation peer (owner, 2026-11-06).
  const inv = fakeRegistry();
  await assert.rejects(createNativeModelInventoryEndpoint({ managed: true, harness: "claude", cwd }, {
    heavyJobs: () => [], registerPeer: inv.registerPeer, spawnProcess: () => { throw new Error("spawn failed"); } }));
  assert.equal(inv.calls.length, 0);
});

test("a registration waiting on the lock sees the slot its holder claimed, and refuses", async () => {
  const home = tmpHome();
  const slots = join(machineStateDir({ home }), `slots.${hostSlug()}`);
  mkdirSync(slots, { recursive: true });
  const h = await helper();
  const lock = await acquireLock(slots, presenceMod, capacityMod);
  try {
    const pending = registerPeer({ home, lockWaitMs: 8000 });
    await new Promise((r) => setTimeout(r, 600)); // it is waiting on the lock now
    writeLive(home, h.pid, { command: "cargo build" }); // what a claim writes under the lock
    releaseLock(lock);
    await assert.rejects(pending, (e) => { assert.equal(e.code, "heavy-job-live"); assert.match(e.message, /cargo build/); return true; });
    assert.deepEqual(readdirSync(peersDir({ home })), []);
  } finally { releaseLock(lock); h.kill(); rmSync(home, { recursive: true, force: true }); }
});

test("an unwritable peer table fails closed: in the pre-check, and at registration with nothing written", { skip: process.platform === "win32" || process.getuid?.() === 0 }, async () => {
  const home = tmpHome();
  const dir = peersDir({ home });
  mkdirSync(dir, { recursive: true });
  chmodSync(dir, 0o555);
  try {
    assert.throws(() => assertPeerTableWritable({ home }), { code: "peer-registration-failed" });
    await assert.rejects(registerPeer({ home, heavyJobs: () => [] }), { code: "peer-registration-failed" });
    assert.deepEqual(readdirSync(dir), []);
  } finally { chmodSync(dir, 0o755); rmSync(home, { recursive: true, force: true }); }
});
