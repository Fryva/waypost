// All transport effects are supplied mocks; no network or timeout reaches the OS.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const sourceText = readFileSync(process.argv[2], "utf8");
const original = { fetch: globalThis.fetch, timeout: AbortSignal.timeout, parse: JSON.parse };
const attempts = [], rows = [];
let activeEvents = [], signals = 0, parsedRows = [];
globalThis.fetch = (...args) => { attempts.push(args); throw new Error("unexpected global fetch"); };
AbortSignal.timeout = () => { activeEvents.push(["forbidden-import-timeout"]); throw new Error("timeout during import"); };
JSON.parse = (...args) => {
  const value = original.parse(...args);
  if (Array.isArray(value?.rows)) parsedRows.push(...value.rows.map(r => r?.row));
  return value;
};
const endpoint = { url: "https://example.invalid/rows", dataset: "fixture", subset: "agent" };
const records = (start, count) => Array.from({ length: count }, (_, i) => ({ row_idx: start + i, row: { value: start + i }, truncated_cells: [] }));
const one = { rows: records(0, 1), num_rows_total: 1 };
const twoPages = [{ rows: records(0, 100), num_rows_total: 101 }, { rows: records(100, 1), num_rows_total: 101 }];
function mockFetch(config, events) {
  let page = 0;
  return async (url, options) => {
    assert.ok(url.startsWith(endpoint.url + "?"));
    assert.equal(options.redirect, "error"); assert.deepEqual(options.headers, { Accept: "application/json" });
    assert.equal(options.signal.ms, config.timeout_ms);
    const index = page++, settings = config.pages[index] || config.pages.at(-1);
    events.push(["fetch", url, options]);
    if (settings.fetchError) throw new Error("fixture fetch failure");
    const raw = settings.raw ?? JSON.stringify(settings.payload ?? one);
    const chunks = settings.chunks || [Buffer.from(raw)];
    let next = 0;
    const reader = {
      async read() {
        events.push(["read", index, next]);
        if (settings.readError) throw new Error("fixture read failure");
        await Promise.resolve();
        return next < chunks.length ? { done: false, value: chunks[next++] } : { done: true };
      },
      cancel() {
        events.push(["cancel", index]);
        if (settings.cancel === "throw") throw new Error("fixture cancel throw");
        if (settings.cancel === "nonpromise") return undefined;
        return settings.cancel === "reject" ? Promise.reject(new Error("fixture cancel reject")) : Promise.resolve();
      },
    };
    return {
      get ok() { events.push(["ok", index]); return settings.ok ?? true; },
      get redirected() { events.push(["redirected", index]); return settings.redirected ?? false; },
      get url() { events.push(["url", index]); return settings.url ?? url; },
      headers: { get(key) { events.push(["header", index, key]); return settings.length ?? null; } },
      body: settings.noReader ? null : { getReader() { events.push(["reader", index]); if (settings.readerError) throw new Error("fixture reader failure"); return reader; } },
    };
  };
}
try {
  assert.throws(() => globalThis.fetch("https://example.invalid/forbidden"), /unexpected global fetch/);
  assert.equal(attempts.length, 1); attempts.length = 0;
  const module = await import("data:text/javascript;base64," + Buffer.from(sourceText).toString("base64"));
  assert.deepEqual(activeEvents, [], "import must not create a timeout or perform I/O");
  assert.equal(attempts.length, 0);
  AbortSignal.timeout = ms => { activeEvents.push(["timeout", ms]); return { fixtureSignal: ++signals, ms }; };
  const cases = [
    { label: "one", pages: [{ payload: one }] },
    { label: "two-pages", pages: twoPages.map(payload => ({ payload })) },
    { label: "two-chunks", pages: [{ chunks: [Buffer.from('{"rows":'), Buffer.from(JSON.stringify(one.rows) + ',"num_rows_total":1}')] }] },
    { label: "not-ok", pages: [{ ok: false }] },
    { label: "redirected", pages: [{ redirected: true }] },
    { label: "url-mismatch", pages: [{ url: "https://other.invalid/rows" }] },
    { label: "header-limit", max_bytes: 64, pages: [{ length: "65" }] },
    { label: "stream-limit", max_bytes: 64, pages: [{ chunks: [Buffer.alloc(65)] }] },
    { label: "no-reader", pages: [{ noReader: true }] },
    { label: "reader-throw", pages: [{ readerError: true }] },
    { label: "read-throw", pages: [{ readError: true }] },
    { label: "parse-error", pages: [{ raw: "{" }] },
    { label: "cancel-reject", pages: [{ cancel: "reject" }] },
    { label: "cancel-throw", pages: [{ raw: "{", cancel: "throw" }] },
    { label: "cancel-nonpromise", pages: [{ cancel: "nonpromise" }] },
    { label: "fetch-throw", pages: [{ fetchError: true }] },
    { label: "missing-rows", pages: [{ payload: { num_rows_total: 1 } }] },
    { label: "partial", pages: [{ payload: { ...one, partial: true } }] },
    { label: "missing-total", pages: [{ payload: { rows: one.rows } }] },
    { label: "too-many-total", pages: [{ payload: { ...one, num_rows_total: 202 } }] },
    { label: "fractional-total", pages: [{ payload: { ...one, num_rows_total: 1.5 } }] },
    { label: "empty-rows", pages: [{ payload: { rows: [], num_rows_total: 1 } }] },
    { label: "bad-index", pages: [{ payload: { ...one, rows: [{ ...one.rows[0], row_idx: 1 }] } }] },
    { label: "truncated", pages: [{ payload: { ...one, rows: [{ ...one.rows[0], truncated_cells: ["x"] }] } }] },
    { label: "short-page", pages: [{ payload: { ...one, num_rows_total: 2 } }] },
    { label: "over-total", pages: [{ payload: { rows: records(0, 2), num_rows_total: 1 } }] },
    { label: "long-page", pages: [{ payload: { rows: records(0, 101), num_rows_total: 101 } }] },
    { label: "changed-total", pages: [{ payload: twoPages[0] }, { payload: { ...twoPages[1], num_rows_total: 102 } }] },
    { label: "aggregate-limit", max_bytes: Buffer.byteLength(JSON.stringify(twoPages[0])) + 1, pages: twoPages.map(payload => ({ payload })) },
    { label: "bounded-last-length", max_rows: 101, pages: twoPages.map(payload => ({ payload })) },
  ];
  for (const config of cases) {
    const events = []; activeEvents = events; parsedRows = []; signals = 0;
    const options = { timeout_ms: 100, max_rows: 201, max_bytes: 100000, ...config };
    try {
      const result = await module.fetchArena(endpoint, mockFetch(options, events), options);
      rows.push({ label: config.label, result, originalRowReferences: result.every((r, i) => r === parsedRows[i]), events });
    } catch (e) { rows.push({ label: config.label, error: { name: e.name, message: e.message }, events }); }
  }
  // Separate response closures and result containers stay independent concurrently.
  const config = { timeout_ms: 100, max_rows: 201, max_bytes: 100000, pages: [{ payload: one }] };
  activeEvents = []; parsedRows = [];
  const [a, b] = await Promise.all([module.fetchArena(endpoint, mockFetch(config, []), config), module.fetchArena(endpoint, mockFetch(config, []), config)]);
  assert.notEqual(a, b); assert.notEqual(a[0], b[0]); assert.deepEqual(a, b);
  assert.deepEqual(attempts, [], "unexpected global fetch attempts survive caught errors");
  const find = name => rows.find(r => r.label === name);
  assert.equal(find("one").originalRowReferences, true);
  assert.equal(find("two-pages").result.length, 101);
  assert.equal(find("cancel-reject").result.length, 1);
  assert.equal(find("cancel-throw").error.message, "fixture cancel throw");
  assert.equal(find("cancel-nonpromise").error.name, "TypeError");
  for (const name of ["not-ok", "redirected", "url-mismatch", "header-limit"]) assert.equal(find(name).events.some(e => e[0] === "reader" || e[0] === "cancel"), false);
  for (const name of ["stream-limit", "read-throw", "parse-error"]) assert.equal(find(name).events.at(-1)[0], "cancel");
  assert.match(find("aggregate-limit").error.message, /dataset is too large/);
  const pages = find("bounded-last-length").events.filter(e => e[0] === "fetch").map(e => Object.fromEntries(new URL(e[1]).searchParams));
  assert.deepEqual(pages.map(p => [p.offset, p.length]), [["0", "100"], ["100", "1"]]);
  process.stdout.write(JSON.stringify({ rows, positiveGlobalFetchControl: true, concurrentIsolation: true, unexpectedAttempts: attempts }));
} finally {
  globalThis.fetch = original.fetch; AbortSignal.timeout = original.timeout; JSON.parse = original.parse;
}
