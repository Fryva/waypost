import { test } from "node:test";
import assert from "node:assert/strict";
import { createNavigationAnalyzer } from "../scripts/token-navigation.mjs";

const PROJECT = "/work/Waypost";
const usage = (context, input = 10) => ({ context, input, cacheWrite: 20, cacheRead: 30, output: 5, usageComplete: true });
const call = (requestId, id, name = "Read", input = { file_path: "bin/waypost.mjs" }, extra = {}) => ({
  type: "assistant", requestId, message: { content: [{ type: "tool_use", id, name, input }] }, ...extra,
});
const result = (id, content = "same content", extra = {}, record = {}) => ({
  type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content, ...extra }] }, ...record,
});
function fixture(project = PROJECT) {
  const analyzer = createNavigationAnalyzer({ project });
  const rows = new Map();
  return {
    analyzer, rows,
    observe: (rec, context = "session") => analyzer.observe(rec, { context }),
    read(id, content = "same content", input = { file_path: "bin/waypost.mjs" }, context = "session", extra = {}) {
      rows.set(id, usage(context));
      analyzer.observe(call(id, id, "Read", input), { context });
      analyzer.observe(result(id, content, extra), { context });
    },
    report: () => analyzer.report(rows),
  };
}

test("navigation deduplicates calls and initiating usage across content blocks", () => {
  const f = fixture();
  f.rows.set("request", usage("session"));
  const a = call("request", "a");
  f.observe(a); f.observe(a);
  f.observe(call("request", "b", "Grep", { pattern: "x", path: "bin/cli" }));
  f.observe(call("request", "c", "Glob", { pattern: "bin/cli/**/*.mjs" }));
  f.observe(result("a")); f.observe(result("a"));
  const report = f.report();
  assert.equal(report.calls.total, 3);
  assert.equal(report.calls.cli, 3);
  assert.equal(report.initiating_requests.count, 1);
  assert.equal(report.initiating_requests.observed_input, 60);
  assert.equal(report.reads.successful_results, 1);
  assert.deepEqual(report, f.report(), "report is repeatable");
});

test("native row context deduplicates inline copies and isolates subagents", () => {
  const f = fixture();
  const copied = call("sub-request", "sub-call");
  f.rows.set("sub-request", usage("session/subagent"));
  f.observe(copied, "session"); f.observe(result("sub-call"), "session");
  f.observe(copied, "session/subagent"); f.observe(result("sub-call"), "session/subagent");
  f.read("main-read");
  f.read("sub-next", "same content", undefined, "session/subagent");
  const report = f.report();
  assert.equal(report.calls.read, 3);
  assert.equal(report.initiating_requests.count, 3);
  assert.equal(report.reads.repeated_identical_results, 1);
});

test("identical call ids from independent contexts do not collapse", () => {
  const f = fixture();
  for (const context of ["session", "session/a"]) {
    f.rows.set(context, usage(context));
    f.observe(call(context, "reused-id"), context);
    f.observe(result("reused-id"), context);
  }
  assert.equal(f.report().calls.read, 2);
  assert.equal(f.report().reads.repeated_identical_results, 0);
});

test("normalized cwd, slash and traversal paths identify all CLI entry forms", () => {
  const f = fixture();
  for (const [index, path] of ["./bin/../bin/waypost", "/work/Waypost/bin/waypost.mjs", "bin\\cli\\commands.mjs", "../bin/waypost.mjs", "bin/waypost.mjs.backup", "/elsewhere/bin/waypost.mjs"].entries()) {
    f.observe(call(`r${index}`, `c${index}`, "Read", { file_path: path }, index === 3 ? { cwd: `${PROJECT}/scripts` } : {}));
  }
  assert.equal(f.report().calls.cli, 4);
  const windows = fixture("C:\\work\\Waypost");
  windows.observe(call("w", "w", "Read", { file_path: "c:\\work\\Waypost\\bin\\cli\\foo.mjs" }));
  assert.equal(windows.report().calls.cli, 1);
});

