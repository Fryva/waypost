// Isolated child only: all writes stay in an owned fixture, all PIDs are fake.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { resolve, join, sep } from "node:path";
import { syncBuiltinESMExports } from "node:module";

const [moduleURL, fixtureRoot] = process.argv.slice(2);
const root = fs.realpathSync(fixtureRoot);
const original = Object.fromEntries(["writeFileSync", "renameSync", "unlinkSync", "readdirSync"].map(k => [k, fs[k].bind(fs)]));
const violations = [];
let trace = [], mode = "", pid = 4242, host = "fixture-host.domain", pidReads = 0;
const descriptor = Object.getOwnPropertyDescriptor(process, "pid");
Object.defineProperty(process, "pid", { configurable: true, enumerable: descriptor.enumerable, get() { pidReads++; return pid; } });
assert.equal(process.pid, 4242); pid = 4343; assert.equal(process.pid, 4343); pid = 4242;
const initialReads = pidReads;
const fault = Object.assign(new Error("injected writer failure"), { code: "EPERM" });
const transient = Object.assign(new Error("injected sweep failure"), { code: "EACCES" });
let protectedPaths = new Set();
function checked(path) {
  const p = resolve(path);
  if (!p.startsWith(root + sep) || protectedPaths.has(p)) { violations.push(p); throw new Error(`forbidden mutation: ${p}`); }
  return p;
}
function short(path) { return String(path).slice(root.length + 1); }
os.hostname = () => { trace.push(["hostname"]); return host; };
process.kill = (p, signal) => {
  if (signal !== 0 || ![101,102,103,104].includes(p)) { violations.push([p,signal]); throw new Error("forbidden PID probe"); }
  trace.push(["kill", p, signal]);
  if (p === 101) throw Object.assign(new Error("dead"), { code: "ESRCH" });
  if (p === 103) throw Object.assign(new Error("denied"), { code: "EPERM" });
  if (p === 104) throw Object.assign(new Error("other"), { code: "EINVAL" });
  return true;
};
fs.readdirSync = (p, ...args) => {
  assert.ok(resolve(p).startsWith(root + sep));
  trace.push(["list", short(p)]);
  if (mode === "list-failure") throw transient;
  return original.readdirSync(p, ...args);
};
fs.writeFileSync = (p, content, ...args) => {
  checked(p); trace.push(["write", short(p), Buffer.isBuffer(content) ? [...content] : content, ...args]);
  if (mode === "write-failure") { original.writeFileSync(p, "partial"); throw fault; }
  return original.writeFileSync(p, content, ...args);
};
fs.renameSync = (a, b) => {
  checked(a); checked(b); trace.push(["rename", short(a), short(b)]);
  if (mode.startsWith("rename-failure")) throw fault;
  return original.renameSync(a, b);
};
fs.unlinkSync = p => {
  checked(p); trace.push(["unlink", short(p)]);
  if ((mode === "orphan-failure" && String(p).includes(".101.tmp")) || (mode === "rename-failure-cleanup" && String(p).includes(".result.md."))) throw transient;
  return original.unlinkSync(p);
};
syncBuiltinESMExports();
const m = await import(moduleURL);
assert.equal(pidReads, initialReads, "PID must not be captured on import");
assert.deepEqual(trace, [], "no import-time action");
const results = [];
function identity(p) { const s = fs.statSync(p); return { bytes: fs.readFileSync(p).toString("hex"), ino: s.ino, dev: s.dev, mtimeMs: s.mtimeMs }; }
for (const name of ["success", "no-sweep", "list-failure", "orphan-failure", "write-failure", "rename-failure", "rename-failure-cleanup", "buffer", "missing-parent"]) {
  mode = name;
  const dir = join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  const target = join(dir, "result.md");
  const dead = join(dir, ".dead.md.fixture-host.101.tmp");
  const tmp = join(dir, ".result.md.fixture-host.4242.tmp");
  // Replay resets only explicitly mutable outputs; protected identities survive.
  for (const p of [target, dead, tmp]) { try { original.unlinkSync(p); } catch (e) { if (e.code !== "ENOENT") throw e; } }
  original.writeFileSync(target, "old\n"); original.writeFileSync(dead, "orphan\n");
  const kept = [".live.md.fixture-host.102.tmp", ".denied.md.fixture-host.103.tmp", ".other.md.fixture-host.104.tmp", ".self.md.fixture-host.4242.tmp", ".zero.md.fixture-host.0.tmp", ".foreign.md.other-host.101.tmp", ".legacy.md.101.tmp", ".gitignore", ".bad.md.fixture-host.xyz.tmp"];
  protectedPaths = new Set(kept.map(n => join(dir, n)));
  for (const p of protectedPaths) if (!fs.existsSync(p)) original.writeFileSync(p, `protected:${short(p)}\n`);
  const before = [...protectedPaths].map(p => [short(p), identity(p)]);
  trace = []; const reads = pidReads;
  let error;
  const destination = name === "missing-parent" ? join(dir, "absent", "result.md") : target;
  const content = name === "buffer" ? Buffer.from([0, 255, 10]) : "new\n";
  try { assert.equal(m.writeFileAtomic(destination, content, name === "no-sweep" ? { sweep: false } : undefined), undefined); }
  catch (e) { error = e; }
  const calls = [...trace];
  assert.deepEqual([...protectedPaths].map(p => [short(p), identity(p)]), before);
  assert.ok(pidReads > reads, "PID is read at call time");
  if (["write-failure", "rename-failure", "rename-failure-cleanup"].includes(name)) assert.equal(error, fault, "original error identity");
  else if (name === "missing-parent") assert.equal(error.code, "ENOENT");
  else assert.equal(error, undefined);
  const names = original.readdirSync(dir).sort();
  if (["no-sweep", "list-failure", "orphan-failure", "missing-parent"].includes(name)) assert.ok(names.includes(short(dead).split(sep).at(-1)));
  else assert.ok(!fs.existsSync(dead), JSON.stringify({name,calls}));
  if (name === "no-sweep") assert.equal(calls.some(c => ["list", "kill"].includes(c[0])), false);
  if (name === "success") {
    assert.deepEqual(calls.filter(c => c[0] === "kill").map(c => c[1]).sort((a,b)=>a-b), [101,102,103,104]);
    assert.equal(calls[0][0], "list");
    assert.ok(calls.findIndex(c => c[0] === "unlink") < calls.findIndex(c => c[0] === "write"));
  }
  if (["write-failure", "rename-failure", "rename-failure-cleanup", "missing-parent"].includes(name)) assert.equal(fs.readFileSync(target,"utf8"), "old\n");
  else assert.deepEqual(fs.readFileSync(target), Buffer.from(content));
  assert.equal(fs.existsSync(tmp), name === "rename-failure-cleanup");
  results.push({ name, calls, error: error ? { name:error.name, code:error.code, message:error.message } : null, sameInjectedError:error===fault, files:names.map(n=>[n,fs.readFileSync(join(dir,n)).toString("hex")]), protected:before });
}
// Two call-time PID values and host changes must affect generated names.
mode = "call-time"; protectedPaths = new Set(); trace=[];
const dir = join(root,"call-time"); fs.mkdirSync(dir,{recursive:true});
for (const value of [4242,4343]) { pid=value; assert.equal(process.pid,value); m.writeFileAtomic(join(dir,"out.md"),"x",{sweep:false}); }
assert.deepEqual(trace.filter(c=>c[0]==="write").map(c=>c[1]),[join("call-time",".out.md.fixture-host.4242.tmp"),join("call-time",".out.md.fixture-host.4343.tmp")]);
const callTime = [...trace];
const hosts=[];
for (const [value, expected] of [["Mac_Name.local","Mac_Name"],["?","-"],[".empty","host"],["","host"],["abcdefghijklmnopqrstuvwxyz.domain","abcdefghijklmnopqrstuvwx"]]) { host=value; assert.equal(m.hostTag(),expected); hosts.push([value,expected]); }
results.push({name:"call-time",calls:callTime,hosts});
assert.deepEqual(violations, [], "no forbidden attempts, even swallowed ones");
console.log(JSON.stringify({results,pidReads,protectedFiles:81}));
