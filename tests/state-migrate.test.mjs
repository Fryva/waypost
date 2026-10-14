// waypost — moving machine state into the one root (the global-rules ADR,
// Decision 1; WP-18 "The heavy-work slot is machine-wide on Windows, not one
// per packaged app"). Every directory here is a temp one; nothing touches the
// real home.
//   node --test tests/state-migrate.test.mjs

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync as fsMkdtemp, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, chmodSync, statSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { tmpdir, userInfo } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fsModule from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import * as presence from "../scripts/presence.mjs";
import * as capacity from "../scripts/capacity.mjs";
import {
  migrateMachineState, stricterLimit, pendingEntries, legacyBudgets,
  CONFLICT_DIR, BUDGET_CONFLICT_MARKER, BUDGET_TOMBSTONE, isBudgetTombstone, LIMIT_WRITER,
} from "../scripts/state-migrate.mjs";
import { readRunBudget, runBudgetActive, setRunBudget, clearRunBudget } from "../scripts/run-budget.mjs";
import { ensureMachineStateDir, readCleanupSetting, accountStateDir, legacyStateView, stateWriteHint, legacyDirsToMove } from "../scripts/lib.mjs";
import { ambientEnv } from "./env.mjs";

const TMP = [];
const mkdtempSync = (p) => { const d = fsMkdtemp(p); TMP.push(d); return d; };
after(() => { for (const d of TMP) rmSync(d, { recursive: true, force: true }); });
const deps = { presence, capacity };
const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const Waypost = join(REPO, "bin", "waypost");
const entry = (inv) => ({ authority: "/a", team: "t", invocation: inv, schema: "s", estimate: "10", holder: { pid: 1 } });
const budget = (name, entries = []) => JSON.stringify({ version: 1, name, caps: { s: "100" }, total: null, events: [], entries });
const archived = (to, name) => readdirSync(join(to, CONFLICT_DIR), { recursive: true }).map(String).filter((n) => basename(n).startsWith(name));

function roots() {
  const base = mkdtempSync(join(tmpdir(), "wp-mig-"));
  const to = join(base, "new");
  const a = join(base, "Packages", "Claude_x", "LocalCache", "Local", "Waypost");
  const b = join(base, "Packages", "OpenAI.Codex_y", "LocalCache", "Local", "Waypost");
  mkdirSync(a, { recursive: true }); mkdirSync(b, { recursive: true });
  return { base, to, a, b };
}

// A record naming THIS test process: genuinely alive, on this boot.
function selfRecord(id) {
  const table = process.platform === "win32" ? null : presence.processTable();
  const self = table ? table.get(process.pid) : null;
  return {
    id, host: presence.hostSlug(),
    proc: { pid: process.pid, started: self ? self.started : null, ticks: presence.startTicks(process.pid), comm: basename(process.execPath) },
    boot: capacity.bootIdentity(), session: "migrate-test", harness: "test", command: "node -e test", started_at: new Date().toISOString(),
  };
}

test("files only an old root has move; identical copies collapse; the budget is copied and its old copy tombstoned", async () => {
  const { to, a, b } = roots();
  writeFileSync(join(a, "machine.h.json"), "{}");
  writeFileSync(join(a, "run-budget.json"), budget("one"));
  writeFileSync(join(b, "run-budget.json"), budget("one"));
  const report = await migrateMachineState({ to, from: [a, b], deps });
  assert.deepEqual(report, []);
  assert.equal(readFileSync(join(to, "run-budget.json"), "utf8"), budget("one"));
  assert.ok(existsSync(join(to, "machine.h.json")) && !existsSync(join(a, "machine.h.json")));
  for (const d of [a, b]) {
    assert.ok(isBudgetTombstone(readFileSync(join(d, "run-budget.json"), "utf8")), "the old copy is a tombstone, not gone");
    assert.deepEqual(pendingEntries(d), [], "a tombstone is not pending");
  }
  assert.deepEqual(legacyBudgets([a, b]), []);
  assert.ok(!existsSync(join(to, BUDGET_CONFLICT_MARKER)));
});

test("an older Waypost reading a tombstone refuses: version 0 is not a valid budget", () => {
  const { a } = roots();
  writeFileSync(join(a, "run-budget.json"), BUDGET_TOMBSTONE);
  assert.ok(isBudgetTombstone(BUDGET_TOMBSTONE));
  // The same validate() the old code ran: an explicit path skips the move checks.
  assert.throws(() => readRunBudget(join(a, "run-budget.json")), { code: "run-budget-invalid" });
});

