// waypost — tests for scripts/cleanup.mjs and `waypost clean` (WP-17, the
// clean-plan story). Pure units for the classification functions, and a few
// end-to-end CLI checks through a hermetic project + machine-state directory
// — never the real toolchain registry, never a real project or cache path.
// Removal is not exercised here at all: `--apply` lands with the next
// commit, and every plan below is read-only by construction.
//   node --test tests/cleanup.test.mjs

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir, homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  itemId, runningTools, refusePath, routeFor, classifyItem, classify,
  orderOldestFirst, countedBytes, pickUnderLimit, recheck, consent, logLine,
  TEN_MINUTES_MS, DAY_MS, DEFAULT_PROJECT_STALE_DAYS, DEFAULT_MACHINE_STALE_DAYS,
} from "../scripts/cleanup.mjs";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const Waypost = join(REPO, "bin", "waypost");
const GB = 1024 ** 3;

const ROOTS = [];
function tmpRoot(prefix) {
  const p = mkdtempSync(join(tmpdir(), prefix));
  ROOTS.push(p);
  return p;
}
after(() => { for (const p of ROOTS) { try { rmSync(p, { recursive: true, force: true }); } catch { /* best effort */ } } });

function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout;
}

// A base item with every field classifyItem reads, so each test only
// overrides what it cares about.
function baseItem(overrides = {}) {
  return {
    scope: "project", path: "/proj/tgt", bytes: 1000, newest_ms: Date.now() - 20 * DAY_MS,
    nested_git: false, in_nested_repo: false, unreadable: false, match: "tag",
    tool: null, origin: null, regenerable: true, stale_days: null, clean: null, clean_argv: null,
    ...overrides,
  };
}

// ─── itemId ──────────────────────────────────────────────────────────────

test("itemId: stable for the same (scope, path), different for a different scope or path, and scope-prefixed", () => {
  const a = itemId("project", "/proj/tgt");
  const b = itemId("project", "/proj/tgt");
  assert.equal(a, b, "the same input always hashes the same");
  assert.match(a, /^p-[0-9a-f]{10}$/);
  const machine = itemId("machine", "/proj/tgt");
  assert.match(machine, /^m-[0-9a-f]{10}$/);
  assert.notEqual(a, machine, "scope changes the prefix, so the two ids never collide");
  const other = itemId("project", "/proj/other");
  assert.notEqual(a, other, "a different path hashes differently");
});

// ─── runningTools ────────────────────────────────────────────────────────

test("runningTools: matches by basename, case-insensitively, .exe stripped, and by the first 15 characters of a truncated Linux comm", () => {
  const entries = [
    { id: "rust", processes: ["cargo", "rustc"] },
    { id: "xcode", processes: ["xcodebuild", "XCBBuildService"] },
    { id: "unrelated", processes: ["something-else"] },
  ];
  const running = runningTools(entries, ["/usr/local/bin/Cargo.exe", "/opt/xcbbuildservice-but-truncated-longer-than-15"]);
  assert.ok(running.has("rust"), "matched case-insensitively with .exe stripped");
  assert.ok(running.has("xcode"), "matched by the first 15 characters of a longer/truncated comm");
  assert.ok(!running.has("unrelated"));
});

test("runningTools: an entry with no processes, or none running, contributes nothing", () => {
  const entries = [{ id: "no-processes" }, { id: "rust", processes: ["cargo"] }];
  assert.deepEqual([...runningTools(entries, ["bash", "node"])], []);
});

// ─── refusePath ──────────────────────────────────────────────────────────

test("refusePath: refuses the filesystem root, home, the project root, the state dir, and any ancestor of them", () => {
  const facts = { home: "/Users/x", root: "/Users/x/code/proj", stateDir: "/Users/x/Library/Application Support/Waypost", platform: "linux" };
  assert.equal(refusePath("/", facts), true);
  assert.equal(refusePath("/Users/x", facts), true, "home itself");
  assert.equal(refusePath("/Users", facts), true, "an ancestor of home");
  assert.equal(refusePath("/Users/x/code/proj", facts), true, "the project root itself");
  assert.equal(refusePath("/Users/x/code", facts), true, "an ancestor of the project root");
  assert.equal(refusePath(facts.stateDir, facts), true, "the state dir itself");
});

