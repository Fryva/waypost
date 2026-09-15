// waypost — tests for scripts/test.mjs, the runner that puts `npm test`
// behind the machine-wide heavy-work slot (WP-18, Decision 4 of the
// heavy-work-sized-to-the-machine ADR).
//   node --test tests/test-runner.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { testConcurrency } from "../scripts/test.mjs";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const GB = 1024 ** 3;

// ─── testConcurrency ────────────────────────────────────────────────────
//
// Pure: takes the measurement as a parameter, so this never depends on the
// host's own cores.

test("testConcurrency: one heavy job's share of the cores — a quarter, at least one", () => {
  assert.equal(testConcurrency({ cores: 8 }), 2);
  assert.equal(testConcurrency({ cores: 16 }), 4);
  assert.equal(testConcurrency({ cores: 32 }), 8);
  assert.equal(testConcurrency({ cores: 1 }), 1);
  assert.equal(testConcurrency({ cores: 2 }), 1);
  assert.equal(testConcurrency({ cores: 3 }), 1); // floor(3/4) = 0 -> at least one
  assert.equal(testConcurrency({ cores: 4 }), 1);
  assert.equal(testConcurrency({ cores: 5 }), 1);
});

// ─── the runner, end to end ─────────────────────────────────────────────
//
// This spawns scripts/test.mjs itself, never the real suite: a busy probe
// refuses the `waypost run --heavy` claim before it ever spawns `node
// --test`, so the run never touches, or competes with, the real thing —
// exactly the "one heavy job at a time" rule this story exists to enforce.
// A temp HOME/XDG_STATE_HOME/LOCALAPPDATA keeps it off the real machine
// state directory too.

test("scripts/test.mjs: a busy machine refuses at once (exit 75) and never spawns the real test run", () => {
  const home = mkdtempSync(join(tmpdir(), "waypost-testrunner-"));
  try {
    const env = {
      ...process.env,
      HOME: home, XDG_STATE_HOME: home, LOCALAPPDATA: home,
      WAYPOST_NO_BEAT: "1",
      WAYPOST_HEAVY_WAIT: "", // never wait — refuse at once, deterministically
      // Zero idle cores: `run --heavy` refuses on the cpu check before it
      // ever spawns `node --test`.
      WAYPOST_CAPACITY_PROBE: JSON.stringify({ cores: 1, busy: 1, available: 8 * GB, total: 16 * GB }),
    };
    const r = spawnSync(process.execPath, [join(REPO, "scripts", "test.mjs")], {
      encoding: "utf8", cwd: REPO, env, timeout: 15000,
    });
    assert.equal(r.status, 75, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.match(r.stderr, /refused/);
    assert.match(r.stderr, /retry: waypost run --heavy/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("node --check passes on scripts/test.mjs", () => {
  const r = spawnSync(process.execPath, ["--check", join(REPO, "scripts", "test.mjs")], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});