test("two different budgets: marker, both copies kept, every read refuses; setting it again keeps their entries", async () => {
  const { to, a, b } = roots();
  writeFileSync(join(a, "run-budget.json"), budget("claude-side", [entry("i1")]));
  writeFileSync(join(b, "run-budget.json"), budget("codex-side", [entry("i2")]));
  const report = await migrateMachineState({ to, from: [a, b], deps });
  assert.match(report.join("\n"), /run budget: different copies/);
  assert.ok(existsSync(join(to, BUDGET_CONFLICT_MARKER)));
  assert.equal(archived(to, "run-budget.json").length, 2, "neither copy is lost");
  const path = join(to, "run-budget.json");
  assert.ok(!existsSync(path), "no copy reads as 'the' budget");
  assert.equal(runBudgetActive(path), true);
  assert.throws(() => readRunBudget(path), { code: "run-budget-conflict" });
  await setRunBudget({ path, name: "owner", caps: { s: "50" }, reason: "after the move" });
  const b2 = readRunBudget(path);
  assert.deepEqual(b2.entries.map((e) => e.invocation).sort(), ["i1", "i2"], "admitted entries carry over — spending is not reset");
  assert.ok(b2.events.some((e) => e.kind === "conflict-resolved"));
  assert.ok(!existsSync(join(to, BUDGET_CONFLICT_MARKER)));
});

test("a conflict whose archiving fails still leaves the marker — the marker is written first", async () => {
  const { to, a } = roots();
  mkdirSync(to, { recursive: true });
  writeFileSync(join(to, "run-budget.json"), budget("new-side"));
  writeFileSync(join(a, "run-budget.json"), budget("old-side"));
  writeFileSync(join(to, CONFLICT_DIR), "a file where the archive directory should go");
  const report = await migrateMachineState({ to, from: [a], deps });
  assert.match(report.join("\n"), /could not move/);
  assert.ok(existsSync(join(to, BUDGET_CONFLICT_MARKER)), "refusal holds through the failure");
  assert.throws(() => readRunBudget(join(to, "run-budget.json")), { code: "run-budget-conflict" });
});

test("clearing the budget while a conflict is marked clears the marker and logs it", async () => {
  const { to } = roots();
  mkdirSync(to, { recursive: true });
  writeFileSync(join(to, BUDGET_CONFLICT_MARKER), "{}\n");
  const path = join(to, "run-budget.json");
  assert.equal(await clearRunBudget({ path, reason: "start over" }), true);
  assert.ok(!existsSync(join(to, BUDGET_CONFLICT_MARKER)));
  assert.match(readFileSync(join(to, "run-budget-history.jsonl"), "utf8"), /"conflict":true/);
  assert.equal(readRunBudget(path), null);
});

test("two different cleanup limits: the more restrictive one is kept, the other archived", async () => {
  const { to, a } = roots();
  mkdirSync(to, { recursive: true });
  const rec = (gb, at) => JSON.stringify({ v: 1, host: "h", limit: { kind: "gb", gb, bytes: gb * 2 ** 30 }, set_at: at });
  writeFileSync(join(to, "cleanup-limit.h.json"), rec(20, "2026-10-01"));
  writeFileSync(join(a, "cleanup-limit.h.json"), rec(5, "2026-09-01"));
  await migrateMachineState({ to, from: [a], deps });
  assert.equal(JSON.parse(readFileSync(join(to, "cleanup-limit.h.json"), "utf8")).limit.gb, 5);
  assert.equal(archived(to, "cleanup-limit.h.json").length, 1);
  assert.equal(stricterLimit({ limit: { kind: "free", percent: 30 } }, { limit: { kind: "free", percent: 10 } }).limit.percent, 30);
  assert.equal(stricterLimit({ limit: { kind: "off" } }, { limit: { kind: "gb", gb: 50 } }).limit.gb, 50);
});

test("three roots where the third equals the first: one copy, nothing archived", async () => {
  const { base, to, a, b } = roots();
  const c = join(base, "xdg", "waypost");
  mkdirSync(c, { recursive: true });
  writeFileSync(join(a, "cleanup.h.jsonl"), "x\n");
  writeFileSync(join(b, "machine.h.json"), "{}");
  writeFileSync(join(c, "cleanup.h.jsonl"), "x\n");
  await migrateMachineState({ to, from: [a, b, c], deps });
  assert.equal(readFileSync(join(to, "cleanup.h.jsonl"), "utf8"), "x\n");
  assert.ok(!existsSync(join(to, CONFLICT_DIR)));
});

test("temp files, migrated-conflicts and slot directories stay where they are", async () => {
  const { to, a } = roots();
  writeFileSync(join(a, "x.123.tmp"), "t");
  mkdirSync(join(a, CONFLICT_DIR), { recursive: true });
  mkdirSync(join(a, "slots.h"), { recursive: true });
  writeFileSync(join(a, "slots.h", "1-x.json"), "{}");
  assert.deepEqual(pendingEntries(a), []);
  await migrateMachineState({ to, from: [a], deps });
  assert.ok(existsSync(join(a, "x.123.tmp")) && existsSync(join(a, "slots.h", "1-x.json")));
});

