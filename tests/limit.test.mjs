// waypost — tests for `waypost clean --limit` (WP-17, the machine-wide-
// limit story, commit B: the gate, the setting, log rotation, and the
// leftover deleter's own adoption pass). Every child process below gets
// HOME/XDG_STATE_HOME/LOCALAPPDATA pointing at a temp directory (so
// machineStateDir() never touches the real machine state directory) and an
// idle WAYPOST_CAPACITY_PROBE unless a test needs otherwise — the same
// hermetic posture tests/cleanup.test.mjs and tests/slots.test.mjs already
// use. Real removal only ever happens inside a temp `waypost-removing/`
// this suite made itself.
//   node --test tests/limit.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync, realpathSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir, hostname } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { machineStateDir, REMOVING_DIR } from "../scripts/lib.mjs";
import { hostSlug } from "../scripts/presence.mjs";
import { bootIdentity } from "../scripts/capacity.mjs";
import { registry } from "../scripts/agents.mjs";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const Waypost = join(REPO, "bin", "waypost");
const GB = 1024 ** 3;
const RAW_HOST = hostname().split(".")[0];

const ROOTS = [];
function tmpRoot(prefix) {
  const p = mkdtempSync(join(tmpdir(), prefix));
  ROOTS.push(p);
  return p;
}
process.on("exit", () => { for (const p of ROOTS) { try { rmSync(p, { recursive: true, force: true }); } catch { /* best effort */ } } });

function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout;
}

function machineEnv(home, extra = {}) {
  return {
    ...process.env, HOME: home, USERPROFILE: home, XDG_STATE_HOME: home, LOCALAPPDATA: home,
    WAYPOST_NO_BEAT: "1",
    WAYPOST_CAPACITY_PROBE: JSON.stringify({ cores: 8, busy: 0, available: 8 * GB, total: 16 * GB }),
    ...extra,
  };
}

function stateDirOf(home) {
  return machineStateDir({ platform: process.platform, env: { XDG_STATE_HOME: home, LOCALAPPDATA: home }, home });
}

// Every env variable ANY shipped (or project) harness registers as its own
// marker, stripped from a base env — so a test asserting "no harness
// evidence" is never accidentally true or false depending on which harness
// happens to be running THIS suite itself. A caller adds back exactly the
// marker(s) its own scenario wants.
function allHarnessEnvKeys() {
  const keys = new Set();
  for (const h of registry().values()) for (const k of (h.env || [])) keys.add(k);
  return keys;
}
function strippedEnv(base) {
  const keys = allHarnessEnvKeys();
  const out = {};
  for (const [k, v] of Object.entries(base)) if (!keys.has(k)) out[k] = v;
  return out;
}

function runWaypost(cwd, args, env) {
  return spawnSync(process.execPath, [Waypost, ...args], { encoding: "utf8", cwd, timeout: 20000, env });
}

function settingPathOf(home) {
  return join(stateDirOf(home), `cleanup-limit.${hostSlug()}.json`);
}
function logPathOf(home) {
  return join(stateDirOf(home), `cleanup.${hostSlug()}.jsonl`);
}

function writeCurrentSetting(home, limit, extra = {}) {
  const dir = stateDirOf(home);
  mkdirSync(dir, { recursive: true });
  const rec = {
    v: 1, host: hostSlug(), limit, set_at: "2026-01-01T00:00:00.000Z", change: "set",
    previous: null, gate: { required: false, checked: "env-markers-only", harness: null, via: null, ancestors: [], markers: [], tty: false, answer: null },
    by: { session: null }, ...extra,
  };
  writeFileSync(settingPathOf(home), JSON.stringify(rec, null, 2) + "\n", "utf8");
  return rec;
}

function lastLogRecord(home) {
  const lines = readFileSync(logPathOf(home), "utf8").trim().split("\n").filter(Boolean);
  return JSON.parse(lines[lines.length - 1]);
}

// ─── no value: prints the setting, the last outcome, the choices ─────────

