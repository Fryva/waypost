#!/usr/bin/env node
// waypost — merge-derived.mjs
// A git merge driver for the vault's derived views (ADR-0006).
//
// kanban.md, graph.md, code-map.md and the folder index READMEs are generated
// from artifact frontmatter. Two sessions in two harnesses that both touch a
// story both regenerate the board, and git then asks a human to merge two
// machine-written files line by line — a merge whose only correct outcome is
// "throw both away and regenerate". So that is what this does.
//
// Wired by `waypost doctor --fix` (or by hand):
//
//   .gitattributes:  kanban.md merge=waypost-derived
//   git config:      merge.waypost-derived.driver "waypost merge-derived %A %O %B %P"
//                    merge.waypost-derived.name   "regenerate waypost derived views"
//
// Git calls the driver with %A (a TEMP file to write the result into), %O
// (base), %B (theirs) and %P (the real path in the worktree). %A is a temp
// name like .merge_file_Ox2FDc, so %P is what says which view this is — the
// first version of this driver identified by %A and could never match.
// We ignore all three contents and re-derive, which is only sound
// because the SOURCE of these files — the artifacts — has already been merged
// by git before the driver runs on the generated ones. If regeneration fails,
// exit non-zero and let git fall back to a conflict rather than write a guess.
//
// CLI: node merge-derived.mjs <%A> [%O] [%B] [%P]

import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readConfig, pluginRoot, ignoreEpipe, realPath } from "./lib.mjs";
import { join } from "node:path";

// Which selector regenerates which file. A folder README is an index, and
// reconcile addresses those by folder name.
function selectorFor(name, cfg) {
  if (name === "kanban.md") return "kanban";
  if (name === "graph.md") return "graph";
  if (name === "code-map.md") return "codemap";
  if (name === "README.md") return "indexes";
  return null;
}

function main() {
  ignoreEpipe();
  const [target, , , worktreePath] = process.argv.slice(2);
  if (!target) {
    process.stderr.write("waypost merge-derived: usage: merge-derived <result> [base] [theirs] [path]\n");
    process.exit(2);
  }
  // %P when git passes it, else %A — which is right when a human invokes the
  // command directly on a real file.
  const name = worktreePath || target;
  const cfg = readConfig();
  if (!cfg || !cfg.vault_path) {
    process.stderr.write("waypost merge-derived: no bound vault — cannot regenerate; leaving the conflict\n");
    process.exit(1);
  }
  const abs = resolve(target);
  const view = resolve(name);
  // Inside the vault, or it is not a derived view whatever it is called: the
  // project's own README.md is not an index of anything waypost generates.
  const inVault = realPath(view).startsWith(realPath(cfg.vault_path) + "/");
  const selector = inVault ? selectorFor(basename(view), cfg) : null;
  if (!selector) {
    process.stderr.write(`waypost merge-derived: ${basename(view)} is not a derived view; leaving the conflict\n`);
    process.exit(1);
  }

  const r = spawnSync(process.execPath,
    [join(pluginRoot(), "scripts", "reconcile.mjs"), "--write", "--only", selector],
    { encoding: "utf8", env: process.env });
  if (r.status !== 0) {
    process.stderr.write(`waypost merge-derived: reconcile failed, leaving the conflict for a human:\n${(r.stderr || "").trim()}\n`);
    process.exit(1);
  }

  // reconcile writes into the vault; git wants the result at %A, which during a
  // merge is a temp file. Copy the regenerated view over it.
  let out;
  try {
    const parsed = JSON.parse(r.stdout || "{}");
    const targets = [parsed.kanban, parsed.codemap, parsed.graph, ...(parsed.indexes || [])].filter(Boolean);
    const hit = targets.find((t) => t.path && basename(t.path) === basename(view)
      && (selector !== "indexes" || t.path.endsWith(relOf(view))));
    out = hit && hit.path;
  } catch { /* fall through */ }
  if (!out || !existsSync(out)) {
    process.stderr.write(`waypost merge-derived: could not locate the regenerated ${basename(view)}; leaving the conflict\n`);
    process.exit(1);
  }
  if (resolve(out) !== abs) copyFileSync(out, abs);
  process.stderr.write(`waypost merge-derived: regenerated ${basename(view)} from the vault instead of merging it\n`);
}

// For an index README the basename is not unique, so match on the last two
// segments (<folder>/README.md) — which is exactly what makes it identifiable.
function relOf(abs) {
  const parts = abs.split("/");
  return parts.slice(-2).join("/");
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) main();
