#!/usr/bin/env node
// mps — commit.mjs
// The commit protocol for work happening in several harnesses at once (ADR-0006).
//
// Three sessions in three harnesses on one repository produce three kinds of
// confusion: history that does not say who did what, derived views that collide
// in every merge, and two agents opening the same story. This command addresses
// the first and refuses to make the third worse; the merge driver
// (`mps merge-derived`) handles the second.
//
// What a commit records, as git trailers — machine-readable, greppable with
// `git log --grep` or `git interpret-trailers`, and invisible to the prose:
//
//   Mps-Harness: claude          which harness the work happened in
//   Mps-Session: mbp-42311       which session, so parallel work is separable
//   Mps-Story:   PS-1/story-x    the story it serves, when it serves one
//
// Deliberately NOT enforced: the subject line's wording. A convention nobody
// can follow from a fourth harness is worse than none — a human writing the
// commit by hand only has to add the trailer lines.
//
// `--merge <ref>` exists for one reason: `git merge` auto-commits, and the
// derived views it writes mid-merge can be one artifact short (the merge driver
// re-derives from a worktree git has not finished checking out). Merging with
// --no-commit, reconciling, then committing puts the correct board in the merge
// commit itself instead of in a follow-up nobody remembers to make.
//
// CLI: node commit.mjs -m <msg> [--story <path|id>] [--all] [--force]
//                      [--all | --tracked] [--dry-run] [--no-reconcile] [-- <pathspec>…]
//      node commit.mjs --merge <ref> [-m <msg>]
//      node commit.mjs --log [--story <id>] [--session <id>] [--harness <id>] [-n <count>]

import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve, basename } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  readConfig, projectRoot, ignoreEpipe, listVaultStoryFiles, parseFrontmatter,
} from "./lib.mjs";
import { registry, harness } from "./agents.mjs";
import { sessionId, claimsOf } from "./sessions.mjs";

function die(msg) {
  process.stderr.write(`mps commit: ${msg}\n`);
  process.exit(1);
}

function git(args, opts = {}) {
  return spawnSync("git", args, { cwd: projectRoot(), encoding: "utf8", timeout: 20000, ...opts });
}

// Which harness this session is running in. The registry knows the env vars
// each one sets; `MPS_HARNESS` overrides, because detection by environment is
// best-effort by nature and a wrong label in the history is worse than none.
export function detectSessionHarness(env = process.env) {
  if (env.MPS_HARNESS) return env.MPS_HARNESS;
  for (const [id, h] of registry()) {
    if ((h.env || []).some((k) => env[k])) return id;
  }
  return "unknown";
}

// A story reference is stable across harnesses and machines: <epic>/<stem>,
// derived from the vault-relative path, never an absolute path.
export function storyRef(pathOrId, cfg) {
  if (!pathOrId) return null;
  const vault = cfg && cfg.vault_path;
  const raw = String(pathOrId);
  if (vault) {
    const abs = resolve(raw);
    if (abs.startsWith(vault + "/")) {
      const rel = abs.slice(vault.length + 1);
      const m = rel.match(/^epics\/([^/]+)\/stories\/(.+)\.md$/);
      if (m) return `${m[1]}/${m[2]}`;
    }
    // A bare id: resolve it against the vault so a typo fails here rather than
    // becoming an unresolvable reference in the permanent record.
    // listVaultStoryFiles yields absolute paths; relativize before matching.
    for (const p of listVaultStoryFiles(vault)) {
      const m = p.slice(vault.length + 1).match(/^epics\/([^/]+)\/stories\/(.+)\.md$/);
      if (!m) continue;
      const ref = `${m[1]}/${m[2]}`;
      const stem = m[2];
      if (ref === raw || stem === raw || basename(raw).replace(/\.md$/, "") === stem) return ref;
    }
  }
  // The shape alone is a reference ONLY when there is no vault to check it
  // against. With one bound, an unresolvable reference is a typo, and a typo in
  // a trailer is permanent — better a failed command than a dangling record.
  if (!vault && /^[\w.-]+\/[\w.-]+$/.test(raw)) return raw;
  return null;
}