test("a busy old root moves nothing and says so", async () => {
  const { to, a } = roots();
  writeFileSync(join(a, "machine.h.json"), "{}");
  mkdirSync(join(a, ".lock"));
  writeFileSync(join(a, ".lock", "owner.json"), JSON.stringify({ pid: process.pid, boot: capacity.bootIdentity(), ticks: presence.startTicks(process.pid) }));
  const report = await migrateMachineState({ to, from: [a], deps });
  assert.match(report.join("\n"), /busy:/);
  assert.ok(existsSync(join(a, "machine.h.json")));
});

// Make a file unreadable to this user, and readable again: icacls on win32
// (chmod does nothing there), chmod elsewhere. Root reads anything.
const canDenyRead = process.platform === "win32" || process.getuid?.() !== 0;
function denyRead(p) {
  if (process.platform === "win32") spawnSync("icacls", [p, "/deny", `${userInfo().username}:(R)`], { encoding: "utf8" });
  else chmodSync(p, 0o000);
}
function allowRead(p) {
  if (process.platform === "win32") spawnSync("icacls", [p, "/remove:d", userInfo().username], { encoding: "utf8" });
  else chmodSync(p, 0o600);
}

test("files that cannot be read are never deleted as 'identical'", { skip: !canDenyRead }, async () => {
  const { to, a } = roots();
  mkdirSync(to, { recursive: true });
  writeFileSync(join(a, "machine.h.json"), "{\"a\":1}");
  writeFileSync(join(to, "machine.h.json"), "{\"b\":2}");
  denyRead(join(a, "machine.h.json"));
  denyRead(join(to, "machine.h.json"));
  try {
    const report = await migrateMachineState({ to, from: [a], deps });
    assert.match(report.join("\n"), /could not move/);
    assert.ok(existsSync(join(a, "machine.h.json")));
  } finally {
    allowRead(join(a, "machine.h.json"));
    allowRead(join(to, "machine.h.json"));
  }
});

test("a legacy budget that exists but cannot be read is waiting, not absent", { skip: !canDenyRead }, () => {
  const { a } = roots();
  const p = join(a, "run-budget.json");
  writeFileSync(p, budget("unreadable"));
  denyRead(p);
  try { assert.deepEqual(legacyBudgets([a]), [p], "refuses rather than reads as no budget"); }
  finally { allowRead(p); }
});

test("three conflicts in a row keep every copy's admitted entries", async () => {
  const { base, to, a, b } = roots();
  const c = join(base, "xdg", "waypost");
  mkdirSync(c, { recursive: true });
  mkdirSync(to, { recursive: true });
  writeFileSync(join(to, "run-budget.json"), budget("new", [entry("iN")]));
  writeFileSync(join(a, "run-budget.json"), budget("a", [entry("iA")]));
  writeFileSync(join(b, "run-budget.json"), budget("b", [entry("iB")]));
  writeFileSync(join(c, "run-budget.json"), budget("c", [entry("iC")]));
  await migrateMachineState({ to, from: [a, b, c], deps });
  const marker = JSON.parse(readFileSync(join(to, BUDGET_CONFLICT_MARKER), "utf8"));
  assert.equal(marker.kept.length, 4, JSON.stringify(marker));
  const path = join(to, "run-budget.json");
  await setRunBudget({ path, name: "owner", caps: { s: "50" }, reason: "after three conflicts" });
  assert.deepEqual(readRunBudget(path).entries.map((e) => e.invocation).sort(), ["iA", "iB", "iC", "iN"]);
});

test("until the move happens, the stricter of the new and an old cleanup limit is in force", () => {
  const home = mkdtempSync(join(tmpdir(), "wp-mig-limit-"));
  const rec = (gb) => JSON.stringify({ v: 1, host: "h", limit: { kind: "gb", gb, bytes: gb * 2 ** 30 }, set_at: "2026-10-01" });
  const old = join(home, "lad", "Waypost");
  mkdirSync(old, { recursive: true });
  writeFileSync(join(old, "cleanup-limit.h.json"), rec(5));
  const fresh = join(home, ".local", "state", "waypost");
  mkdirSync(fresh, { recursive: true });
  writeFileSync(join(fresh, "cleanup-limit.h.json"), rec(20));
  const v = readCleanupSetting({ host: "h", platform: "win32", env: { LOCALAPPDATA: join(home, "lad") }, home });
  assert.equal(v.limit.gb, 5);
});

