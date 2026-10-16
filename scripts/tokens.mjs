#!/usr/bin/env node
// waypost — tokens.mjs
//
// Answers "how many tokens did we spend on keeping the vault, as opposed to
// writing code?" — read-only, from the Claude Code transcripts this project
// already produces. Nothing needs to be enabled ahead of time; it works on
// whatever history is still on disk.
//
// Claude Code is the default source. --harness codex selects a separate offline
// cumulative-counter report; schemas are never combined. OpenCode history is not
// imported. Attribution matches the role prefix this fork installs
// ("waypost-critic", …); upstream's slash-command attribution no longer exists, so
// vault work done from the main thread lands in the unattributed bucket.
//
// Two attribution sources, both written by Claude Code itself:
//   1. subagents — <session>/subagents/agent-*.meta.json carries `agentType`
//      ("waypost-critic", "waypost-reviewer", …). Exact, per agent.
//   2. slash commands — main-thread records carry `attributionSkill` /
//      `attributionPlugin` when a harness plugin provides them; this fork ships
//      no slash commands, so that source is empty unless one is added.
// Anything else in the main thread is unattributed and reported as such.
//
// THREE COUNTING RULES, all load-bearing — get them wrong and the numbers lie:
//   • Dedup by requestId. One API message is written as ONE JSONL RECORD PER
//     CONTENT BLOCK (text + each tool_use). Summing records over-counts ~2.7×.
//   • input/cache_* are identical across a requestId's records, but
//     output_tokens is CUMULATIVE — the final value is in the last record.
//     So: take input/cache from any one record, take max() of output.
//   • Tool calls per turn = distinct tool_use block ids per requestId,
//     collected ACROSS the request's records — counting per record yields a
//     false "1 call/turn" for every turn (each record holds ≤1 tool_use).
//
// COST is computed at current API list prices (PRICING below) with the cache
// multipliers: read 0.1× input (0.05× on Opus/Sonnet 5.5, 0.025× on Fable 5.1),
// 5m write 1.25×, 1h write 2× (the usage records carry the 5m/1h split). Under
// a subscription plan these dollars are only an API-price estimate, not an
// invoice or a conversion to subscription quota. Historical price changes are not
// modeled; everything is priced at today's list. Unknown models are priced at 0
// and reported.
//
// KNOWN BLIND SPOTS (deliberate, documented rather than silently skewed):
//   • Vault edits made in the main thread without an attributed command
//     land in the unattributed bucket — attribution only tags plugin commands.
//   • The SessionStart vault injection is re-read as cache_read on EVERY
//     request of a session, including pure-code ones. That is real vault cost
//     smeared across the main thread; this script does not try to carve it out.
//   • Haiku 5.5 is priced by prompt length (5× the rate above 100k tokens,
//     counted per request over input + cache write + cache read). PRICING
//     carries only the ≤100k tier, so a long Haiku request is under-priced.
//   • Fast mode (2× on Opus 5.5/5/4.8) and US-only inference (1.1×) are not
//     modeled: every request is priced at the standard global rate.
//   • Transcripts are pruned on Claude Code's retention schedule
//     (cleanupPeriodDays, 30 by default), so this is "what's left on disk",
//     not all time. Persisting a per-session roll-up is a separate concern.
//
// Usage:
//   node scripts/tokens.mjs [--runs] [--sessions] [--since YYYY-MM-DD]
//                           [--json] [--project <dir>]

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, basename, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { projectRoot } from "./lib.mjs";
import { createNavigationAnalyzer } from "./token-navigation.mjs";

function die(msg) {
  process.stderr.write(`waypost/tokens: ${msg}\n`);
  process.exit(1);
}

