// waypost (Waypost) — shared helpers used by the CLI and rules.
// Pure node, no external deps. Keep these helpers dependency-free
// so a repo checkout does not require npm install.
//
// Harness-agnostic by design: every harness (Claude Code, Codex, OpenCode)
// resolves the project root and the tool root the same way. The Claude Code
// plugin env vars (CLAUDE_PROJECT_DIR / CLAUDE_PLUGIN_ROOT) are honoured as
// fallbacks so the same scripts can also run as an optional Claude plugin.

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, rmSync, realpathSync } from "node:fs";
import { join, dirname, resolve, relative, isAbsolute, sep } from "node:path";
import { pluginRoot } from "./lib-resources.mjs";
export { pluginRoot, loadLayout, folderByKind, loadTemplate, renderTemplate } from "./lib-resources.mjs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
export { isLegacyNumberedId, slugIdentity, storyMatchesEntry, legalArtifactName, displayNumberOf, compareArtifactOrder, findSlugCollision } from "./lib-identity.mjs";
export { listEpicDirs, listStoryFiles, listEpicStories, storyRefOf, storyPathOf, realPath, pathUnder, isInsideVault, listVaultStoryFiles, lastVaultActivityMs } from "./lib-vault-files.mjs";
export { parseFrontmatter, listOf, refsOf } from "./lib-frontmatter.mjs";
export { vaultConfigPath, readVaultConfig, selfInstallOff, writeVaultConfig, isLegacyStory } from "./lib-vault-policy.mjs";
export { gatherVaultFacts } from "./lib-vault-facts.mjs";
export { slugify, nextNumber } from "./lib-artifact-names.mjs";
export { sessionIdFlag, sessionId } from "./lib-session-identity.mjs";
export { buildNodeIndex } from "./lib-node-index.mjs";
export { stripCodeSpans, extractLinks, resolveLinkTarget } from "./lib-links.mjs";
export { PURPOSE_CELL, TITLE_CELL, PATH_CELL, INFLIGHT_CAP, ERROR_CELL, truncEnd, truncFront, folderPurpose, renderVaultSkeleton } from "./lib-skeleton.mjs";

// ─── Paths ─────────────────────────────────────────────────────────────

// The project being managed. Prefer the harness-neutral WAYPOST_PROJECT_DIR,
// falling back to the cwd (and, for a Claude plugin install, to
// CLAUDE_PROJECT_DIR — AgentWorkflow compatibility).
export function projectRoot() {
  return process.env.WAYPOST_PROJECT_DIR
    || process.env.CLAUDE_PROJECT_DIR
    || process.cwd();
}

// The project-local config. Cannonical location is .waypost/projectstore.json;
// a legacy .claude/projectstore.json is honoured for a Claude installing the
// optional plugin layer.
export function configPath() {
  const root = projectRoot();
  const waypost = join(root, ".waypost", "projectstore.json");
  if (existsSync(waypost) || process.argv.includes("--no-legacy-config")) return waypost;
  return join(root, ".claude", "projectstore.json");
}

export { machineStateDir, ensureMachineStateDir, legacyDirsToMove, legacyStateDirs, legacyStateView, stateWriteHint, REMOVING_DIR, readCleanupSetting, LIMIT_WRITER, accountStateDir, stricterLimit, readLastAutoCleanup } from "./lib-machine-state.mjs";

// True when `a` and `b` name the same tree, or one is an ancestor of the
// other, in either direction — used both for "does a live heavy job overlap
// this project" (capacity.mjs's blockingHolder) and for "is this the same
// checkout" (presence.mjs's sharedTree, with `contain: true`). Separators
// are folded to "/" first (a Windows path compared against a POSIX one is
// otherwise never equal to itself), and case is folded only on the platforms
// whose own filesystems already do that — darwin and win32 — the same rule
// refusePath (scripts/cleanup.mjs) and pathUnder above already use. Neither
// path is resolved against the filesystem here: a caller wanting real paths
// (a symlinked checkout, a case-preserving alias) resolves them first, the
// way refusePath's own callers already do.
export function treesOverlap(a, b, { platform = process.platform } = {}) {
  const fold = platform === "darwin" || platform === "win32";
  const norm = (p) => {
    let s = String(p || "").replace(/\\/g, "/");
    if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
    return fold ? s.toLowerCase() : s;
  };
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.startsWith(nb + "/") || nb.startsWith(na + "/");
}

