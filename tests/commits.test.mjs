// waypost — the commit protocol for parallel harness sessions (ADR-0006):
// trailers, claims, and the merge driver that keeps derived views out of
// conflict resolution.
//   node --test tests/*.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { composeMessage, storyRef, detectSessionHarness } from "../scripts/commit.mjs";
import { storyRefOf, storyPathOf } from "../scripts/lib.mjs";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const Waypost = join(REPO, "bin", "waypost");

function waypost(proj, args, { harness = "claude", session = null, expectFail = false } = {}) {
  const r = spawnSync(process.execPath, [Waypost, ...args], {
    encoding: "utf8", cwd: proj, timeout: 40000,
    env: {
      ...process.env, WAYPOST_PROJECT_DIR: proj, WAYPOST_HOME: REPO,
      WAYPOST_HARNESS: harness, ...(session ? { WAYPOST_SESSION_ID: session } : {}),
    },
  });
  if (!expectFail) assert.equal(r.status, 0, `${args.join(" ")}\n${r.stderr}${r.stdout}`);
  return r;
}

function git(proj, args, opts = {}) {
  return spawnSync("git", args, { cwd: proj, encoding: "utf8", ...opts });
}

// A project whose vault is versioned with the code — the only arrangement where
// two sessions can collide inside one repository, and therefore the one the
// protocol is about.
function repo() {
  const proj = mkdtempSync(join(tmpdir(), "waypost-c-"));
  git(proj, ["init", "-q", "-b", "main"]);
  git(proj, ["config", "user.email", "t@example.com"]);
  git(proj, ["config", "user.name", "T"]);
  waypost(proj, ["bind", join(proj, "vault")]);
  waypost(proj, ["draft", "epic", "PS-1", "Epic", "--write"]);
  git(proj, ["add", "-A"]);
  git(proj, ["commit", "-qm", "base"]);
  return proj;
}

// ─── the record ────────────────────────────────────────────────────────

test("the trailer block is a trailer block, by git's own parser", () => {
  const msg = composeMessage("Do the thing", {
    harness: "codex", session: "s1", story: "PS-1/story-x", coauthor: "A <a@example.com>",
  });
  const proj = mkdtempSync(join(tmpdir(), "waypost-t-"));
  const r = git(proj, ["interpret-trailers", "--parse"], { input: msg });
  const parsed = (r.stdout || "").trim().split("\n");
  assert.deepEqual(parsed, [
    "Waypost-Harness: codex",
    "Waypost-Session: s1",
    "Waypost-Story: PS-1/story-x",
    "Co-Authored-By: A <a@example.com>",
  ], "git must see four trailers, not prose");
  assert.match(msg, /^Do the thing\n\n/, "the subject keeps its own paragraph");
});

test("a message that already ends in trailers gains ours without breaking the block", () => {
  const msg = composeMessage("Subject\n\nSigned-off-by: X <x@example.com>", {
    harness: "claude", session: "s2",
  });
  const proj = mkdtempSync(join(tmpdir(), "waypost-t2-"));
  const parsed = (git(proj, ["interpret-trailers", "--parse"], { input: msg }).stdout || "").trim().split("\n");
  assert.deepEqual(parsed, ["Signed-off-by: X <x@example.com>", "Waypost-Harness: claude", "Waypost-Session: s2"]);
});

// D-2: git's own rule is "last paragraph, preceded by a blank line, entirely
// trailer lines" — a message whose last line LOOKS like a trailer but has no
// blank line before it (a Claude-style `Body\nCo-Authored-By: …`) is NOT a
// trailer block by that rule, so ours must open a new paragraph rather than
// merging into it, or git drops the whole lot.
test("a multi-line body ending in a trailer-shaped line with no blank line before it still gets a clean trailer block", () => {
  const msg = composeMessage("Fix the thing\nFixes: #123", { harness: "claude", session: "s3" });
  const proj = mkdtempSync(join(tmpdir(), "waypost-t3-"));
  const parsed = (git(proj, ["interpret-trailers", "--parse"], { input: msg }).stdout || "").trim().split("\n");
  assert.deepEqual(parsed, ["Waypost-Harness: claude", "Waypost-Session: s3"],
    "the fake trailer-shaped body line must not swallow ours into one broken paragraph");
});

