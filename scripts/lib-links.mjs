import { isLegacyNumberedId } from "./lib-identity.mjs";

// ─── Link graph: extraction, node index, resolver ──────────────────────
// (spec: vault-link-graph-derived-view-and-shared-link-resolver)

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

// Pure /-joined path arithmetic for link resolution. node:path is
// deliberately avoided: node keys are /-joined vault-relative strings on
// every platform, and resolve()/join() would reintroduce win32 separators.
// Returns the normalized relative path, or null when the target escapes
// the base (a root-relative try that climbs out of the vault is rejected —
// a stray file in the vault's parent folder must never shadow a hit).
function joinRel(baseSegments, target) {
  const segs = [...baseSegments];
  for (const part of String(target).split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!segs.length) return null;
      segs.pop();
    } else {
      segs.push(part);
    }
  }
  return segs.join("/");
}

const relDirSegments = (rel) => {
  const segs = String(rel).split("/");
  segs.pop();
  return segs;
};

// Per-list lookup (rebuilt on length change). Plain data objects only: any
// getter, patched filter or falsy keysOf(o) gives null and callers keep scanning.
const tables = new WeakMap();
function table(list, fields, keysOf) {
  let t = tables.get(list);
  if (!t || t.len !== list.length) {
    const map = new Map();
    const ok = list.filter === [].filter && list.every((o) => {
      const keys = o && fields.every((f) => Object.getOwnPropertyDescriptor(o, f)?.writable) && keysOf(o);
      for (const k of keys || []) map.has(k) ? map.get(k).push(o) : map.set(k, [o]);
      return keys;
    });
    tables.set(list, t = { len: list.length, map: ok && map });
  }
  return t.map;
}

