// Portable vault paths and checkout line-ending diagnostics.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function finding(group, level, check, message, file) {
  const f = { group, level, check, message };
  if (file) f.file = file;
  return f;
}

// ─── Cross-device / cross-OS checks (ADR-0007) ─────────────────────────
//
// A vault shared between macOS, Windows and Linux fails in ways that are
// invisible from any single one of them: a filename legal here cannot be
// checked out there, two artifacts differing only in case collapse into one on
// a case-insensitive filesystem, and CRLF normalisation turns every file a
// Windows session touches into a whole-file diff that conflicts with everything.
const WIN_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

export function checkPortableNames(cfg, vaultFiles) {
  const out = [];
  const seen = new Map();
  // walkVaultFiles yields { rel, name }; accept a plain string too so the check
  // can be driven directly from a list of paths.
  for (const entry of vaultFiles || []) {
    const rel = typeof entry === "string" ? entry : entry.rel;
    const bad = [];
    // Every SEGMENT, not just the filename: a directory named "epics " is as
    // fatal to a Windows checkout as a file named "con.md", and only the whole
    // path shows it.
    for (const seg of rel.split("/")) {
      if (/[<>:"|?*]/.test(seg)) bad.push('one of <>:"|?* — illegal in a Windows path');
      if (/[ .]$/.test(seg)) bad.push(`a segment ending in a space or dot ("${seg}") — Windows silently drops it`);
      if (WIN_RESERVED.test(seg)) bad.push(`a reserved device name on Windows ("${seg}")`);
      // eslint-disable-next-line no-control-regex
      if (/[\u0000-\u001f]/.test(seg)) bad.push("a control character");
    }
    if (bad.length) {
      out.push(finding("vault", "warn", "portable-names",
        `"${rel}" cannot be checked out on Windows: it contains ${[...new Set(bad)].join("; ")}.`, rel));
    }
    const key = rel.toLowerCase();
    if (seen.has(key) && seen.get(key) !== rel) {
      out.push(finding("vault", "issue", "portable-names",
        `"${rel}" and "${seen.get(key)}" differ only in case — on macOS and Windows one of them cannot exist, so a clone there loses a file.`, rel));
    } else seen.set(key, rel);
    if (rel.length > 180) {
      out.push(finding("vault", "info", "portable-names",
        `"${rel}" is ${rel.length} characters — close to the 260-character path limit a Windows clone still has by default.`, rel));
    }
  }
  return out;
}

// Without an eol policy, a Windows session commits CRLF and every subsequent
// diff is the whole file — which then conflicts with every parallel edit. This
// is the cheapest possible defence and belongs beside the merge driver.
export function checkLineEndings(cfg, proj) {
  if (!existsSync(join(proj, ".git"))) return [];
  let attrs = "";
  try { attrs = readFileSync(join(proj, ".gitattributes"), "utf8"); } catch {}
  const line = attrs.match(/^\*\s+text=auto.*$/m);
  if (!line) {
    return [finding("install", "warn", "line-endings",
      "No `* text=auto eol=lf` in .gitattributes — a session on Windows will commit CRLF and every file it touches becomes a whole-file diff that conflicts with everyone else's edits. `waypost doctor --fix` writes it.")];
  }
  if (!/\beol=/.test(line[0])) {
    return [finding("install", "warn", "line-endings",
      `\`${line[0].trim()}\` in .gitattributes pins normalisation but not the checkout ending, so git falls back to core.eol=native and a checkout on Windows still writes CRLF into the working tree — invisibly, because check-in normalises back and \`git status\` stays clean. \`waypost doctor --fix\` appends \`eol=lf\`.`)];
  }
  return [];
}

