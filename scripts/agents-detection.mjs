// waypost — harness evidence and consent checks (ADR-0003/0005).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "./lib.mjs";
import { PREFIX, harnessIds, harness, registry } from "./agents-registry.mjs";
import { harnessProcess, processTable } from "./presence.mjs";


// Which harnesses this project already uses. Detection is by directory or by a
// file the harness itself owns, never by env: a Codex user must not have
// .claude/ conjured for them, and a shared project may carry several.
export function detectHarnesses(proj = projectRoot()) {
  return harnessIds().filter((id) => (harness(id).detect || []).some((p) => markerCounts(join(proj, p))));
}

// A detection marker is evidence the USER uses a harness. A file whose entire
// content is waypost's own routing block is not: waypost wrote it, as another
// harness's instruction target (E-1). `AGENTS.md` is `codex`'s marker AND the
// block target for nine other harnesses, so a solo-Pi project's `waypost setup`
// used to write AGENTS.md, then read it back as "codex is used here" and, on the
// next run, install an unrequested Codex agent set. Strip our block; a marker
// counts when the user's own content (or a directory, or a file we never write)
// remains. An empty file is not evidence either.
function markerCounts(abs) {
  if (!existsSync(abs)) return false;
  let text;
  try { text = readFileSync(abs, "utf8"); } catch { return directoryCounts(abs); }
  return text.replace(BLOCK_RE, "").trim().length > 0;
}

// A directory is evidence unless everything in it is waypost's own skills:
// `waypost skills install` puts one copy into the shared `.agents/skills/` for
// the eleven harnesses that read it, and `.agents/` is also Antigravity's
// detection marker — so a Codex project's skills used to read back as "this
// project uses Antigravity" and install an unrequested agent set (the E-1
// loop again, one directory up). Roles are different: they are installed for a
// harness on purpose, so they stay evidence.
function directoryCounts(abs) {
  let names;
  try { names = readdirSync(abs).filter((n) => !n.startsWith(".")); } catch { return true; }
  if (!names.length) return true; // an empty directory is the user's, as before
  for (const n of names) {
    if (n !== "skills") return true;
    let inner;
    try { inner = readdirSync(join(abs, n)).filter((x) => !x.startsWith(".")); } catch { return true; }
    if (inner.some((x) => !x.startsWith(PREFIX))) return true;
  }
  return false;
}

// The running harness, from an explicit WAYPOST_HARNESS or, failing that, the
// env markers each registry entry declares — the same detection commit.mjs used
// for its trailers, lifted here so presence, sessions, leases and watch label a
// session the same way commits do (E-3) instead of showing "?".
// Env markers are inherited: a harness spawned from inside another (OpenCode
// started from a Claude Code session, a Codex run from Cursor's terminal)
// carries the outer harness's variables too, and the first registry entry
// whose markers matched used to win — the live OpenCode run of 2026-09-04
// recorded itself as `claude` and installed Claude's roles. The process that
// actually runs the session is better evidence: when the nearest non-shell
// ancestor (harnessProcess) is a harness this registry knows, that harness
// wins; env decides only when the process says nothing.
//
// `table`/`ppid` exist so that rule is testable. It is not: under `node --test`
// the nearest non-shell ancestor of the test process is `node`, which is in no
// registry entry, so a real-table assertion resolves to "unknown" and passes for
// the wrong reason — and the regression it guards (WP-19) is invisible on a host
// whose `ps` output the parser cannot read at all. gateCheck took the same two
// parameters first.
//
// A `ppid` on its own is read against the real table, never discarded: a caller
// asking "where does the walk start?" and getting "unknown" back with no way to
// tell that from a genuinely empty table has been handed a silent no-op.
export function detectHarness(env = process.env, { table, ppid } = {}) {
  if (env.WAYPOST_HARNESS) return env.WAYPOST_HARNESS;
  const byProcess = harnessOfProcess(env, table, ppid);
  if (byProcess) return byProcess;
  for (const [id, h] of registry()) {
    if ((h.env || []).some((k) => env[k])) return id;
  }
  return "unknown";
}

// Install needs both project evidence and the session asking for the roles.
// Keep uninstall and the marker detector independent of ambient harnesses.
export function installHarnesses(proj = projectRoot()) {
  const seen = detectHarnesses(proj);
  const running = detectHarness();
  return [...new Set([...seen, ...(harnessIds().includes(running) ? [running] : [])])];
}

function harnessOfProcess(env, table, ppid) {
  let proc = null;
  try {
    if (env.WAYPOST_PROC) proc = JSON.parse(env.WAYPOST_PROC);
    // The process is read for a synthetic env only when the caller supplied the
    // evidence; otherwise env-only, so `detectHarness({CLAUDECODE:"1"})` stays a
    // pure env question. Supplying a `ppid` counts as supplying evidence: the
    // real table is what that pid is looked up in.
    else if (table !== undefined || ppid !== undefined || env === process.env) proc = harnessProcess(table, ppid);
  } catch { proc = null; }
  // The binary's first word, so `claude`, `codex`, `opencode`, `gemini`,
  // `cursor-agent` all resolve; an Electron helper resolves to nothing. On Linux
  // argv[0] is read too: the thread name in `comm` may have been renamed.
  const words = [proc?.comm, proc?.argv0].filter(Boolean).map((n) => String(n).toLowerCase().split(/[^a-z0-9]+/)[0]).filter(Boolean);
  if (!words.length) return null;
  for (const [id, h] of registry()) {
    if (h.kind === "provider") continue;
    if (words.some((word) => word === id || (h.process || []).includes(word))) return id;
  }
  return null;
}