test("refusePath: never refuses a path merely INSIDE home, the root, or the state dir — that is the whole point of a cache path", () => {
  const facts = { home: "/Users/x", root: "/Users/x/code/proj", stateDir: "/Users/x/Library/Application Support/Waypost", platform: "linux" };
  assert.equal(refusePath("/Users/x/.cargo/registry", facts), false);
  assert.equal(refusePath("/Users/x/code/proj/target", facts), false);
  assert.equal(refusePath(join(facts.stateDir, "slots.host"), facts), false);
});

test("refusePath: case-folded on darwin and win32, a bare Windows drive root is refused", () => {
  const facts = { home: "/Users/X", root: "/Users/X/proj", platform: "darwin" };
  assert.equal(refusePath("/USERS/X", facts), true, "darwin folds case");
  assert.equal(refusePath("C:", { platform: "win32" }), true);
  assert.equal(refusePath("c:/", { platform: "win32" }), true);
  const linuxFacts = { home: "/home/X", root: "/home/X/proj", platform: "linux" };
  assert.equal(refusePath("/HOME/X", linuxFacts), false, "linux is case-sensitive, so this is just an unrelated path");
});

// ─── routeFor ────────────────────────────────────────────────────────────

test("routeFor: a manual machine cache has no route; one with clean_argv routes through it; otherwise waypost removes it itself", () => {
  assert.equal(routeFor({ scope: "machine", manual: true }), null);
  assert.deepEqual(routeFor({ scope: "machine", clean_argv: ["tool", "clean"] }), { kind: "tool-clean-argv", argv: ["tool", "clean"] });
  assert.deepEqual(routeFor({ scope: "machine" }), { kind: "waypost-remove" });
});

test("routeFor: a project item holding a nested repository, or found inside one, has no route", () => {
  assert.equal(routeFor({ scope: "project", match: "sure", nested_git: true }), null);
  assert.equal(routeFor({ scope: "project", match: "sure", in_nested_repo: true }), null);
});

// The ADR's own order (Decision 5), as a table: shipped clean_argv first
// (the whole directory is the tool's own output); then, once confirmed
// ignored, git clean -X — for ANY match kind, tag included; only THEN, for
// a match not (yet) confirmed ignored, a tag or a shipped sure/locator
// falls back to waypost's own route; everything else has none.
test("routeFor: the route table — clean_argv, then ignored, then tag/shipped-sure/shipped-locator, else none", () => {
  const cases = [
    // shipped clean_argv wins outright, whatever match/ignored say.
    [{ scope: "project", match: "sure", origin: "shipped", clean_argv: ["tool", "clean"], ignored: true },
      { kind: "tool-clean-argv", argv: ["tool", "clean"] }, "shipped clean_argv, ignored too"],
    [{ scope: "project", match: "tag", origin: "shipped", clean_argv: ["tool", "clean"] },
      { kind: "tool-clean-argv", argv: ["tool", "clean"] }, "shipped clean_argv on a tag match"],
    // ignored === true routes through git clean -X for every match kind —
    // this is the fix: an ignored tag no longer gets waypost's own route.
    [{ scope: "project", match: "tag", ignored: true }, { kind: "git-clean-x" }, "an ignored tag"],
    [{ scope: "project", match: "sure", origin: "shipped", ignored: true }, { kind: "git-clean-x" }, "an ignored shipped sure match"],
    [{ scope: "project", match: "generic", origin: "shipped", ignored: true }, { kind: "git-clean-x" }, "an ignored generic match (the walk's own only way to produce one)"],
    [{ scope: "project", match: "sure", origin: "project", ignored: true }, { kind: "git-clean-x" }, "an ignored project-origin sure match"],
    // not (yet) confirmed ignored: only a tag, or a shipped sure/locator,
    // falls back to waypost's own route — this is the other half of the
    // fix: an un-ignored shipped sure match no longer gets git clean -X,
    // which would remove nothing since that command only touches ignored
    // paths.
    [{ scope: "project", match: "tag" }, { kind: "waypost-remove" }, "a tag, ignored status unknown"],
    [{ scope: "project", match: "sure", origin: "shipped" }, { kind: "waypost-remove" }, "an un-ignored shipped sure match"],
    [{ scope: "project", match: "locator", origin: "shipped" }, { kind: "waypost-remove" }, "an un-ignored shipped locator match"],
    // no route: a generic match never reaches here un-ignored in practice
    // (the walk only ever reports one already confirmed ignored), a
    // project-origin sure/locator match is never waypost's own to run, and
    // origin: null (no owning entry at all) never gets the shipped fallback.
    [{ scope: "project", match: "generic", origin: "shipped" }, null, "an un-ignored generic match"],
    [{ scope: "project", match: "sure", origin: "project" }, null, "an un-ignored project-origin sure match"],
    [{ scope: "project", match: "locator", origin: null }, null, "a locator match with no owning entry"],
  ];
  for (const [item, expected, label] of cases) {
    assert.deepEqual(routeFor(item), expected, label);
  }
});

