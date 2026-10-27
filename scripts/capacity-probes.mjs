import { availableParallelism, loadavg, cpus, totalmem, freemem, uptime } from "node:os";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// ─── default probes ─────────────────────────────────────────────────────

function defaultOs() {
  return { availableParallelism, loadavg, cpus, totalmem, freemem, uptime };
}

function defaultReadFile(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

// A spawnSync with no shell, stdin ignored, and a 2-second timeout — a sysctl
// or vm_stat call that hangs must never hang capacity measurement with it.
// Returns stdout on a clean exit, null on any failure (missing binary,
// non-zero exit, timeout, signal).
function defaultRun(cmd, args, timeoutMs = 2000) {
  let r;
  try {
    r = spawnSync(cmd, args, {
      shell: false,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
      timeout: timeoutMs,
    });
  } catch {
    return null;
  }
  if (!r || r.error || r.status !== 0) return null;
  return r.stdout;
}

function defaultWait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { defaultOs, defaultReadFile, defaultRun, defaultWait };
