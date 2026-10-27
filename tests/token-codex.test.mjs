import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, unlinkSync, truncateSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import * as zlib from "node:zlib";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { collectCodexReport, formatCodexReport } from "../scripts/token-codex.mjs";
import { ambientEnv } from "./env.mjs";

const scratch = [];
after(() => { for (const dir of scratch) rmSync(dir, { recursive: true, force: true }); });
const CLI = join(dirname(dirname(fileURLToPath(import.meta.url))), "scripts/tokens.mjs");
const created = "2026-10-14T00:00:00Z";
const at = hour => `2026-10-14T${String(hour).padStart(2, "0")}:00:00Z`;
const usage = (input = 0, output = 0, cache = 0, reasoning = 0, write) => ({ input_tokens: input, cached_input_tokens: cache, output_tokens: output, reasoning_output_tokens: reasoning, total_tokens: input + output, ...(write === undefined ? {} : { cache_write_input_tokens: write }) });
const event = (time, value, last = value) => ({ timestamp: time, type: "event_msg", payload: { type: "token_count", info: value === null ? null : { total_token_usage: value, last_token_usage: last } } });

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "waypost-codex-tokens-")); scratch.push(dir);
  const home = join(dir, "codex"), project = join(dir, "project"), sessions = join(home, "sessions");
  mkdirSync(sessions, { recursive: true }); mkdirSync(project);
  const write = (id, frames, options = {}) => {
    const path = join(sessions, options.name ?? `${id}.jsonl`);
    const meta = { id, session_id: id, timestamp: created, cwd: project, model_provider: "openai", cli_version: "fixture", ...options.meta };
    const records = [{ type: "session_meta", payload: meta }, ...frames];
    writeFileSync(path, records.map(record => typeof record === "string" ? record : JSON.stringify(record)).join("\n") + "\n");
    return path;
  };
  return { dir, home, project, sessions, write, report: opts => collectCodexReport({ project, codexHome: home, ...opts }) };
}

function cli(f, args = []) {
  return spawnSync(process.execPath, [CLI, "--project", f.project, "--harness", "codex", ...args], { encoding: "utf8", env: { ...ambientEnv(), CODEX_HOME: f.home }, timeout: 15000 });
}

test("Codex deltas use native total once; cache and reasoning remain subsets", async () => {
  const f = fixture();
  f.write("critic", [event(at(0), usage()), event(at(1), usage(100, 20, 40, 10))], { meta: { agent_role: "waypost-critic" } });
  const r = await f.report();
  assert.equal(r.native_totals.all.total_tokens, 120);
  assert.equal(r.native_totals.all.observed_spans, 1);
  assert.equal(r.native_totals.all.observed_cached_input_tokens, 40);
  assert.equal(r.native_totals.all.observed_reasoning_output_tokens, 10);
  assert.equal(r.token_shares.observed_waypost_percent, 100);
  assert.equal(r.token_shares.full_retained_source_waypost_percent, 100);
  assert.equal(r.measurement.subscription_quota_percent, null);
  assert.equal(r.pricing_usd_per_mtok, undefined);
  assert.equal(r.native_totals.all.requests, undefined);
});

test("Codex never charges a first nonzero snapshot, even when cumulative equals last", async () => {
  const f = fixture();
  f.write("fresh", [event(at(1), usage(100, 20)), event(at(2), usage(150, 30))]);
  const r = await f.report();
  assert.equal(r.native_totals.all.observed_total_tokens, 60);
  assert.equal(r.native_totals.all.total_tokens, null);
  assert.equal(r.contexts[0].coverage.unknown_prefixes, 1);
});

test("Codex inherited snapshots are skipped; parent identity alone does not invalidate a zero anchor", async () => {
  const f = fixture();
  f.write("child", [event("2026-10-13T23:00:00Z", usage(500)), event(at(1), usage(500)), event(at(2), usage(550))], { meta: { parent_thread_id: "parent" } });
  f.write("normal-child", [event(at(0), usage()), event(at(1), usage(20))], { meta: { parent_thread_id: "parent" } });
  const r = await f.report();
  assert.equal(r.native_totals.all.observed_total_tokens, 70);
  assert.equal(r.contexts.find(c => c.id === "child").coverage.historical_snapshots, 1);
  assert.equal(r.contexts.find(c => c.id === "normal-child").total_tokens, 20);
});

test("Codex duplicate snapshots and prefix replay files cannot duplicate usage", async () => {
  const f = fixture(), base = [event(at(0), usage()), event(at(1), usage(100))];
  f.write("same", base, { name: "a.jsonl" });
  f.write("same", [...base, event(at(2), usage(100)), event(at(3), usage(120))], { name: "b.jsonl" });
  const r = await f.report();
  assert.equal(r.native_totals.all.total_tokens, 120);
  assert.equal(r.native_totals.all.observed_spans, 2);
  assert.equal(r.coverage.replay_files, 1);
  assert.equal(r.contexts[0].coverage.duplicates, 1);
});

test("Codex divergent same-id histories are quarantined rather than sorted into fabricated spans", async () => {
  const f = fixture();
  f.write("same", [event(at(0), usage()), event(at(1), usage(100))], { name: "a.jsonl" });
  f.write("same", [event(at(0), usage()), event(at(1), usage(200))], { name: "b.jsonl" });
  const r = await f.report();
  assert.equal(r.coverage.conflicting_contexts, 1);
  assert.equal(r.native_totals.all.total_tokens, null);
  assert.equal(r.native_totals.all.observed_total_tokens, 0);
});