// ─── classifyItem: AC 8 — regenerable defaults keep ──────────────────────

test("AC 8: an entry that does not state regenerable: true is keep, whatever its age", () => {
  const r = classifyItem(baseItem({ regenerable: false, match: "sure", origin: "shipped" }), { now: Date.now() });
  assert.equal(r.class, "keep");
  assert.match(r.reason, /regenerable/);
});

test("AC 8: a bare CACHEDIR.TAG match is regenerable by convention even with no owning entry", () => {
  const r = classifyItem(baseItem({ match: "tag", tool: null, origin: null, regenerable: true }), { now: Date.now() });
  assert.notEqual(r.class, "keep");
});

// ─── classifyItem: AC 9 — recency, leases, shared checkout ───────────────

test("AC 9: an item modified within the last 10 minutes is keep, whatever else is true", () => {
  const r = classifyItem(baseItem({ match: "tag", newest_ms: Date.now() - 1000 }), { now: Date.now() });
  assert.equal(r.class, "keep");
  assert.match(r.reason, /10 minutes/);
});

test("AC 9: a running tool's own item is keep", () => {
  const r = classifyItem(
    baseItem({ match: "sure", origin: "shipped", tool: "rust" }),
    { now: Date.now(), runningTools: new Set(["rust"]) },
  );
  assert.equal(r.class, "keep");
  assert.match(r.reason, /process is running/);
});

test("AC 9: leased by another session, overlapping the item's path in either direction, is keep", () => {
  const facts = { now: Date.now(), leases: [{ path: "/proj/tgt/inner", session: "other", host: "otherbox" }] };
  const r = classifyItem(baseItem({ match: "tag", path: "/proj/tgt" }), facts);
  assert.equal(r.class, "keep");
  assert.match(r.reason, /leased by other/);
  assert.match(r.reason, /otherbox/);

  const facts2 = { now: Date.now(), leases: [{ path: "/proj", session: "other" }] };
  const r2 = classifyItem(baseItem({ match: "tag", path: "/proj/tgt" }), facts2);
  assert.equal(r2.class, "keep", "a lease on an ancestor directory overlaps too");
});

test("AC 9: a live peer on the project caps project artifacts at can, even when idle enough to be should", () => {
  const idle = baseItem({ match: "tag", newest_ms: Date.now() - 40 * DAY_MS });
  const solo = classifyItem(idle, { now: Date.now(), sharedProject: false });
  assert.equal(solo.class, "should", "no shared checkout — this item would otherwise be should");
  const shared = classifyItem(idle, { now: Date.now(), sharedProject: true });
  assert.equal(shared.class, "can");
  assert.match(shared.reason, /another host/);
});

test("AC 9: a machine cache is never capped by sharedProject — only project artifacts are", () => {
  const idle = baseItem({ scope: "machine", match: null, newest_ms: Date.now() - 40 * DAY_MS });
  const r = classifyItem(idle, { now: Date.now(), sharedProject: true });
  assert.equal(r.class, "should");
});

