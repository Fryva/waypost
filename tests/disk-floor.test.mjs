// waypost — the owner's disk floor, `waypost capacity --disk` (the disk-space
// ADR). Every child gets HOME/XDG_STATE_HOME/LOCALAPPDATA in a temp directory,
// so the real machine state is never touched.
//   node --test tests/disk-floor.test.mjs
import "./env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { canStart } from "../scripts/capacity-admission.mjs";
import { parseDiskFloor, diskFloorGated } from "../bin/cli/capacity.mjs";
import { machineStateDir } from "../scripts/lib.mjs";
import { hostSlug } from "../scripts/presence.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const Waypost = join(REPO, "bin", "waypost");
const GB = 1024 ** 3;
const ROOTS = [];
process.on("exit", () => { for (const p of ROOTS) { try { rmSync(p, { recursive: true, force: true }); } catch { /* best effort */ } } });

function tmpHome() {
  const d = mkdtempSync(join(tmpdir(), "waypost-disk-floor-"));
  ROOTS.push(d);
  return d;
}

function run(home, args, extra = {}) {
  return spawnSync(process.execPath, [Waypost, "capacity", ...args], {
    encoding: "utf8", timeout: 30000, cwd: home,
    env: {
      ...process.env, HOME: home, USERPROFILE: home, XDG_STATE_HOME: home, LOCALAPPDATA: home, WAYPOST_NO_BEAT: "1",
      WAYPOST_CAPACITY_PROBE: JSON.stringify({ cores: 8, busy: 0, available: 8 * GB, total: 16 * GB, free: 45 * GB, disk_total: 460 * GB }),
      WAYPOST_DISK_CHECK: "", WAYPOST_DISK_SHARE_GB: "",
      ...extra,
    },
  });
}

const floorFile = (home) => join(machineStateDir({ platform: process.platform, env: { XDG_STATE_HOME: home, LOCALAPPDATA: home }, home }), `disk-floor.${hostSlug()}.json`);

test("parseDiskFloor: <reserve>,<share> in GB or default; a share under 1 GB or any other shape is invalid", () => {
  assert.deepEqual(parseDiskFloor("20,15"), { reserve_gb: 20, share_gb: 15 });
  assert.deepEqual(parseDiskFloor("0,1.5"), { reserve_gb: 0, share_gb: 1.5 });
  assert.equal(parseDiskFloor("default"), null);
  for (const bad of ["5", "20,0", "20,0.5", "-1,5", "a,b", "20, 15"]) assert.equal(parseDiskFloor(bad), undefined, bad);
});

test("diskFloorGated: lowering either value below what is in force needs the owner; raising or keeping does not", () => {
  assert.equal(diskFloorGated(null, { reserve_gb: 20, share_gb: 20 }), true, "below the default reserve");
  assert.equal(diskFloorGated(null, { reserve_gb: 30, share_gb: 15 }), true, "below the default share");
  assert.equal(diskFloorGated(null, { reserve_gb: 40, share_gb: 25 }), false);
  assert.equal(diskFloorGated({ reserve_gb: 40, share_gb: 25 }, null), true, "default is lower than this setting");
  assert.equal(diskFloorGated({ reserve_gb: 10, share_gb: 10 }, null), true, "default over a setting always needs the owner: the real default shrinks with the disk");
});

test("canStart: the owner's floor replaces the default reserve and share, with no percentage cap", () => {
  const base = { cores: 8, busy: 0, available: 16 * GB, total: 16 * GB, disk: { free: 45 * GB, total: 460 * GB } };
  assert.equal(canStart(base).can_start, 0, "default: 50 GB needed");
  const r = canStart({ ...base, floor: { reserve: 20 * GB, share: 15 * GB } });
  assert.equal(r.can_start, 1);
  assert.equal(r.system_disk, 20 * GB);
  assert.equal(r.job_disk, 15 * GB);
  assert.equal(canStart({ ...base, floor: { reserve: 20 * GB, share: 15 * GB }, diskRaise: "30" }).job_disk, 30 * GB, "the env still only raises the share");
});