test("Codex malformed/null observations break continuity and the next snapshot only rebases", async () => {
  for (const broken of ["{broken", event(at(2), null)]) {
    const f = fixture();
    f.write("gap", [event(at(0), usage()), event(at(1), usage(100)), broken, event(at(3), usage(200)), event(at(4), usage(250))]);
    const r = await f.report();
    assert.equal(r.native_totals.all.observed_total_tokens, 150);
    assert.equal(r.native_totals.all.total_tokens, null);
    assert.equal(r.contexts[0].coverage.chain_gaps, 1);
  }
});

test("Codex decrease, same-total conflict and optional schema drift cannot bridge counter epochs", async () => {
  for (const values of [
    [usage(100), usage(50), usage(60), usage(70)],
    [usage(100), usage(100, 0, 10), usage(110, 0, 10), usage(120, 0, 10)],
    [usage(100), usage(110, 0, 0, 0, 0), usage(120, 0, 0, 0, 0), usage(130, 0, 0, 0, 0)],
  ]) {
    const f = fixture();
    f.write("reset", [event(at(0), usage()), ...values.map((value, i) => event(at(i + 1), value))]);
    const r = await f.report();
    assert.equal(r.native_totals.all.observed_total_tokens, 110);
    assert.equal(r.native_totals.all.total_tokens, null);
  }
});

test("Codex validates timestamps independently of monotonic counters", async () => {
  for (const time of [undefined, "not-a-date", "2026-10-14T02:00:00", "2026-02-30T00:00:00Z", "2026-10-13T23:59:59Z"]) {
    const f = fixture();
    f.write("bad-time", [event(at(0), usage()), event(at(1), usage(100)), event(time, usage(150)), event(at(3), usage(200)), event(at(4), usage(210))]);
    const r = await f.report();
    assert.equal(r.native_totals.all.observed_total_tokens, 110);
    assert.equal(r.contexts[0].coverage.invalid_timestamps, 1);
    assert.equal(r.native_totals.all.total_tokens, null);
  }
});

test("Codex rejects unsafe, negative, incomplete and contradictory native counters", async () => {
  for (const bad of [
    { ...usage(1), input_tokens: -1 }, { ...usage(1), output_tokens: undefined },
    { ...usage(1), total_tokens: Number.MAX_SAFE_INTEGER + 1 },
    { ...usage(1), cached_input_tokens: 2 }, { ...usage(1), reasoning_output_tokens: 1 },
    { ...usage(1), total_tokens: 2 }, { ...usage(1), cache_write_input_tokens: "0" },
  ]) {
    const f = fixture(); f.write("bad", [event(at(0), usage()), event(at(1), bad)]);
    const r = await f.report();
    assert.equal(r.native_totals.all.total_tokens, null);
    assert.equal(r.native_totals.all.observed_total_tokens, 0);
  }
});

test("Codex period selection constructs pre-period baselines and assigns whole deltas by endpoint", async () => {
  const f = fixture();
  f.write("period", [event(at(0), usage()), event(at(23), usage(100)), event("2026-10-15T00:00:01Z", usage(150))]);
  const old = await f.report({ until: "2026-10-15" }), next = await f.report({ since: "2026-10-15" });
  assert.equal(old.native_totals.all.total_tokens, 100);
  assert.equal(next.native_totals.all.total_tokens, 50);
  assert.equal(next.contexts[0].coverage.boundary_crossing_spans, 1);
});

test("Codex offsets and cache subsets cannot move or inflate a UTC endpoint", async () => {
  const f = fixture();
  f.write("offset", [event(at(0), usage()), event("2026-10-15T00:30:00+01:00", usage(100, 20, 50, 10)), event("2026-10-15T01:30:00+01:00", usage(200, 40, 100, 20))]);
  const before = await f.report({ until: "2026-10-15" });
  const after = await f.report({ since: "2026-10-15" });
  assert.equal(before.native_totals.all.total_tokens, 120);
  assert.equal(after.native_totals.all.total_tokens, 120);
  assert.equal(after.native_totals.all.observed_cached_input_tokens, 50);
  assert.equal(after.native_totals.all.observed_reasoning_output_tokens, 10);
});

test("Codex unknown prefix before the period is not charged into a later interval", async () => {
  const f = fixture();
  f.write("prefix", [event(at(1), usage(100)), event("2026-10-15T00:00:00Z", usage(150))]);
  const r = await f.report({ since: "2026-10-15" });
  assert.equal(r.native_totals.all.total_tokens, 50);
  assert.equal(r.native_totals.all.observed_total_tokens, 50);
});

test("Codex a first snapshot after the window cannot turn an overlapping unknown prefix into zero", async () => {
  const f = fixture();
  f.write("late", [event("2026-10-16T00:00:00Z", usage(100))]);
  const r = await f.report({ since: "2026-10-14", until: "2026-10-15" });
  assert.equal(r.native_totals.all.observed_total_tokens, 0);
  assert.equal(r.native_totals.all.total_tokens, null);
  const later = fixture();
  later.write("unborn", [event("2026-10-16T01:00:00Z", usage(100))], { meta: { timestamp: "2026-10-16T00:00:00Z" } });
  const outside = await later.report({ since: "2026-10-14", until: "2026-10-15" });
  assert.equal(outside.native_totals.all.total_tokens, 0);
});