// ─── classifyItem: caps at "can" ──────────────────────────────────────────

test("a manual machine cache is capped at can and never keep merely for having no route", () => {
  const idle = baseItem({ scope: "machine", match: null, manual: true, newest_ms: Date.now() - 40 * DAY_MS });
  const r = classifyItem(idle, { now: Date.now() });
  assert.equal(r.class, "can");
  assert.match(r.reason, /manual/);
  assert.equal(r.route, null);
});

test("a manual machine cache still reads as keep when it is genuinely in use", () => {
  const recent = baseItem({ scope: "machine", match: null, manual: true, newest_ms: Date.now() - 1000 });
  const r = classifyItem(recent, { now: Date.now() });
  assert.equal(r.class, "keep");
  assert.match(r.reason, /10 minutes/);
});

test("a generic name is capped at can, even when idle enough to be should", () => {
  // The walk only ever reports a generic match already confirmed ignored —
  // ignored: true reflects that, so this item has a route (git-clean-x) to
  // even be eligible for the cap in the first place.
  const idle = baseItem({ match: "generic", origin: "shipped", ignored: true, newest_ms: Date.now() - 40 * DAY_MS });
  const r = classifyItem(idle, { now: Date.now() });
  assert.equal(r.class, "can");
  assert.match(r.reason, /generic name/);
});

test("an unknown age never reaches should", () => {
  const r = classifyItem(baseItem({ match: "tag", newest_ms: null }), { now: Date.now() });
  assert.equal(r.class, "can");
  assert.match(r.reason, /age unknown/);
});

test("an unreadable item is capped at can, even with an old newest_ms that would otherwise be should", () => {
  const r = classifyItem(baseItem({ match: "tag", unreadable: true, newest_ms: Date.now() - 40 * DAY_MS }), { now: Date.now() });
  assert.equal(r.class, "can");
  assert.match(r.reason, /age unknown/);
  assert.match(r.reason, /could not be read/);
});

test("a partial item (the walk's own budget cut its byte summation short) is capped at can the same way", () => {
  const r = classifyItem(baseItem({ match: "tag", partial: true, newest_ms: Date.now() - 40 * DAY_MS }), { now: Date.now() });
  assert.equal(r.class, "can");
  assert.match(r.reason, /could not be read/);
});

test("unreadable overrides every other cap's own reason too — it is checked first", () => {
  const r = classifyItem(
    baseItem({ scope: "machine", match: null, manual: true, unreadable: true, newest_ms: Date.now() - 40 * DAY_MS }),
    { now: Date.now() },
  );
  assert.equal(r.class, "can");
  assert.match(r.reason, /could not be read/, "the manual reason must not shadow the more important unreadable warning");
});

// ─── classifyItem: project artifact origin and tracked-file checks ──────

test("a project-origin sure match nobody confirmed git-ignores is keep", () => {
  const r = classifyItem(baseItem({ match: "sure", origin: "project", ignored: false }), { now: Date.now() });
  assert.equal(r.class, "keep");
  assert.match(r.reason, /does not ignore/);
});

test("a project item confirmed to hold a tracked file is keep, whatever its match kind", () => {
  const r = classifyItem(baseItem({ match: "sure", origin: "shipped", tracked: true }), { now: Date.now() });
  assert.equal(r.class, "keep");
  assert.match(r.reason, /tracked file/);
});

test("a refused path (home, the project root, a filesystem root) is keep, before anything else is even checked", () => {
  const r = classifyItem(baseItem({ path: "/Users/x", regenerable: false }), { now: Date.now(), home: "/Users/x" });
  assert.equal(r.class, "keep");
  assert.match(r.reason, /protected path/);
});

test("a nested repository — holding one, or found inside one — is always keep", () => {
  assert.equal(classifyItem(baseItem({ nested_git: true }), { now: Date.now() }).class, "keep");
  assert.equal(classifyItem(baseItem({ in_nested_repo: true }), { now: Date.now() }).class, "keep");
});

// ─── orderOldestFirst / countedBytes / pickUnderLimit ────────────────────

