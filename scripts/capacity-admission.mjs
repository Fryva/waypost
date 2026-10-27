const GB = 1024 ** 3;

// ─── canStart ────────────────────────────────────────────────────────────
//
// The owner's defaults (Owner's decisions, item 1): one slot per four cores,
// at least one; a job's share is a quarter of the cores (at least one) and
// the smaller of 2 GiB and half the memory (ADR "Memory for heavy work: half
// the memory up to 2 GB, …": a quarter was a 0.95 GB share on a 3.8 GB VM,
// where a Rust test build beside background agents was OOM-killed along with
// the harness). WAYPOST_HEAVY_MAX can only LOWER
// the slot count — a bigger or invalid value changes nothing.
export const CORES_PER_SLOT = 4;
export const JOB_CORE_DIVISOR = 4;
export const JOB_MEMORY_CAP = 2 * 1024 ** 3; // 2 GiB
export const JOB_MEMORY_DIVISOR = 2;

function parseHeavyMax(raw) {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function canStart({ cores, busy, available, total, holders = 0, max = null } = {}) {
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

  const started = Math.max(0, Math.min(bySlots, byCores, byMemory));

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
    } else {
      const held = reserved > 0 ? ` (${(reserved / GB).toFixed(1)} GB reserved for ${holders} running heavy job(s))` : "";
      reason = `memory: ${(available / GB).toFixed(1)} GB available${held}, a heavy job needs ${(jobMemory / GB).toFixed(1)} GB`;
    }
  }

  return { slots, job_cores: jobCores, job_memory: jobMemory, can_start: started, reason };
}

