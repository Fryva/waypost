// waypost — tokens.mjs: usage/cost accounting from Claude Code's own transcripts
// (P3-4, G-14). Builds a minimal transcript fixture under a throwaway HOME
// and drives the CLI with `--project <dir>`, since tokens.mjs reads
// ~/.claude/projects/<slug> rather than anything waypost itself writes.
//   node --test tests/*.test.mjs

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync as fsMkdtemp, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { rowCost, normModel } from "../scripts/tokens.mjs";
import { ambientEnv } from "./env.mjs";

// Every temp dir this file makes goes through here and is removed once its
// tests finish, so a run leaves nothing behind in $TMPDIR (WP-17).
const TMP_DIRS = [];
const mkdtempSync = (prefix) => { const p = fsMkdtemp(prefix); TMP_DIRS.push(p); return p; };
after(() => { for (const p of TMP_DIRS) rmSync(p, { recursive: true, force: true }); });

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const TOKENS = join(REPO, "scripts", "tokens.mjs");

// Mirrors tokens.mjs's own transcriptDir(): the slug is the project path with
// every non-alphanumeric character replaced by "-". The project path itself
// never needs to exist on disk — it is only used to derive this slug and to
// echo back `transcript_dir`.
const slugOf = (dir) => dir.replace(/[^a-zA-Z0-9]/g, "-");

// Builds ~/.claude/projects/<slug>/ with:
//   - a main-thread transcript, <session>.jsonl, carrying one request
//     (req1) split across two JSONL records — the shape every real turn with
//     a tool call takes: one record per content block, output cumulative.
//   - a subagent transcript, <session>/subagents/agent-1.{meta,jsonl}, with
//     agentType "waypost-critic" — the exact attribution shape Claude Code writes.
function fixture() {
  const home = mkdtempSync(join(tmpdir(), "waypost-tok-home-"));
  const project = join(tmpdir(), "waypost-tok-project-does-not-exist");
  const slug = slugOf(project);
  const dir = join(home, ".claude", "projects", slug);
  mkdirSync(dir, { recursive: true });

  const usage = (input, output, extra = {}) => ({
    input_tokens: input, output_tokens: output,
    cache_creation_input_tokens: 0, cache_read_input_tokens: 0, ...extra,
  });

  // req1: two records, same requestId — the first content block is a tool
  // call, the second is the final text. output_tokens is cumulative (5 then
  // 20), and each record carries a distinct tool_use id.
  const rec1a = {
    type: "assistant", requestId: "req1", timestamp: "2026-08-20T10:00:00Z",
    message: {
      model: "claude-sonnet-5-20250101", usage: usage(1000, 5),
      content: [{ type: "tool_use", id: "call_a" }],
    },
  };
  const rec1b = {
    type: "assistant", requestId: "req1", timestamp: "2026-08-20T10:00:01Z",
    message: {
      model: "claude-sonnet-5-20250101", usage: usage(1000, 20),
      content: [{ type: "tool_use", id: "call_b" }, { type: "text", text: "done" }],
    },
  };
  writeFileSync(join(dir, "session1.jsonl"), [rec1a, rec1b].map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");

  // The subagent run: one meta file (the spawn) and its own JSONL, both
  // named the same stem, inside <session>/subagents/ — <session> matching
  // the main-thread transcript's own basename, exactly as Claude Code lays
  // it out for one session that spawned one subagent.
  const subs = join(dir, "session1", "subagents");
  mkdirSync(subs, { recursive: true });
  writeFileSync(join(subs, "agent-1.meta.json"),
    JSON.stringify({ agentType: "waypost-critic", description: "Test critic run" }), "utf8");
  const rec2 = {
    type: "assistant", requestId: "req2", timestamp: "2026-08-20T10:05:00Z",
    message: {
      model: "claude-sonnet-5-20250101", usage: usage(500, 50),
      content: [{ type: "tool_use", id: "call_c" }],
    },
  };
  writeFileSync(join(subs, "agent-1.jsonl"), JSON.stringify(rec2) + "\n", "utf8");

  return { home, project };
}

function run(home, args) {
  return spawnSync(process.execPath, [TOKENS, ...args], {
    // HOME and USERPROFILE both: os.homedir() reads the first on POSIX and
    // the second on Windows, and tokens.mjs finds transcripts under it.
    encoding: "utf8", env: { ...ambientEnv(), HOME: home, USERPROFILE: home }, timeout: 15000,
  });
}

test("tokens: dedups by requestId — output is max() across records, tool calls are distinct ids unioned across them", () => {
  const { home, project } = fixture();
  const r = run(home, ["--project", project, "--json"]);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  const main = out.buckets.find((b) => b.bucket === "(main thread, unattributed)");
  assert.ok(main, `expected the unattributed main-thread bucket, got: ${JSON.stringify(out.buckets)}`);
  assert.equal(main.requests, 1, "two JSONL records, one requestId, one row");
  assert.equal(main.output, 20, "output_tokens is cumulative — the max across the request's records wins, not the sum (5+20)");
  assert.equal(main.tool_calls, 2, "tool_use ids from BOTH records are unioned, not just the last record's");
});

test("tokens: a subagent run is attributed by its meta.json's agentType, and counted as waypost work", () => {
  const { home, project } = fixture();
  const r = run(home, ["--project", project, "--json"]);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  const agent = out.buckets.find((b) => b.bucket === "agent: waypost-critic");
  assert.ok(agent, `expected an "agent: waypost-critic" bucket, got: ${JSON.stringify(out.buckets)}`);
  assert.equal(agent.requests, 1);
  assert.equal(agent.runs, 1, "one meta.json is one spawn");
  // isProjectstore requires kind !== "main" and a bucket naming waypost/projectstore
  // — the reason vault-work totals do not also count the main thread's own,
  // unattributed requests.
  const critique = out.stages.find((s) => s.bucket === "critique");
  assert.ok(critique, `waypost-critic maps to the "critique" lifecycle stage: ${JSON.stringify(out.stages)}`);
  assert.equal(critique.requests, 1);
});

test("tokens: --json carries the shape callers rely on (transcript_dir, sessions, pricing, totals)", () => {
  const { home, project } = fixture();
  const r = run(home, ["--project", project, "--json"]);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.transcript_dir, join(home, ".claude", "projects", slugOf(project)));
  assert.equal(out.sessions, 1, "both the main thread and the subagent belong to session1");
  assert.ok(out.pricing_usd_per_mtok["claude-sonnet-5"], "pricing table is exposed for the model actually used");
  assert.ok(out.totals.waypost && out.totals.other && out.totals.all, "the three-way split is always present");
  assert.equal(out.totals.all.requests, 2, "req1 + req2, deduped");
});

