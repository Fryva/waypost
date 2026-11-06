#!/usr/bin/env node
// waypost — merge-derived.mjs
// A git merge driver for the vault's derived views (ADR-0006).
//
// kanban.md, graph.md, code-map.md and the folder index READMEs are generated
// from artifact frontmatter. Two sessions in two harnesses that both touch a
// story both regenerate the board, and git then asks a human to merge two
// machine-written files line by line — a merge whose only correct outcome is
// "throw both away and regenerate".
//
// Wired by `waypost doctor --fix` (or by hand):
//
//   .gitattributes:  kanban.md merge=waypost-derived
//   git config:      merge.waypost-derived.driver "waypost merge-derived %A %O %B %P"
//                    merge.waypost-derived.name   "regenerate waypost derived views"
//
// Git calls the driver with %A (a TEMP file holding our side, where the result
// goes), %O (base), %B (theirs) and %P (the real path in the worktree). %A is
// a temp name like .merge_file_Ox2FDc, so %P is what says which view this is.
//
// The driver never regenerates (ADR "The merge driver keeps our side of a
// derived view; regeneration happens after the merge", amending ADR-0006):
// git (merge-ort) merges contents in memory and writes the worktree after
// every driver has run, so the vault on disk is the one from BEFORE the merge,
// and a view built from it misses the very commit being applied. Writing that
// view into the vault was worse — it changed a worktree file in the middle of
// a cherry-pick/rebase sequence, and git refused the next commit as a "local
// change" (WP-15, seen 2026-09-23). So the driver writes only %A:
//
// - kanban.md, graph.md, code-map.md are generated whole: our side is kept.
// - A folder index README of the layout is only partly generated — its table
//   is, the prose around it is the humans'. The table is ours (reconcile
//   rebuilds it), the prose is merged three-way with `git merge-file`; a
//   conflict in the prose is left in %A with markers and exit 1.
// - Anything else — any other README, a file outside the vault — is merged as
//   plain text, as git would without the driver: markers and exit 1 on a
//   conflict, never one side silently.
//
// The view is re-derived where the merged artifacts really are on disk:
// `waypost merge` reconciles before its commit, `waypost commit` reconciles,
// and `waypost doctor` reports a view left stale (`waypost reconcile --write`).
//
// CLI: node merge-derived.mjs <%A> [%O] [%B] [%P]

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readConfig, ignoreEpipe, realPath, pathUnder, loadLayout, indexHeaderRe } from "./lib.mjs";

const WHOLE = new Set(["kanban.md", "graph.md", "code-map.md"]);

// git merge-file over three files; returns { text, conflicts }.
function mergeFile(ours, base, theirs) {
  const r = spawnSync("git", ["merge-file", "-p", "-L", "ours", "-L", "base", "-L", "theirs", ours, base, theirs], { encoding: "utf8" });
  // 0 clean, 1..127 the number of conflicts; anything else (null, 255 for
  // "cannot merge binary files") is a failure, never a result to write.
  if (r.status == null || r.status < 0 || r.status > 127) throw new Error(`git merge-file failed: ${(r.stderr || r.error || "").toString().trim()}`);
  return { text: r.stdout, conflicts: r.status };
}

// Split an index README into the prose before the table, the table (header,
// separator and every row, as reconcile's rebuildIndexRows reads it), and the
// prose after. null when the file has no recognised table.
function splitIndex(text) {
  const lines = text.split("\n");
  const head = lines.findIndex((l) => indexHeaderRe().test(l));
  if (head === -1 || !/^\|[-\s|]+\|$/.test(lines[head + 1] || "")) return null;
  let end = head + 2;
  while (end < lines.length && /^\|/.test(lines[end])) end++;
  // Each part keeps its own line ends, so the three concatenate back exactly.
  return {
    pre: head ? lines.slice(0, head).join("\n") + "\n" : "",
    table: lines.slice(head, end).join("\n") + (end < lines.length ? "\n" : ""),
    post: lines.slice(end).join("\n"),
  };
}