test("capacity --disk: no value shows the default; a raise is written, logged and used by admission; default over it needs the owner", () => {
  const home = tmpHome();
  const show = run(home, ["--disk"]);
  assert.equal(show.status, 0, show.stderr);
  assert.match(show.stdout, /^disk floor: default/);
  const up = run(home, ["--disk", "40,25"]);
  assert.equal(up.status, 0, up.stderr);
  const rec = JSON.parse(readFileSync(floorFile(home), "utf8"));
  assert.equal(rec.reserve_gb, 40);
  assert.equal(rec.share_gb, 25);
  const log = readFileSync(join(dirname(floorFile(home)), `cleanup.${hostSlug()}.jsonl`), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(log.at(-1).to, { reserve_gb: 40, share_gb: 25 });
  assert.equal(log.at(-1).kind, "disk-floor");
  const cap = run(home, ["--json"]);
  const j = JSON.parse(cap.stdout);
  assert.equal(j.disk.reserve, 40 * GB);
  assert.equal(j.disk.share, 25 * GB);
  assert.equal(j.disk.owner_floor, true);
  // Back to the default is a lowering here, so it needs the owner too.
  const back = run(home, ["--disk", "default"]);
  assert.equal(back.status, 1);
  assert.ok(existsSync(floorFile(home)));
});

test("capacity --disk: lowering is refused without the owner's terminal and nothing is written", () => {
  const home = tmpHome();
  const r = run(home, ["--disk", "20,15"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /only the owner, in their own terminal, may lower the disk floor/);
  assert.ok(!existsSync(floorFile(home)));
  const cap = JSON.parse(run(home, ["--json"]).stdout);
  assert.equal(cap.can_start, 0, "the default floor still holds");
});

test("disk floor: oversize or non-finite values never turn admission into NaN", () => {
  assert.equal(parseDiskFloor("30,1" + "0".repeat(300)), undefined);
  assert.equal(parseDiskFloor("30,1000001"), undefined);
  const base = { cores: 8, busy: 8, available: 0, total: 16 * GB, disk: { free: 45 * GB, total: 460 * GB } };
  for (const raise of ["Infinity", "1e300"]) {
    const r = canStart({ ...base, diskRaise: raise, floor: { reserve: 40 * GB, share: 25 * GB } });
    assert.equal(r.can_start, 0, raise);
    const d = canStart({ ...base, diskRaise: raise });
    assert.equal(d.can_start, 0, raise);
  }
});

test("capacity --disk=<v> form, and a JSON refusal on stdout", () => {
  const home = tmpHome();
  const up = run(home, ["--disk=40,25"]);
  assert.equal(up.status, 0, up.stderr);
  assert.ok(existsSync(floorFile(home)));
  const bad = run(home, ["--json", "--disk", "5"]);
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stdout).ok, false);
});

test("readDiskFloor: a corrupt or out-of-range file reads as no setting", async () => {
  const { readDiskFloor } = await import("../scripts/lib.mjs");
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const home = tmpHome();
  const f = floorFile(home);
  mkdirSync(dirname(f), { recursive: true });
  const opts = { host: hostSlug(), platform: process.platform, env: { XDG_STATE_HOME: home, LOCALAPPDATA: home }, home };
  for (const body of ["{not json", JSON.stringify({ reserve_gb: 30, share_gb: 0 }), JSON.stringify({ reserve_gb: 1e7, share_gb: 20 }), JSON.stringify({ reserve_gb: null, share_gb: 20 })]) {
    writeFileSync(f, body);
    assert.equal(readDiskFloor(opts), null, body);
  }
  writeFileSync(f, JSON.stringify({ reserve_gb: 25, share_gb: 15 }));
  assert.deepEqual({ ...readDiskFloor(opts) }, { reserve_gb: 25, share_gb: 15 });
});
