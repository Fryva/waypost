// waypost — the commit protocol for parallel harness sessions (ADR-0006):
// trailers, claims, and the merge driver that keeps derived views out of
// conflict resolution.
//   node --test tests/*.test.mjs

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync as fsMkdtemp, mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync, rmSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { composeMessage, storyRef, detectSessionHarness, leasesOverStaged } from "../scripts/commit.mjs";
import { storyRefOf, storyPathOf } from "../scripts/lib.mjs";
import { processTable, osTag } from "../scripts/presence.mjs";
import { ambientEnv } from "./env.mjs";

// Every temp dir this file makes goes through here and is removed once its
// tests finish, so a run leaves nothing behind in $TMPDIR (WP-17).
const TMP_DIRS = [];
const mkdtempSync = (prefix) => { const p = fsMkdtemp(prefix); TMP_DIRS.push(p); return p; };
after(() => { for (const p of TMP_DIRS) rmSync(p, { recursive: true, force: true }); });

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const Waypost = join(REPO, "bin", "waypost");

function waypost(proj, args, { harness = "claude", session = null, expectFail = false } = {}) {
  const r = spawnSync(process.execPath, [Waypost, ...args], {
    encoding: "utf8", cwd: proj, timeout: 40000,
    env: {
      ...ambientEnv(), WAYPOST_PROJECT_DIR: proj, WAYPOST_HOME: REPO,
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
    harness: "codex", session: "s1", os: "darwin-27", story: "PS-1/story-x", coauthor: "A <a@example.com>",
  });
  const proj = mkdtempSync(join(tmpdir(), "waypost-t-"));
  const r = git(proj, ["interpret-trailers", "--parse"], { input: msg });
  const parsed = (r.stdout || "").trim().split("\n");
  assert.deepEqual(parsed, [
    "Waypost-Harness: codex",
    "Waypost-Session: s1",
    "Waypost-OS: darwin-27",
    "Waypost-Story: PS-1/story-x",
    "Co-Authored-By: A <a@example.com>",
  ], "git must see five trailers, not prose");
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

test("osTag is <platform>-<major>; commit writes it, git reads it, log filters and reports it", () => {
  assert.match(osTag(), /^[a-z0-9]+-\d+$/);
  const proj = repo();
  waypost(proj, ["draft", "story", "PS-1", "First", "--write"]);
  waypost(proj, ["commit", "-m", "Tagged change", "--all"], { harness: "codex", session: "codex-1" });
  assert.equal(git(proj, ["log", "-1", "--format=%(trailers:key=Waypost-OS,valueonly)"]).stdout.trim(), osTag());
  assert.match(git(proj, ["interpret-trailers", "--parse"], { input: git(proj, ["log", "-1", "--format=%B"]).stdout }).stdout,
    new RegExp(`^Waypost-OS: ${osTag()}$`, "m"));
  assert.equal(JSON.parse(waypost(proj, ["log", "--json"]).stdout)[0].os, osTag());
  assert.match(waypost(proj, ["log", "--os", osTag().split("-")[0]]).stdout, /Tagged change/);
  assert.match(waypost(proj, ["log", "--os", "win32x"]).stdout, /no commits match/);
  // a hand-made commit with Harness/Session but no OS is still tagged
  writeFileSync(join(proj, "h.txt"), "x\n"); git(proj, ["add", "h.txt"]);
  git(proj, ["commit", "-qm", "Hand\n\nWaypost-Harness: x\nWaypost-Session: y"]);
  const out = waypost(proj, ["log"]).stdout;
  assert.match(out, /Hand/); assert.match(out, /1 of the last 3 commits carry no waypost trailers/);
});

test("log counts commits without waypost trailers before its filter, so a filtered view still names them", () => {
  const proj = repo();
  waypost(proj, ["draft", "story", "PS-1", "First", "--write"]);
  waypost(proj, ["commit", "-m", "Tagged change", "--all"], { harness: "codex", session: "codex-1" });
  writeFileSync(join(proj, "plain.txt"), "x\n"); git(proj, ["add", "plain.txt"]); git(proj, ["commit", "-qm", "Plain git commit"]);
  const filtered = waypost(proj, ["log", "--harness", "codex"]).stdout;
  assert.match(filtered, /Tagged change/); assert.doesNotMatch(filtered, /Plain git commit/);
  assert.match(filtered, /2 of the last 3 commits carry no waypost trailers/, "the base and the plain commit are untagged");
  assert.match(waypost(proj, ["log", "--harness", "cursor"]).stdout, /no commits match[\s\S]*2 of the last 3 commits carry no waypost trailers/);
});
test("log groups only adjacent raw base metadata and preserves per-commit audit details", () => {
  const proj = repo();
  const base = { date: "2026-01-02", harness: "codex", provider: "openai", os: "linux-6" };
  const rows = [
    { ...base, subject: "First  detailed · change " + "full subject ".repeat(20).trim(), story: "PS-1/story-one", tasks: ["EXT-12", "QA-1"], author: "Ada" },
    { ...base, subject: "Second change", story: "PS-1/story-two", tasks: ["EXT-123", "QA-1"], author: "Boris" },
    { ...base, provider: "other", subject: "Boundary B" },
    { ...base, subject: "Return to A", story: "PS-1/story-three" },
    { ...base, date: "2026-01-03", harness: "date-test", subject: "Date one" },
    { ...base, date: "2026-01-04", harness: "date-test", subject: "Date two" },
    { ...base, date: "2026-01-05", subject: "Harness one" },
    { ...base, date: "2026-01-05", harness: "claude", subject: "Harness two" },
    { ...base, date: "2026-01-06", harness: "qwen", provider: "", subject: "Provider empty" },
    { ...base, date: "2026-01-06", harness: "qwen", subject: "Provider set" },
    { ...base, date: "2026-01-07", harness: "qwen", os: "", subject: "OS empty" },
    { ...base, date: "2026-01-07", harness: "qwen", subject: "OS set" },
    { ...base, date: "2026-01-08", harness: "", subject: "Missing harness" },
    { ...base, date: "2026-01-08", harness: "—", subject: "Rendered harness collision" },
    { ...base, date: "2026-01-09", provider: "a · b", os: "c", subject: "Tuple collision one" },
    { ...base, date: "2026-01-09", provider: "a", os: "b · c", subject: "Tuple collision two" },
  ];
  for (const [i, row] of rows.slice().reverse().entries()) {
    const trailers = [
      ...(row.harness ? [`Waypost-Harness: ${row.harness}`] : []),
      `Waypost-Session: fixture-${i}`,
      ...(row.provider ? [`Waypost-Provider: ${row.provider}`] : []),
      ...(row.os ? [`Waypost-OS: ${row.os}`] : []),
      ...(row.story ? [`Waypost-Story: ${row.story}`] : []),
      ...(row.tasks || []).map(task => `Waypost-Task: ${task}`),
    ];
    const r = git(proj, ["commit", "--allow-empty", "-qm", row.subject + "\n\n" + trailers.join("\n")], {
      env: { ...ambientEnv(), GIT_AUTHOR_NAME: row.author || "T", GIT_AUTHOR_EMAIL: "t@example.com",
        GIT_AUTHOR_DATE: row.date + "T12:00:00+00:00", GIT_COMMITTER_DATE: row.date + "T12:00:00+00:00" },
    });
    assert.equal(r.status, 0, r.stderr);
  }
  const n = String(rows.length);
  const jsonBytes = waypost(proj, ["log", "--json", "-n", n]).stdout;
  const records = JSON.parse(jsonBytes);
  assert.deepEqual(records.map(row => row.subject), rows.map(row => row.subject));
  for (const [i, row] of rows.entries()) {
    const { date, harness, provider, os, story, tasks } = records[i];
    assert.deepEqual({ date, harness, provider, os, story, tasks },
      { date: row.date, harness: row.harness, provider: row.provider, os: row.os, story: row.story || "", tasks: row.tasks || [] });
  }
  assert.deepEqual(records.map(row => row.sha), git(proj, ["log", "-n" + n, "--format=%h"]).stdout.trim().split("\n"));
  assert.equal(records[0].author, "Ada"); assert.equal(records[1].author, "Boris");
  assert.notEqual(records[0].session, records[1].session, "grouping does not assert a shared session/author");
  const legacy = row => `${row.sha}  ${row.date}  ${[row.harness || "—", row.provider || null, row.os || null, row.story || null, ...row.tasks].filter(Boolean).join(" · ").padEnd(44)} ${row.subject}\n`;
  const detail = row => `  ${row.sha}  ${[row.story || null, ...row.tasks].filter(Boolean).join(" · ")} ${row.subject}\n`;
  const heading = "2026-01-02  codex · openai · linux-6 [2 commits]\n";
  const human = waypost(proj, ["log", "-n", n]).stdout;
  assert.equal(human, heading + records.slice(0, 2).map(detail).join("") + records.slice(2).map(legacy).join(""),
    "every row keeps its exact values/order; only the first adjacent pair shares a header");
  assert.ok(human.length < records.map(legacy).join("").length);
  assert.equal(waypost(proj, ["log", "-n", "1"]).stdout, legacy(records[0]), "singleton keeps legacy bytes");
  assert.equal(waypost(proj, ["log", "-n", "2"]).stdout, heading + records.slice(0, 2).map(detail).join(""));
  assert.equal(waypost(proj, ["log", "--provider", "other", "-n", n]).stdout, legacy(records[2]));
  assert.equal(waypost(proj, ["log", "--task", "EXT-12", "-n", n]).stdout, legacy(records[0]), "task match stays exact");
  const selected = [records[0], records[1], records[3]];
  const selectedText = "2026-01-02  codex · openai · linux-6 [3 commits]\n" + selected.map(row => {
    const tag = [row.story || null, ...row.tasks].filter(Boolean).join(" · ");
    return `  ${row.sha}  ${tag ? tag + " " : ""}${row.subject}\n`;
  }).join("");
  assert.equal(waypost(proj, ["log", "--provider", "openai", "--story", "PS-1/story", "-n", n]).stdout, selectedText,
    "adjacency is evaluated after filtering, without sorting");
  assert.equal(waypost(proj, ["log", "--harness", "not-present", "-n", n]).stdout, "no commits match\n");
  assert.equal(waypost(proj, ["log", "--json", "-n", n]).stdout, jsonBytes, "human rendering never changes JSON");
});

test("filtered log pages a pinned history, terminates safely and preserves the audit window", () => {
  const source = readFileSync(join(REPO, "scripts", "commit.mjs"), "utf8");
  const start = source.indexOf("function log(argv) {");
  const body = source.slice(start, source.indexOf("\n}\n", start) + 2);
  assert.ok(body.startsWith("function log(argv) {") && body.endsWith("}"));
  const oid = "a".repeat(40), NL = String.fromCharCode(10), US = String.fromCharCode(31);
  const record = (i, extra = {}) => ({ sha: i.toString(16).padStart(7, "0"), author: "A", date: "2026-01-02",
    subject: "Change " + i, harness: "other", session: "s" + i, story: "PS-1/story-x", provider: "vendor", os: "linux-6", tasks: [], ...extra });
  const encode = rows => rows.map(row => [row.sha, row.author, row.date, row.subject, row.harness, row.session,
    row.story, row.provider, row.os, row.tasks.join(",")].join(US)).join(NL);
  const run = (records, args, settings = {}) => {
    const calls = []; let stdout = "", error = null, head = settings.oid || oid;
    const git = (argv, opts = {}) => {
      calls.push({ argv, opts });
      if (argv[0] === "rev-parse") return settings.pinError || { status: 0, stdout: head + NL };
      assert.equal(argv[0], "log");
      const size = Number(argv.find(value => value.startsWith("-n")).slice(2));
      const skipped = argv.find(value => value.startsWith("--skip="));
      const skip = skipped ? Number(skipped.slice(7)) : 0;
      if (skipped) {
        assert.deepEqual(argv.slice(-2), [settings.oid || oid, "--"], "every page uses the original OID even after HEAD moves");
        assert.ok(Number.isInteger(size) && size >= 1 && size <= 200); assert.equal(opts.maxBuffer, 1024 * 1024);
      } else assert.equal(opts.maxBuffer, undefined, "unfiltered queries keep their existing helper options");
      head = "b".repeat(head.length);
      if (settings.failAt === skip) return settings.failure;
      if (settings.overflowAbove != null && size > settings.overflowAbove
        && (settings.overflowFrom == null || skip >= settings.overflowFrom)) {
        return { status: settings.overflowStatus ?? null, error: { code: "ENOBUFS" },
          stdout: encode([record(999999, { harness: "wanted", subject: "TRUNCATED MATCH" })]) };
      }
      return { status: 0, stdout: encode(records.slice(skip, skip + size)) };
    };
    const die = message => { throw new Error(message); };
    try { Function("git", "die", "process", "return (" + body + ")")(git, die, { stdout: { write: value => { stdout += value; } } })(args); }
    catch (e) { error = e; }
    return { calls, stdout, error, offsets: calls.filter(c => c.argv[0] === "log").map(c => Number((c.argv.find(v => v.startsWith("--skip=")) || "--skip=0").slice(7))) };
  };
  const history = Array.from({ length: 450 }, (_, i) => record(i + 1, i < 2 ? { harness: "", session: "" } : {}));
  history[210] = record(211, { harness: "wanted", tasks: ["EXT-12"] });
  history[405] = record(406, { harness: "wanted", tasks: ["EXT-123"] });
  const found = run(history, ["--harness", "wanted", "-n", "2", "--json"]);
  assert.equal(found.error, null); assert.deepEqual(found.offsets, [0, 200, 400]);
  assert.deepEqual(JSON.parse(found.stdout).map(row => row.sha), [history[210].sha, history[405].sha]);
  assert.equal(found.calls.filter(c => c.argv[0] === "rev-parse").length, 1);
  const human = run(history, ["--harness", "wanted", "-n", "2"]);
  assert.ok(human.stdout.includes("2 of the last 2 commits carry no waypost trailers"), "only the original latest-n window is audited");
  const largerWindow = run(history, ["--harness", "wanted", "-n", "250"]);
  assert.equal(largerWindow.error, null);
  assert.ok(largerWindow.stdout.includes("2 of the last 250 commits"), "audit prefix is collected across page boundaries");
  const exactTask = run(history, ["--task", "EXT-12", "-n", "2", "--json"]);
  assert.deepEqual(JSON.parse(exactTask.stdout).map(row => row.sha), [history[210].sha], "partial result after exhaustion keeps exact task matching");
  const early = run([record(1, { harness: "wanted" }), record(2, { harness: "wanted" }), record(3, { harness: "wanted" }), ...history], ["--harness", "wanted", "-n", "2", "--json"]);
  assert.equal(early.error, null); assert.deepEqual(early.offsets, [0], "enough matches stop further reads");
  assert.equal(JSON.parse(early.stdout).length, 2, "a full page cannot overfill the requested match limit");
  for (const length of [0, 200, 400, 401]) {
    const none = run(history.slice(0, length).map(row => ({ ...row, harness: "other" })), ["--harness", "absent", "-n", "1", "--json"]);
    assert.equal(none.error, null); assert.deepEqual(JSON.parse(none.stdout), []);
    assert.deepEqual(none.offsets, Array.from({ length: Math.floor(length / 200) + 1 }, (_, i) => i * 200));
  }
  for (const failure of [
    { status: 128, stdout: "" }, { status: null, signal: "SIGTERM", stdout: "" },
    { status: null, error: { code: "ETIMEDOUT" }, stdout: "" },
    { status: null, error: { code: "ENOBUFS" }, stdout: "truncated" },
    { status: 0, error: { code: "ENOBUFS" }, stdout: encode(history.slice(200, 201)) },
  ]) {
    const bad = run([record(1, { harness: "wanted" }), ...history], ["--harness", "wanted", "-n", "2", "--json"], { failAt: 200, failure });
    assert.ok(bad.error);
    if (failure.error?.code === "ENOBUFS") {
      const attempts = bad.calls.filter(c => c.argv[0] === "log");
      assert.deepEqual(bad.offsets, [0, ...Array(8).fill(200)]);
      assert.deepEqual(attempts.slice(1).map(c => Number(c.argv[1].slice(2))), [200, 100, 50, 25, 12, 6, 3, 1]);
    } else assert.deepEqual(bad.offsets, [0, 200], "non-buffer errors are not retried");
    assert.equal(bad.stdout, "", "a later-page error cannot publish partial matches");
  }
  for (const overflowStatus of [null, 0]) {
    const smaller = run(history, ["--harness", "wanted", "-n", "2", "--json"], { overflowAbove: 50, overflowStatus });
    assert.equal(smaller.error, null);
    assert.deepEqual(smaller.offsets, [0, 0, 0, 50, 100, 150, 200, 250, 300, 350, 400]);
    assert.deepEqual(JSON.parse(smaller.stdout).map(row => row.sha), [history[210].sha, history[405].sha], "truncated matching output is never parsed");
    const later = run(history, ["--harness", "wanted", "-n", "2", "--json"], { overflowAbove: 50, overflowFrom: 200, overflowStatus });
    assert.equal(later.error, null);
    assert.deepEqual(later.offsets, [0, 200, 200, 200, 250, 300, 350, 400]);
    assert.deepEqual(JSON.parse(later.stdout).map(row => row.sha), [history[210].sha, history[405].sha]);
  }
  const smallWindow = run(history, ["--harness", "wanted", "-n", "250"], { overflowAbove: 50 });
  assert.equal(smallWindow.error, null); assert.ok(smallWindow.stdout.includes("2 of the last 250 commits"));
  const sizeOne = run(history.slice(0, 5), ["--harness", "absent", "-n", "1", "--json"], { overflowAbove: 1 });
  assert.equal(sizeOne.error, null); assert.deepEqual(JSON.parse(sizeOne.stdout), []);
  assert.deepEqual(sizeOne.offsets, [...Array(8).fill(0), 1, 2, 3, 4, 5], "a full size-one page is not exhaustion");
  const tooLarge = run(history, ["--harness", "wanted", "-n", "1", "--json"], { overflowAbove: 0 });
  assert.ok(tooLarge.error); assert.equal(tooLarge.stdout, ""); assert.deepEqual(tooLarge.offsets, Array(8).fill(0));
  const unfilteredOverflow = run(history, ["-n", "200", "--json"], { failAt: 0, failure: { status: null, error: { code: "ENOBUFS" } } });
  assert.ok(unfilteredOverflow.error); assert.equal(unfilteredOverflow.calls.length, 1); assert.equal(unfilteredOverflow.stdout, "");
  const pinBad = run(history, ["--harness", "wanted"], { pinError: { status: 0, stdout: "not-a-commit" } });
  assert.ok(pinBad.error); assert.equal(pinBad.stdout, ""); assert.equal(pinBad.calls.length, 1);
  const sha256 = run(history, ["--harness", "wanted", "-n", "1", "--json"], { oid: "c".repeat(64) });
  assert.equal(sha256.error, null); assert.equal(JSON.parse(sha256.stdout)[0].sha, history[210].sha);
  for (const value of ["-1", "1.5", "NaN", "Infinity", "9007199254740992", "", " "]) {
    const invalid = run(history, ["-n", value, "--harness", "wanted"]);
    assert.ok(invalid.error?.message.includes("non-negative safe integer")); assert.equal(invalid.calls.length, 0);
  }
  assert.ok(run(history, ["-n"]).error);
  for (const args of [["-n", "0", "--json"], ["--harness", "wanted", "-n", "0", "--json"]]) {
    const zero = run(history, args); assert.equal(zero.error, null); assert.deepEqual(JSON.parse(zero.stdout), []);
    assert.equal(zero.calls.length, 1); assert.equal(zero.calls[0].argv[0], "log");
  }
  const unfiltered = run(history, ["-n", "2", "--json"]);
  assert.equal(unfiltered.error, null); assert.equal(unfiltered.calls.length, 1);
  assert.deepEqual(JSON.parse(unfiltered.stdout).map(row => row.sha), history.slice(0, 2).map(row => row.sha));
});

test("filtered log finds old matches across a real paged merge history", () => {
  const proj = repo(), hashes = []; let tick = 0;
  const commit = (message, saveHash = false) => {
    const date = new Date(Date.UTC(2026, 0, 1) + tick++ * 1000).toISOString();
    const r = git(proj, ["commit", "--allow-empty", "-qm", message], {
      env: { ...ambientEnv(), GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
    });
    assert.equal(r.status, 0, r.stderr);
    return saveHash ? git(proj, ["rev-parse", "--short", "HEAD"]).stdout.trim() : undefined;
  };
  hashes.push(commit("Deep oldest\n\nWaypost-Harness: deep\nWaypost-Session: deep-s\nWaypost-Task: EXT-12", true));
  hashes.push(commit("Deep newer\n\nWaypost-Harness: deep\nWaypost-Session: deep-s\nWaypost-Task: EXT-123", true));
  assert.equal(git(proj, ["checkout", "-qb", "side"]).status, 0);
  commit("Side one"); commit("Side two");
  assert.equal(git(proj, ["checkout", "-q", "main"]).status, 0);
  for (let i = 0; i < 205; i++) commit(`Recent ${i}`);
  const merged = git(proj, ["merge", "--no-ff", "-qm", "Merge side", "side"]); assert.equal(merged.status, 0, merged.stderr);
  const native = git(proj, ["log", "--format=%h"]).stdout.trim().split("\n");
  assert.ok(native.indexOf(hashes[1]) >= 200, "both matching commits lie beyond a complete page");
  const rows = JSON.parse(waypost(proj, ["log", "--harness", "deep", "-n", "2", "--json"]).stdout);
  assert.deepEqual(rows.map(row => row.sha), hashes.slice().reverse());
  const partial = JSON.parse(waypost(proj, ["log", "--harness", "deep", "-n", "3", "--json"]).stdout);
  assert.deepEqual(partial.map(row => row.sha), hashes.slice().reverse());
  const exact = JSON.parse(waypost(proj, ["log", "--task", "EXT-12", "-n", "1", "--json"]).stdout);
  assert.deepEqual(exact.map(row => row.sha), [hashes[0]]);
  const human = waypost(proj, ["log", "--harness", "deep", "-n", "2"]).stdout;
  assert.ok(human.includes("2 of the last 2 commits carry no waypost trailers"));
  const none = waypost(proj, ["log", "--harness", "absent", "-n", "2"]).stdout;
  assert.ok(none.startsWith("no commits match\n")); assert.ok(none.includes("2 of the last 2 commits"));
  for (const args of [["-n"], ["-n", "-1"], ["-n", "1.5"], ["-n", "Infinity"]]) {
    const bad = waypost(proj, ["log", ...args], { expectFail: true });
    assert.notEqual(bad.status, 0); assert.ok(bad.stderr.includes("non-negative safe integer")); assert.equal(bad.stdout, "");
  }
});

test("filtered log reduces an oversized page without enlarging the capture buffer", () => {
  const proj = repo();
  const commit = message => {
    const result = git(proj, ["commit", "--allow-empty", "-q", "-F", "-"], { input: message });
    assert.equal(result.status, 0, result.stderr);
  };
  for (let i = 0; i < 2; i++) commit(`Large old subject ${i} ` + "x".repeat(600 * 1024));
  for (let i = 0; i < 19; i++) commit(`Recent small ${i}`);
  commit("Wanted recent change\n\nWaypost-Harness: wanted\nWaypost-Session: overflow-test");
  const expected = git(proj, ["rev-parse", "--short", "HEAD"]).stdout.trim();
  const result = waypost(proj, ["log", "--harness", "wanted", "-n", "1", "--json"]);
  const rows = JSON.parse(result.stdout);
  assert.equal(rows.length, 1); assert.equal(rows[0].sha, expected);
  assert.equal(rows[0].subject, "Wanted recent change");
  assert.equal(result.stderr, "");
  const human = waypost(proj, ["log", "--harness", "wanted", "-n", "1"]).stdout;
  assert.ok(human.includes(expected) && human.includes("Wanted recent change"));
  assert.ok(!human.includes("Large old subject"), "failed-page content never reaches the report");
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

test("an external task id goes in its own Waypost-Task trailer, with or without a vault, and log matches it exactly", () => {
  // No vault: a bare repository is enough for the trailer.
  const bare = mkdtempSync(join(tmpdir(), "waypost-task-"));
  git(bare, ["init", "-q", "-b", "main"]);
  git(bare, ["config", "user.email", "t@example.com"]);
  git(bare, ["config", "user.name", "T"]);
  writeFileSync(join(bare, "a.txt"), "a\n"); git(bare, ["add", "-A"]);
  waypost(bare, ["commit", "-m", "Bare", "--task", "PROJ-123"]);
  assert.match(git(bare, ["log", "-1", "--format=%(trailers:key=Waypost-Task,valueonly)"]).stdout, /^PROJ-123$/m);

  // A bound vault with no such story: the id is not looked up, and repeats stay separate lines.
  const proj = repo();
  writeFileSync(join(proj, "b.txt"), "b\n"); git(proj, ["add", "b.txt"]);
  waypost(proj, ["commit", "-m", "Two tasks", "--task", "PROJ-123", "--task", "OPS-7"]);
  const lines = git(proj, ["log", "-1", "--format=%(trailers:key=Waypost-Task,valueonly)"]).stdout.trim().split("\n");
  assert.deepEqual(lines, ["PROJ-123", "OPS-7"]);

  assert.match(waypost(proj, ["log", "--task", "PROJ-123"]).stdout, /Two tasks/);
  assert.match(waypost(proj, ["log", "--task", "OPS-7"]).stdout, /Two tasks/);
  assert.match(waypost(proj, ["log", "--task", "PROJ-12"]).stdout, /no commits match/, "PROJ-12 is not PROJ-123");

  for (const bad of [["--task", "a b"], ["--task", "X".repeat(65)], ["--task", "A\x1fB"], ["--task"], ["--task", "--all"], ["--task=PROJ-9"]]) {
    writeFileSync(join(proj, "c.txt"), bad.join("|")); git(proj, ["add", "c.txt"]);
    const r = waypost(proj, ["commit", "-m", "bad", ...bad], { expectFail: true });
    assert.notEqual(r.status, 0, `${JSON.stringify(bad)} must be refused`);
    assert.match(r.stderr, /task id/);
  }
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
const TERMINAL_ENV_VARS = ["WAYPOST_SESSION_ID", "CLAUDE_CODE_SESSION_ID", "CLAUDE_SESSION_ID", "CODEX_SESSION_ID", "CODEX_THREAD_ID",
  "TERM_SESSION_ID", "ITERM_SESSION_ID", "TMUX_PANE", "WT_SESSION", "KITTY_WINDOW_ID", "SSH_TTY"];

function withoutSessionEnv(proj) {
  const env = { ...ambientEnv(), WAYPOST_PROJECT_DIR: proj, WAYPOST_HOME: REPO };
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

test("commit --dry-run previews without touching the real index: pathspec, --tracked and --all", () => {
  const proj = repo();
  const staged = () => (git(proj, ["diff", "--cached", "--name-only"]).stdout || "").split("\n").filter(Boolean);
  writeFileSync(join(proj, "t.txt"), "1\n");
  git(proj, ["add", "t.txt"]);
  git(proj, ["commit", "-qm", "t"]);
  writeFileSync(join(proj, "t.txt"), "2\n");          // tracked, modified
  writeFileSync(join(proj, "a.txt"), "new\n");        // untracked
  writeFileSync(join(proj, "b.txt"), "pre-staged\n"); // already in the index before the preview
  git(proj, ["add", "b.txt"]);

  for (const [mode, expected] of [
    [["--", "a.txt"], ["a.txt", "b.txt"]],
    [["--tracked"], ["t.txt", "b.txt"]],
    [["--all"], ["a.txt", "b.txt", "t.txt"]],
  ]) {
    const r = waypost(proj, ["commit", "--dry-run", "-m", "x", ...mode]);
    const listed = (r.stdout.split("--- would commit ---")[1] || "").split("\n").map((l) => l.trim()).filter(Boolean);
    for (const f of expected) assert.ok(listed.includes(f), `${mode.join(" ")}: ${f} missing from ${JSON.stringify(listed)}`);
    assert.deepEqual(staged(), ["b.txt"], `${mode.join(" ")}: the real index must be exactly as it was`);
  }
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
    encoding: "utf8", cwd: proj, env: { ...ambientEnv(), WAYPOST_PROJECT_DIR: proj, WAYPOST_HOME: REPO },
  });
  assert.notEqual(r.status, 0, "a file that is not a derived view leaves the conflict for a human");
  assert.match(r.stderr, /not a derived view/);
});

// ─── WP-18: the vault path as Windows spells it ────────────────────────

// The fixtures are real directories; what changes is only how the vault path
// is spelled — with `/` as POSIX hands it over, and with `\` as Windows does.
const winSpelled = (p) => p.split("/").join(String.fromCharCode(92));

function withProject(proj, fn) {
  const prev = process.env.WAYPOST_PROJECT_DIR;
  process.env.WAYPOST_PROJECT_DIR = proj;
  try { return fn(); } finally {
    if (prev === undefined) delete process.env.WAYPOST_PROJECT_DIR; else process.env.WAYPOST_PROJECT_DIR = prev;
  }
}

test("a lease another session holds is found over a staged vault file, on either spelling of the vault path (WP-18)", () => {
  const proj = repo();
  const vault = join(proj, "vault");
  waypost(proj, ["lease", join(vault, "epics", "PS-1", "epic.md")], { harness: "codex", session: "other" });
  // Staged paths come from `git diff --cached --name-only`: repo-relative,
  // always with "/". Leases are vault-relative. Mapping one onto the other is
  // what the vault's own prefix is for — and on Windows that prefix never
  // matched, so `waypost commit` stopped seeing any collision at all.
  const staged = ["vault/epics/PS-1/epic.md"];
  withProject(proj, () => {
    for (const vault_path of [vault, winSpelled(vault)]) {
      const hits = leasesOverStaged(staged, { vault_path }, "me");
      assert.equal(hits.length, 1, `a live lease from another session must surface for ${vault_path}`);
      assert.equal(hits[0].session, "other");
    }
  });
});

test("the merge driver re-derives a view rather than merging it, board and folder index alike (WP-18)", () => {
  const proj = repo();
  const tmp = mkdtempSync(join(tmpdir(), "waypost-md-"));
  // %A %O %B %P, as git calls it: the first is the file git wants the result
  // in, the last is the path in the worktree.
  for (const [view, marker] of [["kanban.md", /kanban-plugin: board/], [join("epics", "README.md"), /PS-1/]]) {
    const a = join(tmp, "A");
    for (const [f, text] of [["A", "ours"], ["O", "base"], ["B", "theirs"]]) writeFileSync(join(tmp, f), text + "\n", "utf8");
    const r = spawnSync(process.execPath,
      [join(REPO, "scripts", "merge-derived.mjs"), a, join(tmp, "O"), join(tmp, "B"), join("vault", view)],
      { encoding: "utf8", cwd: proj, env: { ...ambientEnv(), WAYPOST_PROJECT_DIR: proj, WAYPOST_HOME: REPO } });
    // On Windows this exited 1 with "not a derived view" for every one of
    // them, and git kept the conflict markers in a file ADR-0006 says is
    // never merged in the first place.
    assert.equal(r.status, 0, `${view}: ${r.stderr}${r.stdout}`);
    assert.match(r.stderr, /regenerated/);
    assert.match(readFileSync(a, "utf8"), marker, `${view} was re-derived into the file git asked for`);
  }
});

test("Codex thread preserves claims and leases across distinct command parents", () => {
  const proj = repo();
  // Each wrapper stays alive while its child runs, like the harness's shell tool.
  // Unlike spawning waypost directly, these calls really have different ppids.
  const wrapper = 'const {spawnSync}=require("node:child_process"); const r=spawnSync(process.execPath,process.argv.slice(1),{encoding:"utf8"}); process.stdout.write(r.stdout||""); process.stderr.write(r.stderr||""); process.exit(r.status??1);';
  // Keep liveness anchored to this test, not the short-lived wrapper.
  const owner = processTable()?.get(process.pid);
  const call = (args, thread = "thread-one") => {
    const env = { ...withoutSessionEnv(proj), WAYPOST_HARNESS: "codex", CODEX_THREAD_ID: thread, WAYPOST_PROC: owner ? JSON.stringify(owner) : "" };
    const r = spawnSync(process.execPath, ["-e", wrapper, Waypost, ...args], { cwd: proj, env, encoding: "utf8", timeout: 30000 });
    assert.equal(r.status, 0, r.stderr);
    return r;
  };
  const first = JSON.parse(call(["sessions", "--json"]).stdout).session_id;
  assert.equal(first, "codex-thread-one");
  assert.equal(JSON.parse(call(["sessions", "--json"]).stdout).session_id, first);
  assert.notEqual(JSON.parse(call(["sessions", "--json"], "thread-two").stdout).session_id, first);
  call(["draft", "story", "PS-1", "Thread identity", "--write"]);
  const story = join(proj, "vault", "epics", "PS-1", "stories", "story-thread-identity.md");
  call(["story", "plan", story, "--write"]);
  writeFileSync(join(proj, "README.md"), "# Thread identity\n");
  const dry = call(["commit", "-m", "thread", "--story", "PS-1/story-thread-identity", "--dry-run", "--", "README.md"]);
  assert.doesNotMatch(dry.stderr, /is claimed by/);
  call(["lease", "README.md"]);
  assert.ok(JSON.parse(call(["sessions", "--json"]).stdout).leases.some((l) => l.path === "README.md" && l.mine));
  call(["lease", "release"]);
  assert.equal(JSON.parse(call(["sessions", "--json"]).stdout).leases.length, 0);
});


test("story gate reports failed coordination after writing the story", () => {
  const proj = repo();
  waypost(proj, ["draft", "story", "PS-1", "Coordination failure", "--write"]);
  // A file where a presence directory belongs fails portably, including Windows.
  const dir = join(proj, ".git", "waypost", "vault", "presence");
  rmSync(dir, { recursive: true, force: true });
  writeFileSync(dir, "not a directory\n");
  const story = join(proj, "vault", "epics", "PS-1", "stories", "story-coordination-failure.md");
  const result = waypost(proj, ["story", "plan", story, "--write"]);
  assert.match(readFileSync(story, "utf8"), /status: in-progress/);
  assert.match(result.stderr, /story updated, but claim failed; coordination is incomplete/);
  assert.match(result.stderr, /Retry the story command with write access/);
  const closed = waypost(proj, ["story", "close", story, "--write"]);
  assert.match(closed.stderr, /story updated, but release failed/);
  assert.match(closed.stderr, /Retry with `waypost sessions --release`/);
});

test("a commit the team gate refuses for non-local storage says so in one line, with no stack trace and no commit", () => {
  // A Dropbox directory in the path is what storageOf() reads as cloud storage,
  // the same stand-in tests/team-store.test.mjs uses for authority-nonlocal.
  const proj = join(mkdtempSync(join(tmpdir(), "waypost-c-")), "Dropbox", "p");
  mkdirSync(proj, { recursive: true });
  git(proj, ["init", "-q", "-b", "main"]);
  git(proj, ["config", "user.email", "t@example.com"]);
  git(proj, ["config", "user.name", "T"]);
  waypost(proj, ["bind", join(proj, "vault")]);
  // Refused only where an authority already exists: one made from a machine on
  // which this disk is local, read back from one on which it is not.
  mkdirSync(join(proj, ".git", "waypost", "vault", "teams", "authority"), { recursive: true });
  writeFileSync(join(proj, ".git", "waypost", "vault", "teams", "authority", "identity.json"), "{}\n");
  writeFileSync(join(proj, "a.txt"), "a\n");
  git(proj, ["add", "a.txt"]);
  const r = waypost(proj, ["commit", "-m", "add a"], { expectFail: true });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^waypost commit: refused: the team authority must live on local storage, and this checkout is on Dropbox, cloud\./);
  assert.doesNotMatch(r.stderr, /\n\s+at /, "no stack trace");
  assert.notEqual(git(proj, ["rev-parse", "--verify", "-q", "HEAD"]).status, 0, "nothing was committed");
});

test("an EMPTY team authority on non-local storage does not block a commit — no team there to protect (WP-19)", () => {
  // The same checkout seen over a share from a second machine: the first one
  // created the authority directory on its local disk and nothing more.
  const proj = join(mkdtempSync(join(tmpdir(), "waypost-c-")), "Dropbox", "p");
  mkdirSync(proj, { recursive: true });
  git(proj, ["init", "-q", "-b", "main"]);
  git(proj, ["config", "user.email", "t@example.com"]);
  git(proj, ["config", "user.name", "T"]);
  waypost(proj, ["bind", join(proj, "vault")]);
  const authority = join(proj, ".git", "waypost", "vault", "teams", "authority");
  mkdirSync(authority, { recursive: true });
  writeFileSync(join(proj, "a.txt"), "a\n");
  git(proj, ["add", "a.txt"]);
  const r = waypost(proj, ["commit", "-m", "add a"]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(git(proj, ["rev-parse", "--verify", "-q", "HEAD"]).status, 0, "committed");
  assert.deepEqual(readdirSync(authority), [], "and nothing was written into it");
});
