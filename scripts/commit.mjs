#!/usr/bin/env node
// waypost — commit.mjs
// The commit protocol for work happening in several harnesses at once (ADR-0006).
//
// Three sessions in three harnesses on one repository produce three kinds of
// confusion: history that does not say who did what, derived views that collide
// in every merge, and two agents opening the same story. This command addresses
// the first and refuses to make the third worse; the merge driver
// (`waypost merge-derived`) handles the second.
//
// What a commit records, as git trailers — machine-readable, greppable with
// `git log --grep` or `git interpret-trailers`, and invisible to the prose:
//
//   Waypost-Harness:  claude         which harness the work happened in
//   Waypost-Session:  mbp-42311      which session, so parallel work is separable
//   Waypost-Story:    PS-1/story-x   the story it serves, when it serves one
//   Waypost-Provider: kimi           which model provider produced it, when the
//                                harness is pointed at one (DeepSeek, Kimi,
//                                GLM, MiniMax, DashScope…): the same harness
//                                behaves very differently behind a different
//                                model, and a reviewer six months later has no
//                                other way to know which one wrote this.
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
//      node commit.mjs --log [--story <id>] [--session <id>] [--harness <id>]
//                            [--provider <id>] [-n <count>]

import { existsSync, readFileSync } from "node:fs";
import { join, relative, basename } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  readConfig, projectRoot, ignoreEpipe, listVaultStoryFiles, parseFrontmatter,
  storyRefOf, storyPathOf as storyPathOfLib,
} from "./lib.mjs";
import { detectProvider } from "./agents.mjs";
import { sessionId, claimsOf, CLAIM_WINDOW_MS } from "./sessions.mjs";
import { readLeases, vaultRel } from "./presence.mjs";
import { runReconcile } from "./reconcile.mjs";

function die(msg) {
  process.stderr.write(`waypost commit: ${msg}\n`);
  process.exit(1);
}

function git(args, opts = {}) {
  return spawnSync("git", args, { cwd: projectRoot(), encoding: "utf8", timeout: 20000, ...opts });
}

// Which harness this session is running in. The registry knows the env vars
// each one sets; `WAYPOST_HARNESS` overrides, because detection by environment is
// best-effort by nature and a wrong label in the history is worse than none.
import { detectHarness } from "./agents.mjs";
export { detectHarness as detectSessionHarness };

// A story reference is stable across harnesses and machines: <epic>/<stem>,
// derived from the vault-relative path, never an absolute path. storyRefOf
// (lib.mjs) understands every on-disk shape a story can take; this wrapper
// adds the one thing specific to the commit protocol: a BARE id or stem with
// no epic prefix, resolved against every story in the vault so a typo fails
// here rather than becoming an unresolvable reference in the permanent record.
export function storyRef(pathOrId, cfg) {
  if (!pathOrId) return null;
  const vault = cfg && cfg.vault_path;
  const raw = String(pathOrId);
  const direct = storyRefOf(raw, vault);
  if (direct) return direct;
  if (!vault) return null;
  for (const abs of listVaultStoryFiles(vault)) {
    const ref = storyRefOf(abs, vault);
    if (!ref) continue;
    const stem = ref.split("/")[1];
    if (ref === raw || stem === raw || basename(raw).replace(/\.md$/, "") === stem) return ref;
  }
  return null;
}

export function storyPathOf(ref, cfg) {
  return storyPathOfLib(ref, cfg && cfg.vault_path);
}

