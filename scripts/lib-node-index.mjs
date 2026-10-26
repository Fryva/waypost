import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { parseFrontmatter } from "./lib-frontmatter.mjs";
import { slugIdentity } from "./lib-identity.mjs";
import { listEpicStories } from "./lib-vault-files.mjs";

// The graph's node universe (spec contract 2): layout artifact kinds,
// walked the way each kind's real consumers walk them — flat kind folders
// with README.md skipped (scanArtifacts parity), the epic folder via
// listEpicStories so folder-shape AND standalone epics/<id>/story-*.md
// stories are nodes (board parity: a card on the kanban must never
// classify out-of-scope; `_`/`.`-prefixed epic dirs hold blanks, not
// work, exactly as kanban skips them). Derived views and READMEs are
// never nodes. Node keys are full vault-relative paths — never short
// names: epic.md ×4 and README.md ×9 collide in the reference vault
// today, and slug-first identity (upstream ADR-010) makes bare numbers weaker
// over time.
export function buildNodeIndex(cfg, layout) {
  const vault = cfg.vault_path;
  const nodes = [];
  const push = (abs, rel, type, { prefix = null, story = false } = {}) => {
    let md;
    try { md = readFileSync(abs, "utf8"); } catch { return; }
    const fm = parseFrontmatter(md).data;
    const name = basename(rel);
    // A folder-shape story is identified by its folder name, like doctor's
    // storyStemOf; every other node by its filename stem.
    const stem = name === "README.md"
      ? basename(dirname(rel))
      : name.replace(/\.md$/i, "");
    const idField = fm.id ?? fm.slug; // research/concept/runbook/meeting templates carry slug:, not id:
    nodes.push({
      path: rel,
      abs,
      type,
      title: String(fm.title || stem),
      status: fm.status == null ? null : String(fm.status),
      fm,
      body: md,
      stem,
      identity: idField == null ? null : String(idField),
      // Tier-2 accepts the as-written stem PLUS every slugIdentity reading.
      // The as-written entry is load-bearing for stories: slugIdentity
      // strips the story- marker from its candidates, and without it a
      // link to a legacy story's full stem ([[story-013-<slug>]] — the
      // form Obsidian autocompletes) would miss every tier and land
      // out-of-scope, on a node the kanban shows as a card.
      stemReadings: [stem.toLowerCase(), ...slugIdentity(stem, { prefix, story }).candidates.map((c) => c.id)],
      prefix,
      story,
    });
  };
  for (const folder of layout.folders) {
    const dir = join(vault, folder.path);
    if (!existsSync(dir)) continue;
    if (folder.kind === "epic") {
      for (const id of readdirSync(dir).sort()) {
        if (id.startsWith("_") || id.startsWith(".")) continue;
        const epicDir = join(dir, id);
        const epicMd = join(epicDir, "epic.md");
        if (existsSync(epicMd)) push(epicMd, `${folder.path}/${id}/epic.md`, "epic");
        for (const s of listEpicStories(epicDir)) {
          push(s.abs, `${folder.path}/${id}/${s.rel}`, "story", { story: true });
        }
      }
    } else {
      for (const f of readdirSync(dir).sort()) {
        if (!f.endsWith(".md") || f === "README.md") continue;
        push(join(dir, f), `${folder.path}/${f}`, folder.kind, { prefix: folder.prefix || null });
      }
    }
  }
  const byPath = new Map(nodes.map((n) => [n.path, n]));
  const byIdentity = new Map();
  const byStem = new Map();
  const add = (map, key, node) => {
    const k = key.toLowerCase();
    if (!map.has(k)) map.set(k, []);
    if (!map.get(k).includes(node)) map.get(k).push(node);
  };
  for (const n of nodes) {
    if (n.identity) add(byIdentity, n.identity, n);
    for (const r of n.stemReadings) add(byStem, r, n);
  }
  return { nodes, byPath, byIdentity, byStem };
}

