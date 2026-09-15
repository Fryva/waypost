// waypost — tests for the machine-wide slot table (WP-18, Decision 2 of the
// heavy-work-sized-to-the-machine ADR): scripts/capacity.mjs's bootIdentity,
// slotLive, readHolders, and `waypost run --heavy` / `waypost capacity
// --release` in bin/waypost.
//
// Every child process in this file gets HOME, XDG_STATE_HOME and
// LOCALAPPDATA pointing at a temporary directory (so machineStateDir() never
// touches the real machine state directory) and an idle WAYPOST_CAPACITY_PROBE
// unless a test needs otherwise. The pure functions (bootIdentity, sameBoot,
// slotLive) take every OS probe as a parameter, so the win32 cases never
// spawn anything real.
//
//   node --test tests/slots.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, spawn } from "node:child_process";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { hostname, tmpdir } from "node:os";
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, utimesSync,
} from "node:fs";

import { bootIdentity, sameBoot, slotLive, readHolders, measure } from "../scripts/capacity.mjs";
import { machineStateDir } from "../scripts/lib.mjs";
import { hostSlug, processTable } from "../scripts/presence.mjs";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const Waypost = join(REPO, "bin", "waypost");
const GB = 1024 ** 3;
const MY_HOST = hostname().split(".")[0];

// ─── helpers ────────────────────────────────────────────────────────────

function tmpHome() {
  return mkdtempSync(join(tmpdir(), "waypost-slots-"));
}

function heavyEnv(home, extra = {}) {
  return {
    ...process.env,
    HOME: home,
    XDG_STATE_HOME: home,
    LOCALAPPDATA: home,
    WAYPOST_NO_BEAT: "1",
    WAYPOST_CAPACITY_PROBE: JSON.stringify({ cores: 8, busy: 0, available: 8 * GB, total: 16 * GB }),
    ...extra,
  };
}

function slotsDirFor(home) {
  return join(
    machineStateDir({ platform: process.platform, home, env: { XDG_STATE_HOME: home, LOCALAPPDATA: home } }),
    `slots.${hostSlug()}`,
  );
}

function runCli(args, env) {
  return spawnSync(process.execPath, [Waypost, ...args], { encoding: "utf8", env, timeout: 15000 });
}

// A record naming THIS test process — genuinely alive, on this boot, on this
// host — the cheapest way to manufacture a real "live holder" for the CLI
// tests below without spawning a second process.
function selfRecord(id, extra = {}) {
  const table = process.platform === "win32" ? null : processTable();
  const self = table ? table.get(process.pid) : null;
  return {
    id,
    host: MY_HOST,
    proc: { pid: process.pid, started: self ? self.started : null, comm: basename(process.execPath) },
    boot: bootIdentity(),
    session: "slots-test",
    harness: "test",
    command: "node -e test",
    started_at: new Date().toISOString(),
    ...extra,
  };
}

