// waypost — run-budget.mjs: the owner's token budget for live runs, one per
// machine (run-budget ADR). An ADMISSION cap, not a hard limit: the Host asks
// before it starts a native call, and spending is never written here — it is
// derived from each admitted call's own invocation in its team authority with
// the ledger's charge rule, so settling, reconciling or accepting unknown usage
// frees or fixes the budget with no extra write and a crash can only over-count.
// Fails closed: a file that exists but cannot be read refuses every call.

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, renameSync, unlinkSync, openSync, closeSync, fsyncSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { machineStateDir } from "./lib.mjs";
import { acquireLock, releaseLock, lockOwnerGone } from "./machine-lock.mjs";
import * as presence from "./presence.mjs";
import * as capacity from "./capacity.mjs";
import { readAuthority } from "./team-store.mjs";
import { reduceTeamEvent } from "./team-state.mjs";
import { invocationCharge } from "./team-subscription.mjs";

const INT = /^(0|[1-9][0-9]{0,17})$/;
const SCHEMA = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const fail = (code, detail = "") => { throw Object.assign(new Error(detail ? `${code}: ${detail}` : code), { code }); };

export const defaultRunBudgetPath = () => join(machineStateDir(), "run-budget.json");
export const runBudgetActive = (path = defaultRunBudgetPath()) => existsSync(path);

function validate(b) {
  const ok = b && typeof b === "object" && b.version === 1 && typeof b.name === "string" && b.name
    && b.caps && typeof b.caps === "object" && !Array.isArray(b.caps)
    && (b.total === null || INT.test(b.total)) && Array.isArray(b.events) && Array.isArray(b.entries)
    && Object.entries(b.caps).every(([k, v]) => SCHEMA.test(k) && INT.test(v))
    && (Object.keys(b.caps).length > 0 || b.total !== null)
    && b.entries.every((e) => e && typeof e.authority === "string" && typeof e.team === "string" && typeof e.invocation === "string"
      && typeof e.schema === "string" && INT.test(e.estimate) && e.holder && typeof e.holder === "object");
  if (!ok) fail("run-budget-invalid");
  return b;
}

// Absent → null (no budget). Present but unreadable or invalid → throws.
export function readRunBudget(path = defaultRunBudgetPath()) {
  let text;
  try { text = readFileSync(path, "utf8"); }
  catch (e) { if (e.code === "ENOENT") return null; fail("run-budget-unreadable", e.code || e.message); }
  let parsed;
  try { parsed = JSON.parse(text); } catch { fail("run-budget-invalid", "not JSON"); }
  return validate(parsed);
}

function writeBudget(path, b) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  const fd = openSync(tmp, "w", 0o600);
  try { writeFileSync(fd, JSON.stringify(b, null, 2) + "\n"); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(tmp, path);
}

async function locked(path, fn) {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  const lock = await acquireLock(dir, presence, capacity);
  if (!lock) fail("run-budget-lock-busy");
  try { return fn(); } finally { releaseLock(lock); }
}

export function selfHolder() {
  const table = process.platform === "win32" ? null : presence.processTable();
  const self = table ? table.get(process.pid) : null;
  return { pid: process.pid, started: self ? self.started : null, ticks: presence.startTicks(process.pid), boot: capacity.bootIdentity() };
}

export const readAuthorityState = (authority) => readAuthority(authority, reduceTeamEvent).state;

// Per entry: how much it holds now and whether it is settled spending or a
// reservation. `gone` marks an entry that derives to zero for good (aborted, or
// never recorded and its holder dead), which admission prunes.
function classify(budget, { readState = readAuthorityState } = {}) {
  const states = new Map();
  const stateOf = (a) => {
    if (!states.has(a)) { try { states.set(a, readState(a) || null); } catch { states.set(a, null); } }
    return states.get(a);
  };
  let table;
  return budget.entries.map((entry) => {
    const s = stateOf(entry.authority);
    if (!s) return { entry, amount: BigInt(entry.estimate), spent: false, gone: false }; // unreadable authority: the estimate
    const x = s.subscription_invocations?.[entry.invocation];
    if (x && x.team === entry.team) {
      return { entry, amount: invocationCharge(x), spent: x.state === "settled" || x.state === "reconciled", gone: x.state === "aborted" };
    }
    if (table === undefined) table = process.platform === "win32" ? null : presence.processTable();
    const gone = lockOwnerGone(entry.holder, presence, table, capacity);
    return { entry, amount: gone ? 0n : BigInt(entry.estimate), spent: false, gone };
  });
}

function tally(cap, rows) {
  const spent = rows.reduce((n, r) => n + (r.spent ? r.amount : 0n), 0n);
  const reserved = rows.reduce((n, r) => n + (r.spent ? 0n : r.amount), 0n);
  const c = cap === null || cap === undefined ? null : BigInt(cap);
  return { cap: c, spent, reserved, remaining: c === null ? null : (c > spent + reserved ? c - spent - reserved : 0n) };
}

