// Waypost — pure frontmatter scalars, flow lists and bare references.

// ─── Frontmatter list fields (code_refs / specs / stories / adr) ───────
//
// Frontmatter lists must use inline flow form (`specs: ["SPEC-001"]`) —
// parseFrontmatter is line-based and cannot see block sequences. Both the
// JSON-quoted spelling and the bare flow spelling (`specs: [SPEC-001, a-b]`,
// with or without quotes on each item) are read here, in one place, so
// doctor and the derived views agree by construction. Single shared parser;
// doctor emits a dedicated finding for the block-form trap.
export function listOf(fm, key) {
  const raw = fm[key];
  if (!raw || raw === "[]") return [];
  if (Array.isArray(raw)) return raw.filter((x) => typeof x === "string");
  if (typeof raw !== "string") return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    const trimmed = raw.trim();
    if (!/^\[.*\]$/.test(trimmed)) return [];
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((item) => {
        const t = item.trim();
        return (t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))
          ? t.slice(1, -1)
          : t;
      })
      .filter((item) => item.length > 0);
  }
}

// The same fields written as a bare scalar. `supersedes`/`superseded_by` are
// routinely single-valued, and the repository's own fixtures write them that way
// (`superseded_by: "new-way"`), so anything reading them must accept both forms.
// Lived in graph.mjs; moved here the moment doctor needed it too — two readers of
// one field is how the two views drift apart.
export function refsOf(fm, key) {
  const viaList = listOf(fm, key);
  if (viaList.length) return viaList;
  const raw = fm[key];
  return typeof raw === "string" && raw && raw !== "[]" && !raw.trim().startsWith("[")
    ? [raw.trim()]
    : [];
}

// ─── Frontmatter parsing (minimal) ─────────────────────────────────────

export function parseFrontmatter(md) {
  // A BOM (Windows Notepad's default) or CRLF line endings (any Windows
  // session) make the ^---\n anchor miss entirely — the whole frontmatter
  // block then silently reads as absent, not as a parse error. Strip the BOM
  // and accept \r?\n on both delimiters; the body keeps whatever endings the
  // rest of the file actually uses.
  const text = md.charCodeAt(0) === 0xfeff ? md.slice(1) : md;
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return { data: {}, body: text };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (v === "null" || v === "~") v = null;
    else if (v.startsWith('"')) {
      // JSON.parse round-trips escaped scalars from renderTemplate's _json
      // form (titles containing quotes). Match only the quoted span so a
      // trailing YAML comment is dropped (`"Foo" # note` -> `Foo`) without
      // treating a `#` INSIDE the quotes as one (`"Fix #12"` stays whole).
      // An unterminated quote is left as written — cutting a character off
      // the end would turn one malformed value into a different one.
      const q = v.match(/^"(?:[^"\\]|\\.)*"/);
      if (q) {
        try { v = JSON.parse(q[0]); } catch { v = q[0].slice(1, -1); }
      }
    } else if (v.startsWith("'") && v.endsWith("'")) {
      // YAML single-quote form: '' inside the quotes is an escaped literal '.
      v = v.slice(1, -1).replace(/''/g, "'");
    } else {
      // Bare scalar: a YAML comment needs whitespace before the `#`, so
      // `status: done # verified` is cut at "done" but `title: C# and F#`
      // is left untouched.
      const hash = v.match(/\s#/);
      if (hash) v = v.slice(0, hash.index).trimEnd();
    }
    data[kv[1]] = v;
  }
  return { data, body: text.slice(m[0].length) };
}

