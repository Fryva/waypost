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
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, symlinkSync, realpathSync,
  utimesSync, statSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir, hostname } from "node:os";
import { spawnSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { machineStateDir, REMOVING_DIR } from "../scripts/lib.mjs";
import { hostSlug, processTable, startTicks } from "../scripts/presence.mjs";
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

// ─── shared fixtures for the automatic path (commit C) ────────────────────

function sleepMs(ms) {
  const sab = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(sab), 0, 0, ms);
}

// A tagged, git-ignored directory the automatic path can find. `.gitignore`
// is written once per project by the caller — see gitProject().
function tagFixture(root, rel, bytes = 1000) {
  const abs = join(root, rel);
  mkdirSync(abs, { recursive: true });
  writeFileSync(join(abs, "CACHEDIR.TAG"), "Signature: 8a477f597d28d172789f06886806bc55\n", "utf8");
  writeFileSync(join(abs, "obj.bin"), Buffer.alloc(bytes, 1));
  return abs;
}

// Stamps every entry in a subtree to "now" — ctime cannot be backdated (any
// touch resets it to the real moment it ran), so relative age between
// several fixtures comes from the ORDER these calls happen in, not from the
// timestamp passed to utimesSync. WAYPOST_CLEAN_NOW then shifts the whole
// simulated clock forward uniformly, so every fixture reads idle while
// their relative order (oldest call first) survives exactly.
function touchTree(abs) {
  const now = new Date();
  const walk = (p) => {
    try { utimesSync(p, now, now); } catch { return; }
    let st;
    try { st = statSync(p); } catch { return; }
    if (st.isDirectory()) for (const n of readdirSync(p)) walk(join(p, n));
  };
  walk(abs);
}

// A git repository with a root-anchored .gitignore for every tag directory
// name this suite uses, so `git init` + one `add`/`commit` covers every
// fixture a test adds afterward.
function gitProject(prefix, ignored) {
  const root = tmpRoot(prefix);
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  writeFileSync(join(root, ".gitignore"), ignored.map((n) => `/${n}\n`).join(""), "utf8");
  writeFileSync(join(root, "README.md"), "hi\n", "utf8");
  git(root, ["add", ".gitignore", "README.md"]);
  git(root, ["commit", "-q", "-m", "init"]);
  return root;
}

function gitCommonOf(proj) {
  return join(realpathSync(proj), ".git");
}