test("readHolders reads an old root's slot directory beside the new one, once per record, keeping its path", () => {
  const { to, a } = roots();
  const rec = selfRecord("self");
  mkdirSync(join(to, "slots.h"), { recursive: true });
  mkdirSync(join(a, "slots.h"), { recursive: true });
  writeFileSync(join(a, "slots.h", "self.json"), JSON.stringify(rec));
  const h = capacity.readHolders({ dir: join(to, "slots.h"), dirs: [join(a, "slots.h"), join(a, "slots.h")] });
  const all = [...h.live, ...h.stale];
  assert.deepEqual(all.map((r) => r.id), ["self"], "the same record twice counts once");
  assert.equal(all[0].file, join(a, "slots.h", "self.json"));
});

// A child environment whose home is `home`, with the old Windows/Linux roots
// pointed into it, and the move switched back on for this test.
const cliEnv = (home, extra = {}) => ({
  ...ambientEnv(), HOME: home, USERPROFILE: home, XDG_STATE_HOME: join(home, "xdg"), LOCALAPPDATA: join(home, "lad"),
  WAYPOST_NO_BEAT: "1", WAYPOST_NO_STATE_MIGRATION: "",
  WAYPOST_CAPACITY_PROBE: JSON.stringify({ cores: 8, busy: 0, available: 8 * 2 ** 30, total: 16 * 2 ** 30 }), ...extra,
});
const oldRoot = (home) => process.platform === "win32" ? join(home, "lad", "Waypost")
  : process.platform === "darwin" ? join(home, "Library", "Application Support", "Waypost") : join(home, "xdg", "waypost");

test("a live holder in an old root's slot directory refuses run --heavy, and capacity --release finds it there", () => {
  const home = mkdtempSync(join(tmpdir(), "wp-mig-slot-"));
  const slots = join(oldRoot(home), `slots.${presence.hostSlug()}`);
  mkdirSync(slots, { recursive: true });
  writeFileSync(join(slots, "old-holder.json"), JSON.stringify(selfRecord("old-holder")));
  const env = cliEnv(home, { WAYPOST_HEAVY_MAX: "1" });
  const r = spawnSync(process.execPath, [Waypost, "run", "--heavy", "--", "node", "-e", "1"], { cwd: home, encoding: "utf8", env });
  assert.equal(r.status, 75, r.stderr);
  assert.match(r.stderr, /slots: 1 of 1/);
  const rel = spawnSync(process.execPath, [Waypost, "capacity", "--release", "old-holder", "--force"], { cwd: home, encoding: "utf8", env });
  assert.equal(rel.status, 0, rel.stderr);
  assert.ok(!existsSync(join(slots, "old-holder.json")));
});

test("a budget still in an old root refuses live runs, even when the new root already has one", () => {
  const home = mkdtempSync(join(tmpdir(), "wp-mig-home-"));
  mkdirSync(oldRoot(home), { recursive: true });
  writeFileSync(join(oldRoot(home), "run-budget.json"), budget("old"));
  const fresh = join(home, ".local", "state", "waypost");
  mkdirSync(fresh, { recursive: true });
  writeFileSync(join(fresh, "run-budget.json"), budget("new"));
  const code = `import("./scripts/run-budget.mjs").then((m) => { try { m.readRunBudget(); console.log("read"); } catch (e) { console.log(e.code); } })`;
  const r = spawnSync(process.execPath, ["-e", code], { cwd: REPO, encoding: "utf8", env: cliEnv(home) });
  assert.equal(r.stdout.trim(), "run-budget-migration-pending", r.stderr);
});

test("the first command moves the old state; the old budget is left as a tombstone", () => {
  const home = mkdtempSync(join(tmpdir(), "wp-mig-cli-"));
  mkdirSync(oldRoot(home), { recursive: true });
  writeFileSync(join(oldRoot(home), "run-budget.json"), budget("moved"));
  const r = spawnSync(process.execPath, [Waypost, "capacity", "--json"], { cwd: home, encoding: "utf8", env: cliEnv(home) });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(join(home, ".local", "state", "waypost", "run-budget.json"), "utf8"), budget("moved"));
  assert.ok(isBudgetTombstone(readFileSync(join(oldRoot(home), "run-budget.json"), "utf8")));
});

