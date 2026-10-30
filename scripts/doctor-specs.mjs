// Specification link, coverage and acceptance diagnostics.
import { basename, dirname } from "node:path";
import { folderByKind, listOf, slugIdentity, storyMatchesEntry, sectionOf, storiesAttributionRe, isLegacyStory } from "./lib.mjs";

function finding(group, level, check, message, file) {
  const f = { group, level, check, message };
  if (file) f.file = file;
  return f;
}

function linesOutsideFences(s) {
  const out = [];
  let fenced = false;
  for (const line of s.split("\n")) {
    if (/^\s*```/.test(line)) { fenced = !fenced; continue; }
    if (!fenced) out.push(line);
  }
  return out;
}

// Epic id of a story artifact, derived from the layout's epic folder path —
// never from a hardcoded segment index (custom layouts may nest the folder).
function epicIdOf(storyRel, epicFolderPath) {
  if (!storyRel.startsWith(epicFolderPath + "/")) return null;
  return storyRel.slice(epicFolderPath.length + 1).split("/")[0];
}

// ─── Spec checks (PS-SPEC story-006, upstream ADR-007 Decisions 2/3/5/6) ────────
//
// All spec gates are no-ops unless the VAULT policy says spec_policy=required.
// Link integrity (checkSpecLinks) runs whenever specs exist — dead links are
// defects regardless of policy.

function specStatusOf(spec) {
  return String(spec.fm.status || "draft").toLowerCase();
}

// Filename stem used for story identity matching; a folder-shape story
// (stories/<name>/README.md) is identified by its folder name.
function storyStemOf(storyRel) {
  const b = basename(storyRel);
  return b === "README.md" ? basename(dirname(storyRel)) : b.replace(/\.md$/, "");
}

// Resolve a spec's `stories:` entry "<epic-id>/<story-id>" to a story
// artifact. Tiered via the shared matcher (SPEC-002 contract 5): exact fm.id,
// exact filename stem, legacy story-NNN prefix fallback — the strongest tier
// wins across the epic's stories, and a tie within it is a reported
// ambiguity, never a silent first match.
function resolveSpecStory(entry, artifacts, epicFolderPath) {
  const m = String(entry).match(/^([^/]+)\/(.+)$/);
  if (!m) return { error: `not in <epic-id>/<story-id> form: "${entry}"` };
  const [, epicId, storyId] = m;
  let best = 0;
  let hits = [];
  for (const a of artifacts) {
    if (a.kind !== "story" || epicIdOf(a.rel, epicFolderPath) !== epicId) continue;
    const tier = storyMatchesEntry(storyId, { id: a.fm.id, stem: storyStemOf(a.rel) });
    if (!tier) continue;
    if (best === 0 || tier < best) { best = tier; hits = [a]; }
    else if (tier === best) hits.push(a);
  }
  if (hits.length === 1) return { story: hits[0] };
  if (hits.length > 1) {
    return { error: `ambiguous — "${storyId}" matches ${hits.map((a) => storyStemOf(a.rel)).join(", ")}; qualify the reference` };
  }
  return { error: `no story in ${epicFolderPath}/${epicId} matches "${storyId}" (by exact id:, exact filename stem, or legacy story-NNN prefix)` };
}

// The ONE spec resolver (SPEC-002 contract 5) — shared by checkSpecLinks,
// checkSpecCoverage and checkSpecAcceptance: dual-keying only some of them
// would let the others silently skip a resolvable spec (their "dead link
// already reported" premise breaks). Exact fm.id wins (grandfathered
// SPEC-NNN entries hit here); normalized filename-stem candidates (legacy
// prefix stripped, case-insensitive) resolve slug-form references to
// grandfathered SPEC-NNN-<slug>.md files. Cross-spec identity clashes are
// the identity check's finding, so first-wins here stays deterministic.
function buildSpecResolver(artifacts, layout = null) {
  const prefix = layout ? folderByKind(layout, "spec")?.prefix ?? null : null;
  const byId = new Map();
  const byStem = new Map();
  for (const s of artifacts.filter((a) => a.kind === "spec")) {
    const id = String(s.fm.id || "");
    if (id && !byId.has(id)) byId.set(id, s);
    for (const c of slugIdentity(basename(s.rel), { prefix }).candidates) {
      if (!byStem.has(c.id)) byStem.set(c.id, s);
    }
  }
  return (ref) => byId.get(String(ref)) ?? byStem.get(String(ref).toLowerCase()) ?? null;
}

// Parse a spec's Acceptance section into items:
// { checked, text, stories: [bare story ids] | null (unattributed) }
export function parseSpecAcceptance(spec) {
  const sec = sectionOf(spec.body, "spec_acceptance");
  if (sec === null) return null;
  const attrRe = storiesAttributionRe();
  const items = [];
  for (const line of linesOutsideFences(sec)) {
    const m = line.match(/^\s*-\s*\[( |x|X)\]\s*(.*)$/);
    if (!m) continue;
    const checked = m[1].toLowerCase() === "x";
    const text = m[2];
    // Full-width colon accepted for the same reason as the evidence suffix: a zh
    // spec writing `— stories：PS-X/story-foo` must attribute the item to that
    // story, not silently fall through to "applies to every covered story".
    const attr = text.match(attrRe);
    const stories = attr
      ? attr[1].split(",").map((s) => s.trim()).filter(Boolean)
      : null;
    items.push({ checked, text, stories });
  }
  return items;
}

export function checkSpecLinks(cfg, layout, artifacts) {
  const out = [];
  const epicFolder = folderByKind(layout, "epic");
  if (!epicFolder) return out;
  const specs = artifacts.filter((a) => a.kind === "spec");
  const resolveSpec = buildSpecResolver(artifacts, layout);
  const storiesBySpec = new Map();
  const specsByStory = new Map();
  const specsOf = (story) => {
    if (!specsByStory.has(story)) specsByStory.set(story, listOf(story.fm, "specs"));
    return specsByStory.get(story);
  };

  for (const spec of specs) {
    const entries = listOf(spec.fm, "stories");
    storiesBySpec.set(spec, entries);
    for (const entry of entries) {
      const r = resolveSpecStory(entry, artifacts, epicFolder.path);
      if (r.error) {
        out.push(finding("vault", "issue", "spec-links",
          `Spec "${spec.fm.id}" stories entry "${entry}" does not resolve: ${r.error}.`, spec.rel));
      } else if (spec.fm.id &&
                 !specsOf(r.story).some((ref) => resolveSpec(ref) === spec)) {
        // Membership through the SAME resolver — a slug-form back-reference
        // to a grandfathered SPEC-NNN file is a valid link, not a gap.
        out.push(finding("vault", "warn", "spec-links",
          `Spec "${spec.fm.id}" covers ${entry} but the story's \`specs:\` list lacks "${spec.fm.id}" (bidirectional link).`, r.story.rel));
      }
    }
  }
  for (const story of artifacts.filter((a) => a.kind === "story")) {
    for (const id of specsOf(story)) {
      const spec = resolveSpec(id);
      if (!spec) {
        out.push(finding("vault", "issue", "spec-links",
          `Story lists spec "${id}" which does not exist in specs/.`, story.rel));
      } else {
        const epicId = epicIdOf(story.rel, epicFolder.path);
        const stem = storyStemOf(story.rel);
        const covered = storiesBySpec.get(spec).some((e) => {
          const m = String(e).match(/^([^/]+)\/(.+)$/);
          return m && m[1] === epicId &&
            storyMatchesEntry(m[2], { id: story.fm.id, stem }) > 0;
        });
        if (!covered) {
          out.push(finding("vault", "warn", "spec-links",
            `Story lists spec "${id}" but that spec's \`stories:\` does not list it back.`, story.rel));
        }
      }
    }
    // Block-sequence YAML trap: parseFrontmatter is line-based; `specs:` with
    // an empty parsed value while the raw FRONTMATTER shows a block list means
    // the list is invisible to every deterministic check.
    const fmBlock = story.body.match(/^---\r?\n[\s\S]*?\r?\n---/);
    if (story.fm.specs === "" && fmBlock && /\nspecs:\s*\n\s+-\s/.test(fmBlock[0])) {
      out.push(finding("vault", "issue", "spec-links",
        "`specs:` uses block-sequence YAML which projectstore cannot parse — use inline flow: specs: [\"SPEC-001\"].", story.rel));
    }
  }
  return out;
}

