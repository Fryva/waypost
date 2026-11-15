// waypost — memory.mjs
// Read-only: where Claude Code keeps this project's auto Memory, what state it
// is in, and how big it is. Never creates, writes or deletes anything — the
// Memory directory belongs to the owner and to the harnesses that write notes.
//
// The directory and the state follow Claude Code's own rules (2.1.316, checked
// against 2.1.325): a key from the canonical repository root, and an ordered
// set of switches. Only node built-ins are imported statically, so a broken
// tool root cannot stop the first line of `doctor --memory` from printing.

import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, normalize, resolve, sep } from "node:path";
import { homedir } from "node:os";

const KEY_MAX = 200;
const INDEX_WARN_SHARE = 0.8;      // Claude Code's own after-write threshold
const TOPIC_BIG = 50000;           // characters: due to be split
const TOPIC_BY_SECTION = 20000;    // characters: read by section (the owner's rule)
const SETTINGS_ENV = "CLAUDE_CODE_DISABLE_AUTO_MEMORY";
const PROCESS_FLAGS = ["CLAUDE_CODE_SIMPLE", "CLAUDE_CODE_SAFE_MODE", "CLAUDE_CODE_REMOTE"];
const MOVERS = ["CLAUDE_CONFIG_DIR", "CLAUDE_CODE_PROJECT_DIR_NAME", "CLAUDE_COWORK_MEMORY_PATH_OVERRIDE", "CLAUDE_CODE_REMOTE_MEMORY_DIR"];

// ---- the key -------------------------------------------------------------

// Claude Code's string hash: (h << 5) - h + c with 32-bit wrap, per UTF-16 unit.
export function hash32(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}

// The directory name for a path: every character other than an ASCII letter or
// digit becomes "-" (no `u` flag: an emoji is two code units, two dashes); over
// 200 characters, the first 200, "-", and the base-36 hash of the path itself.
export function projectKey(path) {
  const key = path.replace(/[^a-zA-Z0-9]/g, "-");
  if (key.length <= KEY_MAX) return key;
  return `${key.slice(0, KEY_MAX)}-${Math.abs(hash32(path)).toString(36)}`;
}

const real = (p) => { try { return realpathSync.native(p); } catch { return resolve(p); } };

function readTextOrNull(p) {
  try { return readFileSync(p, "utf8"); } catch { return null; }
}

// Claude Code's walk: up to the nearest `.git`; a `.git` file points at a git
// directory, and a linked worktree's git directory names the common directory
// (`commondir`) and is named back by it (`worktrees/<name>/gitdir`). Anything
// that does not close that loop (a submodule, a stray file) is its own root.
// Returns { worktree, root }: where the walk stopped, and the canonical root.
export function gitRoots(start) {
  const here = real(start);
  let dir = here;
  for (;;) {
    const dotGit = join(dir, ".git");
    let st = null;
    try { st = statSync(dotGit); } catch { /* none here */ }
    if (st) return { worktree: dir, root: st.isDirectory() ? dir : canonicalOf(dir, dotGit) };
    const up = dirname(dir);
    if (up === dir) return { worktree: here, root: here };   // outside git: the directory itself
    dir = up;
  }
}

function canonicalOf(dir, dotGitFile) {
  const m = /^gitdir:\s*(.+?)\s*$/m.exec(readTextOrNull(dotGitFile) || "");
  if (!m) return dir;
  const gitdir = resolve(dir, m[1]);
  const common = readTextOrNull(join(gitdir, "commondir"));
  if (common === null) return dir;               // a submodule: its own root
  const commonDir = real(resolve(gitdir, common.trim()));
  const parent = real(dirname(gitdir));
  const back = readTextOrNull(join(gitdir, "gitdir"));
  const linked = basename(dirname(gitdir)) === "worktrees" && parent === join(commonDir, "worktrees")
    && back !== null && real(resolve(gitdir, back.trim())) === real(dotGitFile);
  if (!linked) return dir;
  return basename(commonDir) === ".git" ? dirname(commonDir) : commonDir;
}

// Where Claude Code keeps Memory by default for a working directory.
export function memoryLocation(start, home = homedir()) {
  const { worktree, root } = gitRoots(start);
  const canonical = root.normalize("NFC");   // NFC for the key only
  return {
    worktree, root: canonical, rawRoot: root,
    key: projectKey(canonical),
    dir: join(home, ".claude", "projects", projectKey(canonical), "memory"),
  };
}

// ---- settings and the state ----------------------------------------------

