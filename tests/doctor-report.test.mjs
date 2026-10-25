import { test } from "node:test";
import assert from "node:assert/strict";
import { renderDoctorReport } from "../scripts/doctor-report.mjs";

test("doctor report: complete mixed-level golden output and immutable inputs", () => {
  const findings = Object.freeze([
    Object.freeze({ group: "vault", level: "warn", check: "lint", message: "A warning.", file: "docs/a.md" }),
    Object.freeze({ group: "install", level: "issue", check: "config", message: "Missing binding." }),
    Object.freeze({ group: "vault", level: "info", check: "adr-guard", message: "adr/a.md: check stays complete.", file: "adr/a.md" }),
    Object.freeze({ group: "vault", level: "issue", check: "adr-guard", message: "would fail: adr/a.md: forbidden text.", file: "adr/a.md" }),
  ]);
  const groups = Object.freeze(["vault", "install", "empty"]);
  const metadata = Object.freeze({ version: "0.16.0", date: "2026-01-02" });
  const before = JSON.stringify({ findings, groups, metadata });
  const result = renderDoctorReport(findings, groups, metadata);
  assert.equal(result, [
    "waypost doctor — v0.16.0, 2026-01-02",
    "",
    "## vault (1 issue(s), 1 warning(s))",
    "  ⚠ [lint] A warning.  — docs/a.md",
    "  ℹ [adr-guard] adr/a.md: check stays complete.",
    "  ✖ [adr-guard] would fail: adr/a.md: forbidden text.  — adr/a.md",
    "",
    "## install (1 issue(s), 0 warning(s))",
    "  ✖ [config] Missing binding.",
    "",
    "## empty (0 issue(s), 0 warning(s))",
    "  ✓ clean",
    "",
    "Summary: 2 issue(s), 1 warning(s). Repairs: `waypost doctor --fix` (install), `waypost reconcile --write` (vault).",
  ].join("\n"));
  assert.ok(!result.endsWith("\n"), "the CLI, not the renderer, owns the final newline");
  assert.equal(JSON.stringify({ findings, groups, metadata }), before);
});

test("doctor report: group order/repetition and global summary are preserved", () => {
  const result = renderDoctorReport([
    { group: "shown", level: "trace", check: "custom", message: "Unknown level." },
    { group: "hidden", level: "issue", check: "hidden", message: "Still counted." },
  ], ["empty", "shown", "shown"], { version: null, date: "2000-02-03" });
  assert.equal(result, [
    "waypost doctor — v?, 2000-02-03",
    "",
    "## empty (0 issue(s), 0 warning(s))",
    "  ✓ clean",
    "",
    "## shown (0 issue(s), 0 warning(s))",
    "  ℹ [custom] Unknown level.",
    "",
    "## shown (0 issue(s), 0 warning(s))",
    "  ℹ [custom] Unknown level.",
    "",
    "Summary: 1 issue(s), 0 warning(s). Repairs: `waypost doctor --fix` (install), `waypost reconcile --write` (vault).",
  ].join("\n"));
});

test("doctor report: only the exact leading file prefix suppresses its suffix", () => {
  const findings = [
    { message: "adr/a.md: exact", file: "adr/a.md" },
    { message: "adr/a.md.extra: near", file: "adr/a.md" },
    { message: "adr/a.md guard 1: malformed", file: "adr/a.md" },
    { message: "contains adr/a.md: later", file: "adr/a.md" },
    { message: "without a file" },
  ].map(f => ({ group: "vault", level: "info", check: "path", ...f }));
  const result = renderDoctorReport(findings, ["vault"], { version: "x", date: "fixed" });
  assert.deepEqual(result.split("\n").slice(3, 8), [
    "  ℹ [path] adr/a.md: exact",
    "  ℹ [path] adr/a.md.extra: near  — adr/a.md",
    "  ℹ [path] adr/a.md guard 1: malformed  — adr/a.md",
    "  ℹ [path] contains adr/a.md: later  — adr/a.md",
    "  ℹ [path] without a file",
  ]);
});

test("doctor report: empty reports preserve version fallback and healthy summary", () => {
  for (const version of [undefined, null, "", 0]) {
    assert.equal(renderDoctorReport([], [], { version, date: "supplied" }),
      "waypost doctor — v?, supplied\n\nSummary: 0 issue(s), 0 warning(s). Vault and wiring look healthy.");
  }
});

test("doctor report: formatting uses the supplied date without consulting a clock", () => {
  const originalDate = globalThis.Date;
  try {
    globalThis.Date = class { constructor() { throw new Error("formatter consulted the clock"); } };
    assert.ok(renderDoctorReport([], [], { version: "v", date: "supplied" }).startsWith("waypost doctor — vv, supplied\n"));
  } finally {
    globalThis.Date = originalDate;
  }
});

