// waypost — item and cache measurement, shared by the scanner and rechecks.
import { readdirSync, lstatSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { homedir } from "node:os";
import { loadRegistry, resolveCachePaths } from "./toolchains.mjs";

const EMPTY_SET = new Set();

// The OS metadata names the registry's `system` entry lists (".DS_Store",
// a Windows thumbnail cache file, a Windows folder-settings file) — read
// once per scan and passed down to every age computation below, so a
// metadata file's own timestamp never makes an otherwise-idle item look
// freshly touched.
export function metadataNamesOf(entries) {
  const sys = entries.find((e) => e.id === "system");
  return new Set(Array.isArray(sys && sys.metadata_names) ? sys.metadata_names : []);
}

function sizeOf(st) {
  return process.platform === "win32" ? st.size : st.blocks * 512;
}

function entryAgeMs(st) {
  return Math.max(st.mtimeMs, st.ctimeMs);
}

// ─── byte summation + age/identity/readability inside one matched item ──
//
// Pure lstat, no symlink is ever resolved or descended into — its own
// allocation is counted and nothing more, which is also what keeps a
// symlink cycle from ever being followed here. `seen` is shared across the
// whole scan (every matched directory), so two hard links anywhere in the
// scan are counted once, the way `du` counts them. Alongside bytes, this
// also reports: `newest_ms` (the newest of mtime/ctime over the item's own
// root and every entry inside it, a name in `metadataNames` never moving
// it); `nested_git` (a `.git` file or directory found directly inside any
// directory this walk entered — the item's own subtree holds a nested
// repository or worktree); `unreadable` (a readdir or lstat failure inside
// the item was swallowed rather than surfaced); `other_fs` (an entry
// anywhere inside the item lives on a different device than the item's own
// root — a filesystem mounted inside it, which a recursive removal would
// cross); and the item's own root identity (`dev`/`ino`), read once, for a
// re-check to compare against later without re-walking the whole tree.
//
// Options (the amended ADR, the automatic path only — every default below
// reproduces today's behaviour exactly, so `waypost size`/`waypost clean`'s
// own manual plan is untouched): `stopAtGit` never enters a directory that
// itself holds a nested repository's own marker — its children are not even
// listed, let alone summed, rather than walked in and merely tagged;
// `keepSuffixes` reports `holds_package`/`package` — whether any entry this
// same walk already visits carries a name ending in one of the suffixes the
// `system` registry entry's own list names (compared case-insensitively),
// and which one; `deadline` (an absolute ms clock reading, checked every 512
// entries so the check itself stays cheap) stops the walk where it stands,
// reported the same way a budget cut already is (`partial: true`).
function hasKeepSuffix(name, suffixes) {
  if (!suffixes || !suffixes.size) return false;
  const lower = String(name).toLowerCase();
  for (const suf of suffixes) if (lower.endsWith(suf)) return true;
  return false;
}

function dirBytes(root, seen, budgetLeft, metadataNames = EMPTY_SET, { stopAtGit = false, keepSuffixes = EMPTY_SET, deadline = null } = {}) {
  let bytes = 0;
  let visited = 0;
  let partial = false;
  let unreadable = false;
  let nestedGit = false;
  let otherFs = false;
  let newestMs = null;
  let holdsPackage = false;
  let packageName = null;
  let rst;
  try { rst = lstatSync(root); }
  catch {
    return {
      bytes: 0, visited: 0, partial: false, unreadable: true, nested_git: false, other_fs: false,
      newest_ms: null, dev: null, ino: null, holds_package: false, package: null,
    };
  }
  visited++;
  const dev = rst.dev;
  const ino = rst.ino;
  const rootKey = `${dev}:${ino}`;
  if (!seen.has(rootKey)) { seen.add(rootKey); bytes += sizeOf(rst); }
  if (!metadataNames.has(basename(root))) newestMs = entryAgeMs(rst);

  const cut = () => ({
    bytes, visited, partial: true, unreadable, nested_git: nestedGit, other_fs: otherFs,
    newest_ms: newestMs, dev, ino, holds_package: holdsPackage, package: packageName,
  });

  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let names;
    try { names = readdirSync(dir); } catch { unreadable = true; continue; }
    // A .git entry directly inside a visited directory means this item's own
    // subtree holds a nested repository (or a worktree's link back to one) —
    // read for free off the listing the walk below already fetched.
    const dirHasGit = names.includes(".git");
    if (dirHasGit) nestedGit = true;
    // stopAtGit: once a directory is itself a nested repository's own root,
    // its children are never entered at all — "never enter", not "enter and
    // tag" — so the automatic path can never touch, or even list, whatever a
    // nested worktree holds.
    if (stopAtGit && dirHasGit) continue;
    for (const name of names) {
      if (budgetLeft != null && visited >= budgetLeft) return cut();
      if (deadline != null && visited > 0 && visited % 512 === 0 && Date.now() > deadline) return cut();
      const p = join(dir, name);
      let st;
      try { st = lstatSync(p); } catch { visited++; unreadable = true; continue; }
      visited++;
      if (!metadataNames.has(name)) {
        const age = entryAgeMs(st);
        if (newestMs == null || age > newestMs) newestMs = age;
      }
      if (!holdsPackage && hasKeepSuffix(name, keepSuffixes)) { holdsPackage = true; packageName = name; }
      if (st.dev !== dev) otherFs = true;
      const key = `${st.dev}:${st.ino}`;
      if (seen.has(key)) continue;
      seen.add(key);
      bytes += sizeOf(st);
      if (st.isDirectory() && !st.isSymbolicLink()) stack.push(p);
    }
  }
  return {
    bytes, visited, partial, unreadable, nested_git: nestedGit, other_fs: otherFs,
    newest_ms: newestMs, dev, ino, holds_package: holdsPackage, package: packageName,
  };
}

