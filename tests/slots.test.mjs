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
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, utimesSync, realpathSync,
} from "node:fs";

import {
  bootIdentity, sameBoot, slotLive, readHolders, measure,
  bootAuthority, authorityOnce, confirmBoot, uptimeSaysOtherBoot, UPTIME_MARGIN_S,
  blockingHolder,
} from "../scripts/capacity.mjs";
import { machineStateDir } from "../scripts/lib.mjs";
import { hostSlug, processTable, startTicks } from "../scripts/presence.mjs";

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

// Run from the temp home, not the repository: from a linked worktree the CLI
// qualifies an environment WAYPOST_SESSION_ID with the worktree (ADR-0010),
// and what these tests assert must not depend on where the suite is checked out.
function runCli(args, env) {
  return spawnSync(process.execPath, [Waypost, ...args], { encoding: "utf8", env, cwd: env.HOME, timeout: 15000 });
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
    proc: { pid: process.pid, started: self ? self.started : null, ticks: startTicks(process.pid), comm: basename(process.execPath) },
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

// ─── the boot authority: a mismatch asks, it does not delete ───────────
//
// WP-18's amendment of 2026-09-17, measured on the owner's Windows VM: 534 s
// of host suspend moved `now — os.uptime()` by 535 s, so a live holder's
// record read as another boot, `capacity` called the slot free while the job
// ran, and the next claim deleted the record on its way in. The epoch is kept
// as the cheap answer; what changes is that it may no longer destroy anything
// on its own. Nothing here spawns: `run` is injected everywhere.

const T = 1_700_000_000;
const REC_BOOT = { kind: "epoch", value: T };                 // written before the suspend
const AFTER_SUSPEND = { kind: "epoch", value: T + 600 };      // 600 s of frozen guest later
const TRUTH = { kind: "win-system-process", value: T };        // what the kernel still says
const AUTH = (v) => ({ kind: "win-system-process", value: v });

const winRec = (over = {}) => ({
  id: "x", host: MY_HOST, proc: { pid: 1, comm: "node.exe" },
  boot: REC_BOOT, authority: TRUTH, started_at: new Date().toISOString(), ...over,
});
const winProbes = (over = {}) => ({ platform: "win32", kill: () => true, tasklist: () => "node.exe", ...over });

test("bootAuthority: win32 asks the System process for its creation time; nowhere else has one", () => {
  const calls = [];
  const run = (cmd, args) => { calls.push({ cmd, args }); return "1700000000\n"; };
  assert.deepEqual(bootAuthority({ platform: "win32", run }), { kind: "win-system-process", value: T });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cmd, "powershell", "argv, no shell");
  assert.match(calls[0].args.join(" "), /ProcessId=4/, "pid 4 is the System process, created at boot and never recomputed");
  assert.match(calls[0].args.join(" "), /ToUnixTimeSeconds/,
    "the conversion happens inside PowerShell: a formatted local date is a locale trap this project has already been bitten by");
  assert.equal(bootAuthority({ platform: "linux", run }), null, "Linux has boot_id");
  assert.equal(bootAuthority({ platform: "darwin", run }), null, "macOS is not covered at all: os.uptime() there IS kern.boottime");
  assert.equal(calls.length, 1, "and neither of those asked anything");
});

test("bootAuthority: anything but a number is no answer, never a boot time", () => {
  for (const out of [null, "", "   ", "INFO: nothing here", "NaN"]) {
    assert.equal(bootAuthority({ platform: "win32", run: () => out }), null, JSON.stringify(out));
  }
});

test("authorityOnce: one read per command, however many records ask — including a failed one", () => {
  let reads = 0;
  const ask = authorityOnce({ platform: "win32", run: () => { reads++; return "1700000000"; } });
  for (let i = 0; i < 20; i++) ask();
  assert.equal(reads, 1);
  assert.deepEqual(ask(), TRUTH);

  let failed = 0;
  const askBad = authorityOnce({ platform: "win32", run: () => { failed++; return null; } });
  assert.equal(askBad(), null);
  assert.equal(askBad(), null);
  assert.equal(failed, 1, "a read that failed is not retried once per record either");
});

test("confirmBoot: same, other, or it could not say — and only 'other' may destroy anything", () => {
  assert.equal(confirmBoot({ authority: AUTH(T) }, TRUTH), true);
  assert.equal(confirmBoot({ authority: AUTH(T - 3600) }, TRUTH), false, "a real restart");
  assert.equal(confirmBoot({ authority: AUTH(T) }, null), null, "no answer");
  assert.equal(confirmBoot({}, TRUTH), null, "a record written before the field existed");
  assert.equal(confirmBoot({ authority: { kind: "kern.boottime", value: T } }, TRUTH), null, "two values that cannot be compared");
});