test("Codex exact cwd selects project metadata, not prompt text or a similar project prefix", async () => {
  const f = fixture();
  f.write("ours", [event(at(0), usage()), event(at(1), usage(10))]);
  f.write("foreign", [{ type: "response_item", payload: { text: f.project } }, event(at(0), usage()), event(at(1), usage(1000))], { meta: { cwd: f.project + "-other" } });
  const r = await f.report();
  assert.equal(r.native_totals.all.total_tokens, 10);
  assert.equal(r.coverage.other_project_files, 1);
  assert.equal(r.provenance.input_files.length, 1);
});

test("Codex role attribution requires consistent explicit metadata and preserves unknown attribution", async () => {
  const f = fixture(), frames = [event(at(0), usage()), event(at(1), usage(100))];
  f.write("role", frames, { meta: { source: { subagent: { thread_spawn: { agent_role: "waypost-reviewer" } } } } });
  f.write("main", frames);
  f.write("other", frames, { meta: { agent_role: "explorer" } });
  const r = await f.report();
  assert.equal(r.native_totals.waypost.observed_total_tokens, 100);
  assert.equal(r.native_totals.unattributed.observed_total_tokens, 100);
  assert.equal(r.native_totals.other_explicit_roles.observed_total_tokens, 100);
  assert.equal(r.token_shares.observed_waypost_percent, 100 / 3);
});

test("Codex invalid or changing metadata never silently merges contexts", async () => {
  for (const bad of [{ id: null }, { agent_role: "waypost-critic", source: { subagent: { thread_spawn: { agent_role: "worker" } } } }]) {
    const f = fixture(); f.write("bad", [event(at(0), usage()), event(at(1), usage(100))], { meta: bad });
    const r = await f.report();
    assert.equal(r.coverage.unidentifiable_headers, 1);
    assert.equal(r.native_totals.all.total_tokens, null);
  }
  const f = fixture();
  f.write("same", [event(at(0), usage()), event(at(1), usage(100))], { name: "a.jsonl", meta: { agent_role: "waypost-critic" } });
  f.write("same", [event(at(0), usage()), event(at(1), usage(100))], { name: "b.jsonl", meta: { agent_role: "waypost-planner" } });
  const r = await f.report();
  assert.equal(r.coverage.conflicting_contexts, 1);
  assert.equal(r.native_totals.all.total_tokens, null);
});

test("Codex native id isolates subagents sharing the Desktop session label", async () => {
  const f = fixture(), frames = [event(at(0), usage()), event(at(1), usage(100))];
  f.write("first-native", frames, { meta: { session_id: "same-chat", agent_role: "waypost-critic" } });
  f.write("second-native", frames, { meta: { session_id: "same-chat", agent_role: "waypost-reviewer" } });
  const r = await f.report();
  assert.equal(r.coverage.unidentifiable_headers, 0);
  assert.equal(r.coverage.matched_contexts, 2);
  assert.equal(r.native_totals.all.total_tokens, 200);
  assert.equal(r.native_totals.waypost.total_tokens, 200);
  assert.ok(r.contexts.every(context => context.session_label === "same-chat"));
});

test("Codex same-id metadata conflicts are detected before project filtering", async () => {
  for (const foreign of [{ cwd: "/another/project" }, { cwd: "/another/project", source: { subagent: { thread_spawn: { agent_role: "different" } } }, agent_role: "waypost-critic" }]) {
    const f = fixture(), frames = [event(at(0), usage()), event(at(1), usage(100))];
    f.write("same-native", frames, { name: "our.jsonl" });
    f.write("same-native", frames, { name: "foreign.jsonl", meta: foreign });
    const r = await f.report();
    assert.equal(r.coverage.conflicting_contexts, 1);
    assert.equal(r.native_totals.all.observed_total_tokens, 0);
    assert.equal(r.native_totals.all.total_tokens, null);
  }
});

test("Codex archive/header/discovery gaps are explicit and cannot become a full-history zero", async () => {
  const f = fixture();
  writeFileSync(join(f.sessions, "old.jsonl.xz"), "not decoded");
  writeFileSync(join(f.sessions, "bad.jsonl"), "{bad header}\n");
  const r = await f.report();
  assert.equal(r.coverage.compressed_files_skipped, 1);
  assert.equal(r.coverage.unidentifiable_headers, 1);
  assert.equal(r.measurement.source_discovery_complete, false);
  assert.equal(r.native_totals.all.total_tokens, null);
  assert.equal(r.token_shares.observed_waypost_percent, null);
  const missing = await collectCodexReport({ project: f.project, codexHome: join(f.dir, "absent") });
  assert.equal(missing.coverage.discovery_errors, 1);
  assert.equal(missing.native_totals.all.total_tokens, null);
});

test("Codex metadata without native observations does not prove zero consumption", async () => {
  const f = fixture(); f.write("empty", []);
  const r = await f.report();
  assert.equal(r.native_totals.all.observed_total_tokens, 0);
  assert.equal(r.native_totals.all.total_tokens, null);
  assert.equal(r.contexts[0].coverage.current_snapshots, 0);
});

test("Codex bounds line storage, hashes exact source bytes and emits no prompt/tool bodies", async () => {
  const f = fixture();
  const path = f.write("bounded", [event(at(0), usage()), { type: "response_item", payload: "SECRET-BODY-" + "x".repeat(1024 * 1024) }, event(at(1), usage(100)), event(at(2), usage(110))]);
  const r = await f.report();
  assert.equal(r.coverage.malformed_or_oversized_lines, 1);
  assert.equal(r.native_totals.all.observed_total_tokens, 10);
  assert.equal(r.provenance.input_files[0].sha256, createHash("sha256").update(readFileSync(path)).digest("hex"));
  assert.doesNotMatch(JSON.stringify(r), /SECRET-BODY|xxxxxx/);
});

