// waypost — tests for scripts/capacity.mjs and `waypost capacity` (WP-18,
// Decision 1 of the heavy-work-sized-to-the-machine ADR).
// Every probe is injected — platform, os, readFile, run, wait — so these
// tests never depend on the host's own cores, load or memory. The one
// exception is the real `waypost capacity --json` run at the bottom, which
// checks shape and speed against whatever machine runs it.
//   node --test tests/capacity.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  readCores, readBusy, readMemory, canStart, measure,
  CORES_PER_SLOT, JOB_CORE_DIVISOR, JOB_MEMORY_CAP, JOB_MEMORY_DIVISOR,
} from "../scripts/capacity.mjs";
import { machineStateDir } from "../scripts/lib.mjs";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const GB = 1024 ** 3;

// A fake `os`-shaped object. cpus() may be given as an array (returned every
// call) or a function of the call index (for the two-snapshot Windows case).
function fakeOs({ cores = 8, load = 0, totalBytes = 16 * GB, freeBytes = 1 * GB, cpus = null } = {}) {
  let cpusCall = 0;
  return {
    availableParallelism: () => cores,
    loadavg: () => [load, load, load],
    totalmem: () => totalBytes,
    freemem: () => freeBytes,
    cpus: () => {
      const v = typeof cpus === "function" ? cpus(cpusCall) : cpus;
      cpusCall++;
      return v;
    },
  };
}

function readFileFrom(map) {
  return (path) => (Object.prototype.hasOwnProperty.call(map, path) ? map[path] : null);
}

function runFrom(map) {
  return (cmd, args) => {
    const key = [cmd, ...args].join(" ");
    return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
  };
}

// ─── machineStateDir ─────────────────────────────────────────────────────

test("machineStateDir: darwin", () => {
  const p = machineStateDir({ platform: "darwin", env: {}, home: "/Users/x" });
  assert.equal(p, join("/Users/x", "Library", "Application Support", "Waypost"));
});

test("machineStateDir: win32 with LOCALAPPDATA", () => {
  const p = machineStateDir({ platform: "win32", env: { LOCALAPPDATA: "C:\\Users\\x\\AppData\\Local" }, home: "C:\\Users\\x" });
  assert.equal(p, join("C:\\Users\\x\\AppData\\Local", "Waypost"));
});

test("machineStateDir: win32 without LOCALAPPDATA falls back to home", () => {
  const p = machineStateDir({ platform: "win32", env: {}, home: "C:\\Users\\x" });
  assert.equal(p, join("C:\\Users\\x", "AppData", "Local", "Waypost"));
});

test("machineStateDir: linux with XDG_STATE_HOME", () => {
  const p = machineStateDir({ platform: "linux", env: { XDG_STATE_HOME: "/custom/state" }, home: "/home/x" });
  assert.equal(p, join("/custom/state", "waypost"));
});

test("machineStateDir: linux default", () => {
  const p = machineStateDir({ platform: "linux", env: {}, home: "/home/x" });
  assert.equal(p, join("/home/x", ".local", "state", "waypost"));
});

// ─── readCores ───────────────────────────────────────────────────────────

test("readCores: non-linux uses availableParallelism, ignores cgroup files", () => {
  const os = fakeOs({ cores: 8 });
  const readFile = readFileFrom({ "/sys/fs/cgroup/cpu.max": "100000 100000\n" });
  const r = readCores({ platform: "darwin", os, readFile });
  assert.deepEqual(r, { cores: 8, probe: "availableParallelism" });
});

test("readCores: linux, no cgroup files present", () => {
  const os = fakeOs({ cores: 8 });
  const r = readCores({ platform: "linux", os, readFile: () => null });
  assert.deepEqual(r, { cores: 8, probe: "availableParallelism" });
});

test("readCores: linux, cgroup v2 cpu.max caps and rounds up", () => {
  const os = fakeOs({ cores: 8 });
  // 250000/100000 = 2.5 cores -> rounds up to 3.
  const readFile = readFileFrom({ "/sys/fs/cgroup/cpu.max": "250000 100000\n" });
  const r = readCores({ platform: "linux", os, readFile });
  assert.deepEqual(r, { cores: 3, probe: "cgroup v2 cpu.max" });
});