// One absolute path, in isolation: the same facts a matched item carries out
// of the walk above, with no budget and no dedup against any other item —
// for a re-check right before a later removal step touches anything, and for
// tests that want one item's facts without a whole project scan.
export function inspectDir(abs, { metadata = EMPTY_SET, stopAtGit = false, keepSuffixes = EMPTY_SET, deadline = null } = {}) {
  let st;
  try { st = lstatSync(abs); } catch { return { exists: false }; }
  if (st.isSymbolicLink()) return { exists: true, is_directory: false, is_symlink: true };
  if (!st.isDirectory()) return { exists: true, is_directory: false, is_symlink: false };
  const r = dirBytes(abs, new Set(), null, metadata, { stopAtGit, keepSuffixes, deadline });
  return {
    exists: true, is_directory: true, is_symlink: false,
    bytes: r.bytes, newest_ms: r.newest_ms, nested_git: r.nested_git, other_fs: r.other_fs,
    unreadable: r.unreadable, dev: r.dev, ino: r.ino, holds_package: r.holds_package, package: r.package,
  };
}


// ─── scanGlobal ──────────────────────────────────────────────────────────
//
// Split into two pure(r) steps: cacheCandidates resolves WHICH paths and
// their policy (no filesystem measurement beyond what resolving one needs
// — a trailing "*" expansion's own directory listing, or, with a profile,
// none at all); measureCaches stats and sums whichever of those exist. The
// registry's own policy (`clean`/`regenerable`/…) always comes from the
// CURRENT registry passed in here, never from a profile — a profile holds
// facts only (see below).
//
// `profile` (WP-17, the discovery story): when bin/waypost has a fresh
// machine profile for this host, its own `caches` are measured directly —
// no resolveCachePaths, no re-asking. But a profile holds facts, not policy
// (ADR Decision 2): it carries only { tool, item, path, source, ask_note? },
// so `clean`/`confidence`/`docs`/`notes`/`regenerable`/`manual`/`clean_argv`/
// `clean_docs`/`stale_days` are read back from the CURRENT `registry` at
// measurement time, matched by (tool, item) — `item` is the cache item's own
// raw path template, a stable key regardless of how it resolved. This is
// what keeps a fixed `regenerable` or `clean` in the registry visible to
// `size --global` at once, never stale for up to 30 days waiting on the next
// profile refresh. A profile item whose (tool, item) no longer matches
// anything in the current registry — the entry or that exact cache item was
// removed or renamed — is not measured; the caller sees this via the
// returned array's own `.dropped` count (an extra own property on the
// array, not a fourth output shape: `JSON.stringify` and a plain `for…of`
// both only ever see the indexed elements, so every existing consumer of
// "scanGlobal returns an array of measured caches" is unaffected — only a
// caller that deliberately reads `.dropped`, or a whole-object comparison
// like `assert.deepEqual`, ever sees it). Without a profile, today's path
// (the registry's own env/default resolution) runs unchanged.
export function cacheCandidates({ home = homedir(), env = process.env, platform = process.platform, registry = null, profile = null } = {}) {
  let candidates;
  let dropped = 0;
  if (profile) {
    // Item 7: a profile whose own `caches` is not an array (corrupt, or an
    // older shape) is not trusted at all — treated as empty rather than
    // thrown. bin/waypost's own freshness check already excludes this case
    // before ever calling scanGlobal with a profile; this is the same rule
    // enforced here too, since scanGlobal is a public function other
    // callers (tests, a future doctor check) may call directly.
    const items = Array.isArray(profile.caches) ? profile.caches : [];
    const reg = registry || loadRegistry({ projectRoot: process.cwd(), platform });
    const policy = new Map();
    for (const e of reg.entries) {
      for (const c of e.caches || []) {
        if (!Array.isArray(c.os) || !c.os.includes(platform)) continue;
        policy.set(`${e.id}::${c.path}`, {
          clean: c.clean, confidence: (c.confidence || {})[platform] || null,
          docs: c.docs ?? null, notes: c.notes ?? null, regenerable: c.regenerable ?? null,
          manual: c.manual === true, clean_argv: Array.isArray(c.clean_argv) ? c.clean_argv : null,
          clean_docs: c.clean_docs ?? null, stale_days: Number.isFinite(c.stale_days) ? c.stale_days : null,
        });
      }
    }
    candidates = [];
    for (const item of items) {
      const pol = policy.get(`${item.tool}::${item.item}`);
      if (!pol) { dropped++; continue; }
      candidates.push({ ...item, ...pol });
    }
  } else {
    // resolveCachePaths' own `base` already carries manual/clean_argv/
    // clean_docs/stale_days normalized the same way — nothing left to add.
    const reg = registry || loadRegistry({ projectRoot: process.cwd(), platform });
    candidates = resolveCachePaths(reg.entries, { home, env, platform });
  }
  candidates.dropped = dropped;
  return candidates;
}

