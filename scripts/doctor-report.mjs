// Pure doctor text formatting. The caller supplies version and UTC date.

function icon(level) {
  return level === "issue" ? "✖" : level === "warn" ? "⚠" : "ℹ";
}

const CHECK_TAIL = " — it runs in the project's own test suite; doctor never executes it.";
function declarativeCheck(f) {
  return f.level === "info" && f.check === "adr-guard"
    && typeof f.file === "string" && typeof f.message === "string"
    && f.message.startsWith(`${f.file}: check \``)
    && f.message.includes("` encodes this decision (")
    && f.message.endsWith(`)${CHECK_TAIL}`);
}

export function renderDoctorReport(findings, groups, { version, date }) {
  const ver = version;
  const lines = [`waypost doctor — v${ver || "?"}, ${date}`];
  for (const g of groups) {
    const fs = findings.filter((f) => f.group === g);
    lines.push("", `## ${g} (${fs.filter((f) => f.level === "issue").length} issue(s), ${fs.filter((f) => f.level === "warn").length} warning(s))`);
    if (!fs.length) lines.push("  ✓ clean");
    const shareCheckNote = fs.filter(declarativeCheck).length >= 2;
    for (const f of fs) {
      const message = shareCheckNote && declarativeCheck(f) ? f.message.slice(0, -CHECK_TAIL.length) : f.message;
      lines.push(`  ${icon(f.level)} [${f.check}] ${message}${f.file && !f.message.startsWith(`${f.file}: `) ? `  — ${f.file}` : ""}`);
    }
    if (shareCheckNote) lines.push("  ADR check commands run in the project's test suite; doctor never executes them.");
  }
  const issues = findings.filter((f) => f.level === "issue").length;
  const warns = findings.filter((f) => f.level === "warn").length;
  lines.push("", `Summary: ${issues} issue(s), ${warns} warning(s). ${issues ? "Repairs: `waypost doctor --fix` (install), `waypost reconcile --write` (vault)." : "Vault and wiring look healthy."}`);
  return lines.join("\n");
}