test("a Claude-style body ending in Co-Authored-By with no blank line before it still gets a clean trailer block", () => {
  const msg = composeMessage("Body\nCo-Authored-By: X <x@e.com>", { harness: "claude", session: "s4" });
  const proj = mkdtempSync(join(tmpdir(), "waypost-t4-"));
  const parsed = (git(proj, ["interpret-trailers", "--parse"], { input: msg }).stdout || "").trim().split("\n");
  assert.deepEqual(parsed, ["Waypost-Harness: claude", "Waypost-Session: s4"],
    "our trailers must land as their own recognised block, not merge into the un-blank-separated line above");
});

test("commit records harness, session and story; log reads them back", () => {
  const proj = repo();
  waypost(proj, ["draft", "story", "PS-1", "First", "--write"]);
  waypost(proj, ["commit", "-m", "Open the first story", "--story", "PS-1/story-first", "--all"],
    { harness: "codex", session: "codex-1" });

  const body = git(proj, ["log", "-1", "--format=%B"]).stdout;
  assert.match(body, /^Waypost-Harness: codex$/m);
  assert.match(body, /^Waypost-Session: codex-1$/m);
  assert.match(body, /^Waypost-Story: PS-1\/story-first$/m);

  const rows = JSON.parse(waypost(proj, ["log", "--json"]).stdout);
  assert.equal(rows[0].harness, "codex");
  assert.equal(rows[0].story, "PS-1/story-first");
  assert.match(waypost(proj, ["log", "--harness", "codex"]).stdout, /Open the first story/);
  assert.match(waypost(proj, ["log", "--harness", "cursor"]).stdout, /no commits match/,
    "a filter that matches nothing says so rather than showing everything");
});

test("a story reference is resolved against the vault, so a typo cannot enter the record", () => {
  const proj = repo();
  waypost(proj, ["draft", "story", "PS-1", "Second", "--write"]);
  const cfg = JSON.parse(readFileSync(join(proj, ".waypost", "projectstore.json"), "utf8"));
  cfg.vault_path = join(proj, cfg.vault_path); // stored relative to the project; readConfig resolves it the same way
  assert.equal(storyRef(join(cfg.vault_path, "epics/PS-1/stories/story-second.md"), cfg), "PS-1/story-second");
  assert.equal(storyRef("story-second", cfg), "PS-1/story-second");

  writeFileSync(join(proj, "x.txt"), "x", "utf8");
  git(proj, ["add", "-A"]);
  const r = waypost(proj, ["commit", "-m", "m", "--story", "PS-9/nope"], { expectFail: true });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /no story matches/);
});

test("storyRefOf understands all three on-disk story shapes, and storyPathOf is its inverse (G-9)", () => {
  const vault = mkdtempSync(join(tmpdir(), "waypost-ref-"));
  const plain = join(vault, "epics", "E1", "stories", "s.md");
  const folderShaped = join(vault, "epics", "E1", "stories", "folder-shaped", "README.md");
  const standalone = join(vault, "epics", "E1", "story-standalone.md");
  mkdirSync(dirname(plain), { recursive: true });
  writeFileSync(plain, "---\ntype: story\n---\n", "utf8");
  mkdirSync(dirname(folderShaped), { recursive: true });
  writeFileSync(folderShaped, "---\ntype: story\n---\n", "utf8");
  writeFileSync(standalone, "---\ntype: story\n---\n", "utf8");

  assert.equal(storyRefOf(plain, vault), "E1/s", "epics/<E>/stories/<s>.md");
  assert.equal(storyRefOf(folderShaped, vault), "E1/folder-shaped", "epics/<E>/stories/<s>/README.md");
  assert.equal(storyRefOf(standalone, vault), "E1/story-standalone", "epics/<E>/story-<s>.md, standalone");

  // An already-shaped reference passes straight through once it is verified
  // to exist against the vault.
  assert.equal(storyRefOf("E1/s", vault), "E1/s");
  assert.equal(storyRefOf("E1/nope", vault), null, "a shape that resolves to nothing is not a reference");

  // …and the inverse recovers exactly the file each ref came from.
  assert.equal(storyPathOf("E1/s", vault), plain);
  assert.equal(storyPathOf("E1/folder-shaped", vault), folderShaped);
  assert.equal(storyPathOf("E1/story-standalone", vault), standalone);
});

test("the harness is taken from the environment the harness itself sets", () => {
  assert.equal(detectSessionHarness({ WAYPOST_HARNESS: "windsurf" }), "windsurf", "an explicit label wins");
  assert.equal(detectSessionHarness({ CLAUDECODE: "1" }), "claude");
  assert.equal(detectSessionHarness({ CURSOR_TRACE_ID: "abc" }), "cursor");
  assert.equal(detectSessionHarness({}), "unknown",
    "an unknown harness is recorded as unknown, never guessed");
});

