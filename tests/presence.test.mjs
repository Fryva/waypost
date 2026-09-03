// waypost — presence, leases and cross-OS safety on a shared vault (ADR-0007).
// The cases that matter here cannot be produced by running the tool normally:
// a peer whose clock is wrong, a sync client that duplicates a file, a device
// that vanishes. They are constructed on disk directly.
//   node --test tests/*.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir, hostname } from "node:os";
import { spawnSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  beat, peers, acquire, release, readLeases, winnerOf, storageOf, presenceDir, leaseDir, vaultRel,
  prunePresence, LIVE_WINDOW_MS,
} from "../scripts/presence.mjs";
import { claimsOf } from "../scripts/sessions.mjs";
import { checkPortableNames } from "../scripts/doctor.mjs";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const Waypost = join(REPO, "bin", "waypost");

function project() {
  const proj = mkdtempSync(join(tmpdir(), "waypost-p-"));
  spawnSync("git", ["init", "-q"], { cwd: proj });
  spawnSync(process.execPath, [Waypost, "bind", join(proj, "vault")], {
    encoding: "utf8", env: { ...process.env, WAYPOST_PROJECT_DIR: proj, WAYPOST_HOME: REPO },
  });
  return { proj, vault: join(proj, "vault") };
}

// A peer on another device, written the way that device would write it. Like
// `beat()`, a rewrite of an existing record keeps its started_at (that is what
// tells "same session, still here" from "same id, new session"); pass
// `started_at` explicitly to write a fresh incarnation.
function peerFile(vault, { session, seq = 1, at = new Date().toISOString(), host = "otherbox", os = "win32-10", harness = "codex", claim = null, started_at = null }) {
  mkdirSync(presenceDir(vault), { recursive: true });
  const file = join(presenceDir(vault), `${session}.json`);
  let prev = null;
  try { prev = JSON.parse(readFileSync(file, "utf8")); } catch {}
  writeFileSync(file, JSON.stringify({
    session, host, os, harness, seq, at, started_at: started_at || (prev && prev.started_at) || at, project_root: `C:\\work\\proj`, claim,
  }, null, 2), "utf8");
}

// A lease as the other device would have written it: its own host, OS and
// harness. Writing it locally would describe THIS machine, which is exactly the
// distinction the protocol is about.
//
// The filename is keyed by session (C-1/G-3: two sessions racing on one path
// must land in two different files, never the same one) — parameterized by
// `session` rather than a fixed "remote" suffix, so two fake remote leases for
// the same path (two different sessions) do not collide with each other on
// disk either.
function leaseFile(vault, { path, session, host = "otherbox", os = "win32", harness = "cursor", acquired_at = new Date().toISOString() }) {
  mkdirSync(leaseDir(vault), { recursive: true });
  const slug = `${path.replace(/[^\w.-]+/g, "_").slice(0, 80)}.remote.${String(session).replace(/[^\w.-]+/g, "_")}.json`;
  writeFileSync(join(leaseDir(vault), slug), JSON.stringify({ path, session, host, os, harness, acquired_at }, null, 2), "utf8");
}

function withProject(proj, fn) {
  const prev = process.env.WAYPOST_PROJECT_DIR;
  process.env.WAYPOST_PROJECT_DIR = proj;
  try { return fn(); } finally {
    if (prev === undefined) delete process.env.WAYPOST_PROJECT_DIR; else process.env.WAYPOST_PROJECT_DIR = prev;
  }
}

// ─── liveness without a shared clock ───────────────────────────────────

test("a peer whose clock is hours off is still judged by OUR clock", () => {
  const { proj, vault } = project();
  withProject(proj, () => {
    // First sight: we have no history, so its own timestamp is trusted once —
    // and a timestamp from the future (a device set ahead) must not read as dead.
    peerFile(vault, { session: "ahead", seq: 1, at: new Date(Date.now() + 6 * 3600e3).toISOString() });
    peerFile(vault, { session: "behind", seq: 1, at: new Date(Date.now() - 6 * 3600e3).toISOString() });
    let view = peers(vault, { self: "me" });
    assert.equal(view.peers.find((p) => p.session === "ahead").live, true,
      "a clock set ahead is not evidence of death");
    assert.equal(view.peers.find((p) => p.session === "behind").live, false,
      "…and one far behind is treated as stale on first sight only");

    // From now on, only what WE observe counts: the counter moves, so it is
    // live, no matter what its own timestamps say.
    peerFile(vault, { session: "behind", seq: 2, at: new Date(Date.now() - 6 * 3600e3).toISOString() });
    view = peers(vault, { self: "me" });
    const p = view.peers.find((x) => x.session === "behind");
    assert.equal(p.live, true, "the counter moved while we were watching — that is liveness");
    assert.equal(p.basis, "observed locally");

    // And a counter that stops moving goes quiet by our clock alone.
    view = peers(vault, { self: "me", now: Date.now() + LIVE_WINDOW_MS + 60_000 });
    assert.equal(view.peers.find((x) => x.session === "behind").live, false);
  });
});

