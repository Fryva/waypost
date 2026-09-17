#!/usr/bin/env node
// waypost — the launcher on PATH, and what happens to it in a shared checkout.
//
// `npm link` (and `npm install -g` from a checkout) puts a SYMLINK on PATH that
// points straight at `<checkout>/bin/waypost`. The command then runs only while
// that one file carries its executable bit. A checkout that another operating
// system edits over a network share loses the bit on every save from there:
// the share has no such bit to write back. `core.fileMode=false` — the setting
// such a checkout needs anyway — means git will not notice or restore it, and
// `waypost` starts answering "permission denied" in the middle of someone's work.
//
// A shim does not have the problem: a two-line script on the local disk that
// runs the entry point through node needs no bit on the entry point at all.
// The checkout's edits are still picked up at once, exactly as with the symlink.
//
//   waypost launcher            report what is on PATH and whether it is exposed
//   waypost launcher --write    replace the exposed symlinks with shims
//   waypost launcher --json     the same report, as JSON
//
// Once the bit is gone `waypost` itself cannot start, so the same three work as
// `node scripts/launcher.mjs …`, and that is the form every "broken" message names.
//
// Windows is out of scope: npm writes .cmd/.ps1 shims there already, never a symlink.

import { lstatSync, statSync, realpathSync, readFileSync, writeFileSync, unlinkSync, chmodSync, existsSync } from "node:fs";
import { join, delimiter, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const LAUNCHER_NAMES = ["waypost", "wyp"];
export const SHIM_MARKER = "waypost-launcher-shim";

const SELF_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function entryOf(toolRoot) {
  return join(toolRoot, "bin", "waypost");
}

function real(p) {
  try { return realpathSync(p); } catch { return null; }
}

// First match on PATH for each name, the way a shell resolves it.
export function findLaunchers({ pathEnv = process.env.PATH || "", names = LAUNCHER_NAMES } = {}) {
  const dirs = pathEnv.split(delimiter).filter(Boolean);
  const out = [];
  for (const name of names) {
    let found = null;
    for (const dir of dirs) {
      const file = join(dir, name);
      let st;
      try { st = lstatSync(file); } catch { continue; }
      if (st.isSymbolicLink()) {
        found = { name, file, kind: "symlink", target: real(file) };
      } else if (st.isFile()) {
        let head = "";
        try { head = readFileSync(file, "utf8").slice(0, 600); } catch { /* unreadable: a plain file */ }
        found = { name, file, kind: head.includes(SHIM_MARKER) ? "shim" : "file", target: null };
      } else {
        continue;
      }
      break;
    }
    out.push(found || { name, file: null, kind: "missing", target: null });
  }
  return out;
}

function fileModeOff(toolRoot) {
  if (!existsSync(join(toolRoot, ".git"))) return false;
  const r = spawnSync("git", ["-C", toolRoot, "config", "--get", "core.fileMode"], { encoding: "utf8" });
  return r.status === 0 && r.stdout.trim().toLowerCase() === "false";
}

function hasExecBit(file) {
  try { return (statSync(file).mode & 0o111) !== 0; } catch { return false; }
}

// risk: "none"    nothing on PATH depends on the entry point's executable bit
//       "exposed" a symlink does, and git in this checkout will not restore the bit
//       "broken"  a symlink does, and the bit is already gone
export function inspect({ toolRoot = SELF_ROOT, pathEnv = process.env.PATH || "", platform = process.platform } = {}) {
  const entry = entryOf(toolRoot);
  const launchers = platform === "win32" ? [] : findLaunchers({ pathEnv });
  const entryReal = real(entry);
  const linked = launchers.filter((l) => l.kind === "symlink" && entryReal && l.target === entryReal);
  const checkout = { toolRoot, entry, execBit: hasExecBit(entry), fileModeOff: fileModeOff(toolRoot) };
  let risk = "none";
  if (linked.length) {
    if (!checkout.execBit) risk = "broken";
    else if (checkout.fileModeOff) risk = "exposed";
  }
  return { risk, launchers, linked, checkout };
}

function shQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

// `node` as PATH names it, not its realpath: a versioned Cellar or nvm path in
// the shim would break on the next node upgrade.
export function nodeOnPath(pathEnv = process.env.PATH || "") {
  for (const dir of pathEnv.split(delimiter).filter(Boolean)) {
    const candidate = join(dir, "node");
    try { if (statSync(candidate).isFile()) return candidate; } catch { /* next */ }
  }
  return process.execPath;
}

export function shimText({ node, entry }) {
  return [
    "#!/bin/sh",
    `# ${SHIM_MARKER}: written by waypost (scripts/launcher.mjs), safe to delete.`,
    "# A shim instead of npm's symlink, because this checkout is edited from another operating",
    "# system and every save from there drops the executable bit of bin/waypost. Running the entry",
    "# point through node does not need the bit. `npm link` puts the symlink back; re-run",
    "# `waypost launcher --write` after it.",
    `exec ${shQuote(node)} ${shQuote(entry)} "$@"`,
    "",
  ].join("\n");
}

// Replaces ONLY the symlinks that resolve to this checkout's entry point. A
// regular file on PATH is somebody's own script and is never touched.
export function installShims({ toolRoot = SELF_ROOT, pathEnv = process.env.PATH || "", platform = process.platform } = {}) {
  const report = inspect({ toolRoot, pathEnv, platform });
  const text = shimText({ node: nodeOnPath(pathEnv), entry: report.checkout.entry });
  const written = [];
  for (const l of report.linked) {
    unlinkSync(l.file);
    writeFileSync(l.file, text, { encoding: "utf8", mode: 0o755 });
    chmodSync(l.file, 0o755);
    written.push(l.file);
  }
  return { written, before: report };
}

// "broken" names the node form: the command this would otherwise name does not start.
export function repairCommand(report) {
  return report.risk === "broken"
    ? `node ${shQuote(join(report.checkout.toolRoot, "scripts", "launcher.mjs"))} --write`
    : "waypost launcher --write";
}

export function describe(report) {
  const lines = [];
  for (const l of report.launchers) {
    const what = l.kind === "missing" ? "not on PATH"
      : l.kind === "symlink" ? `symlink → ${l.target || "(dangling)"}`
      : l.kind === "shim" ? "waypost shim"
      : "a file that is not waypost's";
    lines.push(`  ${l.name.padEnd(8)} ${l.file || ""}  ${what}`);
  }
  const c = report.checkout;
  lines.push(`  entry    ${c.entry}  executable bit: ${c.execBit ? "set" : "MISSING"}; core.fileMode: ${c.fileModeOff ? "false" : "default"}`);
  if (report.risk === "broken") {
    lines.push("", "broken: the command on PATH is a symlink to an entry point without its executable bit.");
  } else if (report.risk === "exposed") {
    lines.push("", "exposed: the command on PATH is a symlink to the entry point, and core.fileMode=false says this",
      "checkout is shared with a system that has no executable bit. The next save from there breaks it.");
  } else {
    lines.push("", "nothing on PATH depends on the entry point's executable bit.");
  }
  if (report.risk !== "none") lines.push(`repair: ${repairCommand(report)}`);
  return lines.join("\n");
}

function main(argv) {
  const write = argv.includes("--write");
  const json = argv.includes("--json");
  if (process.platform === "win32") {
    process.stdout.write("launcher: npm writes .cmd/.ps1 shims on Windows, never a symlink — nothing to do.\n");
    return 0;
  }
  if (write) {
    let result;
    try { result = installShims(); } catch (e) {
      process.stderr.write(`launcher: could not write the shim: ${e.message}\n`);
      return 1;
    }
    if (json) process.stdout.write(JSON.stringify({ written: result.written }) + "\n");
    else if (result.written.length) process.stdout.write(result.written.map((f) => `shim      ${f}`).join("\n") + "\n");
    else process.stdout.write("launcher: no symlink on PATH points at this checkout — nothing to replace.\n");
    return 0;
  }
  const report = inspect();
  process.stdout.write(json ? JSON.stringify(report) + "\n" : describe(report) + "\n");
  return 0;
}

if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  process.exitCode = main(process.argv.slice(2));
}