test("clean --limit (no value): nothing set reads as 'no limit set', in text and --json", () => {
  const home = tmpRoot("waypost-limit-print-home-");
  const proj = tmpRoot("waypost-limit-print-proj-");
  const env = strippedEnv(machineEnv(home));

  const text = runWaypost(proj, ["clean", "--limit"], env);
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /no limit set/);
  assert.match(text.stdout, /never run/);

  const json = runWaypost(proj, ["clean", "--limit", "--json"], env);
  assert.equal(json.status, 0, json.stderr);
  const out = JSON.parse(json.stdout);
  assert.equal(out.setting, null);
  assert.equal(out.last_auto, null);
  assert.ok(out.choices && out.choices.off);
});

test("clean --limit (no value): an existing setting is read back, formatted", () => {
  const home = tmpRoot("waypost-limit-print2-home-");
  const proj = tmpRoot("waypost-limit-print2-proj-");
  writeCurrentSetting(home, { kind: "gb", gb: 5, bytes: 5 * GB });
  const env = strippedEnv(machineEnv(home));

  const text = runWaypost(proj, ["clean", "--limit"], env);
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /5 GB/);

  const json = runWaypost(proj, ["clean", "--limit", "--json"], env);
  const out = JSON.parse(json.stdout);
  assert.equal(out.setting.limit.gb, 5);
});

// ─── an invalid value, and --limit with --apply ───────────────────────────

test("clean --limit <bad value>: refused, nothing written", () => {
  const home = tmpRoot("waypost-limit-bad-home-");
  const proj = tmpRoot("waypost-limit-bad-proj-");
  const env = strippedEnv(machineEnv(home));
  const r = runWaypost(proj, ["clean", "--limit", "banana"], env);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /invalid value/);
  assert.ok(!existsSync(settingPathOf(home)));
});

test("clean --limit together with --apply is refused outright", () => {
  const home = tmpRoot("waypost-limit-mutex-home-");
  const proj = tmpRoot("waypost-limit-mutex-proj-");
  const env = strippedEnv(machineEnv(home));
  const r = runWaypost(proj, ["clean", "--limit", "5", "--apply", "should"], env);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /refused together with --apply/);
  assert.ok(!existsSync(settingPathOf(home)));
});

// ─── same: a no-op, nothing written or logged ─────────────────────────────

test("clean --limit <same value>: 'unchanged', nothing written or logged", () => {
  const home = tmpRoot("waypost-limit-same-home-");
  const proj = tmpRoot("waypost-limit-same-proj-");
  writeCurrentSetting(home, { kind: "gb", gb: 10, bytes: 10 * GB });
  const before = readFileSync(settingPathOf(home), "utf8");
  const env = strippedEnv(machineEnv(home));

  const r = runWaypost(proj, ["clean", "--limit", "10"], env);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /unchanged/);
  assert.equal(readFileSync(settingPathOf(home), "utf8"), before);
  assert.ok(!existsSync(logPathOf(home)), "same' never logs either");
});

// ─── AC1 (a): WAYPOST_HARNESS/WAYPOST_PROC are never read ─────────────────

test("AC1 (a): an env marker (CLAUDECODE) refuses a gated change even with WAYPOST_HARNESS=unknown and a WAYPOST_PROC naming a shell — neither is ever read", () => {
  const home = tmpRoot("waypost-limit-ac1a-home-");
  const proj = tmpRoot("waypost-limit-ac1a-proj-");
  const env = {
    ...strippedEnv(machineEnv(home)),
    CLAUDECODE: "1", WAYPOST_HARNESS: "unknown", WAYPOST_PROC: JSON.stringify({ pid: 1, comm: "zsh" }),
  };
  const r = runWaypost(proj, ["clean", "--limit", "5"], env);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /claude/i);
  assert.ok(!existsSync(settingPathOf(home)), "nothing written");
});

// ─── AC1 (b): an ancestor process, by basename through a symlink ──────────