export function storyPathOf(ref, cfg) {
  if (!ref || !cfg || !cfg.vault_path) return null;
  const p = join(cfg.vault_path, "epics", ref.split("/")[0], "stories", `${ref.split("/")[1]}.md`);
  return existsSync(p) ? p : null;
}

export function composeMessage(subject, { harness: h, session, story, coauthor }) {
  const trailers = [
    `Mps-Harness: ${h}`,
    `Mps-Session: ${session}`,
    ...(story ? [`Mps-Story: ${story}`] : []),
    ...(coauthor ? [`Co-Authored-By: ${coauthor}`] : []),
  ];
  const body = subject.replace(/\s*$/, "");
  // A trailer block must be its own paragraph, and must not merge into an
  // existing one — otherwise git stops recognising the whole block.
  const alreadyHasTrailers = /\n[A-Z][\w-]+: .+\s*$/.test(body);
  return `${body}\n${alreadyHasTrailers ? "" : "\n"}${trailers.join("\n")}\n`;
}

// Who else is live on this story right now. The session registry lives in the
// vault, so every harness bound to it sees the same answer — that shared file
// IS the coordination channel; there is no server.
export function conflicts(story, cfg, self) {
  if (!story || !cfg || !cfg.vault_path) return [];
  return claimsOf(cfg.vault_path, 30)
    .filter((c) => c.story === story && c.session !== self);
}

function stagedFiles() {
  const r = git(["diff", "--cached", "--name-only"]);
  return (r.stdout || "").split("\n").filter(Boolean);
}

function main() {
  ignoreEpipe();
  const argv = process.argv.slice(2);
  if (argv.includes("--log")) return log(argv);

  const mi = argv.indexOf("--merge");
  if (mi !== -1) return merge(argv, mi);

  const cfg = readConfig();
  const at = argv.indexOf("--");
  const pathspec = at === -1 ? [] : argv.slice(at + 1);
  const args = at === -1 ? argv : argv.slice(0, at);
  const opt = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
  const has = (name) => args.includes(name);

  if (!existsSync(join(projectRoot(), ".git"))) die("not a git repository");
  const subject = opt("-m") || opt("--message");
  if (!subject) die('a message is required: mps commit -m "<what changed>" [--story <id>]');

  const self = sessionId();
  const h = detectSessionHarness();
  const story = storyRef(opt("--story"), cfg);
  if (opt("--story") && !story) {
    die(`no story matches "${opt("--story")}" in the vault — pass its path, or <epic>/<story-stem>`);
  }

  // Another live session on the same story is the multi-harness failure this
  // command exists to surface: two agents closing one story from two places.
  const others = conflicts(story, cfg, self);
  if (others.length && !has("--force")) {
    die(`story ${story} is claimed by ${others.map((o) => `${o.session} (${o.harness || "?"}, last seen ${o.at})`).join(", ")}.\n`
      + "       Coordinate, or re-run with --force if you know they are done.");
  }

  // Derived views belong in the commit that caused them, not in a later
  // "regenerate" commit nobody can attribute.
  if (cfg && cfg.vault_path && !has("--no-reconcile")) {
    const r = spawnSync(process.execPath, [join(pluginDir(), "reconcile.mjs"), "--write"], {
      encoding: "utf8", env: process.env,
    });
    if (r.status !== 0) {
      die(`reconcile failed, so the derived views would land stale:\n${(r.stderr || r.stdout || "").trim()}`);
    }
  }

  // `--all` means everything not ignored, not `git commit -a` semantics: this
  // flow CREATES files (a drafted ADR, a new story), and a "commit everything"
  // that silently skips exactly those is a trap. `--tracked` is the narrow one.
  if (has("--all")) git(["add", "-A"]);
  if (has("--tracked")) git(["add", "-u"]);
  if (pathspec.length) git(["add", "--", ...pathspec]);
  if (!stagedFiles().length) {
    die("nothing staged. Stage the change, or pass --all (tracked files) or -- <paths>.");
  }

  const message = composeMessage(subject, {
    harness: h, session: self, story,
    coauthor: (cfg && cfg.commit && cfg.commit.coauthor) || process.env.MPS_COAUTHOR || null,
  });

  if (has("--dry-run")) {
    process.stdout.write(message + "\n--- would commit ---\n" + stagedFiles().map((f) => `  ${f}`).join("\n") + "\n");
    return;
  }

  const r = git(["commit", "-F", "-"], { input: message });
  process.stdout.write(r.stdout || "");
  if (r.status !== 0) {
    process.stderr.write(r.stderr || "");
    process.exit(r.status || 1);
  }
  const sha = (git(["rev-parse", "--short", "HEAD"]).stdout || "").trim();
  process.stdout.write(`recorded ${sha}  harness=${h} session=${self}${story ? ` story=${story}` : ""}\n`);
}

