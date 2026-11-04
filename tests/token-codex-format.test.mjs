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

test("Codex session lists share the observed unit only above the threshold", () => {
  const contexts = [
    { id: "a", role: null, observed_total_tokens: null },
    { id: "b", role: "", observed_total_tokens: 0 },
    { id: "Путь 🚀", role: "waypost-reviewer", observed_total_tokens: 1234567890123 },
    { id: "a", role: undefined, observed_total_tokens: undefined },
    { id: "a", role: "unattributed", observed_total_tokens: "unknown" },
  ];
  for (const count of [0, 1, 4, 5, 20]) {
    const r = report(); r.contexts = Array.from({ length: count }, (_, i) => contexts[i % contexts.length]);
    const before = JSON.stringify(r), rows = r.contexts.map(c => `${c.id}  ${c.role ?? "unattributed"}  ${c.observed_total_tokens ?? "unknown"}`);
    const expected = count >= 5 ? "contexts (id, role, observed tokens):\n" + rows.join("\n") + "\n"
      : rows.map(row => row + " observed tokens\n").join("");
    assert.equal(leaf.formatCodexReport(r, { sessions: true }), detailed + expected);
    assert.equal(owner.formatCodexReport(r), detailed);
    assert.equal(owner.formatCodexReport(r, { summary: true, sessions: true }), compact);
    assert.equal(JSON.stringify(r), before);
  }
});

test("Codex multiline context fields keep the exact legacy rows", () => {
  for (const [field, value] of [["id", "a\nb"], ["role", "a\rb"], ["observed_total_tokens", "a\nb"]]) {
    const r = report(); r.contexts = Array.from({ length: 8 }, () => ({ id: "same", role: "", observed_total_tokens: 0 }));
    r.contexts[4][field] = value;
    const legacy = r.contexts.map(c => `${c.id}  ${c.role}  ${c.observed_total_tokens} observed tokens\n`).join("");
    assert.equal(leaf.formatCodexReport(r, { sessions: true }), detailed + legacy);
  }
});

test("Codex session formatting preserves one-pass getter, coercion and iterator ordering", () => {
  const events = [], r = report();
  const context = {};
  for (const [field, label] of [["id", "ID"], ["role", "ROLE"], ["observed_total_tokens", "VALUE"]]) {
    Object.defineProperty(context, field, { get() {
      events.push(`get ${field}`);
      return { [Symbol.toPrimitive](hint) { events.push(`coerce ${field} ${hint}`); return label; } };
    } });
  }
  Object.defineProperty(r, "contexts", { get() { events.push("contexts"); return {
    get length() { throw new Error("must not read iterable length"); },
    *[Symbol.iterator]() { events.push("iterator"); for (let i = 0; i < 5; i++) { events.push(`yield ${i}`); yield context; } events.push("done"); },
  }; } });
  assert.equal(leaf.formatCodexReport(r, { sessions: true }), detailed + "contexts (id, role, observed tokens):\n" + "ID  ROLE  VALUE\n".repeat(5));
  assert.deepEqual(events, ["contexts", "iterator", ...Array.from({ length: 5 }, (_, i) => [
    `yield ${i}`, "get id", "coerce id string", "get role", "coerce role string", "get observed_total_tokens", "coerce observed_total_tokens string",
  ]).flat(), "done"]);
  const failure = new Error("role failed"); let closed = false, valueRead = false;
  const broken = { id: "ID", get role() { throw failure; }, get observed_total_tokens() { valueRead = true; return 0; } };
  const throwing = report(); throwing.contexts = { *[Symbol.iterator]() { try { yield broken; } finally { closed = true; } } };
  assert.throws(() => leaf.formatCodexReport(throwing, { sessions: true }), error => error === failure);
  assert.equal(closed, true); assert.equal(valueRead, false);
});
