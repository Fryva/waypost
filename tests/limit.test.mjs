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

// Children spawned from this file never move a developer's real machine state.
import "./env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, symlinkSync, realpathSync,
  utimesSync, statSync,
} from "node:fs";
import { join, dirname, basename } from "node:path";
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

// Brief is a read-only view of the same setting/outcome; compactness must not hide facts.
test("brief cleanup: compact text preserves facts and full text keeps the legacy line", () => {
  const home = tmpRoot("waypost-brief-cleanup-home-");
  const proj = tmpRoot("waypost-brief-cleanup-proj-");
  const vault = join(proj, "vault");
  mkdirSync(join(proj, ".waypost")); mkdirSync(vault);
  writeFileSync(join(proj, ".waypost", "projectstore.json"), JSON.stringify({ vault_path: "vault", layout: "engineering" }));
  writeFileSync(join(vault, ".projectstore.json"), JSON.stringify({ self_install: "off" }));
  const env = machineEnv(home, { WAYPOST_HOME: REPO, WAYPOST_PROJECT_DIR: proj, WAYPOST_HARNESS: "codex", WAYPOST_SESSION_ID: "brief-cleanup-test" });
  const at = "2026-01-02T03:04:05.000Z";
  const reason = "another automatic cleanup: blocked — " + "details ".repeat(30);
  const cases = [
    [null, null, null], ["{broken", null, null],
    ["{}", null, "no limit set"], ['{"limit":null}', null, "no limit set"],
    [{ kind: "free", percent: 11 }, null, "free:11%"],
    [{ kind: "gb", gb: 5, bytes: 5 * GB }, null, "5 GB per project"],
    [{ kind: "off" }, null, "off — no automatic cleanup"],
    [{ kind: "unknown" }, null, "no limit set"],
    [{ kind: "free", percent: 11 }, { result: "ran", at, time: "ignored", renamed: [{}, {}], stayed: [{}], deadline: true }, "free:11%", `ran (${at}) (stopped at its deadline) — 2 item(s) removed, 1 stayed`],
    [{ kind: "free", percent: 11 }, { result: "ran", time: at, renamed: 3, stayed: 2 }, "free:11%", `ran (${at}) — 3 item(s) removed, 2 stayed`],
    [{ kind: "free", percent: 11 }, { result: "skipped", at, reason }, "free:11%", `skipped (${at}) — ${reason}`],
    [{ kind: "free", percent: 11 }, { result: "failed", reason: "cannot scan" }, "free:11%", "failed — cannot scan"],
    [{ kind: "free", percent: 11 }, {}, "free:11%", "unknown"],
    [{ kind: "free", percent: 11 }, { result: "skipped", at, reason: "rotated reason" }, "free:11%", `skipped (${at}) — rotated reason`, true],
  ];
  for (const [limit, outcome, label, result, rotated] of cases) {
    for (const path of [settingPathOf(home), logPathOf(home), logPathOf(home) + ".1"]) rmSync(path, { force: true });
    if (typeof limit === "string") { mkdirSync(stateDirOf(home), { recursive: true }); writeFileSync(settingPathOf(home), limit); }
    else if (limit) writeCurrentSetting(home, limit, { written_by: "waypost-state-v2" });
    if (outcome) writeFileSync(logPathOf(home) + (rotated ? ".1" : ""), JSON.stringify({ kind: "auto", ...outcome }) + "\n" + JSON.stringify({ kind: "apply", result: "ignored" }) + "\n");
    if (rotated) writeFileSync(logPathOf(home), JSON.stringify({ kind: "apply", result: "ignored" }) + "\n");
    const snapshot = () => Object.fromEntries(readdirSync(stateDirOf(home)).map(n => [n, readFileSync(join(stateDirOf(home), n), "utf8")]));
    mkdirSync(stateDirOf(home), { recursive: true });
    const before = snapshot();
    const run = (...flags) => { const r = runWaypost(proj, ["brief", "--no-install", "--budget", "5000", ...flags], env); assert.equal(r.status, 0, r.stderr); return r.stdout; };
    const compact = run(), full = run("--full");
    const line = text => text.split("\n").find(l => l.startsWith("cleanup limit:"));
    if (label === null) { assert.equal(line(compact), undefined); assert.equal(line(full), undefined); }
    else {
      const date = typeof limit === "string" ? "undefined" : "2026-01-01";
      const expected = `cleanup limit: ${label} (set ${date})${result ? ` — auto: ${result}` : ""}`;
      const fullLabel = limit?.kind === "free" ? "free:11% — keep at least 11% of the disk free" : label;
      assert.equal(line(compact), expected);
      assert.equal(line(full), `cleanup limit: ${fullLabel} (set ${date})${result ? ` — automatic cleanup: ${result}` : ""}`);
      if (result?.startsWith("ran") && outcome.time === at) assert.ok(expected.length <= 120, `canonical numeric outcome budget: ${expected.length}`);
    }
    assert.deepEqual(JSON.parse(run("--json")), JSON.parse(run("--json", "--full")), "format selection preserves facts");
    assert.deepEqual(snapshot(), before, "brief never changes setting/log bytes");
  }
});

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
// process. `comm` is what bin/waypost itself records, basename(execPath): on
// win32 slotLive() compares it with the image name tasklist reports
// (node.exe), and any other value makes this live holder read as gone.
function selfHolderRecord(id, extra = {}) {
  const table = process.platform === "win32" ? null : processTable();
  const self = table ? table.get(process.pid) : null;
  return {
    id, host: RAW_HOST,
    proc: { pid: process.pid, started: self ? self.started : null, ticks: startTicks(process.pid), comm: basename(process.execPath) },
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
    host: RAW_HOST, proc: { pid: process.pid, started: null, ticks: null, comm: basename(process.execPath) },
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

test("AC3: idle for only 12 hours (under the 1-day floor) — a tiny GB threshold protects the working set; the report and log say to raise it", () => {
  const home = tmpRoot("waypost-limit-ac3-home-");
  const proj = gitProject("waypost-limit-ac3-proj-", ["a", "b", "c"]);
  for (const n of ["a", "b", "c"]) touchTree(tagFixture(proj, n, 20000));
  writeCurrentSetting(home, { kind: "gb", gb: 0.00001, bytes: 0.00001 * GB });
  const env = autoCleanEnv(home, { WAYPOST_CLEAN_NOW: cleanNowPlusDays(0.5) });
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

// A failed spawn of the detached deleter is the one path that could still
// replace the wrapped command's status: 'error' arrives asynchronously, and
// with no listener it is an uncaught exception worth exit 1. The child below
// sets its own exit code first, breaks process.execPath so the spawn cannot
// succeed, and stays alive long enough for the event to be delivered — so it
// really does exercise the event, not a race that ends before it fires.
test("AC13: a deleter that cannot be spawned at all leaves the exit status alone and reports no pid", () => {
  const dir = tmpRoot("waypost-limit-ac13d-");
  const removing = join(dir, REMOVING_DIR);
  mkdirSync(removing, { recursive: true });
  const script = join(dir, "spawn-failure.mjs");
  writeFileSync(script, [
    `import { spawnDeleter } from ${JSON.stringify(join(REPO, "bin", "cli", "deleter.mjs"))};`,
    "process.exitCode = 7;",
    'Object.defineProperty(process, "execPath", { value: "/nonexistent/waypost-no-such-node", configurable: true });',
    `const pid = spawnDeleter(${JSON.stringify(removing)}, ["x"], { proc: { comm: "node" } });`,
    'process.stdout.write(JSON.stringify({ pid }));',
    "setTimeout(() => {}, 300);",
  ].join("\n"), "utf8");
  const r = spawnSync(process.execPath, [script], { encoding: "utf8", timeout: 20000 });
  assert.equal(r.status, 7, `the child's own exit code survived the failed spawn: ${r.stderr}`);
  assert.equal(JSON.parse(r.stdout).pid, null, "no pid is reported for a deleter that never started");
});

// ─── WP-17 loose ends: picked in the text plan, the gate's terminal branch,
// ─── status / size lines, git inside the deadline ────────────────────────

// Runs `fn` with THIS process pointed at a temp HOME (and project), stdout/
// stderr captured, and everything — env, the two writers, process.exitCode —
// put back in `finally`. handleCleanLimit sets exitCode = 1 on a refusal;
// leaving that behind would fail the whole test file.
async function inProcess({ home, proj }, fn) {
  const keys = ["HOME", "USERPROFILE", "XDG_STATE_HOME", "LOCALAPPDATA", "WAYPOST_PROJECT_DIR", "WAYPOST_NO_BEAT"];
  const savedEnv = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const savedOut = process.stdout.write;
  const savedErr = process.stderr.write;
  const savedExit = process.exitCode;
  const cap = { stdout: "", stderr: "", exitCode: undefined };
  try {
    Object.assign(process.env, {
      HOME: home, USERPROFILE: home, XDG_STATE_HOME: home, LOCALAPPDATA: home,
      WAYPOST_PROJECT_DIR: proj, WAYPOST_NO_BEAT: "1",
    });
    // The test runner reports this file's results to its parent over the same
    // stdout, as binary chunks: only strings (the code under test) are captured,
    // everything else goes through, or finished tests would vanish from the report.
    process.stdout.write = (chunk, ...rest) => (typeof chunk === "string" ? (cap.stdout += chunk, true) : savedOut.call(process.stdout, chunk, ...rest));
    process.stderr.write = (chunk, ...rest) => (typeof chunk === "string" ? (cap.stderr += chunk, true) : savedErr.call(process.stderr, chunk, ...rest));
    cap.result = await fn(cap);
    cap.exitCode = process.exitCode;
  } finally {
    process.stdout.write = savedOut;
    process.stderr.write = savedErr;
    for (const k of keys) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }
    process.exitCode = savedExit;
  }
  return cap;
}

async function loadMods() {
  const [cleanup, sizes, toolchains, capacity, presence, discovery] = await Promise.all(
    ["cleanup", "sizes", "toolchains", "capacity", "presence", "discovery"].map((n) => import(`../scripts/${n}.mjs`)));
  return { cleanup, sizes, toolchains, capacity, presence, discovery };
}

const NO_HARNESS_GATE = () => ({ harness: null, via: null, ancestors: [], markers: [], process_table: true });

// Three idle items, oldest first, over a tiny GB limit: only `a` is picked.
function pickedFixture(prefix) {
  const home = tmpRoot(`${prefix}-home-`);
  const proj = gitProject(`${prefix}-proj-`, ["a", "b", "c"]);
  touchTree(tagFixture(proj, "a", 45000)); sleepMs(30);
  touchTree(tagFixture(proj, "b", 45000)); sleepMs(30);
  touchTree(tagFixture(proj, "c", 45000));
  return { home, proj };
}

test("picked end to end: setting -> plan, in --json (picked/limit) and in the text (limit line + '<- limit' marks)", () => {
  const { home, proj } = pickedFixture("waypost-limit-picked");
  writeCurrentSetting(home, { kind: "gb", gb: 0.0001, bytes: 0.0001 * GB });
  const env = autoCleanEnv(home, { WAYPOST_PROJECT_DIR: proj });

  const j = runWaypost(proj, ["clean", "--json"], env);
  assert.equal(j.status, 0, j.stderr);
  const plan = JSON.parse(j.stdout);
  assert.equal(plan.limit.kind, "gb");
  const byRel = Object.fromEntries(plan.items.filter((i) => i.scope === "project").map((i) => [i.rel, i]));
  assert.equal(byRel.a.picked, true, JSON.stringify(byRel.a));
  assert.equal(byRel.b.picked, false);
  assert.equal(byRel.c.picked, false);
  assert.equal(plan.items.filter((i) => i.picked).length, 1);

  const t = runWaypost(proj, ["clean"], env);
  assert.equal(t.status, 0, t.stderr);
  const lines = t.stdout.split("\n");
  assert.equal(lines.filter((l) => /^limit .* would take 1 item\(s\), \d+\.\d\d GB now \(marked <- limit\)$/.test(l)).length, 1, t.stdout);
  const marked = lines.filter((l) => l.endsWith("  <- limit"));
  assert.equal(marked.length, 1, t.stdout);
  assert.match(marked[0], /\[project\]\s+a {2}<- limit$/);
  for (const n of ["b", "c"]) assert.ok(lines.some((l) => /\[project\]/.test(l) && l.endsWith(`  ${n}`)), `${n} listed, unmarked`);
});

test("picked: a limit that takes nothing says so; no setting, or off, prints no limit line at all", () => {
  const { home, proj } = pickedFixture("waypost-limit-picked-none");
  const env = autoCleanEnv(home, { WAYPOST_PROJECT_DIR: proj });
  const limitLines = (out) => out.split("\n").filter((l) => /^limit /.test(l));

  writeCurrentSetting(home, { kind: "gb", gb: 50, bytes: 50 * GB });
  const roomy = runWaypost(proj, ["clean"], env);
  assert.equal(roomy.status, 0, roomy.stderr);
  assert.equal(limitLines(roomy.stdout).length, 1, roomy.stdout);
  assert.match(limitLines(roomy.stdout)[0], /^limit .* — would take nothing now$/);
  assert.ok(!roomy.stdout.includes("<- limit"));
  assert.equal(JSON.parse(runWaypost(proj, ["clean", "--json"], env).stdout).items.filter((i) => i.picked).length, 0);

  writeCurrentSetting(home, { kind: "off" });
  const off = runWaypost(proj, ["clean"], env);
  assert.deepEqual(limitLines(off.stdout), []);
  assert.ok(!off.stdout.includes("<- limit"));

  rmSync(settingPathOf(home), { force: true });
  const none = runWaypost(proj, ["clean"], env);
  assert.equal(none.status, 0, none.stderr);
  assert.deepEqual(limitLines(none.stdout), []);
  assert.ok(!none.stdout.includes("<- limit"));
  assert.equal(JSON.parse(runWaypost(proj, ["clean", "--json"], env).stdout).limit, null);
});

// ─── the gate's terminal branch, in-process through the io seam ───────────

test("the prompt's timeout is one named constant: 60 s", async () => {
  const { LIMIT_PROMPT_TIMEOUT_MS } = await import("../scripts/cleanup-limit.mjs");
  assert.equal(LIMIT_PROMPT_TIMEOUT_MS, 60000);
});

test("gate prompt refused ('n'): the setting file is byte for byte unchanged, 'not set', the 60 s timeout and [y/N] reached the prompt", async () => {
  const home = tmpRoot("waypost-limit-prompt-no-home-");
  const proj = gitProject("waypost-limit-prompt-no-proj-", []);
  writeCurrentSetting(home, { kind: "gb", gb: 20, bytes: 20 * GB });
  const before = readFileSync(settingPathOf(home));
  const logBefore = existsSync(logPathOf(home));
  const mods = await loadMods();
  const { askYesNo } = await import("../scripts/lib.mjs");
  const { PassThrough } = await import("node:stream");
  const seen = [];
  // The real askYesNo, over a stream answering "n" — only the stream is fake.
  const ask = (q, o) => {
    seen.push([q, o]);
    const input = new PassThrough();
    setImmediate(() => input.write("n\n"));
    return askYesNo(q, { input, output: new PassThrough(), timeoutMs: o.timeoutMs });
  };
  const cap = await inProcess({ home, proj }, () => import("../bin/cli/clean.mjs").then(({ handleCleanLimit }) =>
    handleCleanLimit("10", mods, false, Date.now(), { isTTY: true, gate: NO_HARNESS_GATE, ask })));
  assert.equal(seen.length, 1);
  assert.match(seen[0][0], /\[y\/N\]/);
  assert.equal(seen[0][1].timeoutMs, 60000);
  assert.match(cap.stderr, /not set/);
  assert.equal(cap.exitCode, 1);
  assert.ok(readFileSync(settingPathOf(home)).equals(before), "the setting file is untouched");
  assert.equal(existsSync(logPathOf(home)), logBefore, "nothing logged either");
});

test("gate prompt left unanswered until the timeout: the real askYesNo reads silence as no — setting byte for byte unchanged", async () => {
  const { askYesNo } = await import("../scripts/lib.mjs");
  const { PassThrough } = await import("node:stream");
  const home = tmpRoot("waypost-limit-prompt-timeout-home-");
  const proj = gitProject("waypost-limit-prompt-timeout-proj-", []);
  writeCurrentSetting(home, { kind: "gb", gb: 20, bytes: 20 * GB });
  const before = readFileSync(settingPathOf(home));
  const mods = await loadMods();
  const input = new PassThrough();
  const output = new PassThrough();
  let asked = "";
  output.on("data", (d) => { asked += d; });
  const cap = await inProcess({ home, proj }, () => import("../bin/cli/clean.mjs").then(({ handleCleanLimit }) =>
    handleCleanLimit("10", mods, false, Date.now(), {
      isTTY: true, gate: NO_HARNESS_GATE, ask: (q) => askYesNo(q, { input, output, timeoutMs: 50 }),
    })));
  assert.match(asked, /Set the cleanup limit to .*\[y\/N\]/);
  assert.match(cap.stderr, /not set/);
  assert.equal(cap.exitCode, 1);
  assert.ok(readFileSync(settingPathOf(home)).equals(before), "the setting file is untouched");
});

test("gate prompt accepted: the setting is written with the terminal's own answer, and the preview names the counted total and what would be taken", async () => {
  const { home, proj } = pickedFixture("waypost-limit-prompt-yes");
  writeCurrentSetting(home, { kind: "gb", gb: 20, bytes: 20 * GB });
  const mods = await loadMods();
  let previewBeforeQuestion = "";
  const cap = await inProcess({ home, proj }, (live) => import("../bin/cli/clean.mjs").then(({ handleCleanLimit }) =>
    handleCleanLimit("0.0001", mods, false, Date.now() + 8 * 24 * 60 * 60 * 1000, {
      isTTY: true, gate: NO_HARNESS_GATE, ask: async () => { previewBeforeQuestion = live.stderr; return true; },
    })));
  assert.equal(cap.exitCode, undefined);
  assert.match(previewBeforeQuestion, /would need to be freed/, "the preview is on screen before the question is asked");
  assert.match(cap.stderr, /build output counts \d+\.\d\d GB towards the limit/);
  assert.match(cap.stderr, /\d+\.\d\d GB would need to be freed\. Oldest first/);
  assert.match(cap.stderr, /GB {2}idle \d+d {2}a\n/, cap.stderr);
  assert.doesNotMatch(cap.stderr, /Nothing would need to be removed/);
  assert.match(cap.stdout, /cleanup limit set to .* \(tighten\)/);
  const rec = JSON.parse(readFileSync(settingPathOf(home), "utf8"));
  assert.equal(rec.limit.gb, 0.0001);
  assert.equal(rec.change, "tighten");
  assert.equal(rec.gate.answer, true);
  assert.equal(rec.gate.tty, true);
  assert.equal(rec.gate.required, true);
  assert.equal(lastLogRecord(home).kind, "limit");
});

test("gate prompt preview: a limit that takes nothing says so before the question", async () => {
  const { home, proj } = pickedFixture("waypost-limit-prompt-roomy");
  writeCurrentSetting(home, { kind: "gb", gb: 200, bytes: 200 * GB });
  const mods = await loadMods();
  const cap = await inProcess({ home, proj }, () => import("../bin/cli/clean.mjs").then(({ handleCleanLimit }) =>
    handleCleanLimit("100", mods, false, Date.now() + 8 * 24 * 60 * 60 * 1000, {
      isTTY: true, gate: NO_HARNESS_GATE, ask: async () => false,
    })));
  assert.match(cap.stderr, /counts \d+\.\d\d GB towards the limit/);
  assert.match(cap.stderr, /Nothing would need to be removed right now\./);
  assert.doesNotMatch(cap.stderr, /would need to be freed/);
});

// ─── status: the cleanup lines ────────────────────────────────────────────

function statusOf(home, proj) {
  const r = runWaypost(proj, ["status"], autoCleanEnv(home, { WAYPOST_PROJECT_DIR: proj }));
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}
function writeAutoLog(home, rec) {
  mkdirSync(stateDirOf(home), { recursive: true });
  writeFileSync(logPathOf(home), JSON.stringify({ kind: "auto", ...rec }) + "\n", "utf8");
}

test("status: no setting reads 'cleanup  none' and no last-run line", () => {
  const home = tmpRoot("waypost-limit-status-none-home-");
  const proj = gitProject("waypost-limit-status-none-proj-", []);
  const out = statusOf(home, proj);
  assert.match(out, /^cleanup {2}none$/m);
  assert.doesNotMatch(out, /last run/);
});

test("status: a setting prints its limit, set date and how it was made", async () => {
  const { formatLimit } = await import("../scripts/cleanup.mjs");
  const home = tmpRoot("waypost-limit-status-set-home-");
  const proj = gitProject("waypost-limit-status-set-proj-", []);
  const limit = { kind: "gb", gb: 10, bytes: 10 * GB };
  writeCurrentSetting(home, limit);
  const out = statusOf(home, proj);
  assert.ok(out.includes(`cleanup  ${formatLimit(limit)} — set 2026-01-01 (no gate required; gate: env-markers-only)\n`), out);
  assert.doesNotMatch(out, /cleanup {2}none/);
  assert.doesNotMatch(out, /last run/);

  writeCurrentSetting(home, limit, { gate: { required: true, checked: "process-table+env-markers", harness: null, via: null, ancestors: [], markers: [], tty: true, answer: true } });
  assert.match(statusOf(home, proj), /— set 2026-01-01 \(terminal; gate: process-table\+env-markers\)/);
});

test("status: the last automatic run is named — ran, skipped and failed each with their own text", async () => {
  const { formatOutcome } = await import("../scripts/cleanup.mjs");
  const home = tmpRoot("waypost-limit-status-outcome-home-");
  const proj = gitProject("waypost-limit-status-outcome-proj-", []);
  writeCurrentSetting(home, { kind: "gb", gb: 10, bytes: 10 * GB });
  const at = "2026-02-03T04:05:06.000Z";
  const cases = [
    [{ result: "ran", at, renamed: [{}, {}], stayed: [{}] }, `last run automatic cleanup: ran (${at}) — 2 item(s) removed, 1 stayed`],
    [{ result: "skipped", at, reason: "not in a git work tree" }, `last run automatic cleanup: skipped (${at}) — not in a git work tree`],
    [{ result: "failed", at, reason: "cannot scan" }, `last run automatic cleanup: failed (${at}) — cannot scan`],
  ];
  for (const [rec, expected] of cases) {
    writeAutoLog(home, rec);
    const out = statusOf(home, proj);
    assert.ok(out.includes(`        ${expected}\n`), `${rec.result}: ${out}`);
    assert.ok(out.includes(`last run ${formatOutcome({ kind: "auto", ...rec })}`));
  }
});

// ─── size --project: waypost-removing/ ────────────────────────────────────

test("size --project: items already handed to the deleter are reported in text and as waypost_removing_bytes in --json", () => {
  const home = tmpRoot("waypost-limit-size-home-");
  const proj = gitProject("waypost-limit-size-proj-", []);
  const env = autoCleanEnv(home, { WAYPOST_PROJECT_DIR: proj });

  const empty = runWaypost(proj, ["size", "--project"], env);
  assert.equal(empty.status, 0, empty.stderr);
  assert.doesNotMatch(empty.stdout, /waypost-removing/);
  const emptyJson = JSON.parse(runWaypost(proj, ["size", "--project", "--json"], env).stdout);
  assert.ok("waypost_removing_bytes" in emptyJson);
  assert.equal(emptyJson.waypost_removing_bytes, null);

  const leftover = join(gitCommonOf(proj), REMOVING_DIR, "pending-item");
  mkdirSync(leftover, { recursive: true });
  writeFileSync(join(leftover, "file.bin"), Buffer.alloc(200000, 1));
  const text = runWaypost(proj, ["size", "--project"], env);
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /^ {2}\d+\.\d\d GB {2}waypost-removing\/ \(already handed to the deleter\)$/m);
  const j = JSON.parse(runWaypost(proj, ["size", "--project", "--json"], env).stdout);
  assert.ok(j.waypost_removing_bytes >= 200000, String(j.waypost_removing_bytes));
});

// ─── git inside the deadline ──────────────────────────────────────────────

test("git inside the deadline: a passed deadline makes gatherCleanContext's gitFacts answer conservatively; without one it asks git", async () => {
  const { gatherCleanContext } = await import("../bin/cli/clean-plan.mjs");
  const home = tmpRoot("waypost-limit-deadline-ctx-home-");
  const proj = gitProject("waypost-limit-deadline-ctx-proj-", ["a"]);
  tagFixture(proj, "a", 5000);
  const mods = await loadMods();
  const gather = (deadline) => inProcess({ home, proj }, () => gatherCleanContext(mods, {
    root: proj, vault: null, includeMachine: false,
    walk: { stopAtGit: true, locators: false, ...(deadline !== undefined ? { deadline } : {}) },
  })).then((c) => c.result);
  const itemA = (ctx) => ctx.projectItems.find((i) => i.rel === "a");

  const late = await gather(Date.now() - 1);
  assert.equal(typeof late.deadline, "number");
  assert.equal(itemA(late).tracked, true, "no time left: conservative, never 'untracked'");
  assert.equal(itemA(late).ignored, false);

  const free = await gather(undefined);
  assert.equal(free.deadline, null);
  assert.equal(itemA(free).tracked, false);
  assert.equal(itemA(free).ignored, true);
});

test("git inside the deadline: freshFactsFor's recheck is bounded by ctx.deadline too", async () => {
  const { gatherCleanContext } = await import("../bin/cli/clean-plan.mjs");
  const { freshFactsFor } = await import("../bin/cli/remove.mjs");
  const home = tmpRoot("waypost-limit-deadline-fresh-home-");
  const proj = gitProject("waypost-limit-deadline-fresh-proj-", ["a"]);
  tagFixture(proj, "a", 5000);
  const mods = await loadMods();
  const { result } = await inProcess({ home, proj }, async () => {
    const ctx = gatherCleanContext(mods, { root: proj, vault: null, includeMachine: false, walk: { stopAtGit: true, locators: false } });
    const item = ctx.projectItems.find((i) => i.rel === "a");
    const now = Date.now() + 8 * 24 * 60 * 60 * 1000;
    return {
      open: freshFactsFor(item, ctx, mods, now).fresh,
      late: freshFactsFor(item, { ...ctx, deadline: Date.now() - 1 }, mods, now).fresh,
    };
  });
  assert.equal(result.open.tracked, false);
  assert.equal(result.open.ignored, true);
  assert.equal(result.late.tracked, true, "past the deadline: conservative without asking git");
});

test("git inside the deadline: a git that hangs on check-ignore/ls-files is cut at the sweep's deadline, not its 15 s per call",
  { skip: process.platform === "win32" ? "POSIX shell script as git" : false }, () => {
    const realGit = spawnSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim();
    assert.ok(realGit, "a real git to delegate to");
    const bin = tmpRoot("waypost-limit-slowgit-bin-");
    writeFileSync(join(bin, "git"),
      "#!/bin/sh\nfor a in \"$@\"; do case \"$a\" in check-ignore|ls-files) exec sleep 30;; esac; done\nexec \"$WAYPOST_TEST_REAL_GIT\" \"$@\"\n", { mode: 0o755 });
    const home = tmpRoot("waypost-limit-slowgit-home-");
    const proj = gitProject("waypost-limit-slowgit-proj-", ["a", "b"]);
    touchTree(tagFixture(proj, "a", 20000)); sleepMs(30);
    touchTree(tagFixture(proj, "b", 20000));
    writeCurrentSetting(home, { kind: "gb", gb: 0.00001, bytes: 0.00001 * GB });
    const env = autoCleanEnv(home, {
      PATH: `${bin}:${process.env.PATH}`, WAYPOST_TEST_REAL_GIT: realGit,
      WAYPOST_AUTOCLEAN_PROBE: JSON.stringify({ deadline_ms: 1500 }),
    });
    const t0 = Date.now();
    const r = runHeavyChild(proj, ["node", "-e", "1"], env);
    const took = Date.now() - t0;
    assert.equal(r.status, 0, r.stderr);
    assert.ok(took < 10000, `the hanging git held the sweep for ${took} ms`);
    // A git that could not answer never lets anything be removed.
    assert.ok(existsSync(join(proj, "a")) && existsSync(join(proj, "b")));
    // ...and the run says it hit the deadline rather than "ran, nothing to do".
    const rec = lastLogRecord(home);
    assert.equal(rec.deadline, true, JSON.stringify(rec));
    assert.equal(rec.reason, "deadline");
  });

test("git inside the deadline: gitFacts' timeout bounds check-ignore and ls-files together, not each",
  { skip: process.platform === "win32" ? "POSIX shell script as git" : false }, async () => {
    const { gitFacts } = await import("../scripts/sizes-git.mjs");
    const realGit = spawnSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim();
    const proj = gitProject("waypost-limit-pairgit-proj-", ["a"]);
    tagFixture(proj, "a", 5000);
    gitFacts(proj, ["a"]); // warms gitCommonDir's per-root cache with the real git
    const bin = tmpRoot("waypost-limit-pairgit-bin-");
    // check-ignore answers after 1 s; ls-files would hang for 30 s.
    writeFileSync(join(bin, "git"),
      `#!/bin/sh\nfor a in "$@"; do case "$a" in check-ignore) sleep 1; exec "${realGit}" "$@";; ls-files) exec sleep 30;; esac; done\nexec "${realGit}" "$@"\n`, { mode: 0o755 });
    const savedPath = process.env.PATH;
    let facts, took;
    try {
      process.env.PATH = `${bin}:${savedPath}`;
      const t0 = Date.now();
      facts = gitFacts(proj, ["a"], 2000);
      took = Date.now() - t0;
    } finally { process.env.PATH = savedPath; }
    // Each call given the full 2 s would take ~3 s (1 s + 2 s).
    assert.ok(took < 2700, `the pair took ${took} ms under a 2000 ms budget`);
    assert.equal(facts.tracked.has("a"), true, "ls-files cut short: conservative");
  });

// ─── a disk refusal runs the automatic cleanup once (the disk-space ADR) ──

function lowDiskEnv(home, extra = {}) {
  return autoCleanEnv(home, {
    WAYPOST_CAPACITY_PROBE: JSON.stringify({ cores: 8, busy: 0, available: 8 * GB, total: 16 * GB, free: 45 * GB, disk_total: 460 * GB }),
    ...extra,
  });
}

function autoRecords(home) {
  return readFileSync(logPathOf(home), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.kind === "auto");
}

test("disk refusal: one automatic cleanup with no job behind it, then the refusal names the numbers; the job never runs", () => {
  const home = tmpRoot("waypost-limit-disk-home-");
  const proj = gitProject("waypost-limit-disk-proj-", ["a"]);
  touchTree(tagFixture(proj, "a", 20000));
  writeCurrentSetting(home, { kind: "gb", gb: 20, bytes: 20 * GB });
  const marker = join(proj, "ran.txt");
  const r = runHeavyChild(proj, ["node", "-e", `require("fs").writeFileSync(${JSON.stringify(marker)}, "x")`], lowDiskEnv(home));
  assert.equal(r.status, 75, r.stderr);
  assert.match(r.stderr, /disk: 45\.0 GB free, a heavy job needs 50\.0 GB free \(30\.0 GB system reserve \+ 20\.0 GB for this job\) — running the automatic cleanup first \(up to 60 s\)/);
  assert.match(r.stderr, /refused — disk: 45\.0 GB free, a heavy job needs 50\.0 GB free \(30\.0 GB system reserve \+ 20\.0 GB for this job\)/);
  assert.ok(!existsSync(marker), "the job did not run");
  const autos = autoRecords(home);
  assert.equal(autos.length, 1, "exactly one cleanup, no loop");
  assert.equal(autos[0].exit, null);
  assert.equal(autos[0].result, "ran");
});

test("disk: WAYPOST_DISK_CHECK=off admits below the floor and capacity says the disk was not checked", () => {
  const home = tmpRoot("waypost-limit-disk-off-home-");
  const env = lowDiskEnv(home, { WAYPOST_DISK_CHECK: "off" });
  const r = spawnSync(process.execPath, [Waypost, "capacity"], { encoding: "utf8", timeout: 30000, env });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /disk not checked \(WAYPOST_DISK_CHECK=off\)/);
  assert.match(r.stdout, /can start 2 heavy jobs/);
});

test("disk: capacity --json carries the disk figures; waypost clean is never refused for disk", () => {
  const home = tmpRoot("waypost-limit-disk-json-home-");
  const proj = gitProject("waypost-limit-disk-json-proj-", ["a"]);
  const env = lowDiskEnv(home);
  const c = spawnSync(process.execPath, [Waypost, "capacity", "--json"], { cwd: proj, encoding: "utf8", timeout: 30000, env });
  assert.equal(c.status, 0, c.stderr);
  const j = JSON.parse(c.stdout);
  assert.equal(j.can_start, 0);
  assert.deepEqual({ free: j.disk.free, total: j.disk.total, share: j.disk.share, reserve: j.disk.reserve }, { free: 45 * GB, total: 460 * GB, share: 20 * GB, reserve: 30 * GB });
  const k = spawnSync(process.execPath, [Waypost, "clean", "--json"], { cwd: proj, encoding: "utf8", timeout: 60000, env });
  assert.equal(k.status, 0, k.stderr);
  assert.doesNotMatch(k.stderr, /refused/);
});
