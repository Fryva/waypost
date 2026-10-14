// waypost — state-migrate.mjs: moves machine state from where earlier versions
// kept it into the one root machineStateDir() now names (the global-rules ADR,
// Decision 1; WP-18 "The heavy-work slot is machine-wide on Windows, not one
// per packaged app").
//
// The old state is not one directory. On Windows every packaged harness had
// its own private copy of %LOCALAPPDATA%\Waypost, so the same file can exist
// in several places with different content — and the one that matters most,
// the owner's run budget, fails closed rather than silently disappearing:
//   - it is copied, never moved, and its old copy is overwritten IN PLACE with
//     a tombstone an older Waypost rejects as an invalid budget — so a process
//     still running the old code refuses live runs instead of reading "no
//     budget" (overwriting in place also keeps MSIX from redirecting the write
//     into a private package copy, which it does to a newly created file);
//   - two different budgets are both kept, and a conflict marker — written
//     FIRST — refuses live runs until the owner sets the budget again.
//
// Per file, no global "done" marker: every run checks every old root. Each old
// root is handled under its own lock and then the new root's. A file reaches
// the new root by copy-to-temp then hard link, so it never overwrites a file a
// newer writer put there meanwhile. Never throws to its caller: what failed is
// reported and tried again on the next run.

import { existsSync, mkdirSync, readdirSync, readFileSync, copyFileSync, linkSync, unlinkSync, rmdirSync, statSync, writeFileSync, openSync, fsyncSync, closeSync, fstatSync, writeSync, constants as fsConstants } from "node:fs";
import { join, basename } from "node:path";
import { createHash } from "node:crypto";
import { acquireLock, releaseLock } from "./machine-lock.mjs";
import { stricterLimit, writeFileAtomic, LIMIT_WRITER } from "./lib.mjs";

export { stricterLimit };

export const CONFLICT_DIR = "migrated-conflicts";
export { LIMIT_WRITER };
export const BUDGET_CONFLICT_MARKER = "run-budget.conflict";
export const BUDGET_FILE = "run-budget.json";

// What an old root's run-budget.json holds once it has moved: version 0 fails
// every older validate(), so old code refuses (`run-budget-invalid`).
export const BUDGET_TOMBSTONE = JSON.stringify({ version: 0, moved_to: "~/.local/state/waypost/run-budget.json" }) + "\n";
export const isBudgetTombstone = (text) => {
  try { const v = JSON.parse(text); return !!v && v.version === 0 && typeof v.moved_to === "string"; } catch { return false; }
};
const readText = (p) => { try { return readFileSync(p, "utf8"); } catch { return null; } };

function writeTombstone(p) {
  const fd = openSync(p, "r+");
  try {
    const size = fstatSync(fd).size;
    const body = BUDGET_TOMBSTONE.trimEnd();
    const text = body + " ".repeat(Math.max(1, size - Buffer.byteLength(body))) ;
    writeSync(fd, text, 0, "utf8");
    fsyncSync(fd);
  } finally { closeSync(fd); }
}

