// ─── Markdown table cell escaping ───────────────────────────────────────
//
// A `|` inside a cell (most often a title) splits a markdown table row into
// an extra column — silently, in every renderer AND in doctor's own row
// parser. One escaper, shared by every derived-view writer (reconcile,
// draft, codemap, graph) so `\|` means the same thing everywhere; unescCell
// is its inverse, for a reader (doctor's checkIndexes) that must compare a
// rendered cell back against the frontmatter value that produced it.
export function escCell(s) {
  return String(s).replace(/\|/g, "\\|");
}

export function unescCell(s) {
  return String(s).replace(/\\\|/g, "|");
}