test("orderOldestFirst: oldest newest_ms first, ties broken by path in code-unit order", () => {
  const items = [
    { path: "b", newest_ms: 100 },
    { path: "a", newest_ms: 100 },
    { path: "z", newest_ms: 50 },
    { path: "y", newest_ms: null },
  ];
  const ordered = orderOldestFirst(items).map((i) => i.path);
  assert.deepEqual(ordered, ["z", "a", "b", "y"], "unknown age sorts last, ties go by path");
});

test("countedBytes: only project items that are a tag match, or a sure match confirmed git-ignored, count", () => {
  const items = [
    { scope: "project", match: "tag", bytes: 100 },
    { scope: "project", match: "sure", ignored: true, bytes: 200 },
    { scope: "project", match: "sure", ignored: false, bytes: 9999 },
    { scope: "project", match: "generic", ignored: true, bytes: 9999 },
    { scope: "machine", match: null, bytes: 9999 },
  ];
  assert.equal(countedBytes(items), 300);
});

// AC 11: given a limit, the plan picks from the idle (should) items, oldest
// first, those that bring the counted total under it; items used within
// stale_days stay can and are never picked.
test("AC 11: a limit picks should items of the counted kinds, oldest first, only as many as bring the total under it", () => {
  const now = Date.now();
  const items = [
    baseItem({ path: "/proj/oldest", match: "tag", bytes: 300 * 1024 * 1024, newest_ms: now - 40 * DAY_MS }),
    baseItem({ path: "/proj/older", match: "tag", bytes: 300 * 1024 * 1024, newest_ms: now - 30 * DAY_MS }),
    baseItem({ path: "/proj/recent-but-idle-enough", match: "tag", bytes: 300 * 1024 * 1024, newest_ms: now - 8 * DAY_MS }),
    // Within stale_days: can, never picked, however large.
    baseItem({ path: "/proj/fresh", match: "tag", bytes: 1000 * 1024 * 1024, newest_ms: now - 1 * DAY_MS }),
  ];
  // The counted total (Decision 3: "idle or not") is all four tag items,
  // 1900 MiB, because a limit's total tracks everything of the qualifying
  // kind, not just what happens to be idle. Picking the oldest (300) leaves
  // 1600, still over a 1300 MiB limit, so the second-oldest is picked too
  // (leaves 1300, at the limit — "at or under" stops there); the third
  // should item and the fresh can item are never touched.
  const limitBytes = 1300 * 1024 * 1024;
  const classified = classify(items, { now }, { now, limit: limitBytes });
  const oldest = classified.find((i) => i.path === "/proj/oldest");
  const older = classified.find((i) => i.path === "/proj/older");
  const recent = classified.find((i) => i.path === "/proj/recent-but-idle-enough");
  const fresh = classified.find((i) => i.path === "/proj/fresh");
  assert.equal(fresh.class, "can", "within stale_days, never should");
  assert.equal(fresh.picked, false, "a can item is never picked, however large");
  assert.equal(oldest.class, "should");
  assert.equal(older.class, "should");
  assert.equal(recent.class, "should");
  assert.equal(oldest.picked, true, "the oldest qualifying item is always picked first");
  assert.equal(older.picked, true, "one item was not enough to reach the limit, so the next-oldest is picked too");
  assert.equal(recent.picked, false, "enough was freed by the two oldest — no need to pick this one too");
});

test("pickUnderLimit: a limit already under the counted total picks nothing", () => {
  const classified = [
    { path: "a", scope: "project", match: "tag", bytes: 100, class: "should", newest_ms: 1 },
  ];
  assert.equal(pickUnderLimit(classified, 1000).size, 0);
});

test("pickUnderLimit: no limit given picks nothing", () => {
  const classified = [{ path: "a", scope: "project", match: "tag", bytes: 100, class: "should", newest_ms: 1 }];
  assert.equal(pickUnderLimit(classified, null).size, 0);
  assert.equal(pickUnderLimit(classified, undefined).size, 0);
});

// ─── classify() end to end (pure) ─────────────────────────────────────────

