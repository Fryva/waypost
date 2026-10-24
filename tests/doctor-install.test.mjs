import "./env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as focused from "../scripts/doctor-install.mjs";
import * as doctor from "../scripts/doctor.mjs";
import { AGENT_BLOCK_MARKER, AGENT_BLOCK_VERSION } from "../scripts/agents.mjs";

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "wp-install-module-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (rel, text) => {
    const p = join(root, rel);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, text);
    return p;
  };
  mkdirSync(join(root, "vault"));
  return { root, put, cfg: Object.freeze({ vault_path: join(root, "vault"), layout: "engineering", language: "en" }) };
}
function withEnv(values, fn) {
  const before = Object.fromEntries(Object.keys(values).map(k => [k, process.env[k]]));
  Object.assign(process.env, values);
  try { return fn(); } finally {
    for (const k of Object.keys(values)) {
      if (before[k] === undefined) delete process.env[k];
      else process.env[k] = before[k];
    }
  }
}
function inProject(root, fn) {
  return withEnv({ WAYPOST_PROJECT_DIR: root, CLAUDE_PROJECT_DIR: root, WAYPOST_HARNESS: "unknown", WAYPOST_PROC: "" }, fn);
}
const block = (version = AGENT_BLOCK_VERSION) => `<!-- waypost:agents v${version} -->\nroles\n<!-- /waypost:agents -->\n`;

test("doctor install module: all eleven public exports retain identical bindings", () => {
  for (const name of ["checkConfig", "checkVaultPath", "checkLayoutTemplates", "checkAgentsBlock", "checkInstructionsHygiene", "checkEnvEffort", "checkEnvModel", "checkGitignore", "checkAgentRoles", "checkAgentSkills", "INSTRUCTIONS_MAX_LINES"]) {
    assert.equal(doctor[name], focused[name], name);
  }
});

test("doctor install module: config and vault path keep complete early findings and immutable inputs", t => {
  const { root, put, cfg } = fixture(t);
  assert.deepEqual(focused.checkConfig(null), [{ group: "install", level: "issue", check: "config", message: "No waypost config (.waypost/projectstore.json). Run `waypost bind <vault-path>`." }]);
  assert.deepEqual(focused.checkConfig(Object.freeze({})), [{ group: "install", level: "issue", check: "config", message: "Config has no vault_path." }]);
  assert.deepEqual(focused.checkConfig(cfg), []);
  assert.deepEqual(focused.checkVaultPath(cfg), []);
  const missing = Object.freeze({ vault_path: join(root, "missing") });
  assert.deepEqual(focused.checkVaultPath(missing), [{ group: "install", level: "issue", check: "vault-path", message: `Vault path does not exist: ${missing.vault_path}` }]);
  const file = Object.freeze({ vault_path: put("file", "not a directory") });
  assert.deepEqual(focused.checkVaultPath(file), [{ group: "install", level: "issue", check: "vault-path", message: `Vault path is not readable/listable: ${file.vault_path}` }]);
});

test("doctor install module: declared template command order and missing language findings stay complete", t => {
  const { root, cfg } = fixture(t);
  inProject(root, () => {
    assert.deepEqual(focused.checkLayoutTemplates(cfg), []);
    const missing = Object.freeze({ ...cfg, language: "no-such-language" });
    const kinds = ["adr", "spec", "epic", "story", "research", "concept", "meeting", "runbook", "kanban", "folder-readme"];
    assert.deepEqual(focused.checkLayoutTemplates(missing), kinds.map(k => ({ group: "install", level: "issue", check: "templates", message: `Missing template for language "no-such-language": ${k}.md.tmpl` })));
  });
});

test("doctor install module: environment overrides preserve raw values and do not mutate environment", () => {
  withEnv({ CLAUDE_CODE_EFFORT_LEVEL: "low", CLAUDE_CODE_SUBAGENT_MODEL: "test/model" }, () => {
    assert.deepEqual(focused.checkEnvEffort(), [{ group: "install", level: "warn", check: "env-effort", message: 'CLAUDE_CODE_EFFORT_LEVEL=low is set — it overrides the bundled agents\' "effort: max" frontmatter, so every waypost role installed for Claude Code runs at "low" regardless of what `agents/*.md` declares. Unset the variable to restore the roles\' own effort.' }]);
    assert.deepEqual(focused.checkEnvModel(), [{ group: "install", level: "warn", check: "env-model", message: "CLAUDE_CODE_SUBAGENT_MODEL=test/model is set — it overrides the model every waypost role declares, including anything pinned with `waypost agents model`." }]);
    assert.equal(process.env.CLAUDE_CODE_EFFORT_LEVEL, "low");
    assert.equal(process.env.CLAUDE_CODE_SUBAGENT_MODEL, "test/model");
  });
  withEnv({ CLAUDE_CODE_EFFORT_LEVEL: "", CLAUDE_CODE_SUBAGENT_MODEL: "" }, () => {
    assert.deepEqual(focused.checkEnvEffort(), []);
    assert.deepEqual(focused.checkEnvModel(), []);
  });
});