test("a heartbeat is one small write that only ever moves its counter forward", () => {
  const { proj, vault } = project();
  withProject(proj, () => {
    const a = beat(vault, "s1", { harness: "claude" });
    const b = beat(vault, "s1", { harness: "claude" });
    assert.equal(b.seq, a.seq + 1);
    assert.equal(b.started_at, a.started_at, "the session keeps its start time across beats");
    assert.equal(b.host, hostname().split(".")[0]);
    assert.ok(b.os.includes("-"), "the record says which OS it came from");
  });
});

test("a sync client's conflicted copies are reported, never read as peers", () => {
  const { proj, vault } = project();
  withProject(proj, () => {
    beat(vault, "s1", {});
    mkdirSync(presenceDir(vault), { recursive: true });
    writeFileSync(join(presenceDir(vault), "s1 2.json"), "{}", "utf8");                        // iCloud
    writeFileSync(join(presenceDir(vault), "s1 (conflicted copy 2026-09-01).json"), "{}", "utf8"); // Dropbox
    const view = peers(vault, { self: "s1" });
    // `waypost bind` in the fixture beats too, so count only what came from s1:
    // the point is that its duplicates did not become extra sessions.
    assert.deepEqual(view.peers.filter((p) => p.session === "s1").length, 1,
      "duplicates are not extra sessions");
    assert.equal(view.conflicts.length, 2, "…they are evidence that two devices wrote at once");
  });
});

test("prunePresence removes only records that are gone, ours excepted, and quiet past the threshold (P3-1, G-11)", () => {
  const { proj, vault } = project();
  withProject(proj, () => {
    beat(vault, "me", {}); // our own record — never reaped, however quiet
    peerFile(vault, { session: "live-remote", seq: 1 });
    peers(vault, { self: "me" }); // seed the observations cache for these two
    peerFile(vault, { session: "gone-recent", seq: 1, at: new Date(Date.now() - 3600e3).toISOString() });
    peerFile(vault, { session: "gone-stale", seq: 1, at: new Date(Date.now() - 25 * 3600e3).toISOString() });
    mkdirSync(presenceDir(vault), { recursive: true });
    writeFileSync(join(presenceDir(vault), "gone-stale 2.json"), "{}", "utf8"); // a conflicted copy

    const now = Date.now() + LIVE_WINDOW_MS + 60_000; // past the plain liveness window for everyone but "me"
    const removed = prunePresence(vault, { self: "me", now });
    assert.equal(removed, 1, "only the one record quiet for more than 24h is reaped");

    const remaining = readdirSync(presenceDir(vault));
    assert.ok(remaining.includes("me.json"), "our own record is never pruned, no matter how quiet");
    assert.ok(remaining.includes("live-remote.json"), "a merely-quiet-for-a-while peer is not stale yet");
    assert.ok(remaining.includes("gone-recent.json"), "quiet less than 24h — not old enough to reap");
    assert.ok(!remaining.includes("gone-stale.json"), "quiet more than 24h and not live — the normal path reaps it");
    assert.ok(remaining.includes("gone-stale 2.json"), "a conflicted copy is never read as a peer, so it is never reaped either");
  });
});

