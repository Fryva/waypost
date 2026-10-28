import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as owner from "../scripts/token-codex.mjs";
import * as leaf from "../scripts/token-codex-format.mjs";

const report = () => ({
  native_totals: { all: { observed_total_tokens: 12345, observed_spans: 2, complete_within_discovered_retained_sources: true } },
  token_shares: { observed_waypost_percent: 12.345 },
  coverage: { matched_contexts: 3, compressed_files_decoded: 2, compressed_files_skipped: 3, compressed_files_failed: 4, unidentifiable_headers: 5, unknown_prefix_contexts: 2, unknown_prefix_contexts_overlapping_period: 1 },
  contexts: [{ id: "a", role: null, observed_total_tokens: null }, { id: "b", role: "", observed_total_tokens: 0 }, { id: "c", role: "waypost-reviewer", observed_total_tokens: 42 }],
});

test("Codex formatting leaf preserves the three-name facade and source budgets", () => {
  assert.deepEqual(Object.keys(owner), ["collectCodexReport", "formatCodexReport", "reduceCodexHistory"]);
  assert.deepEqual(Object.keys(leaf), ["formatCodexReport"]);
  assert.equal(owner.formatCodexReport, leaf.formatCodexReport);
  assert.equal(leaf.formatCodexReport.name, "formatCodexReport");
  assert.equal(leaf.formatCodexReport.length, 1);
  const source = readFileSync(new URL("../scripts/token-codex-format.mjs", import.meta.url), "utf8");
  assert.ok(Buffer.byteLength(source) <= 3000);
  assert.doesNotMatch(source, /^import |\bprocess\s*\.|\bDate\s*\./m);
  assert.ok(Buffer.byteLength(readFileSync(new URL("../scripts/token-codex.mjs", import.meta.url))) <= 24000);
});

// Captured from the original formatter before extraction.
const detailed = "waypost tokens (Codex): 12345 observed native tokens in 2 spans\nexplicit Waypost role share: 12.35% of covered spans; full retained-source coverage true\nscope: plain and supported compressed retained rollouts; first nonzero snapshots are uncharged baselines; no subscription quota conversion\ncontexts 3; decoded archives 2; skipped compressed files 3; failed archives 4; unknown headers 5\nunknown initial prefixes: 2 contexts; overlapping requested period 1 (quarantined contexts excluded; other gaps possible)\ncache/reasoning are subsets of input/output; snapshots are not request counts\n";
const sessions = "waypost tokens (Codex): 12345 observed native tokens in 2 spans\nexplicit Waypost role share: 12.35% of covered spans; full retained-source coverage true\nscope: plain and supported compressed retained rollouts; first nonzero snapshots are uncharged baselines; no subscription quota conversion\ncontexts 3; decoded archives 2; skipped compressed files 3; failed archives 4; unknown headers 5\nunknown initial prefixes: 2 contexts; overlapping requested period 1 (quarantined contexts excluded; other gaps possible)\ncache/reasoning are subsets of input/output; snapshots are not request counts\na  unattributed  unknown observed tokens\nb    0 observed tokens\nc  waypost-reviewer  42 observed tokens\n";
const compact = "waypost tokens (Codex): 12345 observed native tokens in 2 spans\nexplicit Waypost role share: 12.35% of covered spans; full retained-source coverage true\nscope: plain and supported compressed retained rollouts; first nonzero snapshots are uncharged baselines; no subscription quota conversion\n";

test("Codex formatting keeps captured text, session order and input values", () => {
  const r = report(), before = JSON.stringify(r);
  assert.equal(owner.formatCodexReport(r), detailed);
  assert.equal(leaf.formatCodexReport(r, { sessions: true }), sessions);
  assert.equal(owner.formatCodexReport(r, { summary: true, sessions: true }), compact);
  assert.equal(JSON.stringify(r), before);
});

test("Codex compact output skips detail but still evaluates option getters", () => {
  const r = report(), events = [];
  Object.defineProperty(r, "coverage", { get() { throw new Error("detail must not be read"); } });
  assert.equal(owner.formatCodexReport(r, { summary: true, sessions: true }), compact);
  assert.throws(() => owner.formatCodexReport(r, {
    get summary() { events.push("summary"); return true; },
    get sessions() { events.push("sessions"); throw new Error("fixture sessions getter"); },
  }), /fixture sessions getter/);
  assert.deepEqual(events, ["summary", "sessions"]);
});
