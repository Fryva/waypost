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

import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { projectRoot } from "./lib.mjs";

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

export { ingest, countCommandRuns } from "./token-requests.mjs";

function stageOf(row) {
  return (row.kind !== "main" && STAGE_OF[row.short]) || "other";
}

import { collect } from "./token-collect.mjs";

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

import { n, usd, table, totals } from "./token-table.mjs";

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
  const sourceHashes = ["scripts/tokens.mjs", "scripts/token-navigation.mjs", "scripts/token-table.mjs", "scripts/token-requests.mjs", "scripts/token-collect.mjs"].map((path) => ({ path, sha256: createHash("sha256").update(readFileSync(join(analyzerRoot, path))).digest("hex") }));
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
    report.provenance.analyzer_sources = ["scripts/tokens.mjs", "scripts/token-codex.mjs", "scripts/token-codex-format.mjs", "scripts/token-table.mjs", "scripts/token-requests.mjs", "scripts/token-collect.mjs"].map(path => ({ path, sha256: createHash("sha256").update(readFileSync(join(analyzerRoot, path))).digest("hex") }));
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