// The ONE link resolver (spec contract 3), shared by the graph generator
// and doctor's wikilink check so "dead" means the same thing in both.
// Outcomes: {outcome: "node", node} | {outcome: "out-of-scope", path?} |
// {outcome: "ambiguous", candidates} | {outcome: "dead"}.
//
// A target containing "/" resolves as a PATH — vault-root-relative first,
// then source-file-relative, ".md" appended when missing — and never
// enters the stem tiers. A path-qualified target that resolves in neither
// try is dead: deliberately stricter than Obsidian, whose basename
// fallback silently heals a wrong relative depth. Bare stems run the
// SPEC-002 tiers over the NODE index (exact frontmatter identity, exact
// filename-stem readings, legacy numbered-prefix fallback gated by
// isLegacyNumberedId — slug-form targets match exactly, never generic
// startsWith); the strongest tier wins and a tie within it is ambiguity,
// never a silent first match (resolveSpecStory's rule). On zero node
// candidates, ring 2 — an exact-stem match against the full vault file
// walk — classifies a hit out-of-scope: the target exists and is not a
// node; which non-node file a stem like README means is not the graph's
// business (path reported only when the hit is unique). Zero hits in
// either ring is dead. All stem comparisons are case-insensitive,
// preserving today's checkWikilinks semantics.
//
// ctx: { sourceRel, index, files, exists?, kinds? }
//   files  — [{rel, name}] full .md walk (doctor's walkVaultFiles shape),
//            INJECTED so lib never imports doctor (no import cycle).
//   exists — (vaultRel) => bool for non-.md targets (attachments);
//            defaults to "no" — fs-backed callers supply the real one.
//   kinds  — restrict node tiers to these node types (frontmatter refs
//            are kind-scoped by their field; body links pass no filter,
//            so a cross-kind multi-hit is ambiguous).
export function resolveLinkTarget(rawTarget, linkType, ctx) {
  const { sourceRel, index, files, exists = () => false, kinds = null } = ctx;
  const target = String(rawTarget).trim();
  const eligible = (n) => !kinds || kinds.includes(n.type);
  const finish = (rel) => {
    const node = index.byPath.get(rel);
    if (node && eligible(node)) return { outcome: "node", node };
    return { outcome: "out-of-scope", path: rel };
  };
  const fileSet = ctx._fileSet ?? (ctx._fileSet = new Set(files.map((f) => f.rel)));

  if (linkType === "mdlink") {
    // Relative markdown links resolve against the source file's directory
    // only — today's semantics. Landing outside the vault is out-of-scope
    // by definition (contract 3): no probing beyond the vault root.
    const rel = joinRel(relDirSegments(sourceRel), target);
    if (rel === null) return { outcome: "out-of-scope" };
    if (fileSet.has(rel)) return finish(rel);
    if (exists(rel)) return { outcome: "out-of-scope", path: rel };
    return { outcome: "dead" };
  }

  if (target.includes("/")) {
    const t = /\.md$/i.test(target) ? target : `${target}.md`;
    for (const base of [[], relDirSegments(sourceRel)]) {
      const rel = joinRel(base, t);
      if (rel !== null && fileSet.has(rel)) return finish(rel);
    }
    return { outcome: "dead" };
  }

  // A bare name may carry its extension (`[[note.md]]` resolves in Obsidian;
  // `supersedes: "second-decision.md"` used to be "not an artifact" while the
  // path-qualified spelling of the same file resolved).
  const bare = target.replace(/\.md$/i, "");
  const key = bare.toLowerCase();
  // Tier 1: exact frontmatter identity. Tier 2: filename-stem readings.
  // Tier 3: legacy numbered-prefix fallback, per node anchor.
  const tiers = [
    () => (index.byIdentity.get(key) || []).filter(eligible),
    () => (index.byStem.get(key) || []).filter(eligible),
    () => {
      let legacyByAnchor = null;
      const legacyFor = (n) => {
        const story = n.story;
        const options = story ? { story: true } : { prefix: n.prefix };
        const anchor = story ? "story-" : options.prefix;
        if (typeof anchor !== "string") return isLegacyNumberedId(bare, options);
        const cached = legacyByAnchor?.get(anchor);
        if (cached !== undefined) return cached;
        const result = isLegacyNumberedId(bare, options);
        // Reuse only pure string anchors in this tier/call; unusual prefixes stay live.
        if (!legacyByAnchor) legacyByAnchor = new Map();
        if (legacyByAnchor.size < 32) legacyByAnchor.set(anchor, result);
        return result;
      };
      // Keyed by every stem prefix before a "-".
      const byPrefix = table(index.nodes, ["type", "story", "prefix", "stem"], (n) => {
        if (typeof n.stem !== "string" || !(n.prefix == null || typeof n.prefix === "string")) return null;
        const st = n.stem.toLowerCase(), out = [];
        for (let i = st.indexOf("-"); i >= 0; i = st.indexOf("-", i + 1)) out.push(st.slice(0, i));
        return out;
      });
      return (byPrefix ? byPrefix.get(key) || [] : index.nodes).filter((n) =>
        eligible(n)
        && legacyFor(n)
        && (byPrefix || n.stem.toLowerCase().startsWith(`${key}-`)));
    },
  ];
  for (const tier of tiers) {
    const hits = [...new Set(tier())];
    if (hits.length === 1) return { outcome: "node", node: hits[0] };
    if (hits.length > 1) return { outcome: "ambiguous", candidates: hits.map((n) => n.path).sort() };
  }
  if (!kinds) {
    // Ring 2 — only for body links: frontmatter refs point at artifacts
    // by contract, so a non-node reference is simply dead.
    const stemOf = (f) => f.name.replace(/\.md$/i, "").toLowerCase();
    const byStem = table(files, ["name"], (f) => typeof f.name === "string" && [stemOf(f)]);
    const ring2 = byStem ? byStem.get(key) || [] : files.filter((f) => stemOf(f) === key);
    if (ring2.length === 1) return { outcome: "out-of-scope", path: ring2[0].rel };
    if (ring2.length > 1) return { outcome: "out-of-scope" };
  }
  return { outcome: "dead" };
}

