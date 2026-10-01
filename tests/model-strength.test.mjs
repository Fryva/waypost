import { test } from "node:test";
import assert from "node:assert/strict";
import { discoverStrength, parseArenaRows, parseCalibration, refreshDue, loadStrengthSources } from "../scripts/model-strength.mjs";
import { validatePolicy } from "../scripts/team.mjs";

const NOW = Date.parse("2026-09-30T12:00:00Z");
const DAY = 86400000;
const config = loadStrengthSources();
const source = config.sources[0];
const model = (provider, model_id, reasoning = "max") => ({ provider, model_id, reasoning });
function row(model_name, score, lower, upper, organization = "vendor-a", overrides = {}) {
  return { model_name, organization, score, score_ci_lower: lower, score_ci_upper: upper,
    session_count: 100, category: "overall", leaderboard_publish_date: "2026-09-29", ...overrides };
}
function network(rows, onCall = () => {}) {
  return async (url, opts) => {
    onCall(url, opts);
    const offset = Number(new URL(url).searchParams.get("offset"));
    return new Response(JSON.stringify({ rows: rows.slice(offset, offset + 100).map((r, i) => ({ row_idx: offset + i, row: r, truncated_cells: [] })), num_rows_total: rows.length, partial: false }), { status: 200, headers: { "content-type": "application/json" } });
  };
}
const discover = (participants, rows, rest = {}) => discoverStrength({ participants, now: NOW, fetchImpl: network(rows), ...rest });

test("automatic common source orders exact model IDs with interval evidence, never price or harness", async () => {
  const out = await discover([model("vendor-a", "strong", "max"), { harness: "claude", price: 999, model: model("vendor-b", "free", "none") }],
    [row("strong (Max)", 0.9, 0.8, 1), row("free (None)", 0.3, 0.2, 0.4, "vendor-b", { license: "MIT", price: 0 })]);
  assert.equal(out.ok, true);
  assert.equal(out.policy.mode, "automatic");
  assert.equal(out.policy.profiles.find((p) => p.model_id === "strong").priorities.coordinate, 2);
  assert.equal(out.policy.profiles.find((p) => p.model_id === "free").priorities.review, 1);
  assert.deepEqual(out.unclassified, []);
  assert.equal(out.profile_proofs[0].published_at, "2026-09-29");
  assert.match(out.profile_proofs[0].source_row_digest, /^[a-f0-9]{64}$/);
  assert.deepEqual(validatePolicy(out.policy), { ...out.policy, evidence_floor: ["adapter-observed", "owner-attested"] });
});

test("new company and free model need no provider registry or paid API key", async () => {
  let options;
  const out = await discoverStrength({ participants: [model("new-company", "New Open 12B", "none")], now: NOW,
    fetchImpl: network([row("New Open 12B (None)", 9, 8, 10, "new-company")], (_, o) => { options = o; }) });
  assert.equal(out.ok, true);
  assert.equal(options.redirect, "error");
  assert.deepEqual(options.headers, { Accept: "application/json" });
});

test("only unique representation-equivalent spelling matches, with all version digits preserved", async () => {
  const out = await discover([model("openai", "gpt-6-astra"), model("openai", "gpt-6-astra-latest"), model("openai", "gpt-6-astra-20260929"), model("openai", "gpt-6-astra", "high"), model("other", "gpt-6-astra")],
    [row("GPT 6 Astra (Max)", 9, 8, 10, "openai")]);
  assert.equal(out.policy.profiles.length, 1);
  assert.equal(out.profile_proofs[0].method, "canonical-spelling");
  assert.equal(out.unclassified.length, 4);
  const decimal = await discover([model("x", "model-41", "none")], [row("Model 4.1", 9, 8, 10, "x")]);
  assert.equal(decimal.ok, false);
});

test("ambiguous spelling, unknown models, free routing wrappers and wrong reasoning stay unclassified", async () => {
  const out = await discover([model("vendor-a", "super-model"), model("vendor-a", "super-model:free"), model("vendor-a", "unknown")],
    [row("Super Model (Max)", 9, 8, 10), row("Super-Model (Max)", 9, 8, 10)]);
  assert.equal(out.ok, false);
  assert.equal(out.policy, null);
  assert.equal(out.unclassified.length, 3);
});

