// waypost (Waypost) — shared helpers used by the CLI and rules.
// Pure node, no external deps. Keep these helpers dependency-free
// so a repo checkout does not require npm install.
//
// Harness-agnostic by design: every harness (Claude Code, Codex, OpenCode)
// resolves the project root and the tool root the same way. The Claude Code
// plugin env vars (CLAUDE_PROJECT_DIR / CLAUDE_PLUGIN_ROOT) are honoured as
// fallbacks so the same scripts can also run as an optional Claude plugin.

import { readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync, statSync, mkdirSync, utimesSync, unlinkSync, renameSync, rmSync, realpathSync } from "node:fs";
import { join, dirname, basename, resolve, relative, isAbsolute, sep } from "node:path";
import { hostname, homedir, userInfo } from "node:os";
import { pluginRoot } from "./lib-resources.mjs";
export { pluginRoot, loadLayout, folderByKind, loadTemplate, renderTemplate } from "./lib-resources.mjs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
export { isLegacyNumberedId, slugIdentity, storyMatchesEntry, legalArtifactName, displayNumberOf, compareArtifactOrder, findSlugCollision } from "./lib-identity.mjs";
export { listEpicDirs, listStoryFiles, listEpicStories, storyRefOf, storyPathOf, realPath, pathUnder, isInsideVault, listVaultStoryFiles, lastVaultActivityMs } from "./lib-vault-files.mjs";
export { parseFrontmatter, listOf, refsOf } from "./lib-frontmatter.mjs";
export { vaultConfigPath, readVaultConfig, selfInstallOff, writeVaultConfig, isLegacyStory } from "./lib-vault-policy.mjs";
export { gatherVaultFacts } from "./lib-vault-facts.mjs";
export { slugify, nextNumber } from "./lib-artifact-names.mjs";
export { sessionIdFlag, sessionId } from "./lib-session-identity.mjs";
export { buildNodeIndex } from "./lib-node-index.mjs";
export { stripCodeSpans, extractLinks, resolveLinkTarget } from "./lib-links.mjs";
export { PURPOSE_CELL, TITLE_CELL, PATH_CELL, INFLIGHT_CAP, ERROR_CELL, truncEnd, truncFront, folderPurpose, renderVaultSkeleton } from "./lib-skeleton.mjs";

// ─── Paths ─────────────────────────────────────────────────────────────

// The project being managed. Prefer the harness-neutral WAYPOST_PROJECT_DIR,
// falling back to the cwd (and, for a Claude plugin install, to
// CLAUDE_PROJECT_DIR — AgentWorkflow compatibility).
export function projectRoot() {
  return process.env.WAYPOST_PROJECT_DIR
    || process.env.CLAUDE_PROJECT_DIR
    || process.cwd();
}

// The project-local config. Cannonical location is .waypost/projectstore.json;
// a legacy .claude/projectstore.json is honoured for a Claude installing the
// optional plugin layer.
export function configPath() {
  const root = projectRoot();
  const waypost = join(root, ".waypost", "projectstore.json");
  if (existsSync(waypost) || process.argv.includes("--no-legacy-config")) return waypost;
  return join(root, ".claude", "projectstore.json");
}

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

// True when `a` and `b` name the same tree, or one is an ancestor of the
// other, in either direction — used both for "does a live heavy job overlap
// this project" (capacity.mjs's blockingHolder) and for "is this the same
// checkout" (presence.mjs's sharedTree, with `contain: true`). Separators
// are folded to "/" first (a Windows path compared against a POSIX one is
// otherwise never equal to itself), and case is folded only on the platforms
// whose own filesystems already do that — darwin and win32 — the same rule
// refusePath (scripts/cleanup.mjs) and pathUnder above already use. Neither
// path is resolved against the filesystem here: a caller wanting real paths
// (a symlinked checkout, a case-preserving alias) resolves them first, the
// way refusePath's own callers already do.
export function treesOverlap(a, b, { platform = process.platform } = {}) {
  const fold = platform === "darwin" || platform === "win32";
  const norm = (p) => {
    let s = String(p || "").replace(/\\/g, "/");
    if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
    return fold ? s.toLowerCase() : s;
  };
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.startsWith(nb + "/") || nb.startsWith(na + "/");
}