function cleanNowPlusDays(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function slotsDirFor(home) {
  return join(stateDirOf(home), `slots.${hostSlug()}`);
}

// The pattern tests/slots.test.mjs's own selfRecord() uses: a record naming
// THIS test process — genuinely alive, on this boot, on this host — the
// cheapest way to manufacture a real LIVE holder without spawning a second
// process.
function selfHolderRecord(id, extra = {}) {
  const table = process.platform === "win32" ? null : processTable();
  const self = table ? table.get(process.pid) : null;
  return {
    id, host: RAW_HOST,
    proc: { pid: process.pid, started: self ? self.started : null, ticks: startTicks(process.pid), comm: "test" },
    boot: bootIdentity(), uptime: 0,
    session: "limit-test", harness: "test", command: "node -e test",
    started_at: new Date().toISOString(),
    ...extra,
  };
}

function writeHolderRecord(home, rec) {
  const dir = slotsDirFor(home);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${rec.id}.json`), JSON.stringify(rec, null, 2) + "\n", "utf8");
}

// `waypost run --heavy -- <wrapped…>` as a child, hermetic: its own temp
// HOME (and so its own slot directory) never competes with, or waits
// behind, whatever else this machine is doing right now.
function runHeavyChild(proj, wrapped, env, extraArgs = []) {
  return spawnSync(process.execPath, [Waypost, "run", "--heavy", ...extraArgs, "--", ...wrapped], {
    cwd: proj, encoding: "utf8", timeout: 30000, env,
  });
}

function autoCleanEnv(home, extra = {}) {
  return strippedEnv(machineEnv(home, {
    WAYPOST_CLEAN_NOW: cleanNowPlusDays(8),
    ...extra,
  }));
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

test("AC1 (a): an env marker (CLAUDECODE) refuses a gated change, and the variables the gate promises never to read change nothing", () => {
  const home = tmpRoot("waypost-limit-ac1a-home-");
  const proj = tmpRoot("waypost-limit-ac1a-proj-");
  const base = { ...strippedEnv(machineEnv(home)), CLAUDECODE: "1" };

  // The claim under test is a negative one — the gate never READS
  // WAYPOST_HARNESS or WAYPOST_PROC — so it is checked by differencing: the
  // same command with those variables set to lie, and with them absent, must
  // refuse identically. Asserting WHICH harness is named cannot work here: this
  // runs bin/waypost in a subprocess, so the gate walks the real ancestor chain,
  // and on a host where the suite is itself run from inside a harness the real
  // one legitimately wins over CLAUDECODE. (It used to pass only because the
  // process table was empty — see WP-19; that accident is what this shape
  // removes.) The gate's own logic is covered hermetically in
  // tests/harness.test.mjs, where gateCheck takes a synthetic table.
  const lying = runWaypost(proj, ["clean", "--limit", "5"], {
    ...base, WAYPOST_HARNESS: "unknown", WAYPOST_PROC: JSON.stringify({ pid: 1, comm: "zsh" }),
  });
  const honest = runWaypost(proj, ["clean", "--limit", "5"], base);

  assert.equal(lying.status, 1, lying.stderr);
  assert.equal(honest.status, 1, honest.stderr);
  assert.equal(lying.stderr, honest.stderr,
    "WAYPOST_HARNESS and WAYPOST_PROC are not evidence: setting them changed the verdict");
  assert.doesNotMatch(lying.stderr, /\bzsh\b/, "a process the gate promised not to read is not named");
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

// ─── automatic cleanup at the end of `waypost run --heavy` (commit C) ────

test("AC3: idle for only 2 days (under the 7-day floor) — a tiny GB threshold protects the working set; the report and log say to raise it", () => {
  const home = tmpRoot("waypost-limit-ac3-home-");
  const proj = gitProject("waypost-limit-ac3-proj-", ["a", "b", "c"]);
  for (const n of ["a", "b", "c"]) touchTree(tagFixture(proj, n, 20000));
  writeCurrentSetting(home, { kind: "gb", gb: 0.00001, bytes: 0.00001 * GB });
  const env = autoCleanEnv(home, { WAYPOST_CLEAN_NOW: cleanNowPlusDays(2) });
  const r = runHeavyChild(proj, ["node", "-e", "1"], env);
  assert.equal(r.status, 0, r.stderr);
  for (const n of ["a", "b", "c"]) assert.ok(existsSync(join(proj, n)), `${n} survives`);
  assert.match(r.stderr, /raise it/);
  const rec = lastLogRecord(home);
  assert.equal(rec.kind, "auto");
  assert.equal(rec.result, "ran");
  assert.deepEqual(rec.renamed, []);
  assert.equal(rec.reason, null);
});

test("AC4: three idle items over a small GB threshold — only the single oldest is renamed, enough to cover the need", () => {
  const home = tmpRoot("waypost-limit-ac4-home-");
  const proj = gitProject("waypost-limit-ac4-proj-", ["a", "b", "c"]);
  const bytesEach = 45000;
  touchTree(tagFixture(proj, "a", bytesEach)); sleepMs(30);
  touchTree(tagFixture(proj, "b", bytesEach)); sleepMs(30);
  touchTree(tagFixture(proj, "c", bytesEach));
  writeCurrentSetting(home, { kind: "gb", gb: 0.0001, bytes: 0.0001 * GB });
  const env = autoCleanEnv(home);
  const r = runHeavyChild(proj, ["node", "-e", "1"], env);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!existsSync(join(proj, "a")), "the oldest is gone from its original place");
  assert.ok(existsSync(join(proj, "b")), "b survives");
  assert.ok(existsSync(join(proj, "c")), "c survives");
  const rec = lastLogRecord(home);
  assert.equal(rec.renamed.length, 1);
  assert.match(rec.renamed[0].path, /(^|\/)a$/);
});

test("AC5: under free:30%, the probe's own statfs decides the shortfall once — exactly the two oldest cover it", () => {
  const home = tmpRoot("waypost-limit-ac5-home-");
  const proj = gitProject("waypost-limit-ac5-proj-", ["a", "b", "c"]);
  const bytesEach = 30000;
  touchTree(tagFixture(proj, "a", bytesEach)); sleepMs(30);
  touchTree(tagFixture(proj, "b", bytesEach)); sleepMs(30);
  touchTree(tagFixture(proj, "c", bytesEach));
  writeCurrentSetting(home, { kind: "free", percent: 30 });
  // size 1e6, avail 250000 -> want 300000, shortfall 50000
  const env = autoCleanEnv(home, { WAYPOST_AUTOCLEAN_PROBE: JSON.stringify({ statfs: { size: 1e6, avail: 250000 } }) });
  const r = runHeavyChild(proj, ["node", "-e", "1"], env);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!existsSync(join(proj, "a")));
  assert.ok(!existsSync(join(proj, "b")));
  assert.ok(existsSync(join(proj, "c")));
  const rec = lastLogRecord(home);
  assert.equal(rec.shortfall, 50000);
  assert.equal(rec.renamed.length, 2);
});

test("AC6: a generic name holding a package, a tagged directory holding a package, and .terraform never go through the automatic path — excluded names each reason", () => {
  const home = tmpRoot("waypost-limit-ac6-home-");
  const proj = gitProject("waypost-limit-ac6-proj-", ["build", "pkgtag", ".terraform"]);

  const buildDir = join(proj, "build");
  mkdirSync(buildDir, { recursive: true });
  writeFileSync(join(buildDir, "App.dmg"), Buffer.alloc(5000, 1));
  touchTree(buildDir);

  const pkgtagDir = join(proj, "pkgtag");
  mkdirSync(join(pkgtagDir, "out"), { recursive: true });
  writeFileSync(join(pkgtagDir, "CACHEDIR.TAG"), "Signature: 8a477f597d28d172789f06886806bc55\n", "utf8");
  writeFileSync(join(pkgtagDir, "out", "App.pkg"), Buffer.alloc(5000, 1));
  touchTree(pkgtagDir);

  const tfDir = join(proj, ".terraform");
  mkdirSync(tfDir, { recursive: true });
  writeFileSync(join(tfDir, "environment"), "default\n", "utf8");
  touchTree(tfDir);

  writeCurrentSetting(home, { kind: "gb", gb: 0.00001, bytes: 0.00001 * GB });
  const env = autoCleanEnv(home);
  const r = runHeavyChild(proj, ["node", "-e", "1"], env);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(buildDir));
  assert.ok(existsSync(pkgtagDir));
  assert.ok(existsSync(tfDir));

  const rec = lastLogRecord(home);
  assert.equal(rec.result, "ran");
  assert.deepEqual(rec.renamed, []);
  const reasons = rec.excluded.map((e) => e.reason).join(" | ");
  assert.match(reasons, /generic name/);
  assert.match(reasons, /distributable package/);
  assert.match(reasons, /auto: false/);
});

test("AC7: a linked worktree and a nested repository, each holding an idle tag directory, are never entered — nested_skipped names them", () => {
  const home = tmpRoot("waypost-limit-ac7-home-");
  const proj = gitProject("waypost-limit-ac7-proj-", []);
  git(proj, ["branch", "wtbranch"]);
  const wtDir = join(proj, "wt");
  git(proj, ["worktree", "add", "-q", wtDir, "wtbranch"]);
  touchTree(tagFixture(wtDir, "b", 20000));
  const subDir = join(proj, "sub");
  mkdirSync(subDir, { recursive: true });
  git(subDir, ["init", "-q"]);
  git(subDir, ["config", "user.email", "test@example.com"]);
  git(subDir, ["config", "user.name", "Test"]);
  touchTree(tagFixture(subDir, "c", 20000));

  writeCurrentSetting(home, { kind: "gb", gb: 0.00001, bytes: 0.00001 * GB });
  const env = autoCleanEnv(home);
  const r = runHeavyChild(proj, ["node", "-e", "1"], env);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(wtDir, "b")), "the worktree's own idle tag dir survives");
  assert.ok(existsSync(join(subDir, "c")), "the nested repository's own idle tag dir survives");
  const rec = lastLogRecord(home);
  assert.equal(rec.result, "ran");
  assert.ok(rec.nested_skipped >= 2, JSON.stringify(rec));
  assert.deepEqual(rec.renamed, []);
});

test("AC8: a live holder whose root is the fixture itself blocks — nothing renamed", () => {
  const home = tmpRoot("waypost-limit-ac8a-home-");
  const proj = gitProject("waypost-limit-ac8a-proj-", ["a"]);
  touchTree(tagFixture(proj, "a", 20000));
  writeCurrentSetting(home, { kind: "gb", gb: 0.00001, bytes: 0.00001 * GB });
  writeHolderRecord(home, selfHolderRecord("other-1", { root: realpathSync(proj), cwd: realpathSync(proj) }));

  const env = autoCleanEnv(home);
  const r = runHeavyChild(proj, ["node", "-e", "1"], env);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(proj, "a")));
  const rec = lastLogRecord(home);
  assert.equal(rec.result, "skipped");
  assert.equal(rec.renamed, undefined);
  assert.match(rec.reason || "", /overlaps/);
});

test("AC8: a live holder whose root is an ancestor of the fixture blocks it too", () => {
  const home = tmpRoot("waypost-limit-ac8b-home-");
  const parent = tmpRoot("waypost-limit-ac8b-parent-");
  const proj = join(parent, "proj");
  mkdirSync(proj, { recursive: true });
  git(proj, ["init", "-q"]);
  git(proj, ["config", "user.email", "test@example.com"]);
  git(proj, ["config", "user.name", "Test"]);
  writeFileSync(join(proj, ".gitignore"), "/a\n", "utf8");
  git(proj, ["add", ".gitignore"]);
  git(proj, ["commit", "-q", "-m", "init"]);
  touchTree(tagFixture(proj, "a", 20000));
  writeCurrentSetting(home, { kind: "gb", gb: 0.00001, bytes: 0.00001 * GB });
  writeHolderRecord(home, selfHolderRecord("other-2", { root: realpathSync(parent), cwd: realpathSync(parent) }));

  const env = autoCleanEnv(home);
  const r = runHeavyChild(proj, ["node", "-e", "1"], env);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(proj, "a")));
});

test("AC8: a live holder whose root is a descendant of the fixture blocks it too", () => {
  const home = tmpRoot("waypost-limit-ac8c-home-");
  const proj = gitProject("waypost-limit-ac8c-proj-", ["a"]);
  touchTree(tagFixture(proj, "a", 20000));
  const sub = join(proj, "somewhere", "deep");
  mkdirSync(sub, { recursive: true });
  writeCurrentSetting(home, { kind: "gb", gb: 0.00001, bytes: 0.00001 * GB });
  writeHolderRecord(home, selfHolderRecord("other-3", { root: realpathSync(sub), cwd: realpathSync(sub) }));

  const env = autoCleanEnv(home);
  const r = runHeavyChild(proj, ["node", "-e", "1"], env);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(proj, "a")));
});

test("AC8: a live holder naming neither root nor cwd blocks unconditionally — an older Waypost", () => {
  const home = tmpRoot("waypost-limit-ac8d-home-");
  const proj = gitProject("waypost-limit-ac8d-proj-", ["a"]);
  touchTree(tagFixture(proj, "a", 20000));
  writeCurrentSetting(home, { kind: "gb", gb: 0.00001, bytes: 0.00001 * GB });
  writeHolderRecord(home, selfHolderRecord("other-4"));

  const env = autoCleanEnv(home);
  const r = runHeavyChild(proj, ["node", "-e", "1"], env);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(proj, "a")));
});

test("AC8: a live holder whose root is unrelated does not block — the sweep proceeds normally", () => {
  const home = tmpRoot("waypost-limit-ac8e-home-");
  const proj = gitProject("waypost-limit-ac8e-proj-", ["a"]);
  touchTree(tagFixture(proj, "a", 20000));
  const elsewhere = tmpRoot("waypost-limit-ac8e-elsewhere-");
  writeCurrentSetting(home, { kind: "gb", gb: 0.00001, bytes: 0.00001 * GB });
  writeHolderRecord(home, selfHolderRecord("other-5", { root: realpathSync(elsewhere), cwd: realpathSync(elsewhere) }));

  const env = autoCleanEnv(home);
  const r = runHeavyChild(proj, ["node", "-e", "1"], env);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!existsSync(join(proj, "a")), "an unrelated holder never blocks");
});

test("AC8: holders are re-read before each item — a new one appearing after the first rename stops the second", async () => {
  const home = tmpRoot("waypost-limit-ac8f-home-");
  const proj = gitProject("waypost-limit-ac8f-proj-", ["a", "b"]);
  touchTree(tagFixture(proj, "a", 20000)); sleepMs(30);
  touchTree(tagFixture(proj, "b", 20000));
  // A tiny threshold — both items are needed to cover it, so the loop keeps
  // going past the first rename instead of stopping on its own.
  writeCurrentSetting(home, { kind: "gb", gb: 0.00001, bytes: 0.00001 * GB });

  const env = autoCleanEnv(home, { WAYPOST_AUTOCLEAN_PROBE: JSON.stringify({ pause_ms: 2000 }) });
  const child = spawn(process.execPath, [Waypost, "run", "--heavy", "--", "node", "-e", "1"], { cwd: proj, env, stdio: ["ignore", "ignore", "pipe"] });
  let sawPause = false;
  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    if (!sawPause && /test pause after 1 rename/.test(text)) {
      sawPause = true;
      writeHolderRecord(home, selfHolderRecord("late-holder", { root: realpathSync(proj), cwd: realpathSync(proj) }));
    }
  });
  const [code] = await new Promise((res) => child.on("exit", (c) => res([c])));
  assert.equal(code, 0);
  assert.ok(sawPause, "the pause line appeared");
  assert.ok(!existsSync(join(proj, "a")), "a was renamed before the pause");
  assert.ok(existsSync(join(proj, "b")), "b is never touched once a holder appears");
});

test("AC8: a live presence record from another host in this checkout skips the sweep as a shared checkout", () => {
  const home = tmpRoot("waypost-limit-ac8g-home-");
  const proj = gitProject("waypost-limit-ac8g-proj-", ["a"]);
  touchTree(tagFixture(proj, "a", 20000));
  writeCurrentSetting(home, { kind: "gb", gb: 0.00001, bytes: 0.00001 * GB });

  const vault = join(proj, "vault");
  mkdirSync(vault, { recursive: true });
  mkdirSync(join(proj, ".waypost"), { recursive: true });
  writeFileSync(join(proj, ".waypost", "projectstore.json"), JSON.stringify({ vault_path: "vault" }) + "\n", "utf8");

  const common = gitCommonOf(proj);
  const presenceDir = join(common, "waypost", "vault", "presence");
  mkdirSync(presenceDir, { recursive: true });
  const realProj = realpathSync(proj);
  writeFileSync(join(presenceDir, "other-session.json"), JSON.stringify({
    session: "other-session", host: "some-other-host", os: "darwin-24", user: "x",
    harness: "claude", project_root: realProj, common_dir: common,
    vault_rel: ".", proc: null, seq: 1, at: new Date().toISOString(), started_at: new Date().toISOString(),
    doing: null, claim: null,
  }) + "\n", "utf8");

  const env = autoCleanEnv(home);
  const r = runHeavyChild(proj, ["node", "-e", "1"], env);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(proj, "a")));
  const rec = lastLogRecord(home);
  assert.equal(rec.result, "skipped");
  assert.match(rec.reason, /shared/);
});

test("AC9: the wrapped command ending itself by SIGTERM triggers no cleanup — exit 143, nothing renamed", { skip: process.platform === "win32" ? "POSIX signals only" : false }, () => {
  const home = tmpRoot("waypost-limit-ac9a-home-");
  const proj = gitProject("waypost-limit-ac9a-proj-", ["a"]);
  touchTree(tagFixture(proj, "a", 20000));
  writeCurrentSetting(home, { kind: "gb", gb: 0.00001, bytes: 0.00001 * GB });
  const env = autoCleanEnv(home);
  const r = runHeavyChild(proj, ["node", "-e", "process.kill(process.pid, 'SIGTERM')"], env);
  assert.equal(r.status, 143);
  assert.ok(existsSync(join(proj, "a")));
  const rec = lastLogRecord(home);
  assert.equal(rec.result, "skipped");
  assert.match(rec.reason, /ended by SIGTERM/);
});

test("AC9: a signal to the wrapper itself, mid-cleanup, ends it at once — the already-renamed item is safe, the rest untouched",
  { skip: process.platform === "win32" ? "POSIX signals only" : false },
  async () => {
    const home = tmpRoot("waypost-limit-ac9b-home-");
    const proj = gitProject("waypost-limit-ac9b-proj-", ["a", "b"]);
    touchTree(tagFixture(proj, "a", 20000)); sleepMs(30);
    touchTree(tagFixture(proj, "b", 20000));
    // A tiny threshold — both items are needed, so the loop reaches b's own
    // holder/deadline check instead of stopping right after a.
    writeCurrentSetting(home, { kind: "gb", gb: 0.00001, bytes: 0.00001 * GB });

    const env = autoCleanEnv(home, { WAYPOST_AUTOCLEAN_PROBE: JSON.stringify({ pause_ms: 4000 }) });
    const child = spawn(process.execPath, [Waypost, "run", "--heavy", "--", "node", "-e", "1"], { cwd: proj, env, stdio: ["ignore", "ignore", "pipe"] });
    let killed = false;
    child.stderr.on("data", (chunk) => {
      if (!killed && /test pause after 1 rename/.test(chunk.toString())) {
        killed = true;
        child.kill("SIGTERM");
      }
    });
    const [, signal] = await new Promise((res) => child.on("exit", (c, s) => res([c, s])));
    assert.ok(killed, "the pause line was seen and the wrapper was signalled");
    assert.equal(signal, "SIGTERM");
    assert.ok(!existsSync(join(proj, "a")), "a was already renamed aside");
    assert.ok(existsSync(join(proj, "b")), "b was never reached");

    const common = gitCommonOf(proj);
    const removingDir = join(common, REMOVING_DIR);
    const entries = readdirSync(removingDir).filter((n) => !n.endsWith(".json"));
    assert.equal(entries.length, 1, JSON.stringify(entries));
    const marker = JSON.parse(readFileSync(join(removingDir, `${entries[0]}.json`), "utf8"));
    assert.equal(marker.proc.pid, child.pid, "the marker names the wrapper's own (now dead) pid — the deleter was never spawned");
  });

test("AC10: a short deadline probe stops the sweep after the first item — status names the deadline", async () => {
  const home = tmpRoot("waypost-limit-ac10-home-");
  const proj = gitProject("waypost-limit-ac10-proj-", ["a", "b"]);
  touchTree(tagFixture(proj, "a", 20000)); sleepMs(30);
  touchTree(tagFixture(proj, "b", 20000));
  // A tiny threshold — both items are needed, so the sweep is still going
  // (paused after a) when the deadline hits, rather than stopping on its own.
  writeCurrentSetting(home, { kind: "gb", gb: 0.00001, bytes: 0.00001 * GB });
  const env = autoCleanEnv(home, { WAYPOST_AUTOCLEAN_PROBE: JSON.stringify({ deadline_ms: 1000, pause_ms: 1500 }) });

  const r = runHeavyChild(proj, ["node", "-e", "1"], env);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!existsSync(join(proj, "a")), "a was renamed before the deadline hit");
  assert.ok(existsSync(join(proj, "b")), "b was never reached — the deadline hit during the pause after a");
  const rec = lastLogRecord(home);
  assert.equal(rec.deadline, true);

  const statusOut = runWaypost(proj, ["status"], env).stdout;
  assert.match(statusOut, /deadline/);
});

test("AC11: root under a Dropbox path reads as non-local storage — nothing removed, the reason is logged", () => {
  const home = tmpRoot("waypost-limit-ac11a-home-");
  const dbx = join(tmpdir(), "Dropbox");
  mkdirSync(dbx, { recursive: true });
  ROOTS.push(dbx);
  const proj = join(dbx, `waypost-limit-ac11a-proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(proj, { recursive: true });
  git(proj, ["init", "-q"]);
  git(proj, ["config", "user.email", "test@example.com"]);
  git(proj, ["config", "user.name", "Test"]);
  writeFileSync(join(proj, ".gitignore"), "/a\n", "utf8");
  git(proj, ["add", ".gitignore"]);
  git(proj, ["commit", "-q", "-m", "init"]);
  touchTree(tagFixture(proj, "a", 20000));
  writeCurrentSetting(home, { kind: "gb", gb: 0.00001, bytes: 0.00001 * GB });
  const env = autoCleanEnv(home);
  const r = runHeavyChild(proj, ["node", "-e", "1"], env);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(proj, "a")));
  const rec = lastLogRecord(home);
  assert.equal(rec.result, "skipped");
  assert.match(rec.reason, /Dropbox|cloud/i);
});

