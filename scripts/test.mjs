#!/usr/bin/env node
// waypost — scripts/test.mjs (WP-18, Decision 4 of the heavy-work-sized-to-
// the-machine ADR): `npm test` runs the project's own suite through the
// machine-wide heavy-work slot, at a concurrency sized to this machine
// instead of a constant, so the suite never competes with any other heavy
// job on the machine, and is sane on a 4-core laptop and a 32-core
// workstation alike.
//
//   node scripts/test.mjs [extra node --test flags]
//   WAYPOST_HEAVY_WAIT=<Ns|Nm> node scripts/test.mjs   # wait for a slot
//
// Extra CLI arguments are forwarded to `node --test` (e.g. --test-name-pattern).

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { measure } from "./capacity.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const WAYPOST = join(ROOT, "bin", "waypost");
const TESTS_DIR = join(ROOT, "tests");

// One heavy job's share of the machine's cores (WP-18 Decision 1, Owner's
// decision 1): a quarter of the cores, at least one. Pure — takes the
// measurement as a parameter, so a test can inject it without spawning
// anything or touching the real machine.
export function testConcurrency(m) {
  return Math.max(1, Math.floor(m.cores / 4));
}

function testFiles() {
  return readdirSync(TESTS_DIR)
    .filter((n) => n.endsWith(".test.mjs"))
    .sort()
    .map((n) => join("tests", n));
}

async function main() {
  // Only used to size --test-concurrency, not to decide whether to run: the
  // actual admission check happens inside `waypost run --heavy` itself,
  // under its lock, with the live holders it reads there.
  const m = await measure({ env: process.env });
  const n = testConcurrency(m);
  const files = testFiles();
  const wait = process.env.WAYPOST_HEAVY_WAIT;

  const args = [
    "run", "--heavy",
    ...(wait ? ["--wait", wait] : []),
    "--",
    process.execPath, "--test", `--test-concurrency=${n}`,
    ...process.argv.slice(2),
    ...files,
  ];
  const r = spawnSync(process.execPath, [WAYPOST, ...args], { stdio: "inherit", cwd: ROOT });
  if (r.error) {
    process.stderr.write(`scripts/test.mjs: ${r.error.message}\n`);
    process.exit(1);
  }
  process.exit(r.status ?? 1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