test("a command with HOME/USERPROFILE pointed elsewhere never moves a root outside that home", { skip: process.platform === "darwin" }, () => {
  const fake = mkdtempSync(join(tmpdir(), "wp-mig-fake-"));
  const real = mkdtempSync(join(tmpdir(), "wp-mig-real-"));
  const old = process.platform === "win32" ? join(real, "lad", "Waypost") : join(real, "xdg", "waypost");
  mkdirSync(old, { recursive: true });
  writeFileSync(join(old, "run-budget.json"), budget("owner's"));
  const env = { ...cliEnv(fake), XDG_STATE_HOME: join(real, "xdg"), LOCALAPPDATA: join(real, "lad") };
  const r = spawnSync(process.execPath, [Waypost, "capacity", "--json"], { cwd: fake, encoding: "utf8", env });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(join(old, "run-budget.json"), "utf8"), budget("owner's"), "the owner's budget stays where it is");
  assert.ok(!existsSync(join(fake, ".local", "state", "waypost", "run-budget.json")));
  const code = `import("./scripts/run-budget.mjs").then((m) => { try { m.readRunBudget(); console.log("read"); } catch (e) { console.log(e.code); } })`;
  const rr = spawnSync(process.execPath, ["-e", code], { cwd: REPO, encoding: "utf8", env });
  assert.equal(rr.stdout.trim(), "run-budget-migration-pending", "still refused, never 'no budget'");
  assert.match(r.stderr, /is not moved — this process's home .* is not the account's own/, "the owner is told why, and what to do");
  assert.ok(!r.stderr.includes(join(fake, ".local")), "the advice never points into the fake home");
  if (accountStateDir()) assert.ok(r.stderr.includes(accountStateDir()), "it names the account's own state root");
  const setCode = `import("./scripts/run-budget.mjs").then(async (m) => { try { await m.setRunBudget({ name: "n", caps: { s: "5" }, reason: "x" }); console.log("set"); } catch (e) { console.log(e.code); } })`;
  const rs = spawnSync(process.execPath, ["-e", setCode], { cwd: REPO, encoding: "utf8", env });
  assert.equal(rs.stdout.trim(), "run-budget-still-blocked", "set never reports success while live runs stay refused");
});

test("WAYPOST_NO_STATE_MIGRATION=1 leaves old state alone (the suite's own children)", () => {
  const home = mkdtempSync(join(tmpdir(), "wp-mig-off-"));
  mkdirSync(oldRoot(home), { recursive: true });
  writeFileSync(join(oldRoot(home), "machine.h.json"), "{}");
  const r = spawnSync(process.execPath, [Waypost, "capacity", "--json"], { cwd: home, encoding: "utf8", env: cliEnv(home, { WAYPOST_NO_STATE_MIGRATION: "1" }) });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(oldRoot(home), "machine.h.json")));
});

test("ensureMachineStateDir refuses the profile's AppData and any package store (win32), allows a home elsewhere", () => {
  const home = mkdtempSync(join(tmpdir(), "wp-mig-appdata-"));
  const code = (d, h) => { try { ensureMachineStateDir(d, { platform: "win32", home: h }); return "ok"; } catch (e) { return e.code; } };
  assert.equal(code(join(home, ".local", "state", "waypost"), home), "ok");
  assert.equal(code(join(home, "AppData", "Local", "Waypost"), home), "STATE_UNDER_APPDATA");
  assert.equal(code("C:/Users/x/AppData/Local/Packages/A_b/LocalCache/Local/Waypost", "D:/elsewhere"), "STATE_UNDER_APPDATA");
});

