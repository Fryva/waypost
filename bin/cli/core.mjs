// Waypost CLI: core.
import { bindingInfo, readConfig as readConfigLib } from "../../scripts/lib.mjs";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Captured before main() (below) pins WAYPOST_SESSION_ID, WAYPOST_HARNESS and
// WAYPOST_PROC (the harness process) onto process.env for THIS process's own
// labelling (heartbeat, commit trailers): `run --heavy`'s spawned COMMAND must
// not silently inherit an identity this process only invented for itself —
// see runHeavy()'s use of these.
const INHERITED_SESSION_ID = process.env.WAYPOST_SESSION_ID;
const INHERITED_HARNESS = process.env.WAYPOST_HARNESS;
const INHERITED_PROC = process.env.WAYPOST_PROC;

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const SCRIPT = (name) => join(ROOT, "scripts", `${name}.mjs`);
// A file URL, not `file://${path}`: on Windows that string is only valid by
// luck for a drive letter and is rejected outright for a UNC checkout
// (\\Mac\share\…), which is how an npm shim on a Parallels share launches us.
const SCRIPT_URL = (name) => pathToFileURL(SCRIPT(name)).href;
const VERSION = (() => {
  try { return JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version; }
  catch { return "0.0.0"; }
})();

function fail(msg) {
  process.stderr.write(`waypost: ${msg}\n`);
  process.exit(1);
}

// Run a core script. `capture` pipes stdout so the dispatcher can act on the
// JSON; otherwise the child owns the terminal. Either way the child's exit
// code is ours — a harness scripting `waypost doctor && ...` must see failures.
//
// The tool root is the tree this executable belongs to, always: the children
// get WAYPOST_HOME=ROOT even when the caller exported something else. A
// dispatcher validating layouts against its own tree while its scripts read
// templates from another (O-4) is two versions of the tool in one command
// line. WAYPOST_HOME still means "tool root" for a script run directly.
// returnResult leaves status handling to an explicit caller; spawn errors still fail.
function run(script, args = [], { capture = false, returnResult = false } = {}) {
  const r = spawnSync(process.execPath, [SCRIPT(script), ...args], {
    encoding: "utf8",
    stdio: capture ? ["inherit", "pipe", "inherit"] : "inherit",
    env: { ...process.env, WAYPOST_HOME: ROOT },
  });
  if (r.error) fail(`${script}: ${r.error.message}`);
  if (returnResult) return r;
  if (r.status !== 0) process.exit(r.status ?? 1);
  return capture ? r.stdout : "";
}

function runJson(script, args = []) {
  const out = run(script, args, { capture: true });
  try {
    return JSON.parse(out);
  } catch {
    process.stdout.write(out);
    fail(`${script}: expected JSON on stdout`);
  }
}

