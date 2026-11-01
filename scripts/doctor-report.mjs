// Pure doctor text formatting. The caller supplies version and UTC date.

function icon(level) {
  return level === "issue" ? "✖" : level === "warn" ? "⚠" : "ℹ";
}

function naturalTotals(issues, warns) {
  return `${issues} ${issues === 1 ? "issue" : "issues"}, ${warns} ${warns === 1 ? "warning" : "warnings"}`;
}

const CHECK_TAIL = " — it runs in the project's own test suite; doctor never executes it.";
function declarativeCheck(f) {
  return f.level === "info" && f.check === "adr-guard"
    && typeof f.file === "string" && typeof f.message === "string"
    && f.message.startsWith(`${f.file}: check \``)
    && f.message.includes("` encodes this decision (")
    && f.message.endsWith(`)${CHECK_TAIL}`);
}

export function renderDoctorReport(findings, groups, { version, date, compactChecks = false }) {
  const ver = version;
  const lines = [`waypost doctor — v${ver || "?"}, ${date}`];
  for (const g of groups) {
    const fs = findings.filter((f) => f.group === g);
    const compactGroup = compactChecks && typeof g === "string" && g.length > 0 && !/[\r\n]/.test(g);
    if (compactGroup && !fs.length) {
      lines.push("", `  ✓ ${g}: clean`);
      continue;
    }
    if (compactGroup) {
      const groupIssues = fs.filter((f) => f.level === "issue").length;
      const groupWarns = fs.filter((f) => f.level === "warn").length;
      const groupTotals = groupIssues || groupWarns ? naturalTotals(groupIssues, groupWarns) : "no issues or warnings";
      lines.push("", `## ${g} (${groupTotals})`);
    } else {
      lines.push("", `## ${g} (${fs.filter((f) => f.level === "issue").length} issue(s), ${fs.filter((f) => f.level === "warn").length} warning(s))`);
    }
    if (!fs.length) lines.push("  ✓ clean");
    const checkCount = fs.filter(declarativeCheck).length;
    const shareCheckNote = checkCount >= 2;
    const foldChecks = compactChecks && shareCheckNote;
    let checksShown = false;
    for (const f of fs) {
      if (foldChecks && declarativeCheck(f)) {
        if (!checksShown) lines.push(`  ℹ [adr-guard] ${checkCount} declarative checks (not executed). Repeat this command with \`--full\` for commands and reasons.`);
        checksShown = true;
        continue;
      }
      const message = shareCheckNote && declarativeCheck(f) ? f.message.slice(0, -CHECK_TAIL.length) : f.message;
      lines.push(`  ${icon(f.level)} [${f.check}] ${message}${f.file && !f.message.startsWith(`${f.file}: `) ? `  — ${f.file}` : ""}`);
    }
    if (shareCheckNote && !foldChecks) lines.push("  ADR check commands run in the project's test suite; doctor never executes them.");
  }
  const issues = findings.filter((f) => f.level === "issue").length;
  const warns = findings.filter((f) => f.level === "warn").length;
  const totals = compactChecks
    ? `${naturalTotals(issues, warns)}.`
    : `${issues} issue(s), ${warns} warning(s).`;
  const conclusion = issues ? " Repairs: `waypost doctor --fix` (install), `waypost reconcile --write` (vault)."
    : compactChecks ? "" : " Vault and wiring look healthy.";
  lines.push("", `Summary: ${totals}${conclusion}`);
  return lines.join("\n");
}
