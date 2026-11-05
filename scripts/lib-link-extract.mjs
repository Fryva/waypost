// ─── Link extraction: which links a file's prose carries ─────────────
// (spec: vault-link-graph-derived-view-and-shared-link-resolver)
// Split from lib-links.mjs, which re-exports both functions; resolution
// stays there.

// Strip fenced blocks and inline code spans before matching links or
// checkboxes — notation inside code is not a link. Lifted from doctor,
// which carried two byte-identical copies (checkbox counting and
// checkWikilinks); one definition, shared by doctor and the graph.
export function stripCodeSpans(s) {
  // An HTML comment is not prose either: a commented-out wikilink is not a
  // link to Obsidian, and a commented-out `- [ ]` is not an acceptance item.
  // Earlier removals can join later delimiters; inspect each current result.
  // Keep every original replacement for initially non-string inputs.
  const stringInput = typeof s === "string";
  const unfenced = stringInput && !s.includes("```") ? s : s.replace(/```[\s\S]*?```/g, "");
  const unquoted = stringInput && !unfenced.includes("`") ? unfenced : unfenced.replace(/`[^`\n]*`/g, "");
  return stringInput && !unquoted.includes("<!--") ? unquoted : unquoted.replace(/<!--[\s\S]*?-->/g, "");
}

// Every link in one file's text: wikilinks and relative markdown links.
// Full file text goes in, frontmatter included — parity with what doctor's
// checkWikilinks always scanned. The alias split tolerates the escaped
// `\|` form generated tables render, so a trailing backslash never leaks
// into the target. Markdown links count only in their ./ and ../ forms —
// URLs and absolute paths were never links doctor checked, and stay out.
export function extractLinks(text) {
  const prose = stripCodeSpans(text);
  const out = [];
  // Stripping may join delimiters, so inspect prose rather than the raw input.
  if (typeof prose !== "string" || prose.includes("[[")) for (const m of prose.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const target = m[1].split(/\\?\|/)[0].split("#")[0].trim();
    if (target) out.push({ type: "wikilink", target });
  }
  if (typeof prose !== "string" || prose.includes("](")) for (const m of prose.matchAll(/\]\(([^)\s]+)\)/g)) {
    const t = m[1];
    if (!t.startsWith("./") && !t.startsWith("../")) continue;
    const target = t.split("#")[0];
    if (target) out.push({ type: "mdlink", target });
  }
  return out;
}