// In-scope story = status beyond planned, not legacy-exempt.
function specScopeStatus(fm) {
  const s = String(fm.status || "").toLowerCase();
  return ["in-progress", "in_progress", "review", "done"].includes(s) ? s : null;
}

export function checkSpecCoverage(artifacts, vaultCfg, layout = null) {
  if ((vaultCfg.spec_policy || "optional") !== "required") return [];
  const out = [];
  const since = vaultCfg.spec_policy_since || null;
  const resolveSpec = buildSpecResolver(artifacts, layout);

  for (const story of artifacts.filter((a) => a.kind === "story")) {
    const status = specScopeStatus(story.fm);
    if (!status) continue;
    if (isLegacyStory(story.fm, since)) continue;
    const ids = listOf(story.fm, "specs");
    if (!ids.length) {
      out.push(finding("vault", "issue", "spec-coverage",
        `Story is ${status} with no covering spec (spec_policy: required — every story needs a spec).`, story.rel));
      continue;
    }
    for (const id of ids) {
      const spec = resolveSpec(id);
      if (!spec) continue; // dead link already reported by spec-links (same resolver)
      const st = specStatusOf(spec);
      if (status === "done") {
        if (!["active", "superseded"].includes(st)) {
          out.push(finding("vault", "issue", "spec-status",
            `Story is done while covering spec "${id}" is ${st} — a story may close only against an active spec.`, story.rel));
        }
      } else if (st === "draft") {
        out.push(finding("vault", "warn", "spec-status",
          `Story is ${status} while covering spec "${id}" is still draft — the spec must go active before implementation.`, story.rel));
      }
    }
  }
  return out;
}