// Where a unit of work sits in the artifact lifecycle. Keyed by the bare agent
// or command name so plugin-prefixed and legacy (pre-v0.13) names both land.
const STAGE_OF = {
  // writing the artifact
  adr: "authoring", research: "authoring", epic: "authoring", story: "authoring",
  spec: "authoring", concept: "authoring", meeting: "authoring", runbook: "authoring",
  // checking the artifact — independent adversarial pass
  critic: "critique", "waypost-critic": "critique", "projectstore-critic": "critique", review: "critique",
  // planning the implementation, then checking the diff against the story
  planner: "planning", "code-planner": "planning",
  reviewer: "code-review", "code-reviewer": "code-review",
  // keeping the vault itself coherent
  librarian: "curation", archaeologist: "curation",
  doctor: "upkeep", kanban: "upkeep", reconcile: "upkeep", codemap: "upkeep",
  status: "upkeep", statusline: "upkeep", search: "upkeep", bind: "upkeep",
  scaffold: "upkeep", agents: "upkeep", tokens: "upkeep",
};
const STAGE_ORDER = ["authoring", "critique", "planning", "code-review", "curation", "upkeep", "other"];

// USD per MTok [input, output, cache-read fraction of input], API list prices
// as of 2026-10-15 (platform.claude.com/docs/en/about-claude/pricing). Cache
// reads are 10% of the input rate except on Opus 5.5 and Sonnet 5.5, where they
// are 5%, and on Fable 5.1, where they are 2.5%; the write multipliers
// (5m 1.25×, 1h 2×) are model-independent. A model missing here prices at $0 and
// is reported as unpriced — when Claude Code starts writing a new id, add it.
export const PRICING = {
  "claude-fable-5-1": [10, 50, 0.025],
  "claude-fable-5": [10, 50],
  "claude-opus-5-5": [4, 20, 0.05],
  "claude-opus-5": [5, 25],
  "claude-opus-4-8": [5, 25],
  "claude-opus-4-7": [5, 25],
  "claude-opus-4-6": [5, 25],
  "claude-sonnet-5-5": [2, 10, 0.05],
  "claude-sonnet-5": [2, 10],
  "claude-sonnet-4-6": [3, 15],
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-haiku-4-5": [1, 5],
};

// Transcripts carry variant ids ("claude-haiku-4-5-20251001", "opus",
// "claude-opus-5[1m]") — normalize before the PRICING lookup so they don't
// silently price at $0. A bare tier name carries no generation, so it lands on
// the 5-series below: a record from a newer default is off by one generation.
const MODEL_ALIASES = { fable: "claude-fable-5-1", opus: "claude-opus-5", sonnet: "claude-sonnet-5", haiku: "claude-haiku-4-5" };

export function normModel(model) {
  if (typeof model !== "string") return "unknown";
  const m = model.replace(/\[[^\]]*\]$/, "").replace(/-\d{8}$/, "");
  return MODEL_ALIASES[m] || m;
}

export function rowCost(row) {
  const p = PRICING[normModel(row.model)];
  if (!p) return 0;
  const [inP, outP, readFrac = 0.1] = p;
  return (
    (row.input * inP + row.cw5m * 1.25 * inP + row.cw1h * 2 * inP + row.cacheRead * readFrac * inP + row.output * outP) / 1e6
  );
}

// Claude Code stores transcripts under ~/.claude/projects/<slug>, where the
// slug is the project path with every non-alphanumeric char replaced by "-".
function transcriptDir(dir) {
  return join(homedir(), ".claude", "projects", dir.replace(/[^a-zA-Z0-9]/g, "-"));
}

function parseArgs(argv) {
  const opts = { json: false, sessions: false, runs: false, summary: false, navigation: false, harness: "claude", since: null, until: null, project: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") opts.json = true;
    else if (a === "--summary") opts.summary = true;
    else if (a === "--navigation") opts.navigation = true;
    else if (a === "--runs") opts.runs = true;
    else if (a === "--sessions") opts.sessions = true;
    else if (["--since", "--until", "--project", "--harness"].includes(a)) {
      const value = argv[++i];
      if (!value || value.startsWith("--")) die(`${a} expects a value`);
      opts[a.slice(2)] = value;
    }
    else if (a === "--help" || a === "-h") opts.help = true;
    else die(`unknown argument: ${a}`);
  }
  for (const key of ["since", "until"]) {
    const value = opts[key];
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) die(`--${key} expects a real YYYY-MM-DD date`);
  }
  if (opts.since && opts.until && opts.since >= opts.until) die("--until must be later than --since (exclusive UTC boundary)");
  if (!["claude", "codex"].includes(opts.harness)) die("--harness expects claude or codex; histories use separate counter schemas");
  return opts;
}

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