// An old copy that already begins as a tombstone was torn by an interrupted
// tombstone write: there is no budget left in it to move. An EMPTY one is
// treated the same only when the new root already holds a budget (the move
// placed it); alone, an empty file is not a budget anyone can trust, and keeps
// refusing as older versions did.
const tornBudget = (text) => text !== null && /^\s*\{"version":0,/.test(text);
const emptyText = (text) => text !== null && text.trim() === "";

// Entries that never move: the lock is per directory, and slot records belong
// to a live process that releases them by their own path — readers look in the
// old slot directories for one release instead (bin/waypost legacySlotsDirs()).
const STAYS = (name) => name === ".lock" || name.startsWith("slots.") || name === CONFLICT_DIR || name.endsWith(".tmp");

// Is there anything left to move? Cheap enough to ask on every command. A
// tombstoned budget and anything that is not a plain file are not pending.
export function pendingEntries(dir) {
  let names = [];
  try { names = readdirSync(dir); } catch { return []; }
  return names.filter((n) => {
    if (STAYS(n)) return false;
    const p = join(dir, n);
    try { if (!statSync(p).isFile()) return false; } catch { return false; }
    if (n === BUDGET_FILE && isBudgetTombstone(readText(p))) return false;
    return true;
  });
}

// null when the file cannot be read — and then nothing is ever deleted.
const digest = (p) => {
  try { return createHash("sha256").update(readFileSync(p)).digest("hex"); } catch { return null; }
};
const sameContent = (a, b) => {
  const ha = digest(a), hb = digest(b);
  if (ha === null || hb === null) throw Object.assign(new Error(`cannot read ${ha === null ? a : b}`), { code: "EUNREADABLE" });
  return ha === hb;
};

// Copy `src` to `dst` without ever replacing an existing `dst`: copy to a temp
// file beside it, flush, then hard-link into place (EEXIST if someone got
// there first). Works across volumes, since the copy is the cross-volume step.
function placeCopy(src, dst) {
  const tmp = `${dst}.${process.pid}.migrate.tmp`;
  copyFileSync(src, tmp);
  try { const fd = openSync(tmp, "r+"); try { fsyncSync(fd); } finally { closeSync(fd); } } catch {}
  try {
    try { linkSync(tmp, dst); }
    catch (e) {
      // FAT/exFAT, some network and VM shares: no hard links. An exclusive
      // copy still never replaces an existing dst; a torn read of a half
      // copy fails as an invalid file, which refuses rather than opens.
      if (!["EPERM", "ENOTSUP", "EOPNOTSUPP", "EISDIR", "ENOSYS", "EXDEV"].includes(e.code)) throw e;
      copyFileSync(tmp, dst, fsConstants.COPYFILE_EXCL);
      try { const fd = openSync(dst, "r+"); try { fsyncSync(fd); } finally { closeSync(fd); } } catch {}
    }
  } finally { try { unlinkSync(tmp); } catch {} }
}

// A short, stable name for a root inside migrated-conflicts/.
const tagOf = (dir) => createHash("sha256").update(dir).digest("hex").slice(0, 12);

function archiveCopy(src, to, fromDir) {
  const dir = join(to, CONFLICT_DIR, tagOf(fromDir));
  mkdirSync(dir, { recursive: true });
  const meta = join(dir, "FROM.txt");
  if (!existsSync(meta)) writeFileSync(meta, fromDir + "\n", "utf8");
  const h = digest(src);
  for (const n of readdirSync(dir)) {
    if (n.startsWith(basename(src)) && h !== null && digest(join(dir, n)) === h) return join(dir, n);
  }
  let dst = join(dir, basename(src));
  for (let i = 1; existsSync(dst); i++) dst = join(dir, `${basename(src)}.${i}`);
  placeCopy(src, dst);
  return dst;
}

function readJson(p) { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } }

// The budget: copied, its old copy tombstoned in place; a different budget
// already in the new root is a conflict — marker first, both copies archived,
// then the new root's copy removed so nothing reads as "the" budget.
function migrateBudget(src, to, oldDir, depth = 0) {
  const dst = join(to, BUDGET_FILE);
  const srcText = readText(src);
  if (tornBudget(srcText) || (emptyText(srcText) && existsSync(dst))) { writeTombstone(src); return null; }
  if (emptyText(srcText)) return `an empty run budget in ${src} — not a budget: delete it, or set the budget again with \`waypost team budget set\``;
  const marker = join(to, BUDGET_CONFLICT_MARKER);
  const keptSoFar = () => { try { return JSON.parse(readFileSync(marker, "utf8")).kept || []; } catch { return []; } };
  const writeMarker = (more) => writeFileAtomic(marker,
    JSON.stringify({ at: new Date().toISOString(), from: oldDir, kept: [...new Set([...keptSoFar(), ...more])] }) + "\n", { sweep: false });
  if (existsSync(marker)) {
    // Already in conflict: this copy joins the kept ones, nothing is "the" budget.
    writeMarker([]);
    writeMarker([archiveCopy(src, to, oldDir)]);
    writeTombstone(src);
    return `run budget: another copy in ${oldDir} kept under ${CONFLICT_DIR}/; live runs still refused until the budget is set again`;
  }
  if (existsSync(dst)) {
    if (!sameContent(src, dst)) {
      writeMarker([]);
      writeMarker([archiveCopy(dst, to, to), archiveCopy(src, to, oldDir)]);
      writeTombstone(src);
      unlinkSync(dst);
      return `run budget: different copies in ${oldDir} and ${to} — both kept under ${CONFLICT_DIR}/; live runs refused until the budget is set again`;
    }
  } else {
    try { placeCopy(src, dst); }
    catch (e) { if (e.code === "EEXIST" && depth < 2) return migrateBudget(src, to, oldDir, depth + 1); throw e; }
  }
  writeTombstone(src);
  return null;
}

