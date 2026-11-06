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
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";

import { bootIdentity } from "../scripts/capacity.mjs";
import { heavyJobLine, liveHeavyJobs } from "../scripts/heavy-jobs.mjs";
import { machineStateDir } from "../scripts/lib.mjs";
import { hostSlug, processTable, startTicks } from "../scripts/presence.mjs";
import { assertNoHeavyJob, createNativeEndpoint, createNativeModelInventoryEndpoint } from "../scripts/team-transport.mjs";
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