test("AC11: a working directory outside any git repository skips — 'not in a git work tree'", () => {
  const home = tmpRoot("waypost-limit-ac11b-home-");
  const proj = tmpRoot("waypost-limit-ac11b-proj-");
  writeCurrentSetting(home, { kind: "gb", gb: 0.00001, bytes: 0.00001 * GB });
  const env = autoCleanEnv(home);
  const r = runHeavyChild(proj, ["node", "-e", "1"], env);
  assert.equal(r.status, 0, r.stderr);
  const rec = lastLogRecord(home);
  assert.equal(rec.result, "skipped");
  assert.match(rec.reason, /git work tree/);
});

test("AC11: HOME equal to the project root skips it as a protected path", () => {
  const proj = gitProject("waypost-limit-ac11c-proj-", ["a"]);
  touchTree(tagFixture(proj, "a", 20000));
  writeCurrentSetting(proj, { kind: "gb", gb: 0.00001, bytes: 0.00001 * GB });
  const env = autoCleanEnv(proj);
  const r = runHeavyChild(proj, ["node", "-e", "1"], env);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(proj, "a")));
  const rec = lastLogRecord(proj);
  assert.equal(rec.result, "skipped");
  assert.match(rec.reason, /protected/);
});

test("AC13: the wrapped command's own exit status passes through unchanged when something was renamed", () => {
  const home = tmpRoot("waypost-limit-ac13a-home-");
  const proj = gitProject("waypost-limit-ac13a-proj-", ["a"]);
  touchTree(tagFixture(proj, "a", 20000));
  writeCurrentSetting(home, { kind: "gb", gb: 0.00001, bytes: 0.00001 * GB });
  const env = autoCleanEnv(home);
  const r = runHeavyChild(proj, ["node", "-e", "process.exit(3)"], env);
  assert.equal(r.status, 3);
  assert.ok(!existsSync(join(proj, "a")), "still renamed despite the wrapped command's own non-zero exit");
});