// Merge without committing, let the driver resolve the derived views, then
// reconcile and commit through the normal path so the trailers are there too.
function merge(argv, mi) {
  const ref = argv[mi + 1];
  if (!ref || ref.startsWith("--")) die("--merge takes a branch or commit to merge");
  const opt = (name) => { const i = argv.indexOf(name); return i === -1 ? null : argv[i + 1]; };
  const r = git(["merge", "--no-commit", "--no-ff", ref]);
  process.stdout.write(r.stdout || "");
  if (r.stderr) process.stderr.write(r.stderr);
  const unresolved = (git(["diff", "--name-only", "--diff-filter=U"]).stdout || "").split("\n").filter(Boolean);
  if (unresolved.length) {
    process.stderr.write(`mps commit: ${unresolved.length} file(s) still conflict — resolve them, then run \`mps commit -m "…"\`:\n`
      + unresolved.map((f) => `  ${f}\n`).join(""));
    process.exit(1);
  }
  if (r.status !== 0 && !existsSync(join(projectRoot(), ".git", "MERGE_HEAD"))) {
    process.exit(r.status || 1);
  }
  // Re-enter the normal path: it reconciles first, so the board in the merge
  // commit is derived from the finished merge rather than from the middle of it.
  const rest = ["-m", opt("-m") || opt("--message") || `merge ${ref}`, "--all"];
  process.argv = [process.argv[0], process.argv[1], ...rest];
  main();
}

function pluginDir() {
  return join(fileURLToPath(new URL(".", import.meta.url)));
}

// ─── log ───────────────────────────────────────────────────────────────

function log(argv) {
  const opt = (name) => { const i = argv.indexOf(name); return i === -1 ? null : argv[i + 1]; };
  const n = opt("-n") || "20";
  const filters = [
    ["Mps-Story", opt("--story")],
    ["Mps-Session", opt("--session")],
    ["Mps-Harness", opt("--harness")],
  ].filter(([, v]) => v);
  const r = git(["log", `-n${Number(n) * (filters.length ? 20 : 1)}`,
    "--format=%h%x1f%an%x1f%ad%x1f%s%x1f%(trailers:key=Mps-Harness,valueonly,separator=%x2c)"
    + "%x1f%(trailers:key=Mps-Session,valueonly,separator=%x2c)%x1f%(trailers:key=Mps-Story,valueonly,separator=%x2c)",
    "--date=short"]);
  if (!r || r.status !== 0) die("git log failed — is this a repository with commits?");
  const rows = (r.stdout || "").split("\n").filter(Boolean).map((line) => {
    const [sha, author, date, subject, harness, session, story] = line.split("\x1f");
    return { sha, author, date, subject, harness: harness.trim(), session: session.trim(), story: story.trim() };
  }).filter((row) => filters.every(([k, v]) =>
    (k === "Mps-Story" ? row.story : k === "Mps-Session" ? row.session : row.harness).includes(v)))
    .slice(0, Number(n));

  if (argv.includes("--json")) { process.stdout.write(JSON.stringify(rows, null, 2) + "\n"); return; }
  if (!rows.length) { process.stdout.write("no commits match\n"); return; }
  for (const row of rows) {
    const tag = [row.harness || "—", row.story || null].filter(Boolean).join(" · ");
    process.stdout.write(`${row.sha}  ${row.date}  ${(tag).padEnd(34)} ${row.subject}\n`);
  }
  const untagged = rows.filter((r2) => !r2.harness).length;
  if (untagged) {
    process.stdout.write(`\n${untagged} of ${rows.length} carry no mps trailers — committed outside \`mps commit\`.\n`);
  }
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) main();