// Three-way merge of the prose around the table; the table is ours.
function mergeIndex(a, o, b, tmp) {
  const [A, O, B] = [a, o, b].map((f) => splitIndex(readFileSync(f, "utf8")));
  if (!A || !O || !B) return null;
  let conflicts = 0;
  const part = (k) => {
    for (const [f, x] of [[tmp.a, A], [tmp.o, O], [tmp.b, B]]) writeFileSync(f, x[k], "utf8");
    const m = mergeFile(tmp.a, tmp.o, tmp.b);
    conflicts += m.conflicts;
    return m.text;
  };
  const pre = part("pre"), post = part("post");
  return { text: pre + A.table + post, conflicts };
}

// Not a derived view: a plain three-way text merge, exactly what git would
// have done without the driver — clean is exit 0, a conflict leaves markers in
// %A and exit 1. Without base and theirs (a human calling it on one file)
// there is nothing to merge: refuse.
function plainMerge(a, o, b, why) {
  if (!o || !b) {
    process.stderr.write(`waypost merge-derived: ${why}; leaving the conflict\n`);
    process.exit(1);
  }
  let m;
  try { m = mergeFile(a, o, b); }
  catch (e) {
    process.stderr.write(`waypost merge-derived: ${why}; ${e.message}; leaving the conflict\n`);
    process.exit(1);
  }
  writeFileSync(a, m.text, "utf8");
  process.stderr.write(`waypost merge-derived: ${why}; merged it as text${m.conflicts ? ", with conflicts" : ""}\n`);
  process.exit(m.conflicts ? 1 : 0);
}

function main() {
  ignoreEpipe();
  const [target, base, theirs, worktreePath] = process.argv.slice(2);
  if (!target) {
    process.stderr.write("waypost merge-derived: usage: merge-derived <result> [base] [theirs] [path]\n");
    process.exit(2);
  }
  // %P when git passes it, else %A — which is right when a human invokes the
  // command directly on a real file.
  const view = resolve(worktreePath || target);
  const cfg = readConfig();
  if (!cfg || !cfg.vault_path) plainMerge(target, base, theirs, "no bound vault — cannot tell a derived view");
  const vault = realPath(cfg.vault_path);
  const rel = pathUnder(realPath(view), vault);
  const name = basename(view);
  if (rel !== null && WHOLE.has(name) && dirname(rel.replace(/\\/g, "/")) === ".") {
    // %A already holds our side: leaving it untouched IS the result.
    process.stderr.write(`waypost merge-derived: kept our ${name}; it is re-derived after the merge (waypost merge/commit, or waypost reconcile --write)\n`);
    return;
  }
  let folders = [];
  try { folders = loadLayout(cfg.layout || "engineering").folders.map((f) => f.path); } catch { /* no layout: no index */ }
  const folder = rel !== null && name === "README.md" ? dirname(rel.replace(/\\/g, "/")) : null;
  if (!folder || !folders.includes(folder)) plainMerge(target, base, theirs, `${name} is not a derived view`);
  if (!base || !theirs) plainMerge(target, base, theirs, `${folder}/README.md needs base and theirs to merge its prose`);
  // Scratch files outside the worktree: git creates %A in its root.
  const dir = mkdtempSync(join(tmpdir(), "waypost-merge-"));
  const tmp = { a: join(dir, "a"), o: join(dir, "o"), b: join(dir, "b") };
  let merged, failed = null;
  try { merged = mergeIndex(target, base, theirs, tmp); }
  catch (e) { failed = e; }
  finally { rmSync(dir, { recursive: true, force: true }); }
  if (failed) plainMerge(target, base, theirs, `${folder}/README.md: ${failed.message}`);
  if (!merged) plainMerge(target, base, theirs, `${folder}/README.md has no recognised index table on every side`);
  writeFileSync(target, merged.text, "utf8");
  if (merged.conflicts) {
    process.stderr.write(`waypost merge-derived: ${folder}/README.md — the prose around the index conflicts; resolve it, the table is re-derived\n`);
    process.exit(1);
  }
  process.stderr.write(`waypost merge-derived: merged the prose of ${folder}/README.md, kept our index table; it is re-derived after the merge\n`);
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) main();