test("every test file that spawns a child imports ./env.mjs, so no child moves a developer's real state", () => {
  const dir = join(REPO, "tests");
  const offenders = readdirSync(dir).filter((n) => n.endsWith(".test.mjs")).filter((n) => {
    const s = readFileSync(join(dir, n), "utf8");
    return /\b(spawnSync|execFileSync|spawn|execSync|fork)\(/.test(s) && !/(from |import )"\.\/env\.mjs"/.test(s);
  });
  assert.deepEqual(offenders, []);
});

test("the old budget is tombstoned in place — the same file, never a new one", async () => {
  const { to, a } = roots();
  const p = join(a, "run-budget.json");
  writeFileSync(p, budget("in-place"));
  const before = statSync(p);
  await migrateMachineState({ to, from: [a], deps });
  const after = statSync(p);
  assert.ok(isBudgetTombstone(readFileSync(p, "utf8")));
  if (before.ino) assert.equal(after.ino, before.ino, "overwritten, not recreated");
});

test("a torn tombstone (an empty old copy) is not a conflict and does not wedge the budget", async () => {
  const { to, a } = roots();
  mkdirSync(to, { recursive: true });
  writeFileSync(join(to, "run-budget.json"), budget("new", [entry("i1")]));
  writeFileSync(join(a, "run-budget.json"), "");
  assert.deepEqual(legacyBudgets([a]), [join(a, "run-budget.json")], "until the move sees the placed budget, an empty copy still refuses");
  const report = await migrateMachineState({ to, from: [a], deps });
  assert.deepEqual(report, []);
  assert.ok(!existsSync(join(to, BUDGET_CONFLICT_MARKER)));
  assert.ok(isBudgetTombstone(readFileSync(join(a, "run-budget.json"), "utf8")));
  assert.deepEqual(readRunBudget(join(to, "run-budget.json")).entries.map((e) => e.invocation), ["i1"]);
});

test("a kept copy that is gone or not JSON does not wedge set; it is named in the event, the rest carried", async () => {
  const { to } = roots();
  const kept = join(to, CONFLICT_DIR, "x");
  mkdirSync(kept, { recursive: true });
  writeFileSync(join(kept, "run-budget.json"), budget("ok", [entry("iOk")]));
  writeFileSync(join(kept, "run-budget.json.1"), "{ torn");
  writeFileSync(join(to, BUDGET_CONFLICT_MARKER), JSON.stringify({ kept: [join(kept, "run-budget.json"), join(kept, "run-budget.json.1"), join(kept, "gone.json")] }));
  const path = join(to, "run-budget.json");
  await setRunBudget({ path, name: "owner", caps: { s: "5" }, reason: "resolve" });
  const b = readRunBudget(path);
  assert.deepEqual(b.entries.map((e) => e.invocation), ["iOk"]);
  const ev = b.events.find((e) => e.kind === "conflict-resolved");
  assert.deepEqual(ev.skipped.map((x) => x.why).sort(), ["gone", "not JSON"]);
});

test("a cleanup limit this version wrote beats an older copy, loosening and off included", () => {
  const home = mkdtempSync(join(tmpdir(), "wp-mig-limit2-"));
  const old = join(home, "lad", "Waypost");
  mkdirSync(old, { recursive: true });
  writeFileSync(join(old, "cleanup-limit.h.json"), JSON.stringify({ v: 1, host: "h", limit: { kind: "gb", gb: 5, bytes: 5 * 2 ** 30 }, set_at: "2026-09-01" }));
  const fresh = join(home, ".local", "state", "waypost");
  mkdirSync(fresh, { recursive: true });
  writeFileSync(join(fresh, "cleanup-limit.h.json"), JSON.stringify({ v: 1, host: "h", limit: { kind: "off" }, set_at: "2026-10-13", written_by: LIMIT_WRITER }));
  const v = readCleanupSetting({ host: "h", platform: "win32", env: { LOCALAPPDATA: join(home, "lad") }, home });
  assert.equal(v.limit.kind, "off", "the owner's latest explicit choice is in force");
});

test("a reader racing a conflict move never reads 'no budget': marker and file are checked after the old roots", () => {
  const { to } = roots();
  mkdirSync(to, { recursive: true });
  const path = join(to, "run-budget.json");
  // Mid-conflict: marker written, the new root's copy not yet removed.
  writeFileSync(path, budget("mid"));
  writeFileSync(join(to, BUDGET_CONFLICT_MARKER), "{}");
  assert.throws(() => readRunBudget(path), { code: "run-budget-conflict" });
  // After the move: marker present, file gone.
  rmSync(path);
  assert.equal(runBudgetActive(path), true);
  assert.throws(() => readRunBudget(path), { code: "run-budget-conflict" });
});

// ── the tombstone: any size, any encoding, any torn prefix ──

test("the padded tombstone: shorter, longer and multi-byte old budgets all end as a recognised tombstone", async () => {
  for (const old of ["{}", budget("x"), budget("бюджет владельца, " + "я".repeat(200))]) {
    const { to, a } = roots();
    const p = join(a, "run-budget.json");
    writeFileSync(p, old);
    const size = statSync(p).size;
    await migrateMachineState({ to, from: [a], deps });
    const text = readFileSync(p, "utf8");
    assert.ok(isBudgetTombstone(text), JSON.stringify(text.slice(0, 40)));
    assert.ok(/^[\x20-\x7e\n]*$/.test(text), "pure ASCII — no old bytes left over");
    assert.ok(statSync(p).size >= size, "padded to at least the old length");
  }
});

test("every torn prefix of a tombstone over an already-placed budget fails closed and loses no entries", async () => {
  const old = JSON.stringify(JSON.parse(budget("p", [entry("iP")])), null, 2) + "\n";
  const body = BUDGET_TOMBSTONE.trimEnd();
  for (let k = 1; k < body.length; k += 7) {
    const { to, a } = roots();
    mkdirSync(to, { recursive: true });
    writeFileSync(join(to, "run-budget.json"), old);
    // what an interrupted padded write leaves: k bytes of tombstone over the old bytes
    writeFileSync(join(a, "run-budget.json"), body.slice(0, k) + old.slice(k));
    await migrateMachineState({ to, from: [a], deps });
    const path = join(to, "run-budget.json");
    let entries;
    try { entries = readRunBudget(path).entries; }
    catch (e) {
      assert.equal(e.code, "run-budget-conflict", `k=${k}: refuses, never 'no budget'`);
      await setRunBudget({ path, name: "owner", caps: { s: "5" }, reason: "resolve" });
      entries = readRunBudget(path).entries;
    }
    assert.deepEqual(entries.map((e) => e.invocation), ["iP"], `k=${k}: the entry survives`);
  }
});

test("a cleanup limit this version wrote stays through the move, and the report says why", async () => {
  const { to, a } = roots();
  mkdirSync(to, { recursive: true });
  writeFileSync(join(to, "cleanup-limit.h.json"), JSON.stringify({ v: 1, host: "h", limit: { kind: "gb", gb: 50, bytes: 50 * 2 ** 30 }, set_at: "2026-10-13", written_by: LIMIT_WRITER }));
  writeFileSync(join(a, "cleanup-limit.h.json"), JSON.stringify({ v: 1, host: "h", limit: { kind: "gb", gb: 5, bytes: 5 * 2 ** 30 }, set_at: "2026-09-01" }));
  const report = await migrateMachineState({ to, from: [a], deps });
  assert.equal(JSON.parse(readFileSync(join(to, "cleanup-limit.h.json"), "utf8")).limit.gb, 50);
  assert.match(report.join("\n"), /the limit set with this version stays/);
  assert.equal(archived(to, "cleanup-limit.h.json").length, 1);
});

// ── interleavings: a reader against `team budget set` and against the move ──
// Deterministic: the other writer's effects are injected between the reader's
// own steps by hooking node:fs (syncBuiltinESMExports updates the named
// imports run-budget.mjs holds).

function interleave(path, onTouch) {
  const realRead = fsModule.readFileSync, realExists = fsModule.existsSync;
  let armed = true;
  fsModule.readFileSync = function (p, ...rest) {
    try { return realRead.call(this, p, ...rest); }
    finally { if (armed && String(p) === path) { armed = false; onTouch(); } }
  };
  fsModule.existsSync = function (p) {
    const r = realExists.call(this, p);
    if (armed && String(p) === path) { armed = false; onTouch(); }
    return r;
  };
  syncBuiltinESMExports();
  return () => { fsModule.readFileSync = realRead; fsModule.existsSync = realExists; syncBuiltinESMExports(); };
}

test("a reader racing `team budget set` resolving a conflict never reads 'no budget'", async () => {
  const { to } = roots();
  mkdirSync(to, { recursive: true });
  const path = join(to, "run-budget.json");
  const marker = join(to, BUDGET_CONFLICT_MARKER);
  const conflict = () => { rmSync(path, { force: true }); writeFileSync(marker, "{}\n"); };
  const setEffects = () => { writeFileSync(path, budget("owner")); rmSync(marker, { force: true }); };
  for (const reader of [
    () => { try { return readRunBudget(path) ? "budget" : "none"; } catch (e) { return e.code; } },
    () => (runBudgetActive(path) ? "active" : "none"),
  ]) {
    conflict();
    const restore = interleave(path, setEffects);
    let out;
    try { out = reader(); } finally { restore(); }
    assert.notEqual(out, "none", "refuses or reads the budget just set");
  }
});

test("a reader racing a move in conflict never reads 'no budget'", () => {
  const { to } = roots();
  mkdirSync(to, { recursive: true });
  const path = join(to, "run-budget.json");
  const marker = join(to, BUDGET_CONFLICT_MARKER);
  writeFileSync(path, budget("new"));
  const moveEffects = () => { writeFileSync(marker, "{}\n"); rmSync(path, { force: true }); };
  const restore = interleave(path, moveEffects);
  let out;
  try { try { out = readRunBudget(path) ? "budget" : "none"; } catch (e) { out = e.code; } } finally { restore(); }
  assert.notEqual(out, "none");
});

// ── a sandboxed harness: cannot list Packages, cannot write the state root ──

test("legacyStateView: an unlistable Packages is 'unknown', not 'none'", () => {
  const home = mkdtempSync(join(tmpdir(), "wp-mig-view-"));
  const lad = join(home, "lad");
  mkdirSync(lad, { recursive: true });
  writeFileSync(join(lad, "Packages"), "not a directory — readdir fails like a sandbox's EPERM");
  const v = legacyStateView({ platform: "win32", env: { LOCALAPPDATA: lad }, home });
  assert.deepEqual(v.unknown, [join(lad, "Packages")]);
  const none = legacyStateView({ platform: "win32", env: { LOCALAPPDATA: join(home, "absent") }, home });
  assert.deepEqual(none.unknown, [], "a Packages that does not exist is simply none");
});

test("a budget check that cannot see every old location refuses until a full view has checked them", { skip: process.platform !== "win32" }, () => {
  const home = mkdtempSync(join(tmpdir(), "wp-mig-blind-"));
  const lad = join(home, "lad");
  mkdirSync(lad, { recursive: true });
  writeFileSync(join(lad, "Packages"), "x");
  const code = `import("./scripts/run-budget.mjs").then((m) => { try { m.readRunBudget(); console.log("none"); } catch (e) { console.log(e.code); } })`;
  const env = cliEnv(home, { LOCALAPPDATA: lad });
  const r1 = spawnSync(process.execPath, ["-e", code], { cwd: REPO, encoding: "utf8", env });
  assert.equal(r1.stdout.trim(), "run-budget-legacy-unknown", r1.stderr);
  const root = join(home, ".local", "state", "waypost");
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "legacy-roots-checked.json"), "{}\n");
  const r2 = spawnSync(process.execPath, ["-e", code], { cwd: REPO, encoding: "utf8", env });
  assert.equal(r2.stdout.trim(), "none", "once a full view has checked, the blind one trusts it");
});

