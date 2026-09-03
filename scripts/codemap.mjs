#!/usr/bin/env node
// projectstore — codemap.mjs
// Derives code-map.md — the epic↔code overview — from epic/story frontmatter
// `code_refs` (upstream ADR-004). Same one-way pattern as kanban.mjs: frontmatter is
// the source of truth, this file is a regenerated view.
//
// Output: JSON { path, content, stats } — compute only. The applier is
// reconcile.mjs --write (atomic replace, recompute-at-write), not the
// harness: no Write-tool step remains in the derived-view flows.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  readConfig,
  loadLayout,
  folderByKind,
  parseFrontmatter,
  listOf,
  nowIso,
  listEpicDirs,
  listEpicStories,
  escCell,
} from "./lib.mjs";

function die(msg) {
  process.stderr.write(`waypost codemap: ${msg}\n`);
  process.exit(1);
}

function main() {
  const cfg = readConfig();
  if (!cfg) die("No projectstore config. Run waypost bind first.");
  const layout = loadLayout(cfg.layout);
  const folder = folderByKind(layout, "epic");
  if (!folder) die("Layout has no epic folder — nothing to map.");

  const root = join(cfg.vault_path, folder.path);
  const epics = [];
  const storyRows = [];
  if (existsSync(root)) {
    for (const id of listEpicDirs(root)) {
      const epicMd = join(root, id, "epic.md");
      if (!existsSync(epicMd)) continue;
      const fm = parseFrontmatter(readFileSync(epicMd, "utf8")).data;
      epics.push({ id, title: fm.title || id, status: fm.status || "planned", refs: listOf(fm, "code_refs") });
      // listEpicStories sees all three story shapes (flat, folder, and
      // standalone epics/<id>/story-*.md) — a manual stories/*.md glob
      // silently dropped the other two from the story-level refs section.
      for (const s of listEpicStories(join(root, id))) {
        const sfm = parseFrontmatter(readFileSync(s.abs, "utf8")).data;
        const refs = listOf(sfm, "code_refs");
        if (refs.length) {
          storyRows.push({ epic: id, story: s.slug, title: sfm.title || s.slug, refs });
        }
      }
    }
  }

  const lines = [
    "---",
    "",
    "projectstore: derived",
    // Full ISO, not date-only: freshness comparison on an active day is
    // ill-defined otherwise (spec contract 6). Normalizers strip the line.
    `generated_at: ${nowIso()}`,
    "",
    "---",
    "",
    "# Code map",
    "",
    "Epic ↔ code mapping, derived from frontmatter `code_refs` (source of truth).",
    "Regenerate via `waypost codemap`; edit refs via `waypost codemap set`.",
    "",
    "| Epic | Title | Status | code_refs |",
    "|------|-------|--------|-----------|",
  ];
  for (const e of epics) {
    const refs = e.refs.length ? e.refs.map((r) => `\`${r}\``).join(", ") : "—";
    lines.push(`| [[${folder.path}/${e.id}/epic\\|${e.id}]] | ${escCell(e.title)} | ${escCell(e.status)} | ${refs} |`);
  }
  if (storyRows.length) {
    lines.push("", "## Story-level refs (files each story touched)", "",
      "| Epic | Story | code_refs |", "|------|-------|-----------|");
    for (const s of storyRows) {
      lines.push(`| ${s.epic} | ${escCell(s.title)} | ${s.refs.map((r) => `\`${r}\``).join(", ")} |`);
    }
  }
  lines.push("");

  process.stdout.write(JSON.stringify({
    path: join(cfg.vault_path, "code-map.md"),
    content: lines.join("\n"),
    stats: { epics: epics.length, epics_with_refs: epics.filter((e) => e.refs.length).length, story_rows: storyRows.length },
  }, null, 2) + "\n");
}

main();