// Strip the plugin prefix: "waypost:critic" / "waypost-critic" → "critic". Attribution and
// agentType both carry it; the lifecycle stage is keyed on the bare name.
const bare = (s) => (s.includes(":") ? s.slice(s.lastIndexOf(":") + 1) : s).replace(/^waypost-/, "");

function stageOf(row) {
  return (row.kind !== "main" && STAGE_OF[row.short]) || "other";
}

function readSource(file, kind, audit) {
  const entry = { path: relative(audit.dir, file).split("\\").join("/"), kind, sha256: null, readable: false };
  audit.files.push(entry);
  try {
    const bytes = readFileSync(file);
    entry.sha256 = createHash("sha256").update(bytes).digest("hex");
    entry.readable = true;
    return bytes.toString("utf8");
  } catch {
    audit.coverage.unreadable_files++;
    return null;
  }
}

function eachRecord(file, fn, audit) {
  const raw = readSource(file, "transcript", audit);
  if (raw === null) return;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      audit.coverage.malformed_json_lines++;
      continue;
    }
    if (!rec || typeof rec !== "object" || Array.isArray(rec)) { audit.coverage.invalid_records++; continue; }
    audit.coverage.parsed_records++;
    fn(rec);
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

function collect(dir, opts, project) {
  const rows = new Map();
  // "<session>|<bucket>" → runs. Keyed per session so the session table sums
  // only its own spawns; keying by bucket alone credited every session with
  // the GLOBAL run count of each bucket it touched (~72% inflation).
  const calls = new Map();
  const runLabels = new Set();
  const coverage = { parsed_records: 0, malformed_json_lines: 0, invalid_records: 0, unreadable_files: 0, missing_metadata_files: 0, invalid_metadata_files: 0, assistant_records: 0, missing_request_id_records: 0, missing_usage_records: 0, synthetic_records: 0, filtered_records: 0, missing_timestamp_records: 0, undated_assistant_records: 0, unknown_inline_context_records: 0 };
  const audit = { dir, files: [], coverage };
  const missingUsage = new Set();
  const requestTimes = new Map();
  const navigation = opts.navigation ? createNavigationAnalyzer({ project }) : null;
  const since = opts.since ? Date.parse(opts.since) : -Infinity;
  const until = opts.until ? Date.parse(opts.until) : Infinity;
  let unknownInline = 0;
  const scan = (file, context, fn) => eachRecord(file, (rec) => {
    const timestamp = Date.parse(rec.timestamp);
    const dated = Number.isFinite(timestamp);
    if (!dated) coverage.missing_timestamp_records++;
    if (!dated && rec.type === "assistant" && rec.message?.model !== "<synthetic>") coverage.undated_assistant_records++;
    const withinPeriod = !(opts.since || opts.until) || (dated && timestamp >= since && timestamp < until);
    if (!withinPeriod) coverage.filtered_records++;
    let eventContext = context;
    if (rec.isSidechain && !context.includes("/subagents/")) {
      if (typeof rec.agentId === "string" && rec.agentId) eventContext = `${context}/inline/${rec.agentId}`;
      else {
        coverage.unknown_inline_context_records++;
        // No stable identity means no evidence of retained context across records.
        eventContext = `${context}/inline-unknown/${++unknownInline}`;
      }
    }
    if (withinPeriod) navigation?.observe(rec, { context: eventContext });
    if (rec.type !== "assistant") return;
    coverage.assistant_records++;
    if (rec.message?.model === "<synthetic>") { coverage.synthetic_records++; return; }
    if (typeof rec.requestId !== "string" || !rec.requestId) { if (withinPeriod) coverage.missing_request_id_records++; return; }
    if (dated) {
      const bounds = requestTimes.get(rec.requestId);
      requestTimes.set(rec.requestId, { first: Math.min(bounds?.first ?? timestamp, timestamp), last: Math.max(bounds?.last ?? timestamp, timestamp) });
    }
    const usage = rec.message?.usage;
    if (!usage || typeof usage !== "object" || Array.isArray(usage)) { coverage.missing_usage_records++; missingUsage.add(rec.requestId); return; }
    fn(rec, eventContext);
  }, audit);

  // Subagents FIRST: their attribution is exact, so if the same request also
  // shows up inline in a main transcript, the precise bucket wins the dedup.
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const subs = join(dir, entry.name, "subagents");
    if (!existsSync(subs)) continue;
    for (const f of readdirSync(subs).sort()) {
      if (!f.endsWith(".jsonl")) continue;
      const jsonl = join(subs, f);
      const metaFile = join(subs, f.replace(/\.jsonl$/, ".meta.json"));
      let meta = {};
      if (existsSync(metaFile)) {
        try {
          meta = JSON.parse(readSource(metaFile, "agent-metadata", audit));
          if (!meta || typeof meta !== "object" || Array.isArray(meta)) throw new Error("invalid metadata");
        } catch { coverage.invalid_metadata_files++; meta = {}; }
      } else {
        coverage.missing_metadata_files++;
      }
      const agentType = typeof meta.agentType === "string" && meta.agentType ? meta.agentType : "unknown";
      const desc = typeof meta.description === "string" ? meta.description : "";
      const bucket = `agent: ${agentType}`;
      let run = `${bare(agentType)}: ${desc || f.replace(/\.jsonl$/, "")}`;
      // two spawns can share a description — disambiguate instead of merging
      while (runLabels.has(run)) run += " ²";
      runLabels.add(run);
      const context = `${entry.name}/subagents/${basename(f, ".jsonl")}`;
      scan(jsonl, context, (rec) => {
        ingest(rows, rec, { bucket, kind: "agent", short: bare(agentType), session: entry.name, context, run });
      });
    }
  }

  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith(".jsonl")) continue;
    const session = basename(f, ".jsonl");
    scan(join(dir, f), session, (rec, context) => {
      // Older Claude Code versions inlined subagent turns into the main
      // transcript instead of a subagents/ file; mark them rather than
      // letting them masquerade as main-thread work.
      const bucket = rec.attributionSkill
        ? `cmd: ${rec.attributionSkill}`
        : rec.attributionPlugin
          ? `cmd: ${rec.attributionPlugin}`
          : rec.isSidechain
            ? "agent: (inline, untyped)"
            : "(main thread, unattributed)";
      const kind = rec.attributionSkill || rec.attributionPlugin ? "cmd" : rec.isSidechain ? "agent" : "main";
      const short = rec.attributionSkill ? bare(rec.attributionSkill) : "";
      ingest(rows, rec, { bucket, kind, short, session, context, run: "" });
    });
  }
  // Select whole requests after dedup, so cumulative output crossing midnight
  // cannot duplicate input or turn a clipped request into a complete one.
  const excludedRequestIds = new Set();
  const selected = (id) => !(opts.since || opts.until) || (requestTimes.has(id) && requestTimes.get(id).first >= since && requestTimes.get(id).first < until);
  coverage.boundary_crossing_requests = 0;
  for (const [id, row] of rows) {
    const bounds = requestTimes.get(id);
    if ((opts.since || opts.until) && bounds && bounds.first < until && bounds.last >= since && (bounds.first < since || bounds.last >= until)) coverage.boundary_crossing_requests++;
    if (!selected(id)) { excludedRequestIds.add(id); rows.delete(id); }
    else if (bounds) { row.ts = new Date(bounds.first).toISOString(); row.lastTimestamp = bounds.last; }
  }
  for (const id of missingUsage) if (!selected(id)) excludedRequestIds.add(id);
  const selectedRuns = new Set();
  for (const row of rows.values()) {
    if (row.kind !== "agent" || !row.run || selectedRuns.has(row.context)) continue;
    selectedRuns.add(row.context);
    const key = `${row.session}|${row.bucket}`;
    calls.set(key, (calls.get(key) || 0) + 1);
  }
  countCommandRuns(rows, calls);
  coverage.requests_without_usage = [...missingUsage].filter((id) => selected(id) && !rows.has(id)).length;
  coverage.incomplete_usage_requests = [...rows.values()].filter((row) => !row.usageComplete).length;
  coverage.conflicting_usage_requests = [...rows.values()].filter((row) => row.conflictingUsage).length;
  return { rows, calls, audit, navigation, excludedRequestIds };
}

