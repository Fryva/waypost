// The owner's run budget (run-budget ADR): admission, derivation, fail-closed
// reads, the CLI's consent rule, and concurrent admission across processes.
// Every path is a temp directory; nothing here touches the real machine state.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync, spawn } from "node:child_process";
import { ambientEnv } from "./env.mjs";
import {
  admitRunBudget, readRunBudget, setRunBudget, clearRunBudget, removeRunBudgetEntry, runBudgetStatus, runBudgetActive, selfHolder,
} from "../scripts/run-budget.mjs";
import { invocationCharge } from "../scripts/team-subscription.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const WAYPOST = join(ROOT, "bin", "waypost");
const SCHEMA = "codex-thread-cumulative-total-v1";

function fixture(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "wp-run-budget-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "state", "run-budget.json");
  const authority = (name) => { const a = join(dir, name); mkdirSync(a); return a; };
  const states = new Map();
  const deps = { readState: (a) => { if (!states.has(a)) throw new Error("unreadable"); return states.get(a); } };
  return { dir, path, authority, states, deps };
}
const admit = (f, over) => admitRunBudget({ path: f.path, team: "team", schema: SCHEMA, estimate: "10", deps: f.deps, ...over });
const deadHolder = () => { const r = spawnSync(process.execPath, ["-e", ""]); return { pid: r.pid, started: null, ticks: null, boot: null }; };

test("invocationCharge: settled and reconciled count the charge, open states the estimate, aborted nothing", () => {
  const x = (state) => ({ state, charged_tokens: "7", estimate_tokens: "40" });
  assert.equal(invocationCharge(x("settled")), 7n);
  assert.equal(invocationCharge(x("reconciled")), 7n);
  for (const s of ["prepared", "consumed", "uncertain"]) assert.equal(invocationCharge(x(s)), 40n);
  assert.equal(invocationCharge(x("aborted")), 0n);
});

test("no budget file: admission is a no-op and nothing is created", async (t) => {
  const f = fixture(t), a = f.authority("a");
  assert.equal(await admit(f, { authority: a, invocation: "subscription-n1" }), null);
  assert.equal(runBudgetActive(f.path), false);
  assert.equal(readRunBudget(f.path), null);
  assert.equal(runBudgetStatus({ path: f.path }), null);
  assert.equal(existsSync(dirname(f.path)), false);
});

test("a cap is required, and set keeps the admitted entries", async (t) => {
  const f = fixture(t), a = f.authority("a");
  await assert.rejects(setRunBudget({ path: f.path, name: "n", reason: "r" }), /run-budget-cap-required/);
  await assert.rejects(setRunBudget({ path: f.path, name: "n", caps: { [SCHEMA]: "1.5" }, reason: "r" }), /run-budget-cap-invalid/);
  await assert.rejects(setRunBudget({ path: f.path, name: "n", caps: { [SCHEMA]: "50" }, reason: " " }), /run-budget-reason-required/);
  await setRunBudget({ path: f.path, name: "n", caps: { [SCHEMA]: "50" }, reason: "start" });
  await admit(f, { authority: a, invocation: "subscription-n1" });
  const raised = await setRunBudget({ path: f.path, name: "n", caps: { [SCHEMA]: "500" }, total: "900", reason: "raise" });
  assert.equal(raised.entries.length, 1);
  assert.deepEqual(raised.events.map((e) => e.kind), ["set", "set"]);
  assert.equal(readRunBudget(f.path).caps[SCHEMA], "500");
});

test("refusal names the schema, cap and remainder and records nothing", async (t) => {
  const f = fixture(t), a = f.authority("a");
  await setRunBudget({ path: f.path, name: "n", caps: { [SCHEMA]: "25" }, reason: "r" });
  await admit(f, { authority: a, invocation: "subscription-n1" });
  await admit(f, { authority: a, invocation: "subscription-n2" });
  const before = readFileSync(f.path, "utf8");
  await assert.rejects(admit(f, { authority: a, invocation: "subscription-n3" }), (e) => e.code === "run-budget-exhausted"
    && e.message.includes(SCHEMA) && e.message.includes("cap 25") && e.message.includes("remaining 5"));
  assert.equal(readFileSync(f.path, "utf8"), before, "a refused call changes nothing");
});