test("`waypost sessions --prune` also prunes stale presence, and the text mode hints at it before anyone asks", () => {
  const { proj, vault } = project();
  const run = (args) => spawnSync(process.execPath, [Waypost, ...args], {
    encoding: "utf8", cwd: proj, env: { ...process.env, WAYPOST_PROJECT_DIR: proj, WAYPOST_HOME: REPO, WAYPOST_SESSION_ID: "me" },
  });
  mkdirSync(presenceDir(vault), { recursive: true });
  writeFileSync(join(presenceDir(vault), "long-gone.json"), JSON.stringify({
    session: "long-gone", host: "otherbox", os: "linux-6", harness: "codex", seq: 1,
    at: new Date(Date.now() - 48 * 3600e3).toISOString(),
    started_at: new Date(Date.now() - 48 * 3600e3).toISOString(), project_root: "/elsewhere",
  }), "utf8");

  const pruned = JSON.parse(run(["sessions", "--prune", "--json"]).stdout);
  assert.equal(pruned.pruned_presence, 1, "a 48h-quiet, first-sight peer is reaped by --prune");
  assert.ok(!readdirSync(presenceDir(vault)).includes("long-gone.json"));
});

// ─── leases ────────────────────────────────────────────────────────────

test("a lease is refused while the holder is live, and taken over once it is not", () => {
  const { proj, vault } = project();
  withProject(proj, () => {
    peerFile(vault, { session: "remote", seq: 1 });
    peers(vault, { self: "me" });                       // observe it once: live
    leaseFile(vault, { path: "src/auth.ts", session: "remote" });

    const refused = acquire(vault, ["src/auth.ts"], { sessionId: "me", settleMs: 0 });
    assert.equal(refused.results[0].ok, false);
    assert.equal(refused.results[0].reason, "held");
    assert.equal(refused.results[0].by.host, "otherbox", "the refusal names the device, not just the session");

    // The remote device goes quiet: its lease is advisory, so it must not hold
    // the file hostage forever.
    const later = Date.now() + LIVE_WINDOW_MS + 60_000;
    const taken = acquire(vault, ["src/auth.ts"], { sessionId: "me", settleMs: 0, now: later });
    assert.equal(taken.results[0].ok, true);
    const mine = readLeases(vault, { self: "me", now: later }).find((l) => l.path === "src/auth.ts");
    assert.equal(mine.session, "me");
    assert.equal(mine.taken_over_from.session, "remote", "the takeover is recorded, not silent");
  });
});

test("acquire --force overrides a live rival, marks the result forced, and leaves the rival's own record on disk (P3-8)", () => {
  const { proj, vault } = project();
  withProject(proj, () => {
    peerFile(vault, { session: "remote", seq: 1 });
    peers(vault, { self: "me" });                       // observe it once: live
    leaseFile(vault, { path: "src/auth.ts", session: "remote" });

    const forced = acquire(vault, ["src/auth.ts"], { sessionId: "me", settleMs: 0, force: true });
    assert.equal(forced.results[0].ok, true);
    assert.equal(forced.results[0].forced, true, "forcing over a LIVE rival must read differently from an uncontested acquire");
    assert.equal(forced.results[0].over, "remote");

    const rows = readLeases(vault, { self: "me" });
    assert.ok(rows.some((l) => l.session === "me" && l.path === "src/auth.ts"), "our own lease is written");
    assert.ok(rows.some((l) => l.session === "remote" && l.path === "src/auth.ts"),
      "the live rival's own record survives — force overrides it, it does not destroy someone else's file (only a STALE rival is removed)");
  });
});

