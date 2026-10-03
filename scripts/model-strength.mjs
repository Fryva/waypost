// Automatic model evidence discovery. No model invocation, credentials or writes.
// Arena source: https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset
// CC-BY-4.0; /rows API: https://huggingface.co/docs/dataset-viewer/rows
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { routingDigest } from "./model-routing.mjs";
import { verifyAuthenticatedCalibrationSummary } from "./team-role-calibration.mjs";

const DAY = 86400000;
const DEFAULT_CONFIG = new URL("../models/strength-sources.json", import.meta.url);
const text = (v) => typeof v === "string" && v.length > 0 && v.length <= 2048 && !/[\u0000-\u001f\u007f]/.test(v);
const key = (m) => JSON.stringify([m.provider, m.model_id, m.reasoning]);
const hash = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const iso = (ms) => new Date(ms).toISOString();
const EFFORT = /\((none|minimal|low|medium|high|xhigh|max|ultra)\)/gi;

function timestamp(v) {
  if (!text(v) || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(v)) return NaN;
  const ms = Date.parse(v);
  if (!Number.isFinite(ms) || iso(ms).slice(0, 10) !== v.slice(0, 10)) return NaN;
  return ms;
}

function https(v) {
  const u = new URL(v);
  if (u.protocol !== "https:" || u.username || u.password || u.port || u.hash) throw new Error("evidence URL must be HTTPS without credentials, port or fragment");
  return u;
}

function bounded(v, name, min, max) {
  if (!Number.isSafeInteger(v) || v < min || v > max) throw new Error(`${name} is outside its bounded range`);
  return v;
}

export function loadStrengthSources() {
  return JSON.parse(readFileSync(DEFAULT_CONFIG, "utf8"));
}

export function refreshDue(cache, { now = Date.now(), intervalMs = DAY } = {}) {
  const ms = typeof now === "number" ? now : Date.parse(now);
  const last = timestamp(cache?.retrieved_at);
  return !Number.isFinite(ms) || !Number.isFinite(last) || last > ms || ms - last >= intervalMs;
}

function validateConfig(raw) {
  if (!raw || raw.protocol !== 1 || !Array.isArray(raw.sources) || !raw.sources.length || raw.sources.length > 16) throw new Error("strength source registry must have protocol 1 and 1 to 16 sources");
  const config = { ...raw,
    refresh_interval_ms: bounded(raw.refresh_interval_ms ?? DAY, "refresh_interval_ms", 60000, DAY),
    max_age_ms: bounded(raw.max_age_ms ?? 7 * DAY, "max_age_ms", DAY, 30 * DAY),
    timeout_ms: bounded(raw.timeout_ms ?? 10000, "timeout_ms", 100, 30000),
    max_bytes: bounded(raw.max_bytes ?? 2097152, "max_bytes", 1024, 4194304),
    max_rows: bounded(raw.max_rows ?? 2000, "max_rows", 1, 10000),
  };
  const ids = new Set();
  for (const source of config.sources) {
    if (!text(source.id) || ids.has(source.id) || source.type !== "arena-hf") throw new Error("unsupported or duplicate strength source");
    ids.add(source.id);
    const u = https(source.url);
    // No arbitrary destinations, redirects, localhost or private IPs. Registry
    // additions need a reviewed parser, not an agent-supplied URL to fetch.
    if (u.hostname !== "datasets-server.huggingface.co" || u.pathname !== "/rows" || u.search) throw new Error("untrusted strength endpoint");
    if (source.dataset !== "lmarena-ai/leaderboard-dataset" || !["agent", "text_style_control", "webdev"].includes(source.subset)) throw new Error("unsupported Arena dataset or subset");
    if (!text(source.category) || !Array.isArray(source.domains) || source.domains.some((d) => !text(d))) throw new Error("source must declare category and domains");
    https(source.docs);
  }
  if (!Array.isArray(raw.aliases ?? []) || (raw.aliases ?? []).length > 10000) throw new Error("aliases must be a bounded array");
  const aliases = new Set();
  for (const alias of raw.aliases ?? []) {
    if (!ids.has(alias.source) || ![alias.provider, alias.model_id, alias.reasoning, alias.organization, alias.model_name].every(text)) throw new Error("alias must identify an exact model and source row");
    // Evidence maps API IDs to source names; it never supplies a strength rank.
    https(alias.evidence);
    if (alias.reasoning_evidence !== undefined) https(alias.reasoning_evidence);
    const ak = `${alias.source}:${key(alias)}`;
    if (aliases.has(ak)) throw new Error("duplicate exact model alias");
    aliases.add(ak);
  }
  return config;
}

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