// `~` is only expanded by an interactive shell — a harness that spawns us
// directly (spawn/execFile with an argv array, no shell in between) passes it
// through literally. One helper, reused everywhere a path arrives from argv
// rather than from a shell (bind's vault argument, --project, --home).
export function expandHome(p) {
  return String(p).replace(/^~(?=\/|$)/, process.env.HOME || "~");
}

// A CLI piped into `head` gets its stdout closed under it. Node's default is
// an unhandled 'error' event and a stack trace on a perfectly ordinary shell
// idiom, so every entry point silences EPIPE and exits quietly instead.
export function ignoreEpipe() {
  for (const stream of [process.stdout, process.stderr]) {
    stream.on("error", (e) => {
      if (e && e.code === "EPIPE") process.exit(0);
      throw e;
    });
  }
}

// ─── Config ────────────────────────────────────────────────────────────

// null means "not bound yet" (waypost bind is the right next step) — a caller
// must never conflate that with "bound, but the config is corrupt", which
// needs a loud failure instead: silently treating a broken config as unbound
// invites `waypost setup` to rebind over it, discarding whatever settings the
// file still held (upstream ADR-007 gap).
// The vault path as the config stores it: relative to the project root when
// the vault lives inside the project, absolute otherwise. The config file is
// machine-local by contract, but on a checkout shared between machines it is
// physically one file for all of them (ADR-0007 addendum), and one machine's
// absolute path is another machine's "vault missing". `readConfig` resolves
// the relative form against THIS machine's project root; `writeConfig`
// re-relativises on every save, so a config written absolute by an earlier
// version migrates the first time the tool touches it.
export function storedVaultPath(abs) {
  const rel = relative(projectRoot(), abs);
  if (rel === "") return ".";
  if (rel.startsWith("..") || isAbsolute(rel)) return abs;
  return rel.split(sep).join("/");
}

export function resolveVaultPath(p) {
  return typeof p === "string" && p && !isAbsolute(p) ? resolve(projectRoot(), p) : p;
}

// ─── The repository behind the project (ADR-0010) ──────────────────────
//
// `git rev-parse --path-format=absolute --git-common-dir` names the one .git
// directory every worktree of a repository shares (measured 2026-09-04: the
// same answer from the root, from a subdirectory and from a linked worktree; a
// bare repository answers its own path, which is why --is-bare-repository is
// asked in the same breath). Spawned with cwd = the project root, never the
// caller's directory. null means "no repository here": no git, a bare one, or
// a directory outside any checkout — and every caller falls back to the
// ADR-0007 shape.
const _common = new Map();
export function gitCommonDir(root = projectRoot()) {
  if (_common.has(root)) return _common.get(root);
  let out = null;
  try {
    const r = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir", "--is-bare-repository"],
      { cwd: root, encoding: "utf8", timeout: 5000 });
    if (r.status === 0) {
      const [dir, bare] = String(r.stdout).trim().split(/\r?\n/);
      if (dir && bare !== "true") out = dir.replace(/\\/g, "/").replace(/\/+$/, "");
    }
  } catch { /* no git: no repository */ }
  _common.set(root, out);
  return out;
}

export function mainWorktree(root = projectRoot()) {
  const c = gitCommonDir(root);
  return c ? dirname(c) : null;
}

// Compared as real paths: git answers /private/var/… where macOS's mkdtemp
// says /var/…, and a symlinked checkout must not read as a foreign worktree.
const samePath = (a, b) => {
  const real = (p) => { try { return realpathSync(p); } catch { return String(p); } };
  const norm = (p) => real(p).replace(/\\/g, "/").replace(/\/+$/, "");
  return norm(a) === norm(b);
};

// A linked worktree: the project root is a worktree of a repository whose
// main working copy is elsewhere.
export function isLinkedWorktree(root = projectRoot()) {
  const m = mainWorktree(root);
  return Boolean(m) && !samePath(m, root);
}

// Six characters that name this worktree and nothing else on this machine:
// what qualifies a session id that arrived from the environment, so two live
// worktrees never share one presence record (ADR-0010).
export function worktreeTag(root = projectRoot()) {
  let real = root;
  try { real = realpathSync(root); } catch {}
  return createHash("sha256").update(String(real)).digest("hex").slice(0, 6);
}