test("repeat evidence requires identical context, normalized path, scope and returned text", () => {
  const f = fixture();
  f.read("a", "old", { file_path: "./bin/waypost.mjs", offset: 1, limit: 5 });
  f.read("b", "old", { file_path: "bin/waypost.mjs", offset: 1, limit: 5 });
  f.read("c", "new", { file_path: "bin/waypost.mjs", offset: 1, limit: 5 });
  f.read("d", "old", { file_path: "bin/waypost.mjs", offset: 1, limit: 5 });
  f.read("e", "old", { file_path: "bin/waypost.mjs", offset: 2, limit: 5 });
  f.read("f", "old", { file_path: "bin/waypost" });
  assert.equal(f.report().reads.repeated_identical_results, 1);
  assert.equal(f.report().reads.repeated_returned_characters, 3);
});

test("edit, write, patch and compaction invalidate earlier evidence", () => {
  const f = fixture();
  f.read("initial");
  for (const name of ["Edit", "Write", "apply_patch"]) {
    f.observe(call(name, name, name, { file_path: "other-file" }));
    f.read(`after-${name}`);
  }
  f.observe({ type: "system", subtype: "compact_boundary", uuid: "compact" });
  f.read("after-compact");
  const report = f.report();
  assert.equal(report.reads.repeated_identical_results, 0);
  assert.equal(report.coverage.invalidations, 4);
  assert.equal(report.coverage.compactions, 1);
});

test("subagent edits do not invalidate another context", () => {
  const f = fixture();
  f.read("a");
  f.observe(call("edit-sub", "edit", "Edit"), "session/sub");
  f.read("b");
  assert.equal(f.report().reads.repeated_identical_results, 1);
});

test("errors, missing, conflicting, nontext and truncated output cannot establish repeats", () => {
  const f = fixture();
  f.read("error", "same content", undefined, undefined, { is_error: true });
  f.observe(call("missing", "missing"));
  f.read("truncated", "same content [output truncated]");
  f.read("metadata-truncated", "same content", undefined, undefined, { truncated: true });
  f.read("nontext", [{ type: "image", data: "private image" }]);
  f.read("conflict", "first"); f.observe(result("conflict", "second"));
  f.read("good");
  const report = f.report();
  assert.equal(report.reads.repeated_identical_results, 0);
  assert.equal(report.reads.successful_results, 1);
  assert.equal(report.reads.error_results, 1);
  assert.equal(report.reads.missing_results, 1);
  assert.equal(report.reads.truncated_results, 2);
  assert.equal(report.reads.unsupported_results, 1);
  assert.equal(report.reads.conflicting_results, 1);
});

test("an intervening failed or missing read removes evidence for that scope", () => {
  const f = fixture();
  f.read("a");
  f.read("error", "failed", undefined, undefined, { is_error: true });
  f.read("b");
  f.observe(call("missing", "missing"));
  f.read("c");
  assert.equal(f.report().reads.repeated_identical_results, 0);
});

test("unbounded requests are separate from explicitly confirmed whole files", () => {
  const f = fixture();
  f.read("unbounded");
  f.read("bounded", "lines", { file_path: "bin/waypost.mjs", offset: 3, limit: 4 });
  f.observe(call("whole", "whole"));
  f.observe(result("whole", "all", {}, { toolUseResult: { file: { startLine: 1, numLines: 3, totalLines: 3 } } }));
  const report = f.report();
  assert.equal(report.reads.unbounded_requests, 2);
  assert.equal(report.reads.bounded_requests, 1);
  assert.equal(report.reads.whole_file_confirmed_results, 1);
});