test("Codex aggregate overflow is unknown rather than a rounded authoritative number", async () => {
  const f = fixture();
  for (const id of ["one", "two"]) f.write(id, [event(at(0), usage()), event(at(1), usage(Number.MAX_SAFE_INTEGER))]);
  const r = await f.report();
  assert.equal(r.native_totals.all.observed_total_tokens, null);
  assert.equal(r.native_totals.all.total_tokens, null);
});

test("Codex optional cache-write counters remain unknown when absent and never inflate native totals", async () => {
  const f = fixture();
  f.write("known", [event(at(0), usage(0, 0, 0, 0, 0)), event(at(1), usage(100, 20, 30, 10, 40))]);
  let r = await f.report();
  assert.equal(r.native_totals.all.total_tokens, 120);
  assert.equal(r.native_totals.all.observed_cache_write_input_tokens, 40);
  f.write("absent", [event(at(0), usage()), event(at(1), usage(100))]);
  r = await f.report();
  assert.equal(r.native_totals.all.total_tokens, 220);
  assert.equal(r.native_totals.all.observed_cache_write_input_tokens, null);
  assert.equal(r.native_totals.all.cache_write_counter_spans, 1);
});

test("Codex CLI is explicit, compact, fingerprinted and rejects unsupported or unknown modes", () => {
  const f = fixture(); f.write("cli", [event(at(0), usage()), event(at(1), usage(100))]);
  const result = cli(f, ["--json"]);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.measurement.source_harness, "codex");
  assert.deepEqual(report.provenance.analyzer_sources.map(source => source.path).sort(), ["scripts/token-codex.mjs", "scripts/token-requests.mjs", "scripts/token-table.mjs", "scripts/tokens.mjs"]);
  for (const source of report.provenance.analyzer_sources) assert.equal(source.sha256, createHash("sha256").update(readFileSync(new URL("../" + source.path, import.meta.url))).digest("hex"));
  assert.equal(report.native_totals.all.total_tokens, 100);
  const short = cli(f, ["--summary"]);
  assert.equal(short.status, 0, short.stderr);
  assert.match(short.stdout, /100 observed native tokens in 1 spans/);
  assert.doesNotMatch(short.stdout, /\$|cost_usd/);
  assert.ok(short.stdout.length < 600);
  assert.match(cli(f, ["--navigation"]).stderr, /does not support/);
  assert.match(cli(f, ["--runs"]).stderr, /does not support/);
  assert.match(cli(f, ["--harness", "unknown"]).stderr, /expects claude or codex/);
  assert.match(cli(f, ["--harness"]).stderr, /expects a value/);
});

test("explicit Claude mode preserves the default report schema and totals", () => {
  const f = fixture(), home = join(f.dir, "claude-home");
  const transcripts = join(home, ".claude", "projects", f.project.replace(/[^a-zA-Z0-9]/g, "-"));
  mkdirSync(transcripts, { recursive: true });
  writeFileSync(join(transcripts, "main.jsonl"), JSON.stringify({
    type: "assistant", requestId: "claude-request", timestamp: at(1),
    message: { model: "claude-sonnet-5", usage: { input_tokens: 100, cache_creation_input_tokens: 20, cache_read_input_tokens: 30, output_tokens: 10 }, content: [] },
  }) + "\n");
  const run = flags => spawnSync(process.execPath, [CLI, "--project", f.project, "--json", ...flags], {
    encoding: "utf8", env: { ...ambientEnv(), HOME: home, USERPROFILE: home }, timeout: 15000,
  });
  const implicit = run([]), explicit = run(["--harness", "claude"]);
  assert.equal(implicit.status, 0, implicit.stderr); assert.equal(explicit.status, 0, explicit.stderr);
  const a = JSON.parse(implicit.stdout), b = JSON.parse(explicit.stdout);
  assert.deepEqual(a.totals, b.totals);
  assert.equal(b.measurement.source_harness, "claude-code");
  assert.equal(b.native_totals.all.total_tokens, 160);
});

const compressors = { gz: zlib.gzipSync, br: zlib.brotliCompressSync, ...(typeof zlib.zstdCompressSync === "function" ? { zst: zlib.zstdCompressSync } : {}) };
function archive(f, id, frames, kind, options = {}) {
  const plain = f.write(id, frames, options), bytes = readFileSync(plain);
  const path = `${plain}.${kind}`;
  writeFileSync(path, compressors[kind](bytes));
  unlinkSync(plain);
  return path;
}

for (const kind of Object.keys(compressors)) test(`Codex ${kind} archives preserve spans, original-byte hashes and privacy`, async () => {
  const f = fixture();
  const path = archive(f, "compressed", [event(at(0), usage()), { type: "response_item", payload: "PRIVATE-ARCHIVE-BODY" }, event(at(1), usage(100, 20, 40, 10))], kind, { meta: { agent_role: "waypost-reviewer" } });
  const r = await f.report();
  assert.equal(r.native_totals.all.total_tokens, 120);
  assert.equal(r.token_shares.full_retained_source_waypost_percent, 100);
  assert.equal(r.coverage.compressed_files_decoded, 1);
  assert.equal(r.coverage.compressed_files_skipped, 0);
  assert.equal(r.provenance.input_files[0].compression, kind);
  assert.equal(r.provenance.input_files[0].sha256, createHash("sha256").update(readFileSync(path)).digest("hex"));
  assert.doesNotMatch(JSON.stringify(r), /PRIVATE-ARCHIVE-BODY/);
});