test("tokens: text mode (no --json) runs end to end without throwing", () => {
  const { home, project } = fixture();
  const r = run(home, ["--project", project]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /waypost token usage/);
  assert.match(r.stdout, /vault share:/);
});

test("tokens: a corpus entirely missing usage still emits JSON coverage instead of a false zero", () => {
  const { home, project } = fixture();
  const dir = join(home, ".claude", "projects", slugOf(project));
  rmSync(join(dir, "session1"), { recursive: true, force: true });
  writeFileSync(join(dir, "session1.jsonl"), JSON.stringify({
    type: "assistant", requestId: "missing-only", timestamp: "2026-10-14T10:00:00Z",
    message: { model: "claude-sonnet-5", content: [] },
  }) + "\n");
  const r = run(home, ["--project", project, "--json"]);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.coverage.requests_without_usage, 1);
  assert.equal(out.native_totals.all.total_tokens, null);
  assert.equal(out.token_shares.waypost_percent, null);
});

test("tokens: no transcripts for this project says so, rather than crashing or printing nothing", () => {
  const home = mkdtempSync(join(tmpdir(), "waypost-tok-home-"));
  const project = join(tmpdir(), "waypost-tok-project-truly-absent");
  const r = run(home, ["--project", project]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /no transcripts for this project/);
});

test("tokens: Claude Fable 5.1 is priced by its own id and alias, with cache reads at 2.5% of input, not 10%", () => {
  assert.equal(normModel("claude-fable-5-1[1m]"), "claude-fable-5-1");
  assert.equal(normModel("fable"), "claude-fable-5-1");
  const read = (model) => rowCost({ model, input: 0, cw5m: 0, cw1h: 0, cacheRead: 1e6, output: 0 });
  assert.equal(read("claude-fable-5-1"), 0.25, "$0.25/MTok on Fable 5.1 (platform.claude.com models overview, 2026-09-03)");
  assert.equal(read("claude-opus-5"), 0.5, "10% of $5 everywhere else");
  assert.equal(rowCost({ model: "claude-sonnet-5", input: 1e6, cw5m: 0, cw1h: 0, cacheRead: 0, output: 1e6 }), 12,
    "$2 in, $10 out is the base price now, not an introductory one");
});