test("slotLive: the epoch moved under a host suspend, the authority says one boot -> live (WP-18)", () => {
  // The whole point. Before the amendment this returned false, capacity
  // reported a free slot, and the next claim deleted the record.
  assert.equal(slotLive(winRec(), winProbes({ bootNow: AFTER_SUSPEND, authority: () => TRUTH })), true);
});

test("slotLive: a real restart — the authority says another boot -> stale", () => {
  assert.equal(slotLive(winRec(), winProbes({ bootNow: AFTER_SUSPEND, authority: () => AUTH(T + 500) })), false);
});

test("slotLive: what no answer means is 'keep', not 'gone'", () => {
  assert.equal(slotLive(winRec(), winProbes({ bootNow: AFTER_SUSPEND, authority: () => null })), true,
    "being ignored for one call is recoverable; being pruned is not");
  assert.equal(slotLive(winRec({ authority: null }), winProbes({ bootNow: AFTER_SUSPEND, authority: () => TRUTH })), true,
    "a record written before the field existed is kept for the same reason");
});

test("slotLive: an unconfirmable record is kept on POSIX too, and the 24-hour cap is what bounds it there now", () => {
  const table = new Map([[42, { pid: 42, ppid: 1, started: "T", comm: "node" }]]);
  const rec = { host: MY_HOST, proc: { pid: 42, started: "T" }, boot: REC_BOOT, authority: null, started_at: new Date().toISOString() };
  const probes = { table, platform: "linux", bootNow: AFTER_SUSPEND, authority: () => null };
  assert.equal(slotLive(rec, probes), true);
  const old = { ...rec, started_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() };
  assert.equal(slotLive(old, probes), false, "the cap was Windows-only; for a record nobody can confirm it is every platform now");
});

test("slotLive: the authority is asked only when something actually needs it", () => {
  const never = () => { throw new Error("the authority must not be asked here"); };
  assert.equal(slotLive(winRec(), winProbes({ bootNow: REC_BOOT, authority: never })), true,
    "the epoch agrees: nothing to ask about");
  assert.equal(slotLive(winRec(), winProbes({ bootNow: AFTER_SUSPEND, kill: () => false, authority: never })), false,
    "the process is gone: settled for free, before the boot is ever in question");
  const other = { host: MY_HOST, proc: { pid: 1, comm: "node.exe" }, boot: OTHER_BOOT, started_at: new Date().toISOString() };
  assert.equal(slotLive(other, winProbes({ bootNow: SAME_BOOT, authority: never })), false,
    "a real boot identifier disagreeing is evidence on its own, as it always was");
});

// ─── uptime confirms another boot for free (WP-18, second amendment) ─────
//
// Measured by a real Windows restart: in the minutes after boot the authority
// read takes 4–9 s against a 2 s timeout, so every read there comes back
// unconfirmable and keeps the record — which is exactly the window where
// previous-boot records exist. Uptime never decreases within one boot, so a
// record claimed above the current reading is from another boot with no spawn
// at all. One direction only: it never says "same boot".

const PREV_UPTIME = 13530;   // what the restart's records carried
const NOW_UPTIME = 2034;     // what the machine read afterwards

test("uptimeSaysOtherBoot: below the claim confirms, at or above it never does", () => {
  assert.equal(uptimeSaysOtherBoot({ uptime: PREV_UPTIME }, NOW_UPTIME), true, "the restart, as measured");
  assert.equal(uptimeSaysOtherBoot({ uptime: 100 }, 5000), false,
    "a boot that has been up longer than the claim proves nothing: this may not answer");
  assert.equal(uptimeSaysOtherBoot({ uptime: 5000 }, 5000), false, "the same reading is the same boot");
  assert.equal(uptimeSaysOtherBoot({ uptime: 5000 }, 5000 - UPTIME_MARGIN_S), false,
    "inside the margin: two readings of one monotonic clock must not round into a deletion");
  assert.equal(uptimeSaysOtherBoot({ uptime: 5000 }, 5000 - UPTIME_MARGIN_S - 1), true, "outside it, they may");
  assert.equal(uptimeSaysOtherBoot({}, NOW_UPTIME), false, "a record written before the field existed");
  assert.equal(uptimeSaysOtherBoot({ uptime: "13530" }, NOW_UPTIME), false, "a string is not a reading");
  assert.equal(uptimeSaysOtherBoot({ uptime: PREV_UPTIME }, NaN), false, "nor is NaN");
});