function isProjectstore(row) {
  return row.kind !== "main" && /(^|[: ])(waypost|projectstore)-?/.test(row.bucket);
}

export function aggregate(rows, keyFn, calls) {
  const out = new Map();
  for (const row of rows.values()) {
    const k = keyFn(row);
    let g = out.get(k);
    if (!g) {
      g = { key: k, reqs: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0, toolCalls: 0, toolTurns: 0, cost: 0, ps: isProjectstore(row), models: new Set(), buckets: new Set(), unpriced: new Set() };
      out.set(k, g);
    }
    g.reqs++;
    g.input += row.input;
    g.cacheWrite += row.cacheWrite;
    g.cacheRead += row.cacheRead;
    g.output += row.output;
    g.toolCalls += row.toolIds.size;
    if (row.toolIds.size > 0) g.toolTurns++;
    g.cost += rowCost(row);
    if (!PRICING[normModel(row.model)]) g.unpriced.add(row.model);
    g.models.add(row.model);
    g.buckets.add(`${row.session}|${row.bucket}`);
  }
  for (const g of out.values()) {
    g.runs = calls ? [...g.buckets].reduce((n, b) => n + (calls.get(b) || 0), 0) : 0;
  }
  return [...out.values()].sort((a, b) => b.cost - a.cost);
}