// Additive acceptance oracle (upstream ADR-007 Decision 3): a done story requires every
// spec acceptance item ATTRIBUTED to it (bare ids resolved against that spec's
// own stories list) — plus every UNATTRIBUTED item — checked, in every
// covering spec.
export function checkSpecAcceptance(layout, artifacts, vaultCfg) {
  if ((vaultCfg.spec_policy || "optional") !== "required") return [];
  const out = [];
  const since = vaultCfg.spec_policy_since || null;
  const epicFolder = folderByKind(layout, "epic");
  if (!epicFolder) return out;
  const resolveSpec = buildSpecResolver(artifacts, layout);
  const ambiguousReported = new Set(); // spec-scoped: one finding per spec+item
  const acceptanceItems = new Map(); // lazy, artifact-scoped, including null and empty results

  for (const story of artifacts.filter((a) => a.kind === "story")) {
    if (String(story.fm.status || "").toLowerCase() !== "done") continue;
    if (isLegacyStory(story.fm, since)) continue;
    const epicId = epicIdOf(story.rel, epicFolder.path);
    const stem = storyStemOf(story.rel);

    for (const id of listOf(story.fm, "specs")) {
      const spec = resolveSpec(id);
      if (!spec) continue;
      if (!acceptanceItems.has(spec)) acceptanceItems.set(spec, parseSpecAcceptance(spec));
      const items = acceptanceItems.get(spec);
      if (items === null) {
        out.push(finding("vault", "warn", "spec-acceptance",
          `Covering spec "${id}" has no Acceptance section — its criteria cannot gate this story.`, spec.rel));
        continue;
      }
      const coveredEntries = listOf(spec.fm, "stories");
      for (const item of items) {
        let applies;
        if (item.stories === null) {
          applies = true; // unattributed → applies to all covered stories
        } else {
          // Bare ids resolve against THIS spec's own stories list.
          applies = item.stories.some((bare) =>
            coveredEntries.some((e) => {
              const m = String(e).match(/^([^/]+)\/(.+)$/);
              return m && m[1] === epicId && bare === m[2] &&
                storyMatchesEntry(bare, { id: story.fm.id, stem }) > 0;
            }));
          const ambiguous = item.stories.some((bare) =>
            coveredEntries.filter((e) => {
              const m = String(e).match(/^([^/]+)\/(.+)$/);
              return m && bare === m[2];
            }).length > 1);
          const ambKey = `${spec.rel}|${item.text}`;
          if (ambiguous && !ambiguousReported.has(ambKey)) {
            ambiguousReported.add(ambKey);
            out.push(finding("vault", "warn", "ambiguous-attribution",
              `Spec "${id}" acceptance item attributes bare id(s) "${item.stories.join(", ")}" that match more than one covered epic — qualify as <epic-id>/<story-id>.`, spec.rel));
          }
        }
        if (applies && !item.checked) {
          out.push(finding("vault", "issue", "spec-acceptance",
            `Story is done but spec "${id}" acceptance item is unchecked: "${item.text.slice(0, 80)}".`, story.rel));
        }
      }
    }
  }
  return out;
}

