async function fetchJSON(url, fetchImpl, config) {
  const response = await fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(config.timeout_ms), headers: { Accept: "application/json" } });
  if (!response.ok || response.redirected || (response.url && response.url !== url)) throw new Error("strength fetch failed or redirected");
  const size = Number(response.headers?.get("content-length"));
  if (Number.isFinite(size) && size > config.max_bytes) throw new Error("strength response is too large");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("strength response lacks a bounded readable body");
  let bytes = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > config.max_bytes) throw new Error("strength response is too large");
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { await reader.cancel().catch(() => {}); }
}

export async function fetchArena(source, fetchImpl, config) {
  const rows = [];
  // One bounded total, not an unbounded crawl of historical leaderboard data.
  let total = null, bytes = 0;
  for (let offset = 0; offset < config.max_rows; offset += 100) {
    const u = new URL(source.url);
    for (const [k, v] of Object.entries({ dataset: source.dataset, config: source.subset, split: "latest", offset, length: Math.min(100, config.max_rows - offset) })) u.searchParams.set(k, String(v));
    const json = await fetchJSON(u.href, fetchImpl, config);
    bytes += Buffer.byteLength(JSON.stringify(json));
    if (bytes > config.max_bytes) throw new Error("strength dataset is too large");
    if (!Array.isArray(json.rows) || json.rows.length > 100 || json.partial === true) throw new Error("malformed or partial Arena rows");
    const announced = json.num_rows_total;
    if (!Number.isSafeInteger(announced) || announced < 1 || announced > config.max_rows) throw new Error("Arena row count missing or too large");
    if (total !== null && announced !== total) throw new Error("Arena changed while paging; retry discovery");
    total = announced;
    if (!json.rows.length || json.rows.some((r, i) => r.row_idx !== offset + i || r.truncated_cells?.length)) throw new Error("truncated or misordered Arena rows");
    rows.push(...json.rows.map((r) => r.row));
    if (rows.length === total) break;
    if (rows.length > total || json.rows.length < Math.min(100, total - offset)) throw new Error("incomplete Arena dataset");
  }
  if (rows.length !== total) throw new Error("incomplete Arena dataset");
  return rows;
}