test("Codex plain/archive replay cannot duplicate counters and divergent archives quarantine the context", async () => {
  for (const conflict of [false, true]) {
    const f = fixture(), base = [event(at(0), usage()), event(at(1), usage(100))];
    f.write("shared", base, { name: "a.jsonl" });
    archive(f, "shared", conflict ? [event(at(0), usage()), event(at(1), usage(200))] : [...base, event(at(2), usage(120))], "gz", { name: "b.jsonl" });
    const r = await f.report();
    assert.equal(r.coverage.replay_files, 1);
    assert.equal(r.coverage.conflicting_contexts, conflict ? 1 : 0);
    assert.equal(r.native_totals.all.observed_total_tokens, conflict ? 0 : 120);
  }
});

test("Codex archive headers preserve foreign-project identity conflicts before filtering", async () => {
  const f = fixture();
  f.write("shared", [event(at(0), usage()), event(at(1), usage(100))]);
  archive(f, "shared", [], "gz", { name: "foreign.jsonl", meta: { cwd: `${f.project}-other` } });
  const r = await f.report();
  assert.equal(r.coverage.other_project_files, 1);
  assert.equal(r.coverage.compressed_files_decoded, 0);
  assert.equal(r.coverage.conflicting_contexts, 1);
  assert.equal(r.native_totals.all.observed_total_tokens, 0);
});

test("Codex corrupt archive tails quarantine matching replay counters instead of trusting partial output", async () => {
  const f = fixture(), base = [event(at(0), usage()), event(at(1), usage(100))];
  f.write("shared", base, { name: "a.jsonl" });
  const path = archive(f, "shared", [...base, { type: "response_item", payload: "private".repeat(40000) }], "gz", { name: "b.jsonl" });
  truncateSync(path, readFileSync(path).length - 4);
  const r = await f.report();
  assert.equal(r.coverage.compressed_files_failed, 1);
  assert.equal(r.coverage.unreadable_matching_files, 1);
  assert.equal(r.coverage.conflicting_contexts, 1);
  assert.equal(r.native_totals.all.observed_total_tokens, 0);
  assert.equal(r.native_totals.all.total_tokens, null);
  assert.equal(r.provenance.input_files.find(file => file.compression).sha256, null);
});

test("Codex archive byte ceilings reject oversized compressed and expanded histories", async () => {
  for (const expanded of [false, true]) {
    const f = fixture();
    const frames = [event(at(0), usage()), event(at(1), usage(100))];
    if (expanded) frames.push({ type: "response_item", payload: "x".repeat(64 * 1024 * 1024) });
    const path = archive(f, "bounded", frames, "gz");
    if (!expanded) truncateSync(path, 8 * 1024 * 1024 + 1);
    const r = await f.report();
    assert.equal(r.coverage.archive_limit_failures, 1);
    assert.equal(r.coverage.compressed_files_failed, 1);
    assert.equal(r.native_totals.all.observed_total_tokens, 0);
    assert.equal(r.native_totals.all.total_tokens, null);
    assert.equal(r.provenance.input_files[0].archive_error, expanded ? "archive-output-limit" : "archive-input-limit");
  }
});

test("Codex invalid compressed headers and runtime codec support remain explicit coverage gaps", async () => {
  const f = fixture();
  writeFileSync(join(f.sessions, "broken.jsonl.gz"), "not gzip");
  writeFileSync(join(f.sessions, "unsupported.jsonl.xz"), "not decoded");
  if (typeof zlib.createZstdDecompress !== "function") writeFileSync(join(f.sessions, "native-unavailable.jsonl.zst"), "not decoded");
  const r = await f.report();
  assert.equal(r.coverage.compressed_files_failed, 1);
  assert.equal(r.coverage.unidentifiable_headers, 1);
  assert.equal(r.coverage.compressed_files_skipped, typeof zlib.createZstdDecompress === "function" ? 1 : 2);
  assert.equal(r.provenance.archive_codecs.zst, typeof zlib.createZstdDecompress === "function");
  assert.equal(r.native_totals.all.total_tokens, null);
});