// A model Claude Code writes but PRICING lacks prices at $0 — that is how the
// whole cost column went to zero once the 5.5 generation landed and the table
// still held 2026-09-03 prices.
test("tokens: the 5.5 generation is priced by its own ids, with cache reads at 5% of input", () => {
  const read = (model) => rowCost({ model, input: 0, cw5m: 0, cw1h: 0, cacheRead: 1e6, output: 0 });
  assert.equal(read("claude-opus-5-5"), 0.2, "$0.20/MTok: 5% of $4, not the 10% default (platform.claude.com pricing, 2026-10-15)");
  assert.equal(read("claude-sonnet-5-5"), 0.1, "5% of $2");
  assert.equal(rowCost({ model: "claude-opus-5-5", input: 1e6, cw5m: 0, cw1h: 0, cacheRead: 0, output: 1e6 }), 24, "$4 in, $20 out");
  assert.equal(rowCost({ model: "claude-opus-5-5", input: 0, cw5m: 1e6, cw1h: 1e6, cacheRead: 0, output: 0 }), 13, "the model-independent write multipliers hold: 5m $5 + 1h $8");
  assert.equal(rowCost({ model: "claude-sonnet-5-5-20261001", input: 1e6, cw5m: 0, cw1h: 0, cacheRead: 0, output: 0 }), 2, "a dated variant normalizes onto the same price");
  assert.equal(rowCost({ model: "claude-haiku-5-5", input: 1e6, cw5m: 0, cw1h: 0, cacheRead: 0, output: 1e6 }), 0.6, "$0.10 in, $0.50 out — the ≤100k-prompt tier, the only one PRICING models");
  assert.equal(rowCost({ model: "claude-astra-9", input: 1e6, cw5m: 1e6, cw1h: 1e6, cacheRead: 1e6, output: 1e6 }), 0, "an unknown model stays $0 and is reported, never guessed at");
});

// One transcript, one model: the minimal shape that decides whether the cost
// column holds a number or a column of zeros.
function singleModelHome(model) {
  const home = mkdtempSync(join(tmpdir(), "waypost-tok-home-"));
  const project = join(tmpdir(), "waypost-tok-project-price-check");
  const dir = join(home, ".claude", "projects", slugOf(project));
  mkdirSync(dir, { recursive: true });
  const rec = {
    type: "assistant", requestId: "r1", timestamp: "2026-10-14T10:00:00Z",
    message: {
      model,
      usage: { input_tokens: 1e6, output_tokens: 1e6, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      content: [{ type: "text", text: "x" }],
    },
  };
  writeFileSync(join(dir, "s.jsonl"), JSON.stringify(rec) + "\n", "utf8");
  return { home, project };
}

test("tokens: a transcript on a priced model costs something and warns about nothing", () => {
  const { home, project } = singleModelHome("claude-opus-5-5");
  const r = run(home, ["--project", project, "--json"]);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.totals.all.cost_usd, 24);
  assert.equal(out.buckets[0].unpriced_models, undefined);
  assert.doesNotMatch(run(home, ["--project", project]).stdout, /unpriced/);
});

test("tokens: a model PRICING does not know is $0 and says so, rather than looking free", () => {
  const { home, project } = singleModelHome("claude-astra-9");
  const r = run(home, ["--project", project, "--json"]);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.totals.all.cost_usd, 0);
  assert.deepEqual(out.buckets[0].unpriced_models, ["claude-astra-9"]);
  const text = run(home, ["--project", project]);
  assert.match(text.stdout, /unpriced models \(cost counted as \$0\): claude-astra-9/);
});

test("tokens: a locally-synthesized assistant message is no API request — no row, no unpriced warning", () => {
  const { home, project } = fixture();
  const dir = join(home, ".claude", "projects", slugOf(project));
  // The shape Claude Code writes when it composes a message itself (an
  // interrupt, an error): a real requestId, model "<synthetic>", every counter 0.
  const rec = {
    type: "assistant", requestId: "req9", timestamp: "2026-10-14T11:00:00Z",
    message: {
      model: "<synthetic>",
      usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      content: [{ type: "text", text: "[Request interrupted by user]" }],
    },
  };
  writeFileSync(join(dir, "session2.jsonl"), JSON.stringify(rec) + "\n", "utf8");
  const r = run(home, ["--project", project, "--json"]);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.totals.all.requests, 2, "the fixture's two real requests; the synthetic one is not a row");
  assert.equal(out.sessions, 1, "a session holding only a synthetic record contributes no session of its own");
  assert.ok(out.buckets.every((b) => b.unpriced_models === undefined),
    "it is not a model, so it must not trip the warning that a real price gap relies on");
  assert.doesNotMatch(run(home, ["--project", project]).stdout, /unpriced/);
});