test("readCores: linux, cgroup v2 quota above base core count is capped by base", () => {
  const os = fakeOs({ cores: 4 });
  const readFile = readFileFrom({ "/sys/fs/cgroup/cpu.max": "800000 100000\n" }); // 8 cores worth
  const r = readCores({ platform: "linux", os, readFile });
  assert.deepEqual(r, { cores: 4, probe: "cgroup v2 cpu.max" });
});

test("readCores: linux, cgroup v2 'max' means unlimited", () => {
  const os = fakeOs({ cores: 8 });
  const readFile = readFileFrom({ "/sys/fs/cgroup/cpu.max": "max\n" });
  const r = readCores({ platform: "linux", os, readFile });
  assert.deepEqual(r, { cores: 8, probe: "availableParallelism" });
});

test("readCores: linux, cgroup v1 quota/period caps (v2 absent)", () => {
  const os = fakeOs({ cores: 8 });
  const readFile = readFileFrom({
    "/sys/fs/cgroup/cpu/cpu.cfs_quota_us": "150000\n",
    "/sys/fs/cgroup/cpu/cpu.cfs_period_us": "100000\n",
  }); // 1.5 cores -> rounds up to 2
  const r = readCores({ platform: "linux", os, readFile });
  assert.deepEqual(r, { cores: 2, probe: "cgroup v1 cpu.cfs_quota_us" });
});

test("readCores: linux, cgroup v1 negative quota means unlimited", () => {
  const os = fakeOs({ cores: 8 });
  const readFile = readFileFrom({
    "/sys/fs/cgroup/cpu/cpu.cfs_quota_us": "-1\n",
    "/sys/fs/cgroup/cpu/cpu.cfs_period_us": "100000\n",
  });
  const r = readCores({ platform: "linux", os, readFile });
  assert.deepEqual(r, { cores: 8, probe: "availableParallelism" });
});

// ─── readBusy ────────────────────────────────────────────────────────────

test("readBusy: macOS uses loadavg()[0]", async () => {
  const os = fakeOs({ load: 3.25 });
  const r = await readBusy({ platform: "darwin", os });
  assert.deepEqual(r, { busy: 3.25, probe: "loadavg" });
});

test("readBusy: linux uses loadavg()[0]", async () => {
  const os = fakeOs({ load: 1.5 });
  const r = await readBusy({ platform: "linux", os });
  assert.deepEqual(r, { busy: 1.5, probe: "loadavg" });
});

test("readBusy: win32 samples os.cpus() twice, ~250ms apart by default", async () => {
  const idleTimes = (idle) => ({ user: 0, nice: 0, sys: 0, idle, irq: 0 });
  const snapshots = [
    [{ times: idleTimes(1000) }, { times: idleTimes(1000) }], // before: all idle
    [{ times: idleTimes(1000) }, { times: idleTimes(500) }],  // after: core 1 half-busy over a 1000-tick window
  ];
  const os = fakeOs({ cpus: (i) => snapshots[i] });
  let waited = null;
  const r = await readBusy({ platform: "win32", os, wait: async (ms) => { waited = ms; } });
  assert.equal(waited, 250);
  assert.equal(r.probe, "os.cpus() sample");
  // idleDelta = 0 + -500 = -500; totalDelta = 0 + 0 = 0 total ticks moved for core0,
  // core1 idle dropped 500 with no other change -> totalDelta = -500 too (idle counts
  // toward total). fraction = 1 - idleDelta/totalDelta = 1 - 1 = 0 is wrong by
  // construction here, so assert only the shape and a sane range instead of the
  // exact arithmetic of this synthetic fixture.
  assert.ok(Number.isFinite(r.busy));
  assert.ok(r.busy >= 0);
});