test("AC13: a cleanup failure never changes the wrapped command's own exit status", () => {
  const home = tmpRoot("waypost-limit-ac13b-home-");
  const proj = gitProject("waypost-limit-ac13b-proj-", ["a"]);
  touchTree(tagFixture(proj, "a", 20000));
  writeCurrentSetting(home, { kind: "gb", gb: 0.00001, bytes: 0.00001 * GB });
  // waypost-removing/ as a plain FILE blocks renameForRemoval's own mkdirSync.
  writeFileSync(join(gitCommonOf(proj), REMOVING_DIR), "not a directory", "utf8");
  const env = autoCleanEnv(home);
  const r = runHeavyChild(proj, ["node", "-e", "process.exit(3)"], env);
  assert.equal(r.status, 3, "the wrapped command's own exit status, unaffected by the cleanup's own failure");
  const rec = lastLogRecord(home);
  assert.ok(rec.result === "failed" || (rec.skipped_items && rec.skipped_items.length), JSON.stringify(rec));
});

test("AC13: the log grows by exactly one line per run", () => {
  const home = tmpRoot("waypost-limit-ac13c-home-");
  const proj = gitProject("waypost-limit-ac13c-proj-", ["a"]);
  touchTree(tagFixture(proj, "a", 20000));
  writeCurrentSetting(home, { kind: "gb", gb: 100, bytes: 100 * GB });
  const env = autoCleanEnv(home);
  runHeavyChild(proj, ["node", "-e", "1"], env);
  const linesAfterFirst = readFileSync(logPathOf(home), "utf8").trim().split("\n").filter(Boolean).length;
  assert.equal(linesAfterFirst, 1);
  runHeavyChild(proj, ["node", "-e", "1"], env);
  const linesAfterSecond = readFileSync(logPathOf(home), "utf8").trim().split("\n").filter(Boolean).length;
  assert.equal(linesAfterSecond, 2);
});
