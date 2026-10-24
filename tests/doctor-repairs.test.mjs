import "./env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { applyFixes } from "../scripts/doctor-repairs.mjs";
import * as doctor from "../scripts/doctor.mjs";
import { mergeDriverCommand } from "../scripts/doctor-coordination.mjs";

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "wp-repairs-module-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (rel, text) => {
    const p = join(root, rel);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, text);
    return p;
  };
  const values = { WAYPOST_PROJECT_DIR: root, CLAUDE_PROJECT_DIR: root, WAYPOST_HARNESS: "unknown", WAYPOST_PROC: "", WAYPOST_NO_BEAT: "1", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(root, "no-global") };
  const saved = Object.fromEntries(Object.keys(values).map(k => [k, process.env[k]]));
  Object.assign(process.env, values);
  t.after(() => {
    for (const k of Object.keys(values)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });
  put(".waypost/projectstore.json", JSON.stringify({ vault_path: "vault", layout: "engineering" }));
  put("vault/.projectstore.json", '{"self_install":"off"}');
  return { root, put, cfg: Object.freeze({ vault_path: join(root, "vault"), layout: "engineering" }) };
}
function files(root) {
  const out = {};
  const walk = dir => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else out[p.slice(root.length + 1)] = readFileSync(p).toString("base64");
    }
  };
  walk(root);
  return out;
}
const findings = (...rows) => Object.freeze(rows.map(([check, level = "warn"]) => Object.freeze({ group: "install", check, level, message: "fixture" })));
function git(root, ...args) {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

test("doctor repairs module: public facade retains the same applyFixes binding", () => {
  assert.equal(doctor.applyFixes, applyFixes);
});

test("doctor repairs module: empty, info, foreign and no-harness findings preserve all files", t => {
  const { root, cfg } = fixture(t);
  mkdirSync(join(root, ".codex"));
  const before = files(root);
  for (const rows of [findings(), findings(["agent-roles", "info"], ["agent-skills", "info"]), findings(["agent-roles-foreign", "issue"], ["agent-skills-foreign", "warn"], ["agents-block", "info"]), findings(["unknown", "issue"])]) assert.deepEqual(applyFixes(cfg, root, rows), []);
  assert.deepEqual(files(root), before);
  rmSync(join(root, ".codex"), { recursive: true });
  assert.deepEqual(applyFixes(cfg, root, findings(["agent-roles", "issue"], ["agent-skills", "warn"])), []);
  assert.deepEqual(files(root), before);
});

test("doctor repairs module: gitignore appends only missing exact lines without mutating findings", t => {
  const { root, put, cfg } = fixture(t);
  const path = put(".gitignore", "# keep\n.waypost/projectstore.json\n\n");
  const rows = findings(["gitignore"]);
  const before = JSON.stringify(rows);
  assert.deepEqual(applyFixes(cfg, root, rows), [".gitignore += .waypost/state/"]);
  assert.equal(readFileSync(path, "utf8"), "# keep\n.waypost/projectstore.json\n.waypost/state/\n");
  assert.deepEqual(applyFixes(cfg, root, rows), []);
  assert.equal(JSON.stringify(rows), before);
});

test("doctor repairs module: explicit vault-git finding initializes only the named temporary vault", t => {
  const { root, cfg } = fixture(t);
  assert.deepEqual(applyFixes(null, root, findings(["vault-git"])), []);
  assert.equal(existsSync(join(cfg.vault_path, ".git")), false);
  assert.deepEqual(applyFixes(cfg, root, findings(["vault-git"])), [`git init ${cfg.vault_path}`]);
  assert.equal(existsSync(join(cfg.vault_path, ".git", "HEAD")), true);
  assert.equal(existsSync(join(root, ".git")), false);
});

test("doctor repairs module: line ending writes preserve exact policy branches and existing eol values", t => {
  const { root, put, cfg } = fixture(t);
  const rows = findings(["line-endings"]);
  const path = join(root, ".gitattributes");
  assert.deepEqual(applyFixes(cfg, root, rows), [".gitattributes += text=auto eol=lf (one line-ending policy for every OS)"]);
  assert.equal(readFileSync(path, "utf8"), "\n# waypost: one line-ending policy, or a Windows session's first commit\n# rewrites every file it touches and conflicts with every parallel edit.\n# eol=lf is not decoration: without it checkout falls back to core.eol.\n* text=auto eol=lf\n*.md text eol=lf\n*.mjs text eol=lf\n");
  put(".gitattributes", "# keep\n* text=auto   \n*.txt -text\n");
  assert.deepEqual(applyFixes(cfg, root, rows), [".gitattributes: `* text=auto` += eol=lf (checkout ending was left to core.eol)"]);
  assert.equal(readFileSync(path, "utf8"), "# keep\n* text=auto eol=lf\n*.txt -text\n");
  for (const value of ["lf", "crlf", ""]) {
    const text = `* text=auto eol=${value}\n`;
    put(".gitattributes", text);
    assert.deepEqual(applyFixes(cfg, root, rows), []);
    assert.equal(readFileSync(path, "utf8"), text);
  }
});

test("doctor repairs module: merge repair preserves attribute order and actual Git config using direct helper", t => {
  const { root, put, cfg } = fixture(t);
  git(root, "init", "-q");
  put(".gitattributes", "# keep\n");
  assert.deepEqual(applyFixes(cfg, root, findings(["merge-driver"])), [".gitattributes += merge=waypost-derived for the derived views", "git config merge.waypost-derived.driver"]);
  assert.equal(readFileSync(join(root, ".gitattributes"), "utf8"), "# keep\n\n# waypost: derived views are regenerated from the artifacts, never merged.\n# `waypost merge-derived` re-derives them; see docs/vault/adr/0006-*.md.\nvault/kanban.md merge=waypost-derived\nvault/graph.md merge=waypost-derived\nvault/code-map.md merge=waypost-derived\nvault/**/README.md merge=waypost-derived\n");
  assert.equal(git(root, "config", "--get", "merge.waypost-derived.driver"), mergeDriverCommand());
  assert.equal(git(root, "config", "--get", "merge.waypost-derived.name"), "regenerate waypost derived views");
  const before = files(root);
  assert.deepEqual(applyFixes(Object.freeze({ vault_path: join(root, "..", "external-vault") }), root, findings(["merge-driver"])), []);
  assert.deepEqual(files(root), before);
});

test("doctor repairs module: Claude import rewrite is relative to importer and leaves explicit paths alone", t => {
  const { root, put, cfg } = fixture(t);
  put("AGENTS.md", "Project rules\n");
  put("keep.md", "Root\n");
  put(".claude/keep.md", "Local\n");
  const path = put(".claude/CLAUDE.md", "@AGENTS.md\n@./manual.md\n@~owner.md\n@keep.md\n");
  assert.deepEqual(applyFixes(cfg, root, findings(["claude-import-missing"])), [".claude/CLAUDE.md: import rewritten to resolve against the file itself"]);
  assert.equal(readFileSync(path, "utf8"), "@../AGENTS.md\n@./manual.md\n@~owner.md\n@keep.md\n");
  assert.deepEqual(applyFixes(cfg, root, findings(["claude-import-missing"])), []);
});

test("doctor repairs module: bridge preserves own rules and rediagnosed repair is idempotent", t => {
  const { root, put, cfg } = fixture(t);
  put("AGENTS.md", "<!-- waypost:agents v3 -->\nroles\n<!-- /waypost:agents -->\n");
  mkdirSync(join(root, ".claude"));
  assert.deepEqual(applyFixes(cfg, root, findings(["claude-bridge"])), ["CLAUDE.md created with `@AGENTS.md` (Claude Code reads it, not AGENTS.md)"]);
  assert.equal(readFileSync(join(root, "CLAUDE.md"), "utf8"), "@AGENTS.md\n");
  const fresh = doctor.checkInstructionsHygiene(root).filter(f => f.check === "claude-bridge");
  const before = files(root);
  assert.deepEqual(fresh, []);
  assert.deepEqual(applyFixes(cfg, root, fresh), []);
  assert.deepEqual(files(root), before);
  put("CLAUDE.md", "Owner rules\n");
  assert.deepEqual(applyFixes(cfg, root, findings(["claude-bridge"])), ["CLAUDE.md: `@AGENTS.md` import added at the top"]);
  assert.equal(readFileSync(join(root, "CLAUDE.md"), "utf8"), "@AGENTS.md\n\nOwner rules\n");
});

test("doctor repairs module: roles, skills and routing run in original order for detected Codex only", t => {
  const { root, cfg } = fixture(t);
  mkdirSync(join(root, ".codex"));
  const rows = findings(["agents-block", "issue"], ["agent-skills", "issue"], ["agent-roles", "warn"]);
  const before = JSON.stringify(rows);
  assert.deepEqual(applyFixes(cfg, root, rows), ["agents install --harness codex", "skills install --harness codex", "agents register"]);
  assert.deepEqual(doctor.checkAgentRoles(root, cfg), []);
  assert.deepEqual(doctor.checkAgentSkills(root, cfg), []);
  assert.deepEqual(doctor.checkAgentsBlock(root), []);
  assert.equal(existsSync(join(root, ".claude")), false);
  assert.equal(JSON.stringify(rows), before);
});