test("conservative shell subset never executes commands and exposes unsupported coverage", () => {
  const f = fixture();
  const supported = ["cat bin/waypost", "cat -- 'bin/waypost.mjs'", "sed -n '10,20p' bin/cli/a.mjs", "rg -n 'handleStory' bin/waypost.mjs", "rg --files bin/cli"];
  const unsupported = ["cat bin/waypost | head", "cat $(pwd)/bin/waypost", "cat bin/*", "sed -n '$p' bin/waypost", "rg -n pattern", "cat'bin/waypost'", "node -e 'throw Error()'", "cat bin/waypost; rm file", "cat bin/waypost\ncat other", "rg --pre cat pattern bin/waypost"];
  for (const [i, command] of [...supported, ...unsupported].entries()) f.observe(call(`${i}`, `${i}`, "Bash", { command }));
  const report = f.report();
  assert.equal(report.calls.total, supported.length);
  assert.equal(report.calls.shell, supported.length);
  assert.equal(report.calls.cli, supported.length);
  assert.equal(report.coverage.unsupported_shell_calls, unsupported.length);
});

test("large returned output never attributes later unrelated request usage", () => {
  const f = fixture();
  f.read("read", "private output ".repeat(10000));
  f.rows.set("later", usage("session", 999999));
  f.observe({ type: "assistant", requestId: "later", message: { content: [{ type: "text", text: "unrelated" }] } });
  const report = f.report();
  assert.equal(report.initiating_requests.count, 1);
  assert.equal(report.initiating_requests.input, 10);
  assert.equal(report.reads.returned_characters, 150000);
  assert.ok(!JSON.stringify(report).includes("private output"));
});

test("missing and incomplete usage remain explicit without dropping navigation", () => {
  const f = fixture();
  f.observe(call("missing", "missing"));
  f.rows.set("partial", { context: "session", input: 4, cacheWrite: null, cacheRead: 2, output: 1, usageComplete: false });
  f.observe(call("partial", "partial"));
  f.observe(call(undefined, "no-request"));
  const report = f.report();
  assert.equal(report.calls.read, 3);
  assert.equal(report.initiating_requests.missing_usage, 1);
  assert.equal(report.initiating_requests.complete_usage, 0);
  assert.equal(report.initiating_requests.observed_input, 6);
  assert.equal(report.initiating_requests.complete_observed_input, null);
  assert.equal(report.coverage.calls_without_request_id, 1);
});

test("top file evidence is bounded and emits neither content nor hashes", () => {
  const f = fixture();
  for (let i = 0; i < 30; i++) f.read(`${i}`, `secret-text-${i}`, { file_path: `scripts/file-${i}.mjs` });
  const report = f.report();
  assert.equal(report.top_files.length, 20);
  assert.equal(report.coverage.files_observed, 30);
  assert.ok(!JSON.stringify(report).includes("secret-text"));
  assert.ok(!Object.keys(report.top_files[0]).includes("hash"));
});

test("edits between read issuance and return prevent reuse of stale evidence", () => {
  const f = fixture();
  f.read("first");
  f.observe(call("pending", "pending"));
  f.observe(call("edit", "edit", "Edit"));
  f.observe(result("pending"));
  f.read("next");
  assert.equal(f.report().reads.repeated_identical_results, 0);
});

test("API price proxy consumes cache-weighted priced row estimates once and preserves unknown prices", () => {
  const f = fixture();
  // The caller's price already includes the model's cache-read/write weights.
  f.rows.set("cache-heavy", { ...usage("session", 2), cacheRead: 100000, cacheWrite: 1000, estimatedApiCostUsd: 0.05126 });
  f.observe(call("cache-heavy", "one"));
  f.observe(call("cache-heavy", "two"));
  assert.deepEqual(f.report().initiating_requests.api_price_proxy, { known_usd: 0.05126, estimated_usd: 0.05126, complete: true });
  f.rows.set("unpriced", { ...usage("session"), estimatedApiCostUsd: null });
  f.observe(call("unpriced", "unpriced", "Read", { file_path: "scripts/other.mjs" }));
  assert.deepEqual(f.report().initiating_requests.api_price_proxy, { known_usd: 0.05126, estimated_usd: null, complete: false });
  assert.equal(f.report().cli_initiating_requests.api_price_proxy.complete, true);
});

