// Pure doctor text formatting. The caller supplies version and UTC date.

function icon(level) {
  return level === "issue" ? "✖" : level === "warn" ? "⚠" : "ℹ";
}

export function renderDoctorReport(findings, groups, { version, date }) {
  const ver = version;
  const lines = [`waypost doctor — v${ver || "?"}, ${date}`];
  for (const g of groups) {
    const fs = findings.filter((f) => f.group === g);
    lines.push("", `## ${g} (${fs.filter((f) => f.level === "issue").length} issue(s), ${fs.filter((f) => f.level === "warn").length} warning(s))`);
    if (!fs.length) lines.push("  ✓ clean");
    for (const f of fs) {
      lines.push(`  ${icon(f.level)} [${f.check}] ${f.message}${f.file && !f.message.startsWith(`${f.file}: `) ? `  — ${f.file}` : ""}`);
    }
  }
  const issues = findings.filter((f) => f.level === "issue").length;
  const warns = findings.filter((f) => f.level === "warn").length;
  lines.push("", `Summary: ${issues} issue(s), ${warns} warning(s). ${issues ? "Repairs: `waypost doctor --fix` (install), `waypost reconcile --write` (vault)." : "Vault and wiring look healthy."}`);
  return lines.join("\n");
}
