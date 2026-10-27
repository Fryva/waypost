const n = (v) => v.toLocaleString("en-US");

// `t/turn` — avg distinct tool calls per tool-using turn (batching level; 1.0
// means fully sequential). `cost` — USD at current list prices; cache reads bill
// at 0.025-0.1× input by model, so token counts and dollars rank differently.
const usd = (v) => `$${v.toFixed(2)}`;

function table(groups, label, { runs = false } = {}) {
  const w = Math.max(label.length, ...groups.map((g) => g.key.length));
  const cols = (a, b, c, d, e, f, g2, h) =>
    `${a.padEnd(w)}  ${b.padStart(5)}  ${c.padStart(6)}  ${d.padStart(6)}  ${e.padStart(13)}  ${f.padStart(10)}  ${g2.padStart(8)}${runs ? `  ${h.padStart(9)}` : ""}`;
  const head = cols(label, "runs", "reqs", "t/turn", "cache_rd", "output", "cost", "cost/run");
  const lines = [head, "─".repeat(head.length)];
  for (const g of groups) {
    lines.push(cols(
      g.key, g.runs ? n(g.runs) : "—", n(g.reqs),
      g.toolTurns ? (g.toolCalls / g.toolTurns).toFixed(2) : "—",
      n(g.cacheRead), n(g.output), usd(g.cost),
      g.runs ? usd(g.cost / g.runs) : "—",
    ));
  }
  return lines.join("\n");
}

function totals(groups) {
  const t = { reqs: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0, cost: 0 };
  for (const g of groups) {
    t.reqs += g.reqs;
    t.input += g.input;
    t.cacheWrite += g.cacheWrite;
    t.cacheRead += g.cacheRead;
    t.output += g.output;
    t.cost += g.cost;
  }
  return t;
}

export { n, usd, table, totals };