// Per schema and in total: {cap, spent, reserved, remaining} (BigInt; cap and
// remaining null where there is no cap).
export function deriveRunBudget(budget, deps = {}) {
  const rows = classify(budget, deps);
  const schemas = {};
  for (const s of new Set([...Object.keys(budget.caps), ...budget.entries.map((e) => e.schema)])) {
    schemas[s] = tally(budget.caps[s], rows.filter((r) => r.entry.schema === s));
  }
  return { schemas, total: tally(budget.total, rows), rows };
}

// Under the machine lock (never held across a team mutation): derive, refuse
// past the schema or total cap, else record the entry. null when no budget.
export async function admitRunBudget({ path = defaultRunBudgetPath(), authority, team, invocation, schema, estimate, deps = {} }) {
  if (readRunBudget(path) === null) return null;
  if (typeof estimate !== "string" || !INT.test(estimate)) fail("run-budget-estimate-required");
  const root = realpathSync(authority);
  return locked(path, () => {
    const b = readRunBudget(path);
    if (b === null) return null;
    const d = deriveRunBudget(b, deps);
    const need = BigInt(estimate);
    if (Object.keys(b.caps).length > 0 && !(schema in b.caps)) fail("run-budget-schema-uncapped", `schema ${schema} has no cap`);
    const s = d.schemas[schema];
    if (s && s.cap !== null && s.spent + s.reserved + need > s.cap) fail("run-budget-exhausted", `schema ${schema}, cap ${s.cap}, remaining ${s.remaining}`);
    if (d.total.cap !== null && d.total.spent + d.total.reserved + need > d.total.cap) fail("run-budget-exhausted", `total (not quota-equivalent), cap ${d.total.cap}, remaining ${d.total.remaining}`);
    const dead = new Set(d.rows.filter((r) => r.gone).map((r) => r.entry));
    b.entries = b.entries.filter((e) => !dead.has(e) && !(e.authority === root && e.invocation === invocation));
    b.entries.push({ authority: root, team, invocation, schema, estimate, holder: selfHolder() });
    writeBudget(path, b);
    return { path, authority: root, invocation };
  });
}

// The Host takes back its own entry when the call failed before the ledger
// recorded the reservation. Best effort: a miss only over-counts until the
// holder process ends.
export async function removeRunBudgetEntry({ path = defaultRunBudgetPath(), authority, invocation }) {
  const root = realpathSync(authority);
  return locked(path, () => {
    const b = readRunBudget(path);
    if (!b) return;
    b.entries = b.entries.filter((e) => !(e.authority === root && e.invocation === invocation));
    writeBudget(path, b);
  });
}

function checkCaps(caps, total) {
  for (const [k, v] of Object.entries(caps)) if (!SCHEMA.test(k) || !INT.test(v)) fail("run-budget-cap-invalid", `${k}=${v}`);
  if (total !== null && !INT.test(total)) fail("run-budget-cap-invalid", `total=${total}`);
  if (Object.keys(caps).length === 0 && total === null) fail("run-budget-cap-required");
}

// Create, raise or lower: replaces the caps, keeps the admitted entries.
export async function setRunBudget({ path = defaultRunBudgetPath(), name, caps = {}, total = null, reason, now = new Date().toISOString() }) {
  if (typeof name !== "string" || !name) fail("run-budget-name-required");
  if (typeof reason !== "string" || !reason.trim()) fail("run-budget-reason-required");
  checkCaps(caps, total);
  return locked(path, () => {
    const old = readRunBudget(path);
    const b = { version: 1, name, caps, total, events: [...(old?.events || []), { at: now, kind: "set", reason, name, caps, total }], entries: old?.entries || [] };
    writeBudget(path, b);
    return b;
  });
}

// Removes the file and keeps the event in a history log beside it.
export async function clearRunBudget({ path = defaultRunBudgetPath(), reason, now = new Date().toISOString() }) {
  if (typeof reason !== "string" || !reason.trim()) fail("run-budget-reason-required");
  return locked(path, () => {
    const had = existsSync(path);
    if (had) {
      appendFileSync(join(dirname(path), "run-budget-history.jsonl"), JSON.stringify({ at: now, kind: "clear", reason }) + "\n");
      unlinkSync(path);
    }
    return had;
  });
}

export function runBudgetStatus({ path = defaultRunBudgetPath(), deps = {} } = {}) {
  const b = readRunBudget(path);
  if (!b) return null;
  const d = deriveRunBudget(b, deps);
  const out = (t) => ({ cap: t.cap === null ? null : String(t.cap), spent: String(t.spent), reserved: String(t.reserved), remaining: t.remaining === null ? null : String(t.remaining) });
  return { name: b.name, schemas: Object.fromEntries(Object.entries(d.schemas).map(([k, v]) => [k, out(v)])), total: { ...out(d.total), note: "not quota-equivalent" }, events: b.events };
}
