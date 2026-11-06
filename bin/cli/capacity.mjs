// Waypost CLI: capacity.
import { GB, ROOT, SCRIPT_URL, bootAuthority, fail, flag, opt, projectRoot, warnIfProbed } from "./core.mjs";
import { askYesNo, ensureMachineStateDir, machineStateDir, readDiskFloor, writeFileAtomic } from "../../scripts/lib.mjs";
import { legacySlotsDirs, slotsDir } from "./slots.mjs";
import { appendCleanLog } from "./remove.mjs";
import { peerLine, peersDir, readPeers } from "../../scripts/heavy-jobs.mjs";
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

  const diskArg = args.findIndex((a) => a === "--disk" || a.startsWith("--disk="));
  if (diskArg >= 0) {
    const a = args[diskArg], v = a.startsWith("--disk=") ? a.slice(7) : args[diskArg + 1];
    await handleCapacityDisk(v != null && v !== "" && !v.startsWith("--") ? v : null, presence, flag(args, "--json"));
    return;
  }

  const releaseId = opt(args, "--release");
  if (releaseId != null) {
    await handleCapacityRelease(capacity, presence, releaseId, flag(args, "--force"), flag(args, "--json"));
    return;
  }

  const dir = slotsDir(presence);
  let holders;
  try { holders = capacity.readHolders({ dir, dirs: legacySlotsDirs(presence), authority: bootAuthority(capacity) }); }
  catch { holders = { live: [], stale: [] }; }

  const peers = readPeers({ authority: bootAuthority(capacity) }).live;

  let m;
  try {
    m = await capacity.measure({ holders: holders.live, env: process.env, floor: readDiskFloor({ host: presence.hostSlug() }) });
  } catch (e) { fail(`capacity: ${e.message}`); }
  warnIfProbed(m);

  if (flag(args, "--json")) {
    process.stdout.write(JSON.stringify({ ...m, holders_live: holders.live.map(holderSummary), agents_live: peers.map((p) => ({ ...holderSummary(p), pid: p.proc && p.proc.pid })) }, null, 2) + "\n");
    return;
  }

  const availGb = (m.memory.available / GB).toFixed(1);
  const totalGb = (m.memory.total / GB).toFixed(1);
  const disk = m.disk_check === "off" ? "; disk not checked (WAYPOST_DISK_CHECK=off)"
    : m.disk && Number.isFinite(m.disk.free)
      ? `; disk ${(m.disk.free / GB).toFixed(1)} of ${(m.disk.total / GB).toFixed(1)} GB free at ${m.disk.path}, ${(m.disk.reserve / GB).toFixed(1)} GB system reserve + ${(m.disk.share / GB).toFixed(1)} GB per job${m.disk.owner_floor ? " (owner's setting)" : ""}`
      : "";
  process.stdout.write(`${m.cores} cores, load ${m.busy.toFixed(2)}; ${availGb} of ${totalGb} GB available (${m.probes.memory})${disk}\n`);
  if (m.can_start > 0) {
    process.stdout.write(`can start ${m.can_start} heavy job${m.can_start === 1 ? "" : "s"}\n`);
  } else {
    process.stdout.write(`can start 0 — ${m.reason}\n`);
  }
  if (holders.live.length) {
    process.stdout.write("\nholders:\n");
    for (const h of holders.live) process.stdout.write(`  ${holderLine(h)}\n`);
  }
  // The other order of "no agents beside a heavy job": `can start` counts
  // the machine, and `run --heavy` refuses beside these on top of it.
  if (peers.length) {
    process.stdout.write("\nagents live (waypost team) — run --heavy refuses beside them:\n");
    for (const p of peers) process.stdout.write(`  ${peerLine(p)}\n`);
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
  const pdir = peersDir();
  const file = [dir, ...legacySlotsDirs(presence), pdir].map((d) => join(d, `${id}.json`)).find((p) => existsSync(p))
    || join(dir, `${id}.json`);
  if (!existsSync(file)) fail(`capacity --release: no such holder "${id}"`);
  let rec;
  try { rec = JSON.parse(readFileSync(file, "utf8")); }
  catch (e) { fail(`capacity --release: ${file}: ${e.message}`); }
  if (!rec || rec.id !== id || !rec.proc) fail(`capacity --release: ${file} is not a slot record for "${id}"`);
  // A peer's own pid has no known image name on win32 (heavy-jobs.mjs).
  const live = capacity.slotLive(rec, { authority: bootAuthority(capacity), ...(file.startsWith(pdir) ? { tasklist: () => null } : {}) });
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

// waypost capacity --disk [<reserve>,<share> | default] — the owner's disk
// floor (the disk-space ADR): GB of system reserve and GB per heavy job.
// Raising either value works from anywhere; lowering either below what is
// in force, and `default` over an existing setting, is the owner's alone — their own terminal, no
// harness detected, a [y/N] — the same gate as `clean --limit`.
const DISK_DEFAULT = { reserve_gb: 30, share_gb: 20 };

function parseDiskFloor(raw) {
  if (raw === "default") return null;
  const m = String(raw).match(/^(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)$/);
  if (!m) return undefined;
  const v = { reserve_gb: Number(m[1]), share_gb: Number(m[2]) };
  return v.share_gb >= 1 && v.reserve_gb <= 1e6 && v.share_gb <= 1e6 ? v : undefined;
}

// `default` over a setting always needs the owner: the real defaults shrink
// with the disk (15 %/20 %), so the nominal 30/20 says nothing about them.
function diskFloorGated(cur, next) {
  if (cur && !next) return true;
  const c = cur || DISK_DEFAULT, n = next || DISK_DEFAULT;
  return n.reserve_gb < c.reserve_gb || n.share_gb < c.share_gb;
}

const formatFloor = (f) => f
  ? `${f.reserve_gb} GB system reserve + ${f.share_gb} GB per job (owner's setting)`
  : "default — min(30 GB, 15 %) system reserve + min(20 GB, 20 %) per job";

async function handleCapacityDisk(raw, presence, json, io = {}) {
  const host = presence.hostSlug();
  const file = join(machineStateDir(), `disk-floor.${host}.json`);
  const cur = readDiskFloor({ host });
  if (raw == null) {
    if (json) process.stdout.write(JSON.stringify({ floor: cur, default: DISK_DEFAULT }, null, 2) + "\n");
    else process.stdout.write(`disk floor: ${formatFloor(cur)}\nchoices: <reserve GB>,<share GB> (e.g. 30,20) | default\n`);
    return;
  }
  const next = parseDiskFloor(raw);
  const say = (ok, message) => {
    if (json) process.stdout.write(JSON.stringify({ ok, message }, null, 2) + "\n");
    else process.stderr.write(`waypost capacity --disk: ${message}\n`);
    process.exitCode = 1;
  };
  if (next === undefined) return say(false, `invalid value "${raw}" — <reserve GB>,<share GB> (share 1 to 1000000), or default`);
  const isTTY = "isTTY" in io ? Boolean(io.isTTY) : Boolean(process.stdin.isTTY);
  const gated = diskFloorGated(cur, next);
  // Always run, gated or not, so the log records how every change was made.
  let gate = null, gateError = null;
  try {
    const agents = await import(SCRIPT_URL("agents"));
    gate = io.gate ? io.gate() : agents.gateCheck({ env: process.env, dirs: [join(ROOT, "harnesses"), join(projectRoot(), ".waypost", "harnesses")] });
  } catch (e) { gateError = e.message; }
  let answer = null;
  if (gated) {
    const refuse = gate && gate.harness ? `a harness (${gate.harness}) is running — only the owner, in their own terminal, may lower the disk floor`
      : gateError ? `could not confirm whether a harness is running — refused (${gateError})`
      : !isTTY ? "no interactive terminal — only the owner, in their own terminal, may lower the disk floor" : null;
    if (refuse) return say(false, refuse);
    const ask = io.ask || askYesNo;
    answer = await ask(`Lower the disk floor from ${formatFloor(cur)} to ${formatFloor(next)}? [y/N] `, { timeoutMs: 60000 });
    if (!answer) return say(false, "not set");
  }
  try {
    ensureMachineStateDir();
    if (next) writeFileAtomic(file, JSON.stringify({ v: 1, host, ...next, set_at: new Date().toISOString(), previous: cur ? { reserve_gb: cur.reserve_gb, share_gb: cur.share_gb } : null, by: { session: process.env.WAYPOST_SESSION_ID || null } }, null, 2) + "\n");
    else if (existsSync(file)) unlinkSync(file);
  } catch (e) { fail(`capacity --disk: could not write the setting: ${e.message}`); }
  try {
    appendCleanLog(host, JSON.stringify({ v: 1, kind: "disk-floor", at: new Date().toISOString(), host, session: process.env.WAYPOST_SESSION_ID || null,
      from: cur ? { reserve_gb: cur.reserve_gb, share_gb: cur.share_gb } : null, to: next, gated,
      gate: { harness: gate ? gate.harness : null, via: gate ? gate.via : null, error: gateError, tty: isTTY, answer } }));
  } catch (e) { process.stderr.write(`waypost capacity --disk: log not written: ${e.message}\n`); }
  if (json) process.stdout.write(JSON.stringify({ ok: true, floor: next }, null, 2) + "\n");
  else process.stdout.write(`disk floor set to ${formatFloor(next)}\n`);
}

export { handleCapacity, holderSummary, holderLine, handleCapacityRelease, handleCapacityDisk, parseDiskFloor, diskFloorGated };
