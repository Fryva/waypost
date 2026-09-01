// mps — the commit protocol for parallel harness sessions (ADR-0006):
// trailers, claims, and the merge driver that keeps derived views out of
// conflict resolution.
//   node --test tests/*.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { composeMessage, storyRef, detectSessionHarness } from "../scripts/commit.mjs";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const MPS = join(REPO, "bin", "mps");

function mps(proj, args, { harness = "claude", session = null, expectFail = false } = {}) {
  const r = spawnSync(process.execPath, [MPS, ...args], {
    encoding: "utf8", cwd: proj, timeout: 40000,
    env: {
      ...process.env, MPS_PROJECT_DIR: proj, MPS_HOME: REPO,
      MPS_HARNESS: harness, ...(session ? { MPS_SESSION_ID: session } : {}),
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
  const proj = mkdtempSync(join(tmpdir(), "mps-c-"));
  git(proj, ["init", "-q", "-b", "main"]);
  git(proj, ["config", "user.email", "t@example.com"]);
  git(proj, ["config", "user.name", "T"]);
  mps(proj, ["bind", join(proj, "vault")]);
  mps(proj, ["draft", "epic", "PS-1", "Epic", "--write"]);
  git(proj, ["add", "-A"]);
  git(proj, ["commit", "-qm", "base"]);
  return proj;
}

// ─── the record ────────────────────────────────────────────────────────

test("the trailer block is a trailer block, by git's own parser", () => {
  const msg = composeMessage("Do the thing", {
    harness: "codex", session: "s1", story: "PS-1/story-x", coauthor: "A <a@example.com>",
  });
  const proj = mkdtempSync(join(tmpdir(), "mps-t-"));
  const r = git(proj, ["interpret-trailers", "--parse"], { input: msg });
  const parsed = (r.stdout || "").trim().split("\n");
  assert.deepEqual(parsed, [
    "Mps-Harness: codex",
    "Mps-Session: s1",
    "Mps-Story: PS-1/story-x",
    "Co-Authored-By: A <a@example.com>",
  ], "git must see four trailers, not prose");
  assert.match(msg, /^Do the thing\n\n/, "the subject keeps its own paragraph");
});

test("a message that already ends in trailers gains ours without breaking the block", () => {
  const msg = composeMessage("Subject\n\nSigned-off-by: X <x@example.com>", {
    harness: "claude", session: "s2",
  });
  const proj = mkdtempSync(join(tmpdir(), "mps-t2-"));
  const parsed = (git(proj, ["interpret-trailers", "--parse"], { input: msg }).stdout || "").trim().split("\n");
  assert.deepEqual(parsed, ["Signed-off-by: X <x@example.com>", "Mps-Harness: claude", "Mps-Session: s2"]);
});

test("commit records harness, session and story; log reads them back", () => {
  const proj = repo();
  mps(proj, ["draft", "story", "PS-1", "First", "--write"]);
  mps(proj, ["commit", "-m", "Open the first story", "--story", "PS-1/story-first", "--all"],
    { harness: "codex", session: "codex-1" });

  const body = git(proj, ["log", "-1", "--format=%B"]).stdout;
  assert.match(body, /^Mps-Harness: codex$/m);
  assert.match(body, /^Mps-Session: codex-1$/m);
  assert.match(body, /^Mps-Story: PS-1\/story-first$/m);

  const rows = JSON.parse(mps(proj, ["log", "--json"]).stdout);
  assert.equal(rows[0].harness, "codex");
  assert.equal(rows[0].story, "PS-1/story-first");
  assert.match(mps(proj, ["log", "--harness", "codex"]).stdout, /Open the first story/);
  assert.match(mps(proj, ["log", "--harness", "cursor"]).stdout, /no commits match/,
    "a filter that matches nothing says so rather than showing everything");
});

test("a story reference is resolved against the vault, so a typo cannot enter the record", () => {
  const proj = repo();
  mps(proj, ["draft", "story", "PS-1", "Second", "--write"]);
  const cfg = JSON.parse(readFileSync(join(proj, ".mps", "projectstore.json"), "utf8"));
  assert.equal(storyRef(join(cfg.vault_path, "epics/PS-1/stories/story-second.md"), cfg), "PS-1/story-second");
  assert.equal(storyRef("story-second", cfg), "PS-1/story-second");

  writeFileSync(join(proj, "x.txt"), "x", "utf8");
  git(proj, ["add", "-A"]);
  const r = mps(proj, ["commit", "-m", "m", "--story", "PS-9/nope"], { expectFail: true });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /no story matches/);
});

test("the harness is taken from the environment the harness itself sets", () => {
  assert.equal(detectSessionHarness({ MPS_HARNESS: "windsurf" }), "windsurf", "an explicit label wins");
  assert.equal(detectSessionHarness({ CLAUDECODE: "1" }), "claude");
  assert.equal(detectSessionHarness({ CURSOR_TRACE_ID: "abc" }), "cursor");
  assert.equal(detectSessionHarness({}), "unknown",
    "an unknown harness is recorded as unknown, never guessed");
});

// ─── claims ────────────────────────────────────────────────────────────

test("a story claimed by another live session blocks the commit until it is forced", () => {
  const proj = repo();
  mps(proj, ["draft", "story", "PS-1", "Shared", "--write"]);
  mps(proj, ["sessions", "--claim", "PS-1/story-shared"], { harness: "cursor", session: "cursor-9" });

  writeFileSync(join(proj, "a.txt"), "a", "utf8");
  git(proj, ["add", "-A"]);
  const blocked = mps(proj, ["commit", "-m", "m", "--story", "PS-1/story-shared"],
    { harness: "claude", session: "claude-1", expectFail: true });
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /claimed by cursor-9 \(cursor/);

  mps(proj, ["commit", "-m", "m", "--story", "PS-1/story-shared", "--force"],
    { harness: "claude", session: "claude-1" });
  assert.match(git(proj, ["log", "-1", "--format=%B"]).stdout, /Mps-Story: PS-1\/story-shared/);
});

test("the story gate claims on plan and releases on close", () => {
  const proj = repo();
  mps(proj, ["draft", "story", "PS-1", "Gated", "--write"]);
  const story = join(proj, "vault", "epics", "PS-1", "stories", "story-gated.md");

  mps(proj, ["story", "plan", story, "--write"], { session: "claude-2" });
  let state = JSON.parse(mps(proj, ["sessions", "--json"], { session: "claude-2" }).stdout);
  assert.deepEqual(state.claims.map((c) => c.story), ["PS-1/story-gated"],
    "opening a story announces it to every session on the vault");

  mps(proj, ["story", "close", story, "--write"], { session: "claude-2" });
  state = JSON.parse(mps(proj, ["sessions", "--json"], { session: "claude-2" }).stdout);
  assert.deepEqual(state.claims, [], "closing it hands the story back");
});

// ─── derived views under merge ─────────────────────────────────────────

test("two branches that both add a story merge without a conflict in the board", () => {
  const proj = repo();
  mps(proj, ["doctor", "--fix"]);
  assert.match(readFileSync(join(proj, ".gitattributes"), "utf8"), /vault\/kanban\.md merge=mps-derived/);
  assert.ok(!existsSync(join(proj, "vault", ".git")),
    "a vault inside the repository must not be turned into a nested repository");
  git(proj, ["add", "-A"]);
  git(proj, ["commit", "-qm", "wire the merge driver"]);

  git(proj, ["checkout", "-qb", "a"]);
  mps(proj, ["draft", "story", "PS-1", "From claude", "--write"]);
  mps(proj, ["commit", "-m", "story a", "--all"], { harness: "claude", session: "s-a" });

  git(proj, ["checkout", "-q", "main"]);
  git(proj, ["checkout", "-qb", "b"]);
  mps(proj, ["draft", "story", "PS-1", "From codex", "--write"]);
  mps(proj, ["commit", "-m", "story b", "--all"], { harness: "codex", session: "s-b" });

  const merged = mps(proj, ["merge", "a"], { harness: "codex", session: "s-b" });
  assert.match(merged.stdout, /recorded [0-9a-f]+/, "the merge is committed through the protocol");

  const board = git(proj, ["show", "HEAD:vault/kanban.md"]).stdout;
  assert.ok(!board.includes("<<<<<<<"), "a generated file must never reach a human as a conflict");
  assert.match(board, /From claude/);
  assert.match(board, /From codex/, "and the merge commit's board holds BOTH sides' stories");

  const findings = JSON.parse(mps(proj, ["doctor", "--vault", "--json"]).stdout);
  assert.ok(!findings.some((f) => f.check === "kanban" && f.level === "issue"),
    "…so doctor has nothing to say about the board afterwards");
});

test("doctor reports the merge driver, and repairs a stale one", () => {
  const proj = repo();
  let findings = JSON.parse(mps(proj, ["doctor", "--install", "--json"]).stdout);
  assert.ok(findings.some((f) => f.check === "merge-driver"), "an unwired repo is reported");

  mps(proj, ["doctor", "--fix"]);
  findings = JSON.parse(mps(proj, ["doctor", "--install", "--json"]).stdout);
  assert.ok(!findings.some((f) => f.check === "merge-driver"), "…and wired once, it stays quiet");

  git(proj, ["config", "merge.mps-derived.driver", "some-old-command %A"]);
  findings = JSON.parse(mps(proj, ["doctor", "--install", "--json"]).stdout);
  const drift = findings.find((f) => f.check === "merge-driver");
  assert.ok(drift, "a driver from another version is worse than none — git calls it and it fails");
  assert.match(drift.message, /expected:/);
  mps(proj, ["doctor", "--fix"]);
  assert.match(git(proj, ["config", "--get", "merge.mps-derived.driver"]).stdout, /merge-derived\.mjs %A %O %B %P/);
});

test("the merge driver refuses rather than guessing when it cannot re-derive", () => {
  const proj = repo();
  const r = spawnSync(process.execPath, [join(REPO, "scripts", "merge-derived.mjs"), join(proj, "README.md")], {
    encoding: "utf8", cwd: proj, env: { ...process.env, MPS_PROJECT_DIR: proj, MPS_HOME: REPO },
  });
  assert.notEqual(r.status, 0, "a file that is not a derived view leaves the conflict for a human");
  assert.match(r.stderr, /not a derived view/);
});