test("slotLive: a previous boot settled by uptime alone, with the authority forbidden (WP-18)", () => {
  const never = () => { throw new Error("the authority must not be asked here"); };
  const rec = winRec({ boot: REC_BOOT, uptime: PREV_UPTIME });
  assert.equal(slotLive(rec, winProbes({ bootNow: AFTER_SUSPEND, uptimeNow: NOW_UPTIME, authority: never })), false,
    "no spawn, no timeout, and certain: this is the post-restart window");
});

test("slotLive: a suspend is not a restart — uptime declines to confirm, and the authority keeps the holder", () => {
  // The machine slept: the epoch moved, and uptime paused and resumed, so it
  // is ABOVE the claim. Nothing may be pruned on uptime here.
  const rec = winRec({ boot: REC_BOOT, uptime: 11274 });
  assert.equal(uptimeSaysOtherBoot(rec, 11420), false);
  assert.equal(slotLive(rec, winProbes({ bootNow: AFTER_SUSPEND, uptimeNow: 11420, authority: () => TRUTH })), true);
});

test("slotLive: uptime is asked before the authority, and only falls through when it cannot answer", () => {
  const asks = [];
  const counting = () => { asks.push(1); return TRUTH; };
  // settled by uptime: not one ask
  slotLive(winRec({ uptime: PREV_UPTIME }), winProbes({ bootNow: AFTER_SUSPEND, uptimeNow: NOW_UPTIME, authority: counting }));
  assert.equal(asks.length, 0);
  // uptime cannot answer (no field): the authority decides, as before
  assert.equal(slotLive(winRec(), winProbes({ bootNow: AFTER_SUSPEND, uptimeNow: NOW_UPTIME, authority: counting })), true);
  assert.equal(asks.length, 1);
});