test("a full view that finds no old budget records that it checked", () => {
  const home = mkdtempSync(join(tmpdir(), "wp-mig-full-"));
  const root = join(home, ".local", "state", "waypost");
  mkdirSync(root, { recursive: true });
  const code = `import("./scripts/run-budget.mjs").then((m) => { try { m.readRunBudget(); console.log("none"); } catch (e) { console.log(e.code); } })`;
  const r = spawnSync(process.execPath, ["-e", code], { cwd: REPO, encoding: "utf8", env: cliEnv(home) });
  assert.equal(r.stdout.trim(), "none", r.stderr);
  assert.ok(existsSync(join(root, "legacy-roots-checked.json")));
});

test("stateWriteHint: a write the sandbox refuses names the directory, and for Codex the setting that allows it", () => {
  const dir = join("H", ".local", "state", "waypost", "slots.X");
  const codex = stateWriteHint(dir, { code: "EPERM", message: "raw" }, { CODEX_SHELL: "1" });
  assert.match(codex, /cannot write the machine state directory/);
  assert.match(codex, /writable_roots/);
  assert.ok(codex.includes(dir));
  assert.doesNotMatch(stateWriteHint(dir, { code: "EPERM" }, {}), /writable_roots = /);
  assert.equal(stateWriteHint(dir, { code: "ENOSPC", message: "raw" }, {}), "raw", "other errors keep their own message");
});