test("a schema without a cap is refused when schema caps exist; a total alone caps every schema", async (t) => {
  const f = fixture(t), a = f.authority("a");
  await setRunBudget({ path: f.path, name: "n", caps: { "other-v1": "100" }, reason: "r" });
  await assert.rejects(admit(f, { authority: a, invocation: "subscription-n1" }), /run-budget-schema-uncapped/);
  await setRunBudget({ path: f.path, name: "n", total: "15", reason: "total only" });
  await admit(f, { authority: a, invocation: "subscription-n1" });
  await assert.rejects(admit(f, { authority: a, invocation: "subscription-n2", schema: "other-v1" }), (e) => e.code === "run-budget-exhausted" && /total \(not quota-equivalent\), cap 15, remaining 5/.test(e.message));
});

test("a file that exists but cannot be read or validated refuses admission", async (t) => {
  const f = fixture(t), a = f.authority("a");
  mkdirSync(dirname(f.path), { recursive: true });
  for (const bad of ["{ not json", "[]", JSON.stringify({ version: 1, name: "n", caps: {}, total: null, events: [], entries: [] }), JSON.stringify({ version: 2 })]) {
    writeFileSync(f.path, bad);
    assert.equal(runBudgetActive(f.path), true);
    assert.throws(() => readRunBudget(f.path), /run-budget-(invalid|unreadable)/);
    await assert.rejects(admit(f, { authority: a, invocation: "subscription-n1" }), /run-budget-(invalid|unreadable)/);
  }
});

test("derivation per invocation state, holder liveness and unreadable authorities", async (t) => {
  const f = fixture(t);
  await setRunBudget({ path: f.path, name: "n", caps: { [SCHEMA]: "1000" }, reason: "r" });
  const a = f.authority("a"), gone = f.authority("gone"), unreadable = f.authority("unreadable");
  const inv = (state, extra = {}) => ({ team: "team", state, estimate_tokens: "10", charged_tokens: "7", ...extra });
  f.states.set(a, { subscription_invocations: {
    "subscription-settled": inv("settled"), "subscription-reconciled": inv("reconciled"), "subscription-prepared": inv("prepared"),
    "subscription-consumed": inv("consumed"), "subscription-uncertain": inv("uncertain"), "subscription-aborted": inv("aborted"),
  } });
  f.states.set(gone, { subscription_invocations: {} });
  for (const n of ["settled", "reconciled", "prepared", "consumed", "uncertain", "aborted", "live-absent"]) await admit(f, { authority: a, invocation: "subscription-" + n });
  await admit(f, { authority: gone, invocation: "subscription-dead-absent" });
  await admit(f, { authority: unreadable, invocation: "subscription-unreadable" });
  const b = readRunBudget(f.path);
  b.entries.find((e) => e.invocation === "subscription-dead-absent").holder = deadHolder();
  writeFileSync(f.path, JSON.stringify(b));
  const s = runBudgetStatus({ path: f.path, deps: f.deps }).schemas[SCHEMA];
  // spent: settled 7 + reconciled 7; reserved: prepared, consumed, uncertain, live holder with no invocation, unreadable = 5 x 10
  assert.deepEqual([s.spent, s.reserved, s.remaining], ["14", "50", "936"]);
  // The next admission prunes what derives to zero for good (aborted, dead holder, absent).
  await admit(f, { authority: a, invocation: "subscription-next" });
  const names = readRunBudget(f.path).entries.map((e) => e.invocation);
  assert.ok(!names.includes("subscription-aborted") && !names.includes("subscription-dead-absent"));
});

test("the same team and nonce in two vaults do not collide", async (t) => {
  const f = fixture(t), a = f.authority("a"), b = f.authority("b");
  await setRunBudget({ path: f.path, name: "n", caps: { [SCHEMA]: "100" }, reason: "r" });
  f.states.set(a, { subscription_invocations: { "subscription-same": { team: "team", state: "settled", estimate_tokens: "10", charged_tokens: "30" } } });
  f.states.set(b, { subscription_invocations: {} });
  await admit(f, { authority: a, invocation: "subscription-same" });
  await admit(f, { authority: b, invocation: "subscription-same" });
  assert.equal(readRunBudget(f.path).entries.length, 2);
  const s = runBudgetStatus({ path: f.path, deps: f.deps }).schemas[SCHEMA];
  assert.deepEqual([s.spent, s.reserved], ["30", "10"]);
  await removeRunBudgetEntry({ path: f.path, authority: b, invocation: "subscription-same" });
  assert.deepEqual(readRunBudget(f.path).entries.map((e) => e.authority), [a]);
});

