const GB = 1024 ** 3;

// ─── canStart ────────────────────────────────────────────────────────────
//
// The owner's defaults (Owner's decisions, item 1): one slot per four cores,
// at least one; a job's share is a quarter of the cores (at least one) and
// the smaller of 2 GiB and half the memory (ADR "Memory for heavy work: half
// the memory up to 2 GB, …": a quarter OOM-killed a 3.8 GB VM's harness).
// WAYPOST_HEAVY_MAX can only LOWER the slot count.
export const CORES_PER_SLOT = 4;
export const JOB_CORE_DIVISOR = 4;
export const JOB_MEMORY_CAP = 2 * 1024 ** 3; // 2 GiB
export const JOB_MEMORY_DIVISOR = 2;

function parseHeavyMax(raw) {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// (d) disk (disk-space ADR): a system reserve, min(30 GiB, 15 %), plus one
// share per job, min(20 GiB, 20 %), one per live holder too; `floor`
// ({reserve, share} bytes) is the owner's setting instead. The env only
// raises the share. `disk` null binds nothing; unreadable: cannot start.
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

export function canStart({ cores, busy, available, total, holders = 0, max = null, disk = null, diskRaise = null, floor = null } = {}) {
  let slots = Math.max(1, Math.floor(cores / CORES_PER_SLOT));
  const requestedMax = parseHeavyMax(max);
  if (requestedMax != null && requestedMax < slots) slots = requestedMax;

  const jobCores = Math.max(1, cores / JOB_CORE_DIVISOR);
  const jobMemory = Math.min(JOB_MEMORY_CAP, total / JOB_MEMORY_DIVISOR);

  // An unknown figure (NaN busy or memory, a zero total) counts as "cannot
  // start": the safe answer, and never a NaN in can_start.
  const bySlots = Math.max(0, slots - holders);
  const idleCores = Number.isFinite(busy) ? Math.max(0, cores - busy) : 0;
  const byCores = Math.max(0, Math.floor(idleCores / jobCores));
  // Each live holder reserves one share: a job admitted seconds ago has not
  // allocated its memory yet, and the next claim would otherwise count it as
  // free. Once it has, its share is counted twice — strict on purpose.
  const memoryKnown = jobMemory > 0 && Number.isFinite(available);
  const reserved = holders * jobMemory;
  const byMemory = memoryKnown ? Math.max(0, Math.floor((available - reserved) / jobMemory)) : 0;

  const jobDisk = !disk ? null : diskShare(disk.total, diskRaise, floor ? floor.share : undefined);
  const sysDisk = !disk ? null : floor ? floor.reserve : systemReserve(disk.total);
  const diskKnown = !disk || (jobDisk > 0 && Number.isFinite(jobDisk + sysDisk + disk.free));
  const byDisk = !disk ? Infinity
    : diskKnown ? Math.max(0, Math.floor((disk.free - sysDisk - holders * jobDisk) / jobDisk)) : 0;

  const started = Math.max(0, Math.min(bySlots, byCores, byMemory, byDisk));

  // Named in the ADR's own order (a), (b), (c) — the first limit that binds,
  // in plain words, so an agent can report why without another round trip.
  let reason = null;
  if (started === 0) {
    if (bySlots <= 0) {
      reason = `slots: ${holders} of ${slots} heavy job slot(s) already held`;
    } else if (byCores <= 0) {
      reason = `cpu: ${idleCores.toFixed(1)} idle core(s) available, a heavy job needs ${jobCores.toFixed(1)}`;
    } else if (!memoryKnown) {
      reason = "memory: available or total memory unknown";
    } else if (byMemory <= 0) {
      const held = reserved > 0 ? ` (${(reserved / GB).toFixed(1)} GB reserved for ${holders} running heavy job(s))` : "";
      reason = `memory: ${(available / GB).toFixed(1)} GB available${held}, a heavy job needs ${(jobMemory / GB).toFixed(1)} GB`;
    } else if (!diskKnown) {
      reason = "disk: free space unknown";
    } else {
      const need = sysDisk + (holders + 1) * jobDisk;
      const held = holders > 0 ? ` + ${(holders * jobDisk / GB).toFixed(1)} GB for ${holders} running heavy job(s)` : "";
      reason = `disk: ${(disk.free / GB).toFixed(1)} GB free, a heavy job needs ${(need / GB).toFixed(1)} GB free (${(sysDisk / GB).toFixed(1)} GB system reserve${held} + ${(jobDisk / GB).toFixed(1)} GB for this job) — waypost clean, waypost size --global`;
    }
  }

  return { slots, job_cores: jobCores, job_memory: jobMemory, job_disk: jobDisk, system_disk: sysDisk, can_start: started, reason };
}

