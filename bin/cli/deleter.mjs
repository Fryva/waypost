// Waypost CLI: deleter.
import { REMOVING_DIR, writeFileAtomic } from "../../scripts/lib.mjs";
import { ROOT, SCRIPT_URL } from "./core.mjs";
import { selfMarker } from "./slots.mjs";
import { spawn } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, unlinkSync } from "node:fs";
import { hostname, constants as osConstants, setPriority } from "node:os";
import { basename, join } from "node:path";

// ─── the detached deleter (the amended machine-wide-limit ADR, Decision 4) ──
//
// Nothing here is a removal call outside this dispatch: renameSync moves an
// item aside (a rename, not a delete), and the actual removal runs in a
// SEPARATE, detached process this file spawns and forgets about — so the
// caller (the automatic path at the end of `run --heavy`, commit C; or a
// `waypost clean` adopting a leftover) returns without waiting for a
// multi-gigabyte tree to actually vanish from disk. `waypost-removing/`
// sits directly in the git common dir, outside ADR-0010's own
// `waypost/<vault>/` coordination tree, so a coordination-tree sweep and a
// leftover-deleter sweep can never collide.
const REMOVING_NAME_RE = /^[0-9a-z]+-\d+-[0-9a-f]{6}$/;

function randomHex6() {
  return Math.floor(Math.random() * 0x1000000).toString(16).padStart(6, "0");
}

// One item, renamed aside right before its own removal. The marker (who is
// about to delete it) is written FIRST, the rename itself second — so a
// reader only ever sees waypost-removing/ hold a directory with no marker
// beside it as the result of a crash between these two writes, which
// leftoversOf() below always treats as adoptable (no marker means nobody's).
function renameForRemoval(item, removingDir, marker) {
  mkdirSync(removingDir, { recursive: true });
  const name = `${Date.now().toString(36)}-${process.pid}-${randomHex6()}`;
  const markerPath = join(removingDir, `${name}.json`);
  const dest = join(removingDir, name);
  try {
    writeFileAtomic(markerPath, JSON.stringify({ ...marker, from: item.path, id: item.id }, null, 2) + "\n");
  } catch (e) {
    return { ok: false, reason: `could not write the removal marker: ${e.message}` };
  }
  try {
    renameSync(item.path, dest);
  } catch (e) {
    try { unlinkSync(markerPath); } catch {}
    if (e.code === "EXDEV") return { ok: false, reason: "another filesystem — the git common dir and this item are not on the same device" };
    if (e.code === "EPERM" || e.code === "EBUSY") return { ok: false, reason: "a file inside is open" };
    return { ok: false, reason: e.message };
  }
  return { ok: true, name, dest, markerPath };
}

