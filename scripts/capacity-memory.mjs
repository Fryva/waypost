import { defaultOs, defaultReadFile, defaultRun } from "./capacity-probes.mjs";

// ─── memory ──────────────────────────────────────────────────────────────
//
// Each OS's own measure of memory available to NEW work, not "free" in the
// naive sense — macOS and Linux both keep reclaimable memory as cache, which
// os.freemem() alone reports as unavailable.
const CGROUP_V2_MEM_MAX = "/sys/fs/cgroup/memory.max";
const CGROUP_V2_MEM_CURRENT = "/sys/fs/cgroup/memory.current";
const CGROUP_V1_MEM_LIMIT = "/sys/fs/cgroup/memory/memory.limit_in_bytes";
const CGROUP_V1_MEM_USAGE = "/sys/fs/cgroup/memory/memory.usage_in_bytes";
const CGROUP_V2_MEM_STAT = "/sys/fs/cgroup/memory.stat";
const CGROUP_V1_MEM_STAT = "/sys/fs/cgroup/memory/memory.stat";

// A cgroup's usage counts its page cache, which the kernel reclaims before it
// ever kills. Inactive file pages are subtracted, as the kubelet and docker
// compute a working set, so a container full of clone and install cache is
// not refused forever while nothing allocates to make the kernel drop it.
function inactiveFile(readFile, path, key) {
  const stat = readFile(path);
  const m = stat != null ? stat.match(new RegExp(`^${key} (\\d+)$`, "m")) : null;
  return m ? Number(m[1]) : 0;
}

// Memory available to new work on macOS, chosen by the kernel's own pressure
// level (kern.memorystatus_vm_pressure_level: 1 normal, 2 warning, 4
// critical — ADR "Memory for heavy work: half the memory up to 2 GB, …"):
// - normal: vm_stat's free + inactive + speculative + purgeable pages. With
//   no pressure, inactive memory is what the kernel gives up first.
// - warning: free + file-backed + purgeable — what a job can take without
//   squeezing anyone already running. Anonymous pages (every live process's
//   own memory, idle agents included), wired pages and the compressor's are
//   not available. This is XNU's own definition of available pages off macOS,
//   and Activity Monitor's Free + Cached Files.
// - critical: 0, whatever the pages say; the machine is already thrashing.
// kern.memorystatus_level, the first probe before, counts resident anonymous
// pages as available: 8.0 GB "available" on the owner's Mac against 2.7 GB by
// the warning formula, with 8 of 9 GB of swap in use.
function parseVmStat(text, pressured) {
  const pageMatch = text.match(/page size of (\d+) bytes/);
  if (!pageMatch) return null;
  const pageSize = Number(pageMatch[1]);
  const pages = (label) => {
    const m = text.match(new RegExp(`${label}:\\s*(\\d+)\\.`));
    return m ? Number(m[1]) : null;
  };
  const labels = pressured
    ? ["Pages free", "File-backed pages", "Pages purgeable"]
    : ["Pages free", "Pages inactive", "Pages speculative", "Pages purgeable"];
  const counts = labels.map(pages);
  if (counts.some((v) => v == null)) return null;
  return counts.reduce((sum, n) => sum + n, 0) * pageSize;
}

function darwinPressure(run) {
  const out = run("sysctl", ["-n", "kern.memorystatus_vm_pressure_level"]);
  const level = out != null ? Number(out.trim()) : NaN;
  return Number.isFinite(level) ? level : null;
}