test("AC1 (b): an ancestor process named after a harness (matched by basename through a symlink) refuses a gated change — the message names its pid",
  { skip: process.platform === "win32" }, () => {
  const home = tmpRoot("waypost-limit-ac1b-home-");
  const proj = tmpRoot("waypost-limit-ac1b-proj-");
  const binDir = tmpRoot("waypost-limit-ac1b-bin-");
  const claudeLink = join(binDir, "claude");
  symlinkSync(process.execPath, claudeLink);

  // Every registry env marker is stripped — refusal here must come from the
  // ANCESTOR PROCESS alone, never from an env marker riding along.
  const env = strippedEnv(machineEnv(home));
  const scriptDir = tmpRoot("waypost-limit-ac1b-script-");
  const scriptPath = join(scriptDir, "run.cjs");
  writeFileSync(scriptPath, [
    'const { spawnSync } = require("node:child_process");',
    "const r = spawnSync(process.execPath, [process.env.WP_TARGET, \"clean\", \"--limit\", \"5\"], {",
    "  cwd: process.env.WP_PROJ, env: process.env, encoding: \"utf8\",",
    "});",
    'process.stdout.write(JSON.stringify({ status: r.status, stdout: r.stdout, stderr: r.stderr }));',
  ].join("\n"), "utf8");

  // The "claude" symlink is the DIRECT parent of the waypost process spawned
  // inside run.cjs — exactly the ancestor gateCheck's own process-table walk
  // is built to find, matched by basename the same way it matches a real
  // app-bundle executable's full path (the fix that landed with commit A).
  const outer = spawnSync(claudeLink, ["-e", `require(${JSON.stringify(scriptPath)})`], {
    encoding: "utf8", timeout: 20000,
    env: { ...env, WP_TARGET: Waypost, WP_PROJ: proj },
  });
  assert.equal(outer.status, 0, outer.stderr);
  const inner = JSON.parse(outer.stdout);
  assert.equal(inner.status, 1, inner.stderr);
  assert.match(inner.stderr, /claude/i);
  assert.match(inner.stderr, /pid \d+/, inner.stderr);
  assert.ok(!existsSync(settingPathOf(home)));
});

// ─── AC1 (c): tighten and switch are refused — the file is untouched ──────

test("AC1 (c): tighten (20 -> 10) is refused under a harness marker — the file is not touched, byte for byte", () => {
  const home = tmpRoot("waypost-limit-ac1c1-home-");
  const proj = tmpRoot("waypost-limit-ac1c1-proj-");
  writeCurrentSetting(home, { kind: "gb", gb: 20, bytes: 20 * GB });
  const before = readFileSync(settingPathOf(home), "utf8");
  const env = { ...strippedEnv(machineEnv(home)), CLAUDECODE: "1" };

  const r = runWaypost(proj, ["clean", "--limit", "10"], env);
  assert.equal(r.status, 1, r.stderr);
  assert.equal(readFileSync(settingPathOf(home), "utf8"), before);
});

test("AC1 (c): switch (20 -> free:30%) is refused under a harness marker — the file is not touched, byte for byte", () => {
  const home = tmpRoot("waypost-limit-ac1c2-home-");
  const proj = tmpRoot("waypost-limit-ac1c2-proj-");
  writeCurrentSetting(home, { kind: "gb", gb: 20, bytes: 20 * GB });
  const before = readFileSync(settingPathOf(home), "utf8");
  const env = { ...strippedEnv(machineEnv(home)), CLAUDECODE: "1" };

  const r = runWaypost(proj, ["clean", "--limit", "free:30%"], env);
  assert.equal(r.status, 1, r.stderr);
  assert.equal(readFileSync(settingPathOf(home), "utf8"), before);
});

// ─── AC1 (d): off and loosening work from anywhere, no gate required ──────

test("AC1 (d): off works under a harness marker — no gate required, one limit line logged", () => {
  const home = tmpRoot("waypost-limit-ac1d1-home-");
  const proj = tmpRoot("waypost-limit-ac1d1-proj-");
  writeCurrentSetting(home, { kind: "gb", gb: 10, bytes: 10 * GB });
  const env = { ...strippedEnv(machineEnv(home)), CLAUDECODE: "1" };

  const r = runWaypost(proj, ["clean", "--limit", "off"], env);
  assert.equal(r.status, 0, r.stderr);
  const rec = JSON.parse(readFileSync(settingPathOf(home), "utf8"));
  assert.equal(rec.limit.kind, "off");
  assert.equal(rec.gate.required, false);
  const logged = lastLogRecord(home);
  assert.equal(logged.kind, "limit");
  assert.equal(logged.to.kind, "off");
});