test("`waypost lease --force` reports the override in its own words (P3-8)", () => {
  const { proj, vault } = project();
  withProject(proj, () => {
    peerFile(vault, { session: "remote", seq: 1 });
    peers(vault, { self: "me" });
    leaseFile(vault, { path: "src/auth.ts", session: "remote" });
  });
  const r = spawnSync(process.execPath, [Waypost, "lease", "src/auth.ts", "--force"], {
    encoding: "utf8", cwd: proj, env: { ...process.env, WAYPOST_PROJECT_DIR: proj, WAYPOST_HOME: REPO, WAYPOST_SESSION_ID: "me" },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^leased\s+src\/auth\.ts {2}\(forced over remote\)$/m);
});

test("two devices that acquire at once converge on one owner, both computing the same winner", () => {
  const a = { path: "src/x.ts", session: "alpha", acquired_at: "2026-09-01T10:00:00.000Z" };
  const b = { path: "src/x.ts", session: "beta", acquired_at: "2026-09-01T10:00:00.000Z" };
  assert.equal(winnerOf(a, b), a, "same instant: the session id breaks the tie");
  assert.equal(winnerOf(b, a), a, "…and the rule is symmetric, so both sides agree");
  const earlier = { ...b, acquired_at: "2026-09-01T09:59:59.000Z" };
  assert.equal(winnerOf(a, earlier), earlier, "otherwise the earlier acquisition wins");
});

test("two live sessions racing to acquire the same path converge on exactly one file, and agree on the winner (C-1/G-3)", async () => {
  const vault = mkdtempSync(join(tmpdir(), "waypost-race-"));
  const barrier = join(vault, ".race-go");
  const presenceUrl = new URL("../scripts/presence.mjs", import.meta.url).href;
  // Two REAL, separate node processes — not two calls in this process — so the
  // race is genuine: both pass their own "no live rival yet" check and both
  // write before either settles and re-reads, which is exactly the interleaving
  // that used to let both sides believe they held the lease.
  const race = (sid) => `
    import { acquire, beat } from ${JSON.stringify(presenceUrl)};
    import { existsSync } from "node:fs";
    beat(${JSON.stringify(vault)}, ${JSON.stringify(sid)}, { harness: "test" });
    while (!existsSync(${JSON.stringify(barrier)})) { /* spin for the barrier */ }
    const out = acquire(${JSON.stringify(vault)}, ["race/file.ts"], { sessionId: ${JSON.stringify(sid)}, settleMs: 150 });
    process.stdout.write(JSON.stringify(out.results[0]));
  `;
  const worker = (sid) => new Promise((res, rej) => {
    // The workers' project root is the temp vault, not this process's cwd:
    // readLeases persists what it saw, and a run that wrote alpha/beta at seq 1
    // into the repo's own cache made every later run judge them by that
    // stale history (F2) — both "stale", both "won".
    const child = spawn(process.execPath, ["--input-type=module", "-e", race(sid)],
      { stdio: ["ignore", "pipe", "inherit"], env: { ...process.env, WAYPOST_PROJECT_DIR: vault } });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.on("close", (code) => (code === 0 ? res(JSON.parse(out)) : rej(new Error(`race worker ${sid} exited ${code}`))));
  });
  const pAlpha = worker("alpha");
  const pBeta = worker("beta");
  // Let both processes start node and reach the busy-wait, then drop the
  // barrier so they race as close to simultaneously as possible.
  await new Promise((r) => setTimeout(r, 300));
  writeFileSync(barrier, "go", "utf8");
  const [a, b] = await Promise.all([pAlpha, pBeta]);

  const aOwns = a.ok === true;
  const bOwns = b.ok === true;
  assert.notEqual(aOwns, bOwns, "exactly one side keeps the lease once the race settles — never both, never neither");
  const files = readdirSync(leaseDir(vault)).filter((n) => n.endsWith(".json"));
  assert.equal(files.length, 1, "the loser removes only its own file, never the winner's");
  const rec = JSON.parse(readFileSync(join(leaseDir(vault), files[0]), "utf8"));
  assert.equal(rec.session, aOwns ? "alpha" : "beta", "the file left on disk belongs to whichever side believes it won");

  // The winner can re-acquire cleanly afterwards: no live rival left to contest.
  const again = withProject(vault, () => acquire(vault, ["race/file.ts"], { sessionId: rec.session, settleMs: 0 }));
  assert.equal(again.results[0].ok, true);
  assert.equal(again.results[0].contested, false);
});

// Observations are keyed by the session's incarnation, evicted with its file,
// and kept per observing host.

test("a reused session id with a fresh presence file is first sight again, not a continuation of the old entry's history (F1)", () => {
  const { proj, vault } = project();
  withProject(proj, () => {
    const t0 = Date.now();
    const iso = (ms) => new Date(ms).toISOString();
    // Incarnation 1: one command, then gone (`sessions --end` in the same terminal tab).
    peerFile(vault, { session: "tab-7", seq: 1, at: iso(t0) });
    assert.equal(peers(vault, { self: "me", now: t0 }).peers.find((p) => p.session === "tab-7").live, true);
    const later = t0 + 40 * 60_000;
    assert.equal(peers(vault, { self: "me", now: later }).peers.find((p) => p.session === "tab-7").live, false,
      "forty minutes of silence: gone");
    // Incarnation 2 reuses the id: a fresh file, counter back at 1, new started_at.
    peerFile(vault, { session: "tab-7", seq: 1, at: iso(later), started_at: iso(later), claim: { story: "E1/story-z", at: iso(later) } });
    const fresh = peers(vault, { self: "me", now: later + 5000 }).peers.find((p) => p.session === "tab-7");
    assert.equal(fresh.live, true, "same id, same seq, but a new session — five seconds old, live");
    assert.match(fresh.basis, /first sight/);
    assert.ok(claimsOf(vault, { now: later + 5000 }).some((c) => c.session === "tab-7" && c.story === "E1/story-z"),
      "and the gates see its claim");
  });
});

test("an observation whose presence file is gone is dropped on the next read, and the cache is per observing host", () => {
  const { proj, vault } = project();
  withProject(proj, () => {
    peerFile(vault, { session: "ephemeral", seq: 1 });
    peerFile(vault, { session: "staying", seq: 1 });
    peers(vault, { self: "me" });
    const stateDir = join(proj, ".waypost", "state");
    const files = readdirSync(stateDir).filter((n) => /^peers\..+\.json$/.test(n));
    assert.equal(files.length, 1, `one cache file, named for this host: ${JSON.stringify(readdirSync(stateDir))}`);
    assert.ok(files[0].includes(hostname().split(".")[0].replace(/[^\w.-]+/g, "_")));
    let cache = JSON.parse(readFileSync(join(stateDir, files[0]), "utf8"));
    assert.ok("ephemeral" in cache && "staying" in cache);

    unlinkSync(join(presenceDir(vault), "ephemeral.json"));
    peers(vault, { self: "me" });
    cache = JSON.parse(readFileSync(join(stateDir, files[0]), "utf8"));
    assert.ok(!("ephemeral" in cache), "no file, no entry — the cache does not grow with every session that ever existed");
    assert.ok("staying" in cache);
  });
});

test("a presence file that is unreadable for one read keeps its observation — a torn sync write is not first sight again", () => {
  const { proj, vault } = project();
  withProject(proj, () => {
    const behind = new Date(Date.now() - 6 * 3600e3).toISOString(); // clock six hours back
    peerFile(vault, { session: "torn", seq: 1, at: behind });
    peers(vault, { self: "me" });                                    // first sight: stale, by its own timestamp
    peerFile(vault, { session: "torn", seq: 2, at: behind });
    assert.equal(peers(vault, { self: "me" }).peers.find((p) => p.session === "torn").live, true, "counter moved: live");
    writeFileSync(join(presenceDir(vault), "torn.json"), "{\"session\": \"torn\", \"seq\": 3", "utf8"); // half a write
    assert.ok(!peers(vault, { self: "me" }).peers.some((p) => p.session === "torn"), "unreadable this read");
    peerFile(vault, { session: "torn", seq: 3, at: behind, started_at: behind });
    const back = peers(vault, { self: "me" }).peers.find((p) => p.session === "torn");
    assert.equal(back.live, true, "the full file lands: counter moved since what we last knew, not first sight from a six-hour-old stamp");
    assert.equal(back.basis, "observed locally");
  });
});

test("a record whose timestamp cannot be read is live on first sight — the fail-safe side — and dead once the window passes", () => {
  const { proj, vault } = project();
  withProject(proj, () => {
    peerFile(vault, { session: "garbled", seq: 1, at: "not-a-date" });
    assert.equal(peers(vault, { self: "me" }).peers.find((p) => p.session === "garbled").live, true,
      "a spurious \"someone is live\" costs a refusal; a spurious \"dead\" costs a collision");
    assert.equal(peers(vault, { self: "me", now: Date.now() + LIVE_WINDOW_MS + 60_000 }).peers.find((p) => p.session === "garbled").live, false);
  });
});

test("`waypost lease <path>` and `waypost lease --json` both work in the documented form (G-2)", () => {
  const { proj } = project();
  const run = (args) => spawnSync(process.execPath, [Waypost, ...args], {
    encoding: "utf8", cwd: proj, env: { ...process.env, WAYPOST_PROJECT_DIR: proj, WAYPOST_HOME: REPO, WAYPOST_SESSION_ID: "me" },
  });

  // AGENTS.md, README and help() all document `waypost lease <path…>` — a bare
  // path was previously read as an unknown subcommand of presence.mjs.
  const leased = run(["lease", "adr/x.md"]);
  assert.equal(leased.status, 0, leased.stderr);
  assert.match(leased.stdout, /^leased\s+adr\/x\.md/m);

  // A bare flag with no path has nothing to lease — it lists this session's
  // own leases instead of failing as "usage: waypost lease <path…>".
  const asJson = run(["lease", "--json"]);
  assert.equal(asJson.status, 0, asJson.stderr);
  const rows = JSON.parse(asJson.stdout);
  assert.ok(Array.isArray(rows) && rows.some((r) => r.path === "adr/x.md" && r.mine));
});

test("a claim survives 10 minutes of silence — live in claimsOf's 30-minute window, stale in plain presence (C-2)", () => {
  const { proj, vault } = project();
  withProject(proj, () => {
    beat(vault, "s1", { claim: { story: "E1/story-x", at: new Date().toISOString() } });
    const tenMinutesLater = Date.now() + 10 * 60_000; // well past LIVE_WINDOW_MS (2.5 min)

    const claims = claimsOf(vault, { now: tenMinutesLater });
    assert.ok(claims.some((c) => c.session === "s1" && c.story === "E1/story-x"),
      "ADR-0006 promises a claim survives 30 minutes of an agent's own silence");

    const view = peers(vault, { self: "me", now: tenMinutesLater });
    assert.equal(view.peers.find((p) => p.session === "s1").live, false,
      "the SAME session is stale under plain presence's shorter window (ADR-0007) — one counter, two policies");
    assert.equal(view.peers.find((p) => p.session === "s1").basis, "observed locally",
      "claimsOf persisted what it saw, and the shorter window still reads it as stale: the seed is the timestamp, not \"now\"");
  });
});

test("D-3: a peer whose clock is behind by more than the window becomes visible to claimsOf once its counter moves — with nothing but claimsOf ever reading", () => {
  const { proj, vault } = project();
  withProject(proj, () => {
    const behind = () => new Date(Date.now() - 6 * 3600e3).toISOString(); // its clock, six hours back
    peerFile(vault, { session: "skewed", seq: 1, at: behind(), claim: { story: "E1/story-x", at: behind() } });
    assert.equal(claimsOf(vault).length, 0,
      "first sight: nothing distinguishes a clock six hours behind from a session gone six hours ago");
    // Same reader, same verdict, no other command in between — the observation was persisted.
    assert.equal(claimsOf(vault).length, 0);
    // It beats: the counter moves while we are watching. Its timestamp is still six hours back.
    peerFile(vault, { session: "skewed", seq: 2, at: behind(), claim: { story: "E1/story-x", at: behind() } });
    const claims = claimsOf(vault);
    assert.ok(claims.some((c) => c.session === "skewed" && c.story === "E1/story-x"),
      "the counter moved — that is liveness, whatever its clock says");
  });
});

test("a record first seen stale is not resurrected for one window by the act of looking", () => {
  const { proj, vault } = project();
  withProject(proj, () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3600e3).toISOString();
    peerFile(vault, { session: "ghost", seq: 7, at: threeDaysAgo, claim: { story: "E1/story-y", at: threeDaysAgo } });
    assert.equal(peers(vault, { self: "me" }).peers.find((p) => p.session === "ghost").live, false);
    // The old rule stamped "changed now" on first sight, so the very next look
    // called it live for a whole window — and its leftover claim blocked commits
    // for the full claim window. The seed is its own timestamp now.
    const second = peers(vault, { self: "me", now: Date.now() + 1000 }).peers.find((p) => p.session === "ghost");
    assert.equal(second.live, false, "still stale one second later");
    assert.equal(second.basis, "observed locally");
    assert.equal(claimsOf(vault, { now: Date.now() + 1000 }).length, 0, "and its claim blocks nobody");
  });
});