// `~` is only expanded by an interactive shell — a harness that spawns us
// directly (spawn/execFile with an argv array, no shell in between) passes it
// through literally. One helper, reused everywhere a path arrives from argv
// rather than from a shell (bind's vault argument, --project, --home).
export function expandHome(p) {
  return String(p).replace(/^~(?=\/|$)/, process.env.HOME || "~");
}

// A CLI piped into `head` gets its stdout closed under it. Node's default is
// an unhandled 'error' event and a stack trace on a perfectly ordinary shell
// idiom, so every entry point silences EPIPE and exits quietly instead.
export function ignoreEpipe() {
  for (const stream of [process.stdout, process.stderr]) {
    stream.on("error", (e) => {
      if (e && e.code === "EPIPE") process.exit(0);
      throw e;
    });
  }
}

// ─── Config ────────────────────────────────────────────────────────────

// null means "not bound yet" (waypost bind is the right next step) — a caller
// must never conflate that with "bound, but the config is corrupt", which
// needs a loud failure instead: silently treating a broken config as unbound
// invites `waypost setup` to rebind over it, discarding whatever settings the
// file still held (upstream ADR-007 gap).
// The vault path as the config stores it: relative to the project root when
// the vault lives inside the project, absolute otherwise. The config file is
// machine-local by contract, but on a checkout shared between machines it is
// physically one file for all of them (ADR-0007 addendum), and one machine's
// absolute path is another machine's "vault missing". `readConfig` resolves
// the relative form against THIS machine's project root; `writeConfig`
// re-relativises on every save, so a config written absolute by an earlier
// version migrates the first time the tool touches it.
export function storedVaultPath(abs) {
  const rel = relative(projectRoot(), abs);
  if (rel === "") return ".";
  if (rel.startsWith("..") || isAbsolute(rel)) return abs;
  return rel.split(sep).join("/");
}

export function resolveVaultPath(p) {
  return typeof p === "string" && p && !isAbsolute(p) ? resolve(projectRoot(), p) : p;
}

// ─── The repository behind the project (ADR-0010) ──────────────────────
//
// `git rev-parse --path-format=absolute --git-common-dir` names the one .git
// directory every worktree of a repository shares (measured 2026-09-04: the
// same answer from the root, from a subdirectory and from a linked worktree; a
// bare repository answers its own path, which is why --is-bare-repository is
// asked in the same breath). Spawned with cwd = the project root, never the
// caller's directory. null means "no repository here": no git, a bare one, or
// a directory outside any checkout — and every caller falls back to the
// ADR-0007 shape.
const _common = new Map();
export function gitCommonDir(root = projectRoot()) {
  if (_common.has(root)) return _common.get(root);
  let out = null;
  try {
    const r = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir", "--is-bare-repository"],
      { cwd: root, encoding: "utf8", timeout: 5000 });
    if (r.status === 0) {
      const [dir, bare] = String(r.stdout).trim().split(/\r?\n/);
      if (dir && bare !== "true") out = dir.replace(/\\/g, "/").replace(/\/+$/, "");
    }
  } catch { /* no git: no repository */ }
  _common.set(root, out);
  return out;
}

export function mainWorktree(root = projectRoot()) {
  const c = gitCommonDir(root);
  return c ? dirname(c) : null;
}

// Compared as real paths: git answers /private/var/… where macOS's mkdtemp
// says /var/…, and a symlinked checkout must not read as a foreign worktree.
const samePath = (a, b) => {
  const real = (p) => { try { return realpathSync(p); } catch { return String(p); } };
  const norm = (p) => real(p).replace(/\\/g, "/").replace(/\/+$/, "");
  return norm(a) === norm(b);
};

