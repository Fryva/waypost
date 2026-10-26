import { writeFileSync, renameSync, unlinkSync, readdirSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { hostname } from "node:os";

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

