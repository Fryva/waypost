export function formatCodexReport(report, { summary: compact = false, sessions = false } = {}) {
  const all = report.native_totals.all, share = report.token_shares.observed_waypost_percent;
  const text = [
    `waypost tokens (Codex): ${all.observed_total_tokens ?? "unknown"} observed native tokens in ${all.observed_spans} spans`,
    `explicit Waypost role share: ${share === null ? "unknown" : `${share.toFixed(2)}%`} of covered spans; full retained-source coverage ${all.complete_within_discovered_retained_sources}`,
    "scope: plain and supported compressed retained rollouts; first nonzero snapshots are uncharged baselines; no subscription quota conversion",
  ];
  if (!compact) {
    text.push(`contexts ${report.coverage.matched_contexts}; decoded archives ${report.coverage.compressed_files_decoded}; skipped compressed files ${report.coverage.compressed_files_skipped}; failed archives ${report.coverage.compressed_files_failed}; unknown headers ${report.coverage.unidentifiable_headers}`, `unknown initial prefixes: ${report.coverage.unknown_prefix_contexts ?? "unknown"} contexts; overlapping requested period ${report.coverage.unknown_prefix_contexts_overlapping_period ?? "unknown"} (quarantined contexts excluded; other gaps possible)`, "cache/reasoning are subsets of input/output; snapshots are not request counts");
    if (sessions) {
      const contextRows = [];
      for (const context of report.contexts) contextRows.push(`${context.id}  ${context.role ?? "unattributed"}  ${context.observed_total_tokens ?? "unknown"} observed tokens`);
      const legacyRows = contextRows.join("\n");
      const sharedRows = contextRows.length >= 5 && contextRows.every(row => !/[\r\n]/.test(row))
        ? "contexts (id, role, observed tokens):\n" + contextRows.map(row => row.slice(0, -16)).join("\n") : null;
      if (contextRows.length) text.push(sharedRows !== null && Buffer.byteLength(sharedRows) < Buffer.byteLength(legacyRows)
        ? sharedRows : legacyRows);
    }
  }
  return text.join("\n") + "\n";
}
