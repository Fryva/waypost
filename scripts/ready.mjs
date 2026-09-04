// waypost — ready work (WP-15, the Beads lesson without the database): which
// stories can be picked up right now. A story is ready when it is planned,
// every story it declares in `blocked_by` is done, and no live session
// claims it. Dependencies are frontmatter — `blocked_by: ["<epic>/<stem>", …]`
// in flow form, the only form the line-based reader sees — and readiness is
// computed from the vault every time, never stored: the file that says
// "blocked" is the blocker's own status.
//
// Pure compute: reads the vault and the presence records, prints JSON or a
// list with the command that claims each ready story.
//   node ready.mjs [--json] [--all]

import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { readConfig, projectRoot, ignoreEpipe, parseFrontmatter, listOf, listVaultStoryFiles, storyRefOf } from "./lib.mjs";
import { claimsOf } from "./sessions.mjs";

const PRIORITY = { p0: 0, p1: 1, p2: 2, p3: 3 };
// A blocker in any of these states no longer blocks.
export const SETTLED = new Set(["done", "closed", "superseded", "archived", "cancelled", "canceled"]);

export function stories(vault) {
  const out = [];
  for (const abs of listVaultStoryFiles(vault)) {
    let fm = {}; let raw = "";
    try { raw = readFileSync(abs, "utf8"); ({ data: fm } = parseFrontmatter(raw)); } catch { continue; }
    const ref = storyRefOf(abs, vault);
    if (!ref) continue;
    out.push({
      ref, path: abs, rel: relative(projectRoot(), abs).split("\\").join("/"),
      title: fm.title || ref.split("/")[1], epic: fm.epic && fm.epic !== "null" ? fm.epic : ref.split("/")[0],
      status: String(fm.status || "").toLowerCase(), priority: String(fm.priority || "p2").toLowerCase(),
      blocked_by: listOf(fm, "blocked_by"),
      // The line-based reader turns a block sequence into an empty scalar; the
      // raw text tells that case from "no dependencies" (doctor names it).
      blocked_by_block_form: /^blocked_by:\s*\n\s+- /m.test(raw.split(/\n---\s*\n/)[0] || ""),
    });
  }
  return out;
}

export function readiness(vault, { claims = null } = {}) {
  const all = stories(vault);
  const byRef = new Map(all.map((s) => [s.ref, s]));
  const claimed = new Map((claims ?? claimsOf(vault)).map((c) => [c.story, c]));
  const rows = all.map((s) => {
    const open = [], unknown = [];
    for (const b of s.blocked_by) {
      const t = byRef.get(b);
      if (!t) unknown.push(b);
      else if (!SETTLED.has(t.status)) open.push(b);
    }
    const c = claimed.get(s.ref) || null;
    const blocked = open.length + unknown.length > 0 || s.blocked_by_block_form;
    return {
      ...s, blockers_open: open, blockers_unknown: unknown,
      claimed_by: c ? { session: c.session, host: c.host, harness: c.harness || null } : null,
      blocked, ready: s.status === "planned" && !blocked && !c,
    };
  });
  const order = (a, b) => (PRIORITY[a.priority] ?? 9) - (PRIORITY[b.priority] ?? 9) || a.ref.localeCompare(b.ref);
  return rows.sort(order);
}

function main() {
  ignoreEpipe();
  const args = process.argv.slice(2);
  const cfg = readConfig();
  if (!cfg || !cfg.vault_path) { process.stderr.write("waypost ready: no bound vault — run `waypost bind <vault-path>` first\n"); process.exit(1); }
  const rows = readiness(cfg.vault_path);
  const view = {
    ready: rows.filter((r) => r.ready),
    blocked: rows.filter((r) => r.blocked && r.status === "planned"),
    claimed: rows.filter((r) => r.claimed_by && !SETTLED.has(r.status)),
  };
  if (args.includes("--json")) { process.stdout.write(JSON.stringify(view, null, 2) + "\n"); return; }
  if (!view.ready.length) process.stdout.write("nothing is ready: every planned story is blocked or claimed, or there is none — `waypost ready --all` shows why\n");
  for (const r of view.ready) {
    process.stdout.write(`${r.priority.padEnd(3)} ${r.ref.padEnd(44)} ${r.title}\n    waypost story plan ${r.rel} --write\n`);
  }
  if (args.includes("--all")) {
    for (const r of view.blocked) {
      const why = [...r.blockers_open.map((b) => `waiting on ${b}`), ...r.blockers_unknown.map((b) => `${b} names no story`),
        ...(r.blocked_by_block_form ? ["blocked_by is in block form — write it as a JSON list"] : [])].join("; ");
      process.stdout.write(`${r.priority.padEnd(3)} ${r.ref.padEnd(44)} blocked: ${why}\n`);
    }
    for (const r of view.claimed) {
      process.stdout.write(`${r.priority.padEnd(3)} ${r.ref.padEnd(44)} claimed by ${r.claimed_by.session} on ${r.claimed_by.host}\n`);
    }
  }
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) main();
