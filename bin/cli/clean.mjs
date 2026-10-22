// Waypost CLI: clean.
import { LIMIT_WRITER, askYesNo, ensureMachineStateDir, machineStateDir, readCleanupSetting, readLastAutoCleanup, writeFileAtomic } from "../../scripts/lib.mjs";
import { applyClean, limitFlagValue, parseApplySelection, printApplyResult, selectionDescriptorOf } from "./clean-apply.mjs";
import { activeLimitFor, formatPlan, gatherCleanContext, isHarnessDetected, planFromContext, printCleanPlan } from "./clean-plan.mjs";
import { GB, ROOT, SCRIPT_URL, cleanNow, fail, flag, lastCleanNowHonored, opt, projectRoot, tildeHome } from "./core.mjs";
import { purgeLeftovers } from "./deleter.mjs";
import { appendCleanLog } from "./remove.mjs";
import { EX_TEMPFAIL, claimSlot, recordAuthority, slotWhere, slotsDir } from "./slots.mjs";
import { lstatSync, mkdirSync, realpathSync, statfsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ─── waypost clean --limit (the amended machine-wide-limit ADR, Decision 2) ──

// Names the SPECIFIC evidence a refusal was based on — an ancestor process
// or an environment marker — not just which harness was found, so a person
// staring at a refusal for a harness they do not think is running has
// something to actually check. The basename/word normalisation mirrors
// gateCheck's own (scripts/agents.mjs) closely enough to usually find the
// exact matching ancestor; when it cannot (a registry `process` name that
// differs from the harness id, say), it still names the harness itself.
function gateEvidenceOf(gateResult) {
  if (!gateResult) return null;
  if (gateResult.via === "process") {
    const norm = (c) => String(c || "").toLowerCase().split(/[\\/]/).pop().split(/[^a-z0-9]+/)[0];
    const hit = gateResult.ancestors.find((a) => norm(a.comm) === gateResult.harness || norm(a.argv0) === gateResult.harness);
    return hit ? `an ancestor process "${gateResult.harness}" (pid ${hit.pid})` : `an ancestor process (${gateResult.harness})`;
  }
  if (gateResult.via === "env" && gateResult.markers.length) return `the environment variable ${gateResult.markers[0].var}`;
  return gateResult.harness ? `a harness (${gateResult.harness})` : null;
}

function gateRefusalMessage(decision, gateResult, gateError) {
  const evidence = gateEvidenceOf(gateResult);
  if (evidence) {
    return `${decision.reason} (${evidence}) — set it from your own terminal, or run `
      + "\`waypost clean --limit off\` (or a looser value), which works from anywhere";
  }
  if (gateError) return `${decision.reason} (the harness check itself failed: ${gateError})`;
  return decision.reason;
}

// A read-only look at what the NEW limit would need to free, right now,
// without renaming anything — printed to stderr before the [y/N] itself, so
// the person answering it sees exactly what they are agreeing to.
function printLimitPreview(parsed, mods, now) {
  const { cleanup } = mods;
  const root = slotWhere(projectRoot()).root;
  const home = (() => { try { return realpathSync(homedir()); } catch { return homedir(); } })();
  if (!root || cleanup.refusePath(root, { home })) {
    process.stderr.write("(no project here — nothing to preview)\n");
    return;
  }
  let ctx, classified;
  try {
    ctx = gatherCleanContext(mods);
    classified = planFromContext(ctx, cleanup, now);
  } catch (e) {
    process.stderr.write(`(could not build a preview: ${e.message})\n`);
    return;
  }
  let shortfall = 0;
  let dev = null;
  if (parsed.kind === "free") {
    try {
      const s = statfsSync(root);
      shortfall = cleanup.shortfallOf({ size: s.blocks * s.bsize, avail: s.bavail * s.bsize }, parsed.percent);
    } catch { /* best effort */ }
    try { dev = lstatSync(root).dev; } catch { /* best effort */ }
  }
  const { counted, need, eligible } = cleanup.limitNeed(classified, parsed, now, { shortfall, dev });
  process.stderr.write(`This project's build output counts ${(counted / GB).toFixed(2)} GB towards the limit.\n`);
  if (need <= 0) {
    process.stderr.write("Nothing would need to be removed right now.\n");
    return;
  }
  process.stderr.write(`${(need / GB).toFixed(2)} GB would need to be freed. Oldest first, right now that is:\n`);
  let running = 0;
  for (const it of eligible) {
    if (running >= need) break;
    const days = Math.floor((now - it.newest_ms) / (24 * 60 * 60 * 1000));
    process.stderr.write(`  ${(it.bytes / GB).toFixed(2)} GB  idle ${days}d  ${it.rel || tildeHome(it.path)}\n`);
    running += it.bytes || 0;
  }
}

async function handleCleanLimit(rawValue, mods, json, now) {
  const { cleanup, capacity, presence } = mods;
  const host = presence.hostSlug();

  if (rawValue == null) {
    const setting = readCleanupSetting({ host });
    const outcome = readLastAutoCleanup({ host });
    if (json) {
      process.stdout.write(JSON.stringify({
        setting: setting || null, last_auto: outcome,
        choices: { gb: "<N> (e.g. 5, 10, 20, 50) — gigabytes per project", free: "free:<P>% (P 5-50) — keep at least that much of the disk free", off: "off — no automatic cleanup" },
      }, null, 2) + "\n");
      return;
    }
    process.stdout.write(`cleanup limit: ${cleanup.formatLimit(setting ? setting.limit : null)}`
      + (setting ? ` (set ${setting.set_at})\n` : "\n"));
    process.stdout.write(`${cleanup.formatOutcome(outcome)}\n`);
    process.stdout.write("choices: 5 | 10 | 20 | 50 | <N> (GB per project) | free:<P>% (5-50) | off\n");
    return;
  }

  const parsed = cleanup.parseLimit(rawValue);
  if (!parsed) fail(`clean --limit: invalid value "${rawValue}" — <N> (GB per project), free:<P>% (5-50), or off`);

  const currentSetting = readCleanupSetting({ host });
  const currentLimit = currentSetting ? currentSetting.limit : null;
  const { change, gated } = cleanup.limitChange(currentLimit, parsed);

  if (change === "same") {
    if (json) process.stdout.write(JSON.stringify({ change: "same", limit: parsed }, null, 2) + "\n");
    else process.stdout.write("unchanged\n");
    return;
  }

  let agents;
  try { agents = await import(SCRIPT_URL("agents")); } catch (e) { fail(`clean --limit: ${e.message}`); }

  // Always run, gated or not: an off/loosen change is never refused by it,
  // but its own view is still recorded in the setting (the ADR: "every
  // setting records how it was made"). Pinned to the executable's OWN tree
  // (ROOT), never WAYPOST_HOME — an agent pointing that elsewhere must not
  // be able to steer which harness registry the gate itself reads.
  let gateResult = null;
  let gateError = null;
  try {
    gateResult = agents.gateCheck({
      env: process.env,
      dirs: [join(ROOT, "harnesses"), join(projectRoot(), ".waypost", "harnesses")],
    });
  } catch (e) { gateError = e.message; }

  const decision = cleanup.limitDecision({
    gated, harness: gateResult ? gateResult.harness : null,
    checkError: Boolean(gateError), isTTY: Boolean(process.stdin.isTTY),
  });

  if (decision.ok === false) {
    const message = gateRefusalMessage(decision, gateResult, gateError);
    if (json) process.stdout.write(JSON.stringify({ ok: false, message }, null, 2) + "\n");
    else process.stderr.write(`waypost clean --limit: ${message}\n`);
    process.exitCode = 1;
    return;
  }

  if (decision.method === "prompt") {
    printLimitPreview(parsed, mods, now);
    const answered = await askYesNo(`Set the cleanup limit to ${cleanup.formatLimit(parsed)}? [y/N] `, { timeoutMs: 60000 });
    if (!answered) {
      process.stderr.write("waypost clean --limit: not set\n");
      process.exitCode = 1;
      return;
    }
  }

  const gateInfo = {
    required: gated,
    checked: gateResult ? (gateResult.process_table ? "process-table+env-markers" : "env-markers-only") : "env-markers-only",
    harness: gateResult ? gateResult.harness : null,
    via: gateResult ? gateResult.via : null,
    ancestors: gateResult ? gateResult.ancestors : [],
    markers: gateResult ? gateResult.markers : [],
    tty: Boolean(process.stdin.isTTY),
    answer: decision.method === "prompt" ? true : null,
  };
  const setAt = new Date(now).toISOString();
  const settingRec = {
    v: 1, host, limit: parsed, set_at: setAt, change, previous: currentLimit, written_by: LIMIT_WRITER,
    gate: gateInfo, by: { session: process.env.WAYPOST_SESSION_ID || null },
  };
  try {
    ensureMachineStateDir();
    writeFileAtomic(join(machineStateDir(), `cleanup-limit.${host}.json`), JSON.stringify(settingRec, null, 2) + "\n");
  } catch (e) { fail(`clean --limit: could not write the setting: ${e.message}`); }

  const line = cleanup.logLine({
    kind: "limit", at: setAt, host, session: settingRec.by.session,
    from: currentLimit, to: parsed, change, gate: gateInfo,
  });
  let logError = null;
  try { appendCleanLog(host, line); } catch (e) { logError = e.message; }

  if (json) {
    process.stdout.write(JSON.stringify({ ok: true, ...settingRec, ...(logError ? { log_error: logError } : {}) }, null, 2) + "\n");
  } else {
    process.stdout.write(`cleanup limit set to ${cleanup.formatLimit(parsed)} (${change})\n`);
    if (logError) process.stdout.write(`  log not written: ${logError}\n`);
  }
  if (logError) process.exitCode = 1;
}

async function handleClean(args) {
  const json = flag(args, "--json");
  const applySel = parseApplySelection(args);
  if (applySel && applySel.mode === "empty") { fail("clean --apply: needs an id, a list of ids, or should"); return; }
  if (applySel && applySel.mode === "can") { fail("clean --apply can: refused — can items are removed only by id"); return; }
  const limitFlag = limitFlagValue(args);
  if (limitFlag.present && applySel) { fail("clean --limit: refused together with --apply"); return; }

  let cleanup, sizes, toolchains, capacity, presence, discovery;
  try {
    cleanup = await import(SCRIPT_URL("cleanup"));
    sizes = await import(SCRIPT_URL("sizes"));
    toolchains = await import(SCRIPT_URL("toolchains"));
    capacity = await import(SCRIPT_URL("capacity"));
    presence = await import(SCRIPT_URL("presence"));
    discovery = await import(SCRIPT_URL("discovery"));
  } catch (e) { fail(`clean: ${e.message}`); }

  const now = cleanNow();

  // waypost clean --limit — the machine-wide setting (the amended ADR): no
  // slot needed, decided entirely before the consent/slot machinery below,
  // which is --apply's own.
  if (limitFlag.present) {
    await handleCleanLimit(limitFlag.value, { cleanup, sizes, toolchains, capacity, presence, discovery }, json, now);
    return;
  }

  // --apply's consent is decided before the machine-wide slot is ever
  // claimed: a harness detected, or no terminal and no --yes --reason, must
  // refuse the SAME way whether or not the machine happens to be busy with
  // something else entirely — claiming a slot first would make that refusal
  // depend on machine load, and waste a slot on a request that was always
  // going to be refused.
  let consentDecision = null;
  if (applySel) {
    const yes = flag(args, "--yes");
    const reasonFlag = opt(args, "--reason");
    const isTTY = Boolean(process.stdin.isTTY);
    const harnessDetected = await isHarnessDetected();
    consentDecision = cleanup.consent({ yes, reason: reasonFlag, isTTY, harnessDetected });
    if (consentDecision.method === "refused") {
      const host = presence.hostSlug();
      const root = projectRoot();
      const line = cleanup.logLine({
        at: new Date(now).toISOString(), host, session: process.env.WAYPOST_SESSION_ID || null,
        harness: process.env.WAYPOST_HARNESS || null, source: "clean", root,
        clock: lastCleanNowHonored ? process.env.WAYPOST_CLEAN_NOW : null,
        yes: { by: null, declined: false }, selection: selectionDescriptorOf(applySel), items: [], filesystems: [], exit: 1,
      });
      // Nothing was ever going to be removed on this path either way (a
      // refusal, exit 1 regardless) — but a log-write failure (ENOSPC, a
      // read-only state dir) must still be reported, not swallowed.
      let logError = null;
      try { appendCleanLog(host, line); } catch (e) { logError = e.message; }
      const message = `${consentDecision.reason} — pass --yes --reason "<who agreed, when>" or run \`waypost prompt cleanup\``;
      if (json) {
        process.stdout.write(JSON.stringify({ exitCode: 1, refusedEarly: true, message, ...(logError ? { log_error: logError } : {}) }, null, 2) + "\n");
      } else {
        process.stderr.write(`waypost clean --apply: ${message}\n`);
        if (logError) process.stderr.write(`  log not written: ${logError}\n`);
      }
      process.exitCode = 1;
      return;
    }
  }

  // Same rule as `size --global` (WP-18 Decision 4): a machine-wide scan
  // holds the machine-wide slot, same refusal (exit 75), for the plan AND
  // for --apply. No fail() between the claim and the finally below, so the
  // slot is always released.
  const dir = slotsDir(presence);
  mkdirSync(dir, { recursive: true });
  const where = slotWhere(projectRoot());
  const claim = await claimSlot(dir, ["waypost", "clean", ...(applySel ? ["--apply"] : []), ...(json ? ["--json"] : [])], capacity, presence, where);
  if (!claim.ok) {
    process.stderr.write(`waypost clean: refused — ${claim.reason}\n  retry: waypost clean\n`);
    process.exitCode = EX_TEMPFAIL;
    return;
  }
  recordAuthority(claim.file, capacity);

  // Any cleanup, manual or automatic, first purges what an interrupted run
  // left in waypost-removing/ (the amended ADR, Decision 4) — right after
  // the claim, whatever the conditions below decide about this run's own
  // plan or apply.
  let purge = { handed_off: [], left: 0 };
  try { purge = purgeLeftovers(where, { capacity, presence }); } catch { /* best effort — never blocks the plan/apply below */ }

  const mods = { cleanup, sizes, toolchains, presence, discovery };
  let result, error, applyResult = false;
  try {
    if (!applySel) {
      const ctx = gatherCleanContext(mods);
      const { limit, shortfall, dev } = activeLimitFor(ctx.root, cleanup, presence);
      const classified = planFromContext(ctx, cleanup, now, { limit, shortfall, dev });
      result = formatPlan(classified, ctx, now);
    } else {
      applyResult = true;
      result = await applyClean(applySel, consentDecision, mods, now);
    }
  } catch (e) {
    error = e;
  } finally {
    claim.release();
  }
  if (error) fail(`clean: ${error.message}`);

  if (purge.handed_off.length) {
    const host = presence.hostSlug();
    const line = cleanup.logLine({
      kind: "purge", at: new Date(now).toISOString(), host, session: process.env.WAYPOST_SESSION_ID || null,
      root: where.root, handed_off: purge.handed_off.length,
    });
    try { appendCleanLog(host, line); } catch { /* best effort — the purge itself already ran */ }
  }
  if (result && typeof result === "object") result.leftovers = { handed_off: purge.handed_off, left: purge.left };

  if (applyResult) {
    if (json) process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    else printApplyResult(result);
    if (result.exitCode) process.exitCode = result.exitCode;
    return;
  }

  if (json) { process.stdout.write(JSON.stringify(result, null, 2) + "\n"); return; }
  printCleanPlan(result);
}

export { gateEvidenceOf, gateRefusalMessage, printLimitPreview, handleCleanLimit, handleClean };
