// Vault artifact discovery and identity/name diagnostics.
import { readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { folderByKind, slugIdentity, isLegacyNumberedId, legalArtifactName } from "./lib.mjs";

function finding(group, level, check, message, file) {
  const f = { group, level, check, message };
  if (file) f.file = file;
  return f;
}

// One shared recursive walk of the vault's markdown files (dotfiles
// skipped). scanArtifacts only sees layout-declared folders — vault-wide
// claims (wikilink targets, identity uniqueness, filename shapes) must use
// this walk instead, or folder-shape story READMEs and loose notes go blind.
export function walkVaultFiles(vault) {
  const files = []; // { rel, name } — rel is /-joined relative to the vault root
  const walk = (dir, relDir) => {
    for (const n of readdirSync(dir)) {
      if (n.startsWith(".")) continue;
      const p = join(dir, n);
      let st;
      try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) walk(p, relDir ? `${relDir}/${n}` : n);
      else if (n.endsWith(".md")) files.push({ rel: relDir ? `${relDir}/${n}` : n, name: n });
    }
  };
  walk(vault, "");
  return files;
}

// ─── Artifact identity & filename shapes (upstream ADR-010 / SPEC-002 4, 7) ─────

// Infrastructure names carry no topic identity: README.md is every folder's
// index, epic.md every epic's root, kanban.md the board.
const INFRA_NAMES = new Set(["README.md", "epic.md", "kanban.md"]);

// Normalized slug-identity uniqueness per identity scope (a kind folder; an
// epic for stories), on candidate sets — so `upstream ADR-003-foo.md` vs `foo.md`
// and `story-006-foo.md` vs `story-foo.md` collide with no rename ever
// having happened. Severity keys on each member's ERA, decided by
// frontmatter where the filename alone is ambiguous (a digit-leading
// story stem reads as either era; the exact machine id settles it):
//   - two as-written twins (flat story + folder-shape namesake) → issue;
//   - a new-era name overlapping a certain legacy one → issue (the exact
//     case the pre-write guard exists to prevent);
//   - any member of undecidable era (digit-leading, no fm evidence) → warn;
//   - all members certainly legacy (same slug, different numbers) → info —
//     in the numbered era the number WAS the identity, so this was legal
//     and grandfathering must not turn it into a defect (contract 6).
// Duplicate display numbers are info: numbers are reference metadata
// (upstream ADR-010), duplicates confuse humans but identify nothing.
export function checkArtifactIdentity(layout, vaultFiles, artifacts = []) {
  const out = [];
  const fmByRel = new Map(artifacts.map((a) => [a.rel, a.fm]));
  // Era of one directory entry: "new" | "legacy" | "uncertain".
  const eraOf = (entry, opts) => {
    const idn = slugIdentity(entry.name, opts);
    if (!idn.legacyNumber) return "new";
    const fm = fmByRel.get(entry.rel);
    const fmId = fm && fm.id != null ? String(fm.id) : "";
    if (fmId) {
      const machineId = opts.story ? `story-${idn.primary}` : idn.primary;
      if (fmId.toLowerCase() === machineId) return "new"; // exact machine id = slug era
      if (isLegacyNumberedId(fmId, opts)) return "legacy";
    }
    const num = fm && fm.number != null ? String(fm.number).trim() : "";
    if (num && num !== "null") return "legacy";
    return idn.digitLeading ? "uncertain" : "legacy"; // prefix-anchored names are confident
  };
  const scopes = [];
  const epicFolder = folderByKind(layout, "epic");
  for (const f of layout.folders) {
    if (f.kind === "epic") continue;
    const entries = vaultFiles
      .filter((x) => dirname(x.rel) === f.path && !INFRA_NAMES.has(x.name))
      .map((x) => ({ name: x.name, rel: x.rel }));
    scopes.push({ label: f.path, entries, opts: { prefix: f.prefix || null } });
  }
  if (epicFolder) {
    const byEpic = new Map();
    for (const x of vaultFiles) {
      if (!x.rel.startsWith(epicFolder.path + "/")) continue;
      const parts = x.rel.split("/");
      let entry = null; // stories/<f>.md | stories/<dir>/README.md | standalone story-*.md
      if (parts.length === 4 && parts[2] === "stories") entry = { name: parts[3], rel: x.rel };
      else if (parts.length === 5 && parts[2] === "stories" && parts[4] === "README.md") entry = { name: parts[3], rel: x.rel };
      else if (parts.length === 3 && parts[2].startsWith("story-")) entry = { name: parts[2], rel: x.rel };
      if (!entry || INFRA_NAMES.has(entry.name)) continue;
      if (!byEpic.has(parts[1])) byEpic.set(parts[1], []);
      byEpic.get(parts[1]).push(entry);
    }
    for (const [epicId, entries] of byEpic) {
      scopes.push({ label: `${epicFolder.path}/${epicId}`, entries, opts: { story: true } });
    }
  }

  for (const { label, entries, opts } of scopes) {
    const groups = new Map(); // candidate identity -> hits
    const numbers = new Map(); // normalized display number -> entries
    for (const entry of entries) {
      const idn = slugIdentity(entry.name, opts);
      for (const c of idn.candidates) {
        if (!groups.has(c.id)) groups.set(c.id, []);
        groups.get(c.id).push({ entry, via: c.via, digitLeading: idn.digitLeading });
      }
      if (idn.legacyNumber) {
        const k = String(parseInt(idn.legacyNumber, 10));
        if (!numbers.has(k)) numbers.set(k, []);
        numbers.get(k).push(entry);
      }
    }
    const reported = new Set(); // one finding per file group, not per shared candidate
    for (const [ident, hits] of groups) {
      const uniq = [...new Map(hits.map((h) => [h.entry.rel, h])).values()];
      if (uniq.length < 2) continue;
      const key = uniq.map((h) => h.entry.rel).sort().join("|");
      if (reported.has(key)) continue;
      reported.add(key);
      const selfOnly = uniq.every((h) => h.via === "self");
      const classed = uniq.map((h) => ({ h, era: eraOf(h.entry, opts) }));
      const level = selfOnly ? "issue"
        // Overlap reached via the legacy reading of a PROVEN slug-era file
        // (its machine id is the full stem) is spurious — the file's real
        // identity is the unstripped slug.
        : classed.some(({ h, era }) => h.via !== "self" && era === "new") ? "warn"
        : classed.some(({ era }) => era === "uncertain") ? "warn"
        : classed.every(({ era }) => era === "legacy") ? "info"
        : "issue"; // a new-era name colliding with a certain legacy one
      const note = level === "warn" ? "; the overlap depends on a legacy reading that frontmatter does not confirm"
        : level === "info" ? "; all carry legacy numbers — legal in the numbered era, duplicate topic is hygiene"
        : "";
      out.push(finding("vault", level, "identity",
        `Same normalized identity "${ident}" in ${label}: ${uniq.map((h) => h.entry.name).join(", ")} — two artifacts claim one topic${note}.`,
        uniq[0].entry.rel));
    }
    for (const [num, ents] of numbers) {
      if (new Set(ents.map((e) => e.rel)).size < 2) continue;
      out.push(finding("vault", "info", "identity",
        `Display number ${num} is carried by ${ents.length} artifacts in ${label}: ${ents.map((e) => e.name).join(", ")} — numbers are reference metadata, and duplicates confuse humans.`,
        ents[0].rel));
    }
  }
  return out;
}