// ─── The consent gate (the machine-wide-limit ADR, Decision 2) ─────────
//
// Reads harness evidence straight off `dirs` — the directories to read, in
// priority order — rather than through registry(): that loader is memoized
// and lets a PROJECT'S OWN `.waypost/harnesses/<id>.json` entirely replace a
// shipped one, including its own env markers and process names, which would
// let a project quietly weaken the very evidence this gate exists to trust.
// So a later directory's entry for an id an earlier one already defined may
// only ADD env markers to it — never replace its kind or its process names,
// and never remove a marker a shipped entry already carries; an id no
// earlier directory defined is added outright (nothing shipped to weaken).
// The first directory is the shipped one and is mandatory: unreadable, this
// throws, and the caller (bin/waypost) refuses the gated change rather than
// silently evaluating it with an incomplete or missing harness list. Every
// other directory (a project's own) is optional, and a file that fails to
// parse there is simply skipped — the least-trusted data source, so a
// mistake in it costs information, never a crash.
function loadGateEntries(dirs) {
  const byId = new Map();
  dirs.forEach((dir, i) => {
    let names;
    try { names = readdirSync(dir).filter((n) => n.endsWith(".json")).sort(); }
    catch (e) {
      if (i === 0) throw new Error(`gateCheck: cannot read the shipped harness registry at ${dir}: ${e.message}`);
      return;
    }
    for (const n of names) {
      let h;
      try { h = JSON.parse(readFileSync(join(dir, n), "utf8")); } catch { continue; }
      const id = h.id || n.replace(/\.json$/, "");
      const existing = byId.get(id);
      if (!existing) {
        byId.set(id, {
          id, kind: h.kind || null,
          process: Array.isArray(h.process) ? [...h.process] : [],
          env: Array.isArray(h.env) ? [...h.env] : [],
        });
      } else {
        for (const k of (Array.isArray(h.env) ? h.env : [])) {
          if (!existing.env.includes(k)) existing.env.push(k);
        }
      }
    }
  });
  return [...byId.values()];
}

// Whether a harness is running right now, from the WHOLE ancestor chain the
// live process table shows (not only the nearest non-shell one
// harnessOfProcess checks — a double-forked or wrapped harness may sit
// further up) plus every known harness's own env markers — never
// `WAYPOST_HARNESS`/`WAYPOST_PROC`, which an agent could set to claim there
// is none. A provider entry (`kind: "provider"`) is never evidence of a
// harness on its own. Without a process table (Windows today, or a caller
// that passes `table: null`) the env markers alone decide, and the result
// says so (`process_table: false`). The nearest matching ancestor wins —
// walked outward from `ppid`, so the first hit found is always the closest
// one — capped at 128 levels (deeper than harnessProcess's own 32-level cap:
// this gate has to see past a double fork or a wrapper a plain attribution
// lookup does not need to).
export function gateCheck({ env = process.env, table = processTable(), ppid = process.ppid, dirs } = {}) {
  if (!Array.isArray(dirs) || !dirs.length) throw new Error("gateCheck: dirs is required");
  const entries = loadGateEntries(dirs).filter((h) => h.kind !== "provider");

  const ancestors = [];
  let harness = null;
  let via = null;
  if (table) {
    let pid = ppid;
    for (let depth = 0; depth < 128 && pid != null && pid > 1; depth++) {
      const p = table.get(pid);
      if (!p) break;
      ancestors.push({ pid: p.pid, comm: p.comm, ...(p.argv0 ? { argv0: p.argv0 } : {}) });
      if (!harness) {
        // `ps -o comm=` gives the full executable path on macOS
        // (".../MacOS/claude"), so the first word is taken from the basename.
        // On Linux argv[0] is checked as well: `comm` is the main thread's name,
        // which a runtime may rename (Node 24 does, 2026-10-11 on a hosted runner).
        for (const name of [p.comm, p.argv0]) {
          const word = String(name || "").toLowerCase().split(/[\\/]/).pop().split(/[^a-z0-9]+/)[0];
          const hit = word && entries.find((h) => word === h.id || h.process.includes(word));
          if (hit) { harness = hit.id; via = "process"; break; }
        }
      }
      pid = p.ppid;
    }
  }

  const markers = [];
  for (const h of entries) {
    for (const k of h.env) if (env[k]) markers.push({ harness: h.id, var: k });
  }
  if (!harness && markers.length) { harness = markers[0].harness; via = "env"; }

  return { harness, via, evidence: Boolean(harness), process_table: Boolean(table), ancestors, markers };
}

const BLOCK_RE = /<!--\s*waypost:agents v\d+[\s\S]*?<!--\s*\/waypost:agents\s*-->\n?/g;

export { BLOCK_RE };