test("malformed navigation arguments and missing call identity remain visible", () => {
  const f = fixture();
  f.observe(call("invalid", "invalid", "Read", { file_path: "bin/waypost", limit: -1 }));
  f.observe(call("no-id", undefined));
  f.observe(result(undefined));
  const report = f.report();
  assert.equal(report.coverage.unsupported_navigation_calls, 1);
  assert.equal(report.coverage.calls_without_tool_id, 1);
  assert.equal(report.coverage.unmatched_tool_results, 1);
  assert.equal(report.reads.successful_results, 0);
});

test("a stray result cannot borrow a unique tool call from another context", () => {
  const f = fixture();
  f.read("first");
  f.observe(call("second", "unique"));
  f.observe(result("unique"), "session/independent");
  const report = f.report();
  assert.equal(report.coverage.unmatched_tool_results, 1);
  assert.equal(report.reads.missing_results, 1);
  assert.equal(report.reads.successful_results, 1);
  assert.equal(report.reads.repeated_identical_results, 0);
});

test("malformed names, inputs and text blocks remain unknown instead of crashing", () => {
  const f = fixture();
  f.observe(call("name", "name", 42));
  for (const [i, input] of [null, 9, "file", [], true].entries()) f.observe(call(`input-${i}`, `input-${i}`, "Read", input));
  for (const [i, content] of [[null], [3], [true], ["text"], [{ type: "text", text: null }]].entries()) {
    f.observe(call(`result-${i}`, `result-${i}`));
    f.observe(result(`result-${i}`, content));
  }
  const report = f.report();
  assert.equal(report.coverage.malformed_tool_calls, 6);
  assert.equal(report.coverage.unsupported_navigation_calls, 5);
  assert.equal(report.reads.unsupported_results, 5);
  assert.equal(report.reads.successful_results, 0);
});

test("explicitly excluded requests omit calls and results while missing usage remains counted", () => {
  const f = fixture();
  f.read("excluded");
  f.observe(call("excluded", "excluded-edit", "Edit"));
  f.observe(call("missing-usage", "missing-usage"));
  f.observe(result("missing-usage"));
  const report = f.analyzer.report(f.rows, { excludeRequestIds: new Set(["excluded"]) });
  assert.equal(report.calls.total, 1);
  assert.equal(report.reads.successful_results, 1);
  assert.equal(report.reads.repeated_identical_results, 0);
  assert.equal(report.initiating_requests.count, 1);
  assert.equal(report.initiating_requests.with_usage, 0);
  assert.equal(report.initiating_requests.missing_usage, 1);
  assert.equal(report.initiating_requests.input, 0);
  assert.equal(report.coverage.unmatched_tool_results, 0);
  assert.equal(report.coverage.invalidations, 1);
  assert.equal(report.coverage.invalidations_from_excluded_requests, 1);
});

test("excluded request mutations in the supplied event window still invalidate repeat evidence", () => {
  for (const [name, input] of [["Edit", {}], ["Write", {}], ["apply_patch", {}], ["Bash", { command: "node mutate.mjs" }]]) {
    const f = fixture();
    f.read("a");
    const mutation = call("old-request", "mutation", name, input);
    f.observe(mutation);
    f.observe(mutation);
    f.read("b");
    const report = f.analyzer.report(f.rows, { excludeRequestIds: new Set(["old-request"]) });
    assert.equal(report.reads.repeated_identical_results, 0, name);
    assert.equal(report.calls.total, 2, name);
    assert.equal(report.coverage.invalidations, 1, name);
    assert.equal(report.coverage.invalidations_from_excluded_requests, 1, name);
    assert.equal(report.coverage.unsupported_shell_calls, 0, name);
  }
});