// Where the binding comes from: this project's own .waypost/, or, in a linked
// worktree that has none, the main worktree's — its relative vault_path then
// resolves against THIS worktree, so each worktree works on its own files
// while sharing coordination. `waypost setup` in a linked worktree is
// unnecessary by design.
export function bindingInfo() {
  const own = configPath();
  if (existsSync(own)) return { path: own, inherited_from: null };
  if (isLinkedWorktree()) {
    const main = mainWorktree();
    for (const c of [join(main, ".waypost", "projectstore.json"), join(main, ".claude", "projectstore.json")]) {
      if (existsSync(c)) return { path: c, inherited_from: main };
    }
  }
  return { path: own, inherited_from: null };
}

// WAYPOST_VAULT names a vault directly, with no binding needed. Internal:
// `doctor --vault <path>` sets it in its own process so every generator it
// spawns compares against the same vault. It wins over a binding's vault_path;
// layout and language come from the binding when there is one, else
// engineering / en (a non-English vault checked with no binding reads as stale
// views — red, never a false green).
export function readConfig() {
  const p = bindingInfo().path;
  const direct = process.env.WAYPOST_VAULT;
  if (!existsSync(p)) return direct ? { layout: "engineering", vault_path: resolve(direct) } : null;
  try {
    const cfg = JSON.parse(readFileSync(p, "utf8"));
    if (cfg && typeof cfg === "object") {
      cfg.vault_path = direct ? resolve(direct) : resolveVaultPath(cfg.vault_path);
      if (direct && !cfg.layout) cfg.layout = "engineering";
    }
    return cfg;
  } catch (e) {
    process.stderr.write(`waypost: config exists but is unreadable: ${p}: ${e.message}\n`);
    process.exit(1);
  }
}

export function writeConfig(cfg) {
  // A config read under WAYPOST_VAULT carries that vault, not the binding's:
  // writing it back would silently rebind the project.
  if (process.env.WAYPOST_VAULT) throw new Error("WAYPOST_VAULT is set: refusing to write the project binding through a borrowed vault path");
  // A linked worktree that inherits its binding writes back to the binding
  // it inherited: one repository, one binding.
  const p = bindingInfo().path;
  mkdirSync(dirname(p), { recursive: true });
  const out = cfg && typeof cfg.vault_path === "string" && cfg.vault_path
    ? { ...cfg, vault_path: storedVaultPath(cfg.vault_path) } : cfg;
  writeFileSync(p, JSON.stringify(out, null, 2) + "\n", "utf8");
}

// ─── Atomic file writes (spec: atomic-regeneration-of-derived-views) ──

// Replace a file's content via a same-directory temp + rename. Parallel
// readers see the old bytes or the new bytes, never a torn file — a torn
// read of a generated view is a corrupt board. The temp name is doubly
// load-bearing: the dot prefix hides it from Obsidian and doctor's vault
// walk, and the `.tmp` suffix is excluded from iCloud sync — temps never
// leave this machine, which is exactly what makes pid-liveness a sound
// staleness test in sweepOrphanTemps. Never mkdirs (callers own their
// directories); the rename gives the target the temp's file mode; on win32
// a rename over a concurrently-open target can fail EPERM — callers report
// it and the next regeneration repairs. May throw: callers report or
// degrade; the helper does not swallow.
export function writeFileAtomic(p, content, { sweep = true } = {}) {
  const dir = dirname(p);
  if (sweep) sweepOrphanTemps(dir);
  // The host belongs in the name: on a SHARED vault another device's temp
  // carries a pid that means nothing here, and sweepOrphanTemps would delete a
  // write that is still in flight on that machine.
  const tmp = join(dir, `.${basename(p)}.${hostTag()}.${process.pid}.tmp`);
  try {
    writeFileSync(tmp, content, "utf8");
    renameSync(tmp, p);
  } catch (e) {
    try { unlinkSync(tmp); } catch {}
    throw e;
  }
}

// Crash orphans (SIGKILL, power loss between write and rename) are invisible
// to every reader by design, so nothing else ever removes them. The sweep
// runs where writes are frequent enough to matter — reconcile --write's
// vault directories; a sweep:false writer can strand an orphan forever,
// accepted: dot-prefixed, bytes-sized, machine-local.
// Sweep only temps whose embedded pid is dead: ESRCH ⇒ dead; EPERM ⇒ alive
// but not ours — a live concurrent writer keeps its temp. Pid reuse can make a dead
// orphan look alive; accepted (a lingering hidden temp, never data loss) —
// an mtime heuristic would reintroduce the distributed-clock problem the
// `.tmp` iCloud exclusion exists to avoid. The strict shape (dot prefix,
// numeric pid, `.tmp`) can never match `.gitignore` and friends.
export function hostTag() {
  return hostname().split(".")[0].replace(/[^\w-]+/g, "-").slice(0, 24) || "host";
}