// Stats and sums whichever candidates exist and are directories — read-only,
// dedup by (dev, ino) like every other summation in this module. `metadata`
// is the same OS-metadata-name set scanProject's age computation uses
// (metadataNamesOf), so a cache directory's own age is computed the same
// way an item's is.
export function measureCaches(candidates, { metadata = EMPTY_SET } = {}) {
  const seen = new Set();
  const out = [];
  for (const cand of candidates) {
    // Unlike the project walk, this list is curated and fixed, not an
    // arbitrary tree — /tmp itself is a symlink on macOS, and following one
    // top-level entry is safe. dirBytes below still never follows a symlink
    // it meets while recursing.
    let st;
    try { st = statSync(cand.path); } catch { continue; }
    if (!st.isDirectory()) continue;
    const r = dirBytes(cand.path, seen, null, metadata);
    out.push({
      path: cand.path, bytes: r.bytes, clean: cand.clean, tool: cand.tool, source: cand.source,
      // The cache item's own raw path template — a stable key back into the
      // CURRENT registry's exact cache definition (its `ask`, in particular)
      // for a caller that wants to re-ask the tool at removal time, the way
      // scanGlobal({ profile }) already matches a profile entry back to its
      // policy by (tool, item).
      item: cand.item ?? null,
      confidence: cand.confidence, docs: cand.docs, notes: cand.notes, regenerable: cand.regenerable ?? null,
      manual: cand.manual === true, clean_argv: cand.clean_argv ?? null, clean_docs: cand.clean_docs ?? null,
      stale_days: cand.stale_days ?? null, newest_ms: r.newest_ms, unreadable: r.unreadable, other_fs: r.other_fs,
      dev: r.dev, ino: r.ino,
    });
  }
  out.dropped = candidates.dropped || 0;
  return out;
}

export function scanGlobal(opts = {}) {
  const platform = opts.platform || process.platform;
  const registry = opts.registry || loadRegistry({ projectRoot: process.cwd(), platform });
  const candidates = cacheCandidates({ ...opts, registry, platform });
  return measureCaches(candidates, { metadata: metadataNamesOf(registry.entries) });
}


export { dirBytes };
