// ADR guard checks and their shared project-file cache.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function finding(group, level, check, message, file) {
  const f = { group, level, check, message };
  if (file) f.file = file;
  return f;
}

// ─── Guards (ADR-0011): decisions that check themselves ───────────────
//
// An accepted ADR may carry `guards: [{"forbid": <regex>, "in": <glob>,
// "not_in": <glob>, "why": …}, {"require": …}, {"check": "<command>", "why": …}]`
// — flow form on one line, the only form the line-based frontmatter reader
// sees. `forbid` fails on any match in a selected file, `require` on every
// selected file without one; patterns run over the whole file text so a
// formatter's line wrap hides nothing, and the finding names the line.
// `check` names the project's own fitness command and is never executed:
// doctor runs unattended on every clone (`waypost next`), so nothing in an
// artifact may run a command. Files come from git (tracked plus untracked,
// ignored excluded); each pattern compiles in its own try/catch; a glob that
// selects nothing is a finding, since a guard that cannot fail is worse than
// none; file size and count are bounded. Accepted → issue, proposed → info
// ("would fail"), superseded → nothing. --fix never touches these.
export const GUARD_FILE_MAX = 1 << 20;
export const GUARD_FILES_MAX = 5000;

function globToRegExp(glob) {
  let re = "";
  const g = String(glob).replace(/\\/g, "/").replace(/^\.\//, "");
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === "*") {
      if (g[i + 1] === "*") { re += g[i + 2] === "/" ? "(?:.*/)?" : ".*"; i += g[i + 2] === "/" ? 2 : 1; }
      else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

const _files = new Map();
export function projectFiles(proj) {
  if (_files.has(proj)) return _files.get(proj);
  let out = [];
  const r = existsSync(join(proj, ".git"))
    ? spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: proj, encoding: "utf8", maxBuffer: 64 << 20 })
    : null;
  if (r && r.status === 0) {
    out = String(r.stdout).split("\0").filter(Boolean);
  } else {
    const walk = (dir, rel) => {
      let names = [];
      try { names = readdirSync(dir); } catch { return; }
      for (const n of names) {
        if (n === ".git" || n === "node_modules" || n === ".waypost") continue;
        const p = join(dir, n);
        let st; try { st = statSync(p); } catch { continue; }
        if (st.isDirectory()) walk(p, rel ? `${rel}/${n}` : n);
        else out.push(rel ? `${rel}/${n}` : n);
      }
    };
    walk(proj, "");
  }
  _files.set(proj, out);
  return out;
}

const lineOf = (text, index) => text.slice(0, index).split("\n").length;

export function checkGuards(artifacts, proj, { files = null } = {}) {
  const out = [];
  let list = null;
  const filesOf = () => (list ??= (files || projectFiles(proj)));
  for (const a of artifacts) {
    if (a.kind !== "adr") continue;
    const status = String((a.fm && a.fm.status) || "").toLowerCase();
    if (status === "superseded") continue;
    const head = String(a.body || "").split(/\n---\s*\n/)[0] || "";
    if (/^guards:\s*\n\s+- /m.test(head)) {
      out.push(finding("vault", "issue", "adr-guard",
        `${a.rel}: guards is written in block form, which the line-based frontmatter reader sees as empty — write it as a JSON list on one line.`, a.rel));
      continue;
    }
    const raw = a.fm && a.fm.guards;
    if (!raw || raw === "[]") continue;
    let guards;
    try { guards = JSON.parse(raw); } catch (e) {
      out.push(finding("vault", "issue", "adr-guard", `${a.rel}: guards is not a JSON list (${e.message}).`, a.rel)); continue;
    }
    if (!Array.isArray(guards)) { out.push(finding("vault", "issue", "adr-guard", `${a.rel}: guards must be a list.`, a.rel)); continue; }
    const level = status === "accepted" ? "issue" : "info";
    const prefix = status === "accepted" ? "" : "would fail: ";
    guards.forEach((g, i) => {
      const where = `${a.rel} guard ${i + 1}`;
      if (!g || typeof g !== "object" || Array.isArray(g)) { out.push(finding("vault", "issue", "adr-guard", `${where}: not an object.`, a.rel)); return; }
      const why = String(g.why || "").trim();
      if (!why) { out.push(finding("vault", "issue", "adr-guard", `${where}: no why — a guard that cannot say why does not exist.`, a.rel)); return; }
      if (g.check != null) {
        out.push(finding("vault", "info", "adr-guard", `${a.rel}: check \`${g.check}\` encodes this decision (${why}) — it runs in the project's own test suite; doctor never executes it.`, a.rel));
        return;
      }
      const kind = g.forbid != null ? "forbid" : g.require != null ? "require" : null;
      if (!kind) { out.push(finding("vault", "issue", "adr-guard", `${where}: needs forbid, require or check.`, a.rel)); return; }
      if (!g.in) { out.push(finding("vault", "issue", "adr-guard", `${where}: needs in (a glob relative to the project root).`, a.rel)); return; }
      let re;
      try { re = new RegExp(String(g[kind]), "m"); } catch (e) {
        out.push(finding("vault", "issue", "adr-guard", `${where}: pattern does not compile (${e.message}).`, a.rel)); return;
      }
      const inRe = globToRegExp(g.in);
      const notRe = g.not_in ? globToRegExp(g.not_in) : null;
      const selected = filesOf().filter((f) => inRe.test(f) && !(notRe && notRe.test(f)));
      if (!selected.length) {
        out.push(finding("vault", level, "adr-guard", `${prefix}${where}: in ${JSON.stringify(g.in)} selects no file — a guard that cannot fail is worse than none.`, a.rel)); return;
      }
      if (selected.length > GUARD_FILES_MAX) {
        out.push(finding("vault", "warn", "adr-guard", `${where}: in ${JSON.stringify(g.in)} selects ${selected.length} files, more than ${GUARD_FILES_MAX} — narrow it; not evaluated.`, a.rel)); return;
      }
      const hits = [], misses = []; let skipped = 0;
      for (const f of selected) {
        let text;
        try {
          if (statSync(join(proj, f)).size > GUARD_FILE_MAX) { skipped++; continue; }
          text = readFileSync(join(proj, f), "utf8");
        } catch { continue; }
        const m = re.exec(text);
        if (kind === "forbid" && m) hits.push(`${f}:${lineOf(text, m.index)}`);
        if (kind === "require" && !m) misses.push(f);
      }
      if (skipped) out.push(finding("vault", "warn", "adr-guard", `${where}: ${skipped} file(s) over ${GUARD_FILE_MAX} bytes skipped.`, a.rel));
      const more = (arr) => (arr.length > 5 ? ` and ${arr.length - 5} more` : "");
      if (kind === "forbid" && hits.length) {
        out.push(finding("vault", level, "adr-guard", `${prefix}${a.rel}: forbid ${JSON.stringify(g.forbid)} matched in ${hits.slice(0, 5).join(", ")}${more(hits)} — ${why}`, a.rel));
      }
      if (kind === "require" && misses.length) {
        out.push(finding("vault", level, "adr-guard", `${prefix}${a.rel}: require ${JSON.stringify(g.require)} missing in ${misses.slice(0, 5).join(", ")}${more(misses)} — ${why}`, a.rel));
      }
    });
  }
  return out;
}