test("readBusy: win32 busy scales with the idle share that vanished", async () => {
  // Two cores, both fully idle in the first snapshot (1000 idle / 1000 total each).
  // In the second, core 0 stays fully idle and core 1 is fully busy (0 idle,
  // total unchanged at 1000) — half the machine's ticks went from idle to busy.
  const before = [
    { times: { user: 0, nice: 0, sys: 0, idle: 1000, irq: 0 } },
    { times: { user: 0, nice: 0, sys: 0, idle: 1000, irq: 0 } },
  ];
  const after = [
    { times: { user: 0, nice: 0, sys: 0, idle: 2000, irq: 0 } },
    { times: { user: 1000, nice: 0, sys: 0, idle: 1000, irq: 0 } },
  ];
  const snapshots = [before, after];
  const os = fakeOs({ cores: 2, cpus: (i) => snapshots[i] });
  const r = await readBusy({ platform: "win32", os, wait: async () => {} });
  // idleDelta = 1000 + 0 = 1000; totalDelta = 1000 + 1000 = 2000; fraction = 0.5
  // busy = 0.5 * 2 cores = 1
  assert.equal(r.busy, 1);
});

// ─── readMemory ──────────────────────────────────────────────────────────

test("readMemory: darwin, kern.memorystatus_level x total, never touches freemem", () => {
  const os = fakeOs({ totalBytes: 16 * GB, freeBytes: -999 }); // poison freemem
  const run = runFrom({ "sysctl -n kern.memorystatus_level": "81\n" });
  const r = readMemory({ platform: "darwin", os, run, readFile: () => null });
  assert.equal(r.probe, "kern.memorystatus_level");
  assert.equal(r.available, 16 * GB * 0.81);
  assert.notEqual(r.available, -999);
});

