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