// Small on-disk corpora exercise the public CLI, including inventory and hashes.
function accountingFixture(files) {
  const home = mkdtempSync(join(tmpdir(), "waypost-tok-accounting-"));
  const project = join(home, "project");
  const dir = join(home, ".claude", "projects", slugOf(project));
  mkdirSync(project);
  mkdirSync(dir, { recursive: true });
  for (const [path, records] of Object.entries(files)) {
    const file = join(dir, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, typeof records === "string" ? records : records.map((r) => JSON.stringify(r)).join("\n") + "\n");
  }
  return { home, project, dir };
}

function accountingRecord(requestId, usage = {}, extra = {}) {
  return {
    type: "assistant", requestId, timestamp: "2026-10-14T12:00:00Z",
    message: { model: "claude-sonnet-5-5", usage: {
      input_tokens: 100, cache_creation_input_tokens: 30, cache_read_input_tokens: 200, output_tokens: 10, ...usage,
    }, content: [] }, ...extra,
  };
}

function accountingReport(f, args = []) {
  const result = run(f.home, ["--project", f.project, "--json", ...args]);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("tokens: native totals add cache creation once even when its pricing split is present", () => {
  const main = accountingRecord("main");
  const agent = accountingRecord("critic", { cache_creation: { ephemeral_5m_input_tokens: 10, ephemeral_1h_input_tokens: 20 } });
  const f = accountingFixture({ "s.jsonl": [main], "s/subagents/a.jsonl": [agent], "s/subagents/a.meta.json": JSON.stringify({ agentType: "waypost-critic" }) });
  const out = accountingReport(f);
  assert.equal(out.native_totals.all.total_tokens, 680);
  assert.equal(out.native_totals.waypost.total_tokens, 340);
  assert.equal(out.native_totals.other.total_tokens, 340);
  assert.equal(out.token_shares.waypost_percent, 50);
  assert.equal(out.native_totals.all.complete, true);
  assert.equal(out.measurement.subscription_quota_percent, null);
  assert.equal(out.measurement.api_price_estimate_is_subscription_quota, false);
  assert.equal(out.native_totals.all.estimated_api_cost_usd, out.totals.all.cost_usd);
});

test("tokens: incomplete, missing, invalid and conflicting usage cannot produce authoritative totals or shares", () => {
  const incomplete = accountingRecord("bad");
  delete incomplete.message.usage.cache_read_input_tokens;
  const missing = accountingRecord("missing");
  delete missing.message.usage;
  const cases = [
    { records: [incomplete], diagnostic: "incomplete_usage_requests" },
    { records: [missing], diagnostic: "requests_without_usage" },
    { records: [accountingRecord("bad", { input_tokens: -1 })], diagnostic: "incomplete_usage_requests" },
    { records: [accountingRecord("bad", { output_tokens: "10" })], diagnostic: "incomplete_usage_requests" },
    { records: [accountingRecord("bad", { cache_creation: { ephemeral_5m_input_tokens: 30, ephemeral_1h_input_tokens: 1 } })], diagnostic: "incomplete_usage_requests" },
    { records: [accountingRecord("bad"), accountingRecord("bad", { input_tokens: 101 })], diagnostic: "conflicting_usage_requests" },
  ];
  for (const { records, diagnostic } of cases) {
    const out = accountingReport(accountingFixture({ "s.jsonl": [accountingRecord("good"), ...records] }));
    assert.equal(out.native_totals.all.total_tokens, null, diagnostic);
    assert.equal(out.native_totals.all.complete, false, diagnostic);
    assert.equal(out.native_totals.all.estimated_api_cost_usd, null, diagnostic);
    assert.equal(out.token_shares.waypost_percent, null, diagnostic);
    assert.equal(out.coverage[diagnostic], 1, diagnostic);
    assert.ok(out.native_totals.all.observed_total_tokens >= 340);
  }
});

test("tokens: unknown pricing preserves complete native tokens while exposing a null API estimate", () => {
  const unknown = accountingRecord("unknown");
  unknown.message.model = "claude-future-unknown";
  const out = accountingReport(accountingFixture({ "s.jsonl": [unknown] }));
  assert.equal(out.native_totals.all.total_tokens, 340);
  assert.equal(out.native_totals.all.complete, true);
  assert.equal(out.native_totals.all.estimated_api_cost_usd, null);
  assert.equal(out.native_totals.all.known_estimated_api_cost_usd, 0);
  assert.deepEqual(out.native_totals.all.unpriced_models, ["claude-future-unknown"]);
  assert.equal(out.totals.all.cost_usd, 0, "legacy callers retain their historical numeric field");
});

test("tokens: resumed and inline copies dedup globally with the dedicated subagent attribution winning", () => {
  const rec = accountingRecord("shared");
  const out = accountingReport(accountingFixture({
    "a.jsonl": [rec, { ...rec, isSidechain: true }],
    "resumed.jsonl": [accountingRecord("shared", { output_tokens: 20 })],
    "a/subagents/critic.jsonl": [rec],
    "a/subagents/critic.meta.json": JSON.stringify({ agentType: "waypost-critic" }),
  }));
  assert.equal(out.totals.all.requests, 1);
  assert.equal(out.native_totals.all.total_tokens, 350);
  assert.equal(out.native_totals.waypost.total_tokens, 350);
  assert.equal(out.token_shares.waypost_percent, 100);
  assert.equal(out.buckets.length, 1);
  assert.equal(out.buckets[0].bucket, "agent: waypost-critic");
  assert.equal(out.buckets[0].runs, 1);
});

test("tokens: orphan subagent JSONL is inventoried and counted with unknown attribution", () => {
  const out = accountingReport(accountingFixture({ "s/subagents/orphan.jsonl": [accountingRecord("orphan")] }));
  assert.equal(out.totals.all.requests, 1);
  assert.equal(out.native_totals.all.total_tokens, 340);
  assert.equal(out.native_totals.waypost.total_tokens, 0);
  assert.equal(out.buckets[0].bucket, "agent: unknown");
  assert.equal(out.coverage.missing_metadata_files, 1);
  assert.equal(out.provenance.input_files[0].path, "s/subagents/orphan.jsonl");
});

test("tokens: corrupt metadata and malformed transcript records are visible coverage gaps", () => {
  const f = accountingFixture({
    "s/subagents/a.meta.json": "{broken metadata",
    "s/subagents/a.jsonl": JSON.stringify(accountingRecord("a")) + "\n{broken line\nnull\n[]\n",
    "s/subagents/b.meta.json": "[]",
    "s/subagents/b.jsonl": [accountingRecord("b")],
  });
  const out = accountingReport(f);
  assert.equal(out.coverage.invalid_metadata_files, 2);
  assert.equal(out.coverage.malformed_json_lines, 1);
  assert.equal(out.coverage.invalid_records, 2);
  assert.equal(out.totals.all.requests, 2);
  assert.equal(out.native_totals.all.total_tokens, null);
  assert.equal(out.token_shares.waypost_percent, null);
  assert.equal(out.measurement.source_complete_within_discovered_files, false);
});

test("tokens: unreadable discovered sources and missing request IDs prevent complete accounting", () => {
  const f = accountingFixture({ "s.jsonl": [accountingRecord("valid"), accountingRecord(undefined)] });
  // Reading a directory as a transcript fails on supported Node platforms,
  // without relying on chmod (which behaves differently under privileged CI).
  mkdirSync(join(f.dir, "unreadable.jsonl"));
  const out = accountingReport(f);
  assert.equal(out.coverage.unreadable_files, 1);
  assert.equal(out.coverage.missing_request_id_records, 1);
  assert.equal(out.native_totals.all.total_tokens, null);
  assert.equal(out.token_shares.waypost_percent, null);
  assert.deepEqual(out.provenance.input_files.find((file) => file.path === "unreadable.jsonl"), { path: "unreadable.jsonl", kind: "transcript", sha256: null, readable: false });
});

test("tokens: provenance fingerprints exact transcript, metadata and analyzer bytes", () => {
  const f = accountingFixture({ "s.jsonl": [accountingRecord("main")], "s/subagents/a.jsonl": [accountingRecord("a")], "s/subagents/a.meta.json": JSON.stringify({ agentType: "waypost-critic" }) });
  const out = accountingReport(f);
  const digest = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
  assert.equal(out.measurement.source_harness, "claude-code");
  assert.equal(out.measurement.counter_schema, "claude-request-usage-v1");
  assert.deepEqual(out.measurement.unsupported_harnesses, ["codex", "opencode"]);
  assert.equal(out.provenance.project_root, f.project);
  assert.equal(out.provenance.project_git.revision, null, "a non-git fixture must not inherit the analyzer revision");
  assert.match(out.provenance.analyzer_git.revision, /^[a-f0-9]{40,64}$/);
  assert.deepEqual(out.provenance.sessions, ["s"]);
  assert.deepEqual(out.provenance.contexts, ["s", "s/subagents/a"]);
  assert.equal(out.provenance.input_files.length, 3);
  for (const file of out.provenance.input_files) {
    assert.equal(file.sha256, digest(join(f.dir, file.path)));
    assert.equal(file.readable, true);
  }
  assert.deepEqual(out.provenance.analyzer_sources.map((s) => s.path).sort(), ["scripts/token-navigation.mjs", "scripts/token-requests.mjs", "scripts/token-table.mjs", "scripts/tokens.mjs"]);
  for (const source of out.provenance.analyzer_sources) assert.equal(source.sha256, digest(join(REPO, source.path)));
  writeFileSync(join(f.dir, "s/subagents/a.meta.json"), JSON.stringify({ agentType: "waypost-reviewer" }));
  const changed = accountingReport(f);
  assert.notEqual(changed.provenance.input_files.find((s) => s.kind === "agent-metadata").sha256, out.provenance.input_files.find((s) => s.kind === "agent-metadata").sha256);
});

test("tokens: since is inclusive and until exclusive at UTC midnight, including offset timestamps", () => {
  const at = (id, timestamp) => accountingRecord(id, {}, { timestamp });
  const f = accountingFixture({ "s.jsonl": [
    at("before", "2026-10-13T23:59:59.999Z"), at("start", "2026-10-14T00:00:00Z"),
    at("offset", "2026-10-13T21:00:00-03:00"), at("last", "2026-10-14T23:59:59.999Z"), at("end", "2026-10-15T00:00:00Z"),
  ] });
  const out = accountingReport(f, ["--since", "2026-10-14", "--until", "2026-10-15"]);
  assert.equal(out.totals.all.requests, 3);
  assert.equal(out.coverage.filtered_records, 2);
  assert.equal(out.provenance.period.since_inclusive_utc, "2026-10-14");
  assert.equal(out.provenance.period.until_exclusive_utc, "2026-10-15");
  assert.equal(out.provenance.period.observed_first_utc, "2026-10-14T00:00:00.000Z");
  assert.equal(out.provenance.period.observed_last_utc, "2026-10-14T23:59:59.999Z");
  assert.match(out.provenance.period.request_selection, /first observed assistant-block timestamp/);
  assert.match(out.provenance.period.navigation_selection, /tool events timestamped inside the period/);
});

test("tokens: absent or invalid timestamp is a visible gap when a period is requested", () => {
  const f = accountingFixture({ "s.jsonl": [accountingRecord("valid"), accountingRecord("undated", {}, { timestamp: undefined }), accountingRecord("invalid", {}, { timestamp: "not-a-date" })] });
  const out = accountingReport(f, ["--since", "2026-10-14"]);
  assert.equal(out.totals.all.requests, 1);
  assert.equal(out.coverage.undated_assistant_records, 2);
  assert.equal(out.native_totals.all.total_tokens, null);
  assert.equal(out.token_shares.waypost_percent, null);
});

test("tokens: date options reject missing values, impossible dates and reversed intervals", () => {
  const f = accountingFixture({ "s.jsonl": [accountingRecord("a")] });
  for (const args of [["--since"], ["--until"], ["--since", "--json"], ["--until", "2026-02-30"], ["--since", "yesterday"], ["--since", "2026-10-14T00:00:00Z"], ["--since", "2026-10-15", "--until", "2026-10-14"], ["--since", "2026-10-14", "--until", "2026-10-14"]]) {
    const result = run(f.home, ["--project", f.project, ...args]);
    assert.notEqual(result.status, 0, args.join(" "));
    assert.match(result.stderr, /expects a value|real YYYY-MM-DD|must be later/);
  }
});

test("tokens: optional navigation counts initiating requests once and leaves native accounting unchanged", () => {
  const rec = accountingRecord("navigate");
  rec.message.content = [
    { type: "tool_use", id: "read1", name: "Read", input: { file_path: "bin/waypost.mjs", limit: 10 } },
    { type: "tool_use", id: "read2", name: "Read", input: { file_path: "scripts/tokens.mjs" } },
  ];
  const result = { type: "user", timestamp: "2026-10-14T12:00:01Z", message: { content: [ { type: "tool_result", tool_use_id: "read1", content: "first content" }, { type: "tool_result", tool_use_id: "read2", content: "second content" } ] } };
  const f = accountingFixture({ "s.jsonl": [rec, result] });
  const plain = accountingReport(f);
  const nav = accountingReport(f, ["--navigation"]);
  assert.equal(plain.navigation, undefined);
  assert.deepEqual(nav.native_totals, plain.native_totals);
  assert.deepEqual(nav.totals, plain.totals);
  assert.deepEqual(nav.token_shares, plain.token_shares);
  assert.equal(nav.navigation.initiating_requests.count, 1);
  assert.equal(nav.navigation.initiating_requests.observed_input, 330);
  assert.equal(nav.navigation.reads.successful_results, 2);
});

test("tokens: summary preserves observed totals, attribution share and coverage warnings with less output", () => {
  const f = fixture();
  const detailed = run(f.home, ["--project", f.project]);
  const summary = run(f.home, ["--project", f.project, "--summary"]);
  const json = accountingReport(f);
  assert.equal(detailed.status, 0, detailed.stderr);
  assert.equal(summary.status, 0, summary.stderr);
  assert.match(summary.stdout, /2 requests/);
  assert.match(summary.stdout, /1,570 observed native tokens/);
  assert.match(summary.stdout, new RegExp(json.token_shares.waypost_percent.toFixed(2).replace(".", "\\.") + "%"));
  assert.ok(summary.stdout.length < detailed.stdout.length / 2, "summary must materially reduce emitted context");
  assert.deepEqual(accountingReport(f, ["--summary"]).native_totals, json.native_totals, "JSON remains a complete measurement report");

  const incomplete = accountingRecord("incomplete");
  delete incomplete.message.usage.output_tokens;
  const gaps = accountingFixture({ "s.jsonl": [incomplete] });
  const warning = run(gaps.home, ["--project", gaps.project, "--summary"]);
  assert.equal(warning.status, 0, warning.stderr);
  assert.match(warning.stdout, /330 observed native tokens/);
  assert.match(warning.stdout, /unknown/);
  assert.match(warning.stdout, /coverage gaps/);
});

test("tokens: period selection owns a whole request across midnight without duplicating input", () => {
  const usage = { input_tokens: 100, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  const first = accountingRecord("midnight", usage, { timestamp: "2026-10-14T23:59:59Z" });
  const last = accountingRecord("midnight", { ...usage, output_tokens: 20 }, { timestamp: "2026-10-15T00:00:01Z" });
  last.message.content = [{ type: "tool_use", id: "late-read", name: "Read", input: { file_path: "bin/waypost.mjs" } }];
  const result = { type: "user", timestamp: "2026-10-15T00:00:02Z", message: { content: [{ type: "tool_result", tool_use_id: "late-read", content: "content" }] } };
  const f = accountingFixture({ "s.jsonl": [first, last, result] });
  const all = accountingReport(f, ["--navigation"]);
  const before = accountingReport(f, ["--until", "2026-10-15", "--navigation"]);
  const after = accountingReport(f, ["--since", "2026-10-15", "--navigation"]);
  assert.equal(all.native_totals.all.total_tokens, 120);
  assert.equal(before.native_totals.all.total_tokens, 120, "the final cumulative output belongs to the request that began before midnight");
  assert.equal(before.totals.all.input, 100);
  assert.equal(before.totals.all.output, 20);
  assert.equal(before.coverage.boundary_crossing_requests, 1);
  assert.equal(before.provenance.period.observed_first_utc, "2026-10-14T23:59:59.000Z");
  assert.equal(before.provenance.period.observed_last_utc, "2026-10-15T00:00:01.000Z");
  assert.equal(after.native_totals.all.total_tokens, 0);
  assert.equal(after.totals.all.requests, 0);
  assert.equal(after.totals.all.input, 0);
  assert.equal(before.native_totals.all.total_tokens + after.native_totals.all.total_tokens, all.native_totals.all.total_tokens);
  assert.equal(all.navigation.calls.total, 1);
  assert.equal(before.navigation.calls.total, 0, "navigation events still obey their own timestamp window");
  assert.equal(after.navigation.calls.total, 0, "a later tool block cannot resurrect an excluded initiating request");
  assert.equal(after.navigation.initiating_requests.count, 0);
  assert.equal(after.navigation.coverage.unmatched_tool_results, 0, "the excluded call's result is excluded too");
});

test("tokens: inline sidechains cannot establish repeated-read evidence in the main context", () => {
  const read = (requestId, toolId, extra = {}) => {
    const rec = accountingRecord(requestId, {}, extra);
    rec.message.content = [{ type: "tool_use", id: toolId, name: "Read", input: { file_path: "bin/waypost.mjs" } }];
    return rec;
  };
  const result = (toolId, extra = {}) => ({ type: "user", timestamp: "2026-10-14T12:00:01Z", message: { content: [{ type: "tool_result", tool_use_id: toolId, content: "identical content" }] }, ...extra });
  const f = accountingFixture({ "s.jsonl": [
    read("main", "main-read"), result("main-read"),
    read("inline", "inline-read", { isSidechain: true, agentId: "child" }), result("inline-read", { isSidechain: true, agentId: "child" }),
    read("unknown1", "unknown-read1", { isSidechain: true }), result("unknown-read1", { isSidechain: true }),
    read("unknown2", "unknown-read2", { isSidechain: true }), result("unknown-read2", { isSidechain: true }),
  ] });
  const out = accountingReport(f, ["--navigation"]);
  assert.equal(out.native_totals.all.total_tokens, 4 * 340);
  assert.equal(out.navigation.calls.read, 4);
  assert.equal(out.navigation.reads.successful_results, 2, "main and identified child each have a matching result");
  assert.equal(out.navigation.reads.repeated_identical_results, 0);
  assert.equal(out.coverage.unknown_inline_context_records, 4);
  const contexts = out.provenance.contexts;
  assert.ok(contexts.includes("s"));
  assert.ok(contexts.includes("s/inline/child"));
  const isolated = contexts.filter((context) => context.startsWith("s/inline-unknown/"));
  assert.equal(isolated.length, 2, "each unidentified assistant request receives its own synthetic context");
  assert.equal(new Set(isolated).size, 2);
  assert.equal(out.navigation.reads.missing_results, 2, "unknown identities cannot join calls to separately recorded results");
});

test("tokens: conflicting cache TTL splits invalidate the authoritative API estimate", () => {
  const base = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 1e6 };
  const first = accountingRecord("split", { ...base, cache_creation: { ephemeral_5m_input_tokens: 1e6, ephemeral_1h_input_tokens: 0 } });
  const second = accountingRecord("split", { ...base, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 1e6 } });
  const out = accountingReport(accountingFixture({ "s.jsonl": [first, second] }));
  assert.equal(out.totals.all.requests, 1);
  assert.equal(out.totals.all.cache_write, 1e6, "the aggregate cache creation remains counted only once");
  assert.equal(out.native_totals.all.observed_total_tokens, 1e6);
  assert.equal(out.coverage.conflicting_usage_requests, 1);
  assert.equal(out.native_totals.all.total_tokens, null);
  assert.equal(out.native_totals.all.estimated_api_cost_usd, null, "equal aggregate tokens cannot conceal contradictory pricing tiers");
  assert.equal(out.token_shares.waypost_percent, null);
});