test("classify: every item gets a stable id and a class; picked is false without a limit", () => {
  const items = [baseItem({ path: "/proj/a" }), baseItem({ path: "/proj/b", regenerable: false })];
  const out = classify(items, {}, { now: Date.now() });
  assert.equal(out.length, 2);
  assert.ok(out.every((i) => typeof i.id === "string" && i.id.startsWith("p-")));
  assert.ok(out.every((i) => i.picked === false));
  assert.equal(out.find((i) => i.path === "/proj/b").class, "keep");
});

// ─── recheck ───────────────────────────────────────────────────────────────

test("recheck: gone, or replaced by a symlink, is reported changed and kept, never classified should/can", () => {
  const item = baseItem({ match: "tag" });
  const gone = recheck(item, { exists: false }, { now: Date.now() });
  assert.equal(gone.class, "keep");
  assert.equal(gone.changed, true);
  const symlinked = recheck(item, { exists: true, is_symlink: true }, { now: Date.now() });
  assert.equal(symlinked.class, "keep");
  assert.equal(symlinked.changed, true);
});

test("recheck: an identity change (dev/ino) between the plan and now is reported, even if the fresh facts would otherwise classify it should", () => {
  const item = baseItem({ match: "tag", dev: 1, ino: 42, newest_ms: Date.now() - 40 * DAY_MS });
  const fresh = { exists: true, dev: 1, ino: 999, newest_ms: Date.now() - 40 * DAY_MS, nested_git: false, unreadable: false };
  const r = recheck(item, fresh, { now: Date.now() });
  assert.equal(r.changed, true);
  assert.equal(r.class, "should", "still classified normally — bin/waypost's own caller is the one that must skip a changed item");
});

test("recheck: no identity on the original item (never captured) never falsely reports changed", () => {
  const item = baseItem({ match: "tag", dev: null, ino: null });
  const fresh = { exists: true, dev: 5, ino: 6, newest_ms: item.newest_ms, nested_git: false, unreadable: false };
  const r = recheck(item, fresh, { now: Date.now() });
  assert.equal(r.changed, false);
});

// ─── consent / logLine ─────────────────────────────────────────────────────

test("consent: --yes with a reason is a final yes; a terminal with no harness needs an actual prompt; otherwise refused, naming the escape hatch", () => {
  assert.deepEqual(consent({ yes: true, reason: "the owner agreed" }), { method: "flag", ok: true, reason: "the owner agreed" });
  assert.deepEqual(consent({ isTTY: true, harnessDetected: false }), { method: "prompt", ok: null });
  const refused = consent({});
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /waypost prompt cleanup/);
});

test("consent: --yes without a reason, or a harness detected even on a terminal, is refused", () => {
  assert.equal(consent({ yes: true }).ok, false);
  assert.equal(consent({ isTTY: true, harnessDetected: true }).ok, false);
});

test("logLine: one JSON object per call, tagged as an apply, with every field passed through", () => {
  const line = logLine({ time: "2026-01-01T00:00:00.000Z", host: "h", session: "s" });
  assert.doesNotThrow(() => JSON.parse(line));
  const parsed = JSON.parse(line);
  assert.equal(parsed.kind, "apply");
  assert.equal(parsed.host, "h");
  assert.equal(typeof parsed.v, "number");
});

// ─── constants ───────────────────────────────────────────────────────────

test("the default stale windows are 7 days for project artifacts, 30 for machine caches, per the ADR", () => {
  assert.equal(DEFAULT_PROJECT_STALE_DAYS, 7);
  assert.equal(DEFAULT_MACHINE_STALE_DAYS, 30);
  assert.equal(TEN_MINUTES_MS, 10 * 60 * 1000);
});

// ─── bin/waypost clean: end to end, hermetic ──────────────────────────────

// A machine-state-only fixture: WAYPOST_HOME points at a toolchains/
// directory this suite writes itself, empty unless a test needs a
// particular entry — the real ~45-entry shipped registry is never touched
// or measured by anything below.
function fakeToolchainsHome(entries = []) {
  const home = tmpRoot("waypost-cleanup-fakehome-");
  const dir = join(home, "toolchains");
  mkdirSync(dir, { recursive: true });
  for (const e of entries) {
    writeFileSync(join(dir, `${e.id}.json`), JSON.stringify({
      name: e.id, os: ["darwin", "linux", "win32"], detect: { bins: [], manifests: [] },
      artifacts: [], skip: [], caches: [], locators: [], ...e,
    }), "utf8");
  }
  return home;
}