export function composeMessage(subject, { harness: h, session, story, provider, coauthor }) {
  const trailers = [
    `Waypost-Harness: ${h}`,
    `Waypost-Session: ${session}`,
    ...(provider ? [`Waypost-Provider: ${provider}`] : []),
    ...(story ? [`Waypost-Story: ${story}`] : []),
    ...(coauthor ? [`Co-Authored-By: ${coauthor}`] : []),
  ];
  const body = subject.replace(/\s*$/, "");
  // git's actual rule (verified with `git interpret-trailers`): the trailer
  // block is the LAST PARAGRAPH, preceded by a blank line, and — for tokens
  // git does not itself recognise, like Waypost-* — consisting ENTIRELY of
  // `Key: value` lines (continuation lines starting with whitespace allowed).
  // The old "last line looks like a trailer" heuristic missed a bare `-m`
  // whose last paragraph is multi-line (e.g. a Claude-style
  // `Body\nCo-Authored-By: …` with no blank line before it), which merged our
  // trailers into that paragraph and made git drop the lot.
  const TRAILER = /^[A-Za-z0-9-]+: \S/;
  const paras = body.split(/\n[ \t]*\n/);
  const last = paras[paras.length - 1].split("\n");
  const endsInTrailerBlock = paras.length > 1 && last.every((l) => TRAILER.test(l) || /^\s+\S/.test(l));
  return `${body}\n${endsInTrailerBlock ? "" : "\n"}${trailers.join("\n")}\n`;
}

// Who else is live on this story right now. The session registry lives in the
// vault, so every harness bound to it sees the same answer — that shared file
// IS the coordination channel; there is no server.
export function conflicts(story, cfg, self) {
  if (!story || !cfg || !cfg.vault_path) return [];
  return claimsOf(cfg.vault_path, { windowMs: CLAIM_WINDOW_MS })
    .filter((c) => c.story === story && c.session !== self);
}