test("tokens: filtered agent runs count only selected contexts in bucket and session totals", () => {
  const old = accountingRecord("old", {}, { timestamp: "2026-10-13T12:00:00Z" });
  const current = accountingRecord("current", {}, { timestamp: "2026-10-14T12:00:00Z" });
  const meta = JSON.stringify({ agentType: "waypost-critic", description: "Repeated critic" });
  const f = accountingFixture({
    "s/subagents/old.jsonl": [old], "s/subagents/old.meta.json": meta,
    "s/subagents/current.jsonl": [current], "s/subagents/current.meta.json": meta,
  });
  const all = accountingReport(f);
  const selected = accountingReport(f, ["--since", "2026-10-14", "--sessions"]);
  assert.equal(all.buckets[0].requests, 2);
  assert.equal(all.buckets[0].runs, 2);
  assert.equal(selected.totals.all.requests, 1);
  assert.equal(selected.buckets[0].requests, 1);
  assert.equal(selected.buckets[0].runs, 1, "an excluded agent context contributes no run to its shared bucket");
  assert.equal(selected.by_session.length, 1);
  assert.equal(selected.by_session[0].requests, 1);
  assert.equal(selected.by_session[0].runs, 1, "session totals must not retain the excluded spawn");
  assert.deepEqual(selected.provenance.contexts, ["s/subagents/current"]);
});