test("releasing frees only this session's leases", () => {
  const { proj, vault } = project();
  withProject(proj, () => {
    peerFile(vault, { session: "remote", seq: 1 });
    peers(vault, { self: "me" });
    leaseFile(vault, { path: "a.ts", session: "remote" });
    acquire(vault, ["b.ts"], { sessionId: "me", settleMs: 0 });
    const freed = release(vault, { sessionId: "me" });
    assert.deepEqual(freed, ["b.ts"]);
    assert.deepEqual(readLeases(vault, { self: "me" }).map((l) => l.path), ["a.ts"]);
  });
});

// D-1: closing a story releases the CLAIM, not this session's leases — a lease
// on a file unrelated to the story must survive `sessions --release`.
test("`sessions --release` frees the story claim but leaves this session's leases alone", () => {
  const { proj, vault } = project();
  const run = (args) => spawnSync(process.execPath, [Waypost, ...args], {
    encoding: "utf8", cwd: proj,
    env: { ...process.env, WAYPOST_PROJECT_DIR: proj, WAYPOST_HOME: REPO, WAYPOST_SESSION_ID: "me" },
  });
  assert.equal(run(["lease", "unrelated.txt"]).status, 0);
  assert.equal(run(["sessions", "--claim", "some/story"]).status, 0);
  const claimedBefore = JSON.parse(run(["sessions", "--json"]).stdout);
  assert.ok(claimedBefore.active.some((s) => s.id === "me" && s.claim === "some/story"));

  const released = run(["sessions", "--release"]);
  assert.equal(released.status, 0, released.stderr);

  assert.deepEqual(withProject(proj, () => readLeases(vault, { self: "me" })).map((l) => l.path), ["unrelated.txt"],
    "the lease is still listed — closing a story must not silently drop an unrelated collision warning");
  const after = JSON.parse(run(["sessions", "--json"]).stdout);
  assert.ok(!after.active.some((s) => s.id === "me" && s.claim), "the claim itself is gone");
});