// A linked worktree: the project root is a worktree of a repository whose
// main working copy is elsewhere.
export function isLinkedWorktree(root = projectRoot()) {
  const m = mainWorktree(root);
  return Boolean(m) && !samePath(m, root);
}

// Six characters that name this worktree and nothing else on this machine:
// what qualifies a session id that arrived from the environment, so two live
// worktrees never share one presence record (ADR-0010).
export function worktreeTag(root = projectRoot()) {
  let real = root;
  try { real = realpathSync(root); } catch {}
  return createHash("sha256").update(String(real)).digest("hex").slice(0, 6);
}

// Where the binding comes from: this project's own .waypost/, or, in a linked
// worktree that has none, the main worktree's — its relative vault_path then
// resolves against THIS worktree, so each worktree works on its own files
// while sharing coordination. `waypost setup` in a linked worktree is
// unnecessary by design.
export function bindingInfo() {
  const own = configPath();
  if (existsSync(own)) return { path: own, inherited_from: null };
  if (isLinkedWorktree()) {
    const main = mainWorktree();
    for (const c of [join(main, ".waypost", "projectstore.json"), join(main, ".claude", "projectstore.json")]) {
      if (existsSync(c)) return { path: c, inherited_from: main };
    }
  }
  return { path: own, inherited_from: null };
}

// WAYPOST_VAULT names a vault directly, with no binding needed. Internal:
// `doctor --vault <path>` sets it in its own process so every generator it
// spawns compares against the same vault. It wins over a binding's vault_path;
// layout and language come from the binding when there is one, else
// engineering / en (a non-English vault checked with no binding reads as stale
// views — red, never a false green).
export function readConfig() {
  const p = bindingInfo().path;
  const direct = process.env.WAYPOST_VAULT;
  if (!existsSync(p)) return direct ? { layout: "engineering", vault_path: resolve(direct) } : null;
  try {
    const cfg = JSON.parse(readFileSync(p, "utf8"));
    if (cfg && typeof cfg === "object") {
      cfg.vault_path = direct ? resolve(direct) : resolveVaultPath(cfg.vault_path);
      if (direct && !cfg.layout) cfg.layout = "engineering";
    }
    return cfg;
  } catch (e) {
    process.stderr.write(`waypost: config exists but is unreadable: ${p}: ${e.message}\n`);
    process.exit(1);
  }
}

export function writeConfig(cfg) {
  // A config read under WAYPOST_VAULT carries that vault, not the binding's:
  // writing it back would silently rebind the project.
  if (process.env.WAYPOST_VAULT) throw new Error("WAYPOST_VAULT is set: refusing to write the project binding through a borrowed vault path");
  // A linked worktree that inherits its binding writes back to the binding
  // it inherited: one repository, one binding.
  const p = bindingInfo().path;
  mkdirSync(dirname(p), { recursive: true });
  const out = cfg && typeof cfg.vault_path === "string" && cfg.vault_path
    ? { ...cfg, vault_path: storedVaultPath(cfg.vault_path) } : cfg;
  writeFileSync(p, JSON.stringify(out, null, 2) + "\n", "utf8");
}

export { writeFileAtomic, hostTag } from "./lib-atomic-write.mjs";

// ─── Heading / keyword registry (PS-SPEC story-002) ────────────────────
//
// scaffold/headings.json is the language-independent registry of the section
// headings, inline keywords and index-table column names the deterministic
// scripts (doctor / reconcile / story-section) must recognize. Per id, per
// language, an ARRAY of accepted forms; the FIRST form of the configured
// language is the canonical form used when WRITING. Matching always accepts
// every registered form of every language — a ru-headed file in an en-bound
// vault must still lint.

let _headingsCache = null;