for (const kind of Object.keys(compressors)) test(`Codex ${kind} cannot silently accept trailing bytes or an ignored second member`, async t => {
  for (const member of [false, true]) {
    const f = fixture();
    const path = archive(f, "tail", [event(at(0), usage()), event(at(1), usage(100))], kind);
    const suffix = member ? compressors[kind](Buffer.from(JSON.stringify(event(at(2), usage(150))) + "\n")) : Buffer.from("UNTRUSTED-TRAILER");
    writeFileSync(path, Buffer.concat([readFileSync(path), suffix]));
    const r = await f.report();
    if (kind === "zst" && member) {
      t.diagnostic(`Zstandard concatenation outcome: ${r.native_totals.all.total_tokens === null ? "quarantined" : "decoded"}`);
      assert.equal(r.coverage.compressed_files_skipped, 0);
      assert.equal(r.provenance.input_files.length, 1);
      const input = r.provenance.input_files[0];
      assert.equal(input.compression, "zst");
      if (r.native_totals.all.total_tokens !== null) {
        assert.equal(r.native_totals.all.total_tokens, 150);
        assert.equal(r.native_totals.all.observed_total_tokens, 150);
        assert.equal(r.coverage.compressed_files_decoded, 1);
        assert.equal(r.coverage.compressed_files_failed, 0);
        assert.equal(input.readable, true);
        assert.equal(input.archive_error, null);
        assert.equal(input.sha256, createHash("sha256").update(readFileSync(path)).digest("hex"));
      } else {
        assert.equal(r.native_totals.all.observed_total_tokens, 0);
        assert.equal(r.coverage.compressed_files_decoded, 0);
        assert.equal(r.coverage.compressed_files_failed, 1);
        assert.equal(r.coverage.unreadable_matching_files, 1);
        assert.equal(input.readable, false);
        assert.equal(input.sha256, null);
        assert.ok(["archive-trailing-data", "archive-decode-or-read-error"].includes(input.archive_error));
      }
    } else if (kind === "gz" && member) {
      assert.equal(r.native_totals.all.total_tokens, 150);
      assert.equal(r.coverage.compressed_files_decoded, 1);
    } else {
      assert.equal(r.native_totals.all.total_tokens, null);
      assert.equal(r.native_totals.all.observed_total_tokens, 0);
      assert.equal(r.coverage.compressed_files_failed, 1);
      if (r.provenance.input_files.length && kind !== "gz") assert.equal(r.provenance.input_files[0].archive_error, "archive-trailing-data");
    }
    assert.doesNotMatch(JSON.stringify(r), /UNTRUSTED-TRAILER/);
  }
});

function parentHeader(f, overrides = {}) {
  return { type: "session_meta", timestamp: at(2), payload: { id: "parent", session_id: "parent", timestamp: "2026-10-13T00:00:00Z", cwd: f.project, model_provider: "openai", agent_role: "waypost-critic", cli_version: "PARENT-VERSION-PRIVATE", ...overrides } };
}
const parentHints = [
  { parent_thread_id: "parent" },
  { forked_from_id: "parent" },
  { source: { subagent: { thread_spawn: { parent_thread_id: "parent" } } } },
  { parent_thread_id: "parent", forked_from_id: "parent", source: { subagent: { thread_spawn: { parent_thread_id: "parent" } } } },
];

test("Codex explicit inherited parent header never charges a parent's counter prefix or role", async () => {
  for (const hints of parentHints) {
    const f = fixture();
    f.write("child", [parentHeader(f), event("2026-10-13T23:00:00Z", usage(500)), event(at(1), usage(1000)), event(at(2), usage(1030))], { meta: { ...hints, agent_role: "waypost-reviewer" } });
    const r = await f.report();
    assert.equal(r.coverage.inherited_parent_headers, 1);
    assert.equal(r.coverage.conflicting_contexts, 0);
    assert.equal(r.native_totals.all.observed_total_tokens, 30);
    assert.equal(r.native_totals.all.total_tokens, null);
    assert.equal(r.contexts[0].coverage.unknown_prefixes, 1);
    assert.equal(r.contexts[0].coverage.historical_snapshots, 1);
    assert.equal(r.contexts[0].role, "waypost-reviewer");
    assert.equal(r.native_totals.waypost.observed_total_tokens, 30);
    assert.doesNotMatch(JSON.stringify(r), /PARENT-VERSION-PRIVATE/);
  }
});

for (const kind of [null, ...Object.keys(compressors)]) test(`Codex inherited prefix with explicit zero anchor in ${kind ?? "plain"} preserves native spans`, async () => {
  const f = fixture(), frames = [parentHeader(f), event("2026-10-13T23:00:00Z", usage(500)), event(at(0), usage()), event(at(1), usage(40))];
  if (kind) archive(f, "child", frames, kind, { meta: { forked_from_id: "parent" } });
  else f.write("child", frames, { meta: { forked_from_id: "parent" } });
  const r = await f.report();
  assert.equal(r.coverage.inherited_parent_headers, 1);
  assert.equal(r.native_totals.all.total_tokens, 40);
  assert.equal(r.native_totals.all.observed_spans, 1);
});

test("Codex absent or invalid parentage cannot authorize inherited metadata", async () => {
  for (const hints of [{}, { parent_thread_id: null }, { parent_thread_id: "" }, { parent_thread_id: 123 }, { parent_thread_id: "child" }, { parent_thread_id: "parent", forked_from_id: "another" }]) {
    const f = fixture();
    f.write("child", [parentHeader(f), event(at(0), usage()), event(at(1), usage(100))], { meta: hints });
    const r = await f.report();
    assert.equal(r.native_totals.all.observed_total_tokens, 0);
    assert.equal(r.native_totals.all.total_tokens, null);
    assert.equal(r.coverage.inherited_parent_headers, 0);
    assert.ok(r.coverage.unidentifiable_headers + r.coverage.conflicting_contexts > 0);
  }
});