// An unreadable pressure level counts as warning: the stricter formula.
function darwinMemory(total, os, run, pressure) {
  const pressured = pressure !== 1;
  const vmStatOut = run("vm_stat", []);
  const available = vmStatOut != null ? parseVmStat(vmStatOut, pressured) : null;
  if (available != null) return { available, total, probe: "vm_stat" };
  // vm_stat failed or was refused (a sandbox). kern.memorystatus_level counts
  // resident anonymous memory as available, so it only bounds from above.
  const sysctlOut = run("sysctl", ["-n", "kern.memorystatus_level"]);
  const level = sysctlOut != null ? Number(sysctlOut.trim()) : NaN;
  if (Number.isFinite(level) && level >= 0) {
    return { available: total * (level / 100), total, probe: "kern.memorystatus_level (upper bound)" };
  }
  return { available: os.freemem(), total, probe: "os.freemem() (lower bound)" };
}

export function readMemory({ platform = process.platform, os = defaultOs(), readFile = defaultReadFile, run = defaultRun } = {}) {
  const total = os.totalmem();

  if (platform === "darwin") {
    const pressure = darwinPressure(run);
    const result = darwinMemory(total, os, run, pressure);
    if (pressure != null && pressure >= 4) return { available: 0, total, probe: `${result.probe}, memory pressure critical` };
    if (pressure === 2) return { ...result, probe: `${result.probe}, memory pressure warning` };
    return result;
  }

  if (platform === "linux") {
    const meminfo = readFile("/proc/meminfo");
    const match = meminfo != null ? meminfo.match(/^MemAvailable:\s*(\d+)\s*kB$/m) : null;
    if (!match) return { available: os.freemem(), total, probe: "os.freemem() (lower bound)" };

    let available = Number(match[1]) * 1024;
    let probe = "MemAvailable";

    // The box we are actually in — what a job's share is computed from, since
    // a cgroup limit is the whole machine as far as anything inside it is
    // concerned. Without this a job inside a 256 MB container was told it
    // needed 1.0 GB, a quarter of the host's 3.8 GB, and nothing could ever
    // start (WP-18, measured on the Linux VM). `total` itself stays the host's
    // own figure below, because that is what decides whether a v1 limit is the
    // "unlimited" sentinel.
    let box = total;

    // A cgroup is exclusively v1 or v2 on a real system, so v1 is checked
    // only when v2's file is absent — not merely when v2 reports "max".
    const v2max = readFile(CGROUP_V2_MEM_MAX);
    if (v2max != null) {
      const v2current = readFile(CGROUP_V2_MEM_CURRENT);
      if (v2max.trim() !== "max" && v2current != null) {
        const max = Number(v2max.trim());
        const current = Number(v2current.trim()) - inactiveFile(readFile, CGROUP_V2_MEM_STAT, "inactive_file");
        if (Number.isFinite(max) && Number.isFinite(current)) {
          const cap = Math.max(0, max - current);
          if (cap < available) { available = cap; probe = "cgroup v2 memory.max"; }
          if (max < box) box = max;
        }
      }
    } else {
      const limitRaw = readFile(CGROUP_V1_MEM_LIMIT);
      const usageRaw = readFile(CGROUP_V1_MEM_USAGE);
      if (limitRaw != null && usageRaw != null) {
        const limit = Number(limitRaw.trim());
        const usage = Number(usageRaw.trim()) - inactiveFile(readFile, CGROUP_V1_MEM_STAT, "total_inactive_file");
        // A v1 limit above total memory means unlimited (the conventional
        // "no cgroup limit" sentinel on that side, unlike v2's literal "max").
        if (Number.isFinite(limit) && Number.isFinite(usage) && limit <= total) {
          const cap = Math.max(0, limit - usage);
          if (cap < available) { available = cap; probe = "cgroup v1 memory.limit_in_bytes"; }
          if (limit < box) box = limit;
        }
      }
    }
    // `probe` names where the AVAILABLE figure came from, which is not always
    // where the total came from: a limit can bound the box while the host's own
    // MemAvailable is the smaller of the two and still binds.
    return { available, total: box, probe };
  }

  if (platform === "win32") return { available: os.freemem(), total, probe: "os.freemem()" };

  return { available: os.freemem(), total, probe: "os.freemem() (lower bound)" };
}

