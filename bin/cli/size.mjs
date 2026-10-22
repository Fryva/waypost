// Waypost CLI: size.
import { REMOVING_DIR, ensureMachineStateDir, expandHome, stateWriteHint } from "../../scripts/lib.mjs";
import { GB, SCRIPT_URL, fail, flag, projectRoot, tildeHome } from "./core.mjs";
import { EX_TEMPFAIL, claimSlot, recordAuthority, slotWhere, slotsDir } from "./slots.mjs";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

async function handleSize(args) {
  let sizes, toolchains;
  try {
    sizes = await import(SCRIPT_URL("sizes"));
    toolchains = await import(SCRIPT_URL("toolchains"));
  } catch (e) { fail(`size: ${e.message}`); }
  const json = flag(args, "--json");

  if (flag(args, "--global")) {
    // WP-18 Decision 4: a whole-disk scan is heavy work too, so it holds a
    // machine-wide slot exactly like `waypost run --heavy` — same refusal
    // (exit 75), same reason and retry line. No `fail()` (process.exit)
    // between the claim and the finally below, so the slot is always
    // released, even when the scan itself throws.
    let capacity, presence;
    try {
      capacity = await import(SCRIPT_URL("capacity"));
      presence = await import(SCRIPT_URL("presence"));
    } catch (e) { fail(`size --global: ${e.message}`); }
    const dir = slotsDir(presence);
    try { ensureMachineStateDir(dir); } catch (e) { fail(`size --global: ${stateWriteHint(dir, e)}`); }
    const where = slotWhere(process.cwd());
    const claim = await claimSlot(dir, ["waypost", "size", "--global"], capacity, presence, where);
    if (!claim.ok) {
      process.stderr.write(`waypost size --global: refused — ${claim.reason}\n  retry: waypost size --global\n`);
      process.exitCode = EX_TEMPFAIL;
      return;
    }
    // Same as run --heavy: the authority goes into the record after the lock
    // is released, never before it (third amendment).
    recordAuthority(claim.file, capacity);
    let out, reg, error, usedProfile = false;
    try {
      reg = toolchains.loadRegistry({ projectRoot: projectRoot(), platform: process.platform });
      // WP-17, the discovery story: a fresh machine profile for THIS host and
      // platform (built by `waypost profile`/`waypost setup`, never here —
      // `size` stays read-only, Decision 3 of the ADR) is measured directly;
      // otherwise today's path, unchanged. A profile is never rebuilt or
      // refreshed by this command.
      const discovery = await import(SCRIPT_URL("discovery"));
      const host = presence.hostSlug();
      const machinePath = discovery.machineProfilePath({ home: homedir(), host });
      let machine = null;
      if (existsSync(machinePath)) {
        try { machine = JSON.parse(readFileSync(machinePath, "utf8")); } catch { machine = null; }
      }
      // Item 7: a profile missing its own `caches` array (corrupt, or an
      // older shape from before the fact-only profile) is not "fresh" —
      // fall back to the registry entirely rather than measure nothing.
      const fresh = machine && machine.platform === process.platform
        && Array.isArray(machine.caches) && !discovery.needsRefresh(machine, {});
      // The registry travels WITH the profile (ADR Decision 2): a profile
      // holds facts only (tool/item/path/source), never clean/regenerable/
      // confidence/docs/notes — scanGlobal reattaches that policy from
      // THIS, the current, registry, matched by (tool, item), so a fixed
      // `regenerable` or `clean` is visible here at once, never stale for
      // up to 30 days waiting on the next profile refresh.
      out = fresh ? sizes.scanGlobal({ profile: machine, registry: reg }) : sizes.scanGlobal({ registry: reg });
      usedProfile = Boolean(fresh);
    } catch (e) {
      error = e;
    } finally {
      claim.release();
    }
    if (error) fail(`size --global: ${error.message}`);
    if (json) {
      process.stdout.write(JSON.stringify({
        caches: out, notes: reg.notes, profile_used: usedProfile,
        ...(usedProfile && out.dropped ? { profile_stale_items: out.dropped } : {}),
      }, null, 2) + "\n");
      return;
    }
    if (!usedProfile) {
      process.stdout.write("no fresh machine profile for this host — measuring the shipped registry's own defaults (waypost profile to build one)\n");
    } else if (out.dropped) {
      process.stdout.write(`${out.dropped} cache item(s) in the profile are no longer in the registry — registry changed — waypost profile --refresh\n`);
    }
    const threshold = 0.1 * GB;
    const big = out.filter((e) => e.bytes >= threshold).sort((a, b) => b.bytes - a.bytes);
    if (!big.length) { process.stdout.write("no caches at or above 0.1 GB found (waypost size --global --json for the rest)\n"); }
    for (const e of big) {
      process.stdout.write(`  ${(e.bytes / GB).toFixed(1)} GB  ${tildeHome(e.path)}  [${e.tool} · ${e.source}]\n    → ${e.clean}\n`);
    }
    const small = out.length - big.length;
    if (small > 0) process.stdout.write(`…and ${small} more below 0.1 GB (--json for all)\n`);
    if (reg.notes.length) process.stdout.write(`\n${reg.notes.length} note(s) from .waypost/toolchains/ (--json for detail)\n`);
    return;
  }

  const bi = args.indexOf("--budget");
  let budget = null;
  if (bi !== -1) {
    const v = args[bi + 1];
    if (v === undefined) fail("--budget requires a value");
    budget = Number(v);
    if (!Number.isInteger(budget) || budget < 0) fail(`--budget must be a non-negative integer, got "${v}"`);
  }

  // A local extractor: the shared opt() does not know --project's value is
  // optional, and would swallow --json as the directory (A-8's own lesson,
  // applied here rather than reused, since --project's arity differs from
  // every other flag in VALUED).
  const pi = args.indexOf("--project");
  const dir = pi !== -1 && args[pi + 1] !== undefined && !args[pi + 1].startsWith("--")
    ? resolve(expandHome(args[pi + 1]))
    : projectRoot();

  let out, reg;
  try {
    reg = toolchains.loadRegistry({ projectRoot: dir, platform: process.platform });
    out = sizes.scanProject(dir, { budget, registry: reg });
  } catch (e) { fail(`size: ${e.message}`); }

  // waypost-removing/'s own size (the amended machine-wide-limit ADR): never
  // part of the project scan itself (scanProject never enters a git
  // directory), reported here as a courtesy — it holds items already handed
  // to the detached deleter, on their way out.
  let removingBytes = null;
  try {
    const common = slotWhere(dir).common;
    if (common) {
      const removingPath = join(common, REMOVING_DIR);
      if (existsSync(removingPath)) removingBytes = sizes.inspectDir(removingPath, {}).bytes ?? null;
    }
  } catch { /* best effort */ }

  if (json) { process.stdout.write(JSON.stringify({ ...out, notes: reg.notes, waypost_removing_bytes: removingBytes }, null, 2) + "\n"); return; }

  const totalGb = (out.bytes_at_least / GB).toFixed(1);
  if (out.complete) {
    process.stdout.write(`${totalGb} GB\n`);
  } else {
    process.stdout.write(`≥ ${totalGb} GB (stopped after ${out.entries_visited} entries — `
      + "the entry budget; waypost size --budget <n> to raise it)\n");
  }
  if (removingBytes != null) {
    process.stdout.write(`  ${(removingBytes / GB).toFixed(2)} GB  waypost-removing/ (already handed to the deleter)\n`);
  }
  const sorted = [...out.dirs].sort((a, b) => b.bytes - a.bytes);
  if (!sorted.length) { process.stdout.write("no build artifacts found\n"); return; }
  for (const d of sorted) {
    const abs = resolve(out.root, d.path || ".");
    process.stdout.write(`  ${(d.bytes / GB).toFixed(1)} GB  ${tildeHome(abs)}${d.partial ? "  (partial)" : ""}\n`);
  }
}

export { handleSize };
