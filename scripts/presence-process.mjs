import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { hostname, platform } from "node:os";
import { spawnSync } from "node:child_process";

// ─── The harness process, on this host ─────────────────────────────────
//
// ADR-0007 rules pid liveness out ACROSS hosts: another machine's pid means
// nothing here. On the same host it is exact, and it answers the one question
// the counter cannot: idle, or gone? A session's record used to wait 24h for
// --prune after its harness had exited. So a beat records the harness
// process — the nearest ancestor of the CLI that is not a shell or a sandbox
// wrapper (the per-command shell a harness spawns dies with the command; the
// harness itself lives as long as the session) — with its start time, so a
// reused pid is not mistaken for the original. A reader on the same host looks
// the pid up in the process table: absent, or present with another start
// time, means the session is gone whatever its counter says. No table (Windows,
// no `ps`) and no record mean no opinion: the counter rules stay.
const SHELLS = /(^|\/)-?(sh|bash|zsh|fish|dash|ksh|tcsh|csh|nu|pwsh|powershell|sandbox-exec|bwrap|sudo|env|script|login)$/;

export function processTable() {
  if (platform() === "win32") return null;
  let r;
  // `lstart` is the one field of this row whose FORMAT is locale-defined: ps
  // renders it through LC_TIME, so on a host with any other time locale it comes
  // back as "вторник, 15 сентября 2026 г. 14:51:13" and the regex below matches
  // nothing. Every row then fails, the table comes back empty, and processTable()
  // returns null — which silently switches off presence liveness, harness
  // attribution, the consent gate, cleanup's in-use signal and the detached
  // deleter's pid-reuse guard, with `waypost doctor` still reporting a healthy
  // vault. The parser must never learn a language, so the child is asked for the
  // C spelling instead: LC_ALL is what ps consults first, and setting it on the
  // child's env object alone leaves the caller's own locale untouched. The
  // alternatives (-o start=, -o etimes=) are not localized but are spelled
  // differently by macOS and Linux ps, and the C format is the one
  // processGone()'s string comparison already assumes.
  try {
    r = spawnSync("ps", ["axo", "pid=,ppid=,lstart=,comm="], {
      encoding: "utf8", timeout: 5000, env: { ...process.env, LC_ALL: "C" },
    });
  } catch { return null; }
  if (!r || r.status !== 0 || !r.stdout) return null;
  const table = new Map();
  for (const line of r.stdout.split("\n")) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\w{3}\s+\w{3}\s+\d+\s+[\d:]+\s+\d{4})\s+(.*)$/);
    if (m) {
      const pid = Number(m[1]);
      // `ticks` beside `started` — the same row, one snapshot, and injectable
      // with the rest of the table. Reading /proc for every pid costs about a
      // third of the `ps` spawn already paid above (4 ms for 266 processes on
      // the Linux VM), and null everywhere but Linux.
      table.set(pid, { pid, ppid: Number(m[2]), started: m[3].replace(/\s+/g, " "), ticks: startTicks(pid), comm: m[4].trim(), ...(platform() === "linux" ? { argv0: argv0Of(pid) } : {}) });
    }
  }
  return table.size ? table : null;
}

// `table` and `ppid` are injectable so the walk can be tested against a chain
// nobody can produce for real: under `node --test` the nearest non-shell
// ancestor of the test process is `node`, which is in no registry entry, so
// every real-table assertion would resolve to "unknown" and pass for the wrong
// reason. gateCheck already takes both, and took them first.
export function harnessProcess(table, ppid = process.ppid) {
  // Resolved once by bin/waypost's main(), where process.ppid is the shell or
  // harness, and pinned in WAYPOST_PROC for the scripts it spawns — whose own
  // parent is bin/waypost itself, gone the moment the command ends (G-1).
  if (process.env.WAYPOST_PROC) {
    try { const p = JSON.parse(process.env.WAYPOST_PROC); if (p && p.pid) return p; } catch { /* fall through */ }
  }
  if (table === undefined) table = processTable();
  if (!table) return null;
  let pid = ppid;
  for (let depth = 0; depth < 32 && pid > 1; depth++) {
    const p = table.get(pid);
    if (!p) return null;
    if (!SHELLS.test(p.comm)) return { pid: p.pid, started: p.started, ticks: p.ticks ?? null, comm: basename(p.comm), ...(p.argv0 ? { argv0: p.argv0 } : {}) };
    pid = p.ppid;
  }
  return null;
}

// The one part of a process's identity a sleeping machine cannot move: its
// start time in clock ticks since boot, /proc/<pid>/stat field 22. A wall-clock
// start time (`ps -o lstart`) is btime plus this, and btime is the machine's
// own estimate of when it booted — re-estimated after time the kernel did not
// count, which is exactly what a host suspending a VM does. Measured on the
// Linux VM (WP-18): 368 s of suspend moved every live process's `lstart` by
// 368 s while this number did not move at all. The comm field can hold spaces
// and parentheses, so fields are counted from the last ')'.
//
// Never converted to seconds: USER_HZ does not matter to an equality test, and
// dividing by it is exactly how this number would be made to drift again.
//
// Linux only. macOS records a real start timestamp per process, which a sleep
// does not touch, and Windows never reaches this path.
// The path a Linux process was started by (argv[0], so a symlink keeps its own name).
// `ps -o comm=` reads /proc/<pid>/comm, the main thread's name, which a runtime may
// rename (Node 24 on Linux does), so a harness binary would lose its name there.
export function argv0Of(pid) {
  if (platform() !== "linux") return null;
  try { const first = readFileSync(`/proc/${Number(pid)}/cmdline`, "utf8").split("\0")[0]; return first ? basename(first) : null; } catch { return null; }
}
export function startTicks(pid) {
  if (platform() !== "linux") return null;
  let stat;
  try { stat = readFileSync(`/proc/${Number(pid)}/stat`, "utf8"); } catch { return null; }
  const close = stat.lastIndexOf(")");
  if (close === -1) return null;
  const ticks = Number(stat.slice(close + 2).split(" ")[19]);
  return Number.isFinite(ticks) ? ticks : null;
}

// true: gone; false: alive; null: not decidable here (another host, no
// process recorded, no process table).
export function processGone(rec, table) {
  const proc = rec && rec.proc;
  if (!proc || !proc.pid || rec.host !== hostname().split(".")[0]) return null;
  if (table === undefined) table = processTable();
  if (!table) return null;
  const p = table.get(Number(proc.pid));
  if (!p) return true;
  // Where both sides have a tick count, it decides: it is the same number
  // before and after a sleep, while the two wall-clock strings would differ by
  // the whole suspend and read every live process as a reused pid. A record
  // written before this field existed still has the string, and so does macOS.
  if (proc.ticks != null && p.ticks != null) return proc.ticks !== p.ticks;
  // No tick count on one side or the other — a record written before the field
  // existed, a platform without /proc, or a /proc this process may not read
  // (hidepid, a foreign pid namespace). The string is then the only evidence
  // there is, and it is the evidence a sleeping machine moves.
  return Boolean(proc.started && p.started !== proc.started);
}

