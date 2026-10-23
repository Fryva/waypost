// Generated-view consistency diagnostics using the existing subprocess generators.
import { existsSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { spawnSync } from "node:child_process";
import { pluginRoot, projectRoot, indexHeaderRe, unescCell } from "./lib.mjs";

function finding(group, level, check, message, file) {
  const f = { group, level, check, message };
  if (file) f.file = file;
  return f;
}

// status ↔ kanban: generate the expected board with the real generator and
// text-diff it against disk, ignoring the generated_at stamp (upstream ADR-005).
export function checkKanbanSync(cfg) {
  const vault = cfg.vault_path;
  const onDisk = join(vault, "kanban.md");
  if (!existsSync(onDisk)) {
    return [finding("vault", "info", "kanban", "No kanban.md yet — run waypost kanban to create the board.")];
  }
  const r = spawnSync(process.execPath, [join(pluginRoot(), "scripts", "kanban.mjs")], {
    encoding: "utf8",
    timeout: 10000,
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectRoot() },
  });
  if (r.status !== 0) {
    return [finding("vault", "warn", "kanban", `kanban generator failed: ${(r.stderr || "").trim()}`)];
  }
  let expected;
  try { expected = JSON.parse(r.stdout).content; } catch {
    return [finding("vault", "warn", "kanban", "kanban generator returned unparseable output.")];
  }
  const norm = (s) => s.split("\n").filter((l) => !l.startsWith("generated_at:")).join("\n").trimEnd();
  if (norm(expected) !== norm(readFileSync(onDisk, "utf8"))) {
    return [finding("vault", "issue", "kanban",
      "kanban.md is out of sync with story frontmatter — run waypost kanban (or reconcile).", "kanban.md")];
  }
  return [];
}