test("doctor install module: gitignore requires exact trimmed lines and leaves files untouched", t => {
  const { root, put } = fixture(t);
  assert.deepEqual(focused.checkGitignore(root), []);
  mkdirSync(join(root, ".git"));
  const full = { group: "install", level: "warn", check: "gitignore", message: 'Machine-specific files not gitignored: .waypost/projectstore.json, .waypost/state/ (or ignore ".waypost/" wholesale).' };
  assert.deepEqual(focused.checkGitignore(root), [full]);
  const p = put(".gitignore", ".waypost/*\n");
  assert.deepEqual(focused.checkGitignore(root), [full]);
  assert.equal(readFileSync(p, "utf8"), ".waypost/*\n");
  put(".gitignore", "  .waypost/projectstore.json  \n.waypost/state/\n");
  assert.deepEqual(focused.checkGitignore(root), []);
  put(".gitignore", "  .waypost/ \n");
  assert.deepEqual(focused.checkGitignore(root), []);
});

test("doctor install module: block ordering and shared regexp state remain stable across hygiene calls", t => {
  const { root, put } = fixture(t);
  put("AGENTS.md", block(1) + block(2));
  inProject(root, () => {
    const expected = [
      { group: "install", level: "issue", check: "agents-block", message: "Duplicated waypost:agents block (2 markers in AGENTS.md) — keep exactly one per file; register migrates, never duplicates.", file: "AGENTS.md" },
      ...[1, 2].map(v => ({ group: "install", level: "issue", check: "agents-block", message: `Agents block in AGENTS.md is v${v}, expected v${AGENT_BLOCK_VERSION} — re-run \`waypost agents register\`.`, file: "AGENTS.md" })),
    ];
    for (let i = 0; i < 3; i++) {
      assert.deepEqual(focused.checkAgentsBlock(root), expected);
      assert.deepEqual(focused.checkInstructionsHygiene(root), []);
      assert.equal(AGENT_BLOCK_MARKER.lastIndex, 0);
    }
  });
});

test("doctor install module: instruction threshold and Claude relative imports keep exact warnings", t => {
  const { root, put } = fixture(t);
  inProject(root, () => {
    assert.equal(focused.INSTRUCTIONS_MAX_LINES, 300);
    put("AGENTS.md", Array(300).fill("rule").join("\n"));
    assert.deepEqual(focused.checkInstructionsHygiene(root), []);
    put("AGENTS.md", Array(301).fill("rule").join("\n"));
    assert.deepEqual(focused.checkInstructionsHygiene(root), [{ group: "install", level: "warn", check: "instructions-size", message: "AGENTS.md is 301 lines — it is read on every turn, and agents adhere less to long instruction files (field practice: 150–200 at the root). Move long material into linked docs or nested files.", file: "AGENTS.md" }]);
    put("AGENTS.md", block());
    put(".claude/CLAUDE.md", "@AGENTS.md\n");
    const expected = [
      { group: "install", level: "warn", check: "claude-import-missing", message: ".claude/CLAUDE.md imports .claude/AGENTS.md, which does not exist: Claude Code resolves an import against the importing file, so nothing is loaded. In .claude/CLAUDE.md the root AGENTS.md is `@../AGENTS.md`.", file: ".claude/CLAUDE.md" },
      { group: "install", level: "warn", check: "claude-bridge", message: "Claude Code reads CLAUDE.md, not AGENTS.md: the routing block in AGENTS.md never reaches it. `waypost doctor --fix` writes a CLAUDE.md that imports it (`@AGENTS.md`)." },
    ];
    for (let i = 0; i < 3; i++) {
      assert.deepEqual(focused.checkInstructionsHygiene(root), expected);
      assert.equal(AGENT_BLOCK_MARKER.lastIndex, 0);
    }
    put(".claude/CLAUDE.md", "@../AGENTS.md\n");
    assert.deepEqual(focused.checkInstructionsHygiene(root), []);
  });
});

test("doctor install module: foreign role and skill retain separate nonrepairable identities without writes", t => {
  const { root, put, cfg } = fixture(t);
  const role = put(".codex/agents/waypost-critic.toml", "User-owned file\n");
  const skill = put(".agents/skills/waypost-review/SKILL.md", "User-owned skill\n");
  inProject(root, () => withEnv({ WAYPOST_HARNESS: "codex" }, () => {
    assert.deepEqual(focused.checkAgentRoles(root, cfg).filter(f => f.check === "agent-roles-foreign"), [{ group: "install", level: "warn", check: "agent-roles-foreign", message: "codex: waypost-critic exist under the waypost- prefix but were not generated by waypost — install and --fix skip them. Rename them if they are yours, or delete them to let install take the name." }]);
    assert.deepEqual(focused.checkAgentSkills(root, cfg).filter(f => f.check === "agent-skills-foreign"), [{ group: "install", level: "warn", check: "agent-skills-foreign", message: ".agents/skills (codex): waypost-review exist under the waypost- prefix but were not generated by waypost — install and --fix skip them." }]);
  }));
  assert.equal(readFileSync(role, "utf8"), "User-owned file\n");
  assert.equal(readFileSync(skill, "utf8"), "User-owned skill\n");
});
