// Waypost CLI: clean-apply.
import { askYesNo } from "../../scripts/lib.mjs";
import { gatherCleanContext, planFromContext } from "./clean-plan.mjs";
import { GB, lastCleanNowHonored, projectRoot, splitAtTerminator, tildeHome } from "./core.mjs";
import { APFS_FREE_SPACE_NOTE, appendCleanLog, baseLogItem, isDescendantOf, machinePathStillSafe, orderForRemoval, recheckItem, refusedLogItem, removeItem, verifyRemoval } from "./remove.mjs";
import { statfsSync } from "node:fs";
import { dirname } from "node:path";

// ─── --limit: parsing ───────────────────────────────────────────────────

// --limit takes an OPTIONAL value: `waypost clean --limit` alone prints the
// current setting. The shared opt() cannot express that — it fails outright
// with no value at all, and otherwise takes whatever token follows
// blindly, which would swallow `--json` in `clean --limit --json`. Parsed
// by hand instead: `--limit=<v>` inline, or the very next token, but ONLY
// when it does not itself look like a flag.
function limitFlagValue(args) {
  const { head } = splitAtTerminator(args);
  const eq = head.find((a) => a.startsWith("--limit="));
  if (eq) return { present: true, value: eq.slice("--limit=".length) };
  const i = head.indexOf("--limit");
  if (i === -1) return { present: false, value: null };
  const next = head[i + 1];
  if (next !== undefined && !next.startsWith("--")) return { present: true, value: next };
  return { present: true, value: null };
}

// ─── --apply: parsing and selecting ────────────────────────────────────

// `--apply` takes a variable number of positional values (ids, or the
// single word "should") rather than the shared opt()'s one-token shape, so
// it is parsed by hand: every token right after the flag, up to the next
// one starting with "--" or the end of argv.
function parseApplySelection(args) {
  const { head } = splitAtTerminator(args);
  const i = head.indexOf("--apply");
  if (i === -1) return null;
  const values = [];
  for (let j = i + 1; j < head.length; j++) {
    if (head[j].startsWith("--")) break;
    values.push(head[j]);
  }
  if (values.length === 0) return { mode: "empty" };
  if (values.length === 1 && values[0] === "should") return { mode: "should" };
  if (values.length === 1 && values[0] === "can") return { mode: "can" };
  return { mode: "ids", ids: values };
}

function selectionDescriptorOf(sel) {
  return sel.mode === "should" ? { mode: "should" } : { mode: "ids", ids: sel.ids };
}

// Resolves a selection against the CURRENT (just-built) plan: { toApply,
// refused }. Every refusal is named up front, before anything is even
// re-checked, let alone removed:
//   - "should": every item classified should right now, whatever id it has.
//   - an id absent from the plan: gone, or never something Waypost would
//     remove at all (a symlink/junction is never followed, so it never
//     became an item in the first place).
//   - a manual machine cache: refused, showing its own prose `clean` text —
//     manual items are never run, by id or otherwise.
//   - a keep item: refused with the plan's own reason.
//   - anything else (should or can, not manual): eligible — "can only by
//     id" is enforced by --apply can itself being refused outright, not
//     here.
function resolveApplySelection(classified, sel) {
  if (sel.mode === "should") {
    return { toApply: classified.filter((it) => it.class === "should"), refused: [] };
  }
  const byId = new Map(classified.map((it) => [it.id, it]));
  const toApply = [];
  const refused = [];
  for (const id of sel.ids) {
    const it = byId.get(id);
    if (!it) {
      refused.push({
        id, path: null, scope: null, bytes: null, class: null, route: null,
        reason: "not in the plan now: gone, or no longer a directory Waypost would remove — a symbolic link is never followed",
      });
      continue;
    }
    if (it.manual) {
      refused.push({ id, path: it.path, scope: it.scope, bytes: it.bytes, class: it.class, route: null, reason: it.clean || "manual — see its own instructions, never run automatically" });
      continue;
    }
    if (it.class === "keep") {
      refused.push({ id, path: it.path, scope: it.scope, bytes: it.bytes, class: it.class, route: it.route, reason: it.reason });
      continue;
    }
    toApply.push(it);
  }
  return { toApply, refused };
}

function printApplyPreview(items) {
  const total = items.reduce((s, it) => s + (it.bytes || 0), 0);
  process.stderr.write(`About to remove ${items.length} item(s), ${(total / GB).toFixed(2)} GB total:\n`);
  for (const it of items) process.stderr.write(`  ${it.id}  ${(it.bytes / GB).toFixed(2)} GB  ${it.path}\n`);
}

