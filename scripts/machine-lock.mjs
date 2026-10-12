// waypost — machine-lock.mjs: the machine-wide mkdir lock (owner.json inside),
// shared by the heavy-slot table in bin/waypost and the run budget. Stolen from
// a dead owner or after five minutes, so a crash never wedges it. Callers pass
// the presence and capacity modules (they are loaded lazily by the CLI).

import { mkdirSync, writeFileSync, readFileSync, statSync, rmSync } from "node:fs";
import { join } from "node:path";
import { hostname, uptime as osUptime } from "node:os";

const LOCK_STALE_MS = 5 * 60 * 1000;
const LOCK_RETRY_BUDGET_MS = 2000;
const LOCK_RETRY_DELAY_MS = 250;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Is the lock's owner gone? The same evidence slotLive() uses for a slot
// record: the boot identity first, then on POSIX the process table and start
// time (a reused pid is not mistaken for the owner), on win32 signal-0. The
// 24-hour part is left out, since a five-minute mtime already bounds a lock.
export function lockOwnerGone(owner, presence, table, capacity) {
  if (!owner || !owner.pid) return true;
  // An owner from an earlier boot is gone whatever its pid names now, so a
  // pid reused after an unclean restart never holds the lock for five minutes.
  // On the epoch path that identity drifts across a host suspend, and here
  // being wrong breaks a live claimant's lock — two processes in the critical
  // section — so a mismatch has to be confirmed before it counts as death.
  if (owner.boot && capacity) {
    const bootNow = capacity.bootIdentity();
    if (!capacity.sameBoot(owner.boot, bootNow)) {
      const drifting = owner.boot.kind === "epoch" && bootNow.kind === "epoch";
      if (!drifting) return true;
      // uptime settles "another boot" for free; nothing here may spawn, so an
      // owner uptime cannot settle is KEPT, and the lock's own five-minute
      // mtime cap is what bounds that. Breaking a live claimant's lock puts
      // two processes in the critical section: the worst thing this can get
      // wrong (WP-18, second and third amendments).
      if (capacity.uptimeSaysOtherBoot(owner, osUptime())) return true;
    }
  }
  if (process.platform === "win32") {
    try { process.kill(owner.pid, 0); return false; }
    catch (e) { return e.code === "ESRCH"; }
  }
  const rec = { host: hostname().split(".")[0], proc: { pid: owner.pid, started: owner.started || null, ticks: owner.ticks ?? null } };
  const gone = presence.processGone(rec, table);
  if (gone !== null) return gone;
  try { process.kill(owner.pid, 0); return false; }
  catch (e) { return e.code === "ESRCH"; }
}

// Broken only when its owner is dead, or the lock itself is older than five
// minutes — either reason alone is enough to reclaim it. A briefly unreadable
// owner.json (the sliver of time between the owner's own mkdirSync and its
// writeFileSync) is NOT evidence of death: treating it as such let a second
// claimant "break" a lock its rightful owner had just created, defeating
// mutual exclusion (caught by the stress test). Only a successfully read and
// confirmed-dead owner, or the five-minute mtime cap, may break it early.
function breakStaleLock(lockDir, presence, table, capacity) {
  let st;
  try { st = statSync(lockDir); } catch { return true; } // already gone
  if (Date.now() - st.mtimeMs > LOCK_STALE_MS) {
    try { rmSync(lockDir, { recursive: true, force: true }); } catch { return false; }
    return true;
  }
  let owner = null;
  try { owner = JSON.parse(readFileSync(join(lockDir, "owner.json"), "utf8")); } catch {}
  if (!owner || !lockOwnerGone(owner, presence, table, capacity)) return false;
  try { rmSync(lockDir, { recursive: true, force: true }); } catch { return false; }
  return true;
}

// mkdirSync is atomic on every OS: EEXIST means someone else holds it right
// now. Retried a few times within about 2 seconds, breaking it along the way
// per breakStaleLock(); null when the budget runs out (report busy).
export async function acquireLock(dir, presence, capacity) {
  const lockDir = join(dir, ".lock");
  const deadline = Date.now() + LOCK_RETRY_BUDGET_MS;
  for (;;) {
    try {
      mkdirSync(lockDir);
      const table = process.platform === "win32" ? null : presence.processTable();
      const self = table ? table.get(process.pid) : null;
      writeFileSync(join(lockDir, "owner.json"),
        JSON.stringify({
          pid: process.pid, started: self ? self.started : null, ticks: presence.startTicks(process.pid),
          boot: capacity ? capacity.bootIdentity() : null,
          // uptime and nothing that spawns: this runs INSIDE the lock, where
          // the other claimants are waiting on a two-second budget.
          uptime: osUptime(),
        }) + "\n", "utf8");
      return lockDir;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      const table = process.platform === "win32" ? null : presence.processTable();
      if (breakStaleLock(lockDir, presence, table, capacity)) continue; // reclaimed — retry the mkdir at once
      if (Date.now() >= deadline) return null;
      await delay(LOCK_RETRY_DELAY_MS);
    }
  }
}

export function releaseLock(lockDir) {
  try { rmSync(lockDir, { recursive: true, force: true }); } catch {}
}