// ─── claims ────────────────────────────────────────────────────────────

test("a story claimed by another live session blocks the commit until it is forced", () => {
  const proj = repo();
  waypost(proj, ["draft", "story", "PS-1", "Shared", "--write"]);
  waypost(proj, ["sessions", "--claim", "PS-1/story-shared"], { harness: "cursor", session: "cursor-9" });

  writeFileSync(join(proj, "a.txt"), "a", "utf8");
  git(proj, ["add", "-A"]);
  const blocked = waypost(proj, ["commit", "-m", "m", "--story", "PS-1/story-shared"],
    { harness: "claude", session: "claude-1", expectFail: true });
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /claimed by cursor-9 \(cursor/);

  waypost(proj, ["commit", "-m", "m", "--story", "PS-1/story-shared", "--force"],
    { harness: "claude", session: "claude-1" });
  assert.match(git(proj, ["log", "-1", "--format=%B"]).stdout, /Waypost-Story: PS-1\/story-shared/);
});

test("D-3: a claim from a device whose clock is hours behind blocks the commit once its counter has moved", () => {
  const proj = repo();
  waypost(proj, ["draft", "story", "PS-1", "Skewed", "--write"]);
  // The other device wrote its record itself, on its own clock — six hours back.
  const behind = () => new Date(Date.now() - 6 * 3600e3).toISOString();
  const started = behind(); // minted once per presence file, kept across beats — as beat() does
  const presence = join(proj, "vault", ".projectstore", "presence");
  mkdirSync(presence, { recursive: true });
  const record = (seq) => writeFileSync(join(presence, "codex-7.json"), JSON.stringify({
    session: "codex-7", host: "otherbox", os: "win32-10", harness: "codex", seq, at: behind(), started_at: started,
    project_root: "C:\\work\\proj", claim: { story: "PS-1/story-skewed", at: behind() },
  }), "utf8");
  record(1);

  writeFileSync(join(proj, "a.txt"), "a", "utf8");
  git(proj, ["add", "-A"]);
  // First sight: a clock six hours behind is indistinguishable from a session
  // gone six hours ago, so this commit goes through — the documented limit.
  waypost(proj, ["commit", "-m", "first"], { harness: "claude", session: "claude-1" });

  // The other device keeps working: its counter moves, its clock stays wrong.
  record(2);
  writeFileSync(join(proj, "b.txt"), "b", "utf8");
  git(proj, ["add", "-A"]);
  const blocked = waypost(proj, ["commit", "-m", "second", "--story", "PS-1/story-skewed"],
    { harness: "claude", session: "claude-1", expectFail: true });
  assert.notEqual(blocked.status, 0, "the commit path itself persisted the first sight, so the moved counter is seen");
  assert.match(blocked.stderr, /claimed by codex-7 \(codex/);
});

test("`commit --all` never stages the machine-local .waypost/ — even in a project that never ran `doctor --fix`", () => {
  const proj = repo();
  // `bind` writes no .gitignore; only setup/doctor --fix do. Make sure nothing ignores it here.
  if (existsSync(join(proj, ".gitignore"))) unlinkSync(join(proj, ".gitignore"));
  waypost(proj, ["draft", "story", "PS-1", "Sweep", "--write"]);
  writeFileSync(join(proj, "a.txt"), "a", "utf8");
  // The commit path itself writes the presence cache (claimsOf, before staging).
  waypost(proj, ["commit", "-m", "sweep", "--all", "--story", "PS-1/story-sweep"], { harness: "claude", session: "claude-1" });
  const committed = git(proj, ["show", "--name-only", "--format=", "HEAD"]).stdout.split("\n").filter(Boolean);
  assert.ok(committed.includes("a.txt"), committed.join("\n"));
  assert.ok(!committed.some((f) => f.startsWith(".waypost/")),
    `one machine's clock stamps and config must not travel to every clone: ${committed.join(", ")}`);
  assert.ok(existsSync(join(proj, ".waypost", "state")), "the cache was written — the exclusion is what kept it out");
});

test("the story gate claims on plan and releases on close", () => {
  const proj = repo();
  waypost(proj, ["draft", "story", "PS-1", "Gated", "--write"]);
  const story = join(proj, "vault", "epics", "PS-1", "stories", "story-gated.md");

  waypost(proj, ["story", "plan", story, "--write"], { session: "claude-2" });
  let state = JSON.parse(waypost(proj, ["sessions", "--json"], { session: "claude-2" }).stdout);
  assert.deepEqual(state.claims.map((c) => c.story), ["PS-1/story-gated"],
    "opening a story announces it to every session on the vault");

  waypost(proj, ["story", "close", story, "--write"], { session: "claude-2" });
  state = JSON.parse(waypost(proj, ["sessions", "--json"], { session: "claude-2" }).stdout);
  assert.deepEqual(state.claims, [], "closing it hands the story back");
});

// Without WAYPOST_SESSION_ID or any terminal env var, bin/waypost falls back to
// deriving one from its own process.ppid — the real parent process here is
// this test file's node process, constant across every spawnSync below, so
// the derivation must land on the same id every time (G-1). Before the fix,
// each script bin/waypost spawned computed its OWN id from ITS OWN parent (bin/waypost
// itself, a different pid every call), so a story opened in one call was
// "claimed by a stranger" by the very next.
const TERMINAL_ENV_VARS = ["WAYPOST_SESSION_ID", "CLAUDE_CODE_SESSION_ID", "CLAUDE_SESSION_ID", "CODEX_SESSION_ID",
  "TERM_SESSION_ID", "ITERM_SESSION_ID", "TMUX_PANE", "WT_SESSION", "KITTY_WINDOW_ID", "SSH_TTY"];

function withoutSessionEnv(proj) {
  const env = { ...process.env, WAYPOST_PROJECT_DIR: proj, WAYPOST_HOME: REPO };
  for (const k of TERMINAL_ENV_VARS) delete env[k];
  return env;
}

test("with no WAYPOST_SESSION_ID and no terminal env, the derived session id is stable, and a story it opened does not block its own commit (G-1)", () => {
  const proj = repo();
  const bare = (args) => spawnSync(process.execPath, [Waypost, ...args], { encoding: "utf8", cwd: proj, env: withoutSessionEnv(proj) });

  const first = JSON.parse(bare(["sessions", "--json"]).stdout).session_id;
  const second = JSON.parse(bare(["sessions", "--json"]).stdout).session_id;
  assert.equal(first, second, "two separate waypost invocations from the same process derive the same id");

  waypost(proj, ["draft", "story", "PS-1", "Bare", "--write"]);
  const story = join(proj, "vault", "epics", "PS-1", "stories", "story-bare.md");
  const planned = bare(["story", "plan", story, "--write"]);
  assert.equal(planned.status, 0, planned.stderr);

  git(proj, ["add", "-A"]);
  const dry = bare(["commit", "-m", "x", "--story", "PS-1/story-bare", "--dry-run"]);
  assert.equal(dry.status, 0, `self-claim must not block its own commit:\n${dry.stderr}`);
  assert.doesNotMatch(dry.stderr || "", /is claimed by/);
});

// ─── derived views under merge ─────────────────────────────────────────

test("two branches that both add a story merge without a conflict in the board", () => {
  const proj = repo();
  waypost(proj, ["doctor", "--fix"]);
  assert.match(readFileSync(join(proj, ".gitattributes"), "utf8"), /vault\/kanban\.md merge=waypost-derived/);
  assert.ok(!existsSync(join(proj, "vault", ".git")),
    "a vault inside the repository must not be turned into a nested repository");
  git(proj, ["add", "-A"]);
  git(proj, ["commit", "-qm", "wire the merge driver"]);

  git(proj, ["checkout", "-qb", "a"]);
  waypost(proj, ["draft", "story", "PS-1", "From claude", "--write"]);
  waypost(proj, ["commit", "-m", "story a", "--all"], { harness: "claude", session: "s-a" });

  git(proj, ["checkout", "-q", "main"]);
  git(proj, ["checkout", "-qb", "b"]);
  waypost(proj, ["draft", "story", "PS-1", "From codex", "--write"]);
  waypost(proj, ["commit", "-m", "story b", "--all"], { harness: "codex", session: "s-b" });

  const merged = waypost(proj, ["merge", "a"], { harness: "codex", session: "s-b" });
  assert.match(merged.stdout, /recorded [0-9a-f]+/, "the merge is committed through the protocol");

  const board = git(proj, ["show", "HEAD:vault/kanban.md"]).stdout;
  assert.ok(!board.includes("<<<<<<<"), "a generated file must never reach a human as a conflict");
  assert.match(board, /From claude/);
  assert.match(board, /From codex/, "and the merge commit's board holds BOTH sides' stories");

  const findings = JSON.parse(waypost(proj, ["doctor", "--vault", "--json"]).stdout);
  assert.ok(!findings.some((f) => f.check === "kanban" && f.level === "issue"),
    "…so doctor has nothing to say about the board afterwards");
});

test("merge stages the merge result and the re-derived views, never a stray uncommitted file (G-8)", () => {
  const proj = repo();
  waypost(proj, ["doctor", "--fix"]);
  git(proj, ["add", "-A"]);
  git(proj, ["commit", "-qm", "wire the merge driver"]);

  git(proj, ["checkout", "-qb", "a"]);
  waypost(proj, ["draft", "story", "PS-1", "From claude", "--write"]);
  waypost(proj, ["commit", "-m", "story a", "--all"], { harness: "claude", session: "s-a" });

  git(proj, ["checkout", "-q", "main"]);
  git(proj, ["checkout", "-qb", "b"]);
  waypost(proj, ["draft", "story", "PS-1", "From codex", "--write"]);
  waypost(proj, ["commit", "-m", "story b", "--all"], { harness: "codex", session: "s-b" });

  // Work in progress on branch "b", unrelated to the merge — exactly what a
  // bare `--all` inside merge() used to sweep into the merge commit (G-8).
  writeFileSync(join(proj, "wip.txt"), "not part of the merge\n", "utf8");

  const merged = waypost(proj, ["merge", "a"], { harness: "codex", session: "s-b" });
  assert.match(merged.stdout, /recorded [0-9a-f]+/, merged.stderr);

  assert.match(git(proj, ["status", "--porcelain"]).stdout, /^\?\? wip\.txt$/m,
    "the stray file is still untracked — merge never staged it");
  const committed = git(proj, ["show", "--name-only", "--format=", "HEAD"]).stdout;
  assert.ok(!committed.includes("wip.txt"), "…and it did not enter the merge commit itself");
});

test("doctor reports the merge driver, and repairs a stale one", () => {
  const proj = repo();
  let findings = JSON.parse(waypost(proj, ["doctor", "--install", "--json"]).stdout);
  assert.ok(findings.some((f) => f.check === "merge-driver"), "an unwired repo is reported");

  const fixed = waypost(proj, ["doctor", "--fix"]);
  // B-3/D-4/O-3: spawnSync(cmd, args, { shell: true }) is deprecated on this
  // Node (25.6.1) and prints DEP0190 straight into `waypost setup`'s own
  // output — the first command a new user runs.
  assert.doesNotMatch(fixed.stderr, /DEP0190/, "the args-array-plus-shell deprecation warning must not surface");
  findings = JSON.parse(waypost(proj, ["doctor", "--install", "--json"]).stdout);
  assert.ok(!findings.some((f) => f.check === "merge-driver"), "…and wired once, it stays quiet");

  git(proj, ["config", "merge.waypost-derived.driver", "some-old-command %A"]);
  findings = JSON.parse(waypost(proj, ["doctor", "--install", "--json"]).stdout);
  const drift = findings.find((f) => f.check === "merge-driver");
  assert.ok(drift, "a driver from another version is worse than none — git calls it and it fails");
  assert.match(drift.message, /expected:/);
  waypost(proj, ["doctor", "--fix"]);
  const driver = git(proj, ["config", "--get", "merge.waypost-derived.driver"]).stdout.trim();
  assert.match(driver, /(waypost merge-derived|merge-derived\.mjs) %A %O %B %P/);
  // Never the running interpreter's own path: it pins a version
  // (…/node/25.6.1/bin/node) that the next package upgrade removes, and .git/config
  // outlives it. Same reason the plugin path is only a fallback.
  assert.ok(!driver.includes(process.execPath),
    `the driver must not hard-code this interpreter: ${driver}`);
});

test("the merge driver refuses rather than guessing when it cannot re-derive", () => {
  const proj = repo();
  const r = spawnSync(process.execPath, [join(REPO, "scripts", "merge-derived.mjs"), join(proj, "README.md")], {
    encoding: "utf8", cwd: proj, env: { ...process.env, WAYPOST_PROJECT_DIR: proj, WAYPOST_HOME: REPO },
  });
  assert.notEqual(r.status, 0, "a file that is not a derived view leaves the conflict for a human");
  assert.match(r.stderr, /not a derived view/);
});
