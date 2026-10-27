// One row per API request. Called for every assistant record; the first record
// for a requestId establishes the bucket and the input/cache figures, later
// records only raise output. Keyed globally: a request can legitimately appear
// in two files (e.g. a resumed session), and collapsing it is what we want.
const USAGE_FIELDS = ["input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens", "output_tokens"];
const validCount = (value) => Number.isSafeInteger(value) && value >= 0;

export function ingest(rows, rec, meta) {
  const u = rec.message && rec.message.usage;
  if (!u || typeof u !== "object" || Array.isArray(u)) return;
  // Claude Code also writes locally-synthesized assistant messages (an interrupt
  // or an error it composed itself) under the model "<synthetic>" with a real
  // requestId and every usage counter at zero. Not an API request, so no row —
  // and not an unpriced model either, which is what the warning is for.
  if ((rec.message.model || "") === "<synthetic>") return;
  const id = rec.requestId;
  let row = rows.get(id);
  if (!row) {
    const cw = validCount(u.cache_creation_input_tokens) ? u.cache_creation_input_tokens : 0;
    const split = u.cache_creation || null;
    row = {
      ...meta,
      model: typeof rec.message.model === "string" && rec.message.model ? rec.message.model : "unknown",
      ts: rec.timestamp || "",
      input: validCount(u.input_tokens) ? u.input_tokens : 0,
      cacheWrite: cw,
      // no split present → price the aggregate at the cheaper 5m tier
      cw5m: split && validCount(split.ephemeral_5m_input_tokens) ? split.ephemeral_5m_input_tokens : cw,
      cw1h: split && validCount(split.ephemeral_1h_input_tokens) ? split.ephemeral_1h_input_tokens : 0,
      cacheRead: validCount(u.cache_read_input_tokens) ? u.cache_read_input_tokens : 0,
      output: 0,
      toolIds: new Set(),
      seenUsage: {},
      invalidUsage: false,
      conflictingUsage: false,
    };
    rows.set(id, row);
  }
  const fields = { input_tokens: "input", cache_creation_input_tokens: "cacheWrite", cache_read_input_tokens: "cacheRead" };
  for (const key of USAGE_FIELDS) {
    if (u[key] === undefined) continue;
    if (!validCount(u[key])) { row.invalidUsage = true; continue; }
    if (key !== "output_tokens" && row.seenUsage[key] !== undefined && row.seenUsage[key] !== u[key]) row.conflictingUsage = true;
    if (key !== "output_tokens" && row.seenUsage[key] === undefined) row[fields[key]] = u[key];
    row.seenUsage[key] = u[key];
  }
  if (validCount(u.output_tokens)) row.output = Math.max(row.output, u.output_tokens);
  if (u.cache_creation) {
    const split = u.cache_creation;
    const five = split.ephemeral_5m_input_tokens ?? 0;
    const hour = split.ephemeral_1h_input_tokens ?? 0;
    if (typeof split !== "object" || Array.isArray(split) || !validCount(five) || !validCount(hour) || five + hour !== row.cacheWrite) row.invalidUsage = true;
    else {
      if (row.seenCacheSplit && (row.cw5m !== five || row.cw1h !== hour)) row.conflictingUsage = true;
      row.cw5m = five; row.cw1h = hour;
    }
  } else if (!row.seenCacheSplit) row.cw5m = row.cacheWrite;
  if (u.cache_creation) row.seenCacheSplit = true;
  row.usageComplete = USAGE_FIELDS.every((key) => row.seenUsage[key] !== undefined) && !row.invalidUsage && !row.conflictingUsage;
  // one record per content block → union the ids across the request's records
  for (const b of Array.isArray(rec.message?.content) ? rec.message.content : []) {
    if (b && b.type === "tool_use" && b.id) row.toolIds.add(b.id);
  }
}

// Runs, not requests. For agents this is exact — one subagents/*.meta.json per
// spawn. For commands there is no start marker, so a run is counted as a
// contiguous stretch of one skill's requests inside a session (see below).
export function countCommandRuns(rows, calls) {
  const bySession = new Map();
  for (const row of rows.values()) {
    if (row.kind !== "cmd") continue;
    if (!bySession.has(row.session)) bySession.set(row.session, []);
    bySession.get(row.session).push(row);
  }
  for (const list of bySession.values()) {
    list.sort((a, b) => a.ts.localeCompare(b.ts));
    let prev = null;
    for (const row of list) {
      if (row.bucket !== prev) {
        const k = `${row.session}|${row.bucket}`;
        calls.set(k, (calls.get(k) || 0) + 1);
      }
      prev = row.bucket;
    }
  }
}