function sweepOrphanTemps(dir) {
  let names;
  try { names = readdirSync(dir); } catch { return; }
  for (const n of names) {
    // Only temps written by THIS host: pid liveness is a local fact, and a
    // vault on a network drive carries other machines' temps too. A temp in the
    // pre-host format is also left alone — it may be another device's.
    const m = n.match(/^\..+\.([\w-]+)\.(\d+)\.tmp$/);
    if (!m || m[1] !== hostTag()) continue;
    const pid = parseInt(m[2], 10);
    if (!pid || pid === process.pid) continue;
    try {
      process.kill(pid, 0); // returns ⇒ alive; EPERM ⇒ alive, not ours
    } catch (e) {
      if (e.code === "ESRCH") {
        try { unlinkSync(join(dir, n)); } catch {}
      }
    }
  }
}

// ─── Heading / keyword registry (PS-SPEC story-002) ────────────────────
//
// scaffold/headings.json is the language-independent registry of the section
// headings, inline keywords and index-table column names the deterministic
// scripts (doctor / reconcile / story-section) must recognize. Per id, per
// language, an ARRAY of accepted forms; the FIRST form of the configured
// language is the canonical form used when WRITING. Matching always accepts
// every registered form of every language — a ru-headed file in an en-bound
// vault must still lint.

let _headingsCache = null;