// The move's conflict landing right AFTER the reader's first look at the
// marker and BEFORE it reads the file: only a second marker check catches it.
// The hook must fire, or the test proves nothing.
function afterFirstLook(target, onTouch) {
  const realExists = fsModule.existsSync;
  const state = { fired: false };
  fsModule.existsSync = function (p) {
    const r = realExists.call(this, p);
    if (!state.fired && String(p) === target) { state.fired = true; onTouch(); }
    return r;
  };
  syncBuiltinESMExports();
  state.restore = () => { fsModule.existsSync = realExists; syncBuiltinESMExports(); };
  return state;
}
for (const [label, read] of [
  ["readRunBudget", (p) => { try { return readRunBudget(p) ? "budget" : "none"; } catch (e) { return e.code; } }],
  ["runBudgetActive", (p) => (runBudgetActive(p) ? "active" : "none")],
]) {
  test(`${label}: a move's conflict between the first marker check and the file read never reads 'no budget'`, () => {
    const { to } = roots();
    mkdirSync(to, { recursive: true });
    const path = join(to, "run-budget.json"), marker = join(to, BUDGET_CONFLICT_MARKER);
    writeFileSync(path, budget("new"));
    const hook = afterFirstLook(marker, () => { writeFileSync(marker, "{}\n"); rmSync(path, { force: true }); });
    let out;
    try { out = read(path); } finally { hook.restore(); }
    assert.ok(hook.fired, "the interleaving actually happened");
    assert.notEqual(out, "none");
  });
}

test("an empty old budget alone keeps refusing; beside a placed budget it counts as moved", async () => {
  const { to, a } = roots();
  writeFileSync(join(a, "run-budget.json"), "");
  assert.deepEqual(legacyBudgets([a]), [join(a, "run-budget.json")], "alone: still waiting, refuses");
  const report = await migrateMachineState({ to, from: [a], deps });
  assert.match(report.join("\n"), /an empty run budget/);
});

test("a home that is an ancestor of the account's never moves the account's own old roots", () => {
  const account = userInfo().homedir;
  const parent = dirname(account);
  if (!account || parent === account) return;
  const lad = join(account, "AppData", "Local");
  const moved = legacyDirsToMove({ platform: "win32", env: { LOCALAPPDATA: lad }, home: parent });
  assert.ok(!moved.some((d) => d.toLowerCase().startsWith(account.toLowerCase())), JSON.stringify(moved));
});