test("commit refuses to write over a file another live session is editing", () => {
  const { proj, vault } = project();
  const run = (args, env = {}) => spawnSync(process.execPath, [Waypost, ...args], {
    encoding: "utf8", cwd: proj, env: { ...process.env, WAYPOST_PROJECT_DIR: proj, WAYPOST_HOME: REPO, ...env },
  });
  spawnSync("git", ["config", "user.email", "t@e.com"], { cwd: proj });
  spawnSync("git", ["config", "user.name", "T"], { cwd: proj });
  writeFileSync(join(proj, "app.ts"), "// mine\n", "utf8");
  spawnSync("git", ["add", "-A"], { cwd: proj });

  withProject(proj, () => {
    peerFile(vault, { session: "remote", seq: 1, harness: "cursor" });
    peers(vault, { self: "me" });
    leaseFile(vault, { path: "app.ts", session: "remote" });
  });

  const blocked = run(["commit", "-m", "touch it"], { WAYPOST_SESSION_ID: "me" });
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /leased by another live session/);
  assert.match(blocked.stderr, /app\.ts — remote on otherbox \(cursor\)/);

  const forced = run(["commit", "-m", "touch it", "--force"], { WAYPOST_SESSION_ID: "me" });
  assert.equal(forced.status, 0, forced.stderr);
});

