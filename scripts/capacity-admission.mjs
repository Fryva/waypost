const GB = 1024 ** 3;

// canStart. A slot per 4 cores (at least 1); a job takes a quarter of the
// cores (at least 1) and min(2 GiB, half the memory) (ADR "Memory for heavy
// work"). WAYPOST_HEAVY_MAX only LOWERS the slots.
export const CORES_PER_SLOT = 4;
export const JOB_CORE_DIVISOR = 4;
export const JOB_MEMORY_CAP = 2 * 1024 ** 3; // 2 GiB
export const JOB_MEMORY_DIVISOR = 2;

function parseHeavyMax(raw) {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Disk (disk-space ADR), per filesystem: reserve min(30 GiB, 15 %) + a share
// per job and holder, min(20 GiB, 20 %). The owner's `floor` and the env
// raise apply as written on the first (working dir), capped elsewhere.
export const JOB_DISK_CAP = 20 * GB;
export const JOB_DISK_DIVISOR = 5;
export const SYSTEM_DISK_CAP = 30 * GB;
export const SYSTEM_DISK_FRACTION = 0.15;

export function systemReserve(total) {
  return Math.min(SYSTEM_DISK_CAP, total * SYSTEM_DISK_FRACTION);
}

export function diskShare(total, raise = null, base = Math.min(JOB_DISK_CAP, total / JOB_DISK_DIVISOR)) {
  const n = raise == null || raise === "" ? NaN : Number(raise) * GB;
  return Number.isFinite(n) && n > base ? n : base;
}

export function canStart({ cores, busy, available, total, holders = 0, max = null, disk = null, disks = null, diskRaise = null, floor = null } = {}) {
  let slots = Math.max(1, Math.floor(cores / CORES_PER_SLOT));
  const requestedMax = parseHeavyMax(max);
  if (requestedMax != null && requestedMax < slots) slots = requestedMax;

  const jobCores = Math.max(1, cores / JOB_CORE_DIVISOR);
  const jobMemory = Math.min(JOB_MEMORY_CAP, total / JOB_MEMORY_DIVISOR);

  // Unknown is "cannot start". A holder reserves its share: strict on purpose.
  const bySlots = Math.max(0, slots - holders);
  const idleCores = Number.isFinite(busy) ? Math.max(0, cores - busy) : 0;
  const byCores = Math.max(0, Math.floor(idleCores / jobCores));
  const memoryKnown = jobMemory > 0 && Number.isFinite(available);
  const reserved = holders * jobMemory;
  const byMemory = memoryKnown ? Math.max(0, Math.floor((available - reserved) / jobMemory)) : 0;

  // Tightest: the smallest margin.
  const list = (disks?.length ? disks : disk ? [disk] : []).filter((d, i) => !i || d.total > 0 && d.free >= 0).map((d, i) => {
    const cap = (v, f) => i === 0 ? v : Math.min(v, d.total * f);
    const share = cap(diskShare(d.total, diskRaise, floor?.share), 1 / JOB_DISK_DIVISOR);
    const reserve = floor ? cap(floor.reserve, SYSTEM_DISK_FRACTION) : systemReserve(d.total);
    const known = share > 0 && Number.isFinite(share + reserve + d.free);
    return { role: i ? "filesystem" : "working directory", ...d, primary: i === 0, share, reserve, known,
      by: known ? Math.max(0, Math.floor((d.free - reserve - holders * share) / share)) : 0,
      margin: known ? d.free - reserve - (holders + 1) * share : -Infinity };
  });
  const primary = list[0] || null, diskKnown = !primary || primary.known;
  const tight = !diskKnown ? primary : list.reduce((a, b) => b.margin < a.margin ? b : a, primary);
  const byDisk = primary ? Math.min(...list.map((d) => d.by)) : Infinity;
  const jobDisk = tight ? tight.share : null, sysDisk = tight ? tight.reserve : null;

  const started = Math.max(0, Math.min(bySlots, byCores, byMemory, byDisk));

  let reason = null; const g = (v) => (v / GB).toFixed(1);
  if (started === 0) {
    if (bySlots <= 0) {
      reason = `slots: ${holders} of ${slots} heavy job slot(s) already held`;
    } else if (byCores <= 0) {
      reason = `cpu: ${idleCores.toFixed(1)} idle core(s) available, a heavy job needs ${jobCores.toFixed(1)}`;
    } else if (!memoryKnown) {
      reason = "memory: available or total memory unknown";
    } else if (byMemory <= 0) {
      const held = reserved > 0 ? ` (${g(reserved)} GB reserved for ${holders} running heavy job(s))` : "";
      reason = `memory: ${g(available)} GB available${held}, a heavy job needs ${g(jobMemory)} GB`;
    } else if (!diskKnown) {
      reason = "disk: free space unknown";
    } else {
      const need = sysDisk + (holders + 1) * jobDisk;
      const held = holders > 0 ? ` + ${g(holders * jobDisk)} GB for ${holders} running heavy job(s)` : "";
      reason = `disk: ${g(tight.free)} GB free${tight.path ? ` at ${tight.path} (${tight.role})` : ""}, a heavy job needs ${g(need)} GB free (${g(sysDisk)} GB system reserve${held} + ${g(jobDisk)} GB for this job) — ${tight.primary ? "waypost clean, " : ""}waypost size --global`;
    }
  }

  const strip = ({ known, by, margin, ...d }) => d;
  return { slots, job_cores: jobCores, job_memory: jobMemory, job_disk: jobDisk, system_disk: sysDisk, can_start: started, reason,
    disk_tight: tight && strip(tight), disks: list.map(strip), disk_primary_short: Boolean(primary?.known && primary.by <= 0) };
}