async function fetchArena(source, fetchImpl, config) {
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

export function parseArenaRows(rows, source, { now = Date.now(), maxAgeMs = 7 * DAY } = {}) {
  if (!Array.isArray(rows) || !rows.length) throw new Error("Arena dataset is empty");
  const selected = rows.filter((r) => r?.category === source.category);
  if (!selected.length) throw new Error("Arena has no requested category");
  const seen = new Set();
  let publishDate = null;
  return selected.map((r) => {
    const date = timestamp(r.leaderboard_publish_date);
    if (!Number.isFinite(date) || date > now || now - date >= maxAgeMs) throw new Error("Arena published evidence is stale or future-dated");
    if (publishDate !== null && publishDate !== r.leaderboard_publish_date) throw new Error("Arena contains mixed publication dates");
    publishDate = r.leaderboard_publish_date;
    const [score, lower, upper, samples] = source.subset === "agent"
      ? [r.score, r.score_ci_lower, r.score_ci_upper, r.session_count]
      : [r.rating, r.rating_lower, r.rating_upper, r.vote_count];
    if (![score, lower, upper].every(Number.isFinite) || lower > score || score > upper || !Number.isFinite(samples) || samples <= 0) throw new Error("Arena score, confidence interval or sample count is invalid");
    if (![r.organization, r.model_name].every(text)) throw new Error("Arena model identity is invalid");
    const identity = JSON.stringify([r.organization, r.model_name]);
    if (seen.has(identity)) throw new Error("Arena contains duplicate model rows");
    seen.add(identity);
    // Reasoning appears in the official dataset's display identifier. Do not
    // strip versions, fuzzy-match names, infer a provider, or use price/license.
    const efforts = [...r.model_name.matchAll(EFFORT)].map((m) => m[1].toLowerCase());
    const effort = efforts.length === 1 ? efforts[0] : "unknown";
    return { provider: r.organization, model_id: r.model_name, reasoning: effort, score, lower, upper, date: r.leaderboard_publish_date, source: source.id, source_row: r };
  });
}

// Calibration is collected elsewhere in a verified sandbox. This parser does
// not run models or turn a participant's self-reported quality into evidence.
// All rows must belong to one exact benchmark/domain/revision/cohort.
export function parseCalibration(evidence, { domain, now = Date.now(), maxAgeMs = 7 * DAY } = {}) {
  if (!evidence || evidence.protocol !== 1 || !text(evidence.id) || evidence.domain !== domain || !text(evidence.benchmark) || !text(evidence.revision) || !text(evidence.cohort)) throw new Error("calibration requires one benchmark revision, domain and cohort");
  https(evidence.url);
  const date = timestamp(evidence.date);
  if (!Number.isFinite(date) || date > now || now - date >= maxAgeMs) throw new Error("calibration is stale or future-dated");
  if (!Array.isArray(evidence.rows) || !evidence.rows.length || evidence.rows.length > 1024) throw new Error("calibration rows are missing or too large");
  const seen = new Set();
  return evidence.rows.map((r) => {
    if (![r.provider, r.model_id, r.reasoning].every(text) || seen.has(key(r))) throw new Error("calibration exact identity missing or duplicated");
    seen.add(key(r));
    if (![r.score, r.lower, r.upper].every(Number.isFinite) || r.lower > r.score || r.score > r.upper || !Number.isSafeInteger(r.samples) || r.samples < 2) throw new Error("invalid calibrated interval or sample count");
    return { provider: r.provider, model_id: r.model_id, reasoning: r.reasoning, score: r.score, lower: r.lower, upper: r.upper, date: evidence.date, source: evidence.id, source_row: r };
  });
}

function tiers(rows) {
  // Strictly disjoint confidence intervals form a partial order. Peeling its
  // maximal frontier preserves every proven stronger-than edge; a chain of
  // overlapping intervals cannot promote C above A when A.lower > C.upper.
  const incoming = rows.map(() => 0), weaker = rows.map(() => []);
  for (let i = 0; i < rows.length; i++) for (let j = 0; j < rows.length; j++) {
    if (rows[i].lower > rows[j].upper) { weaker[i].push(j); incoming[j]++; }
  }
  const groups = [];
  let frontier = incoming.map((count, i) => count === 0 ? i : -1).filter((i) => i >= 0);
  while (frontier.length) {
    groups.push(frontier.map((i) => rows[i]));
    const next = [];
    for (const i of frontier) for (const j of weaker[i]) if (--incoming[j] === 0) next.push(j);
    frontier = next;
  }
  return groups.flatMap((group, i) => group.map((row) => ({ ...row, priority: groups.length - i })));
}

function identities(participants) {
  if (!Array.isArray(participants) || participants.length > 1024) throw new Error("participants must be a bounded array");
  const unique = new Map();
  for (const p of participants) {
    const m = p.model ?? p;
    if (![m.provider, m.model_id, m.reasoning].every(text)) throw new Error("participant must have an exact provider/model/reasoning identity");
    unique.set(key(m), { provider: m.provider, model_id: m.model_id, reasoning: m.reasoning });
  }
  return [...unique.values()].sort((a, b) => key(a).localeCompare(key(b)));
}

// Representation-only equivalence, not similarity: keep every letter, digit,
// decimal point, date and suffix. Never remove "preview", "free", a revision,
// or a provider wrapper. Ambiguous normalized spellings remain unknown.
const spelling = (v) => v.toLowerCase().replace(/[\s_-]/g, "");
function sourceSpelling(row) {
  return spelling(row.model_id.replace(EFFORT, ""));
}

function matchModels(models, rows, aliases, source) {
  const byKey = new Map(rows.map((r) => [key(r), r]));
  const matched = [], missing = [], proofs = [];
  for (const m of models) {
    let row = m.reasoning === "unknown" ? undefined : byKey.get(key(m));
    let method = "exact";
    let aliasProof = null;
    if (!row) {
      const same = rows.filter((r) => r.reasoning !== "unknown" && spelling(r.provider) === spelling(m.provider)
        && sourceSpelling(r) === spelling(m.model_id) && r.reasoning === m.reasoning.toLowerCase());
      if (same.length === 1) { row = same[0]; method = "canonical-spelling"; }
    }
    if (!row) {
      const alias = aliases.find((a) => a.source === source && key(a) === key(m));
      if (alias) { row = rows.find((r) => r.provider === alias.organization && r.model_id === alias.model_name
        && m.reasoning !== "unknown" && (r.reasoning === m.reasoning || (r.reasoning === "unknown" && text(alias.reasoning_evidence))));
        method = "evidenced-alias";
        aliasProof = { identity_evidence: alias.evidence, ...(alias.reasoning_evidence ? { reasoning_evidence: alias.reasoning_evidence } : {}) };
      }
    }
    if (row) {
      matched.push({ ...row, ...m });
      proofs.push({ ...m, source, method, ...(aliasProof ? { alias_evidence: aliasProof } : {}), source_identity: { organization: row.provider, model_name: row.model_id, reasoning: row.reasoning }, source_row: row.source_row, source_row_digest: hash(row.source_row), interval: { lower: row.lower, score: row.score, upper: row.upper }, published_at: row.date });
    }
    else missing.push({ ...m, reason: "exact identity absent from source; evidenced alias or shared calibration required" });
  }
  return { matched, missing, proofs };
}

export async function discoverStrength({ participants, domain = "coding", config: rawConfig, cache = null, calibration = null, fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  const blockers = [], candidates = [];
  let config, models;
  const ms = typeof now === "number" ? now : Date.parse(now);
  try {
    if (!Number.isFinite(ms) || !text(domain)) throw new Error("invalid discovery clock or domain");
    config = validateConfig(rawConfig ?? loadStrengthSources());
    models = identities(participants);
  } catch (error) { return { ok: false, policy: null, blockers: [error.message], unclassified: [], cache: null }; }
  const configHash = hash(config);
  const cachedSources = [];
  for (const source of config.sources.filter((s) => s.domains.includes(domain))) {
    try {
      const cached = cache?.config_hash === configHash ? cache.sources?.find((s) => s.id === source.id) : null;
      const reuse = cached && !refreshDue(cached, { now: ms, intervalMs: config.refresh_interval_ms });
      const rows = reuse ? cached.rows : await fetchArena(source, fetchImpl, config);
      const parsed = parseArenaRows(rows, source, { now: ms, maxAgeMs: config.max_age_ms });
      const retrievedAt = reuse ? cached.retrieved_at : iso(ms);
      cachedSources.push({ id: source.id, retrieved_at: retrievedAt, rows });
      candidates.push({ ...matchModels(models, parsed, config.aliases ?? [], source.id), source: { id: source.id, url: source.docs, retrieved_at: retrievedAt } });
    } catch (error) { blockers.push(`${source.id}: ${error.message}`); }
  }
  if (calibration) {
    try {
      const rows = parseCalibration(calibration, { domain, now: ms, maxAgeMs: config.max_age_ms });
      // Re-reading an unchanged local calibration is not a new measurement.
      const calibrationHash = hash(calibration);
      const previous = cache?.calibration?.fingerprint === calibrationHash ? cache.calibration : null;
      const retrievedAt = previous?.retrieved_at ?? iso(ms);
      if (refreshDue({ retrieved_at: retrievedAt }, { now: ms, intervalMs: config.refresh_interval_ms })) throw new Error("calibration refresh required; unchanged local evidence cannot renew freshness");
      candidates.push({ ...matchModels(models, rows, [], calibration.id), calibration: { fingerprint: calibrationHash, retrieved_at: retrievedAt }, source: { id: calibration.id, url: calibration.url, retrieved_at: retrievedAt } });
    } catch (error) { blockers.push(`calibration: ${error.message}`); }
  }
  // Select one common evidence scale; never combine raw scores, even across
  // two Arena subsets or benchmark revisions. A shared calibration wins ties.
  candidates.sort((a, b) => b.matched.length - a.matched.length || Number(b.source.id === calibration?.id) - Number(a.source.id === calibration?.id));
  const selected = candidates.find((c) => c.matched.length);
  if (!selected) return { ok: false, policy: null, blockers: [...blockers, "no fresh comparable evidence for exact participant identities"], unclassified: models.map((m) => ({ ...m, reason: "unknown; calibration required" })), cache: { config_hash: configHash, retrieved_at: cachedSources.at(-1)?.retrieved_at ?? null, sources: cachedSources, ...(cache?.calibration ? { calibration: cache.calibration } : {}) } };
  // Rank against the entire selected participant cohort, retaining historical
  // required descriptors supplied by the authority even if they are offline.
  const profiles = tiers(selected.matched).map((r) => ({ provider: r.provider, model_id: r.model_id, reasoning: r.reasoning, priorities: { coordinate: r.priority, implement: r.priority, review: r.priority }, source: r.source, date: r.date })).sort((a, b) => key(a).localeCompare(key(b)));
  const fingerprint = hash({ domain, source: selected.source.id, profiles });
  const oldRevision = Number.isSafeInteger(cache?.revision) && cache.revision > 0 ? cache.revision : 0;
  const revision = cache?.fingerprint === fingerprint && oldRevision ? oldRevision : oldRevision + 1;
  const expiration = Math.min(timestamp(selected.source.retrieved_at) + config.refresh_interval_ms, ...profiles.map((p) => timestamp(p.date) + config.max_age_ms));
  const sameEvidence = cache?.fingerprint === fingerprint && cache?.retrieved_at === selected.source.retrieved_at;
  const generatedAt = sameEvidence ? cache.generated_at ?? selected.source.retrieved_at : iso(ms);
  const policy = { protocol: 1, revision, domain, mode: "automatic", generated_at: generatedAt, expires_at: iso(expiration), sources: [selected.source], profiles };
  return { ok: true, policy, profile_proofs: selected.proofs, unclassified: selected.missing, blockers, cache: { config_hash: configHash, retrieved_at: selected.source.retrieved_at, generated_at: generatedAt, sources: cachedSources, fingerprint, revision, ...(selected.calibration ? { calibration: selected.calibration } : {}) } };
}


// Diagnostic-only protocol 2 proposal. Neither an imported score nor an Arena
// alias can supply native configuration coverage or activate a team policy.
export function compileCalibrationPolicyV2(authenticatedSummary, { revision = 1, now = Date.now } = {}) {
  const ms = typeof now === "function" ? now() : now;
  if (!Number.isSafeInteger(ms) || ms < 0 || !Number.isSafeInteger(revision) || revision < 1) throw new Error("calibration-policy-clock-or-revision-required");
  const summary = verifyAuthenticatedCalibrationSummary(authenticatedSummary, { now: ms });
  const roles = ["coordinate", "review"], priorities = new Map(), scales = {};
  for (const role of roles) {
    const rows = [];
    for (const p of summary.profiles) {
      const record = p.roles.find(r => r.role === role);
      if (!record?.current || !record.qualification_candidate || !record.qualified) continue;
      const interval = record.confidence;
      if (record.cohort !== summary.cohort || record.suite_digest !== summary.suite_digest || record.grading_digest !== summary.criteria_digest || record.benchmark !== "waypost-protocol-roles" || record.revision !== "1" || record.coverage !== "waypost-protocol-" + role || interval?.method !== "wilson-95" || ![interval.lower,interval.score,interval.upper].every(Number.isFinite) || interval.lower < 0 || interval.upper > 1 || interval.lower > interval.score || interval.score > interval.upper || Date.parse(record.observed_at) > ms || Date.parse(record.expires_at) <= ms) throw new Error("calibration-policy-role-scale-or-clock-mismatch");
      rows.push({ profile_id:p.identity.profile_id, lower:interval.lower, score:interval.score, upper:interval.upper });
    }
    for (const row of tiers(rows)) {
      if (!priorities.has(row.profile_id)) priorities.set(row.profile_id, {});
      priorities.get(row.profile_id)[role] = row.priority;
    }
    scales[role] = { benchmark:"waypost-protocol-roles",revision:"1",cohort:summary.cohort,suite_digest:summary.suite_digest,criteria_digest:summary.criteria_digest,confidence:"wilson-95",comparison:"strict-disjoint-interval-partial-order",eligible_profiles:rows.map(r=>r.profile_id).sort() };
  }
  const profiles = summary.profiles.map(p => {
    const calibration = Object.fromEntries(roles.map(role=>[role,structuredClone(p.roles.find(r=>r.role===role) || null)]));
    const rank = Object.fromEntries([...roles,"implement"].map(role=>[role,priorities.get(p.identity.profile_id)?.[role] ?? null]));
    return { identity:structuredClone(p.identity),participant:p.participant,incarnation:p.incarnation,model_revision:p.model_revision,descriptor_digest:p.descriptor_digest,priorities:rank,role_coverage:{coordinate:rank.coordinate===null?[]:["waypost-protocol-coordinate"],review:rank.review===null?[]:["waypost-protocol-review"],implement:[]},calibration };
  });
  const proposal = { protocol:2,mode:"automatic-calibration-proposal",revision,generated_at:summary.generated_at,expires_at:summary.expires_at,provenance:{kind:"authenticated-calibration-summary",team:summary.team,cohort:summary.cohort,authority_revision:summary.authority_revision,suite_digest:summary.suite_digest,criteria_digest:summary.criteria_digest,captures_digest:summary.captures_digest,summary_digest:routingDigest(summary)},scales,profiles,activation:false,authority_granted:false,limitations:"Finite correlated protocol calibration only. Overlapping intervals are an uncertainty frontier, not proof of equal ability. No architecture, implementation, workspace-write or publication qualification; no stable hidden backend or invoice attestation." };
  function freeze(value) { if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }
  return freeze(proposal);
}
