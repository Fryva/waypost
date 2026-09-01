// mps — presence, leases and cross-OS safety on a shared vault (ADR-0007).
// The cases that matter here cannot be produced by running the tool normally:
// a peer whose clock is wrong, a sync client that duplicates a file, a device
// that vanishes. They are constructed on disk directly.
//   node --test tests/*.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir, hostname } from "node:os";
import { spawnSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  beat, peers, acquire, release, readLeases, winnerOf, storageOf, presenceDir, leaseDir, vaultRel,
  LIVE_WINDOW_MS,
} from "../scripts/presence.mjs";
import { claimsOf } from "../scripts/sessions.mjs";
import { checkPortableNames } from "../scripts/doctor.mjs";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const MPS = join(REPO, "bin", "mps");

function project() {
  const proj = mkdtempSync(join(tmpdir(), "mps-p-"));
  spawnSync("git", ["init", "-q"], { cwd: proj });
  spawnSync(process.execPath, [MPS, "bind", join(proj, "vault")], {
    encoding: "utf8", env: { ...process.env, MPS_PROJECT_DIR: proj, MPS_HOME: REPO },
  });
  return { proj, vault: join(proj, "vault") };
}

// A peer on another device, written the way that device would write it.
function peerFile(vault, { session, seq = 1, at = new Date().toISOString(), host = "otherbox", os = "win32-10", harness = "codex", claim = null }) {
  mkdirSync(presenceDir(vault), { recursive: true });
  writeFileSync(join(presenceDir(vault), `${session}.json`), JSON.stringify({
    session, host, os, harness, seq, at, started_at: at, project_root: `C:\\work\\proj`, claim,
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
  const prev = process.env.MPS_PROJECT_DIR;
  process.env.MPS_PROJECT_DIR = proj;
  try { return fn(); } finally {
    if (prev === undefined) delete process.env.MPS_PROJECT_DIR; else process.env.MPS_PROJECT_DIR = prev;
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
    // `mps bind` in the fixture beats too, so count only what came from s1:
    // the point is that its duplicates did not become extra sessions.
    assert.deepEqual(view.peers.filter((p) => p.session === "s1").length, 1,
      "duplicates are not extra sessions");
    assert.equal(view.conflicts.length, 2, "…they are evidence that two devices wrote at once");
  });
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

test("two devices that acquire at once converge on one owner, both computing the same winner", () => {
  const a = { path: "src/x.ts", session: "alpha", acquired_at: "2026-09-01T10:00:00.000Z" };
  const b = { path: "src/x.ts", session: "beta", acquired_at: "2026-09-01T10:00:00.000Z" };
  assert.equal(winnerOf(a, b), a, "same instant: the session id breaks the tie");
  assert.equal(winnerOf(b, a), a, "…and the rule is symmetric, so both sides agree");
  const earlier = { ...b, acquired_at: "2026-09-01T09:59:59.000Z" };
  assert.equal(winnerOf(a, earlier), earlier, "otherwise the earlier acquisition wins");
});

test("two live sessions racing to acquire the same path converge on exactly one file, and agree on the winner (C-1/G-3)", async () => {
  const vault = mkdtempSync(join(tmpdir(), "mps-race-"));
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
    const child = spawn(process.execPath, ["--input-type=module", "-e", race(sid)], { stdio: ["ignore", "pipe", "inherit"] });
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
  const again = acquire(vault, ["race/file.ts"], { sessionId: rec.session, settleMs: 0 });
  assert.equal(again.results[0].ok, true);
  assert.equal(again.results[0].contested, false);
});

test("`mps lease <path>` and `mps lease --json` both work in the documented form (G-2)", () => {
  const { proj } = project();
  const run = (args) => spawnSync(process.execPath, [MPS, ...args], {
    encoding: "utf8", cwd: proj, env: { ...process.env, MPS_PROJECT_DIR: proj, MPS_HOME: REPO, MPS_SESSION_ID: "me" },
  });

  // AGENTS.md, README and help() all document `mps lease <path…>` — a bare
  // path was previously read as an unknown subcommand of presence.mjs.
  const leased = run(["lease", "adr/x.md"]);
  assert.equal(leased.status, 0, leased.stderr);
  assert.match(leased.stdout, /^leased\s+adr\/x\.md/m);

  // A bare flag with no path has nothing to lease — it lists this session's
  // own leases instead of failing as "usage: mps lease <path…>".
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

test("commit refuses to write over a file another live session is editing", () => {
  const { proj, vault } = project();
  const run = (args, env = {}) => spawnSync(process.execPath, [MPS, ...args], {
    encoding: "utf8", cwd: proj, env: { ...process.env, MPS_PROJECT_DIR: proj, MPS_HOME: REPO, ...env },
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

  const blocked = run(["commit", "-m", "touch it"], { MPS_SESSION_ID: "me" });
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /leased by another live session/);
  assert.match(blocked.stderr, /app\.ts — remote on otherbox \(cursor\)/);

  const forced = run(["commit", "-m", "touch it", "--force"], { MPS_SESSION_ID: "me" });
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

test("`mps sessions` says what the vault is stored on when it is not local", () => {
  const { proj } = project();
  const r = spawnSync(process.execPath, [MPS, "sessions", "--json"], {
    encoding: "utf8", cwd: proj, env: { ...process.env, MPS_PROJECT_DIR: proj, MPS_HOME: REPO, MPS_SESSION_ID: "s" },
  });
  const out = JSON.parse(r.stdout);
  assert.ok(out.storage && out.storage.kind, "the storage judgement is part of the machine-readable answer");
  assert.ok(Array.isArray(out.leases));
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
  const run = (args) => spawnSync(process.execPath, [MPS, ...args], {
    encoding: "utf8", cwd: proj, env: { ...process.env, MPS_PROJECT_DIR: proj, MPS_HOME: REPO },
  });
  const before = JSON.parse(run(["doctor", "--install", "--json"]).stdout);
  assert.ok(before.some((f) => f.check === "line-endings"));
  run(["doctor", "--fix"]);
  assert.match(readFileSync(join(proj, ".gitattributes"), "utf8"), /^\* text=auto$/m);
  const after = JSON.parse(run(["doctor", "--install", "--json"]).stdout);
  assert.ok(!after.some((f) => f.check === "line-endings"));
});

test("a temp file from another machine is never swept by this one", () => {
  const { proj, vault } = project();
  withProject(proj, () => {
    const dir = join(vault, "adr");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, ".x.md.otherbox.999999.tmp"), "in flight elsewhere", "utf8");
    beat(vault, "s1", {});                     // any atomic write triggers the sweep
    spawnSync(process.execPath, [MPS, "reconcile", "--write"], {
      encoding: "utf8", cwd: proj, env: { ...process.env, MPS_PROJECT_DIR: proj, MPS_HOME: REPO },
    });
    assert.ok(existsSync(join(dir, ".x.md.otherbox.999999.tmp")),
      "pid liveness is a local fact; sweeping another host's temp destroys a write in progress there");
  });
});