export function loadHeadingsRegistry() {
  if (_headingsCache) return _headingsCache;
  const p = join(pluginRoot(), "scaffold", "headings.json");
  try {
    _headingsCache = JSON.parse(readFileSync(p, "utf8"));
  } catch (e) {
    throw new Error(`heading registry missing or unreadable (${p}): ${e.message}`);
  }
  return _headingsCache;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function allForms(section, id) {
  const entry = loadHeadingsRegistry()[section]?.[id];
  if (!entry) throw new Error(`headings.json has no ${section} entry "${id}"`);
  return Object.values(entry).flat();
}

// Canonical write form for the configured language (en fallback).
export function heading(id, lang = "en") {
  const entry = loadHeadingsRegistry().headings?.[id];
  if (!entry) throw new Error(`headings.json has no headings entry "${id}"`);
  return (entry[lang] || entry.en)[0];
}

// Matches a `## <heading>` line in any registered language, case-insensitively
// (hand-typed `## критерии приёмки` still matches). Anchored to the full line
// so "Acceptance" never matches "Acceptance Criteria".
export function headingLineRe(id) {
  const forms = allForms("headings", id).map(escapeRe);
  return new RegExp(`^##\\s+(?:${forms.join("|")})\\s*$`, "mi");
}

// Extract the body of section `id`: text between its heading line and the
// next `## ` heading (or end of file). Returns null when the section is absent.
export function sectionOf(body, id) {
  const m = body.match(headingLineRe(id));
  if (!m) return null;
  const rest = body.slice(m.index + m[0].length);
  const next = rest.search(/^## /m);
  return next === -1 ? rest : rest.slice(0, next);
}

export function keywordRe(id) {
  const forms = allForms("keywords", id).map(escapeRe);
  return new RegExp(`(?:${forms.join("|")})`, "i");
}

// The two inline grammars built from a keyword plus a colon: the evidence suffix
// on a checked acceptance criterion, and the story attribution on a spec
// acceptance item. Both live here rather than inline at their call sites so the
// gate and its tests cannot drift, and both accept the CJK-width colon — a zh
// vault writes `— 证据：<test>` and `— stories：PS-X/story-foo`, and a full-width
// colon must not read as the marker being absent.
export function evidenceSuffixRe() {
  return new RegExp(`[—–-]\\s*${keywordRe("evidence").source}\\s*[:：]`, "i");
}

export function storiesAttributionRe() {
  return new RegExp(`[—–-]\\s*${keywordRe("stories").source}\\s*[:：]\\s*(.+)$`, "i");
}

// The body footer (`*Last updated: 2026-01-01*`) is content rather than a heading,
// but the lifecycle gates keep it in step with frontmatter `updated:`. Matching
// accepts every registered language; the rewrite preserves the file's OWN prefix
// verbatim through capture group 1, so a locale's punctuation convention — fr
// writes `… : `, zh writes `…：` — survives without the writer needing to know
// which locale it is looking at, and a hand-mixed vault keeps each file's form.
export function footerDateRe() {
  const forms = allForms("footers", "last_updated").map(escapeRe);
  return new RegExp(`^(\\*(?:${forms.join("|")})\\s*[:：]\\s*).*(\\*)$`, "mi");
}

// The `| **Status** | value |` row of a story's field table, in any registered
// language (the label is the index column's), so story-section can keep it in
// step with frontmatter: a reader who never sees the frontmatter — a rendered
// page — used to be told "planned" about a story that was closed months ago.
export function statusCellRe() {
  const forms = allForms("index_columns", "status").map(escapeRe);
  return new RegExp(`^(\\|\\s*\\*\\*(?:${forms.join("|")})\\*\\*\\s*\\|\\s*)[^|\\n]*?(\\s*\\|\\s*)$`, "mi");
}

// Matches a folder-README index header row in any registered language,
// in the standard 4-column form: | File | Title | Status | Date |
//
// End-anchored on purpose: a header carrying extra hand-added columns
// (`| File | Title | Status | Date | Notes |`) is NOT this table. Without the
// anchor it prefix-matched, and rebuildIndexRows then rewrote every managed
// row to the registered four columns — silently destroying the extra cells,
// which are human-owned content no regeneration can recompute. Unanchored,
// doctor's index-header check could not fire either (the header "matched"),
// so the loss had no detector at all. Anchored, both halves behave as
// documented: reconcile reports the index unusable and doctor warns.
export function indexHeaderRe() {
  const cols = ["file", "title", "status", "date"].map((c) =>
    allForms("index_columns", c).map(escapeRe).join("|"));
  return new RegExp(
    `^\\|\\s*(?:${cols[0]})\\s*\\|\\s*(?:${cols[1]})\\s*\\|\\s*(?:${cols[2]})\\s*\\|\\s*(?:${cols[3]})\\s*\\|\\s*$`);
}

// ─── Markdown table cell escaping ───────────────────────────────────────
//
// A `|` inside a cell (most often a title) splits a markdown table row into
// an extra column — silently, in every renderer AND in doctor's own row
// parser. One escaper, shared by every derived-view writer (reconcile,
// draft, codemap, graph) so `\|` means the same thing everywhere; unescCell
// is its inverse, for a reader (doctor's checkIndexes) that must compare a
// rendered cell back against the frontmatter value that produced it.
export function escCell(s) {
  return String(s).replace(/\|/g, "\\|");
}

export function unescCell(s) {
  return String(s).replace(/\\\|/g, "|");
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

// Full ISO-8601 UTC timestamp — for story lifecycle fields (started_at /
// closed_at / plan_updated_at) and spec_policy_since, which must be strictly
// comparable and need sub-day resolution (diff-refs anchors git --since on
// them). Deliberately finer-grained than the date-only created:/updated:.
export function nowIso() {
  return new Date().toISOString();
}

// ─── Session awareness (layer 2 — multi-Claude coordination) ──────────
//
// Each Claude Code session registers itself in
// <vault>/.projectstore/sessions/<id>.json, where <id> is Claude's own
// session_id (from hook stdin input). Two Claude instances in the same
// project therefore get distinct files. Other sessions reading the vault
// can detect each other and warn the agent to avoid topic / numbering
// collisions. mtime is used as a liveness proxy: a session whose file
// has not been touched in 30 minutes is considered idle; >24h => stale,
// removed on next SessionStart.
//
// Kept for upstream compatibility (ADR-0004), not because waypost itself still
// reads it: presence.mjs/sessions.mjs (layer 3, ADR-0007) is what this fork's
// own commands use for liveness now. `recent_activity` in particular is dead
// from this fork's own side — it was populated by the hook-driven continuity
// feature this fork removed along with the hooks it needed — but upstream
// ProjectStore's own hooks still write and read this same file on a vault
// shared with a Claude Code session running unmodified upstream, so the shape
// stays exactly as upstream expects it.

export function sessionsDir(vault) {
  return join(vault, ".projectstore", "sessions");
}

export function sessionFilePath(vault, sessionId) {
  return join(sessionsDir(vault), `${sessionId}.json`);
}

export function ensureSessionsDir(vault) {
  const dir = sessionsDir(vault);
  mkdirSync(dir, { recursive: true });
  // Make sure no session metadata leaks into git, regardless of where the
  // vault lives. A nested .gitignore inside .projectstore/ is the simplest
  // way to handle this idempotently.
  const gi = join(vault, ".projectstore", ".gitignore");
  if (!existsSync(gi)) {
    writeFileSync(gi, "# projectstore — runtime data, do not commit\n*\n", "utf8");
  }
  return dir;
}

// Idempotent: preserves started_at and recent_activity if the session file
// already exists (e.g. when SessionStart fires after touch-session has
// already bootstrapped the record).
export function writeSession(vault, sessionId, projectRoot) {
  ensureSessionsDir(vault);
  const path = sessionFilePath(vault, sessionId);
  let existing = null;
  if (existsSync(path)) {
    try { existing = JSON.parse(readFileSync(path, "utf8")); } catch {}
  }
  const data = {
    id: sessionId,
    started_at: existing?.started_at || new Date().toISOString(),
    project_root: projectRoot,
    host: hostname(),
    pid: process.pid,
    recent_activity: Array.isArray(existing?.recent_activity) ? existing.recent_activity : [],
  };
  writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
  return path;
}

export function touchSession(vault, sessionId) {
  const p = sessionFilePath(vault, sessionId);
  if (!existsSync(p)) return false;
  const now = new Date();
  try {
    utimesSync(p, now, now);
    return true;
  } catch {
    return false;
  }
}

// Contract 23 — `currentSessionId` is exempt. A live session's file is not
// stale, and reaping it is pure data destruction: `writeSession` recreates it
// from nothing, so `recent_activity` and `started_at` are gone.
//
// Named limitation: a SIBLING session idle beyond 24 hours is still reaped by
// whichever session runs cleanup. Mtime cannot tell idle-alive from dead, so
// the justification above applies to that session word for word and is not
// cheaply actionable here.
// `dryRun` counts what would be removed without touching disk — `waypost
// sessions` (no `--prune`) uses it to say how many stale records are sitting
// there before anyone asks to reap them.
export function cleanupStaleSessions(vault, maxAgeHours = 24, currentSessionId = null, { dryRun = false } = {}) {
  const dir = sessionsDir(vault);
  if (!existsSync(dir)) return 0;
  const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
  const mine = currentSessionId ? `${currentSessionId}.json` : null;
  let removed = 0;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    if (mine && name === mine) continue;
    const path = join(dir, name);
    try {
      if (statSync(path).mtimeMs < cutoff) {
        if (!dryRun) unlinkSync(path);
        removed++;
      }
    } catch {}
  }
  return removed;
}

// ─── Source-path classification ────────────────────────────────────────
//
// Which project paths count as "work on the codebase". Lifted out of
// diff-refs.mjs so doctor and diff-refs cannot drift apart.

// Generated, vendored or machine-local paths — never a source file for any
// consumer. Lifted out of diff-refs.mjs so the hook, doctor and diff-refs
// cannot drift apart (contract 1).
export const SOURCE_IGNORE = [
  /(^|\/)package-lock\.json$/, /(^|\/)yarn\.lock$/, /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)Cargo\.lock$/, /(^|\/)node_modules\//, /(^|\/)dist\//, /(^|\/)build\//,
  // Harness wiring, not source: .waypost/ is the bind + runtime state, and the
  // three harness directories hold generated role files (`waypost agents install`).
  /(^|\/)\.claude\//, /(^|\/)\.waypost\//, /(^|\/)\.opencode\//, /(^|\/)\.codex\//,
  /\.min\.(js|css)$/,
];

// The entry-rule counter ignores strictly more than the base set, and the
// difference is deliberate rather than an oversight of one or the other.
// waypost bind writes these three itself, in a session that by
// construction has no story open — counting them makes the plugin nag about its
// own setup. They must NOT join SOURCE_IGNORE: an edit to AGENTS.md is a real
// code reference (the PS-AGENTS epic already lists it), and folding these into
// the shared set would silently drop it from every proposed code_refs.
// Root-anchored, unlike the patterns above: a monorepo's nested AGENTS.md is
// ordinary source and must still count.
export const ENTRY_IGNORE = [
  ...SOURCE_IGNORE,
  /^AGENTS\.md$/, /^CLAUDE\.md$/, /^opencode\.json$/, /^\.gitignore$/,
  // `doctor --fix` (and therefore `setup`) writes the line-ending policy and the
  // merge-driver attributes: the tool's own first-run output, not source.
  /^\.gitattributes$/,
];

// The single open-story predicate (contract 5), as a pure core: it decides from
// already-loaded frontmatter and performs no I/O, so doctor feeds it the
// artifact scan it already performs while the hook feeds it a budgeted read —
// one definition, and therefore no way for the two to disagree about the same
// vault. `planned` is deliberately not open: writing code against a story that
// never went through waypost story plan is itself the order being skipped.
export function openStoryFrom(storyFrontmatters) {
  return (storyFrontmatters || []).some((fm) => fm && fm.status === "in-progress");
}

// ── Emitter election (contract 12) ──
//
// State is three fixed-name marker files in <sid>.fired/: `fired-1`, `fired-2`
// and `armed`. Fixed names are the whole mechanism — with process-derived names
// every contender's create succeeds and every contender emits.
//
// `fired-*` are never removed. A discarded conversation CREATES `armed`; the
// winning emitter deletes it. Clearing `fired-*` on compaction instead (the
// obvious design, and an earlier draft of the spec) makes the cap unreachable:
// the directory never holds two, so firings are unbounded at one per
// compaction cycle.

// Returns true iff THIS process is the emitter for the current armed context.
//
// The prize is chosen by state, never by falling through to the next free name.
// "try fired-1, on EEXIST try fired-2" reads like the same thing and is not: two
// processes that both observe an empty directory would take one name each and
// both emit. Deriving the single legal target from the count means exactly one
// name is contested per context, and O_EXCL awards it to exactly one caller.
// ── The efficacy log (contract 19) ──
//
// Append-only on the write side; the cap is the reader's job. Two sessions
// firing at the same instant can both append safely, where both truncating
// would not be safe. `.claude/` is gitignored, so this never travels — doctor
// must say "on this machine" or a two-machine maintainer reads a zero as
// "the mechanism is broken".


// ── The reminder (contracts 4, 15) ──


// ─── Session-name anchor (ADR: the settled-anchor offer) ───────────────
//
// The session name is an ADDRESS: peers route to a session by it, and nothing
// a plugin can call sets it — the authoritative value lives in the harness's
// memory. So projectstore composes a name and OFFERS it; the person accepts.
// (Covering research: "The session name is an address".)
//
// The whole difficulty is WHEN to speak, and the rule below was selected by
// replaying nine recorded sessions, not by taste. Naive "offer on every

// ─── A terminal yes/no, with a timeout ──────────────────────────────────

// Asks `question` on `input`/`output` (a real TTY in production, a
// PassThrough pair in tests) and resolves `true` only for a first line that
// is exactly "y" or "yes" (case-insensitive, surrounding whitespace
// trimmed) — every other answer, EOF with no answer at all, and no answer
// within `timeoutMs` (default 60s, the ADR's own figure) all resolve
// `false`. Reused by the machine-wide-limit story's own gate. Node's
// readline decides `terminal` from `input.isTTY` on its own; this never
// forces it either way. Always closes its own readline interface and pauses
// `input` before resolving, whichever way — an open, non-paused stdin is a
// handle Node will wait on, and a command that asked once must still be
// able to exit on its own afterwards.
// `output` defaults to stderr, not stdout: a caller piping `--json` (or
// anything else) reads stdout as data, and an interactive question written
// there would land inside that stream instead of in front of the person
// answering it.
export function askYesNo(question, { input = process.stdin, output = process.stderr, timeoutMs = 60000 } = {}) {
  return new Promise((resolvePromise) => {
    const rl = createInterface({ input, output });
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rl.close();
      try { input.pause(); } catch { /* not pausable — nothing more to do */ }
      resolvePromise(value);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    rl.question(question, (answer) => {
      const a = String(answer || "").trim().toLowerCase();
      finish(a === "y" || a === "yes");
    });
    // EOF before any line was ever entered — the question's own callback
    // never fires in that case, so this is the only way to observe it.
    rl.on("close", () => finish(false));
    // Ctrl-C at the prompt is "no", not an uncaught readline exit — the
    // caller's own answer/timeout path is the only other way this settles.
    rl.on("SIGINT", () => finish(false));
  });
}
