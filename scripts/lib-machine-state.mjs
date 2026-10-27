import { mkdirSync, existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { homedir, userInfo } from "node:os";

// The machine state directory (disk-hygiene ADR, as amended by the global-rules
// ADR): local, per host, never synced, and unrelated both to WAYPOST_HOME
// (where the tool is installed) and to a project's .waypost/state/ (ADR-0004).
// One spelling on every OS, from the home directory alone: on Windows a
// packaged harness (MSIX) sees its own private copy of AppData, so state there
// was one per harness, not one per machine; and a GUI or packaged app never
// sees a shell's XDG_* variables, so reading them made the location depend on
// who launched Waypost. `platform` and `env` are accepted and ignored, so
// older callers keep working. Pure — never creates the directory.
export function machineStateDir({ home = homedir() } = {}) {
  return join(home, ".local", "state", "waypost");
}

// Create the machine state directory (or a directory under it) and prove it
// is where it says: on Windows a path under AppData is redirected into a
// packaged harness's private copy, which is exactly the split this root exists
// to end — refused, checked again after creation (MSIX redirects a NEW
// directory, so the check before cannot see it). Returns the directory.
export function ensureMachineStateDir(dir = machineStateDir(), { platform = process.platform, home = homedir() } = {}) {
  // The profile's own AppData (what MSIX virtualizes) and any package store —
  // not the LOCALAPPDATA/APPDATA variables, which a caller can point anywhere.
  const underAppData = (p) => {
    if (platform !== "win32") return false;
    const fold = (x) => String(x || "").replace(/\//g, "\\").toLowerCase().replace(/\\+$/, "");
    const q = fold(p), r = fold(join(home, "AppData"));
    return q === r || q.startsWith(r + "\\") || /\\packages\\[^\\]+\\localcache(\\|$)/.test(q);
  };
  if (underAppData(dir)) throw Object.assign(new Error(`machine state may not live under AppData: ${dir}`), { code: "STATE_UNDER_APPDATA" });
  mkdirSync(dir, { recursive: true });
  let real = dir;
  try { real = realpathSync.native(dir); } catch {}
  if (underAppData(real)) throw Object.assign(new Error(`machine state resolved under AppData: ${real}`), { code: "STATE_UNDER_APPDATA" });
  return dir;
}

// The legacy roots this process may MOVE into machineStateDir(): only those
// under the same home the destination came from, or — when that home is the
// account's own (os.userInfo(), which no environment variable changes) — any.
// A command run with HOME/USERPROFILE pointed somewhere else, while
// LOCALAPPDATA or XDG_STATE_HOME still name the real ones, must never carry
// the owner's budget into that other home. The rest stay readable: the budget
// refusal and the slot readers still see them.
export function legacyDirsToMove({ platform = process.platform, env = process.env, home = homedir() } = {}) {
  const fold = (p) => { let r = p; try { r = realpathSync.native(p); } catch {} return platform === "win32" || platform === "darwin" ? r.toLowerCase() : r; };
  let account = null;
  try { account = userInfo().homedir; } catch {}
  const ownHome = account && fold(account) === fold(home);
  const sep = platform === "win32" ? "\\" : "/";
  const under = (r, base) => r === base || r.startsWith(base + sep);
  const h = fold(home), a = account ? fold(account) : null;
  return legacyStateDirs({ platform, env, home }).filter((d) => {
    if (ownHome) return true;
    const r = fold(d);
    // Under this home — but never the account's own roots when this home is an
    // ancestor of the account's (HOME=/ in a container, USERPROFILE=C:\Users).
    return under(r, h) && !(a && a !== h && under(a, h) && under(r, a));
  });
}

// Where earlier versions kept that state, for the migration
// (scripts/state-migrate.mjs) and for reading live slot records an older
// Waypost still holds. Only directories that exist and are not the new root.
// On win32 the real %LOCALAPPDATA%\Waypost and every packaged app's private
// copy of it (`Packages\<family>\LocalCache\Local\Waypost`) — readable as
// ordinary paths from outside the package.
export function legacyStateDirs(opts = {}) {
  return legacyStateView(opts).dirs;
}

// The same list, plus what could NOT be looked at: a sandboxed harness (the
// Codex app's default profile measured EPERM on %LOCALAPPDATA%\Packages) sees
// no package store at all, which is not the same as "there is none" — the
// budget check must not read it as such (run-budget.mjs legacyBlock).
export function legacyStateView({ platform = process.platform, env = process.env, home = homedir() } = {}) {
  const out = [];
  const unknown = [];
  if (platform === "darwin") out.push(join(home, "Library", "Application Support", "Waypost"));
  if (platform === "win32") {
    const local = env.LOCALAPPDATA || join(home, "AppData", "Local");
    out.push(join(local, "Waypost"));
    let families = [];
    try { families = readdirSync(join(local, "Packages")); }
    catch (e) { families = []; if (e.code !== "ENOENT") unknown.push(join(local, "Packages")); }
    for (const fam of families) out.push(join(local, "Packages", fam, "LocalCache", "Local", "Waypost"));
  }
  if (platform !== "darwin" && platform !== "win32" && env.XDG_STATE_HOME) out.push(join(env.XDG_STATE_HOME, "waypost"));
  const now = machineStateDir({ home });
  const key = (p) => { let r = p; try { r = realpathSync.native(p); } catch {} return platform === "win32" || platform === "darwin" ? r.toLowerCase() : r; };
  const seen = new Set([key(now)]);
  const dirs = out.filter((p) => {
    if (!existsSync(p)) return false;
    const k = key(p);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { dirs, unknown };
}

// What to tell someone whose process may not write the machine state root:
// usually a harness sandbox. Names the directory and, for Codex (the one
// measured), the setting that allows it.
export function stateWriteHint(dir, e, env = process.env) {
  if (!e || !["EPERM", "EACCES", "EROFS"].includes(e.code)) return e && e.message;
  const codex = Object.keys(env).some((k) => k.startsWith("CODEX_"));
  return `cannot write the machine state directory ${dir} (${e.code}) — this process is not allowed to write there, usually a harness sandbox. `
    + (codex
      ? `In Codex, allow it as a writable root: in ~/.codex/config.toml, [sandbox_workspace_write] writable_roots = [${JSON.stringify(machineStateDir())}], or run waypost from a terminal.`
      : `Allow ${machineStateDir()} as a writable directory in the harness's sandbox settings, or run waypost from a terminal.`);
}

// ─── The machine-wide cleanup limit (the amended disk-hygiene ADR) ──────
//
// The setting the owner picked with `waypost clean --limit` (a later commit
// of this story), and the last outcome the automatic path at the end of
// `waypost run --heavy` logged — both read here so `status`/`brief`/`doctor`
// and the gate share one place that knows the file names, instead of each
// reconstructing `cleanup-limit.<host>.json`/`cleanup.<host>.jsonl` by hand.
// `host` is a parameter, not read from `hostSlug()` here, so this file never
// imports presence.mjs (presence.mjs already imports lib.mjs — a cycle back
// would be circular). Neither function writes anything.

// Two names this exact string is reserved for: the directory a heavy run's
// cleanup renames items into right before handing them to the detached
// deleter (`<git common dir>/waypost-removing/`), and nothing else — it sits
// outside ADR-0010's own `waypost/<vault>/` coordination tree on purpose, so
// a coordination-tree sweep and a leftover-deleter sweep can never collide.
export const REMOVING_DIR = "waypost-removing";

// The current setting, or null when none was ever set, the host was
// renamed (the ADR: "a renamed host reads as 'no limit'"), or the file is
// missing or corrupt — never a thrown error; a caller with nothing to read
// treats that exactly the same as "no limit". `stateOpts` forwards straight
// to machineStateDir (platform/env/home), so a test can point this at a
// temporary state directory the same way it already does for
// machineStateDir itself.
export function readCleanupSetting({ host, ...stateOpts } = {}) {
  const read = (dir) => {
    try {
      const v = JSON.parse(readFileSync(join(dir, `cleanup-limit.${host}.json`), "utf8"));
      return v && typeof v === "object" && !Array.isArray(v) ? v : null;
    } catch {
      return null;
    }
  };
  // While an older root still holds a limit (the move has not happened yet,
  // or could not), the stricter of the two is in force — never "no limit"
  // because the owner's setting sits where this version no longer writes.
  let best = read(machineStateDir(stateOpts));
  // A record this version wrote is the owner's latest explicit choice — a
  // loosening or `off` included; only older copies compete by strictness.
  if (best && best.written_by === LIMIT_WRITER) return best;
  let legacy = [];
  try { legacy = legacyStateDirs(stateOpts); } catch { legacy = []; }
  for (const d of legacy) {
    const v = read(d);
    if (v) best = best ? stricterLimit(best, v) : v;
  }
  return best;
}

// Marks a cleanup-limit record written by this version (bin/waypost
// handleCleanLimit): the owner's latest explicit choice, which beats copies
// older versions left behind — a loosening or `off` included.
export const LIMIT_WRITER = "waypost-state-v2";

// The account's own machine state root — from os.userInfo(), which no
// environment variable changes. The only safe destination to NAME in advice:
// a process whose HOME/USERPROFILE was pointed elsewhere must never tell
// anyone to move the owner's state into that other home.
export function accountStateDir() {
  let h = null;
  try { h = userInfo().homedir; } catch { h = null; }
  return h ? machineStateDir({ home: h }) : null;
}

// The more restrictive of two cleanup-limit records of the same kind (a
// smaller GB cap, a larger free percentage); otherwise the one set later.
// `off` (or no limit) is the least restrictive of all. Returns one of its
// arguments, so a caller can tell which one won.
export function stricterLimit(a, b) {
  const la = a && a.limit, lb = b && b.limit;
  const kind = (l) => (l && l.kind) || "off";
  if (kind(la) === "off" && kind(lb) !== "off") return b;
  if (kind(lb) === "off" && kind(la) !== "off") return a;
  if (kind(la) === kind(lb)) {
    if (kind(la) === "gb") return la.gb <= lb.gb ? a : b;
    if (kind(la) === "free") return la.percent >= lb.percent ? a : b;
  }
  return String((a && a.set_at) || "") >= String((b && b.set_at) || "") ? a : b;
}

// The last `kind: "auto"` line logged in `cleanup.<host>.jsonl` — the same
// file `waypost clean --apply` already appends `kind: "apply"` lines to
// (bin/waypost's own appendCleanLog), read backwards so the newest one wins
// regardless of how many other lines came after it. Log rotation
// (appendCleanLog, a later commit) keeps one previous file as `.1`; when the
// current file holds no "auto" line (rotated away, or nothing has run yet),
// the rotated one is tried next. null when neither file has one, or when
// neither can be read at all.
export function readLastAutoCleanup({ host, ...stateOpts } = {}) {
  const dir = machineStateDir(stateOpts);
  for (const suffix of ["", ".1"]) {
    let text;
    try { text = readFileSync(join(dir, `cleanup.${host}.jsonl${suffix}`), "utf8"); }
    catch { continue; }
    const lines = text.split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      let rec;
      try { rec = JSON.parse(line); } catch { continue; }
      if (rec && rec.kind === "auto") return rec;
    }
  }
  return null;
}

