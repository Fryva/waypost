#!/usr/bin/env node
// projectstore — story-section.mjs (PS-SPEC story-007)
// Computes the story lifecycle-gate mutations for waypost story
// plan|close. Pure compute, models reconcile.mjs rebuildIndex: reads the
// original, splices the managed pieces, returns {path, changed, content,
// notes} on stdout — the COMMAND writes after approval, never this script.
//
//   node story-section.mjs plan  <story-path>
//   node story-section.mjs close <story-path>
//
// plan  — ensures a `## Implementation Plan` section exists (inserted with a
//         placeholder; the agent fills it in the preview before approval),
//         status → in-progress (never downgrades review/done), stamps
//         started_at (once) and plan_updated_at (every run), bumps updated.
// close — ensures a `## Final Summary` section exists, status → done,
//         stamps closed_at (once), bumps updated.
//
// Timestamps are full ISO-8601 UTC (lib.mjs nowIso) — they anchor the legacy
// predicate (closed_at vs spec_policy_since) and diff-refs' git --since.
// Timestamps are written UNCONDITIONALLY of lifecycle_gates: the gates key
// controls checks and prompts, never the data that other predicates need.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import {
  readConfig,
  parseFrontmatter,
  headingLineRe,
  heading,
  footerDateRe,
  nowIso,
  today,
} from "./lib.mjs";

function die(msg) {
  process.stderr.write(`waypost story-section: ${msg}\n`);
  process.exit(1);
}

// Replace `key: ...` inside the frontmatter block, or insert the line before
// the closing --- when the key is absent. Returns the whole file text.
function setFm(text, key, value) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) die("story has no frontmatter block");
  const fmLines = m[1].split("\n");
  const idx = fmLines.findIndex((l) => l.startsWith(`${key}:`));
  const line = `${key}: ${value}`;
  if (idx >= 0) fmLines[idx] = line;
  else fmLines.push(line);
  return text.slice(0, m.index) + `---\n${fmLines.join("\n")}\n---` + text.slice(m.index + m[0].length);
}

// End index of section `id` (position right before the next `## ` heading
// after it), or null when the section is absent.
function sectionEnd(text, id) {
  const m = text.match(headingLineRe(id));
  if (!m) return null;
  const rest = text.slice(m.index + m[0].length);
  const next = rest.search(/^## /m);
  return next === -1 ? text.length : m.index + m[0].length + next;
}

function insertSection(text, id, lang, placeholder, anchors, fmEnd) {
  if (headingLineRe(id).test(text)) return { text, inserted: false };
  const block = `## ${heading(id, lang)}\n\n${placeholder}\n\n`;
  for (const anchor of anchors) {
    const end = sectionEnd(text, anchor);
    if (end !== null) {
      return { text: text.slice(0, end) + block + text.slice(end), inserted: true };
    }
  }
  // Fallback: before the trailing `---` footer, searched only AFTER the
  // frontmatter block ends. Searching the whole text finds the frontmatter's
  // OWN closing delimiter on a story with no anchor sections and no footer —
  // splicing the block inside the YAML instead of the body.
  const footer = text.indexOf("\n---\n", fmEnd);
  const at = footer !== -1 ? footer + 1 : text.length;
  return { text: text.slice(0, at) + block + text.slice(at), inserted: true };
}

function main() {
  const [mode, storyPath] = process.argv.slice(2);
  if (!["plan", "close"].includes(mode) || !storyPath) {
    die("usage: story-section.mjs <plan|close> <story-path>");
  }
  const cfg = readConfig();
  if (!cfg) die("No projectstore config. Run waypost bind first.");
  const lang = cfg.language || "en";
  const abs = resolve(storyPath);
  if (!existsSync(abs)) die(`story not found: ${abs}`);

  // The sha256 travels in the JSON output so the writer (bin/waypost) can refuse
  // to apply `content` if the file changed after THIS read — the hash is of
  // the exact bytes read from disk, before any BOM/CRLF normalization below.
  const diskText = readFileSync(abs, "utf8");
  const original_sha256 = createHash("sha256").update(diskText, "utf8").digest("hex");

  // Normalize once, here: strip a BOM and CRLF line endings so every regex
  // below (all of them \n-only) works on a Windows-authored file exactly as
  // it works on one written on macOS/Linux. The file is written back LF-only
  // (the project's own eol=lf policy, doctor --fix writes the .gitattributes
  // line for it) — a no-op on the second run, once the file has migrated.
  let raw = diskText;
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  const original = raw.replace(/\r\n/g, "\n");
  const { data: fm, body: fmBody } = parseFrontmatter(original);
  if (fm.type && fm.type !== "story") die(`not a story (type: ${fm.type})`);
  const fmEnd = original.length - fmBody.length;

  let text = original;
  const notes = [];
  const now = nowIso();
  const status = String(fm.status || "").toLowerCase();

  if (mode === "plan") {
    const r = insertSection(text, "implementation_plan", lang,
      "<!-- Route through the covering spec's contracts: which contracts, in what order, which files. Filled at the gate. -->",
      ["decomposition", "description"], fmEnd);
    text = r.text;
    if (r.inserted) notes.push("inserted Implementation Plan section");
    if (!["in-progress", "in_progress", "review", "done"].includes(status)) {
      text = setFm(text, "status", "in-progress");
      notes.push(`status: ${fm.status || "planned"} → in-progress`);
    }
    if (!fm.started_at || fm.started_at === "null") {
      text = setFm(text, "started_at", JSON.stringify(now));
      notes.push("stamped started_at");
    }
    text = setFm(text, "plan_updated_at", JSON.stringify(now));
    notes.push("stamped plan_updated_at");
  } else {
    const r = insertSection(text, "final_summary", lang,
      "<!-- What changed, why, tests executed, risks and follow-ups. Filled at the gate. -->",
      ["acceptance", "decomposition", "description"], fmEnd);
    text = r.text;
    if (r.inserted) notes.push("inserted Final Summary section");
    if (status !== "done") {
      text = setFm(text, "status", "done");
      notes.push(`status: ${fm.status || "?"} → done`);
    }
    if (!fm.closed_at || fm.closed_at === "null") {
      text = setFm(text, "closed_at", JSON.stringify(now));
      notes.push("stamped closed_at");
    }
  }
  text = setFm(text, "updated", today());
  // Keep the body footer in step with frontmatter `updated:`. Registry-driven, so
  // every bundled language is covered; the file's own label and punctuation are
  // preserved and only the date is rewritten.
  text = text.replace(footerDateRe(), (_m, prefix, suffix) => `${prefix}${today()}${suffix}`);

  process.stdout.write(JSON.stringify({
    path: abs,
    mode,
    changed: text !== original,
    notes,
    content: text,
    original_sha256,
  }, null, 2) + "\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