export function loadHeadingsRegistry() {
  if (_headingsCache) return _headingsCache;
  const p = join(pluginRoot(), "scaffold", "headings.json");
  try {
    _headingsCache = JSON.parse(readFileSync(p, "utf8"));
  } catch (e) {
    throw new Error(`heading registry missing or unreadable (${p}): ${e.message}`);
  }
  return _headingsCache;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function allForms(section, id) {
  const entry = loadHeadingsRegistry()[section]?.[id];
  if (!entry) throw new Error(`headings.json has no ${section} entry "${id}"`);
  return Object.values(entry).flat();
}

// Canonical write form for the configured language (en fallback).
export function heading(id, lang = "en") {
  const entry = loadHeadingsRegistry().headings?.[id];
  if (!entry) throw new Error(`headings.json has no headings entry "${id}"`);
  return (entry[lang] || entry.en)[0];
}

// Matches a `## <heading>` line in any registered language, case-insensitively
// (hand-typed `## критерии приёмки` still matches). Anchored to the full line
// so "Acceptance" never matches "Acceptance Criteria".
export function headingLineRe(id) {
  const forms = allForms("headings", id).map(escapeRe);
  return new RegExp(`^##\\s+(?:${forms.join("|")})\\s*$`, "mi");
}

// Extract the body of section `id`: text between its heading line and the
// next `## ` heading (or end of file). Returns null when the section is absent.
export function sectionOf(body, id) {
  const m = body.match(headingLineRe(id));
  if (!m) return null;
  const rest = body.slice(m.index + m[0].length);
  const next = rest.search(/^## /m);
  return next === -1 ? rest : rest.slice(0, next);
}

export function keywordRe(id) {
  const forms = allForms("keywords", id).map(escapeRe);
  return new RegExp(`(?:${forms.join("|")})`, "i");
}

// The two inline grammars built from a keyword plus a colon: the evidence suffix
// on a checked acceptance criterion, and the story attribution on a spec
// acceptance item. Both live here rather than inline at their call sites so the
// gate and its tests cannot drift, and both accept the CJK-width colon — a zh
// vault writes `— 证据：<test>` and `— stories：PS-X/story-foo`, and a full-width
// colon must not read as the marker being absent.
export function evidenceSuffixRe() {
  return new RegExp(`[—–-]\\s*${keywordRe("evidence").source}\\s*[:：]`, "i");
}

export function storiesAttributionRe() {
  return new RegExp(`[—–-]\\s*${keywordRe("stories").source}\\s*[:：]\\s*(.+)$`, "i");
}

// The body footer (`*Last updated: 2026-01-01*`) is content rather than a heading,
// but the lifecycle gates keep it in step with frontmatter `updated:`. Matching
// accepts every registered language; the rewrite preserves the file's OWN prefix
// verbatim through capture group 1, so a locale's punctuation convention — fr
// writes `… : `, zh writes `…：` — survives without the writer needing to know
// which locale it is looking at, and a hand-mixed vault keeps each file's form.
export function footerDateRe() {
  const forms = allForms("footers", "last_updated").map(escapeRe);
  return new RegExp(`^(\\*(?:${forms.join("|")})\\s*[:：]\\s*).*(\\*)$`, "mi");
}

// The `| **Status** | value |` row of a story's field table, in any registered
// language (the label is the index column's), so story-section can keep it in
// step with frontmatter: a reader who never sees the frontmatter — a rendered
// page — used to be told "planned" about a story that was closed months ago.
export function statusCellRe() {
  const forms = allForms("index_columns", "status").map(escapeRe);
  return new RegExp(`^(\\|\\s*\\*\\*(?:${forms.join("|")})\\*\\*\\s*\\|\\s*)[^|\\n]*?(\\s*\\|\\s*)$`, "mi");
}

// Matches a folder-README index header row in any registered language,
// in the standard 4-column form: | File | Title | Status | Date |
//
// End-anchored on purpose: a header carrying extra hand-added columns
// (`| File | Title | Status | Date | Notes |`) is NOT this table. Without the
// anchor it prefix-matched, and rebuildIndexRows then rewrote every managed
// row to the registered four columns — silently destroying the extra cells,
// which are human-owned content no regeneration can recompute. Unanchored,
// doctor's index-header check could not fire either (the header "matched"),
// so the loss had no detector at all. Anchored, both halves behave as
// documented: reconcile reports the index unusable and doctor warns.
export function indexHeaderRe() {
  const cols = ["file", "title", "status", "date"].map((c) =>
    allForms("index_columns", c).map(escapeRe).join("|"));
  return new RegExp(
    `^\\|\\s*(?:${cols[0]})\\s*\\|\\s*(?:${cols[1]})\\s*\\|\\s*(?:${cols[2]})\\s*\\|\\s*(?:${cols[3]})\\s*\\|\\s*$`);
}

export { escCell, unescCell } from "./lib-markdown-cells.mjs";

export function today() {
  return new Date().toISOString().slice(0, 10);
}

// Full ISO-8601 UTC timestamp — for story lifecycle fields (started_at /
// closed_at / plan_updated_at) and spec_policy_since, which must be strictly
// comparable and need sub-day resolution (diff-refs anchors git --since on
// them). Deliberately finer-grained than the date-only created:/updated:.
export function nowIso() {
  return new Date().toISOString();
}

export { sessionsDir, sessionFilePath, ensureSessionsDir, writeSession, touchSession, cleanupStaleSessions } from "./lib-legacy-sessions.mjs";

// ─── Source-path classification ────────────────────────────────────────
//
// Which project paths count as "work on the codebase". Lifted out of
// diff-refs.mjs so doctor and diff-refs cannot drift apart.

// Generated, vendored or machine-local paths — never a source file for any
// consumer. Lifted out of diff-refs.mjs so the hook, doctor and diff-refs
// cannot drift apart (contract 1).
export const SOURCE_IGNORE = [
  /(^|\/)package-lock\.json$/, /(^|\/)yarn\.lock$/, /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)Cargo\.lock$/, /(^|\/)node_modules\//, /(^|\/)dist\//, /(^|\/)build\//,
  // Harness wiring, not source: .waypost/ is the bind + runtime state, and the
  // three harness directories hold generated role files (`waypost agents install`).
  /(^|\/)\.claude\//, /(^|\/)\.waypost\//, /(^|\/)\.opencode\//, /(^|\/)\.codex\//,
  /\.min\.(js|css)$/,
];

// The entry-rule counter ignores strictly more than the base set, and the
// difference is deliberate rather than an oversight of one or the other.
// waypost bind writes these three itself, in a session that by
// construction has no story open — counting them makes the plugin nag about its
// own setup. They must NOT join SOURCE_IGNORE: an edit to AGENTS.md is a real
// code reference (the PS-AGENTS epic already lists it), and folding these into
// the shared set would silently drop it from every proposed code_refs.
// Root-anchored, unlike the patterns above: a monorepo's nested AGENTS.md is
// ordinary source and must still count.
export const ENTRY_IGNORE = [
  ...SOURCE_IGNORE,
  /^AGENTS\.md$/, /^CLAUDE\.md$/, /^opencode\.json$/, /^\.gitignore$/,
  // `doctor --fix` (and therefore `setup`) writes the line-ending policy and the
  // merge-driver attributes: the tool's own first-run output, not source.
  /^\.gitattributes$/,
];

// The single open-story predicate (contract 5), as a pure core: it decides from
// already-loaded frontmatter and performs no I/O, so doctor feeds it the
// artifact scan it already performs while the hook feeds it a budgeted read —
// one definition, and therefore no way for the two to disagree about the same
// vault. `planned` is deliberately not open: writing code against a story that
// never went through waypost story plan is itself the order being skipped.
export function openStoryFrom(storyFrontmatters) {
  return (storyFrontmatters || []).some((fm) => fm && fm.status === "in-progress");
}

export { askYesNo } from "./lib-terminal-prompt.mjs";