// Block-form YAML trap for `external_refs` (SPEC-002 contract 3): the
// line-based parseFrontmatter reads a block map as an empty scalar, so every
// deterministic consumer goes blind — the same guard class protects `specs:`
// in checkSpecLinks. Applies to every artifact kind that carries the field.
export function checkExternalRefsForm(artifacts) {
  const out = [];
  for (const a of artifacts) {
    if (a.fm.external_refs !== "") continue;
    const fmBlock = a.body.match(/^---\r?\n[\s\S]*?\r?\n---/);
    if (fmBlock && /\nexternal_refs:\s*\n\s+\S/.test(fmBlock[0])) {
      out.push(finding("vault", "issue", "external-refs",
        "`external_refs:` uses block-form YAML which projectstore cannot parse — use inline flow: external_refs: {jira: \"ABC-123\"}.", a.rel));
    }
  }
  return out;
}

// Filename-shape checks over the WHOLE vault walk (SPEC-002 contract 7):
// sync-conflict shapes by blacklist at warn (a legal-form whitelist would
// flag hand-created legacy notes), cross-folder basename collisions at info
// (short wiki-links to that basename become ambiguous).
export function checkArtifactNames(vaultFiles) {
  const out = [];
  const byName = new Map();
  for (const x of vaultFiles) {
    const bad = legalArtifactName(x.name);
    if (bad) {
      out.push(finding("vault", "warn", "artifact-name",
        `Sync-conflict filename shape — ${bad}. Merge or remove; sync engines leave these beside the original.`, x.rel));
    }
    if (INFRA_NAMES.has(x.name)) continue;
    if (!byName.has(x.name)) byName.set(x.name, []);
    byName.get(x.name).push(x.rel);
  }
  for (const [name, rels] of byName) {
    if (rels.length < 2) continue;
    out.push(finding("vault", "info", "artifact-name",
      `Basename "${name}" appears in ${rels.length} folders (${rels.map((r) => dirname(r)).join(", ")}) — short wiki-links [[${name.replace(/\.md$/, "")}]] are ambiguous.`,
      rels[0]));
  }
  return out;
}