// Staged paths are repo-relative; leases are vault-relative. When the vault
// lives inside the repository the two describe the same files, and that is
// exactly the arrangement where two sessions collide.
export function leasesOverStaged(staged, cfg, self) {
  if (!cfg || !cfg.vault_path) return [];
  const proj = projectRoot();
  const inRepoVault = cfg.vault_path.startsWith(proj + "/") ? cfg.vault_path.slice(proj.length + 1) : null;
  const stagedRel = new Set();
  for (const f of staged) {
    stagedRel.add(f);
    if (inRepoVault && f.startsWith(inRepoVault + "/")) stagedRel.add(f.slice(inRepoVault.length + 1));
  }
  return readLeases(cfg.vault_path, { self })
    .filter((l) => l.live && !l.mine && stagedRel.has(l.path));
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
  if (!subject) die('a message is required: waypost commit -m "<what changed>" [--story <id>]');

  const self = sessionId();
  const h = detectHarness();
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
  // `.waypost/` is machine-local by contract (ADR-0004) and is excluded here
  // regardless of .gitignore: this very command writes the presence cache
  // before staging, and a project that never ran `doctor --fix` would
  // otherwise ship one machine's clock stamps to every clone.
  if (has("--all")) git(["add", "-A", "--", ".", ":!.waypost"]);
  if (has("--tracked")) git(["add", "-u"]);
  if (pathspec.length) git(["add", "--", ...pathspec]);
  const staged = stagedFiles();
  if (!staged.length) {
    die("nothing staged. Stage the change, or pass --all (everything not ignored, minus .waypost/) or -- <paths>.");
  }

  // A lease says another session is editing that file RIGHT NOW, possibly on
  // another device and another OS. Committing over it is how one agent's work
  // silently lands on top of another's half-finished change.
  const leased = leasesOverStaged(staged, cfg, self);
  if (leased.length && !has("--force")) {
    die("these files are leased by another live session:\n"
      + leased.map((l) => `       ${l.path} — ${l.session} on ${l.host} (${l.harness || "?"})\n`).join("")
      + "       Wait for them, or re-run with --force if you know they stopped.");
  }

  const message = composeMessage(subject, {
    harness: h, session: self, story, provider: detectProvider(),
    coauthor: (cfg && cfg.commit && cfg.commit.coauthor) || process.env.WAYPOST_COAUTHOR || null,
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
  const prov = detectProvider();
  process.stdout.write(`recorded ${sha}  harness=${h}${prov ? ` provider=${prov}` : ""} session=${self}`
    + `${story ? ` story=${story}` : ""}\n`);
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
    process.stderr.write(`waypost commit: ${unresolved.length} file(s) still conflict — resolve them, then run \`waypost commit -m "…"\`:\n`
      + unresolved.map((f) => `  ${f}\n`).join(""));
    process.exit(1);
  }
  if (r.status !== 0 && !existsSync(join(projectRoot(), ".git", "MERGE_HEAD"))) {
    process.exit(r.status || 1);
  }
  // Stage exactly what the merge produced: git's own merge result (already in
  // the index after --no-commit) plus the derived views reconcile had to
  // rewrite so the board matches the FINISHED worktree, not the mid-merge one.
  // Never `git add -A` here: the working tree can hold the user's own
  // uncommitted work in progress, unrelated to this merge, and staging it is
  // none of this command's business (G-8).
  const cfg = readConfig();
  if (cfg && cfg.vault_path) {
    let out;
    try { out = runReconcile({ write: true }); }
    catch (e) { die(`reconcile failed, so the derived views would land stale:\n${e.message}`); }
    const proj = projectRoot();
    const written = [out.kanban, out.codemap, out.graph, ...out.indexes]
      // Only paths inside THIS repo are ours to stage — a vault that lives
      // outside it (leasesOverStaged reasons about the same split) is not.
      .filter((t) => t && t.written && t.path && t.path.startsWith(proj + "/"))
      .map((t) => t.path);
    if (written.length) git(["add", "--", ...written]);
  }
  // Re-enter the normal path for the trailers and the claim/lease checks.
  // --no-reconcile: the derived views are already reconciled and staged above.
  const rest = ["-m", opt("-m") || opt("--message") || `merge ${ref}`, "--no-reconcile"];
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
    ["Waypost-Story", opt("--story")],
    ["Waypost-Session", opt("--session")],
    ["Waypost-Harness", opt("--harness")],
    ["Waypost-Provider", opt("--provider")],
  ].filter(([, v]) => v);
  const r = git(["log", `-n${Number(n) * (filters.length ? 20 : 1)}`,
    "--format=%h%x1f%an%x1f%ad%x1f%s%x1f%(trailers:key=Waypost-Harness,valueonly,separator=%x2c)"
    + "%x1f%(trailers:key=Waypost-Session,valueonly,separator=%x2c)%x1f%(trailers:key=Waypost-Story,valueonly,separator=%x2c)"
    + "%x1f%(trailers:key=Waypost-Provider,valueonly,separator=%x2c)",
    "--date=short"]);
  if (!r || r.status !== 0) die("git log failed — is this a repository with commits?");
  const rows = (r.stdout || "").split("\n").filter(Boolean).map((line) => {
    const [sha, author, date, subject, harness, session, story, provider] = line.split("\x1f");
    return { sha, author, date, subject, harness: harness.trim(), session: session.trim(),
      story: story.trim(), provider: (provider || "").trim() };
  }).filter((row) => filters.every(([k, v]) =>
    (k === "Waypost-Story" ? row.story
      : k === "Waypost-Session" ? row.session
      : k === "Waypost-Provider" ? row.provider : row.harness).includes(v)))
    .slice(0, Number(n));

  if (argv.includes("--json")) { process.stdout.write(JSON.stringify(rows, null, 2) + "\n"); return; }
  if (!rows.length) { process.stdout.write("no commits match\n"); return; }
  for (const row of rows) {
    const tag = [row.harness || "—", row.provider || null, row.story || null].filter(Boolean).join(" · ");
    process.stdout.write(`${row.sha}  ${row.date}  ${(tag).padEnd(34)} ${row.subject}\n`);
  }
  const untagged = rows.filter((r2) => !r2.harness).length;
  if (untagged) {
    process.stdout.write(`\n${untagged} of ${rows.length} carry no waypost trailers — committed outside \`waypost commit\`.\n`);
  }
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) main();