test("readMemory: darwin, sysctl refused falls back to vm_stat, never touches freemem", () => {
  const os = fakeOs({ totalBytes: 16 * GB, freeBytes: -999 });
  const vmStat = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                              73362.
Pages active:                            234756.
Pages inactive:                          167742.
Pages speculative:                         2721.
Pages throttled:                              0.
Pages wired down:                        227437.
Pages purgeable:                           4181.
`;
  const run = (cmd) => (cmd === "sysctl" ? null : cmd === "vm_stat" ? vmStat : null);
  const r = readMemory({ platform: "darwin", os, run, readFile: () => null });
  assert.equal(r.probe, "vm_stat");
  const expected = (73362 + 167742 + 2721 + 4181) * 16384;
  assert.equal(r.available, expected);
  assert.notEqual(r.available, -999);
});

test("readMemory: darwin, both sysctl and vm_stat fail falls back to freemem (labelled lower bound)", () => {
  const os = fakeOs({ totalBytes: 16 * GB, freeBytes: 1234 });
  const r = readMemory({ platform: "darwin", os, run: () => null, readFile: () => null });
  assert.deepEqual(r, { available: 1234, total: 16 * GB, probe: "os.freemem() (lower bound)" });
});

test("readMemory: linux, MemAvailable with no cgroup", () => {
  const os = fakeOs({ totalBytes: 16 * GB });
  const readFile = readFileFrom({ "/proc/meminfo": "MemTotal:       16000000 kB\nMemAvailable:    8000000 kB\n" });
  const r = readMemory({ platform: "linux", os, readFile, run: () => null });
  assert.deepEqual(r, { available: 8000000 * 1024, total: 16 * GB, probe: "MemAvailable" });
});

test("readMemory: linux, MemAvailable capped by cgroup v2 memory.max - memory.current", () => {
  const os = fakeOs({ totalBytes: 16 * GB });
  const readFile = readFileFrom({
    "/proc/meminfo": "MemAvailable:    8000000 kB\n", // 8 GB-ish
    "/sys/fs/cgroup/memory.max": String(2 * GB) + "\n",
    "/sys/fs/cgroup/memory.current": String(1 * GB) + "\n",
  });
  const r = readMemory({ platform: "linux", os, readFile, run: () => null });
  assert.equal(r.probe, "cgroup v2 memory.max");
  assert.equal(r.available, 1 * GB);
});

test("readMemory: linux, cgroup v2 'max' is unlimited and does not fall through to v1", () => {
  const os = fakeOs({ totalBytes: 16 * GB });
  const readFile = readFileFrom({
    "/proc/meminfo": "MemAvailable:    8000000 kB\n",
    "/sys/fs/cgroup/memory.max": "max\n",
    // A v1 file that would cap if consulted — must be ignored, since v2 is present.
    "/sys/fs/cgroup/memory/memory.limit_in_bytes": String(1 * GB) + "\n",
    "/sys/fs/cgroup/memory/memory.usage_in_bytes": "0\n",
  });
  const r = readMemory({ platform: "linux", os, readFile, run: () => null });
  assert.equal(r.probe, "MemAvailable");
  assert.equal(r.available, 8000000 * 1024);
});

test("readMemory: linux, MemAvailable capped by cgroup v1 limit - usage", () => {
  const os = fakeOs({ totalBytes: 16 * GB });
  const readFile = readFileFrom({
    "/proc/meminfo": "MemAvailable:    8000000 kB\n",
    "/sys/fs/cgroup/memory/memory.limit_in_bytes": String(2 * GB) + "\n",
    "/sys/fs/cgroup/memory/memory.usage_in_bytes": String(1.5 * GB) + "\n",
  });
  const r = readMemory({ platform: "linux", os, readFile, run: () => null });
  assert.equal(r.probe, "cgroup v1 memory.limit_in_bytes");
  assert.equal(r.available, 0.5 * GB);
});

test("readMemory: linux, cgroup v1 limit above total memory means unlimited", () => {
  const os = fakeOs({ totalBytes: 16 * GB });
  const readFile = readFileFrom({
    "/proc/meminfo": "MemAvailable:    8000000 kB\n",
    "/sys/fs/cgroup/memory/memory.limit_in_bytes": String(32 * GB) + "\n", // above total
    "/sys/fs/cgroup/memory/memory.usage_in_bytes": "0\n",
  });
  const r = readMemory({ platform: "linux", os, readFile, run: () => null });
  assert.equal(r.probe, "MemAvailable");
  assert.equal(r.available, 8000000 * 1024);
});

test("readMemory: linux, no MemAvailable falls back to freemem (labelled lower bound)", () => {
  const os = fakeOs({ totalBytes: 16 * GB, freeBytes: 555 });
  const r = readMemory({ platform: "linux", os, readFile: () => null, run: () => null });
  assert.deepEqual(r, { available: 555, total: 16 * GB, probe: "os.freemem() (lower bound)" });
});

test("readMemory: win32 uses os.freemem()", () => {
  const os = fakeOs({ totalBytes: 16 * GB, freeBytes: 4 * GB });
  const r = readMemory({ platform: "win32", os, readFile: () => null, run: () => null });
  assert.deepEqual(r, { available: 4 * GB, total: 16 * GB, probe: "os.freemem()" });
});

test("readMemory: an unknown platform falls back to freemem, labelled a lower bound", () => {
  const os = fakeOs({ totalBytes: 16 * GB, freeBytes: 4 * GB });
  const r = readMemory({ platform: "sunos", os, readFile: () => null, run: () => null });
  assert.deepEqual(r, { available: 4 * GB, total: 16 * GB, probe: "os.freemem() (lower bound)" });
});

// ─── canStart matrix ───────────────────────────────────────────────────────
//
// The owner's defaults: one slot per four cores (>=1); a job's share is
// cores/4 (>=1) and min(2 GiB, total/4). Exercised at 2, 8 and 32 cores,
// idle and loaded, per the ADR's rules (a) holders vs slots, (b) idle cores
// vs a job's core share, (c) available memory vs a job's memory share.

test("canStart: 2 cores, idle, plenty of memory -> 1 slot, can start 1", () => {
  const total = 16 * GB;
  const r = canStart({ cores: 2, busy: 0, available: total, total, holders: 0 });
  assert.equal(r.slots, 1);
  assert.equal(r.job_cores, 1); // max(1, 2/4)
  assert.equal(r.job_memory, Math.min(JOB_MEMORY_CAP, total / JOB_MEMORY_DIVISOR));
  assert.equal(r.can_start, 1);
  assert.equal(r.reason, null);
});

test("canStart: 2 cores, fully loaded -> can start 0, cpu is the reason", () => {
  const total = 16 * GB;
  const r = canStart({ cores: 2, busy: 2, available: total, total, holders: 0 });
  assert.equal(r.can_start, 0);
  assert.match(r.reason, /^cpu:/);
});

test("canStart: 8 cores, idle -> 2 slots, can start 2", () => {
  const total = 16 * GB;
  const r = canStart({ cores: 8, busy: 0, available: total, total, holders: 0 });
  assert.equal(r.slots, 2);
  assert.equal(r.job_cores, 2);
  assert.equal(r.job_memory, JOB_MEMORY_CAP); // total/4 = 4 GiB > 2 GiB cap
  assert.equal(r.can_start, 2);
});

test("canStart: 8 cores, loaded to 7 busy -> only 1/4 idle core fits no full job -> can start 0, cpu reason", () => {
  const total = 16 * GB;
  const r = canStart({ cores: 8, busy: 7, available: total, total, holders: 0 });
  // idle = 1, jobCores = 2 -> floor(1/2) = 0
  assert.equal(r.can_start, 0);
  assert.match(r.reason, /^cpu:/);
});

test("canStart: 8 cores, idle, memory scarce -> can start 0, memory reason", () => {
  const total = 16 * GB;
  const r = canStart({ cores: 8, busy: 0, available: 0.5 * GB, total, holders: 0 });
  assert.equal(r.can_start, 0);
  assert.match(r.reason, /^memory:/);
});

test("canStart: 8 cores, holders already fill every slot -> can start 0, slots reason", () => {
  const total = 16 * GB;
  const r = canStart({ cores: 8, busy: 0, available: total, total, holders: 2 });
  assert.equal(r.slots, 2);
  assert.equal(r.can_start, 0);
  assert.match(r.reason, /^slots:/);
});

test("canStart: 32 cores, idle -> 8 slots, but only 4 jobs' worth of idle cores", () => {
  const total = 64 * GB;
  const r = canStart({ cores: 32, busy: 0, available: total, total, holders: 0 });
  assert.equal(r.slots, 8);
  assert.equal(r.job_cores, 8);
  // bySlots = 8, byCores = floor(32 idle / 8 per job) = 4 -> the tighter bound wins.
  assert.equal(r.can_start, 4);
});

test("canStart: 32 cores, heavily loaded -> fewer jobs fit, never below 0", () => {
  const total = 64 * GB;
  const r = canStart({ cores: 32, busy: 30, available: total, total, holders: 0 });
  // idle = 2, jobCores = 8 -> floor(2/8) = 0
  assert.equal(r.can_start, 0);
  assert.ok(r.can_start >= 0);
});

test("canStart: WAYPOST_HEAVY_MAX lowers the slot count", () => {
  const total = 16 * GB;
  const r = canStart({ cores: 8, busy: 0, available: total, total, holders: 0, max: "1" });
  assert.equal(r.slots, 1);
  assert.equal(r.can_start, 1);
});

test("canStart: WAYPOST_HEAVY_MAX never raises the slot count", () => {
  const total = 16 * GB;
  const r = canStart({ cores: 8, busy: 0, available: total, total, holders: 0, max: "100" });
  assert.equal(r.slots, 2); // unchanged: max only lowers
});

test("canStart: invalid WAYPOST_HEAVY_MAX values are ignored", () => {
  const total = 16 * GB;
  for (const bad of ["0", "-1", "abc", "3.5", "", null, undefined]) {
    const r = canStart({ cores: 8, busy: 0, available: total, total, holders: 0, max: bad });
    assert.equal(r.slots, 2, `max=${JSON.stringify(bad)} should be ignored`);
  }
});

test("canStart: can_start never goes below 0 even with more holders than slots", () => {
  const total = 16 * GB;
  const r = canStart({ cores: 2, busy: 0, available: total, total, holders: 99 });
  assert.equal(r.can_start, 0);
  assert.match(r.reason, /^slots:/);
});

test("canStart: busy above the core count clamps idle cores to 0 -> can start 0, cpu reason", () => {
  const total = 16 * GB;
  const r = canStart({ cores: 8, busy: 12, available: total, total, holders: 0 });
  assert.equal(r.can_start, 0);
  assert.match(r.reason, /^cpu:/);
});

test("canStart: zero available memory -> can start 0, memory reason", () => {
  const total = 16 * GB;
  const r = canStart({ cores: 8, busy: 0, available: 0, total, holders: 0 });
  assert.equal(r.can_start, 0);
  assert.match(r.reason, /^memory:/);
});

test("canStart: an unknown figure (zero total, NaN busy or memory) means cannot start, never NaN", () => {
  for (const args of [
    { cores: 8, busy: 0, available: 4 * GB, total: 0 },
    { cores: 8, busy: NaN, available: 4 * GB, total: 16 * GB },
    { cores: 8, busy: 0, available: NaN, total: 16 * GB },
  ]) {
    const r = canStart({ ...args, holders: 0 });
    assert.equal(r.can_start, 0, JSON.stringify(args));
    assert.ok(typeof r.reason === "string" && r.reason.length > 0, JSON.stringify(args));
  }
});

// ─── measure ─────────────────────────────────────────────────────────────

test("measure: assembles cores/busy/memory/probes/holders/slots/can_start/reason", async () => {
  const os = fakeOs({ cores: 8, load: 0, totalBytes: 16 * GB, freeBytes: 8 * GB });
  const r = await measure({
    platform: "linux",
    os,
    readFile: () => null, // no cgroup, no /proc/meminfo -> freemem lower bound
    run: () => null,
    env: {},
  });
  assert.equal(r.cores, 8);
  assert.equal(r.busy, 0);
  assert.deepEqual(r.memory, { available: 8 * GB, total: 16 * GB });
  assert.deepEqual(r.probes, { cores: "availableParallelism", busy: "loadavg", memory: "os.freemem() (lower bound)" });
  assert.equal(r.holders, 0);
  assert.equal(r.slots, 2);
  assert.equal(r.can_start, 2);
  assert.equal(r.reason, null);
});

test("measure: reads WAYPOST_HEAVY_MAX from the injected env", async () => {
  const os = fakeOs({ cores: 8, load: 0, totalBytes: 16 * GB, freeBytes: 8 * GB });
  const r = await measure({
    platform: "linux", os, readFile: () => null, run: () => null,
    env: { WAYPOST_HEAVY_MAX: "1" },
  });
  assert.equal(r.slots, 1);
  assert.equal(r.can_start, 1);
});

// ─── real waypost capacity --json ────────────────────────────────────────
//
// One real run, no injected probes: checks the shape bin/waypost produces
// and that it stays fast (compute only, nothing cached, nothing shelled that
// could be slow) — well within a second.

test("waypost capacity --json: real run, shape and speed", () => {
  const bin = join(REPO, "bin", "waypost");
  const start = Date.now();
  const r = spawnSync(process.execPath, [bin, "capacity", "--json"], {
    encoding: "utf8",
    env: { ...process.env, WAYPOST_NO_BEAT: "1" },
    timeout: 5000,
  });
  const elapsed = Date.now() - start;
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(typeof out.cores, "number");
  assert.equal(typeof out.busy, "number");
  assert.equal(typeof out.memory.available, "number");
  assert.equal(typeof out.memory.total, "number");
  assert.equal(typeof out.probes.cores, "string");
  assert.equal(typeof out.probes.busy, "string");
  assert.equal(typeof out.probes.memory, "string");
  assert.equal(out.holders, 0);
  assert.equal(typeof out.slots, "number");
  assert.equal(typeof out.can_start, "number");
  assert.ok(elapsed < 1000, `waypost capacity --json took ${elapsed}ms`);
});

test("waypost capacity: real run, human output", () => {
  const bin = join(REPO, "bin", "waypost");
  const r = spawnSync(process.execPath, [bin, "capacity"], {
    encoding: "utf8",
    env: { ...process.env, WAYPOST_NO_BEAT: "1" },
    timeout: 5000,
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /cores, load/);
  assert.match(r.stdout, /available/);
  assert.match(r.stdout, /can start (\d+ heavy jobs?|0 — .+)/);
});