function machineEnv(home, fakeHome, extra = {}) {
  return {
    ...process.env, HOME: home, USERPROFILE: home, XDG_STATE_HOME: home, LOCALAPPDATA: home,
    WAYPOST_HOME: fakeHome, WAYPOST_NO_BEAT: "1",
    WAYPOST_CAPACITY_PROBE: JSON.stringify({ cores: 8, busy: 0, available: 8 * GB, total: 16 * GB }),
    ...extra,
  };
}

function runClean(proj, home, fakeHome, args = [], extra = {}) {
  return spawnSync(process.execPath, [Waypost, "clean", ...args], {
    encoding: "utf8", cwd: proj, timeout: 20000,
    env: { ...machineEnv(home, fakeHome, extra), WAYPOST_PROJECT_DIR: proj },
  });
}

function tagProjectFixture() {
  const root = tmpRoot("waypost-cleanup-project-");
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  mkdirSync(join(root, "tgt"), { recursive: true });
  writeFileSync(join(root, "tgt", "CACHEDIR.TAG"), "Signature: 8a477f597d28d172789f06886806bc55\n", "utf8");
  writeFileSync(join(root, "tgt", "obj.bin"), Buffer.alloc(20000, 1));
  writeFileSync(join(root, "README.md"), "hi\n", "utf8");
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-q", "-m", "init"]);
  return root;
}

test("waypost clean --json: a tagged directory appears with a class and reason, never as bytes-only", () => {
  const root = tagProjectFixture();
  const home = tmpRoot("waypost-cleanup-home-");
  const fakeHome = fakeToolchainsHome([]);
  const r = runClean(root, home, fakeHome, ["--json"]);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  const item = out.items.find((i) => i.rel === "tgt");
  assert.ok(item, JSON.stringify(out.items));
  assert.equal(item.scope, "project");
  assert.equal(item.match, "tag");
  assert.ok(["should", "can", "keep"].includes(item.class));
  assert.ok(typeof item.reason === "string" && item.reason.length > 0);
});

// AC 1: a non-ignored CACHEDIR.TAG directory holding a tracked file is kept,
// with the report saying why — the exact scenario the gitFacts fix (all
// candidates checked for tracked-ness, not only the ignored ones) exists
// for.
test("AC 1: a non-ignored CACHEDIR.TAG directory holding a tracked file is keep ‘holds a tracked file’, never routed for removal", () => {
  const root = tmpRoot("waypost-cleanup-tracked-tag-");
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  mkdirSync(join(root, "tgt"), { recursive: true });
  writeFileSync(join(root, "tgt", "CACHEDIR.TAG"), "Signature: 8a477f597d28d172789f06886806bc55\n", "utf8");
  // No .gitignore at all — this directory is never ignored — and it holds
  // a file someone committed on purpose.
  writeFileSync(join(root, "tgt", "kept.txt"), "tracked on purpose", "utf8");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "init"]);

  const home = tmpRoot("waypost-cleanup-tracked-tag-home-");
  const fakeHome = fakeToolchainsHome([]);
  const r = runClean(root, home, fakeHome, ["--json"]);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  const item = out.items.find((i) => i.rel === "tgt");
  assert.ok(item, JSON.stringify(out.items));
  assert.equal(item.class, "keep");
  assert.match(item.reason, /tracked file/);
  assert.equal(item.route, null, "never given a route to remove it through");
});