// Any other file: placed if the new root has none; an identical copy is
// dropped; otherwise kept by the rule for its kind, the loser archived.
function migrateFile(name, oldDir, to) {
  const src = join(oldDir, name);
  const dst = join(to, name);
  if (!existsSync(dst)) {
    try { placeCopy(src, dst); unlinkSync(src); return null; }
    catch (e) { if (e.code !== "EEXIST") throw e; }
  }
  if (sameContent(src, dst)) { unlinkSync(src); return null; }
  const newer = (a, b, field) => String((readJson(a) || {})[field] || "") > String((readJson(b) || {})[field] || "");
  let keepOld = false;
  let line = null;
  if (/^cleanup-limit\..+\.json$/.test(name)) {
    const cur = readJson(dst), old = readJson(src);
    // A limit this version wrote is the owner's latest explicit choice: it
    // wins. Two copies from older versions: the more restrictive one.
    const latest = !!(cur && cur.written_by === LIMIT_WRITER);
    keepOld = !latest && stricterLimit(cur, old) === old;
    line = latest
      ? `cleanup limit: an older copy in ${oldDir} archived under ${CONFLICT_DIR}/ — the limit set with this version stays`
      : (((cur && cur.limit && cur.limit.kind) || "off") === ((old && old.limit && old.limit.kind) || "off")
        ? `cleanup limit: different copies — the more restrictive kept, the other under ${CONFLICT_DIR}/`
        : `cleanup limit: different kinds of limit — the one set later kept, the other under ${CONFLICT_DIR}/`);
  } else if (/^machine\..+\.json$/.test(name)) {
    keepOld = newer(src, dst, "generated_at");
  }
  if (keepOld) {
    archiveCopy(dst, to, to);
    unlinkSync(dst);
    placeCopy(src, dst);
  } else {
    archiveCopy(src, to, oldDir);
  }
  unlinkSync(src);
  return line;
}

// Move everything movable from each old root into `to`. `deps` carries the
// presence and capacity modules the lock needs (loaded lazily by the CLI).
export async function migrateMachineState({ to, from = [], deps }) {
  const report = [];
  for (const oldDir of from) {
    try {
      if (!pendingEntries(oldDir).length) continue;
      mkdirSync(to, { recursive: true });
      const oldLock = await acquireLock(oldDir, deps.presence, deps.capacity);
      if (!oldLock) { report.push(`busy: ${oldDir} — tried again next run`); continue; }
      try {
        const newLock = await acquireLock(to, deps.presence, deps.capacity);
        if (!newLock) { report.push(`busy: ${to} — tried again next run`); continue; }
        try {
          for (const name of pendingEntries(oldDir)) {
            try {
              const line = name === BUDGET_FILE ? migrateBudget(join(oldDir, name), to, oldDir) : migrateFile(name, oldDir, to);
              if (line) report.push(line);
            } catch (e) { report.push(`could not move ${join(oldDir, name)}: ${e.code || e.message} — tried again next run`); }
          }
        } finally { releaseLock(newLock); }
      } finally { releaseLock(oldLock); }
      // An emptied root goes. Never recursive, and slot directories are left
      // alone: an older `run --heavy` may be about to claim in one.
      try { rmdirSync(oldDir); } catch {}
    } catch (e) {
      report.push(`could not move from ${oldDir}: ${e.code || e.message} — tried again next run`);
    }
  }
  return report;
}

// Budgets still waiting in an old root (not tombstones) — read fresh on every
// call, so a long-running process never acts on a stale answer.
export function legacyBudgets(dirs) {
  return dirs.map((d) => join(d, BUDGET_FILE)).filter((p) => {
    let t;
    try { t = readFileSync(p, "utf8"); }
    catch (e) { return !["ENOENT", "ENOTDIR"].includes(e.code); } // unreadable: refuses
    return !isBudgetTombstone(t) && !tornBudget(t);
  });
}