// Spawns the detached, low-priority deleter for a batch of already-renamed
// entries sharing one waypost-removing/ directory, then rewrites each
// entry's own marker's `proc` to name the deleter — NOT the whole marker as
// a fresh selfMarker() would (started/ticks read here would describe the
// process that is about to exit, this one, a moment after spawning; nulled
// rather than left wrong, since a wrong-but-present started/ticks pair
// would make a live deleter read as a reused pid — processGone()'s own safe
// fallback for "no timing recorded" is to trust the pid alone). The
// deleter's own first action (handleInternalDelete below) writes the
// complete, authoritative marker from ITS OWN selfMarker() once it is
// actually running and can read its own process-table entry; this rewrite
// only guarantees the pid is right even if it is killed before that.
function spawnDeleter(removingDir, names, marker) {
  const child = spawn(process.execPath, [join(ROOT, "bin", "waypost"), "__waypost-delete", removingDir, ...names],
    { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
  for (const name of names) {
    const markerPath = join(removingDir, `${name}.json`);
    try {
      const rec = JSON.parse(readFileSync(markerPath, "utf8"));
      writeFileAtomic(markerPath, JSON.stringify({
        ...rec, proc: { pid: child.pid, started: null, ticks: null, comm: marker.proc.comm },
      }, null, 2) + "\n");
    } catch { /* best effort — the deleter still runs; its own rewrite corrects this */ }
  }
  return child.pid;
}

// Every waypost-removing/ entry an interrupted run or a dead deleter left
// behind — from this host and any other, since worktrees (and hosts sharing
// a checkout) share one common dir (ADR-0010). One process table and one
// boot-identity/authority read for the whole pass, not one per entry.
// Never removes anything itself — the caller hands adoptable entries to a
// FRESH deleter through the same rename-and-detach path every other
// removal already uses (here, that rename already happened; only the
// deleter is new).
function leftoversOf(common, capacity, presence) {
  const dir = join(common, REMOVING_DIR);
  let names;
  try { names = readdirSync(dir); } catch { return { adopt: [], leave: [] }; }
  const table = process.platform === "win32" ? null : presence.processTable();
  const bootNow = capacity.bootIdentity();
  const authority = capacity.authorityOnce();
  const here = hostname().split(".")[0];
  const isAlive = (marker) => capacity.slotLive(marker, { table, bootNow, authority });
  const entries = new Set(names.filter((n) => !n.endsWith(".json")));
  const adopt = [];
  const leave = [];

  for (const n of names) {
    if (!n.endsWith(".json")) continue;
    const base = n.slice(0, -5);
    const markerPath = join(dir, n);
    const entryPath = join(dir, base);
    let marker = null;
    try { marker = JSON.parse(readFileSync(markerPath, "utf8")); } catch { marker = null; }
    const hasEntry = entries.has(base);

    if (!hasEntry) {
      // A marker with no directory beside it: the entry is already gone
      // (the deleter finished removing it and only failed on the marker's
      // own unlink) — always adoptable once its owner is dead, since
      // nothing is left for a live deleter to still be working on.
      const alive = marker && marker.proc && marker.host === here && isAlive(marker);
      if (alive) leave.push({ name: base, entry: null, markerPath, marker });
      else adopt.push({ name: base, entry: null, markerPath, marker });
      continue;
    }
    if (!marker) {
      // No marker at all — renameForRemoval always writes it BEFORE the
      // rename, so a crash between those two writes is the only way to
      // reach this, and it is always adoptable.
      adopt.push({ name: base, entry: entryPath, markerPath: null, marker: null });
      continue;
    }
    if (marker.host !== here) { leave.push({ name: base, entry: entryPath, markerPath, marker }); continue; }
    if (isAlive(marker)) leave.push({ name: base, entry: entryPath, markerPath, marker });
    else adopt.push({ name: base, entry: entryPath, markerPath, marker });
  }
  // An entry with no marker file beside it at all (a deleter that failed
  // partway once unlinked it): adoptable — purgeLeftovers re-marks it, or
  // leaves and counts it when its name is not one renameForRemoval mints.
  const markers = new Set(names.filter((n) => n.endsWith(".json")).map((n) => n.slice(0, -5)));
  for (const base of entries) {
    if (!markers.has(base)) adopt.push({ name: base, entry: join(dir, base), markerPath: null, marker: null });
  }
  return { adopt, leave };
}

// Right after claiming the slot, for both the plan and --apply (the ADR:
// "Any cleanup, manual or automatic, first purges what an interrupted run
// left"). `--limit` never calls this. A marker whose own entry is already
// gone is simply unlinked here — there is nothing left to hand a new
// deleter; every adoptable entry that still holds real content is handed
// to one fresh deleter together.
function purgeLeftovers(where, { capacity, presence }) {
  if (!where || !where.common) return { handed_off: [], left: 0 };
  const { adopt, leave } = leftoversOf(where.common, capacity, presence);
  if (!adopt.length) return { handed_off: [], left: leave.length };
  const dir = join(where.common, REMOVING_DIR);
  for (const a of adopt) {
    if (!a.entry && a.markerPath) { try { unlinkSync(a.markerPath); } catch {} }
  }
  // The deleter only touches a name of the shape renameForRemoval mints that
  // carries a marker: an entry that lost its marker gets a fresh one here
  // (adopting it), and a name of any other shape is left and counted.
  const marker = selfMarker(capacity, presence);
  const handed = [];
  let left = leave.length;
  for (const a of adopt.filter((x) => x.entry)) {
    if (!REMOVING_NAME_RE.test(a.name)) { left++; continue; }
    if (!a.marker) {
      try { writeFileAtomic(join(dir, `${a.name}.json`), JSON.stringify({ ...marker, adopted: true }, null, 2) + "\n"); }
      catch { left++; continue; }
    }
    handed.push(a.name);
  }
  if (handed.length) spawnDeleter(dir, handed, marker);
  return { handed_off: handed, left };
}

// ─── the internal deleter command itself ────────────────────────────────
//
// `waypost __waypost-delete <dir> <name…>` — never invoked by a person,
// only by spawnDeleter above, detached. Dispatched first thing in main(),
// before ANY of the session/harness/heartbeat machinery every other
// command goes through: this is not a session, and none of that applies to
// a process nobody is watching.
async function handleInternalDelete(argv) {
  const [dir, ...names] = argv;
  if (!dir || basename(dir) !== REMOVING_DIR) { process.exitCode = 1; return; }
  let st;
  try { st = lstatSync(dir); } catch { process.exitCode = 1; return; }
  if (!st.isDirectory() || st.isSymbolicLink()) { process.exitCode = 1; return; }
  // Strictly validated: only a name matching the exact shape
  // renameForRemoval mints, AND carrying its own marker, is ever touched —
  // this command's own argv is not something a person is expected to type,
  // so it is held to the same standard as any other untrusted input.
  const valid = names.filter((n) => REMOVING_NAME_RE.test(n) && existsSync(join(dir, `${n}.json`)));
  if (!valid.length) return;

  try { setPriority(osConstants.priority.PRIORITY_LOW); }
  catch { /* best effort — a restricted sandbox must not block the deletion */ }

  let marker = null;
  try {
    const capacity = await import(SCRIPT_URL("capacity"));
    const presence = await import(SCRIPT_URL("presence"));
    marker = selfMarker(capacity, presence);
  } catch { /* best effort — deletion proceeds either way */ }

  for (const name of valid) {
    const entry = join(dir, name);
    const markerPath = join(dir, `${name}.json`);
    if (marker) {
      try {
        const rec = JSON.parse(readFileSync(markerPath, "utf8"));
        writeFileAtomic(markerPath, JSON.stringify({ ...rec, ...marker }, null, 2) + "\n");
      } catch { /* best effort — deletion proceeds either way */ }
    }
    try { rmSync(entry, { recursive: true, force: true, maxRetries: 3 }); }
    catch { /* best effort — a leftover here is swept by the next waypost clean */ }
    // The marker goes only with its entry: a partly removed entry keeps it,
    // so the next `waypost clean` can adopt it once this deleter is gone.
    if (!existsSync(entry)) { try { unlinkSync(markerPath); } catch {} }
  }
}

export { REMOVING_NAME_RE, randomHex6, renameForRemoval, spawnDeleter, leftoversOf, purgeLeftovers, handleInternalDelete };