test("Codex inherited metadata exception is exact, older, same-cwd and immediately after the current header", async () => {
  for (const mode of ["unrelated", "foreign", "same-time", "newer", "invalid", "after-content", "after-token", "after-gap", "duplicate", "after-own-header"]) {
    const f = fixture();
    const overrides = mode === "unrelated" ? { id: "another" } : mode === "foreign" ? { cwd: f.project + "-other" } : mode === "same-time" ? { timestamp: created } : mode === "newer" ? { timestamp: at(1) } : mode === "invalid" ? { id: null } : {};
    const parent = parentHeader(f, overrides), frames = [parent, event(at(0), usage()), event(at(1), usage(100))];
    if (mode === "after-content") frames.unshift({ type: "response_item", payload: "PRIVATE-INHERITED-BODY" });
    if (mode === "after-token") frames.unshift(event("2026-10-13T22:00:00Z", usage(100)));
    if (mode === "after-gap") frames.unshift("{bad");
    if (mode === "duplicate") frames.splice(1, 0, parent);
    if (mode === "after-own-header") frames.unshift({ type: "session_meta", payload: { id: "child", session_id: "child", timestamp: created, cwd: f.project, model_provider: "openai", cli_version: "fixture", forked_from_id: "parent" } });
    f.write("child", frames, { meta: { forked_from_id: "parent" } });
    const r = await f.report();
    assert.equal(r.coverage.conflicting_contexts, 1, mode);
    assert.equal(r.native_totals.all.observed_total_tokens, 0, mode);
    assert.equal(r.native_totals.all.total_tokens, null, mode);
    assert.doesNotMatch(JSON.stringify(r), /PRIVATE-INHERITED-BODY/);
  }
});

test("Codex parent identity stays bound across compatible replay and foreign headers", async () => {
  for (const incompatible of [false, true, "foreign"]) {
    const f = fixture(), frames = [parentHeader(f), event(at(0), usage()), event(at(1), usage(100))];
    f.write("child", frames, { name: "a.jsonl", meta: { forked_from_id: "parent" } });
    archive(f, "child", frames, "gz", { name: "b.jsonl", meta: { forked_from_id: incompatible ? "different-parent" : "parent", ...(incompatible === "foreign" ? { cwd: f.project + "-other" } : {}) } });
    const r = await f.report();
    assert.equal(r.native_totals.all.observed_total_tokens, incompatible ? 0 : 100);
    assert.equal(r.coverage.conflicting_contexts, incompatible ? 1 : 0);
    if (!incompatible) { assert.equal(r.coverage.replay_files, 1); assert.equal(r.coverage.inherited_parent_headers, 2); }
  }
});

test("Codex accepted parent metadata stays consistent across child replay copies", async () => {
  for (const differing of [{ timestamp: "2026-10-12T00:00:00Z" }, { agent_role: "other-role" }, { cwd: "/foreign-parent-project" }]) {
    const f = fixture(), counters = [event(at(0), usage()), event(at(1), usage(100))];
    f.write("child", [parentHeader(f), ...counters], { name: "a.jsonl", meta: { forked_from_id: "parent" } });
    archive(f, "child", [parentHeader(f, differing), ...counters], "gz", { name: "b.jsonl", meta: { forked_from_id: "parent" } });
    const r = await f.report();
    assert.equal(r.coverage.conflicting_contexts, 1);
    assert.equal(r.native_totals.all.observed_total_tokens, 0);
    assert.equal(r.native_totals.all.total_tokens, null);
  }
});

test("Codex accepted parent metadata is checked against first headers before project filtering", async () => {
  for (const differing of [{}, { cwd: "/foreign-parent-project" }, { timestamp: "2026-10-12T00:00:00Z" }, { agent_role: "other-role" }]) {
    for (const parentFirst of [false, true]) {
      const f = fixture(), parent = parentHeader(f, differing);
      f.write("parent", [], { name: parentFirst ? "a.jsonl" : "z.jsonl", meta: parent.payload });
      f.write("child", [parentHeader(f), event(at(0), usage()), event(at(1), usage(100))], { name: "m.jsonl", meta: { forked_from_id: "parent" } });
      const r = await f.report();
      const conflict = Object.keys(differing).length > 0;
      assert.equal(r.native_totals.all.observed_total_tokens, conflict ? 0 : 100);
      assert.equal(r.contexts.find(c => c.id === "child").observed_total_tokens, conflict ? 0 : 100);
      assert.ok(!conflict || r.coverage.conflicting_contexts > 0);
    }
  }
});

test("Codex copied parent envelope timestamps do not create false replay conflicts", async () => {
  const f = fixture(), parent = parentHeader(f), counters = [event(at(0), usage()), event(at(1), usage(100))];
  f.write("child", [parent, ...counters], { name: "a.jsonl", meta: { forked_from_id: "parent" } });
  archive(f, "child", [{ ...parent, timestamp: at(3) }, ...counters], "gz", { name: "b.jsonl", meta: { forked_from_id: "parent" } });
  const r = await f.report();
  assert.equal(r.coverage.conflicting_contexts, 0);
  assert.equal(r.native_totals.all.total_tokens, 100);
  assert.equal(r.coverage.inherited_parent_headers, 2);
});

