// mps — tokens.mjs: usage/cost accounting from Claude Code's own transcripts
// (P3-4, G-14). Builds a minimal transcript fixture under a throwaway HOME
// and drives the CLI with `--project <dir>`, since tokens.mjs reads
// ~/.claude/projects/<slug> rather than anything mps itself writes.
//   node --test tests/*.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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
//     agentType "mps-critic" — the exact attribution shape Claude Code writes.
function fixture() {
  const home = mkdtempSync(join(tmpdir(), "mps-tok-home-"));
  const project = join(tmpdir(), "mps-tok-project-does-not-exist");
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
    JSON.stringify({ agentType: "mps-critic", description: "Test critic run" }), "utf8");
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
    encoding: "utf8", env: { ...process.env, HOME: home }, timeout: 15000,
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

test("tokens: a subagent run is attributed by its meta.json's agentType, and counted as mps work", () => {
  const { home, project } = fixture();
  const r = run(home, ["--project", project, "--json"]);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  const agent = out.buckets.find((b) => b.bucket === "agent: mps-critic");
  assert.ok(agent, `expected an "agent: mps-critic" bucket, got: ${JSON.stringify(out.buckets)}`);
  assert.equal(agent.requests, 1);
  assert.equal(agent.runs, 1, "one meta.json is one spawn");
  // isProjectstore requires kind !== "main" and a bucket naming mps/projectstore
  // — the reason vault-work totals do not also count the main thread's own,
  // unattributed requests.
  const critique = out.stages.find((s) => s.bucket === "critique");
  assert.ok(critique, `mps-critic maps to the "critique" lifecycle stage: ${JSON.stringify(out.stages)}`);
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
  assert.ok(out.totals.mps && out.totals.other && out.totals.all, "the three-way split is always present");
  assert.equal(out.totals.all.requests, 2, "req1 + req2, deduped");
});

test("tokens: text mode (no --json) runs end to end without throwing", () => {
  const { home, project } = fixture();
  const r = run(home, ["--project", project]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /mps token usage/);
  assert.match(r.stdout, /vault share:/);
});

test("tokens: no transcripts for this project says so, rather than crashing or printing nothing", () => {
  const home = mkdtempSync(join(tmpdir(), "mps-tok-home-"));
  const project = join(tmpdir(), "mps-tok-project-truly-absent");
  const r = run(home, ["--project", project]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /no transcripts for this project/);
});