// ─── storage awareness ─────────────────────────────────────────────────

test("storage kind decides how stale presence may be, and it is stated", () => {
  assert.equal(storageOf("/Users/x/Library/Mobile Documents/com~apple~CloudDocs/vault").kind, "cloud");
  assert.equal(storageOf("/Users/x/Dropbox/vault").provider, "Dropbox");
  assert.equal(storageOf("C:\\Users\\x\\OneDrive\\vault").provider, "OneDrive");
  assert.equal(storageOf("\\\\server\\share\\vault").kind, "network");
  const cloud = storageOf("/Users/x/Dropbox/vault");
  assert.ok(cloud.lag_ms > 0 && cloud.settle_ms > 0,
    "a cloud vault must widen both the liveness window and the settle wait");
});

test("`waypost sessions` says what the vault is stored on when it is not local", () => {
  const { proj } = project();
  const r = spawnSync(process.execPath, [Waypost, "sessions", "--json"], {
    encoding: "utf8", cwd: proj, env: { ...process.env, WAYPOST_PROJECT_DIR: proj, WAYPOST_HOME: REPO, WAYPOST_SESSION_ID: "s" },
  });
  const out = JSON.parse(r.stdout);
  assert.ok(out.storage && out.storage.kind, "the storage judgement is part of the machine-readable answer");
  assert.ok(Array.isArray(out.leases));
});

// A-1: a traversal --id must not escape the vault-relative presence directory,
// and must not silently write nowhere either (the harm a path-shaped id causes
// in practice: the session becomes invisible to every other one).
test("`waypost sessions --touch --id ../../evil` writes inside presence/, nothing at the vault root", () => {
  const { proj, vault } = project();
  const r = spawnSync(process.execPath, [Waypost, "sessions", "--touch", "--id", "../../evil", "--json"], {
    encoding: "utf8", cwd: proj, env: { ...process.env, WAYPOST_PROJECT_DIR: proj, WAYPOST_HOME: REPO },
  });
  assert.equal(r.status, 0, r.stderr);
  const names = readdirSync(presenceDir(vault));
  assert.equal(names.length, 1, `expected exactly one presence record, got: ${JSON.stringify(names)}`);
  assert.equal(names[0].includes("/"), false);
  assert.equal(existsSync(join(proj, "evil.json")), false);
  assert.equal(existsSync(join(vault, "evil.json")), false);
});

