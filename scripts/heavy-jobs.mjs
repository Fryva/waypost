// waypost — heavy-jobs.mjs
// The live heavy jobs on this machine, read for whoever must not start agents
// beside one (ADR "Memory for heavy work"): `team`'s peer factories, `brief`,
// `status`. Read only; the slot table belongs to bin/cli/slots.mjs.

import { join } from "node:path";
import { readHolders } from "./capacity.mjs";
import { processTable, hostSlug } from "./presence.mjs";
import { machineStateDir, legacyStateDirs } from "./lib.mjs";

// The live holders of this machine's slot table, minus the slots this
// process itself runs inside: `waypost run --heavy` exports its slot id to
// the job as WAYPOST_HEAVY_SLOT (comma-joined when nested), and on POSIX a
// holder whose wrapper pid is one of our ancestors is ours too — that also
// covers a child whose environment dropped the variable (the test suite's
// own children do). A team run as a heavy job, or a brief inside `npm test`,
// is the job, not something beside it. Never throws: an unreadable table
// reads as "none", the same advisory stance as presence.
export function liveHeavyJobs({ env = process.env, pid = process.pid, home, ...probes } = {}) {
  try {
    const host = hostSlug();
    const dirs = [machineStateDir(home ? { home } : {}), ...legacyStateDirs(home ? { home } : {})].map((d) => join(d, `slots.${host}`));
    const platform = probes.platform ?? process.platform;
    // The process table only once some record is live: readHolders() reads
    // none at all for an empty slot table, and that is the common case.
    let table = probes.table;
    const { live } = readHolders({ dir: dirs[0], dirs: dirs.slice(1), ...probes, platform });
    if (!live.length) return [];
    if (table === undefined && platform !== "win32") table = processTable();
    const own = new Set(String(env.WAYPOST_HEAVY_SLOT || "").split(",").filter(Boolean));
    const ancestors = new Set([pid]);
    for (let p = pid, n = 0; table && p > 1 && n < 256; n++) {
      const row = table.get(p);
      if (!row) break;
      ancestors.add(row.ppid);
      p = row.ppid;
    }
    // The wrapper or, when the wrapper was killed and the job lives on, the job.
    return live.filter((h) => !own.has(h.id) && !ancestors.has(h.proc && h.proc.pid) && !ancestors.has(h.job && h.job.pid));
  } catch { return []; }
}

// One holder in a sentence: what runs, on which machine, since when. The
// command is cut at 80 characters: this line enters the standing context
// (`brief`), and a test suite's command line runs to kilobytes. The whole
// command stays in `waypost capacity` and in the JSON.
const COMMAND_CHARS = 80;
export function heavyJobLine(h) {
  const c = String(h.command || "?").replace(/\s+/g, " ");
  const cmd = c.length > COMMAND_CHARS ? c.slice(0, COMMAND_CHARS - 1) + "…" : c;
  return `\`${cmd}\` on ${h.host || "?"} since ${h.started_at || "?"}`;
}