const TRUE = /^(1|true|yes|on)$/i;
const FALSE = /^(0|false|no|off)$/i;
const isTrue = (v) => typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? TRUE.test(String(v).trim()) : false;
const isFalse = (v) => typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? FALSE.test(String(v).trim()) : false;

// A settings file: null when absent, {bad:true} when it exists and Claude Code
// would not load it (strict JSON, no comments or trailing commas, checked
// against 2.1.316 and 2.1.325), else the parsed object.
function readSettings(file) {
  let text;
  try { text = readFileSync(file, "utf8"); }
  catch (e) { return e && e.code === "ENOENT" ? null : { bad: true }; }
  text = text.replace(/^﻿/, "");
  if (text.trim() === "") return { file, value: {} };
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? { file, value } : { bad: true };
  } catch { return { bad: true }; }
}

const DEVICE = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

// Whether a value would be accepted as a Memory directory by Claude Code
// (2.1.316 `ic()`): `~/` only where allowed and never escaping the home, then
// normalized, absolute, at least 3 characters, not a bare drive, no NUL.
function acceptableDir(v, home, allowTilde) {
  if (typeof v !== "string" || !v) return false;
  let p = v;
  if (allowTilde && /^~[\\/]/.test(v)) {
    const rest = normalize(v.slice(2) || ".");
    if (rest === "." || rest === ".." || rest.startsWith(`..${sep}`) || rest.startsWith("../") || rest.startsWith("..\\")) return false;
    p = join(home, v.slice(2));
  }
  p = normalize(p).replace(/[\\/]+$/, "");
  return isAbsolute(p) && p.length >= 3 && !/^[A-Za-z]:$/.test(p) && !p.includes("\0");
}

// state: "off" | "overridden" | "exists" | "absent". `source` says why or from where.
export function memoryState({ start, home = homedir(), env = process.env }) {
  const loc = memoryLocation(start, home);
  const files = [
    join(home, ".claude", "settings.json"),
    join(loc.worktree, ".claude", "settings.json"),
    join(loc.rawRoot, ".claude", "settings.local.json"),
  ];
  const flags = PROCESS_FLAGS.filter((k) => isTrue(env[k]));
  const out = (state, source, extra = {}) => ({ state, source, flags, loc, ...extra });

  const loaded = [];
  for (const f of files) {
    const s = readSettings(f);
    if (s && s.bad) return out("off", `${f} unreadable`);
    if (s) loaded.push(s);
  }
  // The legacy global config's `env` block is the lowest layer (it applies in
  // 2.1.316 and 2.1.325). An unreadable ~/.claude.json is ignored: Claude
  // Code rewrites it constantly, and it is not a settings file.
  let legacy = null;
  try {
    const t = readTextOrNull(join(home, ".claude.json"));
    const v = t === null ? null : JSON.parse(t.replace(/^﻿/, ""));
    if (v && typeof v.env === "object" && v.env) legacy = { file: join(home, ".claude.json"), value: v };
  } catch { /* ignored */ }
  const layers = (legacy ? [legacy] : []).concat(loaded);

  // 1. the switch in a settings `env` block, later files winning
  let set = null;
  for (const l of layers) {
    const e = l.value.env;
    if (e && typeof e === "object" && Object.hasOwn(e, SETTINGS_ENV)) set = { value: e[SETTINGS_ENV], file: l.file };
  }
  let forcedOn = false;
  if (set) {
    if (isTrue(set.value)) return out("off", `${SETTINGS_ENV} in ${set.file}`);
    if (isFalse(set.value)) forcedOn = true;
  } else if (isTrue(env[SETTINGS_ENV])) {
    // 2. the calling process's own switch counts only towards `off`
    return out("off", `${SETTINGS_ENV} in the environment`);
  }
  // 3. autoMemoryEnabled: false in the merged settings
  if (!forcedOn) {
    let enabled = null;
    for (const l of loaded) if (typeof l.value.autoMemoryEnabled === "boolean") enabled = { v: l.value.autoMemoryEnabled, file: l.file };
    if (enabled && enabled.v === false) return out("off", `autoMemoryEnabled: false in ${enabled.file}`);
  }
  // 4. a source that moves Memory: the process environment, plus the `env`
  // of the owner's own files (~/.claude.json, ~/.claude/settings.json) —
  // Claude Code drops these names only from a project's settings `env`.
  const ownerEnv = {};
  for (const l of layers.filter((l) => l.file === join(home, ".claude.json") || l.file === files[0])) {
    const e = l.value.env;
    if (e && typeof e === "object") for (const k of MOVERS) if (typeof e[k] === "string" && e[k]) ownerEnv[k] = e[k];
  }
  env = { ...ownerEnv, ...Object.fromEntries(MOVERS.filter((k) => env[k]).map((k) => [k, env[k]])) };
  const cfg = env.CLAUDE_CONFIG_DIR;
  if (cfg) {
    const expanded = /^~[\\/]/.test(cfg) ? join(home, cfg.slice(2)) : cfg;
    if (real(expanded) !== real(join(home, ".claude"))) return out("overridden", "CLAUDE_CONFIG_DIR");
  }
  const name = env.CLAUDE_CODE_PROJECT_DIR_NAME;
  if (cfg && name && /^[A-Za-z0-9_-]{1,64}$/.test(name) && !DEVICE.test(name)) return out("overridden", "CLAUDE_CODE_PROJECT_DIR_NAME");
  if (acceptableDir(env.CLAUDE_COWORK_MEMORY_PATH_OVERRIDE, home, false)) return out("overridden", "CLAUDE_COWORK_MEMORY_PATH_OVERRIDE");
  if (env.CLAUDE_CODE_REMOTE_MEMORY_DIR) return out("overridden", "CLAUDE_CODE_REMOTE_MEMORY_DIR");
  for (const l of loaded) {
    if (acceptableDir(l.value.autoMemoryDirectory, home, true)) return out("overridden", `autoMemoryDirectory in ${l.file}`);
  }
  // 5.
  return out(existsSync(join(loc.dir, "MEMORY.md")) ? "exists" : "absent", "default");
}

