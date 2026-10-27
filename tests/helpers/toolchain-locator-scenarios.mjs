// Controlled locator execution only: no fixture path or command reaches the OS.
import assert from "node:assert/strict";
import fs from "node:fs";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { join, sep } from "node:path";
import { tmpdir } from "node:os";

const source = fs.readFileSync(process.argv[2], "utf8");
const original = { readdirSync: fs.readdirSync, lstatSync: fs.lstatSync, spawnSync: childProcess.spawnSync };
const descriptor = Object.getOwnPropertyDescriptor(process, "platform");
const root = join(tmpdir(), "waypost-locator-model", "project");
const home = join(tmpdir(), "waypost-locator-model", "home");
const base = join(home, "Library", "Developer", "Xcode", "DerivedData");
const events = [], violations = [], rows = [];
let state = {}, platform = "darwin", platformReads = 0;
const unexpected = (kind, value) => { violations.push([kind, value]); throw new Error("unexpected " + kind); };
fs.readdirSync = p => {
  if (p !== base) return unexpected("readdir", p);
  events.push(["readdir", p]);
  if (state.readError) throw new Error("fixture listing failed");
  return [...(state.names || [])];
};
fs.lstatSync = p => {
  const name = (state.names || []).find(n => join(base, n) === p);
  if (!name) return unexpected("lstat", p);
  events.push(["lstat", name]);
  if (name === "App-statfail") throw new Error("fixture stat failed");
  return { isDirectory: () => name !== "App-file", isSymbolicLink: () => name === "App-link" };
};
childProcess.spawnSync = (command, argv, options) => {
  const name = (state.names || []).find(n => join(base, n, "info.plist") === argv?.[3]);
  if (command !== "plutil" || !name) return unexpected("spawn", [command, argv]);
  assert.deepEqual(argv.slice(0, 3), ["-extract", "WorkspacePath", "raw"]);
  assert.deepEqual(options, { encoding: "utf8", timeout: 5000 });
  events.push(["spawn", command, argv, options]);
  if (state.spawnError) throw new Error("fixture spawn failed");
  if (state.undefinedResult) return undefined;
  if (name === "App-no") return { status: 1, stdout: root + sep + "inside" };
  const path = name === "App-root" ? root : name === "App-prefix" ? root + "-other" + sep + "file" : name === "Other-z" ? join(home, "outside") : root + sep + name;
  return { status: 0, stdout: " \n" + path + "\n " };
};
syncBuiltinESMExports();
try {
  // Named ESM exports must observe each guard; a swallowed error cannot hide it.
  const namedFS = await import("node:fs"), namedCP = await import("node:child_process");
  for (const f of [() => namedFS.readdirSync("unexpected"), () => namedFS.lstatSync("unexpected"), () => namedCP.spawnSync("unexpected", [])]) assert.throws(f, /unexpected/);
  assert.equal(violations.length, 3); violations.length = 0; events.length = 0;
  const module = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
  assert.deepEqual(events, [], "import must not inspect files or run a locator");
  Object.defineProperty(process, "platform", { configurable: true, enumerable: true, get() { platformReads++; return platform; } });
  const run = (label, f) => {
    events.length = 0; platformReads = 0;
    try { rows.push({ label, result: f(), events: [...events], platformReads }); }
    catch (e) { rows.push({ label, error: { name: e.name, message: e.message }, events: [...events], platformReads }); }
  };
  const names = ["Other-z", "App-z", "Noise-a", "App-link", "App-a", "App-root", "App-prefix", "App-file", "App-no", "App-statfail"];
  for (const config of [
    { label: "sorted", names }, { label: "empty", names: [] }, { label: "list-error", readError: true },
    { label: "budget0", names, deny: 1 }, { label: "budget3", names, deny: 3 },
    { label: "budget-throw", names, throwCharge: 2 }, { label: "spawn-error", names: ["App-a"], spawnError: true },
    { label: "undefined-result", names: ["App-a"], undefinedResult: true },
  ]) {
    state = config; let charges = 0;
    run(config.label, () => module.runLocator("xcode-derived-data", { root, home, basenames: new Set(["Other", "App"]), chargeCall() {
      events.push(["charge", ++charges]);
      if (charges === config.throwCharge) throw new Error("fixture budget failed");
      return charges !== config.deny;
    } }));
  }
  state = { names };
  for (const p of ["linux", "win32", "darwin", undefined]) {
    run("platform:" + p, () => module.runLocator("xcode-derived-data", { platform: p, root, home, basenames: new Set(p === "darwin" ? [] : ["App"]), chargeCall() { throw new Error("empty must not charge"); } }));
  }
  for (const name of ["unknown", "constructor", "toString", "__proto__"]) run("lookup:" + name, () => module.runLocator(name, { marker: 7, platform: "override" }));
  const collect = [".xcodeproj"];
  const entries = [{ locators: [{ name: "same", os: ["linux"], collect: [".ignored"] }, { name: "same", os: ["darwin"], collect }, { name: "missing", os: ["darwin"] }] }, { locators: [{ name: "same", os: ["darwin"], collect: [".later"] }] }];
  for (const p of ["darwin", "linux", "win32"]) {
    platform = p;
    run("applicable:" + p, () => { const a = module.applicableLocators(entries), b = module.applicableLocators(entries); return { value: a, collectIdentity: a[0]?.collect === collect, freshResult: a !== b, freshDefault: a[1]?.collect !== b[1]?.collect }; });
  }
  for (const entries of [null, [null], [{ locators: [null] }]]) run("applicable-error", () => module.applicableLocators(entries));
  assert.deepEqual(violations, [], "unexpected native attempts survive swallowed production catches");
  // Golden controls ensure replay is meaningful, not just equal to a broken mock.
  const sorted = rows.find(r => r.label === "sorted");
  assert.deepEqual(sorted.result, { matches: [join(base, "App-a"), join(base, "App-z")], incomplete: false });
  assert.equal(rows.find(r => r.label === "budget0").events.some(e => e[0] === "lstat" || e[0] === "spawn"), false);
  assert.equal(rows.find(r => r.label === "budget3").result.incomplete, true);
  assert.equal(rows.find(r => r.label === "applicable:darwin").result.collectIdentity, true);
  for (const p of ["linux", "win32", "darwin", undefined]) {
    const row = rows.find(r => r.label === "platform:" + p);
    assert.deepEqual(row.result, { matches: [], incomplete: false });
    assert.deepEqual(row.events, []);
    assert.equal(row.platformReads, 1);
  }
  process.stdout.write(JSON.stringify({ rows, positiveControls: 3, unexpectedAttempts: violations }));
} finally {
  fs.readdirSync = original.readdirSync; fs.lstatSync = original.lstatSync; childProcess.spawnSync = original.spawnSync;
  Object.defineProperty(process, "platform", descriptor);
  syncBuiltinESMExports();
}