test("clear removes the budget and keeps the reason in a history log", async (t) => {
  const f = fixture(t);
  await setRunBudget({ path: f.path, name: "n", caps: { [SCHEMA]: "100" }, reason: "r" });
  await assert.rejects(clearRunBudget({ path: f.path, reason: "" }), /run-budget-reason-required/);
  assert.equal(await clearRunBudget({ path: f.path, reason: "done testing" }), true);
  assert.equal(runBudgetActive(f.path), false);
  assert.match(readFileSync(join(dirname(f.path), "run-budget-history.jsonl"), "utf8"), /done testing/);
});

test("concurrent admission from separate processes never exceeds the cap", async (t) => {
  const f = fixture(t), a = f.authority("a");
  await setRunBudget({ path: f.path, name: "n", caps: { [SCHEMA]: "30" }, reason: "r" });
  const child = `import(${JSON.stringify(pathToFileURL(join(ROOT, "scripts", "run-budget.mjs")).href)}).then(async m=>{
    try{await m.admitRunBudget({path:process.argv[1],authority:process.argv[2],team:'team',invocation:'subscription-'+process.pid,schema:${JSON.stringify(SCHEMA)},estimate:'10',deps:{readState:()=>null}});console.log('admitted');}
    catch(e){console.log(e.code);}})`;
  const env = { ...ambientEnv(), HOME: f.dir, USERPROFILE: f.dir, XDG_STATE_HOME: f.dir, LOCALAPPDATA: f.dir };
  const run = () => new Promise((res) => {
    const p = spawn(process.execPath, ["-e", child, f.path, a], { env, stdio: ["ignore", "pipe", "inherit"] });
    let out = ""; p.stdout.on("data", (d) => (out += d)); p.on("close", () => res(out.trim()));
  });
  const results = await Promise.all(Array.from({ length: 6 }, run));
  const admitted = results.filter((r) => r === "admitted").length;
  assert.ok(admitted >= 1 && admitted <= 3, `admitted ${admitted}: ${results}`);
  assert.ok(results.every((r) => ["admitted", "run-budget-exhausted", "run-budget-lock-busy"].includes(r)), String(results));
  assert.equal(readRunBudget(f.path).entries.length, admitted);
});

test("the holder of an entry is this live process", async (t) => {
  const f = fixture(t), a = f.authority("a");
  await setRunBudget({ path: f.path, name: "n", caps: { [SCHEMA]: "100" }, reason: "r" });
  await admit(f, { authority: a, invocation: "subscription-n1" });
  assert.equal(readRunBudget(f.path).entries[0].holder.pid, selfHolder().pid);
});

test("team budget: consent is required, set/status/clear work, and the state lives in the machine state directory", (t) => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "wp-run-budget-cli-")));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const env = { ...ambientEnv(), HOME: home, USERPROFILE: home, XDG_STATE_HOME: home, LOCALAPPDATA: home };
  const cli = (...args) => spawnSync(process.execPath, [WAYPOST, "team", "budget", ...args], { env, cwd: home, encoding: "utf8" });
  const refused = cli("set", "--name", "n", "--cap", `${SCHEMA}=100`);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /owner-consent-required/);
  assert.notEqual(cli("set", "--name", "n", "--cap", `${SCHEMA}=100`, "--yes").status, 0, "--reason is required too");
  assert.notEqual(cli("clear", "--yes").status, 0);
  const ok = cli("set", "--name", "n", "--cap", `${SCHEMA}=100`, "--total", "300", "--yes", "--reason", "owner said so");
  assert.equal(ok.status, 0, ok.stderr);
  const st = JSON.parse(cli("status", "--json").stdout);
  assert.deepEqual(st.schemas[SCHEMA], { cap: "100", spent: "0", reserved: "0", remaining: "100" });
  assert.equal(st.total.cap, "300");
  assert.match(st.total.note, /not quota-equivalent/);
  assert.match(cli("status").stdout, /not quota-equivalent/);
  assert.equal(cli("clear", "--yes", "--reason", "finished").status, 0);
  assert.match(cli("status").stdout, /no run budget/);
});

test("an adapter without a counter schema is refused, and the budget stays readable for every other call", async (t) => {
  const f = fixture(t);
  await setRunBudget({ path: f.path, name: "run", total: "100", reason: "test" });
  await assert.rejects(admit(f, { authority: f.authority("a"), invocation: "subscription-x", schema: undefined }), /run-budget-schema-unknown/);
  assert.equal(readRunBudget(f.path).entries.length, 0);
  assert.ok(await admit(f, { authority: f.authority("b"), invocation: "subscription-y" }));
});
