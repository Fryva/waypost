// waypost — repository and runtime diagnostics; Doctor retains runners and repairs.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { platform } from "node:os";
import { spawnSync } from "node:child_process";
import { pluginRoot, projectRoot, pathUnder } from "./lib.mjs";
import { peers as peersOf, readLeases as readLeasesOf, processTable } from "./presence.mjs";
import { inspect as inspectLauncher, repairCommand as launcherRepair } from "./launcher.mjs";

function finding(group, level, check, message, file) {
  const f = { group, level, check, message };
  if (file) f.file = file;
  return f;
}

// The command on PATH, when it is npm's symlink into a checkout another operating
// system edits (scripts/launcher.mjs has the whole story). Two levels, because
// "it will break on the next save from the other machine" is worth saying BEFORE
// it breaks: once the bit is gone, `waypost doctor` itself answers "permission
// denied" and this check can only be reached through `node bin/waypost doctor`.
// Never a --fix repair: it writes outside the project, into a directory on PATH.
export function checkLauncher(report = null) {
  let r = report;
  if (!r) { try { r = inspectLauncher(); } catch { return []; } }
  if (r.risk === "none") return [];
  const names = r.linked.map((l) => l.file).join(", ");
  const repair = launcherRepair(r);
  if (r.risk === "broken") {
    return [finding("install", "issue", "launcher",
      `${names}: a symlink to ${r.checkout.entry}, which has lost its executable bit — the command fails with "permission denied". \`${repair}\` replaces the symlink with a shim that does not need the bit.`)];
  }
  return [finding("install", "warn", "launcher",
    `${names}: a symlink to ${r.checkout.entry}, and core.fileMode=false says this checkout is shared with a system that has no executable bit. The next save of bin/waypost from there breaks the command, and git will not restore the bit. \`${repair}\` replaces the symlink with a shim.`)];
}

// Derived views are regenerated, never merged (ADR-0006). Two sessions in two
// harnesses both touch a story, both regenerate the board, and git then asks a
// human to hand-merge two machine-written files. The driver removes that class
// of conflict entirely — but only where the vault is versioned WITH the code,
// which is the only case where the two can conflict in one repository.
export function checkMergeDriver(cfg, proj) {
  if (!existsSync(join(proj, ".git"))) return [];
  const vault = String((cfg && cfg.vault_path) || "");
  if (!vault || !pathUnder(vault, proj)) return [];
  const out = [];
  let attrs = "";
  try { attrs = readFileSync(join(proj, ".gitattributes"), "utf8"); } catch {}
  if (!/merge=waypost-derived/.test(attrs)) {
    out.push(finding("install", "warn", "merge-driver",
      "Derived views (kanban.md, graph.md, code-map.md, folder indexes) are not marked `merge=waypost-derived` in .gitattributes — two sessions working in parallel will hand you a conflict in a generated file. `waypost doctor --fix` writes it."));
  }
  const current = (spawnSync("git", ["config", "--get", "merge.waypost-derived.driver"],
    { cwd: proj, encoding: "utf8" }).stdout || "").trim();
  if (!current) {
    out.push(finding("install", "warn", "merge-driver",
      "The waypost-derived merge driver is not configured in this clone (git config merge.waypost-derived.driver). It is machine-local, so every clone sets it once — `waypost doctor --fix` does."));
  } else if (!mergeDriverAccepted().includes(current) && !FOREIGN_MACHINE_DRIVER_RE.test(current)) {
    // A driver configured by an older version is worse than none: git calls it,
    // it cannot identify the file from git's temp name, and the conflict comes
    // back anyway — with a confusing line of output in front of it.
    out.push(finding("install", "warn", "merge-driver",
      `merge.waypost-derived.driver points at a different command than this version installs:\n      configured: ${current}\n      expected:   ${mergeDriverCommand()}\n      \`waypost doctor --fix\` rewrites it.`));
  }
  return out;
}

// Presence and leases left behind by sessions that are no longer live, and the
// duplicate files a sync client creates when two devices write at once.
export function checkSharedVaultState(cfg) {
  if (!cfg || !cfg.vault_path) return [];
  const out = [];
  let view, leases;
  try {
    // A diagnostic leaves no trace: neither read records what it saw.
    view = peersOf(cfg.vault_path, { persist: false });
    leases = readLeasesOf(cfg.vault_path, { persist: false });
  } catch { return []; }
  if (view.conflicts.length) {
    out.push(finding("vault", "warn", "shared-state",
      `The sync client left ${view.conflicts.length} conflicted copy(ies) in .projectstore/presence — two devices wrote at once: ${view.conflicts.join(", ")}. Delete them once you know which device is authoritative.`));
  }
  const stale = leases.filter((l) => !l.live);
  if (stale.length) {
    out.push(finding("vault", "info", "shared-state",
      `${stale.length} lease(s) are held by sessions that are no longer live (${stale.map((l) => `${l.path} — ${l.session}`).join(", ")}). They are advisory and will be taken over on the next acquire.`));
  }
  if (view.storage.kind !== "local") {
    out.push(finding("vault", "info", "shared-state",
      `Vault is on ${view.storage.provider} (${view.storage.kind}): presence from another device can be up to ~${Math.round(view.storage.lag_ms / 1000)}s behind, so "nobody else is working" is a statement about what has synced, not about the world.`));
  }
  return out;
}