// AC 10: a project root carrying CACHEDIR.TAG never appears in the plan.
test("AC 10: a project root that itself carries CACHEDIR.TAG never appears as an item", () => {
  const root = tmpRoot("waypost-cleanup-roottag-");
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  writeFileSync(join(root, "CACHEDIR.TAG"), "Signature: 8a477f597d28d172789f06886806bc55\n", "utf8");
  writeFileSync(join(root, "big.bin"), Buffer.alloc(20000, 2));
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "init"]);

  const home = tmpRoot("waypost-cleanup-home2-");
  const fakeHome = fakeToolchainsHome([]);
  const r = runClean(root, home, fakeHome, ["--json"]);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.ok(!out.items.some((i) => i.path === root || i.rel === ""), JSON.stringify(out.items));
});

// AC 9 end to end: another live session's lease on a path is honoured by the
// plan, exactly the way the pure unit test above proves in isolation.
test("AC 9 (e2e): a directory leased by another live session shows keep \u2018leased by other\u2019", () => {
  const root = tagProjectFixture();
  spawnSync(process.execPath, [Waypost, "bind", join(root, "vault")], {
    encoding: "utf8", env: { ...process.env, WAYPOST_PROJECT_DIR: root, WAYPOST_HOME: REPO, WAYPOST_NO_BEAT: "1" },
  });

  // "other" leases the tagged directory and beats presence for itself (no
  // WAYPOST_NO_BEAT here — this is exactly what makes it "live" to the plan
  // run moments later).
  const leaseResult = spawnSync(process.execPath, [Waypost, "lease", "tgt"], {
    encoding: "utf8", cwd: root,
    env: { ...process.env, WAYPOST_PROJECT_DIR: root, WAYPOST_HOME: REPO, WAYPOST_SESSION_ID: "other" },
  });
  assert.equal(leaseResult.status, 0, leaseResult.stderr);

  const home = tmpRoot("waypost-cleanup-home3-");
  const fakeHome = fakeToolchainsHome([]);
  // The fixture directory was just created, so it is well within the
  // 10-minute recency window on its own — moving the clock forward with
  // WAYPOST_CLEAN_NOW (ctime cannot be backdated) is what actually exercises
  // the lease check rather than recency alone.
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const r = runClean(root, home, fakeHome, ["--json"], { WAYPOST_SESSION_ID: "me", WAYPOST_CLEAN_NOW: future });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /WAYPOST_CLEAN_NOW/);
  const out = JSON.parse(r.stdout);
  const item = out.items.find((i) => i.rel === "tgt");
  assert.ok(item, JSON.stringify(out.items));
  assert.equal(item.class, "keep");
  assert.match(item.reason, /leased by other/);
});

test("waypost clean --apply: refused with a clear message, exit 1, before anything is scanned", () => {
  const root = tagProjectFixture();
  const r = spawnSync(process.execPath, [Waypost, "clean", "--apply", "p-doesnotmatter"], {
    encoding: "utf8", cwd: root, env: { ...process.env, WAYPOST_PROJECT_DIR: root, WAYPOST_NO_BEAT: "1" },
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /removal lands with the next commit/);
});

test("waypost help lists clean", () => {
  const r = spawnSync(process.execPath, [Waypost, "help"], { encoding: "utf8", env: { ...process.env, WAYPOST_NO_BEAT: "1" } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^\s+clean \[--json\]/m);
});

// ─── sanity on this exact checkout ───────────────────────────────────────

test("node --check passes on scripts/cleanup.mjs", () => {
  const r = spawnSync(process.execPath, ["--check", join(REPO, "scripts", "cleanup.mjs")], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});

// AC 15 (the disk-hygiene ADR's part): the two guards on scripts/cleanup.mjs
// select it and pass — no finding for this ADR from doctor at all.
test("the disk-hygiene ADR's guards select scripts/cleanup.mjs too, and all pass", () => {
  const r = spawnSync(process.execPath, [Waypost, "doctor", "--json"], {
    encoding: "utf8", cwd: REPO, env: { ...process.env, WAYPOST_NO_BEAT: "1" },
  });
  const findings = JSON.parse(r.stdout);
  const adrFile = "adr/disk-hygiene-by-discovery-a-toolchain-registry-a-machine-and-project-profile-and-cleanup-only-after-a-yes.md";
  const ours = findings.filter((f) => f.file === adrFile);
  assert.deepEqual(ours, [], JSON.stringify(ours));
});