const n = (v) => v.toLocaleString("en-US");

// `t/turn` — avg distinct tool calls per tool-using turn (batching level; 1.0
// means fully sequential). `cost` — USD at current list prices; cache reads bill
// at 0.025-0.1× input by model, so token counts and dollars rank differently.
const usd = (v) => `$${v.toFixed(2)}`;

function table(groups, label, { runs = false } = {}) {
  const w = Math.max(label.length, ...groups.map((g) => g.key.length));
  const cols = (a, b, c, d, e, f, g2, h) =>
    `${a.padEnd(w)}  ${b.padStart(5)}  ${c.padStart(6)}  ${d.padStart(6)}  ${e.padStart(13)}  ${f.padStart(10)}  ${g2.padStart(8)}${runs ? `  ${h.padStart(9)}` : ""}`;
  const head = cols(label, "runs", "reqs", "t/turn", "cache_rd", "output", "cost", "cost/run");
  const lines = [head, "─".repeat(head.length)];
  for (const g of groups) {
    lines.push(cols(
      g.key, g.runs ? n(g.runs) : "—", n(g.reqs),
      g.toolTurns ? (g.toolCalls / g.toolTurns).toFixed(2) : "—",
      n(g.cacheRead), n(g.output), usd(g.cost),
      g.runs ? usd(g.cost / g.runs) : "—",
    ));
  }
  return lines.join("\n");
}

function totals(groups) {
  const t = { reqs: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0, cost: 0 };
  for (const g of groups) {
    t.reqs += g.reqs;
    t.input += g.input;
    t.cacheWrite += g.cacheWrite;
    t.cacheRead += g.cacheRead;
    t.output += g.output;
    t.cost += g.cost;
  }
  return t;
}