test("maximal confidence frontiers preserve strict edges through an overlapping chain", async () => {
  const out = await discover([model("x", "a"), model("x", "b"), model("x", "c"), model("x", "d")],
    [row("a (Max)", 10, 9, 11, "x"), row("b (Max)", 9, 7, 10, "x"), row("c (Max)", 7, 6, 8, "x"), row("d (Max)", 3, 2, 4, "x")]);
  const ps = new Map(out.policy.profiles.map((p) => [p.model_id, p.priorities.review]));
  assert.equal(ps.get("a"), ps.get("b"));
  assert.ok(ps.get("a") > ps.get("c"));
  assert.ok(ps.get("c") > ps.get("d"));
});

test("bare display names never imply no reasoning; only explicit None classifies", async () => {
  const bare = await discover([model("x", "bare", "none"), model("x", "bare", "unknown")], [row("bare", 9, 8, 10, "x")]);
  assert.equal(bare.ok, false);
  assert.equal(bare.unclassified.length, 2);
  assert.equal(parseArenaRows([row("bare", 9, 8, 10, "x")], source, { now: NOW })[0].reasoning, "unknown");
  const explicit = await discover([model("x", "bare", "none")], [row("bare (None)", 9, 8, 10, "x")]);
  assert.equal(explicit.ok, true);
});

test("reasoning before a date suffix stays explicit and does not borrow undated model rank", async () => {
  const name = "DeepSeek V4 Pro (High) (0813)";
  const rows = [row(name, 9, 8, 10, "deepseek")];
  assert.equal(parseArenaRows(rows, source, { now: NOW })[0].reasoning, "high");
  const out = await discover([model("deepseek", name, "high"), model("deepseek", name, "none"), model("deepseek", "deepseek-v4-pro", "high")], rows);
  assert.equal(out.policy.profiles.length, 1);
  assert.equal(out.policy.profiles[0].reasoning, "high");
  assert.equal(out.unclassified.length, 2);
});

test("mapping a bare source identity to explicit reasoning needs separate deliberate evidence", async () => {
  const alias = { source: source.id, provider: "x", model_id: "api-id", reasoning: "none", organization: "x", model_name: "Bare name", evidence: "https://example.org/model-id" };
  const rows = [row("Bare name", 9, 8, 10, "x")];
  const missing = await discover([model("x", "api-id", "none")], rows, { config: { ...config, aliases: [alias] } });
  assert.equal(missing.ok, false);
  const evidenced = await discover([model("x", "api-id", "none")], rows, { config: { ...config, aliases: [{ ...alias, reasoning_evidence: "https://example.org/model-reasoning" }] } });
  assert.equal(evidenced.ok, true);
  assert.equal(evidenced.profile_proofs[0].source_identity.reasoning, "unknown");
});

test("dataset date, not retrieval date, expires published evidence", async () => {
  const rows = [row("a (Max)", 9, 8, 10, "x", { leaderboard_publish_date: "2026-09-01" })];
  const out = await discover([model("x", "a")], rows);
  assert.equal(out.ok, false);
  assert.match(out.blockers.join(" "), /stale/);
  assert.equal(out.policy, null);
});

test("fresh cache reuses evidence until periodic refresh then fetches again", async () => {
  let calls = 0;
  const fetchImpl = network([row("a (Max)", 9, 8, 10, "x")], () => calls++);
  const opts = { participants: [model("x", "a")], fetchImpl, now: NOW };
  const first = await discoverStrength(opts);
  const second = await discoverStrength({ ...opts, now: NOW + 1000, cache: first.cache });
  assert.equal(calls, 1);
  assert.equal(second.policy.revision, first.policy.revision);
  assert.equal(second.policy.profiles[0].date, "2026-09-29");
  assert.equal(refreshDue(first.cache, { now: NOW + DAY }), true);
  await discoverStrength({ ...opts, now: NOW + DAY, cache: first.cache });
  assert.equal(calls, 2);
});

test("repeated cached discovery retains retrieval, generation and fixed expiry", async () => {
  let calls = 0;
  const opts = { participants: [model("x", "a")], fetchImpl: network([row("a (Max)", 9, 8, 10, "x")], () => calls++), now: NOW };
  const first = await discoverStrength(opts);
  let latest = first;
  for (const elapsed of [1000, DAY / 2, DAY - 1]) {
    latest = await discoverStrength({ ...opts, now: NOW + elapsed, cache: latest.cache });
    assert.equal(latest.policy.sources[0].retrieved_at, first.policy.sources[0].retrieved_at);
    assert.equal(latest.cache.retrieved_at, first.cache.retrieved_at);
    assert.equal(latest.policy.generated_at, first.policy.generated_at);
    assert.equal(latest.policy.expires_at, first.policy.expires_at);
  }
  assert.equal(calls, 1);
  assert.equal(refreshDue(latest.cache, { now: NOW + DAY }), true);
  const failed = await discoverStrength({ ...opts, now: NOW + DAY, cache: latest.cache, fetchImpl: async () => { throw new Error("offline"); } });
  assert.equal(failed.ok, false);
  assert.equal(failed.policy, null);
  assert.equal(refreshDue(failed.cache, { now: NOW + DAY }), true);
});

