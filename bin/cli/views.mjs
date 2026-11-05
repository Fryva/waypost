// Waypost CLI: views.
import { loadLayout, parseFrontmatter } from "../../scripts/lib.mjs";
import { fail, flag, opt, positionals, readConfig, run, runJson, withRegistryHome } from "./core.mjs";
import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// ─── derived views ─────────────────────────────────────────────────────

const DERIVED = { kanban: "kanban", graph: "graph", codemap: "codemap" };

// A graph or an index grows with the vault: at 200 artifacts graph.md is ~13k
// tokens and an index ~10k. Reading either whole to answer one question is the
// single largest avoidable cost on a big project, so the CLI answers the
// question instead — the derived views stay the source, this is just a lens.
function handleGraphQuery(target, args) {
  const cfg = readConfig();
  if (!cfg || !cfg.vault_path) fail("no bound vault — run `waypost bind <vault-path>` first");
  const p = join(cfg.vault_path, "graph.md");
  if (!existsSync(p)) fail("no graph.md yet — run `waypost graph`");
  const needle = target.replace(/\\/g, "/").replace(/^\.\//, "");
  const lines = readFileSync(p, "utf8").split("\n");
  const node = [], edges = [];
  let section = "";
  for (const line of lines) {
    if (line.startsWith("## ")) section = line.trimEnd();
    if (line.includes(needle) && line.startsWith("|")) {
      if (section === "## Edges") edges.push(line);
      else node.push({ line, canonical: section === "## Nodes" });
    }
  }
  if (!node.length && !edges.length) {
    fail(`no node or edge mentions "${needle}" in graph.md.\n`
      + "       Nodes are keyed by vault-relative path (adr/foo.md), not by slug.");
  }
  process.stdout.write(`${needle}\n`);
  for (const { line, canonical } of node) {
    const row = canonical && /^\| ([^|]+) \| ([^|]*) \| ([^|]*) \| ([^|]*) \|\r?$/.exec(line);
    const compact = row && row[1] === needle && line.replace(/\r$/, "") !== "| Path | Title | Type | Status |" &&
      !row.slice(2).some(cell => cell.includes("·"));
    const display = compact ? row.slice(2).map(cell => cell.trim()).join(" · ")
      : line.replace(/^\|\s*/, "").replace(/\s*\|\s*$/, "").replace(/\s*\|\s*/g, " · ");
    process.stdout.write(`  ${display}\n`);
  }
  if (edges.length) {
    process.stdout.write(`\nedges (${edges.length}):\n`);
    const edgeRows = [];
    // Backlinks are what a query is usually for, yet on a hub (an epic with a
    // hundred stories) its own outgoing rows filled the whole bound and hid
    // every incoming one. Past the bound incoming rows go first — those from a
    // node this one does not itself link to before the mirrored ones (a
    // story's link back to its epic) — and `--all` lifts it.
    let shown = edges;
    if (edges.length > 60 && !flag(args, "--all")) {
      const cells = l => /^\| ([^|]+) \| [^|]+ \| ([^|]+) \|\r?$/.exec(l);
      const outTo = new Set(edges.map(cells).filter(r => r && r[1] === needle).map(r => r[2]));
      const rank = l => { const r = cells(l); return !r || r[2] !== needle || r[1] === needle ? 2 : outTo.has(r[1]) ? 1 : 0; };
      shown = [0, 1, 2].flatMap(k => edges.filter(l => rank(l) === k)).slice(0, 60);
    }
    for (const l of shown) {
      // The header supplies the queried endpoint. Only canonical, unambiguous
      // rows can omit it; diagnostic/substring matches keep their full form.
      const row = /^\| ([^|]+) \| ([^|]+) \| ([^|]+) \|\r?$/.exec(l);
      if (row && row[2].trim() === row[2] && !row[2].includes(": ")) {
        const [, from, kind, to] = row;
        const direction = from === needle ? (to === needle ? "self" : "out") : to === needle ? "in" : null;
        if (direction) {
          const endpoint = direction === "out" ? to : from;
          edgeRows.push({ direction, kind, endpoint,
            text: `  ${direction} ${kind}${direction === "self" ? "" : `: ${endpoint}`}\n` });
          continue;
        }
      }
      edgeRows.push({ text: `  ${l.replace(/^\|\s*/, "").replace(/\s*\|\s*$/, "").replace(/\s*\|\s*/g, " → ")}\n` });
    }
    for (let edgeAt = 0; edgeAt < edgeRows.length;) {
      const edgeFirst = edgeRows[edgeAt];
      let edgeEnd = edgeAt + 1;
      if (edgeFirst.direction === "in" || edgeFirst.direction === "out") {
        while (edgeEnd < edgeRows.length && edgeRows[edgeEnd].direction === edgeFirst.direction &&
          edgeRows[edgeEnd].kind === edgeFirst.kind) edgeEnd++;
      }
      const edgeRun = edgeRows.slice(edgeAt, edgeEnd);
      const edgeLegacy = edgeRun.map(edgeItem => edgeItem.text).join("");
      const edgeGrouped = edgeRun.length >= 5
        ? `  ${edgeFirst.direction} ${edgeFirst.kind}:\n` + edgeRun.map(edgeItem => `    ${edgeItem.endpoint}\n`).join("") : null;
      process.stdout.write(edgeGrouped !== null && Buffer.byteLength(edgeGrouped) < Buffer.byteLength(edgeLegacy)
        ? edgeGrouped : edgeLegacy);
      edgeAt = edgeEnd;
    }
    if (shown.length < edges.length) process.stdout.write(`  …and ${edges.length - shown.length} more (--all)\n`);
  }
}

function firstSearchLine(text, re) {
  let index = 0, start = 0;
  for (;;) {
    const end = text.indexOf("\n", start);
    const line = text.slice(start, end === -1 ? text.length : end);
    if (re.test(line)) return { index, line };
    if (end === -1) return null;
    start = end + 1;
    index++;
  }
}

function searchExcerpt(line, re) {
  const text = line.trim();
  const prefix = text.slice(0, 120);
  if (text.length <= 120 || re.test(prefix)) return prefix;
  const match = re.exec(text);
  // A whitespace-sensitive query may match only before trim: keep its old preview.
  if (!match) return prefix;
  let start = Math.max(0, match.index - Math.floor(Math.max(0, 118 - match[0].length) / 2));
  let end = Math.min(text.length, start + 118);
  if (end === text.length || text.length - match.index <= 119) {
    end = text.length;
    start = Math.max(0, end - 119);
  } else if (start === 0) {
    end = 119;
  }
  // Keep new window boundaries outside valid surrogate pairs; legacy prefixes stay exact.
  if (start > 0 && text.codePointAt(start - 1) > 0xffff) start++;
  if (end > 0 && text.codePointAt(end - 1) > 0xffff) end--;
  return (start ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}

// Vault-wide search that returns pointers, not documents: path, title, status
// and the matching line. The alternative an agent falls back to is grep plus a
// handful of full-file reads.
function handleSearch(args) {
  const cfg = readConfig();
  if (!cfg || !cfg.vault_path) fail("no bound vault — run `waypost bind <vault-path>` first");
  const terms = positionals(args);
  if (!terms.length) fail('search "<text>" [--kind adr|spec|epic|story|…] [--limit 20]');
  const kind = opt(args, "--kind");
  const limitRaw = opt(args, "--limit", "20");
  const limit = Number(limitRaw);
  if (!Number.isInteger(limit) || limit <= 0) fail(`--limit must be a positive integer, got "${limitRaw}"`);
  const re = new RegExp(terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i");
  const out = [];
  let matched = 0;
  const excluded = new Set(["kanban.md", "graph.md", "code-map.md"].map(n => join(cfg.vault_path, n)));
  // Only the actual views are derived; an artifact may share their filename.
  // Search also works when its optional layout cannot be read.
  try {
    const layout = withRegistryHome(() => loadLayout(cfg.layout || "engineering"));
    if (layout.kanban) excluded.add(join(cfg.vault_path, layout.kanban.file || "kanban.md"));
  } catch {}
  // iCloud leaves a placeholder — ".<name>.icloud" — for a file evicted from
  // local storage; the real name never appears in the listing until it syncs
  // back down. Counted, not searched: its content is not on disk to match.
  let notDownloaded = 0;
  const walk = (dir, rel) => {
    let names = [];
    try { names = readdirSync(dir); } catch { return; }
    for (const n of names) {
      if (n.startsWith(".")) {
        const icloud = /^\.(.+)\.icloud$/.exec(n);
        if (icloud) notDownloaded++;
        continue;
      }
      const abs = join(dir, n);
      const r = rel ? `${rel}/${n}` : n;
      let lst; try { lst = lstatSync(abs); } catch { continue; }
      // A symlinked directory is never descended into: cheap protection
      // against a cycle (a directory symlinked into itself or an ancestor),
      // at the cost of not walking a legitimate symlinked subtree. A
      // symlinked FILE falls through to the same read path as a real one.
      if (lst.isSymbolicLink()) {
        let target; try { target = statSync(abs); } catch { continue; }
        if (target.isDirectory()) continue;
      } else if (lst.isDirectory()) {
        walk(abs, r);
        continue;
      } else if (!lst.isFile()) {
        continue;
      }
      if (!n.endsWith(".md")) continue;
      if (excluded.has(abs)) continue;
      let text; try { text = readFileSync(abs, "utf8"); } catch { continue; }
      // A literal line/path match must also occur in the whole text/path.
      // This only rejects negatives; line-level matching below remains required.
      if (!re.test(text) && !re.test(r)) continue;
      // parseFrontmatter, not an inline \n-only regex: a CRLF or BOM file
      // (the exact shape doctor's own cross-OS checks exist to catch before
      // it is fixed) used to read as "no frontmatter at all" here, so
      // `--kind` silently dropped every match and title/status came back
      // from the filename instead of the artifact's own fields.
      const { data: fm, body } = parseFrontmatter(text);
      if (kind && String(fm.type ?? "") !== kind) continue;
      const hit = firstSearchLine(text, re);
      const hitLine = hit?.index ?? -1;
      if (hitLine === -1 && !re.test(r)) continue;
      matched++;
      if (out.length >= limit) continue;
      // Only collapse an exact title/status scalar inside the parsed header. Ambiguous
      // syntax and body text keep their original snippet, including comments.
      const scalar = hitLine < 0 ? null : /^title:\s*(.*?)\r?$/.exec(hit.line)?.[1].trim();
      const titleLine = scalar != null && typeof fm.title === "string" && fm.title !== "" && !/[\r\n]/.test(fm.title) &&
        hitLine > 0 && hitLine < text.slice(0, text.length - body.length).split("\n").length - 1 &&
        (scalar === JSON.stringify(fm.title) || scalar === `'${fm.title.replace(/'/g, "''")}'` ||
          (!/^["'|>]/.test(scalar) && scalar === fm.title)) ? hitLine + 1 : null;
      const searchStatusScalar = hitLine < 0 ? null : /^status:\s*(.*?)\r?$/.exec(hit.line)?.[1].trim();
      const searchStatusLine = searchStatusScalar != null && typeof fm.status === "string" && fm.status !== "" && !/[();\r\n]/.test(fm.status) &&
        hitLine > 0 && hitLine < text.slice(0, text.length - body.length).split("\n").length - 1 &&
        (searchStatusScalar === JSON.stringify(fm.status) || searchStatusScalar === `'${fm.status.replace(/'/g, "''")}'` ||
          (!/^["'|>]/.test(searchStatusScalar) && searchStatusScalar === fm.status)) ? hitLine + 1 : null;
      const title = String(fm.title ?? "");
      out.push({ path: r, title: title || n, fallbackTitle: title === "", status: fm.status == null ? "" : String(fm.status),
        titleLine, searchStatusLine,
        line: hitLine === -1 ? null : `${hitLine + 1}: ${searchExcerpt(hit.line, re)}` });
    }
  };
  walk(cfg.vault_path, "");
  if (!out.length) { process.stdout.write("no match\n"); }
  else {
    for (const h of out) {
      process.stdout.write(`${h.path}${h.status ? `  (${h.status}${h.searchStatusLine ? `; line ${h.searchStatusLine}` : ""})` : ""}\n`
        + (h.fallbackTitle ? "" : `  ${h.title}${h.titleLine ? ` (line ${h.titleLine})` : ""}\n`)
        + (h.line && !h.titleLine && !h.searchStatusLine ? `  ${h.line}\n` : ""));
    }
    if (matched > out.length) process.stdout.write(`…and ${matched - out.length} more (--limit)\n`);
  }
  if (notDownloaded) {
    process.stdout.write(`${notDownloaded} file(s) not downloaded from iCloud — open them once to sync\n`);
  }
}

function handleDerived(cmd, args) {
  if (flag(args, "--json")) { run(cmd, []); return; }
  const out = runJson("reconcile", ["--write", "--only", DERIVED[cmd]]);
  const target = out[cmd] || {};
  if (target.error) fail(`${cmd}: ${target.error}`);
  if (target.skipped) { process.stdout.write(`${cmd}: ${target.skipped}\n`); return; }
  process.stdout.write(`${target.written ? "written" : "unchanged"} ${target.path || cmd}\n`);
}

// Reconciliation counts unchanged targets; changes, skips and returned errors
// keep their details. `--json` preserves the complete per-target records.
function handleReconcile(args) {
  if (flag(args, "--json")) { run("reconcile", args.filter((a) => a !== "--json")); return; }
  const wrote = flag(args, "--write");
  const result = run("reconcile", args, { capture: true, returnResult: true });
  let out;
  try {
    out = JSON.parse(result.stdout);
    if (!out || typeof out !== "object" || Array.isArray(out)
      || (out.indexes != null && (!Array.isArray(out.indexes)
        || out.indexes.some(idx => !idx || typeof idx !== "object" || Array.isArray(idx))))) {
      throw new Error("invalid reconciliation report");
    }
  } catch {
    process.stdout.write(result.stdout || "");
    process.stderr.write("waypost: reconcile: expected JSON on stdout\n");
    process.exitCode = result.status === 0 ? 1 : (result.status ?? 1);
    return;
  }
  let unchanged = 0;
  const line = (label, t) => {
    if (!t) return;
    if (t.error) { process.stdout.write(`  ${label}: error — ${t.error}\n`); return; }
    if (t.skipped) { process.stdout.write(`  ${label}: ${t.skipped}\n`); return; }
    if (t.changed === false && !t.written) { unchanged++; return; }
    const state = t.written ? "written" : t.changed === true ? "would change" : "unchanged";
    const repeatedPath = typeof t.path === "string" && label === t.path;
    process.stdout.write(`  ${label}: ${state}${t.path && !repeatedPath ? ` ${t.path}` : ""}\n`);
  };
  process.stdout.write(`${result.status !== 0 ? "reconciliation failed" : wrote ? "reconciled" : "dry run (nothing written; add --write)"}\n`);
  line("kanban", out.kanban);
  line("code-map", out.codemap);
  line("graph", out.graph);
  for (const idx of out.indexes || []) line(idx.path || "index", idx);
  if (unchanged) process.stdout.write(`  ${unchanged} unchanged (details: --json)\n`);
  if (result.status !== 0) process.exitCode = result.status ?? 1;
  else if (out.summary && out.summary.failed > 0) process.exitCode = 1;
}

export { DERIVED, handleGraphQuery, handleSearch, handleDerived, handleReconcile };
