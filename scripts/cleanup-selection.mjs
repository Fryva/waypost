export const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_PROJECT_STALE_DAYS = 7;

// Oldest newest_ms first; a null/unknown age never sorts as "oldest" (it
// never reaches "should" in the first place, so this mainly matters for
// direct callers testing the sort itself); ties by path in code-unit order,
// which is what JavaScript's own `<`/`>` on strings already gives.
export function orderOldestFirst(items) {
  return [...items].sort((a, b) => {
    const an = a.newest_ms ?? Infinity;
    const bn = b.newest_ms ?? Infinity;
    if (an !== bn) return an - bn;
    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  });
}

// The KIND of item Decision 3 lets a machine-wide limit see at all: a
// project-scope match only — an outermost CACHEDIR.TAG, or a registry name
// the walk marked "sure" — BOTH confirmed git-ignored (the ADR's own
// qualification string requires this for a tag match too, not only "sure":
// a CACHEDIR.TAG directory nobody's own ignore rules cover yet is not
// assumed safe for an UNATTENDED sweep, even though a human's `--apply <id>`
// may still remove it directly). Never a project-origin artifact either — a
// project's own toolchains data is less trusted than the shipped registry
// (the same reasoning behind routeFor's own shipped-only bypass) and must
// never make itself eligible for automatic, no-questions-asked removal. A
// generic name, a machine cache, or anything nobody confirmed ignored never
// counts, so a limit can never hold hostage to output this plan is not
// allowed to remove automatically anyway.
//
// Two more gates (the amended ADR, Decision 3), both the lead's own call: an
// item whose owning entry opts it out of the automatic path at all
// (`auto === false`, read only from the shipped registry — scripts/sizes.mjs's
// compileArtifacts) never qualifies, and neither does one the age walk found
// holding a distributable package (`holds_package === true`) — both leave the
// counted TOTAL too, not merely the picks: a limit must never hold hostage to
// output this path may not touch at all.
function qualifiesForLimitKind(item) {
  return item.scope === "project" && item.origin !== "project"
    && (item.match === "tag" || item.match === "sure") && item.ignored === true
    && item.auto !== false && item.holds_package !== true;
}

// What counts towards a machine-wide limit's OWN total (the amended ADR,
// Decision 3) — every item of the qualifying kind, counted whatever its own
// class (idle or not): the limit tracks total footprint, not just what
// happens to be pickable right now.
export function countedBytes(items) {
  return items.filter(qualifiesForLimitKind).reduce((sum, it) => sum + (it.bytes || 0), 0);
}

// Whether an already-classified item is one a machine-wide limit may
// actually PICK, not merely count towards its total: the same kind
// qualification as countedBytes, already classified "should", AND idle past
// whichever is LARGER of the ADR's own 7-day floor or the item's own
// stale_days — a registry entry's shorter stale_days can still make an item
// "should" sooner for a human's own `waypost clean`, but must never let an
// unattended automatic sweep remove it before 7 days.
export function qualifiesForLimit(item, now = Date.now()) {
  if (item.class !== "should") return false;
  if (!qualifiesForLimitKind(item)) return false;
  if (item.newest_ms == null) return false;
  const floorDays = Math.max(DEFAULT_PROJECT_STALE_DAYS, Number.isFinite(item.stale_days) ? item.stale_days : 0);
  return (now - item.newest_ms) / DAY_MS > floorDays;
}

// How much a machine-wide limit still needs to free, and from which
// already-classified items it may take it — the one computation GB and
// `free:<P>%` both reduce to (the amended ADR, Decision 3), so `pickUnderLimit`
// below needs only a single stopping rule for either kind.
//   `limit`     — a parseLimit() result, or null/`{kind:"off"}` (nothing needed).
//   `shortfall` — for `kind: "free"` only: the bytes still short of the floor,
//                 computed ONCE by the caller via shortfallOf() against a
//                 single fs.statfsSync reading — never recomputed per item,
//                 since a filesystem's own free figure can lag a removal.
//   `dev`       — for `kind: "free"` only: the root's own device id: only
//                 items on that SAME filesystem count towards covering a
//                 shortfall measured on it (a GB limit has no such
//                 restriction — every qualifying project item counts,
//                 whatever device it happens to live on).
// Returns `counted` (countedBytes' own total, informational — the report and
// `doctor`'s warning both read it), `need` (bytes still to free; 0 means the
// limit already holds), and `eligible` (qualifying items, oldest first, ready
// for `pickUnderLimit`'s single loop).
export function limitNeed(classified, limit, now = Date.now(), { shortfall = 0, dev = null } = {}) {
  const counted = countedBytes(classified);
  let need = 0;
  if (limit && limit.kind === "gb") need = Math.max(0, counted - limit.bytes);
  else if (limit && limit.kind === "free") need = Math.max(0, shortfall);
  let eligible = orderOldestFirst(classified.filter((it) => qualifiesForLimit(it, now)));
  if (limit && limit.kind === "free" && dev != null) eligible = eligible.filter((it) => it.dev === dev);
  return { counted, need, eligible };
}

// Which already-classified items (classify()'s own per-item output, each
// carrying `class`) a limit would pick: limitNeed's own eligible items,
// oldest first, only as many as cover its own `need` — one stopping rule for
// both a GB limit and `free:<P>%`, never a "can" item either way. `limit` of
// null/undefined, or `{kind:"off"}`, picks nothing.
export function pickUnderLimit(classifiedItems, limit, now = Date.now(), { shortfall = 0, dev = null } = {}) {
  const picks = new Set();
  if (!limit || limit.kind === "off") return picks;
  const { need, eligible } = limitNeed(classifiedItems, limit, now, { shortfall, dev });
  let remaining = need;
  for (const it of eligible) {
    if (remaining <= 0) break;
    picks.add(it.path);
    remaining -= (it.bytes || 0);
  }
  return picks;
}