const checkTail = " — it runs in the project's own test suite; doctor never executes it.";
const checkLegend = "  ADR check commands run in the project's test suite; doctor never executes them.";
const checkFinding = (id, group = "vault") => ({ group, level: "info", check: "adr-guard",
  file: `adr/${id}.md`, message: `adr/${id}.md: check \`node ${id}.mjs\` encodes this decision (reason ${id})${checkTail}` });

test("doctor report: one shared note preserves complete commands and reasons for multiple checks", () => {
  for (const count of [2, 3]) {
    const findings = Object.freeze(Array.from({ length: count }, (_, i) => Object.freeze(checkFinding(i))));
    const before = JSON.stringify(findings);
    const result = renderDoctorReport(findings, ["vault"], { version: "v", date: "fixed" });
    assert.deepEqual(result.split("\n"), [
      "waypost doctor — vv, fixed", "", "## vault (0 issue(s), 0 warning(s))",
      ...Array.from({ length: count }, (_, i) => `  ℹ [adr-guard] adr/${i}.md: check \`node ${i}.mjs\` encodes this decision (reason ${i})`),
      checkLegend, "", "Summary: 0 issue(s), 0 warning(s). Vault and wiring look healthy.",
    ]);
    assert.equal(JSON.stringify(findings), before);
    assert.ok(!result.endsWith("\n"));
  }
});

test("doctor report: zero or one canonical check retains its full message without a legend", () => {
  for (const findings of [[], [checkFinding("single")]]) {
    const result = renderDoctorReport(findings, ["vault"], { version: "v", date: "fixed" });
    assert.ok(!result.includes(checkLegend));
    if (findings.length) assert.ok(result.includes(`  ℹ [adr-guard] ${findings[0].message}\n`));
    else assert.ok(result.includes("  ✓ clean\n"));
  }
});

test("doctor report: near matches and rule reasons are never shortened alongside canonical checks", () => {
  const canonical = checkFinding("base");
  const unchanged = [
    { ...canonical, level: "warn" },
    { ...canonical, level: "issue" },
    { ...canonical, check: "other" },
    { ...canonical, message: canonical.message + " later" },
    { ...canonical, message: canonical.message.replace("own test suite", "test suite") },
    { ...canonical, message: canonical.message.replace("encodes this decision (", "has reason (") },
    { ...canonical, file: "adr/different.md" },
    { ...canonical, file: undefined },
    { ...canonical, message: `would fail: adr/base.md: forbid "unsafe" matched in src/a.mjs — reason${checkTail}` },
    { ...canonical, message: `would fail: adr/base.md: require "safe" missing in src/a.mjs — reason${checkTail}` },
  ];
  const result = renderDoctorReport([checkFinding("a"), ...unchanged, checkFinding("b")], ["vault"], { version: "v", date: "fixed" });
  const lines = result.split("\n");
  assert.equal(lines.filter(l => l === checkLegend).length, 1);
  for (const f of unchanged) {
    const icon = f.level === "issue" ? "✖" : f.level === "warn" ? "⚠" : "ℹ";
    const suffix = f.file && !f.message.startsWith(`${f.file}: `) ? `  — ${f.file}` : "";
    assert.ok(lines.includes(`  ${icon} [${f.check}] ${f.message}${suffix}`), f.message);
  }
  const rulesOnly = renderDoctorReport(unchanged.slice(-2), ["vault"], { version: "v", date: "fixed" });
  assert.ok(!rulesOnly.includes(checkLegend), "matching rule reasons alone never create a legend");
  for (const f of unchanged.slice(-2)) assert.ok(rulesOnly.includes(f.message));
  assert.ok(result.includes("## vault (1 issue(s), 1 warning(s))"));
  assert.ok(result.includes("Summary: 1 issue(s), 1 warning(s)."));
});

test("doctor report: check sharing is local to displayed groups, including repeated groups", () => {
  const separate = [checkFinding("a", "one"), checkFinding("b", "two")];
  const split = renderDoctorReport(separate, ["one", "two"], { version: "v", date: "fixed" });
  assert.ok(!split.includes(checkLegend));
  for (const f of separate) assert.ok(split.includes(f.message));
  const findings = [...separate, checkFinding("c", "one"), checkFinding("d", "hidden"), checkFinding("e", "hidden")];
  const result = renderDoctorReport(findings, ["one", "two", "one"], { version: "v", date: "fixed" });
  assert.equal(result.split("\n").filter(l => l === checkLegend).length, 2);
  assert.ok(result.includes(separate[1].message), "singleton in another group stays complete");
  assert.ok(!result.includes("adr/d.md"));
  assert.ok(!result.includes("adr/e.md"));
  assert.equal(result.split("\n").filter(l => l.startsWith("## one ")).length, 2);
});

