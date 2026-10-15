// waypost — the README's "Working alone, in one tool" path runs as written
// (WP-23): every command in its bash block, in order, in a scratch repository.
//   node --test tests/readme-solo.test.mjs

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ambientEnv } from "./env.mjs";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const TMP = [];
after(() => { for (const p of TMP) rmSync(p, { recursive: true, force: true }); });

function soloBlock() {
  const readme = readFileSync(join(REPO, "README.md"), "utf8");
  const section = readme.split(/^## Working alone, in one tool$/m)[1];
  assert.ok(section, "README has a \"Working alone, in one tool\" section");
  const body = section.split(/^## /m)[0];
  assert.ok(body.trimEnd().split("\n").length < 25, "the section stays under 25 lines");
  assert.ok(readme.indexOf("## Working alone, in one tool") < readme.indexOf("## Working across tools, machines and people"),
    "it comes before the team material");
  const block = body.match(/```bash\n([\s\S]*?)```/);
  assert.ok(block, "the section has a bash block");
  return block[1].split("\n").map((l) => l.replace(/\s+#.*$/, "").trim()).filter(Boolean);
}

test("the README's solo path runs as shown and ends with a findable task commit", () => {
  const lines = soloBlock();
  const proj = mkdtempSync(join(tmpdir(), "waypost-solo-")); TMP.push(proj);
  const env = {
    ...ambientEnv(), WAYPOST_PROJECT_DIR: proj, WAYPOST_HOME: REPO, WAYPOST_NO_BEAT: "1", WAYPOST_HARNESS: "claude",
    GIT_AUTHOR_NAME: "T", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "T", GIT_COMMITTER_EMAIL: "t@example.com",
  };
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: proj });
  const shim = `waypost() { "${process.execPath}" "${join(REPO, "bin", "waypost")}" "$@"; }; `;
  for (const line of lines) {
    // A commit needs a change to record; the README's reader has one by then.
    if (/^waypost commit /.test(line)) writeFileSync(join(proj, "login.txt"), "timeout fixed\n");
    const r = spawnSync("sh", ["-c", shim + line], { cwd: proj, env, encoding: "utf8", timeout: 60000 });
    assert.equal(r.status, 0, `${line}\n${r.stderr}${r.stdout}`);
    if (/^waypost log --task /.test(line)) assert.match(r.stdout, /Fix the login timeout/);
  }
  const trailer = spawnSync("git", ["log", "-1", "--format=%(trailers:key=Waypost-Task,valueonly)"], { cwd: proj, encoding: "utf8" }).stdout;
  assert.match(trailer, /^PROJ-123$/m);
  const brief = spawnSync(process.execPath, [join(REPO, "bin", "waypost"), "brief"], { cwd: proj, env, encoding: "utf8" });
  assert.equal(brief.status, 0, brief.stderr);
  for (const p of [".agents", ".claude", "CLAUDE.md", "AGENTS.md"]) {
    assert.equal(existsSync(join(proj, p)), false, `${p}: no role, skill or routing file arrives, not even from brief`);
  }
});