// ─── cross-OS safety ───────────────────────────────────────────────────

test("names that cannot survive another OS are reported before that OS sees them", () => {
  const findings = checkPortableNames({}, [
    "adr/plain.md",
    'adr/why: it works.md',
    "adr /note.md",
    "adr/con.md",
    "epics/E1/stories/Story-A.md",
    "epics/E1/stories/story-a.md",
  ]);
  const by = (re) => findings.filter((f) => re.test(f.message));
  assert.equal(by(/illegal in a Windows path/).length, 1, "a colon is fine on macOS and fatal on Windows");
  assert.equal(by(/ending in a space or dot/).length, 1, "a directory with a trailing space breaks the checkout too");
  assert.equal(by(/reserved device name/).length, 1);
  assert.equal(by(/differ only in case/).length, 1,
    "two artifacts that collapse on a case-insensitive checkout lose one of themselves");
  assert.ok(findings.every((f) => f.check === "portable-names"));
  assert.equal(findings.filter((f) => f.file === "adr/plain.md").length, 0, "an ordinary name is not reported");
});

test("doctor wires one line-ending policy, so a Windows session cannot rewrite every file", () => {
  const { proj } = project();
  const run = (args) => spawnSync(process.execPath, [Waypost, ...args], {
    encoding: "utf8", cwd: proj, env: { ...process.env, WAYPOST_PROJECT_DIR: proj, WAYPOST_HOME: REPO },
  });
  const before = JSON.parse(run(["doctor", "--install", "--json"]).stdout);
  assert.ok(before.some((f) => f.check === "line-endings"));
  run(["doctor", "--fix"]);
  // eol= is the load-bearing half: `* text=auto` alone normalises on check-in and
  // leaves checkout to core.eol, which is CRLF on Windows — so a checkout there
  // still rewrites the working tree, invisibly, with `git status` clean.
  assert.match(readFileSync(join(proj, ".gitattributes"), "utf8"), /^\* text=auto eol=lf$/m);
  const after = JSON.parse(run(["doctor", "--install", "--json"]).stdout);
  assert.ok(!after.some((f) => f.check === "line-endings"));
});

test("doctor: `* text=auto` without eol= is reported and repaired in place", () => {
  const { proj } = project();
  const run = (args) => spawnSync(process.execPath, [Waypost, ...args], {
    encoding: "utf8", cwd: proj, env: { ...process.env, WAYPOST_PROJECT_DIR: proj, WAYPOST_HOME: REPO },
  });
  writeFileSync(join(proj, ".gitattributes"), "# mine\n* text=auto\n*.png binary\n", "utf8");

  const before = JSON.parse(run(["doctor", "--install", "--json"]).stdout);
  const f = before.find((x) => x.check === "line-endings");
  assert.ok(f, "half a policy is not a policy");
  assert.match(f.message, /core\.eol/);

  run(["doctor", "--fix"]);
  const attrs = readFileSync(join(proj, ".gitattributes"), "utf8");
  assert.match(attrs, /^\* text=auto eol=lf$/m, "the existing line is completed, not duplicated");
  assert.equal((attrs.match(/text=auto/g) || []).length, 1);
  assert.match(attrs, /^\*\.png binary$/m, "the rest of the file is left alone");
  assert.ok(!JSON.parse(run(["doctor", "--install", "--json"]).stdout).some((x) => x.check === "line-endings"));
});

test("a temp file from another machine is never swept by this one", () => {
  const { proj, vault } = project();
  withProject(proj, () => {
    const dir = join(vault, "adr");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, ".x.md.otherbox.999999.tmp"), "in flight elsewhere", "utf8");
    beat(vault, "s1", {});                     // any atomic write triggers the sweep
    spawnSync(process.execPath, [Waypost, "reconcile", "--write"], {
      encoding: "utf8", cwd: proj, env: { ...process.env, WAYPOST_PROJECT_DIR: proj, WAYPOST_HOME: REPO },
    });
    assert.ok(existsSync(join(dir, ".x.md.otherbox.999999.tmp")),
      "pid liveness is a local fact; sweeping another host's temp destroys a write in progress there");
  });
});