const compactCheckLine = count => `  ℹ [adr-guard] ${count} declarative checks (not executed). Repeat this command with \`--full\` for commands and reasons.`;
const compactMetadata = Object.freeze({ version: "v", date: "fixed", compactChecks: true });

test("doctor compact checks: opt-in preserves zero/singleton reports and default API compatibility", () => {
  for (const count of [0, 1]) {
    const findings = Array.from({ length: count }, (_, i) => checkFinding(i));
    assert.equal(renderDoctorReport(findings, ["vault"], compactMetadata),
      renderDoctorReport(findings, ["vault"], { version: "v", date: "fixed" }));
  }
  const findings = [checkFinding("a"), checkFinding("b")];
  const full = renderDoctorReport(findings, ["vault"], { version: "v", date: "fixed" });
  assert.equal(renderDoctorReport(findings, ["vault"], { version: "v", date: "fixed", compactChecks: false }), full);
  assert.ok(full.includes(checkLegend));
});

test("doctor compact checks: first-slot count preserves interleaved warnings/issues/other information", () => {
  const a = checkFinding("same");
  const findings = Object.freeze([
    Object.freeze({ group: "vault", level: "info", check: "policy", message: "Before checks." }),
    Object.freeze(a),
    Object.freeze({ group: "vault", level: "warn", check: "safety", message: "Keep this warning.", file: "src/a.mjs" }),
    Object.freeze({ ...a }),
    Object.freeze({ group: "vault", level: "issue", check: "safety", message: "Keep this issue." }),
    Object.freeze({ group: "vault", level: "trace", check: "custom", message: "Keep unknown level." }),
  ]);
  const before = JSON.stringify(findings);
  assert.deepEqual(renderDoctorReport(findings, ["vault"], compactMetadata).split("\n"), [
    "waypost doctor — vv, fixed", "", "## vault (1 issue(s), 1 warning(s))",
    "  ℹ [policy] Before checks.", compactCheckLine(2),
    "  ⚠ [safety] Keep this warning.  — src/a.mjs",
    "  ✖ [safety] Keep this issue.", "  ℹ [custom] Keep unknown level.", "",
    "Summary: 1 issue(s), 1 warning(s). Repairs: `waypost doctor --fix` (install), `waypost reconcile --write` (vault).",
  ]);
  assert.equal(JSON.stringify(findings), before);
});

test("doctor compact checks: canonical-looking warnings and malformed/rule messages never fold", () => {
  const canonical = checkFinding("base");
  const unchanged = [
    { ...canonical, level: "warn" }, { ...canonical, level: "issue" },
    { ...canonical, level: "trace" }, { ...canonical, check: "other" },
    { ...canonical, file: "adr/another.md" }, { ...canonical, file: undefined },
    { ...canonical, message: canonical.message + " later" },
    { ...canonical, message: canonical.message.replace("encodes this decision (", "has reason (") },
    { ...canonical, message: `would fail: adr/base.md: forbid "unsafe" matched in src/a.mjs — reason${checkTail}` },
    { ...canonical, message: `adr/base.md guard 1: malformed check${checkTail}` },
  ];
  const findings = [checkFinding("a"), ...unchanged, checkFinding("b")];
  const result = renderDoctorReport(findings, ["vault"], compactMetadata);
  assert.equal(result.split("\n").filter(l => l === compactCheckLine(2)).length, 1);
  for (const f of unchanged) assert.ok(result.includes(f.message), f.message);
  assert.ok(!result.includes(checkLegend));
});

test("doctor compact checks: thresholds are local to displayed and repeated groups", () => {
  const findings = Object.freeze([checkFinding("a", "one"), checkFinding("b", "one"),
    checkFinding("c", "two"), checkFinding("d", "hidden"), checkFinding("e", "hidden")].map(Object.freeze));
  const groups = Object.freeze(["one", "two", "one"]), before = JSON.stringify({ findings, groups, compactMetadata });
  const result = renderDoctorReport(findings, groups, compactMetadata);
  assert.equal(result.split("\n").filter(l => l === compactCheckLine(2)).length, 2);
  assert.ok(result.includes(findings[2].message)); assert.ok(!result.includes("adr/d.md"));
  assert.equal(JSON.stringify({ findings, groups, compactMetadata }), before);
});

test("doctor compact checks: repeated declarative output stays within a fixed character budget", () => {
  for (const count of [2, 20, 200]) {
    const findings = Array.from({ length: count }, (_, i) => checkFinding(String(i) + "x".repeat(500)));
    const result = renderDoctorReport(findings, ["vault"], compactMetadata);
    assert.ok(result.length <= 360, `compact check report exceeded 360 characters: ${result.length}`);
    assert.equal(result.split("\n").filter(l => l === compactCheckLine(count)).length, 1);
    assert.ok(renderDoctorReport(findings, ["vault"], { version: "v", date: "fixed" }).length > result.length * 4);
  }
});
