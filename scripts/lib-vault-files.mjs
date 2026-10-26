// Waypost — read-only vault discovery, references and containment.

import { existsSync, readdirSync, statSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";

// ─── Story discovery ──────────────────────────────────────────────────
//
// A story is written in one of two shapes, and both are load-bearing in real
// vaults:
//
//   stories/story-001-foo.md            — flat file
//   stories/story-001-foo/README.md     — folder, when the story owns artifacts
//
// The folder shape exists because a story that carries attachments (reviews,
// diagrams, drafts) needs somewhere to put them; the README is then the story
// itself. Scanners that only glob `stories/*.md` silently drop those stories —
// on a board that means the card disappears, which reads as "no such work"
// rather than "scanner is blind".
//
// Only `stories/<name>/README.md` counts, not deeper nesting: an
// `artifacts/` subfolder under a story holds attachments, not more stories.

// Every subdirectory of an epics/ folder eligible to BE an epic: real
// directories only, `_`/`.`-prefixed ones excluded (`_templates` and
// friends hold blanks, not work — kanban.mjs's original convention, now the
// one place doctor's scanArtifacts and codemap share it instead of drifting).
export function listEpicDirs(epicsRoot) {
  let names;
  try { names = readdirSync(epicsRoot).sort(); } catch { return []; }
  return names.filter((n) => {
    if (n.startsWith("_") || n.startsWith(".")) return false;
    try { return statSync(join(epicsRoot, n)).isDirectory(); } catch { return false; }
  });
}

export function listStoryFiles(storiesDir) {
  if (!existsSync(storiesDir)) return [];
  const out = [];
  for (const entry of readdirSync(storiesDir).sort()) {
    const full = join(storiesDir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isFile() && entry.endsWith(".md")) {
      out.push({ abs: full, rel: entry, slug: entry.replace(/\.md$/, "") });
      continue;
    }
    if (st.isDirectory()) {
      const readme = join(full, "README.md");
      if (existsSync(readme)) {
        out.push({ abs: readme, rel: `${entry}/README.md`, slug: entry });
      }
    }
  }
  return out;
}

// Every story belonging to one epic folder, `rel` given relative to that folder.
//
// Besides the two shapes above there is a third: a standalone story — one that
// has its own tracker key and no epic around it, filed as
// epics/<key>/story-<slug>.md with no stories/ subfolder. Callers address it by
// that path (ADRs link straight to it), so it is a real location, not a mistake
// to normalise away.

export function listEpicStories(epicDir) {
  const out = [];
  // epics/ holds loose files too (README, notes) — only folders are epics.
  try { if (!statSync(epicDir).isDirectory()) return out; } catch { return out; }
  for (const s of listStoryFiles(join(epicDir, "stories"))) {
    out.push({ abs: s.abs, rel: `stories/${s.rel}`, slug: s.slug });
  }
  for (const entry of readdirSync(epicDir).sort()) {
    if (!entry.startsWith("story-") || !entry.endsWith(".md")) continue;
    const full = join(epicDir, entry);
    try { if (!statSync(full).isFile()) continue; } catch { continue; }
    out.push({ abs: full, rel: entry, slug: entry.replace(/\.md$/, "") });
  }
  return out;
}

// A path inside the vault, relative to it, or null when it is not. Lexically
// or through the filesystem (macOS /var → /private/var, the same duality
// isInsideVault resolves); pathUnder() carries the separator and case rules.
function vaultRelPath(absPath, vaultPath) {
  if (!absPath || !vaultPath) return null;
  const lexical = pathUnder(absPath, vaultPath);
  if (lexical !== null) return lexical;
  return pathUnder(realPath(absPath), realPath(vaultPath));
}

// A story reference is stable across harnesses and machines: <epic>/<stem>.
// Understands every on-disk shape a story can take and passes an
// already-shaped reference straight through:
//   epics/<E>/stories/<s>.md          -> <E>/<s>
//   epics/<E>/stories/<s>/README.md   -> <E>/<s>          (folder-shape story)
//   epics/<E>/story-<s>.md            -> <E>/story-<s>    (standalone story)
//   <E>/<stem>                        -> itself, checked against the vault
//                                         when one is bound (a typo fails
//                                         here rather than entering a
//                                         permanent record)
export function storyRefOf(pathOrRef, vault) {
  const raw = String(pathOrRef || "");
  if (vault) {
    const rel = vaultRelPath(resolve(raw), vault);
    const m = rel && rel.match(/^epics\/([^/]+)\/(.+)$/);
    if (m) {
      const story = listEpicStories(join(vault, "epics", m[1])).find((s) => s.rel === m[2]);
      if (story) return `${m[1]}/${story.slug}`;
    }
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(raw)) return null;
  if (!vault) return raw;
  return storyPathOf(raw, vault) ? raw : null;
}

// The inverse of storyRefOf: <epic>/<stem> back to the story's absolute path,
// whichever of the three shapes it is actually filed under.
export function storyPathOf(ref, vault) {
  if (!ref || !vault) return null;
  const [epicId, stem] = String(ref).split("/");
  if (!epicId || !stem) return null;
  const story = listEpicStories(join(vault, "epics", epicId)).find((s) => s.slug === stem);
  return story ? story.abs : null;
}

// macOS puts the temp dir behind a symlink (/var → /private/var), and git runs
// merge drivers from the REAL worktree root while a config written elsewhere
// holds the symlinked spelling. Comparing those two as strings says a path
// inside the vault is outside it. Resolve both through the filesystem when it
// can answer; fall back to lexical resolution when the path does not exist yet.
export function realPath(p) {
  if (!p) return p;
  try { return realpathSync(resolve(p)); } catch { return resolve(p); }
}

// ─── is this path inside that directory? ───────────────────────────────
//
// The path from `base` to `p`: "" when they are the same path, null when `p`
// is somewhere else. Every caller used to spell this `p.startsWith(base + "/")`,
// which is false for EVERY path on Windows, where the same paths are spelled
// with `\`. Measured on a Windows 11 VM during WP-18's verification pass:
// `waypost story plan --write` refused to write a story plainly inside the
// vault, `doctor` offered to `git init` a vault the repository already
// versions (and `--fix` would have made a nested repository of it), and the
// merge driver called the vault's own kanban.md "not a derived view", leaving
// exactly the conflict markers ADR-0006 exists to remove.
//
// So: compare on `/`, and fold case where the filesystem itself does — `Y:\x`
// and `y:\x` are one path on Windows and two on Linux. What comes back is
// always `/`-spelled, which is how every path relative to the vault is written.
export function pathUnder(p, base, { platform = process.platform } = {}) {
  if (!p || !base) return null;
  const norm = (s) => String(s).replace(/\\/g, "/").replace(/\/+$/, "");
  const a = norm(p);
  const b = norm(base);
  const fold = platform === "win32" ? (s) => s.toLowerCase() : (s) => s;
  if (fold(a) === fold(b)) return "";
  return fold(a).startsWith(fold(b) + "/") ? a.slice(b.length + 1) : null;
}

export function isInsideVault(filePath, vaultPath) {
  if (!filePath || !vaultPath) return false;
  // Lexically OR through the filesystem: a path that does not exist (a deleted
  // file in an activity log) cannot be realpath'd, and a path that does can be
  // spelled two ways (macOS /var → /private/var). Accepting either answer is
  // the only form that is right in both cases.
  return pathUnder(filePath, vaultPath) !== null
    || pathUnder(realPath(filePath), realPath(vaultPath)) !== null;
}

// Every story file in the vault, whatever shape it takes. Deliberately
// synchronous: readdir/stat never materialize an iCloud-evicted file, so
// enumeration cannot block — only reading contents can. One lister, shared by
// both adapters; a parallel async copy would drift.
export function listVaultStoryFiles(vaultPath) {
  const out = [];
  const epicsDir = join(vaultPath, "epics");
  let entries;
  try { entries = readdirSync(epicsDir).sort(); } catch { return out; }
  for (const e of entries) {
    for (const s of listEpicStories(join(epicsDir, e))) out.push(s.abs);
  }
  return out;
}

// Newest mtime across the vault's markdown, ms, or null for an empty vault.
// `stat` does not materialize a dataless file, so unlike a frontmatter sweep
// this cannot block on an iCloud download. Advisory by nature: a sync that
// rewrites mtimes can only make the caller quieter, never noisier.
export function lastVaultActivityMs(vaultPath) {
  let newest = 0;
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue; // .projectstore/, .obsidian/, .git/
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".md")) {
        try {
          const m = statSync(p).mtimeMs;
          if (m > newest) newest = m;
        } catch {}
      }
    }
  };
  walk(vaultPath);
  return newest || null;
}

