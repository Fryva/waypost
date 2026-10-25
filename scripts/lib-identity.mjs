// Waypost — pure artifact identity, matching and ordering.
// The private regex escape is also used by the facade heading helpers.

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Artifact identity (upstream ADR-010 / SPEC-002) ────────────────────────────
//
// Identity lives in the slug, not in an allocated number. Two filename eras
// coexist indefinitely (grandfathering — no renames): numbered
// `upstream ADR-003-foo.md` / `story-006-foo.md` and slug-only `foo.md` /
// `story-foo.md`. Comparison therefore works on CANDIDATE SETS, not single
// strings: a numbered-era name contributes both its full stem and its
// number-stripped slug, so `upstream ADR-003-foo.md` collides with `foo.md` and
// `story-006-foo.md` collides with `story-foo.md`. A digit-leading slug
// (`story-2024-review.md`) is formally ambiguous between the eras — it
// contributes both readings and is flagged, never silently collapsed to one.

// Legacy numbered shape: `<PREFIX><digits>` / `<PREFIX><digits>-<slug>` for
// prefixed kinds (prefix matched case-insensitively — GrammarHelper ships
// lowercase `spec-002-*` against layout prefix `SPEC-`), `story-<digits>` /
// `story-<digits>-<slug>` for stories. Any digit count (the legacy pad was a
// rendering choice, not an identity fact). Returns { number, slug } or null.
export function isLegacyNumberedId(name, { prefix = null, story = false } = {}) {
  const stem = String(name).replace(/\.md$/i, "");
  const anchor = story ? "story-" : prefix;
  if (!anchor) return null;
  const m = stem.match(new RegExp(`^${escapeRe(anchor)}(\\d+)(?:-(.+))?$`, "i"));
  return m ? { number: m[1], slug: m[2] ?? null } : null;
}

// Normalized identity of one filename (or dir name, for folder-shape
// stories). `primary` is the as-written reading (story kind marker stripped,
// lowercased); `candidates` adds the legacy number-stripped reading when the
// name matches a numbered shape. `digitLeading` marks slugs that visually
// resemble the numbered era (creation warns on these; overlaps arising only
// from that ambiguity report at warn, not issue).
export function slugIdentity(name, { prefix = null, story = false } = {}) {
  const stem = String(name).replace(/\.md$/i, "").toLowerCase();
  const base = story ? stem.replace(/^story-/, "") : stem;
  const candidates = [{ id: base, via: "self" }];
  const legacy = isLegacyNumberedId(stem, { prefix, story });
  if (legacy?.slug) {
    const id = legacy.slug.toLowerCase();
    if (id !== base) candidates.push({ id, via: story ? "story-number" : "prefix-number" });
  }
  return {
    primary: base,
    candidates,
    digitLeading: /^\d/.test(base),
    legacyNumber: legacy ? legacy.number : null,
  };
}

// The ONE spec↔story matcher (SPEC-002 contract 5) — replaces the inline
// predicates in doctor's resolveSpecStory / checkSpecLinks /
// checkSpecAcceptance. `entry` is the story part of a spec's qualified
// "<epic-id>/<story-id>" reference. Tiered, strongest first; returns the tier
// (1 = exact frontmatter id, 2 = exact filename stem, 3 = numbered-era
// prefix fallback) or 0. The fallback fires ONLY for legacy-shaped entries
// (`story-NNN` / `story-NNN-<slug>`) — a slug entry must match exactly, so
// "PS-X/cache" can never mis-attribute to `cache-invalidation.md`.
export function storyMatchesEntry(entry, { id = null, stem = "" } = {}) {
  const e = String(entry);
  if (id != null && id !== "" && String(id) === e) return 1;
  if (stem === e) return 2;
  if (isLegacyNumberedId(e, { story: true }) && stem.startsWith(e + "-")) return 3;
  return 0;
}

// Sync-conflict blacklist (SPEC-002 contract 7): filename shapes left by
// sync engines — `* <n>.md`, `* copy*.md`, `*(<n>).md`. A legal-form
// whitelist is deliberately NOT used: it would flag hand-created legacy
// notes. Returns null when legal, else a short description for the finding.
export function legalArtifactName(name) {
  if (!/\.md$/i.test(name)) return null;
  const stem = String(name).replace(/\.md$/i, "");
  if (/\s\d+$/.test(stem)) return `trailing " <n>" numeral — sync-engine duplicate shape`;
  if (/\(\d+\)$/.test(stem)) return `trailing "(<n>)" numeral — sync-engine duplicate shape`;
  if (/(^|\s)copy(\s\d+)?$/i.test(stem) || /conflicted copy/i.test(stem)) {
    return `"copy" suffix — sync-engine duplicate shape`;
  }
  return null;
}

// Display number of an artifact: an explicit frontmatter `number:` wins,
// else the legacy filename number; null when neither exists — the badge
// then simply does not render (SPEC-002 contract 8). Numbers are reference
// metadata like a Jira key, not identity (upstream ADR-010).
export function displayNumberOf(fm, name, opts = {}) {
  const n = fm && fm.number != null ? String(fm.number).trim() : "";
  if (n && n !== "null") return n;
  return slugIdentity(name, opts).legacyNumber;
}

// Derived-view ordering (SPEC-002 contract 8): ascending by date, tiebroken
// by display number when present — numbered artifacts sort before unnumbered
// ones inside a date group (the numbered era predates the slug era) — else
// by slug. Callers map artifacts to { date, number, slug }.
export function compareArtifactOrder(x, y) {
  const dx = String(x.date || "");
  const dy = String(y.date || "");
  if (dx !== dy) return dx < dy ? -1 : 1;
  const nx = x.number != null;
  const ny = y.number != null;
  if (nx !== ny) return nx ? -1 : 1;
  if (nx && ny) {
    const dn = parseInt(x.number, 10) - parseInt(y.number, 10);
    if (dn) return dn;
  }
  return String(x.slug || "").localeCompare(String(y.slug || ""));
}

// Pre-write uniqueness guard (SPEC-002 contract 4): does `target` collide
// with any existing name once both are normalized? Candidate-set
// intersection, so it sees cross-era collisions an exact `test -e` cannot.
// Read-only — callers pass the directory listing; draft.mjs surfaces the
// result as its `collision` output field and command prose only renders it.
// Returns null or { with, identity, selfMatch, digitLeading }: selfMatch
// means both as-written readings coincide (a plain duplicate); digitLeading
// means a digit-leading reading is involved on either side (warn-class).
export function findSlugCollision(target, existingNames, opts = {}) {
  const t = slugIdentity(target, opts);
  const tIds = new Set(t.candidates.map((c) => c.id));
  for (const name of existingNames) {
    const e = slugIdentity(name, opts);
    const shared = e.candidates.find((c) => tIds.has(c.id));
    if (!shared) continue;
    return {
      with: name,
      identity: shared.id,
      selfMatch: t.primary === e.primary,
      digitLeading: t.digitLeading || e.digitLeading,
    };
  }
  return null;
}