function projectRoot() {
  return process.env.WAYPOST_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

// The binding, wherever it comes from: this project's own .waypost/, or, in a
// linked worktree without one, the main worktree's (ADR-0010).
function configPath() {
  return bindingInfo().path;
}

// null means "not bound" — the right next step is `waypost bind`/`waypost setup`. A
// config that exists but does not parse is a different, louder problem: left
// indistinguishable from "not bound", `waypost setup` would silently rebind over
// it and discard whatever settings the file still held.
function readConfig() {
  try { return readConfigLib(); }
  catch (e) { fail(`config exists but is unreadable: ${configPath()}: ${e.message}`); }
}

// Options that take a value. Everything else starting with `--` is a boolean,
// which is what separates `draft --write adr "T"` (three tokens, one flag) from
// `draft --lang ru adr "T"` (four tokens, one flag with a value). Guessing
// "the token after any flag is its value" ate the first positional whenever a
// boolean flag was written before it.
const VALUED = new Set(["--harness", "--layout", "--lang", "--only", "--id",
  "--budget", "--project", "--since", "--for", "--kind", "--limit", "--message",
  "--story", "--merge", "--session", "--provider", "--os", "--older-than", "--wait", "--release", "--reason", "--self-install"]);

// The literal `--` stops flag parsing, same as most POSIX CLIs: everything
// after it is positional even if it is spelled like a flag (`waypost search --
// --literal`). Only tokens before it are eligible to be a flag name or a
// flag's value.
function splitAtTerminator(args) {
  const i = args.indexOf("--");
  return i === -1 ? { head: args, tail: [] } : { head: args.slice(0, i), tail: args.slice(i + 1) };
}

function flag(args, name) {
  const { head } = splitAtTerminator(args);
  return head.includes(name) || head.some((a) => a === `${name}=true`);
}

function opt(args, name, dflt = null) {
  const { head } = splitAtTerminator(args);
  const i = head.indexOf(name);
  if (i !== -1) {
    const v = head[i + 1];
    if (v === undefined) fail(`${name} requires a value`);
    return v;
  }
  const eq = head.find((a) => a.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : dflt;
}

function positionals(args) {
  const { head, tail } = splitAtTerminator(args);
  const out = [];
  for (let i = 0; i < head.length; i++) {
    const a = head[i];
    if (a.startsWith("--")) { if (VALUED.has(a)) i++; continue; }
    out.push(a);
  }
  out.push(...tail);
  return out;
}

// Both functions below import scripts/agents.mjs in-process, which is the
// right default and the reason there is one detection instead of two. It
// costs the thing `run()` gets for free: the child it spawns is given
// WAYPOST_HOME=ROOT, so pluginRoot() resolves the registry from this
// executable's own tree whatever the caller's environment says. An in-process
// import has no such pin, and pluginRoot() honours WAYPOST_HOME — a documented
// user setting — and CLAUDE_PLUGIN_ROOT, which is itself one of the `env`
// markers the `claude` registry entry declares. Left unpinned, a foreign root
// supplies the ids themselves: a project with real markers is named after
// whatever that root declares, or after nothing at all. Hence withRegistryHome()
// around every registry read — including main()'s own, which is the first and
// used to prime the memo every later read inherited — and a diagnostic instead
// of silence: "no harness detected" with no reason is the one answer that cannot
// be acted on. `scripts/agents.mjs` keys that memo on the root as well: the pin
// is what makes this answer right, the key is what stops a second caller from
// inheriting the first one's.
function withRegistryHome(fn) {
  const saved = process.env.WAYPOST_HOME;
  process.env.WAYPOST_HOME = ROOT;
  try { return fn(); }
  finally {
    if (saved === undefined) delete process.env.WAYPOST_HOME;
    else process.env.WAYPOST_HOME = saved;
  }
}

function registryReadFailed(what, e) {
  process.stderr.write(`waypost setup: cannot read the harness registry for ${what}: ${e.message}\n`);
  process.stderr.write("waypost setup: WAYPOST_HOME / CLAUDE_PLUGIN_ROOT may point elsewhere; unset it to use this waypost's own registry.\n");
}

// The harnesses this project shows evidence of, by the same detector
// `agents install` uses: a marker counts only when the user's own content
// remains in it. Reading the `agents harnesses --json` projection and testing
// each `detect` path with a bare existsSync — which is what this did — is
// weaker than the detector it stood in for. Measured on the E-1 fixture
// (`.pi/` + README + an `AGENTS.md` carrying only waypost's routing block),
// one command printing both sets, with the run pinned to `pi` so nothing
// ambient is added: before setup, the projection reads `[ 'codex', 'pi' ]`
// where the module reads `[ 'pi' ]`; after setup, `[ 'antigravity', 'codex',
// 'pi' ]` where the module still reads `[ 'pi' ]`. The extra ids are exactly
// the unrequested directories that would be created. Since setup hands the
// result to the child as an explicit `--harness` list, the difference stops
// being a label and becomes what gets written.
async function detectedHarnesses() {
  try {
    const A = await import(SCRIPT_URL("agents"));
    return withRegistryHome(() => A.detectHarnesses(projectRoot()));
  } catch (e) {
    registryReadFailed("the project's harnesses", e);
    return [];
  }
}

// The harness this command is running inside, or null when it cannot be
// determined. main() has already resolved it into WAYPOST_HARNESS for every
// non-quiet command (one `ps` per working command, shared with presence and
// commit), so the first line is the answer and detectHarness() is only the
// fallback for a quiet command or a detection that threw. It is deliberately a
// question about *now* and never about the project, which is what
// detectedHarnesses() answers; callers union the two.
async function runningHarness() {
  try {
    const A = await import(SCRIPT_URL("agents"));
    return withRegistryHome(() => {
      const h = process.env.WAYPOST_HARNESS || A.detectHarness();
      return h && h !== "unknown" && A.harnessIds().includes(h) ? h : null;
    });
  } catch (e) {
    registryReadFailed("the running harness", e);
    return null;
  }
}

function passThrough(args, names) {
  const out = [];
  for (const n of names) { const v = opt(args, n); if (v) out.push(n, v); }
  return out;
}

// ─── size ──────────────────────────────────────────────────────────────
//
// Read-only measurement of build artifacts and dev caches (WP-17, "Disk
// hygiene by discovery"): never writes, never deletes. A dynamic
// import(), the way selfInstall reaches agents.mjs above — in-process, not
// a subprocess — so a later `doctor` check can share this exact code.
const GB = 1024 ** 3;

function tildeHome(p) {
  const home = homedir();
  return p === home || p.startsWith(home + sep) ? `~${p.slice(home.length)}` : p;
}

// ─── clean ───────────────────────────────────────────────────────────────
//
// waypost clean [--json] — WP-17, the clean-plan story (ADR "Disk hygiene by
// discovery" Decision 4). A classified plan over both scopes at once: the
// project (walked with rootItem:false — the project root is never an item —
// and the entry budget `size` itself uses) and the machine (a fresh
// profile's own caches, plus any registry cache the profile does not carry
// yet, the same static fallback `size --global` uses without one). Every
// fact classification needs — git ignore/tracked status, the live process
// table, leases, whether another host shares this checkout — is gathered
// HERE and handed to the pure scripts/cleanup.mjs; nothing there ever
// touches the filesystem or a subprocess. Holds the machine-wide slot the
// whole time it runs, exactly like `size --global` (WP-18 Decision 4): a
// plan is itself a scan of the whole machine's caches.
//
// waypost clean --apply <id…>|should [--yes --reason "…"] — the removal
// story (Decision 5, and its amendment for the standing yes at the end of
// `run --heavy`, which does not apply here — every apply here needs its own
// yes). Removal belongs to CLI commands; scripts/cleanup.mjs and scripts/sizes.mjs
// stay guarded against removal calls and shell commands.

// WAYPOST_CLEAN_NOW overrides "now" for hermetic tests only — ctime cannot be
// backdated on a fixture, so a test instead moves the clock forward past
// stale_days. Honored only under NODE_TEST_CONTEXT — the marker `node --test`
// sets on itself and every child process it spawns (never set otherwise, and
// never something a real invocation could set by accident) — so a variable
// leaked into an interactive shell can never misdate a real plan; ignored
// with a warning on stderr instead. Warned at most once either way, the
// same way WAYPOST_CAPACITY_PROBE is (warnIfProbed above).
let warnedCleanNowProbed = false;
// Whether the last cleanNow() call actually used WAYPOST_CLEAN_NOW (never
// set, no NODE_TEST_CONTEXT, or unparseable all leave this false) — read by
// every log-writing call site below so the log's own `clock` field never
// claims an override that was silently ignored.
let lastCleanNowHonored = false;
function cleanNow() {
  const raw = process.env.WAYPOST_CLEAN_NOW;
  if (!raw) { lastCleanNowHonored = false; return Date.now(); }
  if (!process.env.NODE_TEST_CONTEXT) {
    lastCleanNowHonored = false;
    if (!warnedCleanNowProbed) {
      warnedCleanNowProbed = true;
      process.stderr.write("waypost: WAYPOST_CLEAN_NOW is set but NODE_TEST_CONTEXT is not — ignored (tests only)\n");
    }
    return Date.now();
  }
  const n = Number(raw);
  const ms = Number.isFinite(n) ? n : Date.parse(raw);
  if (!Number.isFinite(ms)) { lastCleanNowHonored = false; return Date.now(); }
  lastCleanNowHonored = true;
  if (!warnedCleanNowProbed) {
    warnedCleanNowProbed = true;
    process.stderr.write("waypost: WAYPOST_CLEAN_NOW is set — the clock is not the real one (tests only)\n");
  }
  return ms;
}

// WAYPOST_CAPACITY_PROBE replaces the machine's real measures, for hermetic
// tests only. When it is honoured, say so on stderr, so a variable leaked
// into an interactive shell cannot silently fake an idle machine.
function warnIfProbed(m) {
  if (warnIfProbed.done || !m || !m.probes || m.probes.memory !== "WAYPOST_CAPACITY_PROBE") return;
  warnIfProbed.done = true;
  process.stderr.write("waypost: WAYPOST_CAPACITY_PROBE is set — the real machine is not being measured (tests only)\n");
}

// The boot authority (WP-18 amendment) is read at most once per `waypost`
// invocation, and only when something actually needs it: an epoch that
// disagrees. The claim, the lock and `--release` all share this one thunk, so
// a command that reads twenty records still spawns at most one PowerShell.
let BOOT_AUTHORITY = null;
function bootAuthority(capacity) {
  if (!BOOT_AUTHORITY) BOOT_AUTHORITY = capacity.authorityOnce();
  return BOOT_AUTHORITY;
}

export { INHERITED_SESSION_ID, INHERITED_HARNESS, INHERITED_PROC, ROOT, SCRIPT, SCRIPT_URL, VERSION, fail, run, runJson, projectRoot, configPath, readConfig, VALUED, splitAtTerminator, flag, opt, positionals, withRegistryHome, registryReadFailed, detectedHarnesses, runningHarness, passThrough, GB, tildeHome, warnedCleanNowProbed, lastCleanNowHonored, cleanNow, warnIfProbed, BOOT_AUTHORITY, bootAuthority };