test("periodic refresh retrieves a fresh source and only then updates policy timestamps", async () => {
  let calls = 0;
  const opts = { participants: [model("x", "a")], now: NOW, fetchImpl: network([row("a (Max)", 9, 8, 10, "x")], () => calls++) };
  const first = await discoverStrength(opts);
  const refreshed = await discoverStrength({ ...opts, cache: first.cache, now: NOW + DAY,
    fetchImpl: network([row("a (Max)", 9, 8, 10, "x", { leaderboard_publish_date: "2026-09-30" })], () => calls++) });
  assert.equal(calls, 2);
  assert.equal(refreshed.ok, true);
  assert.equal(refreshed.policy.generated_at, new Date(NOW + DAY).toISOString());
  assert.equal(refreshed.policy.sources[0].retrieved_at, new Date(NOW + DAY).toISOString());
  assert.equal(refreshed.cache.retrieved_at, refreshed.policy.sources[0].retrieved_at);
  assert.equal(refreshed.policy.expires_at, new Date(NOW + 2 * DAY).toISOString());
  assert.equal(refreshed.policy.profiles[0].date, "2026-09-30");
});

test("refresh changes profile order automatically and preserves offline identities when supplied", async () => {
  const ps = [model("x", "a"), { availability: "left", model: model("x", "b") }];
  const first = await discover(ps, [row("a (Max)", 9, 8, 10, "x"), row("b (Max)", 5, 4, 6, "x")]);
  const second = await discover(ps, [row("a (Max)", 5, 4, 6, "x"), row("b (Max)", 9, 8, 10, "x")], { cache: first.cache, now: NOW + DAY });
  assert.equal(second.policy.revision, first.policy.revision + 1);
  assert.equal(second.policy.profiles.find((p) => p.model_id === "b").priorities.review, 2);
});

test("refresh failure cannot manufacture a fresh policy from an expired cache", async () => {
  const first = await discover([model("x", "a")], [row("a (Max)", 9, 8, 10, "x")]);
  const out = await discoverStrength({ participants: [model("x", "a")], cache: first.cache, now: NOW + DAY,
    fetchImpl: async () => { throw new Error("network unavailable"); } });
  assert.equal(out.ok, false);
  assert.equal(out.policy, null);
  assert.match(out.blockers.join(" "), /network unavailable/);
});

test("domain must explicitly match evidence and mixed categories do not leak rank", async () => {
  const out = await discover([model("x", "a")], [row("a (Max)", 9, 8, 10, "x")], { domain: "medical" });
  assert.equal(out.ok, false);
  assert.throws(() => parseArenaRows([row("a", 9, 8, 10, "x", { category: "unrelated" })], source, { now: NOW }), /category/);
});

test("malformed, duplicate, future and mixed publication evidence fail closed", () => {
  for (const rows of [
    [row("a", 9, 10, 11)],
    [row("a", NaN, 8, 10)],
    [row("a", 9, 8, 10, "x", { session_count: 0 })],
    [row("a", 9, 8, 10), row("a", 9, 8, 10)],
    [row("a", 9, 8, 10, "x", { leaderboard_publish_date: "2026-10-01" })],
    [row("a", 9, 8, 10), row("b", 9, 8, 10, "x", { leaderboard_publish_date: "2026-09-28" })],
  ]) assert.throws(() => parseArenaRows(rows, source, { now: NOW }));
});

test("untrusted URL and redirects are rejected without fetching arbitrary destinations", async () => {
  let calls = 0;
  const bad = await discoverStrength({ participants: [], config: { ...config, sources: [{ ...source, url: "https://127.0.0.1/rows" }] }, now: NOW, fetchImpl: async () => { calls++; } });
  assert.equal(bad.ok, false);
  assert.equal(calls, 0);
  const redirect = await discoverStrength({ participants: [model("x", "a")], now: NOW, fetchImpl: async () => ({ ok: true, redirected: true }) });
  assert.equal(redirect.ok, false);
});