function writeRecord(dir, rec) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${rec.id}.json`), JSON.stringify(rec, null, 2) + "\n", "utf8");
}

const SAME_BOOT = { kind: "boot_id", value: "here" };
const OTHER_BOOT = { kind: "boot_id", value: "elsewhere" };

// ─── hostSlug (exported for the slot directory name) ──────────────────────

test("hostSlug: exported, a stable non-empty string", () => {
  assert.equal(typeof hostSlug(), "string");
  assert.ok(hostSlug().length > 0);
  assert.equal(hostSlug(), hostSlug());
});

// ─── bootIdentity ──────────────────────────────────────────────────────────

test("bootIdentity: linux reads /proc/sys/kernel/random/boot_id", () => {
  const id = bootIdentity({ platform: "linux", readFile: (p) => (p === "/proc/sys/kernel/random/boot_id" ? "abc-123\n" : null) });
  assert.deepEqual(id, { kind: "boot_id", value: "abc-123" });
});

test("bootIdentity: darwin reads the sec of kern.boottime", () => {
  const id = bootIdentity({
    platform: "darwin",
    run: (cmd) => (cmd === "sysctl" ? "{ sec = 1700000000, usec = 123456 } Mon Jan  1 00:00:00 2024\n" : null),
  });
  assert.deepEqual(id, { kind: "kern.boottime", value: 1700000000 });
});

test("bootIdentity: other platforms fall back to round(now - uptime), tolerance recorded by kind", () => {
  const os = { uptime: () => 500 };
  const id = bootIdentity({ platform: "win32", os, now: 1_000_000 * 1000 });
  assert.deepEqual(id, { kind: "epoch", value: 1_000_000 - 500 });
});

test("bootIdentity: linux falls back to epoch when boot_id is unreadable", () => {
  const id = bootIdentity({ platform: "linux", readFile: () => null, os: { uptime: () => 10 }, now: 100_000 });
  assert.equal(id.kind, "epoch");
});

test("bootIdentity: darwin falls back to epoch when sysctl fails", () => {
  const id = bootIdentity({ platform: "darwin", run: () => null, os: { uptime: () => 10 }, now: 100_000 });
  assert.equal(id.kind, "epoch");
});

test("sameBoot: exact match for a real identifier, a 120s tolerance for the epoch fallback", () => {
  assert.equal(sameBoot({ kind: "boot_id", value: "a" }, { kind: "boot_id", value: "a" }), true);
  assert.equal(sameBoot({ kind: "boot_id", value: "a" }, { kind: "boot_id", value: "b" }), false);
  assert.equal(sameBoot({ kind: "kern.boottime", value: 100 }, { kind: "kern.boottime", value: 101 }), false);
  assert.equal(sameBoot({ kind: "epoch", value: 100 }, { kind: "epoch", value: 220 }), true, "within 120s");
  assert.equal(sameBoot({ kind: "epoch", value: 100 }, { kind: "epoch", value: 221 }), false, "past 120s");
  assert.equal(sameBoot({ kind: "epoch", value: 1 }, { kind: "boot_id", value: "1" }), false, "different kinds never match");
  assert.equal(sameBoot(null, { kind: "epoch", value: 1 }), false);
});

// ─── slotLive: POSIX ───────────────────────────────────────────────────────

test("slotLive: a record from another boot is stale, even with a live process", () => {
  const table = new Map([[123, { pid: 123, ppid: 1, started: "S", comm: "node" }]]);
  const rec = { host: MY_HOST, proc: { pid: 123, started: "S" }, boot: OTHER_BOOT };
  assert.equal(slotLive(rec, { table, platform: "linux", bootNow: SAME_BOOT }), false);
});

test("slotLive: POSIX, the pid is absent from the process table -> stale", () => {
  const rec = { host: MY_HOST, proc: { pid: 999999, started: "S" }, boot: SAME_BOOT };
  assert.equal(slotLive(rec, { table: new Map(), platform: "linux", bootNow: SAME_BOOT }), false);
});

test("slotLive: POSIX, a reused pid with another start time is not the holder -> stale", () => {
  const rec = { host: MY_HOST, proc: { pid: 42, started: "old-time" }, boot: SAME_BOOT };
  const table = new Map([[42, { pid: 42, ppid: 1, started: "new-time", comm: "node" }]]);
  assert.equal(slotLive(rec, { table, platform: "linux", bootNow: SAME_BOOT }), false);
});

test("slotLive: POSIX, matching pid and start time -> live", () => {
  const rec = { host: MY_HOST, proc: { pid: 42, started: "T" }, boot: SAME_BOOT };
  const table = new Map([[42, { pid: 42, ppid: 1, started: "T", comm: "node" }]]);
  assert.equal(slotLive(rec, { table, platform: "linux", bootNow: SAME_BOOT }), true);
});

test("slotLive: POSIX, an undecidable process table (none available) falls to a signal-0 probe", () => {
  const rec = { host: MY_HOST, proc: { pid: 42, started: "T" }, boot: SAME_BOOT };
  assert.equal(slotLive(rec, { table: null, platform: "linux", bootNow: SAME_BOOT, kill: () => true }), true);
  assert.equal(slotLive(rec, { table: null, platform: "linux", bootNow: SAME_BOOT, kill: () => false }), false);
});

// ─── slotLive: win32 (every case injected — nothing real spawns) ──────────

test("slotLive: win32, signal-0 finds nothing -> stale", () => {
  const rec = { host: "h", proc: { pid: 1, comm: "node.exe" }, boot: SAME_BOOT, started_at: new Date().toISOString() };
  assert.equal(slotLive(rec, { platform: "win32", bootNow: SAME_BOOT, kill: () => false, tasklist: () => "node.exe" }), false);
});

test("slotLive: win32, tasklist reports a different image name -> stale", () => {
  const rec = { host: "h", proc: { pid: 1, comm: "node.exe" }, boot: SAME_BOOT, started_at: new Date().toISOString() };
  assert.equal(slotLive(rec, { platform: "win32", bootNow: SAME_BOOT, kill: () => true, tasklist: () => "notepad.exe" }), false);
});

test("slotLive: win32, a failing tasklist falls back to signal-0 and the 24h cap alone", () => {
  const rec = { host: "h", proc: { pid: 1, comm: "node.exe" }, boot: SAME_BOOT, started_at: new Date().toISOString() };
  assert.equal(slotLive(rec, { platform: "win32", bootNow: SAME_BOOT, kill: () => true, tasklist: () => null }), true);
  assert.equal(slotLive(rec, { platform: "win32", bootNow: SAME_BOOT, kill: () => false, tasklist: () => null }), false);
});

test("slotLive: win32, a record older than 24 hours is stale even when alive and matching", () => {
  const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  const rec = { host: "h", proc: { pid: 1, comm: "node.exe" }, boot: SAME_BOOT, started_at: old };
  assert.equal(slotLive(rec, { platform: "win32", bootNow: SAME_BOOT, kill: () => true, tasklist: () => "node.exe" }), false);
});

test("slotLive: win32, alive, matching image, under 24h -> live", () => {
  const rec = { host: "h", proc: { pid: 1, comm: "node.exe" }, boot: SAME_BOOT, started_at: new Date().toISOString() };
  assert.equal(slotLive(rec, { platform: "win32", bootNow: SAME_BOOT, kill: () => true, tasklist: () => "node.exe" }), true);
});

// ─── readHolders ────────────────────────────────────────────────────────────

test("readHolders: partitions live/stale, skips .lock and non-json entries", () => {
  const dir = mkdtempSync(join(tmpdir(), "waypost-holders-"));
  mkdirSync(join(dir, ".lock"));
  writeFileSync(join(dir, "notes.txt"), "hello", "utf8");
  writeFileSync(join(dir, "live.json"), JSON.stringify({ id: "live", host: MY_HOST, proc: { pid: 1, started: "T" }, boot: SAME_BOOT }), "utf8");
  writeFileSync(join(dir, "stale.json"), JSON.stringify({ id: "stale", host: MY_HOST, proc: { pid: 2, started: "T" }, boot: OTHER_BOOT }), "utf8");
  const table = new Map([[1, { pid: 1, ppid: 1, started: "T", comm: "node" }]]);
  const { live, stale } = readHolders({ dir, table, platform: "linux", bootNow: SAME_BOOT });
  assert.deepEqual(live.map((r) => r.id), ["live"]);
  assert.deepEqual(stale.map((r) => r.id), ["stale"]);
  rmSync(dir, { recursive: true, force: true });
});

test("readHolders: a missing directory yields empty live and stale, no throw", () => {
  const { live, stale } = readHolders({ dir: join(tmpdir(), "waypost-holders-does-not-exist-xyz") });
  assert.deepEqual(live, []);
  assert.deepEqual(stale, []);
});

// ─── measure({ holders }) and WAYPOST_CAPACITY_PROBE ─────────────────────

test("measure: WAYPOST_CAPACITY_PROBE replaces the machine probes, and holders counts the array given", async () => {
  const env = { WAYPOST_CAPACITY_PROBE: JSON.stringify({ cores: 8, busy: 0, available: 8 * GB, total: 16 * GB }) };
  const r = await measure({ env, holders: [{ id: "a" }, { id: "b" }] });
  assert.equal(r.cores, 8);
  assert.equal(r.busy, 0);
  assert.deepEqual(r.memory, { available: 8 * GB, total: 16 * GB });
  assert.deepEqual(r.probes, { cores: "WAYPOST_CAPACITY_PROBE", busy: "WAYPOST_CAPACITY_PROBE", memory: "WAYPOST_CAPACITY_PROBE" });
  assert.equal(r.holders, 2);
  assert.equal(r.slots, 2); // 8 cores / 4
  assert.equal(r.can_start, 0); // 2 slots - 2 holders
});

test("measure: malformed WAYPOST_CAPACITY_PROBE is ignored, falling back to the real probes", async () => {
  const r = await measure({ env: { WAYPOST_CAPACITY_PROBE: "not json" }, holders: [] });
  assert.notEqual(r.probes.cores, "WAYPOST_CAPACITY_PROBE");
  assert.equal(typeof r.cores, "number");
});

// ─── refusal: exit 75, the reason, the retry command ──────────────────────

test("run --heavy: refused at once when the only slot is already held", () => {
  const home = tmpHome();
  try {
    writeRecord(slotsDirFor(home), selfRecord("holder-1"));
    const start = Date.now();
    const r = runCli(["run", "--heavy", "--", "node", "-e", "1"], heavyEnv(home, { WAYPOST_HEAVY_MAX: "1" }));
    const elapsed = Date.now() - start;
    assert.equal(r.status, 75);
    assert.match(r.stderr, /refused — slots: 1 of 1/);
    assert.match(r.stderr, /retry: waypost run --heavy -- node -e 1/);
    assert.ok(elapsed < 2000, `refusal took ${elapsed}ms`);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("run --heavy: the retry line quotes an argument that is not plain, so it pastes back", () => {
  const home = tmpHome();
  try {
    writeRecord(slotsDirFor(home), selfRecord("holder-1"));
    const r = runCli(["run", "--heavy", "--", "node", "-e", "setTimeout(() => {}, 1)"], heavyEnv(home, { WAYPOST_HEAVY_MAX: "1" }));
    assert.equal(r.status, 75);
    const quoted = process.platform === "win32" ? '"setTimeout(() => {}, 1)"' : "'setTimeout(() => {}, 1)'";
    assert.ok(r.stderr.includes(`retry: waypost run --heavy -- node -e ${quoted}`), r.stderr);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("run --heavy --wait 2s: retries until the deadline, then gives up", () => {
  const home = tmpHome();
  try {
    writeRecord(slotsDirFor(home), selfRecord("holder-1"));
    const start = Date.now();
    const r = runCli(["run", "--heavy", "--wait", "2s", "--", "node", "-e", "1"], heavyEnv(home, { WAYPOST_HEAVY_MAX: "1" }));
    const elapsed = Date.now() - start;
    assert.equal(r.status, 75);
    assert.match(r.stderr, /refused —/);
    assert.ok(elapsed >= 1900 && elapsed < 6000, `expected ~2s, took ${elapsed}ms`);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

// ─── the command runs: exit codes, priority, cleanup ──────────────────────

test("run --heavy: the exit code passes through, including a crash", () => {
  const home = tmpHome();
  try {
    const ok = runCli(["run", "--heavy", "--", "node", "-e", "process.exit(0)"], heavyEnv(home));
    assert.equal(ok.status, 0);
    const crash = runCli(["run", "--heavy", "--", "node", "-e", "process.exit(3)"], heavyEnv(home));
    assert.equal(crash.status, 3);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("run --heavy: a signal exits 128 + the signal number", () => {
  const home = tmpHome();
  try {
    const r = runCli(["run", "--heavy", "--", "node", "-e", "process.kill(process.pid, 'SIGTERM')"], heavyEnv(home));
    assert.equal(r.status, 128 + 15);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("run --heavy: runs at lowered priority — the child reads back 10 on POSIX", { skip: process.platform === "win32" }, () => {
  const home = tmpHome();
  try {
    const r = runCli(["run", "--heavy", "--", "node", "-e", "console.log(require('os').getPriority())"], heavyEnv(home));
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), "10");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("run --heavy: an interrupt reaches the command, which exits on its own terms, and the slot is released", { skip: process.platform === "win32" }, async () => {
  const home = tmpHome();
  try {
    const script = "process.on('SIGINT', () => { console.log('child got SIGINT'); process.exit(0); }); console.log('ready'); setTimeout(() => {}, 10000);";
    const parent = spawn(process.execPath, [Waypost, "run", "--heavy", "--", "node", "-e", script], {
      env: heavyEnv(home), stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    const exited = new Promise((r) => parent.on("exit", (code, signal) => r({ code, signal })));
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`no ready line: ${out}`)), 8000);
      parent.stdout.on("data", (d) => { out += d; if (out.includes("ready")) { clearTimeout(t); resolve(); } });
    });
    parent.kill("SIGINT");
    const { code, signal } = await exited;
    assert.match(out, /child got SIGINT/);
    assert.equal(signal, null, "waypost must not die of the interrupt itself");
    assert.equal(code, 0);
    const dir = slotsDirFor(home);
    const remaining = existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith(".json")) : [];
    assert.deepEqual(remaining, []);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("run --heavy: releases its own record on exit, leaving the slot table empty", () => {
  const home = tmpHome();
  try {
    const r = runCli(["run", "--heavy", "--", "node", "-e", "1"], heavyEnv(home));
    assert.equal(r.status, 0, r.stderr);
    const dir = slotsDirFor(home);
    const remaining = existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith(".json")) : [];
    assert.deepEqual(remaining, []);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

// Regression (found while wiring `npm test` through this command, WP-18
// Decision 4): the command is arbitrary and may itself invoke `waypost` —
// this project's own suite does — so it must not silently inherit the
// WAYPOST_SESSION_ID/WAYPOST_HARNESS this wrapper process invents for its
// OWN heartbeat/commit labelling when the caller never set them. Left
// leaking through, a nested `waypost sessions --touch --id X` sees an
// already-set WAYPOST_SESSION_ID and skips deriving its own from --id,
// producing two presence records where one was expected — exactly what
// broke tests/presence.test.mjs's traversal-id test under `npm test` before
// this fix. An identity the caller DID set explicitly still reaches the
// command, unchanged.
test("run --heavy: an invented session/harness identity and harness process are not leaked to the command, but an explicit identity is", () => {
  const home = tmpHome();
  try {
    // Strip whatever the ambient environment running THIS test suite already
    // carries, so "the caller never set these" holds regardless of how the
    // test itself was launched.
    const { WAYPOST_SESSION_ID: _sid, WAYPOST_HARNESS: _h, WAYPOST_PROC: _p, ...bare } = heavyEnv(home);
    const invented = runCli(
      ["run", "--heavy", "--", "node", "-e",
        "console.log(JSON.stringify([process.env.WAYPOST_SESSION_ID, process.env.WAYPOST_HARNESS, process.env.WAYPOST_PROC]))"],
      bare,
    );
    assert.equal(invented.status, 0, invented.stderr);
    assert.deepEqual(JSON.parse(invented.stdout), [null, null, null], "JSON.stringify turns an absent env var into null");
  } finally { rmSync(home, { recursive: true, force: true }); }

  const home2 = tmpHome();
  try {
    const explicit = runCli(
      ["run", "--heavy", "--", "node", "-e", "console.log(process.env.WAYPOST_SESSION_ID)"],
      heavyEnv(home2, { WAYPOST_SESSION_ID: "caller-chosen-id" }),
    );
    assert.equal(explicit.status, 0, explicit.stderr);
    assert.equal(explicit.stdout.trim(), "caller-chosen-id");
  } finally { rmSync(home2, { recursive: true, force: true }); }
});

// ─── the lock ───────────────────────────────────────────────────────────

test("the lock: a dead owner is broken at once", () => {
  const home = tmpHome();
  try {
    const dir = slotsDirFor(home);
    mkdirSync(dir, { recursive: true });
    const lockDir = join(dir, ".lock");
    mkdirSync(lockDir);
    writeFileSync(join(lockDir, "owner.json"), JSON.stringify({ pid: 4194999, started: "Thu Sep 3 00:00:00 2026" }), "utf8");
    const r = runCli(["run", "--heavy", "--", "node", "-e", "1"], heavyEnv(home));
    assert.equal(r.status, 0, r.stderr);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("the lock: a live owner is kept — a refused claim never starts the command", async () => {
  const home = tmpHome();
  const helper = spawn(process.execPath, ["-e", "setTimeout(()=>{}, 4000)"]);
  try {
    const dir = slotsDirFor(home);
    mkdirSync(dir, { recursive: true });
    await new Promise((r) => setTimeout(r, 300)); // let the helper appear in the process table
    const table = process.platform === "win32" ? null : processTable();
    const started = table && table.get(helper.pid) ? table.get(helper.pid).started : null;
    const lockDir = join(dir, ".lock");
    mkdirSync(lockDir);
    writeFileSync(join(lockDir, "owner.json"), JSON.stringify({ pid: helper.pid, started }), "utf8");

    const marker = join(home, "marker");
    const r = runCli(["run", "--heavy", "--", "node", "-e", `require('fs').writeFileSync(${JSON.stringify(marker)}, 'x')`], heavyEnv(home));
    assert.equal(r.status, 75);
    assert.match(r.stderr, /lock is busy/);
    assert.equal(existsSync(marker), false, "the command must never start without a slot");
  } finally {
    helper.kill();
    rmSync(home, { recursive: true, force: true });
  }
});

test("the lock: older than five minutes is broken even with a live owner", async () => {
  const home = tmpHome();
  const helper = spawn(process.execPath, ["-e", "setTimeout(()=>{}, 4000)"]);
  try {
    const dir = slotsDirFor(home);
    mkdirSync(dir, { recursive: true });
    await new Promise((r) => setTimeout(r, 300));
    const table = process.platform === "win32" ? null : processTable();
    const started = table && table.get(helper.pid) ? table.get(helper.pid).started : null;
    const lockDir = join(dir, ".lock");
    mkdirSync(lockDir);
    writeFileSync(join(lockDir, "owner.json"), JSON.stringify({ pid: helper.pid, started }), "utf8");
    const old = new Date(Date.now() - 6 * 60 * 1000);
    utimesSync(lockDir, old, old);

    const r = runCli(["run", "--heavy", "--", "node", "-e", "1"], heavyEnv(home));
    assert.equal(r.status, 0, r.stderr);
  } finally {
    helper.kill();
    rmSync(home, { recursive: true, force: true });
  }
});

test("the lock: an owner from another boot is broken at once, even when its pid is alive", async () => {
  const home = tmpHome();
  const helper = spawn(process.execPath, ["-e", "setTimeout(()=>{}, 4000)"]);
  try {
    const dir = slotsDirFor(home);
    mkdirSync(dir, { recursive: true });
    await new Promise((r) => setTimeout(r, 300));
    const table = process.platform === "win32" ? null : processTable();
    const started = table && table.get(helper.pid) ? table.get(helper.pid).started : null;
    const lockDir = join(dir, ".lock");
    mkdirSync(lockDir);
    writeFileSync(join(lockDir, "owner.json"), JSON.stringify({ pid: helper.pid, started, boot: OTHER_BOOT }), "utf8");

    const r = runCli(["run", "--heavy", "--", "node", "-e", "1"], heavyEnv(home));
    assert.equal(r.status, 0, r.stderr);
  } finally {
    helper.kill();
    rmSync(home, { recursive: true, force: true });
  }
});

test("capacity: WAYPOST_CAPACITY_PROBE is announced on stderr whenever it is honoured", () => {
  const home = tmpHome();
  try {
    const r = runCli(["capacity"], heavyEnv(home));
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /WAYPOST_CAPACITY_PROBE is set/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

// ─── capacity --release ────────────────────────────────────────────────

test("capacity --release: refuses a live-looking record without --force, releases with --force", () => {
  const home = tmpHome();
  try {
    const dir = slotsDirFor(home);
    const rec = selfRecord("holder-live");
    writeRecord(dir, rec);

    const refused = runCli(["capacity", "--release", rec.id], heavyEnv(home));
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /still looks alive/);
    assert.equal(existsSync(join(dir, `${rec.id}.json`)), true, "refused: the record must still be there");

    const forced = runCli(["capacity", "--release", rec.id, "--force"], heavyEnv(home));
    assert.equal(forced.status, 0, forced.stderr);
    assert.match(forced.stdout, /released/);
    assert.equal(existsSync(join(dir, `${rec.id}.json`)), false);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("capacity --release: a stale record (another boot) releases without --force", () => {
  const home = tmpHome();
  try {
    const dir = slotsDirFor(home);
    const rec = selfRecord("holder-stale", { boot: OTHER_BOOT });
    writeRecord(dir, rec);
    const r = runCli(["capacity", "--release", rec.id], heavyEnv(home));
    assert.equal(r.status, 0, r.stderr);
    assert.equal(existsSync(join(dir, `${rec.id}.json`)), false);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("capacity --release: an id with a path in it is refused, and nothing outside the slot directory is touched", () => {
  const home = tmpHome();
  try {
    const dir = slotsDirFor(home);
    mkdirSync(dir, { recursive: true });
    const outside = join(dir, "..", "victim.json");
    writeFileSync(outside, "{}\n", "utf8");
    for (const bad of ["../victim", "a/b", "x.y"]) {
      const r = runCli(["capacity", "--release", bad, "--force"], heavyEnv(home));
      assert.notEqual(r.status, 0, bad);
      assert.match(r.stderr, /is not a slot id/, bad);
    }
    assert.equal(existsSync(outside), true, "the file outside the slot directory must survive");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("capacity --release: a file whose own id does not match is not a slot record", () => {
  const home = tmpHome();
  try {
    const dir = slotsDirFor(home);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "other-id.json"), JSON.stringify(selfRecord("real-id"), null, 2) + "\n", "utf8");
    const r = runCli(["capacity", "--release", "other-id", "--force"], heavyEnv(home));
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /is not a slot record/);
    assert.equal(existsSync(join(dir, "other-id.json")), true);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

// ─── waypost capacity lists the holders ───────────────────────────────────

test("capacity --json: holders_live lists a live record", () => {
  const home = tmpHome();
  try {
    const dir = slotsDirFor(home);
    const rec = selfRecord("holder-json");
    writeRecord(dir, rec);
    const r = runCli(["capacity", "--json"], heavyEnv(home));
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.holders, 1);
    assert.deepEqual(out.holders_live.map((h) => h.id), ["holder-json"]);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("capacity: human output lists the holder line", () => {
  const home = tmpHome();
  try {
    const dir = slotsDirFor(home);
    writeRecord(dir, selfRecord("holder-human", { session: "sess-x", harness: "claude", command: "node -e demo" }));
    const r = runCli(["capacity"], heavyEnv(home));
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /holders:/);
    assert.match(r.stdout, /holder-human\s+sess-x \(claude\)\s+node -e demo/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

// ─── the stress test ────────────────────────────────────────────────────
//
// Five parallel claims against a cap of one, each a trivial command, in a
// temporary state directory: the one place these tests start several
// processes on purpose, and it keeps them tiny (WP-18 Technical Notes).

test("the stress test: 5 parallel claims against a cap of one — exactly one runs, four are refused", async () => {
  const home = tmpHome();
  try {
    const env = heavyEnv(home, { WAYPOST_HEAVY_MAX: "1" });
    const runners = Array.from({ length: 5 }, () => new Promise((resolvePromise) => {
      const child = spawn(process.execPath, [Waypost, "run", "--heavy", "--", "node", "-e", "setTimeout(()=>{},1500)"], { env });
      child.on("exit", (code) => resolvePromise(code));
    }));
    const codes = await Promise.all(runners);
    const ok = codes.filter((c) => c === 0).length;
    const refused = codes.filter((c) => c === 75).length;
    assert.equal(ok, 1, `codes: ${JSON.stringify(codes)}`);
    assert.equal(refused, 4, `codes: ${JSON.stringify(codes)}`);
  } finally { rmSync(home, { recursive: true, force: true }); }
});