function groupByDev(ordered) {
  const groups = new Map();
  ordered.forEach((item, idx) => {
    const key = item.dev ?? "unknown";
    if (!groups.has(key)) groups.set(key, { dev: item.dev ?? null, path: dirname(item.path), firstIndex: idx, lastIndex: idx });
    else groups.get(key).lastIndex = idx;
  });
  return groups;
}

// `source` and `prebuilt` let a caller other than `clean` itself (`setup`'s
// own audit step) reuse this whole removal path: `source` tags the log line
// ("setup" instead of "clean"), and `prebuilt` — an already-built
// `{ ctx, classified }`, from the SAME gatherCleanContext/planFromContext
// this function would otherwise call — skips a second, redundant scan when
// the caller already built one (setup's own report needs it anyway).
async function applyClean(sel, consent, mods, now, { source = "clean", prebuilt = null } = {}) {
  const { cleanup, presence } = mods;
  const root = projectRoot();
  const host = presence.hostSlug();
  const selection = selectionDescriptorOf(sel);

  const logAndReturn = (yesField, items, exitCode) => {
    const line = cleanup.logLine({
      at: new Date(now).toISOString(), host, session: process.env.WAYPOST_SESSION_ID || null,
      harness: process.env.WAYPOST_HARNESS || null, source, root,
      clock: lastCleanNowHonored ? process.env.WAYPOST_CLEAN_NOW : null,
      yes: yesField, selection, items, filesystems: [], exit: exitCode,
    });
    // Same reasoning as the final log write below: nothing was removed here
    // either way (a decline), but a log-write failure must still surface
    // rather than silently claim the decline was recorded when it was not.
    let logError = null;
    try { appendCleanLog(host, line); } catch (e) { logError = e.message; }
    return { exitCode: logError ? 1 : exitCode, logError };
  };

  // Build the plan fresh, right now, unless the caller already did: "should"
  // re-plans against the current state; an id is looked up against this
  // same fresh plan, never a stale earlier one.
  const ctx = prebuilt ? prebuilt.ctx : gatherCleanContext(mods);
  const classified = prebuilt ? prebuilt.classified : planFromContext(ctx, cleanup, now);
  const { toApply, refused } = resolveApplySelection(classified, sel);

  if (consent.method === "prompt" && toApply.length) {
    printApplyPreview(toApply);
    const answered = await askYesNo(`Remove ${toApply.length} item(s)? [y/N] `, { timeoutMs: 60000 });
    if (!answered) {
      const items = [...refused.map(refusedLogItem), ...toApply.map((it) => ({ ...baseLogItem(it), result: "declined", reason: "not confirmed", freed_bytes: 0, kept: null }))];
      const { exitCode, logError } = logAndReturn({ by: null, declined: true }, items, 1);
      return { exitCode, declined: true, message: "not confirmed — nothing removed", ...(logError ? { log_error: logError } : {}) };
    }
  }

  // ── remove, ancestors first, filesystem free space measured per device ──
  const ordered = orderForRemoval(toApply);
  const devGroups = groupByDev(ordered);
  const fsStats = new Map();
  const removedRoots = [];
  const results = [];

  for (let i = 0; i < ordered.length; i++) {
    const item = ordered[i];
    const groupKey = item.dev ?? "unknown";
    const group = devGroups.get(groupKey);
    if (i === group.firstIndex) {
      try {
        const s = statfsSync(group.path);
        fsStats.set(groupKey, { dev: group.dev, path: group.path, free_before: s.bavail * s.bsize, free_after: null });
      } catch { /* best effort — this filesystem's free space just is not reported */ }
    }

    const ancestor = removedRoots.find((r) => isDescendantOf(item.path, r.path));
    if (ancestor) {
      results.push({ ...baseLogItem(item), result: "removed", reason: `removed with ${ancestor.id}`, freed_bytes: 0, kept: null });
    } else {
      try {
        const rc = recheckItem(item, ctx, mods, now);
        const stillEligible = sel.mode === "should" ? rc.class === "should" : rc.class !== "keep";
        if (rc.changed || !stillEligible || !rc.route) {
          results.push({ ...baseLogItem(item), result: "skipped", reason: rc.reason, freed_bytes: 0, kept: null });
        } else {
          const safe = machinePathStillSafe(item, ctx, mods, rc.route);
          if (!safe.ok) {
            results.push({ ...baseLogItem(item), result: "skipped", reason: safe.reason, freed_bytes: 0, kept: null });
          } else {
            const beforeBytes = Number.isFinite(rc.fresh.bytes) ? rc.fresh.bytes : item.bytes;
            try {
              removeItem(item, rc.route, ctx, mods);
              const v = verifyRemoval(item, ctx, mods, beforeBytes);
              results.push({ ...baseLogItem(item), result: v.result, reason: v.reason || null, freed_bytes: v.freed_bytes, kept: v.kept || null });
              if (v.result === "removed") removedRoots.push({ path: item.path, id: item.id });
            } catch (e) {
              // A route that threw (a timeout on a huge tree, in
              // particular) may still have removed real content before it
              // did — re-measure best effort so a killed-mid-removal
              // `git clean -X` is reported with the bytes it actually
              // freed, not a flat 0 that hides gigabytes of real progress.
              let freedBytes = 0;
              let reason = e.message;
              try {
                const after = mods.sizes.inspectDir(item.path, { metadata: ctx.metadataNames });
                if (!after || after.exists === false) {
                  freedBytes = Number.isFinite(beforeBytes) ? beforeBytes : 0;
                } else if (after.exists && Number.isFinite(after.bytes) && Number.isFinite(beforeBytes) && after.bytes < beforeBytes) {
                  freedBytes = beforeBytes - after.bytes;
                  reason = `${e.message} (partial — some content was removed before this failed)`;
                }
              } catch { /* best effort — report the error alone */ }
              results.push({ ...baseLogItem(item), result: "failed", reason, freed_bytes: freedBytes, kept: null });
            }
          }
        }
      } catch (e) {
        results.push({ ...baseLogItem(item), result: "failed", reason: e.message, freed_bytes: 0, kept: null });
      }
    }

    if (i === group.lastIndex) {
      const rec = fsStats.get(groupKey);
      if (rec) { try { const s = statfsSync(group.path); rec.free_after = s.bavail * s.bsize; } catch { /* best effort */ } }
    }
  }

  const filesystems = [...fsStats.values()].map((r) => ({
    dev: r.dev, path: r.path, free_before: r.free_before, free_after: r.free_after,
    freed: (r.free_after != null && r.free_before != null) ? r.free_after - r.free_before : null,
  }));

  const allItems = [...refused.map(refusedLogItem), ...results];
  const exitCode = (refused.length === 0 && results.every((r) => r.result === "removed" || r.result === "partial")) ? 0 : 1;
  const yesField = consent.method === "flag" ? { by: "flags", reason: consent.reason } : { by: "terminal" };

  const line = cleanup.logLine({
    at: new Date(now).toISOString(), host, session: process.env.WAYPOST_SESSION_ID || null,
    harness: process.env.WAYPOST_HARNESS || null, source, root,
    clock: lastCleanNowHonored ? process.env.WAYPOST_CLEAN_NOW : null,
    yes: yesField, selection, items: allItems, filesystems, exit: exitCode,
  });
  // The report above is real work already done (removals, verified,
  // measured) — a failure writing ITS log line (ENOSPC, a read-only state
  // dir) must never throw this away. Caught here, surfaced as its own
  // field, and forced non-zero: the caller still sees exactly what
  // happened to every item, plus the one thing that did not get recorded.
  let logError = null;
  try { appendCleanLog(host, line); } catch (e) { logError = e.message; }

  return {
    exitCode: logError ? 1 : exitCode, host, root, selection, items: allItems, filesystems,
    apfs_note: APFS_FREE_SPACE_NOTE, ...(logError ? { log_error: logError } : {}),
  };
}