// ---- limits (registry data) ----------------------------------------------

// Claude Code's index limit from the harness registry, or { unknown: reason }.
export async function memoryLimits() {
  try {
    const { harness } = await import("./agents-registry.mjs");
    const m = harness("claude").memory;
    if (m === undefined || m === null) return { unknown: "the claude harness record has no memory field" };
    const pos = (n) => Number.isInteger(n) && n > 0;
    if (typeof m !== "object" || !pos(m.index_lines) || !pos(m.index_chars)) {
      return { unknown: "the claude harness record's memory field is malformed" };
    }
    return { lines: m.index_lines, chars: m.index_chars };
  } catch (e) {
    return { unknown: `the harness registry did not load (${String(e && e.message || e).split("\n")[0]})` };
  }
}

// ---- measurements --------------------------------------------------------

const finding = (level, check, message, file) => {
  const f = { group: "memory", level, check, message };
  if (file) f.file = file;
  return f;
};

const LINK = /\]\(\s*<?([^)\s>#]+)/g;
const isUrl = (t) => /^[a-z][a-z0-9+.-]*:/i.test(t);

// Findings for an existing Memory directory. `limits` comes from memoryLimits().
export function measureMemory(dir, limits) {
  const findings = [];
  const indexPath = join(dir, "MEMORY.md");
  const raw = readFileSync(indexPath, "utf8");
  const trimmed = raw.trim();
  const chars = trimmed.length;                                   // as Claude Code's loader counts
  const lines = trimmed.length ? trimmed.split("\n").length : 0;  // newlines + 1

  if (limits.unknown) {
    findings.push(finding("info", "memory-limits", `limits unknown: ${limits.unknown}; index is ${chars} characters, ${lines} lines.`));
  } else if (chars > limits.chars || lines > limits.lines) {
    findings.push(finding("issue", "memory-index-limit",
      `MEMORY.md is ${chars} characters, ${lines} lines; Claude Code loads at most ${limits.chars} characters and ${limits.lines} lines and cuts the rest.`, indexPath));
  } else if (chars > limits.chars * INDEX_WARN_SHARE || lines > limits.lines * INDEX_WARN_SHARE) {
    findings.push(finding("warn", "memory-index-limit",
      `MEMORY.md is ${chars} characters, ${lines} lines: over 80% of Claude Code's limit (${limits.chars} characters, ${limits.lines} lines).`, indexPath));
  }

  // pointers: relative markdown links, one line at a time
  const rawLines = raw.split("\n");
  const pointed = new Set();
  const dead = [];
  const pointerLines = [];
  rawLines.forEach((line, i) => {
    let has = false;
    for (const m of line.matchAll(LINK)) {
      let t = m[1];
      if (isUrl(t) || isAbsolute(t)) continue;
      try { t = decodeURIComponent(t); } catch { /* keep as written */ }
      has = true;
      const target = resolve(dir, t);
      pointed.add(target);
      if (!existsSync(target) && !dead.includes(t)) dead.push(t);
    }
    if (has) pointerLines.push({ n: i + 1, len: line.replace(/\r$/, "").length });
  });
  if (dead.length) {
    findings.push(finding("issue", "memory-dead-pointer",
      `${dead.length} pointer(s) to missing topic files: ${dead.slice(0, 5).join(", ")}${dead.length > 5 ? `, … (${dead.length - 5} more)` : ""}.`, indexPath));
  }

  // topics: the .md files beside the index
  let names = [];
  try { names = readdirSync(dir).filter((n) => n.endsWith(".md") && n !== "MEMORY.md").sort(); } catch { /* unreadable */ }
  const big = [];
  for (const n of names) {
    const p = join(dir, n);
    let size = 0;
    try { size = statSync(p).size; } catch { continue; }
    if (size <= TOPIC_BIG) continue;                 // characters never exceed bytes
    const len = (readTextOrNull(p) || "").length;
    if (len > TOPIC_BIG) big.push({ n, len });
  }
  if (big.length) {
    big.sort((a, b) => b.len - a.len);
    findings.push(finding("warn", "memory-topic-size",
      `${big.length} topic(s) over ${TOPIC_BIG} characters, due to be split: ${big.slice(0, 3).map((b) => `${b.n} (${b.len})`).join(", ")}${big.length > 3 ? ", …" : ""}. Read a topic over ${TOPIC_BY_SECTION} characters by section.`));
  }
  if (pointerLines.length) {
    const top = pointerLines.slice().sort((a, b) => b.len - a.len).slice(0, 3);
    findings.push(finding("info", "memory-long-lines", `longest pointer lines: ${top.map((l) => `line ${l.n} (${l.len} chars)`).join(", ")}.`));
  }
  const orphans = names.filter((n) => !pointed.has(join(dir, n)));
  if (orphans.length) {
    findings.push(finding("info", "memory-orphan-topic",
      `${orphans.length} topic(s) with no pointer in MEMORY.md: ${orphans.slice(0, 5).join(", ")}${orphans.length > 5 ? ", …" : ""}.`));
  }
  return findings;
}

// ---- the command ---------------------------------------------------------

export async function computeMemory({ start, home = homedir(), env = process.env }) {
  const st = memoryState({ start, home, env });
  const findings = [];
  if (st.flags.length) {
    findings.push(finding("info", "memory-process-flag", `${st.flags.join(", ")} set in this process: per-process, not the owner's choice.`));
  }
  if (st.state === "off" || st.state === "overridden") {
    return { state: st.state, dir: null, source: st.source, findings };
  }
  const dir = st.loc.dir;
  if (st.state === "exists") {
    try { findings.push(...measureMemory(dir, await memoryLimits())); }
    catch (e) { findings.push(finding("info", "memory-read", `MEMORY.md could not be read: ${String(e && e.message || e).split("\n")[0]}`)); }
  }
  // Notes left under the key the older `/` -> `-` rule produces are orphans.
  const oldKey = st.loc.worktree.replace(/\//g, "-");
  if (oldKey !== st.loc.key) {
    const oldIndex = join(dirname(dirname(dir)), oldKey, "memory", "MEMORY.md");
    if (existsSync(oldIndex) && real(dirname(oldIndex)) !== real(dir)) {
      findings.push(finding("info", "memory-old-key", `a MEMORY.md exists under the older key ${dirname(oldIndex)}; notes there are orphans, Claude Code does not load them.`));
    }
  }
  return { state: st.state, dir, source: st.source, findings };
}

const icon = (level) => (level === "issue" ? "✖" : level === "warn" ? "⚠" : "ℹ");

export function formatMemory(r) {
  const head = r.state === "off" || r.state === "overridden" ? `memory: ${r.state} — ${r.source}` : `memory: ${r.state} ${r.dir}`;
  return [head, ...r.findings.map((f) => `  ${icon(f.level)} [${f.check}] ${f.message}`)].join("\n") + "\n";
}

// Prints the answer and returns the exit code: 1 on an issue in text mode, else 0.
export async function runMemory({ start, json = false, home = homedir(), env = process.env }) {
  if (!json) {
    // The first line before anything else loads, the harness registry included.
    const st = memoryState({ start, home, env });
    const head = formatMemory({ state: st.state, source: st.source, dir: st.loc.dir, findings: [] });
    process.stdout.write(head);
  }
  const r = await computeMemory({ start, home, env });
  if (json) {
    process.stdout.write(JSON.stringify({ state: r.state, dir: r.dir, source: r.source, findings: r.findings }, null, 2) + "\n");
    return 0;
  }
  process.stdout.write(formatMemory(r).split("\n").slice(1).join("\n"));
  return r.findings.some((f) => f.level === "issue") ? 1 : 0;
}