function nativeUsage(list, sourceComplete) {
  const total = list.reduce((sum, row) => sum + row.input + row.cacheWrite + row.cacheRead + row.output, 0);
  const complete = sourceComplete && list.every((row) => row.usageComplete) && Number.isSafeInteger(total);
  const unpriced = [...new Set(list.filter((row) => !PRICING[normModel(row.model)]).map((row) => row.model))].sort();
  const knownCost = list.reduce((sum, row) => sum + (row.usageComplete ? rowCost(row) : 0), 0);
  return {
    requests: list.length,
    complete_usage_requests: list.filter((row) => row.usageComplete).length,
    observed_total_tokens: total,
    total_tokens: complete ? total : null,
    complete,
    estimated_api_cost_usd: complete && !unpriced.length ? +knownCost.toFixed(4) : null,
    known_estimated_api_cost_usd: +knownCost.toFixed(4),
    unpriced_models: unpriced,
  };
}

function gitState(dir) {
  try {
    const git = (args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", timeout: 2000, stdio: ["ignore", "pipe", "ignore"] }).trim();
    return { revision: git(["rev-parse", "HEAD"]), tracked_worktree_dirty: !!git(["status", "--porcelain", "--untracked-files=no"]) };
  } catch { return { revision: null, tracked_worktree_dirty: null }; }
}

function measurementReport(rows, audit, opts, project) {
  const list = [...rows.values()];
  const c = audit.coverage;
  const sourceComplete = !c.unreadable_files && !c.malformed_json_lines && !c.invalid_records && !c.missing_request_id_records && !c.requests_without_usage && (!(opts.since || opts.until) || !c.undated_assistant_records);
  const native = {
    all: nativeUsage(list, sourceComplete),
    waypost: nativeUsage(list.filter(isProjectstore), sourceComplete),
    other: nativeUsage(list.filter((row) => !isProjectstore(row)), sourceComplete),
  };
  // Any incomplete request can change both the denominator and attribution.
  const sharesComplete = native.all.complete;
  const dates = list.map((row) => Date.parse(row.ts)).filter(Number.isFinite).sort((a, b) => a - b);
  const lastDates = list.map((row) => row.lastTimestamp ?? Date.parse(row.ts)).filter(Number.isFinite).sort((a, b) => a - b);
  const analyzerRoot = fileURLToPath(new URL("../", import.meta.url));
  const sourceHashes = ["scripts/tokens.mjs", "scripts/token-navigation.mjs"].map((path) => ({ path, sha256: createHash("sha256").update(readFileSync(join(analyzerRoot, path))).digest("hex") }));
  return {
    report_version: 2,
    measurement: {
      source_harness: "claude-code",
      counter_schema: "claude-request-usage-v1",
      total_formula: "input_tokens + cache_creation_input_tokens + cache_read_input_tokens + output_tokens",
      scope: "retained local transcripts; attributed role usage, not total Waypost overhead",
      unsupported_harnesses: ["codex", "opencode"],
      other_harness_modes: ["codex"],
      subscription_quota_percent: null,
      api_price_estimate_is_subscription_quota: false,
      api_price_estimate_limitations: ["configured standard global prices, not historical prices, fast mode or regional premiums", "Haiku prompt-size tiers are not modeled", "missing cache lifetime split assumes the cheaper 5-minute write tier"],
      source_complete_within_discovered_files: !!sourceComplete,
      context_cost_attribution: "not measured; initiating-request usage is reported separately with --navigation",
    },
    provenance: {
      generated_at: new Date().toISOString(),
      project_root: project,
      project_git: gitState(project),
      analyzer_git: gitState(analyzerRoot),
      analyzer_sources: sourceHashes,
      period: { since_inclusive_utc: opts.since, until_exclusive_utc: opts.until, request_selection: "first observed assistant-block timestamp; all usage blocks of that request are included", navigation_selection: "tool events timestamped inside the period for selected requests; out-of-period results may be missing", observed_first_utc: dates.length ? new Date(dates[0]).toISOString() : null, observed_last_utc: lastDates.length ? new Date(lastDates.at(-1)).toISOString() : null },
      sessions: [...new Set(list.map((row) => row.session))].sort(),
      contexts: [...new Set(list.map((row) => row.context))].sort(),
      input_files: audit.files.sort((a, b) => a.path.localeCompare(b.path)),
      snapshot: "per-file bytes read sequentially; not an atomic snapshot of a live session",
    },
    coverage: { ...c, discovered_files: audit.files.length },
    native_totals: native,
    token_shares: {
      waypost_percent: sharesComplete && native.all.total_tokens > 0 ? 100 * native.waypost.total_tokens / native.all.total_tokens : null,
      basis: "all observed native input, cache creation, cache read and output tokens",
      interpretation: "explicit role/skill attribution; includes useful work; main-thread overhead remains unattributed",
    },
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(
      "Usage: node scripts/tokens.mjs [--harness claude|codex] [--summary] [--runs] [--sessions] [--navigation] [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--json] [--project <dir>]\nDates use UTC; --since is inclusive, --until exclusive. Claude is the default; Codex is a separate native-span report (--runs/--navigation unsupported). This report does not measure subscription quota.\n",
    );
    return;
  }

  const project = resolve(opts.project || projectRoot());
  if (opts.harness === "codex") {
    if (opts.navigation || opts.runs) die("Codex offline history does not support --navigation or --runs; native spans are not requests or verified spawns");
    const { collectCodexReport, formatCodexReport } = await import("./token-codex.mjs");
    const report = await collectCodexReport({ project, since: opts.since, until: opts.until });
    const analyzerRoot = fileURLToPath(new URL("../", import.meta.url));
    report.provenance.project_git = gitState(project);
    report.provenance.analyzer_git = gitState(analyzerRoot);
    report.provenance.analyzer_sources = ["scripts/tokens.mjs", "scripts/token-codex.mjs"].map(path => ({ path, sha256: createHash("sha256").update(readFileSync(join(analyzerRoot, path))).digest("hex") }));
    process.stdout.write(opts.json ? JSON.stringify(report, null, 2) + "\n" : formatCodexReport(report, opts));
    return;
  }
  const dir = transcriptDir(project);
  if (!existsSync(dir)) die(`no transcripts for this project (looked in ${dir})`);

  const { rows, calls, audit, navigation, excludedRequestIds } = collect(dir, opts, project);
  if (rows.size === 0 && !opts.json) die(opts.since ? `no requests since ${opts.since}` : "no assistant requests found (use --json for coverage diagnostics)");

  const byBucket = aggregate(rows, (r) => r.bucket, calls);
  const byStage = aggregate([...rows.values()].filter(isProjectstore), stageOf, calls)
    .sort((a, b) => STAGE_ORDER.indexOf(a.key) - STAGE_ORDER.indexOf(b.key));
  const ps = byBucket.filter((g) => g.ps);
  const rest = byBucket.filter((g) => !g.ps);
  const psT = totals(ps);
  const restT = totals(rest);
  const allT = totals(byBucket);
  const report = measurementReport(rows, audit, opts, project);
  for (const row of rows.values()) row.estimatedApiCostUsd = row.usageComplete && PRICING[normModel(row.model)] ? rowCost(row) : null;
  const navigationReport = navigation?.report(rows, { excludeRequestIds: excludedRequestIds });

  if (opts.json) {
    const shape = (g) => ({
      bucket: g.key,
      runs: g.runs || null,
      requests: g.reqs,
      tool_calls: g.toolCalls,
      tool_turns: g.toolTurns,
      input: g.input,
      cache_write: g.cacheWrite,
      cache_read: g.cacheRead,
      output: g.output,
      cost_usd: +g.cost.toFixed(4),
      models: [...g.models],
      ...(g.unpriced.size ? { unpriced_models: [...g.unpriced] } : {}),
    });
    process.stdout.write(
      JSON.stringify(
        {
          ...report,
          transcript_dir: dir,
          since: opts.since,
          until: opts.until,
          sessions: new Set([...rows.values()].map((r) => r.session)).size,
          pricing_usd_per_mtok: PRICING,
          buckets: byBucket.map(shape),
          stages: byStage.map(shape),
          totals: Object.fromEntries(
            Object.entries({ waypost: psT, other: restT, all: allT }).map(([k, t]) => [k, {
              requests: t.reqs, input: t.input, cache_write: t.cacheWrite,
              cache_read: t.cacheRead, output: t.output, cost_usd: +t.cost.toFixed(4),
            }]),
          ),
          ...(opts.runs ? { agent_runs: aggregate([...rows.values()].filter((r) => r.run), (r) => r.run).map(shape) } : {}),
          ...(opts.sessions ? { by_session: aggregate(rows, (r) => r.session, calls).map(shape) } : {}),
          ...(navigationReport ? { navigation: navigationReport } : {}),
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  if (opts.summary) {
    const all = report.native_totals.all;
    const share = report.token_shares.waypost_percent;
    const lines = [
      `waypost tokens: ${n(rows.size)} requests; ${n(all.observed_total_tokens)} observed native tokens; complete ${all.complete}`,
      `attributed Waypost share: ${share === null ? "unknown" : `${share.toFixed(2)}%`}; Claude Code retained history only; not overhead or subscription quota`,
      `API price estimate: ${all.estimated_api_cost_usd === null ? "unknown" : usd(all.estimated_api_cost_usd)} (not subscription billing)`,
    ];
    if (!all.complete || audit.coverage.missing_metadata_files || audit.coverage.invalid_metadata_files) lines.push("coverage gaps: see --json coverage; unknown agent attribution is retained");
    if (navigationReport) lines.push("navigation analyzed: use --json --navigation for initiating-request and repeated-result evidence; no savings inferred");
    process.stdout.write(lines.join("\n") + "\n");
    return;
  }

  const sessions = new Set([...rows.values()].map((r) => r.session)).size;
  const out = [
    `waypost token usage — ${n(rows.size)} requests across ${sessions} session(s)${opts.since ? `, since ${opts.since}` : ""}${opts.until ? `, until ${opts.until} (exclusive UTC)` : ""}`,
    `source: ${dir}`,
    "",
    table(byBucket, "bucket", { runs: true }),
    "",
    "vault work by lifecycle stage:",
    table(byStage, "stage", { runs: true }),
    "",
    `vault work    ${n(psT.reqs).padStart(6)} reqs   cache_rd ${n(psT.cacheRead)}   out ${n(psT.output)}   cost ${usd(psT.cost)}`,
    `everything else${n(restT.reqs).padStart(5)} reqs   cache_rd ${n(restT.cacheRead)}   out ${n(restT.output)}   cost ${usd(restT.cost)}`,
  ];
  const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : "—");
  out.push(
    "",
    `vault share:  requests ${pct(psT.reqs, allT.reqs)}   output ${pct(psT.output, allT.output)}   cost ${pct(psT.cost, allT.cost)} of ${usd(allT.cost)}`,
    `native tokens: ${n(report.native_totals.all.observed_total_tokens)} observed; attributed Waypost share ${report.token_shares.waypost_percent === null ? "unknown (incomplete usage/coverage)" : `${report.token_shares.waypost_percent.toFixed(2)}%`}`,
    "scope: retained Claude Code transcripts only; role usage is not overhead or subscription quota",
  );
  const unpriced = new Set(byBucket.flatMap((g) => [...g.unpriced]));
  if (unpriced.size) out.push(`⚠ unpriced models (cost counted as $0): ${[...unpriced].join(", ")}`);
  if (!report.native_totals.all.complete) out.push("⚠ incomplete source/usage: native total and share are unknown; legacy columns show observed counters only (see --json coverage)");
  if (unpriced.size) out.push("API estimate: unknown; legacy $0 entries above are placeholders, not free usage");
  if (navigationReport) out.push("", "navigation: offline initiating-request evidence only; not returned-content cost or inferred savings (see --json --navigation)");

  if (opts.runs) {
    out.push("", "per agent run:", table(aggregate([...rows.values()].filter((r) => r.run), (r) => r.run), "run"));
  }
  if (opts.sessions) {
    out.push("", table(aggregate(rows, (r) => r.session, calls), "session", { runs: true }));
  }
  process.stdout.write(out.join("\n") + "\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => die(error.message));