test("AC1 (d): loosening a GB limit (10 -> 20) works under a harness marker — no gate required, one limit line logged", () => {
  const home = tmpRoot("waypost-limit-ac1d2-home-");
  const proj = tmpRoot("waypost-limit-ac1d2-proj-");
  writeCurrentSetting(home, { kind: "gb", gb: 10, bytes: 10 * GB });
  const env = { ...strippedEnv(machineEnv(home)), CLAUDECODE: "1" };

  const r = runWaypost(proj, ["clean", "--limit", "20"], env);
  assert.equal(r.status, 0, r.stderr);
  const rec = JSON.parse(readFileSync(settingPathOf(home), "utf8"));
  assert.equal(rec.limit.gb, 20);
  assert.equal(rec.gate.required, false);
  const logged = lastLogRecord(home);
  assert.equal(logged.kind, "limit");
  assert.equal(logged.change, "loosen");
});

test("AC1 (d): loosening free: (30% -> 20%) works under a harness marker — no gate required, one limit line logged", () => {
  const home = tmpRoot("waypost-limit-ac1d3-home-");
  const proj = tmpRoot("waypost-limit-ac1d3-proj-");
  writeCurrentSetting(home, { kind: "free", percent: 30 });
  const env = { ...strippedEnv(machineEnv(home)), CLAUDECODE: "1" };

  const r = runWaypost(proj, ["clean", "--limit", "free:20%"], env);
  assert.equal(r.status, 0, r.stderr);
  const rec = JSON.parse(readFileSync(settingPathOf(home), "utf8"));
  assert.equal(rec.limit.kind, "free");
  assert.equal(rec.limit.percent, 20);
  assert.equal(rec.gate.required, false);
  const logged = lastLogRecord(home);
  assert.equal(logged.kind, "limit");
  assert.equal(logged.change, "loosen");
});

// ─── log rotation ──────────────────────────────────────────────────────────

test("log rotation: a file at or above 1 MiB is rotated to .1 before the next append; a second rotation replaces the old .1 rather than keeping it", () => {
  const home = tmpRoot("waypost-limit-rotate-home-");
  const proj = tmpRoot("waypost-limit-rotate-proj-");
  const dir = stateDirOf(home);
  mkdirSync(dir, { recursive: true });
  const logPath = logPathOf(home);
  const env = strippedEnv(machineEnv(home));

  const contentA = "a".repeat(1024 * 1024) + "\n";
  writeFileSync(logPath, contentA, "utf8");
  writeCurrentSetting(home, { kind: "gb", gb: 10, bytes: 10 * GB });

  const r1 = runWaypost(proj, ["clean", "--limit", "off"], env); // gb:10 -> off: ungated
  assert.equal(r1.status, 0, r1.stderr);
  assert.equal(readFileSync(`${logPath}.1`, "utf8"), contentA, "the OLD content moved to .1 untouched");
  const afterFirst = readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean);
  assert.equal(afterFirst.length, 1, "the new file starts with exactly the one line just appended");
  assert.equal(JSON.parse(afterFirst[0]).kind, "limit");

  const contentC = "c".repeat(1024 * 1024) + "\n";
  writeFileSync(logPath, contentC, "utf8"); // simulate the log growing large again
  writeCurrentSetting(home, { kind: "gb", gb: 20, bytes: 20 * GB });
  const r2 = runWaypost(proj, ["clean", "--limit", "30"], env); // gb:20 -> gb:30: loosen, ungated
  assert.equal(r2.status, 0, r2.stderr);
  assert.equal(readFileSync(`${logPath}.1`, "utf8"), contentC, "the SECOND rotation replaces the first .1, never appends to it");
  const afterSecond = readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean);
  assert.equal(afterSecond.length, 1);
});

// ─── AC12: leftovers — adopt a dead one, leave a live one ─────────────────

