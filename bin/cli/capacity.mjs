// Waypost CLI: capacity.
import { GB, SCRIPT_URL, bootAuthority, fail, flag, opt, warnIfProbed } from "./core.mjs";
import { legacySlotsDirs, slotsDir } from "./slots.mjs";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

// ─── capacity ──────────────────────────────────────────────────────────
//
// waypost capacity [--json] — Decision 1 of the heavy-work-sized-to-the-
// machine ADR (WP-18): measure the machine's real free resources now, never
// cached, and say how many more heavy jobs it can take. Reaches
// scripts/capacity.mjs the way handleSize reaches sizes.mjs: a dynamic
// import(), in-process, no subprocess.
async function handleCapacity(args) {
  let capacity, presence;
  try {
    capacity = await import(SCRIPT_URL("capacity"));
    presence = await import(SCRIPT_URL("presence"));
  } catch (e) { fail(`capacity: ${e.message}`); }

  const releaseId = opt(args, "--release");
  if (releaseId != null) {
    await handleCapacityRelease(capacity, presence, releaseId, flag(args, "--force"), flag(args, "--json"));
    return;
  }

  const dir = slotsDir(presence);
  let holders;
  try { holders = capacity.readHolders({ dir, dirs: legacySlotsDirs(presence), authority: bootAuthority(capacity) }); }
  catch { holders = { live: [], stale: [] }; }

  let m;
  try {
    m = await capacity.measure({ holders: holders.live, env: process.env });
  } catch (e) { fail(`capacity: ${e.message}`); }
  warnIfProbed(m);

  if (flag(args, "--json")) {
    process.stdout.write(JSON.stringify({ ...m, holders_live: holders.live.map(holderSummary) }, null, 2) + "\n");
    return;
  }

  const availGb = (m.memory.available / GB).toFixed(1);
  const totalGb = (m.memory.total / GB).toFixed(1);
  process.stdout.write(`${m.cores} cores, load ${m.busy.toFixed(2)}; ${availGb} of ${totalGb} GB available (${m.probes.memory})\n`);
  if (m.can_start > 0) {
    process.stdout.write(`can start ${m.can_start} heavy job${m.can_start === 1 ? "" : "s"}\n`);
  } else {
    process.stdout.write(`can start 0 — ${m.reason}\n`);
  }
  if (holders.live.length) {
    process.stdout.write("\nholders:\n");
    for (const h of holders.live) process.stdout.write(`  ${holderLine(h)}\n`);
  }
}

function holderSummary(h) {
  return { id: h.id, session: h.session, harness: h.harness, command: h.command, since: h.started_at, host: h.host };
}

function holderLine(h) {
  return `${h.id}  ${h.session || "?"} (${h.harness || "?"})  ${h.command || ""}  since ${h.started_at}`;
}

// waypost capacity --release <id> [--force]: the recovery path when a slot
// looks stuck. slotLive() runs first — the same check readHolders() uses —
// and a record that still looks alive is refused without --force.
async function handleCapacityRelease(capacity, presence, id, force, json) {
  // An id names a record in the slot directory and nothing else: no path
  // separator and no dot, so --release can never reach a file outside it.
  if (!/^[A-Za-z0-9_-]+$/.test(String(id))) fail(`capacity --release: "${id}" is not a slot id`);
  const dir = slotsDir(presence);
  const file = [dir, ...legacySlotsDirs(presence)].map((d) => join(d, `${id}.json`)).find((p) => existsSync(p))
    || join(dir, `${id}.json`);
  if (!existsSync(file)) fail(`capacity --release: no such holder "${id}"`);
  let rec;
  try { rec = JSON.parse(readFileSync(file, "utf8")); }
  catch (e) { fail(`capacity --release: ${file}: ${e.message}`); }
  if (!rec || rec.id !== id || !rec.proc) fail(`capacity --release: ${file} is not a slot record for "${id}"`);
  const live = capacity.slotLive(rec, { authority: bootAuthority(capacity) });
  if (live && !force) {
    fail(`capacity --release: ${id} still looks alive (${rec.session || "?"} on ${rec.host}, pid ${rec.proc && rec.proc.pid}) — pass --force to release it anyway`);
  }
  try { unlinkSync(file); } catch (e) { fail(`capacity --release: ${e.message}`); }
  if (json) {
    process.stdout.write(JSON.stringify({ released: id, was_live: live, forced: live && force, record: holderSummary(rec) }, null, 2) + "\n");
  } else {
    process.stdout.write(`released ${holderLine(rec)}${live ? "  (forced, was still alive)" : ""}\n`);
  }
}

export { handleCapacity, holderSummary, holderLine, handleCapacityRelease };