test("Codex unknown-prefix diagnostics use the existing completeness boundaries", async () => {
  const cases = [
    { first: at(1), last: at(3), from: at(2), to: at(4), overlap: 0, observed: 50, total: 50 },
    { first: at(2), last: at(3), from: at(2), to: at(4), overlap: 1, observed: 50, total: null },
    { first: at(3), last: at(4), from: at(2), to: at(5), overlap: 1, observed: 50, total: null },
    { first: at(4), last: at(5), from: at(2), to: at(4), overlap: 1, observed: 0, total: null },
    { first: at(5), last: at(6), from: at(2), to: at(4), overlap: 1, observed: 0, total: null },
    { born: at(4), first: at(5), last: at(6), from: at(2), to: at(4), overlap: 0, observed: 0, total: 0 },
    { born: at(5), first: at(6), last: at(7), from: at(2), to: at(4), overlap: 0, observed: 0, total: 0 },
    { first: at(1), last: at(2), overlap: 1, observed: 50, total: null },
    { first: at(1), last: at(3), from: at(2), overlap: 0, observed: 50, total: 50 },
    { first: at(1), last: at(3), to: at(4), overlap: 1, observed: 50, total: null },
    { first: "2026-10-14T02:00:00+01:00", last: at(3), from: at(2), to: at(4), overlap: 0, observed: 50, total: 50 },
  ];
  for (const row of cases) {
    const f = fixture();
    f.write("prefix", [event(row.first, usage(100)), event(row.last, usage(150))], { meta: { timestamp: row.born ?? created } });
    const r = await f.report({ since: row.from, until: row.to });
    assert.equal(r.contexts[0].coverage.unknown_prefixes, 1);
    assert.equal(r.contexts[0].coverage.unknown_prefixes_overlapping_period, row.overlap);
    assert.equal(r.coverage.unknown_prefix_contexts, 1);
    assert.equal(r.coverage.unknown_prefix_contexts_overlapping_period, row.overlap);
    assert.equal(r.native_totals.all.observed_total_tokens, row.observed);
    assert.equal(r.native_totals.all.total_tokens, row.total);
    assert.equal(r.native_totals.all.complete_within_discovered_retained_sources, row.total !== null);
  }
});

test("Codex prefix diagnostics deduplicate replay and exclude quarantined contexts", async () => {
  const f = fixture(), replay = [event(at(1), usage(100)), event(at(3), usage(150))], uncertain = [event(at(2), usage(50)), event(at(3), usage(60))];
  f.write("replay", replay, { name: "a.jsonl" });
  archive(f, "replay", [...replay, event(at(4), usage(180))], "gz", { name: "b.jsonl" });
  f.write("overlap", uncertain, { meta: { agent_role: "waypost-critic" } });
  f.write("quarantine", uncertain, { name: "c.jsonl", meta: { agent_role: "waypost-critic" } });
  f.write("quarantine", uncertain, { name: "d.jsonl", meta: { agent_role: "waypost-reviewer" } });
  const r = await f.report({ since: at(2), until: at(5) });
  assert.equal(r.coverage.matched_contexts, 3);
  assert.equal(r.coverage.replay_files, 2);
  assert.equal(r.coverage.conflicting_contexts, 1);
  assert.equal(r.coverage.unknown_prefix_contexts, 2);
  assert.equal(r.coverage.unknown_prefix_contexts_overlapping_period, 1);
  assert.deepEqual(r.contexts.find(c => c.id === "quarantine").coverage, {});
  assert.equal(r.native_totals.all.observed_total_tokens, 90);
  assert.equal(r.native_totals.waypost.observed_total_tokens, 10);
  assert.equal(r.native_totals.all.total_tokens, null);
  assert.equal(r.token_shares.full_retained_source_waypost_percent, null);
  assert.match(r.measurement.prefix_diagnostics, /quarantined contexts excluded/);
});

test("Codex zero prefix diagnostics never hide absent observations or gap recovery", async () => {
  for (const [frames, observed, total] of [
    [[event(at(0), usage()), event(at(1), usage(10))], 10, 10],
    [[], 0, null],
    [[event(at(1), null), event(at(2), usage(100)), event(at(3), usage(110))], 10, null],
  ]) {
    const f = fixture(); f.write("other-gaps", frames);
    const r = await f.report();
    assert.equal(r.coverage.unknown_prefix_contexts, 0);
    assert.equal(r.coverage.unknown_prefix_contexts_overlapping_period, 0);
    assert.equal(r.native_totals.all.observed_total_tokens, observed);
    assert.equal(r.native_totals.all.total_tokens, total);
    const detailed = formatCodexReport(r);
    assert.match(detailed, /unknown initial prefixes: 0 contexts; overlapping requested period 0/);
    assert.match(detailed, /other gaps possible/);
    const legacy = structuredClone(r);
    delete legacy.coverage.unknown_prefix_contexts;
    delete legacy.coverage.unknown_prefix_contexts_overlapping_period;
    assert.match(formatCodexReport(legacy), /unknown initial prefixes: unknown contexts; overlapping requested period unknown/);
    assert.equal(formatCodexReport(r, { summary: true }), formatCodexReport(legacy, { summary: true }));
  }
});

test("Codex CLI shows prefix diagnostics only in JSON and detailed output", () => {
  const f = fixture(); f.write("cli-prefix", [event(at(1), usage(100)), event(at(2), usage(150))]);
  const json = cli(f, ["--json"]);
  assert.equal(json.status, 0, json.stderr);
  const r = JSON.parse(json.stdout);
  assert.equal(r.coverage.unknown_prefix_contexts, 1);
  assert.equal(r.coverage.unknown_prefix_contexts_overlapping_period, 1);
  assert.equal(r.native_totals.all.total_tokens, null);
  const detailed = cli(f);
  assert.equal(detailed.status, 0, detailed.stderr);
  assert.match(detailed.stdout, /unknown initial prefixes: 1 contexts; overlapping requested period 1/);
  const compact = cli(f, ["--summary"]);
  assert.equal(compact.status, 0, compact.stderr);
  assert.doesNotMatch(compact.stdout, /unknown initial prefixes|overlapping requested period/);
  assert.ok(compact.stdout.length < 600);
});