test("AC12: waypost clean adopts a leftover whose marker names a dead pid, leaves one whose marker names a live pid, and the adopted one is gone within 10s", async () => {
  const home = tmpRoot("waypost-limit-ac12-home-");
  const proj = tmpRoot("waypost-limit-ac12-proj-");
  git(proj, ["init", "-q"]);
  // realpath'd: slotWhere() (bin/waypost) resolves the git common dir through
  // realpath too, and on macOS the temp root itself sits behind a symlink
  // (/var -> /private/var) — comparing the raw path would silently miss it.
  const common = join(realpathSync(proj), ".git");
  const removingDir = join(common, REMOVING_DIR);
  mkdirSync(removingDir, { recursive: true });

  // The exact name shape renameForRemoval mints and __waypost-delete's own
  // validation requires: lowercase-alnum, "-", digits, "-", 6 hex chars.
  const deadName = `${Date.now().toString(36)}-99999-a1b2c3`;
  const aliveName = `${Date.now().toString(36)}-99998-d4e5f6`;

  mkdirSync(join(removingDir, deadName), { recursive: true });
  writeFileSync(join(removingDir, deadName, "f.txt"), "x", "utf8");
  writeFileSync(join(removingDir, `${deadName}.json`), JSON.stringify({
    host: RAW_HOST, proc: { pid: 4194999, started: null, ticks: null, comm: "waypost" },
    boot: bootIdentity(), uptime: 0, started_at: "2026-01-01T00:00:00.000Z", from: "dead", id: "p-dead",
  }) + "\n", "utf8");

  mkdirSync(join(removingDir, aliveName), { recursive: true });
  writeFileSync(join(removingDir, aliveName, "f.txt"), "x", "utf8");
  writeFileSync(join(removingDir, `${aliveName}.json`), JSON.stringify({
    host: RAW_HOST, proc: { pid: process.pid, started: null, ticks: null, comm: "test" },
    boot: bootIdentity(), uptime: 0, started_at: new Date().toISOString(), from: "alive", id: "p-alive",
  }) + "\n", "utf8");

  const env = strippedEnv(machineEnv(home));
  const r = runWaypost(proj, ["clean", "--json"], env);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.ok(out.leftovers.handed_off.includes(deadName), JSON.stringify(out.leftovers));
  assert.ok(!out.leftovers.handed_off.includes(aliveName), JSON.stringify(out.leftovers));
  assert.equal(out.leftovers.left, 1);

  // The deleter is detached — the outer command returns before it finishes.
  const deadline = Date.now() + 10000;
  while (existsSync(join(removingDir, deadName)) && Date.now() < deadline) {
    await new Promise((res) => setTimeout(res, 200));
  }
  assert.ok(!existsSync(join(removingDir, deadName)), "the adopted leftover is gone within 10s");
  assert.ok(!existsSync(join(removingDir, `${deadName}.json`)), "its marker is gone too");
  assert.ok(existsSync(join(removingDir, aliveName)), "the live one is left alone");
  assert.ok(existsSync(join(removingDir, `${aliveName}.json`)));
});

test("AC12: a leftover that lost its marker is re-marked and removed; a name of any other shape is left and counted", async () => {
  const home = tmpRoot("waypost-limit-ac12b-home-");
  const proj = tmpRoot("waypost-limit-ac12b-proj-");
  git(proj, ["init", "-q"]);
  const removingDir = join(realpathSync(proj), ".git", REMOVING_DIR);
  mkdirSync(removingDir, { recursive: true });

  const orphan = `${Date.now().toString(36)}-99997-0a0b0c`;
  mkdirSync(join(removingDir, orphan), { recursive: true });
  writeFileSync(join(removingDir, orphan, "f.txt"), "x", "utf8");
  const foreign = "not-ours";
  mkdirSync(join(removingDir, foreign), { recursive: true });
  writeFileSync(join(removingDir, foreign, "f.txt"), "x", "utf8");

  const r = runWaypost(proj, ["clean", "--json"], strippedEnv(machineEnv(home)));
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.ok(out.leftovers.handed_off.includes(orphan), JSON.stringify(out.leftovers));
  assert.ok(!out.leftovers.handed_off.includes(foreign), JSON.stringify(out.leftovers));
  assert.equal(out.leftovers.left, 1);

  const deadline = Date.now() + 10000;
  while (existsSync(join(removingDir, orphan)) && Date.now() < deadline) {
    await new Promise((res) => setTimeout(res, 200));
  }
  assert.ok(!existsSync(join(removingDir, orphan)), "the re-marked orphan is gone within 10s");
  assert.ok(existsSync(join(removingDir, foreign)), "a name Waypost never minted is never removed");
});