// Folder README index rows ↔ artifact frontmatter.
export function checkIndexes(cfg, layout, artifacts) {
  const out = [];
  const vault = cfg.vault_path;
  // The title cell tolerates an escaped `\|` (reconcile/draft escape a `|`
  // in a title so it cannot split the row into an extra column) — `[^|]+`
  // alone would stop at the escaped pipe and misread the rest of the row as
  // the status/date columns, producing a false index finding on a perfectly
  // reconciled row.
  const rowRx = /^\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|((?:\\\||[^|])+)\|([^|]+)\|([^|]+)\|/;
  for (const folder of layout.folders) {
    const readme = join(vault, folder.path, "README.md");
    if (!existsSync(readme)) continue;
    let rows = [];
    for (const line of readFileSync(readme, "utf8").split("\n")) {
      const m = line.match(rowRx);
      if (m) rows.push({ label: m[1], target: m[2].replace(/^\.\//, ""), title: unescCell(m[3]).trim(), status: m[4].trim() });
    }
    const indexed = new Set();
    for (const row of rows) {
      const rel = `${folder.path}/${row.target}`;
      indexed.add(rel);
      const art = artifacts.find((a) => a.rel === rel);
      if (!art) {
        out.push(finding("vault", "issue", "index",
          `${folder.path}/README.md row "${row.label}" points at a missing file: ${row.target}`, `${folder.path}/README.md`));
        continue;
      }
      const fmStatus = (art.fm.status || "").trim();
      if (fmStatus && row.status && fmStatus !== row.status) {
        out.push(finding("vault", "issue", "index",
          `${folder.path}/README.md lists "${row.label}" as "${row.status}" but its frontmatter says "${fmStatus}".`, art.rel));
      }
      const fmTitle = (art.fm.title || "").trim();
      if (fmTitle && row.title && fmTitle !== row.title) {
        out.push(finding("vault", "warn", "index",
          `${folder.path}/README.md title for "${row.label}" differs from frontmatter title.`, art.rel));
      }
    }
    for (const a of artifacts) {
      const inFolder = folder.kind === "epic"
        ? a.kind === "epic" && a.rel.startsWith(`${folder.path}/`)
        : a.kind === folder.kind && a.rel === `${folder.path}/${basename(a.rel)}`;
      if (inFolder && !indexed.has(a.rel)) {
        out.push(finding("vault", "warn", "index",
          `${a.rel} is not listed in ${folder.path}/README.md's index.`, a.rel));
      }
    }
  }
  return out;
}

// Folder README whose index table header matches no registered form — the
// silent-rebuildIndex-null class of failure (ru indexes never reconciled for
// the whole life of the feature). Standard form is 4 columns; extra hand-kept
// columns (e.g. a 5-column specs index) are flagged for migration, since
// reconcile would drop them.
export function checkIndexHeaders(cfg, layout) {
  const out = [];
  const headerRe = indexHeaderRe();
  for (const folder of layout.folders) {
    const readme = join(cfg.vault_path, folder.path, "README.md");
    if (!existsSync(readme)) continue;
    const lines = readFileSync(readme, "utf8").split("\n");
    const headIdx = lines.findIndex((l, i) =>
      /^\|.*\|\s*$/.test(l) && /^\|[-\s|]+\|\s*$/.test(lines[i + 1] || ""));
    if (headIdx === -1) continue; // no table at all — nothing to lint
    if (!headerRe.test(lines[headIdx])) {
      out.push(finding("vault", "warn", "index-header",
        `${folder.path}/README.md index header "${lines[headIdx].trim()}" matches no registered form — reconcile cannot rebuild this index (standard form: | File | Title | Status | Date |, localized forms in scaffold/headings.json).`,
        `${folder.path}/README.md`));
    }
  }
  return out;
}

// code-map.md staleness: regenerate with the real generator and compare
// (same pattern as the kanban check).
export function checkCodeMap(cfg) {
  const p = join(cfg.vault_path, "code-map.md");
  if (!existsSync(p)) return [];
  const r = spawnSync(process.execPath, [join(pluginRoot(), "scripts", "codemap.mjs")], {
    encoding: "utf8",
    timeout: 10000,
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectRoot() },
  });
  if (r.status !== 0) return [finding("vault", "warn", "code-map", "codemap generator failed.")];
  let expected;
  try { expected = JSON.parse(r.stdout).content; } catch {
    return [finding("vault", "warn", "code-map", "codemap generator returned unparseable output.")];
  }
  const norm = (s) => s.split("\n").filter((l) => !l.startsWith("generated_at:")).join("\n").trimEnd();
  if (norm(expected) !== norm(readFileSync(p, "utf8"))) {
    return [finding("vault", "issue", "code-map",
      "code-map.md is stale against frontmatter code_refs — run waypost codemap (or reconcile).", "code-map.md")];
  }
  return [];
}

// graph.md staleness: regenerate with the real generator and compare —
// kanban's variant of the pattern, INCLUDING its missing-file info
// (checkCodeMap stays silent on a missing file; the graph deliberately
// picks the louder branch, because bare reconcile never re-mints a deleted
// graph.md — this info is the standing signal; spec contract 6).
export function checkGraph(cfg) {
  const p = join(cfg.vault_path, "graph.md");
  if (!existsSync(p)) {
    return [finding("vault", "info", "graph", "No graph.md yet — run waypost graph to create the link graph.")];
  }
  const r = spawnSync(process.execPath, [join(pluginRoot(), "scripts", "graph.mjs")], {
    encoding: "utf8",
    timeout: 10000,
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectRoot() },
  });
  if (r.status !== 0) return [finding("vault", "warn", "graph", `graph generator failed: ${(r.stderr || "").trim()}`)];
  let expected;
  try { expected = JSON.parse(r.stdout).content; } catch {
    return [finding("vault", "warn", "graph", "graph generator returned unparseable output.")];
  }
  const norm = (s) => s.split("\n").filter((l) => !l.startsWith("generated_at:")).join("\n").trimEnd();
  if (norm(expected) !== norm(readFileSync(p, "utf8"))) {
    return [finding("vault", "issue", "graph",
      "graph.md is out of sync with vault links — run waypost graph (or reconcile).", "graph.md")];
  }
  return [];
}