function printApplyResult(result) {
  // A consent refusal (no valid --yes --reason, no eligible terminal) is
  // handled directly in handleClean, before this is ever reached — only a
  // declined interactive prompt (the plan was already built to show it)
  // takes this early return here.
  if (result.declined) {
    process.stderr.write(`waypost clean --apply: ${result.message}\n`);
    if (result.log_error) process.stderr.write(`  log not written: ${result.log_error}\n`);
    return;
  }
  if (result.leftovers && result.leftovers.handed_off.length) {
    process.stdout.write(`(${result.leftovers.handed_off.length} leftover item(s) from an interrupted run handed to the deleter)\n`);
  }
  for (const it of result.items) {
    const where = it.path ? tildeHome(it.path) : (it.id || "?");
    process.stdout.write(`  ${it.id || "?"}  ${it.result}  ${where}\n`);
    if (it.reason) process.stdout.write(`    ${it.reason}\n`);
    if (it.kept) process.stdout.write(`    kept: ${it.kept}\n`);
  }
  for (const fsEntry of result.filesystems) {
    if (fsEntry.freed == null) continue;
    process.stdout.write(`  ${tildeHome(fsEntry.path)}: ${(fsEntry.freed / GB).toFixed(2)} GB freed\n`);
  }
  if (result.filesystems.length) process.stdout.write(`  (${result.apfs_note})\n`);
  if (result.log_error) process.stdout.write(`  log not written: ${result.log_error}\n`);
  process.stdout.write(result.exitCode === 0 ? "done\n" : "done, with issues — see above\n");
}

export { limitFlagValue, parseApplySelection, selectionDescriptorOf, resolveApplySelection, printApplyPreview, groupByDev, applyClean, printApplyResult };