test("payload budget, partial rows, truncated cells and changing page totals are rejected", async () => {
  for (const payload of [
    { rows: [], num_rows_total: 1 },
    { rows: [], num_rows_total: 99999999 },
    { rows: [{ row_idx: 0, row: row("a", 9, 8, 10), truncated_cells: ["score"] }], num_rows_total: 1 },
    { rows: [{ row_idx: 0, row: row("a", 9, 8, 10), truncated_cells: [] }], num_rows_total: 1, partial: true },
  ]) {
    const out = await discoverStrength({ participants: [model("x", "a")], now: NOW, fetchImpl: async () => new Response(JSON.stringify(payload)) });
    assert.equal(out.ok, false);
  }
  const huge = await discoverStrength({ participants: [model("x", "a")], now: NOW, config: { ...config, max_bytes: 1024 }, fetchImpl: async () => new Response(" ".repeat(1025)) });
  assert.equal(huge.ok, false);
  assert.match(huge.blockers.join(" "), /too large/);
});

test("an evidenced alias maps identity but supplies no manual rank", async () => {
  const aliasConfig = { ...config, aliases: [{ source: source.id, provider: "x", model_id: "stable-api-id", reasoning: "max", organization: "x", model_name: "Different display (Max)", evidence: "https://example.org/official-model-id" }] };
  const out = await discover([model("x", "stable-api-id")], [row("Different display (Max)", 9, 8, 10, "x")], { config: aliasConfig });
  assert.equal(out.ok, true);
  assert.equal(out.profile_proofs[0].method, "evidenced-alias");
});

test("shared calibration ranks new exact models without comparing distinct raw source scales", async () => {
  const calibration = { protocol: 1, id: "local-cohort", domain: "coding", benchmark: "repo-agent-suite", revision: "v1", cohort: "run-123", date: "2026-09-29", url: "https://example.org/calibration/run-123", rows: [
    { ...model("x", "known"), score: 0.1, lower: 0.09, upper: 0.11, samples: 100 },
    { ...model("new", "free"), score: 0.9, lower: 0.89, upper: 0.91, samples: 100 },
  ] };
  const out = await discover([model("x", "known"), model("new", "free")], [row("known (Max)", 9999, 9990, 10000, "x")], { calibration });
  assert.equal(out.policy.sources[0].id, "local-cohort");
  assert.equal(out.policy.profiles.find((p) => p.model_id === "free").priorities.review, 2);
  assert.throws(() => parseCalibration({ ...calibration, domain: "unrelated" }, { domain: "coding", now: NOW }), /domain/);
  assert.throws(() => parseCalibration({ ...calibration, rows: [calibration.rows[0], calibration.rows[0]] }, { domain: "coding", now: NOW }), /duplicated/);
});

test("refreshDue rejects missing/future timestamps and uses a bounded default interval", () => {
  assert.equal(refreshDue(null, { now: NOW }), true);
  assert.equal(refreshDue({ retrieved_at: "2026-09-31" }, { now: NOW }), true);
  assert.equal(refreshDue({ retrieved_at: new Date(NOW + 1).toISOString() }, { now: NOW }), true);
  assert.equal(refreshDue({ retrieved_at: new Date(NOW).toISOString() }, { now: NOW + DAY - 1 }), false);
});

test("re-reading unchanged local calibration cannot extend cached measurement freshness", async () => {
  const calibration = { protocol: 1, id: "local", domain: "coding", benchmark: "suite", revision: "v1", cohort: "run", date: "2026-09-29", url: "https://example.org/run", rows: [
    { ...model("x", "new-model"), score: 0.5, lower: 0.4, upper: 0.6, samples: 20 },
  ] };
  const opts = { participants: [model("x", "new-model")], now: NOW, calibration, fetchImpl: async () => { throw new Error("offline"); } };
  const first = await discoverStrength(opts);
  assert.equal(first.ok, true);
  const again = await discoverStrength({ ...opts, cache: first.cache, now: NOW + DAY - 1 });
  assert.equal(again.policy.generated_at, first.policy.generated_at);
  assert.equal(again.policy.expires_at, first.policy.expires_at);
  assert.equal(again.cache.retrieved_at, first.cache.retrieved_at);
  const expired = await discoverStrength({ ...opts, cache: again.cache, now: NOW + DAY });
  assert.equal(expired.ok, false);
  assert.equal(expired.policy, null);
  assert.match(expired.blockers.join(" "), /calibration refresh required/);
  const retry = await discoverStrength({ ...opts, cache: expired.cache, now: NOW + DAY + 1 });
  assert.equal(retry.ok, false);
});