// Every form this tool is willing to have installed. The shared-worktree case
// the portable form exists for is exactly the one where two machines resolve
// `waypost` differently, and a strict comparison would have them rewriting each
// other's value on every `--fix`.
// G-7: two machines sharing one .git without `waypost` on PATH each write
// `node /<their own path>/merge-derived.mjs …` — a value that is genuinely
// theirs, not a stale value to rewrite. mergeDriverAccepted() only knows THIS
// machine's absolute paths (the two `node`/execPath forms above are built
// from this pluginRoot()); this pattern recognises any machine's equivalent
// invocation by its stable suffix, so `--fix` does not fight another clone.
// Another machine's own path to the same script — a .git shared between
// machines, or a checkout that lives somewhere else. It has to LOOK like a
// path: a value whose separators a shell has already eaten
// (`Y:DocumentsWaypostscriptsmerge-derived.mjs`) names nothing on any machine,
// and is drift to repair rather than someone else's arrangement to respect.
const FOREIGN_MACHINE_DRIVER_RE = /[\\/]merge-derived(\.mjs)? %A %O %B %P$/;

// git does not run a merge driver itself: it hands the command line to a
// shell, and on Windows that is git's own `sh`, where a backslash escapes
// whatever follows it. `node Y:\Documents\…\merge-derived.mjs %A %O %B %P`
// reaches node as `Y:Documents…merge-derived.mjs` — measured on Windows:
// MODULE_NOT_FOUND, and the merge hands back a conflict in a generated file,
// which is the one thing this driver exists to prevent. Node opens a
// `/`-spelled path on Windows perfectly well, and git spells its own paths
// that way too, so that is the spelling that goes into .git/config.
function driverScript() {
  return join(pluginRoot(), "scripts", "merge-derived.mjs").replace(/\\/g, "/");
}

export function mergeDriverAccepted() {
  return [
    "waypost merge-derived %A %O %B %P",
    `node ${driverScript()} %A %O %B %P`,
    `${process.execPath} ${driverScript()} %A %O %B %P`,
  ];
}

export function mergeDriverCommand() {
  // Prefer the CLI on PATH: `process.execPath` pins a versioned interpreter
  // (…/Cellar/node/25.6.1/bin/node) that a package upgrade removes, and an
  // absolute plugin path is wrong for anyone sharing one .git between machines.
  // Fall back to a plain `node` — still portable across interpreter upgrades —
  // when waypost is not installed on PATH.
  const onPath = spawnSync("command -v waypost", { encoding: "utf8", shell: true });
  if (onPath.status === 0 && (onPath.stdout || "").trim()) return "waypost merge-derived %A %O %B %P";
  return `node ${driverScript()} %A %O %B %P`;
}

export function checkVaultGit(cfg, proj = projectRoot()) {
  if (existsSync(join(cfg.vault_path, ".git"))) return [];
  // A vault INSIDE the project repository is already versioned by it. Running
  // `git init` there would create a nested repository: the outer repo would
  // start seeing a gitlink where files used to be, and the vault's own history
  // would live in a directory nobody clones. The whole point of the check is
  // "this knowledge has history" — inside the repo, it does.
  if (pathUnder(cfg.vault_path, proj) && existsSync(join(proj, ".git"))) return [];
  return [finding("install", "warn", "vault-git",
    "Vault is not a git repository — the knowledge has no history/blame/review. Consider `git init` (doctor --fix offers it).")];
}

// A missing process table is not a vault problem and never makes the vault look
// wrong — which is exactly why it needs saying out loud. Everything that decides
// "is that session still alive?" degrades to a 24h age guess without it: a
// session whose harness exited yesterday reads as live until tomorrow, a
// cleanup run cannot see that a tool is using its cache directory, and the
// machine-wide-limit consent gate falls back to env markers an agent could set
// itself. There is no repair to offer, so this is a warning naming the two
// things worth checking rather than an issue.
// `table` is injectable so the warning can be asserted on any host: a host
// whose `ps` speaks another locale cannot be produced on demand, and a check
// that only ever runs clean is a check nothing holds. An explicit `null` stands
// for "the parse came back empty".
export function checkProcessTable(table) {
  if (platform() === "win32") return [];
  if (table === undefined) {
    try { table = processTable(); } catch { table = null; }
  }
  if (table) return [];
  return [finding("install", "warn", "process-table",
    "No process table: liveness falls back to a 24h age guess — a session whose harness has exited reads as live until then, and a running tool is not seen holding its cache directory. Check that `ps` is on PATH and accepts `ps axo pid=,ppid=,lstart=,comm=`; waypost asks for it in the C locale, so a shell's LC_TIME does not matter (WP-19).")];
}