test("readHolders: twenty previous-boot records and not one authority read", () => {
  const dir = mkdtempSync(join(tmpdir(), "waypost-uptime-"));
  try {
    for (let i = 0; i < 20; i++) {
      writeRecord(dir, { id: "h" + i, host: MY_HOST, proc: { pid: 1, comm: "node.exe" },
        boot: REC_BOOT, authority: TRUTH, uptime: PREV_UPTIME, started_at: new Date().toISOString() });
    }
    const out = readHolders({
      dir, platform: "win32", bootNow: AFTER_SUSPEND, uptimeNow: NOW_UPTIME,
      kill: () => true, tasklist: () => "node.exe",
      run: () => { throw new Error("nothing may be spawned: uptime settles every one of these"); },
    });
    assert.equal(out.live.length, 0);
    assert.equal(out.stale.length, 20);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("readHolders: twenty records from a drifted epoch cost one authority read, not twenty", () => {
  const dir = mkdtempSync(join(tmpdir(), "waypost-auth-"));
  try {
    for (let i = 0; i < 20; i++) {
      writeRecord(dir, { id: "h" + i, host: MY_HOST, proc: { pid: 1, comm: "node.exe" },
        boot: REC_BOOT, authority: TRUTH, started_at: new Date().toISOString() });
    }
    let reads = 0;
    const out = readHolders({
      dir, platform: "win32", bootNow: AFTER_SUSPEND,
      kill: () => true, tasklist: () => "node.exe",
      run: () => { reads++; return String(T); },
    });
    assert.equal(out.live.length, 20, "every one of them survived the suspend");
    assert.equal(out.stale.length, 0);
    assert.equal(reads, 1, "one PowerShell for the whole directory");
  } finally { rmSync(dir, { recursive: true, force: true }); }
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
    // A holder nobody can confirm is kept rather than pruned (WP-18
    // amendment), so the way out has to be in the refusal itself.
    assert.match(r.stderr, /capacity --release <id>/);
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

test("run --heavy: the record carries the value a later epoch mismatch is checked against (WP-18)", () => {
  const home = tmpHome();
  try {
    const dir = slotsDirFor(home);
    // The command prints the record that exists while it is running: the only
    // moment it is on disk, and no race with the wrapper's own cleanup.
    const code = "const fs=require('fs'),p=require('path'),d=process.env.WP_SLOTS;"
      + "const f=fs.readdirSync(d).filter(n=>n.endsWith('.json'))[0];"
      + "process.stdout.write(fs.readFileSync(p.join(d,f),'utf8'));";
    const r = runCli(["run", "--heavy", "--", "node", "-e", code], heavyEnv(home, { WP_SLOTS: dir }));
    assert.equal(r.status, 0, r.stderr);
    const rec = JSON.parse(r.stdout);
    assert.ok("authority" in rec, "the field is always written, even where it is null");
    assert.ok(Number.isFinite(rec.uptime), "and the uptime at claim, which needs no platform to be readable");
    if (process.platform === "win32") {
      // Best-effort by design: the read gets one second after the lock is
      // released, so a loaded machine legitimately records null and leans on
      // uptime instead. What is asserted is the shape when there is one.
      if (rec.authority !== null) {
        assert.equal(rec.authority.kind, "win-system-process");
        assert.ok(Number.isFinite(rec.authority.value));
      }
    } else {
      assert.equal(rec.authority, null,
        "no authority on this platform: such a record can only ever be kept, never pruned");
    }
  } finally { rmSync(home, { recursive: true, force: true }); }
});

// The amended machine-wide-limit ADR, Decision 4: the slot record's own
// working directory and (inside a repository) root — slotWhere(), computed
// before the lock. Outside git the temp HOME the rest of this file already
// runs from is exactly the "no repository" case: root/common stay null.
test("run --heavy: the slot record carries cwd; root stays null outside a repository", () => {
  const home = tmpHome();
  try {
    const dir = slotsDirFor(home);
    const code = "const fs=require('fs'),p=require('path'),d=process.env.WP_SLOTS;"
      + "const f=fs.readdirSync(d).filter(n=>n.endsWith('.json'))[0];"
      + "process.stdout.write(fs.readFileSync(p.join(d,f),'utf8'));";
    const r = runCli(["run", "--heavy", "--", "node", "-e", code], heavyEnv(home, { WP_SLOTS: dir }));
    assert.equal(r.status, 0, r.stderr);
    const rec = JSON.parse(r.stdout);
    assert.equal(typeof rec.cwd, "string");
    assert.ok(rec.cwd.length > 0, "cwd is recorded even with no repository to name a root in");
    assert.equal(rec.root, null);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("run --heavy: inside a repository, the record's root is the working tree's own top level, as a real path", () => {
  const home = tmpHome();
  const proj = mkdtempSync(join(tmpdir(), "waypost-slots-gitproj-"));
  try {
    const init = spawnSync("git", ["init", "-q"], { cwd: proj });
    assert.equal(init.status, 0, init.stderr);
    const dir = slotsDirFor(home);
    const code = "const fs=require('fs'),p=require('path'),d=process.env.WP_SLOTS;"
      + "const f=fs.readdirSync(d).filter(n=>n.endsWith('.json'))[0];"
      + "process.stdout.write(fs.readFileSync(p.join(d,f),'utf8'));";
    const r = spawnSync(process.execPath, [Waypost, "run", "--heavy", "--", "node", "-e", code], {
      encoding: "utf8", env: heavyEnv(home, { WP_SLOTS: dir }), cwd: proj, timeout: 15000,
    });
    assert.equal(r.status, 0, r.stderr);
    const rec = JSON.parse(r.stdout);
    const realProj = realpathSync(proj);
    assert.equal(rec.root, realProj);
    assert.equal(rec.cwd, realProj);
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(proj, { recursive: true, force: true });
  }
});

test("run --heavy: the exit code passes through, including a crash", () => {
  const home = tmpHome();
  try {
    const ok = runCli(["run", "--heavy", "--", "node", "-e", "process.exit(0)"], heavyEnv(home));
    assert.equal(ok.status, 0);
    const crash = runCli(["run", "--heavy", "--", "node", "-e", "process.exit(3)"], heavyEnv(home));
    assert.equal(crash.status, 3);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("run --heavy: a signal exits 128 + the signal number",
  { skip: process.platform === "win32" ? "POSIX signals: Windows terminates a process, it does not signal it" : false }, () => {
  const home = tmpHome();
  try {
    const r = runCli(["run", "--heavy", "--", "node", "-e", "process.kill(process.pid, 'SIGTERM')"], heavyEnv(home));
    assert.equal(r.status, 128 + 15);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

// WP-18: the holder's identity has to survive the machine sleeping, so the
// record names the start time in clock ticks since boot, which a re-estimated
// boot time cannot move — unlike the wall-clock string beside it. Read back
// from /proc by the very command holding the slot, while its wrapper is alive.
test("run --heavy: the slot record names a start time a sleep cannot move", { skip: process.platform !== "linux" }, () => {
  const home = tmpHome();
  try {
    const dir = slotsDirFor(home);
    const script = [
      'const {readdirSync,readFileSync}=require("fs");const {join}=require("path");',
      `const d=${JSON.stringify(dir)};`,
      'const rec=JSON.parse(readFileSync(join(d,readdirSync(d).find(n=>n.endsWith(".json"))),"utf8"));',
      'const stat=readFileSync("/proc/"+rec.proc.pid+"/stat","utf8");',
      'console.log(JSON.stringify({recorded:rec.proc.ticks,fromProc:Number(stat.slice(stat.lastIndexOf(")")+2).split(" ")[19])}));',
    ].join("");
    const r = runCli(["run", "--heavy", "--", "node", "-e", script], heavyEnv(home));
    assert.equal(r.status, 0, r.stderr);
    const { recorded, fromProc } = JSON.parse(r.stdout);
    assert.equal(typeof recorded, "number");
    assert.equal(recorded, fromProc, "the record must carry the wrapper's own tick count");
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

// The same machine-slept case, one level down: the slot lock's owner record.
// Its wall-clock string no longer matches what `ps` reports, its tick count
// does, and the owner is alive — the lock must hold.
test("the lock: a live owner survives the machine sleeping", { skip: process.platform !== "linux" }, async () => {
  const home = tmpHome();
  const helper = spawn(process.execPath, ["-e", "setTimeout(()=>{}, 4000)"]);
  try {
    const dir = slotsDirFor(home);
    mkdirSync(dir, { recursive: true });
    await new Promise((r) => setTimeout(r, 300)); // let the helper appear in the process table
    const lockDir = join(dir, ".lock");
    mkdirSync(lockDir);
    writeFileSync(join(lockDir, "owner.json"), JSON.stringify({
      pid: helper.pid,
      started: "Thu Sep 3 00:00:00 2026", // the string the sleep moved out from under it
      ticks: startTicks(helper.pid),      // the number it did not
    }), "utf8");

    const marker = join(home, "marker");
    const r = runCli(["run", "--heavy", "--", "node", "-e", `require('fs').writeFileSync(${JSON.stringify(marker)}, 'x')`], heavyEnv(home));
    assert.equal(r.status, 75, r.stderr);
    assert.match(r.stderr, /lock is busy/);
    assert.equal(existsSync(marker), false, "a lock whose owner is alive must not be broken by a sleep");
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

// ─── blockingHolder (the machine-wide-limit ADR, Decision 4) ──────────────
//
// `canon` is the identity function in every test below — hermetic on
// purpose: none of these paths need to exist for the comparison itself to
// be exercised, and the default (realpathSync, falling back to the path
// itself) would behave the same way for a path that does not exist anyway.

test("blockingHolder: the caller's own id is never a blocker, even when its own root would otherwise overlap", () => {
  const holders = [{ id: "self", root: "/proj" }];
  assert.equal(blockingHolder(holders, { self: "self", root: "/proj", platform: "linux", canon: (p) => p }), null);
});

test("blockingHolder: an overlapping root blocks, case-folded on darwin", () => {
  const holders = [{ id: "other", root: "/PROJ" }];
  const hit = blockingHolder(holders, { self: null, root: "/proj", platform: "darwin", canon: (p) => p });
  assert.ok(hit, "case-folded on darwin, so /PROJ overlaps /proj");
  assert.equal(hit.holder.id, "other");
});

test("blockingHolder: linux is case-sensitive — a differently-cased root does not overlap", () => {
  const holders = [{ id: "other", root: "/PROJ" }];
  assert.equal(blockingHolder(holders, { self: null, root: "/proj", platform: "linux", canon: (p) => p }), null);
});

test("blockingHolder: root: null falls back to cwd", () => {
  const holders = [{ id: "other", root: null, cwd: "/proj/sub" }];
  const hit = blockingHolder(holders, { self: null, root: "/proj", platform: "linux", canon: (p) => p });
  assert.ok(hit, "the working directory overlaps the root");
  assert.match(hit.reason, /working directory/);
});

test("blockingHolder: a record naming neither root nor cwd blocks unconditionally — an older Waypost", () => {
  const holders = [{ id: "old" }];
  const hit = blockingHolder(holders, { self: null, root: "/proj", platform: "linux", canon: (p) => p });
  assert.ok(hit);
  assert.equal(hit.holder.id, "old");
  assert.match(hit.reason, /older Waypost/);
});

test("blockingHolder: a root elsewhere entirely is not a blocker, and no holders at all blocks nothing", () => {
  const holders = [{ id: "other", root: "/elsewhere" }];
  assert.equal(blockingHolder(holders, { self: null, root: "/proj", platform: "linux", canon: (p) => p }), null);
  assert.equal(blockingHolder([], { self: null, root: "/proj" }), null);
  assert.equal(blockingHolder(undefined, { self: null, root: "/proj" }), null);
});
