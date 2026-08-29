// mps — harness-agnostic surface tests: the agent roles and their per-harness
// adapters (ADR-0003), and the CLI that every harness shares (ADR-0001).
//   node --test tests/*.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { listRoles, roleNames, readRole, renderFor, PREFIX, HARNESSES } from "../scripts/agents.mjs";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const MPS = join(REPO, "bin", "mps");

function project() {
  const proj = mkdtempSync(join(tmpdir(), "mps-h-"));
  spawnSync("git", ["init", "-q"], { cwd: proj });
  return proj;
}

function mps(proj, args, { expectFail = false } = {}) {
  const r = spawnSync(process.execPath, [MPS, ...args], {
    encoding: "utf8", cwd: proj, timeout: 30000,
    env: { ...process.env, MPS_PROJECT_DIR: proj, MPS_HOME: REPO },
  });
  if (!expectFail) assert.equal(r.status, 0, `${args.join(" ")}\n${r.stderr}${r.stdout}`);
  return r;
}

function bound() {
  const proj = project();
  const vault = join(proj, "vault");
  mps(proj, ["bind", vault]);
  return { proj, vault };
}

// ─── role definitions ──────────────────────────────────────────────────

test("every bundled role is neutral: no harness-specific paths or slash commands", () => {
  const roles = listRoles();
  assert.ok(roles.length >= 3, "the roster ships");
  for (const r of roles) {
    assert.equal(r.name, r.path.split("/").pop().replace(/\.md$/, ""), "name matches filename");
    assert.ok(r.description.length > 40, `${r.name} describes when to invoke it`);
    assert.ok(["reasoning", "balanced", "fast"].includes(r.tier),
      `${r.name} declares a neutral model tier, not a vendor model id: ${r.tier}`);
    assert.ok(r.tools.length, `${r.name} declares tools`);
    const raw = readFileSync(r.path, "utf8");
    assert.ok(!/CLAUDE_PLUGIN_ROOT|\.claude\/projectstore\.json/.test(raw),
      `${r.name} must not name Claude Code's plugin wiring`);
    assert.ok(!/\/projectstore:/.test(raw), `${r.name} must not name upstream slash commands`);
  }
});

// ─── adapters ──────────────────────────────────────────────────────────

test("each harness gets the same role in its own dialect, with provenance", () => {
  const role = readRole("critic");
  const claude = renderFor("claude", role, null);
  assert.match(claude, new RegExp(`^---\\nname: ${PREFIX}critic$`, "m"), "claude keys agents by name");
  assert.match(claude, /^model: opus$/m, "the reasoning tier maps to opus for Claude Code");
  assert.match(claude, /^tools: Read, Grep, Glob, Bash, WebFetch, WebSearch$/m);

  const opencode = renderFor("opencode", role, null);
  assert.match(opencode, /^mode: subagent$/m, "opencode declares the agent mode");
  assert.match(opencode, /^ {2}write: false$/m, "a read-only role is enforced by the tool map");
  assert.match(opencode, /^ {2}edit: false$/m);
  assert.ok(!/^model:/m.test(opencode), "no model is invented for a harness with no stable tier names");

  const codex = renderFor("codex", role, null);
  assert.match(codex, /\$ARGUMENTS/, "codex prompts take their target as an argument");
  assert.match(codex, /READ-ONLY/, "what the tool map cannot enforce is stated in prose");

  for (const [name, text] of [["claude", claude], ["opencode", opencode], ["codex", codex]]) {
    assert.ok(text.includes(`agents/critic.md@${role.hash}`), `${name} carries the source hash`);
    assert.ok(text.includes(role.body.split("\n")[0]), `${name} carries the role prompt itself`);
  }
});

test("install: idempotent, per-harness, and detected harnesses are the default", () => {
  const { proj } = bound();
  mkdirSync(join(proj, ".opencode"), { recursive: true });

  const first = mps(proj, ["agents", "install"]).stdout;
  assert.ok(/\.opencode\/agent\/mps-critic\.md/.test(first), "the harness in use is installed");
  assert.ok(!/\.codex\/prompts/.test(first), "a harness this project does not use is left alone");
  assert.ok(!existsSync(join(proj, ".codex")), "no directory is conjured for an unused harness");

  const second = mps(proj, ["agents", "install"]).stdout;
  assert.ok(!/created|updated/.test(second), `second install is a no-op:\n${second}`);

  const files = readdirSync(join(proj, ".opencode", "agent"));
  assert.deepEqual(files.sort(), roleNames().map((n) => `${PREFIX}${n}.md`).sort());
});

test("uninstall removes what mps generated and keeps what it did not", () => {
  const { proj } = bound();
  mps(proj, ["agents", "install", "--harness", "claude"]);
  const mine = join(proj, ".claude", "agents", `${PREFIX}critic.md`);
  const theirs = join(proj, ".claude", "agents", `${PREFIX}mine.md`);
  writeFileSync(theirs, "---\nname: mps-mine\n---\nhand written\n", "utf8");

  mps(proj, ["agents", "uninstall", "--harness", "claude"]);
  assert.ok(!existsSync(mine), "generated role files go");
  assert.equal(readFileSync(theirs, "utf8"), "---\nname: mps-mine\n---\nhand written\n",
    "a file with no provenance line is not ours to delete");
});

test("a hand-edited role file is stale, and doctor says so as an issue", () => {
  const { proj } = bound();
  mps(proj, ["agents", "install", "--harness", "claude"]);
  const p = join(proj, ".claude", "agents", `${PREFIX}critic.md`);
  writeFileSync(p, readFileSync(p, "utf8").replace(/@[0-9a-f]{12}/, "@deadbeefcafe"), "utf8");

  const findings = JSON.parse(mps(proj, ["doctor", "--install", "--json"]).stdout);
  const stale = findings.find((f) => f.check === "agent-roles" && f.level === "issue");
  assert.ok(stale, `expected a stale-role issue, got:\n${JSON.stringify(findings, null, 2)}`);
  assert.match(stale.message, /mps agents install --harness claude/, "it names the repair");

  mps(proj, ["doctor", "--fix"]);
  const after = JSON.parse(mps(proj, ["doctor", "--install", "--json"]).stdout);
  assert.ok(!after.some((f) => f.check === "agent-roles" && f.level === "issue"), "--fix re-renders it");
});

test("agents model: the config pins the model the adapters render", () => {
  const { proj } = bound();
  mps(proj, ["agents", "model", "default", "sonnet"]);
  mps(proj, ["agents", "model", "reviewer", "fable"]);
  mps(proj, ["agents", "install", "--harness", "claude"]);
  const read = (n) => readFileSync(join(proj, ".claude", "agents", `${PREFIX}${n}.md`), "utf8");
  assert.match(read("critic"), /^model: sonnet$/m, "the default applies to every role");
  assert.match(read("reviewer"), /^model: fable$/m, "a per-role pin wins over the default");
});

test("register writes exactly one routing block and migrates it in place", () => {
  const { proj } = bound();
  writeFileSync(join(proj, "AGENTS.md"), "# Project rules\n\nkeep me\n", "utf8");
  mps(proj, ["agents", "register"]);
  let text = readFileSync(join(proj, "AGENTS.md"), "utf8");
  assert.equal((text.match(/<!-- mps:agents v\d+/g) || []).length, 1);
  assert.ok(text.includes("keep me"), "existing instructions survive");
  for (const n of roleNames()) assert.ok(text.includes(`${PREFIX}${n}`), `${n} is routed`);

  mps(proj, ["agents", "register"]);
  assert.equal((readFileSync(join(proj, "AGENTS.md"), "utf8").match(/<!-- mps:agents v\d+/g) || []).length, 1,
    "re-registering replaces, never duplicates");

  mps(proj, ["agents", "unregister"]);
  assert.ok(!/mps:agents/.test(readFileSync(join(proj, "AGENTS.md"), "utf8")));
});

test("agents show prints the prompt alone — a harness with no subagents can pipe it", () => {
  const { proj } = bound();
  const out = mps(proj, ["agents", "show", "critic", "adr/foo.md"]).stdout;
  assert.match(out, /^Target: adr\/foo\.md$/m, "the target is passed through");
  assert.ok(!out.includes("---\nname:"), "no frontmatter — this is a prompt, not a file");
  assert.ok(out.includes(readRole("critic").body.split("\n")[0]));
});

// ─── the shared CLI ────────────────────────────────────────────────────

test("bind scaffolds the layout and refuses a silent rebind", () => {
  const { proj, vault } = bound();
  for (const d of ["adr", "specs", "epics", "research", "concepts", "meetings", "ops", "diagrams"]) {
    assert.ok(existsSync(join(vault, d, "README.md")), `${d}/README.md`);
  }
  const cfg = JSON.parse(readFileSync(join(proj, ".mps", "projectstore.json"), "utf8"));
  assert.equal(cfg.vault_path, vault);
  assert.equal(cfg.layout, "engineering");

  const r = mps(proj, ["bind", join(proj, "other")], { expectFail: true });
  assert.notEqual(r.status, 0, "a rebind elsewhere needs --force");
  assert.match(r.stderr, /--force/);
});

test("bind rejects an unknown layout or language before touching anything", () => {
  const proj = project();
  const bad = mps(proj, ["bind", join(proj, "v"), "--layout", "nope"], { expectFail: true });
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /unknown layout/);
  assert.ok(!existsSync(join(proj, ".mps")), "nothing was written");
});

test("draft --write creates the artifact and reconciles the derived views", () => {
  const { proj, vault } = bound();
  mps(proj, ["draft", "adr", "Use Postgres", "--write"]);
  const adr = join(vault, "adr", "use-postgres.md");
  assert.ok(existsSync(adr), "the artifact lands at its slug");
  assert.match(readFileSync(join(vault, "adr", "README.md"), "utf8"), /use-postgres/,
    "the folder index row is regenerated, not hand-patched");

  const again = mps(proj, ["draft", "adr", "Use Postgres", "--write"], { expectFail: true });
  assert.notEqual(again.status, 0, "creating the same identity twice is refused");

  mps(proj, ["draft", "epic", "PS-1", "First epic", "--write"]);
  mps(proj, ["draft", "story", "PS-1", "First story", "--write"]);
  assert.match(readFileSync(join(vault, "kanban.md"), "utf8"), /First story/, "the board picked it up");

  mps(proj, ["graph"]);
  assert.ok(existsSync(join(vault, "graph.md")));
  mps(proj, ["codemap"]);
  assert.ok(existsSync(join(vault, "code-map.md")));
});

test("draft without --write writes nothing and previews the JSON", () => {
  const { proj, vault } = bound();
  const out = JSON.parse(mps(proj, ["draft", "adr", "Only a draft"]).stdout);
  assert.equal(out.kind, "adr");
  assert.ok(out.content.includes("# Only a draft"));
  assert.ok(!existsSync(out.path), "a preview is not a write");
  assert.ok(!existsSync(join(vault, "kanban.md")), "and it reconciles nothing");
});

test("story gates: preview by default, applied with --write", () => {
  const { proj, vault } = bound();
  mps(proj, ["draft", "epic", "PS-1", "E", "--write"]);
  mps(proj, ["draft", "story", "PS-1", "S", "--write"]);
  const story = join(vault, "epics", "PS-1", "stories", "story-s.md");

  mps(proj, ["story", "plan", story]);
  assert.match(readFileSync(story, "utf8"), /status: planned/, "a preview does not stamp the file");

  mps(proj, ["story", "plan", story, "--write"]);
  const planned = readFileSync(story, "utf8");
  assert.match(planned, /status: in-progress/);
  assert.match(planned, /plan_updated_at: "20/);

  mps(proj, ["story", "close", story, "--write"]);
  const closed = readFileSync(story, "utf8");
  assert.match(closed, /status: done/);
  assert.match(closed, /closed_at: "20/);
  assert.match(readFileSync(join(vault, "kanban.md"), "utf8"), /## Done\n\n- \[x\]/,
    "closing moves the card, because the board is derived");
});

test("a freshly bound and scaffolded project is clean under doctor", () => {
  const { proj } = bound();
  mps(proj, ["agents", "install", "--harness", "claude"]);
  mps(proj, ["agents", "register"]);
  mps(proj, ["doctor", "--fix"]);
  const findings = JSON.parse(mps(proj, ["doctor", "--json"]).stdout);
  const issues = findings.filter((f) => f.level === "issue");
  assert.deepEqual(issues, [], `no issues expected:\n${JSON.stringify(issues, null, 2)}`);
});

test("doctor names the missing bind rather than the harness that is missing", () => {
  const proj = project();
  const findings = JSON.parse(mps(proj, ["doctor", "--json"]).stdout);
  const cfg = findings.find((f) => f.check === "config");
  assert.ok(cfg, "the unbound project is reported");
  assert.match(cfg.message, /\.mps\/projectstore\.json/);
  assert.ok(!/\.claude/.test(cfg.message), "the canonical path is not Claude's");
});

test("brief is the session-start packet, on demand and without a hook", () => {
  const { proj, vault } = bound();
  mps(proj, ["draft", "epic", "PS-1", "E", "--write"]);
  mps(proj, ["draft", "story", "PS-1", "S", "--write"]);
  const out = mps(proj, ["brief"]).stdout;
  assert.ok(out.includes(vault), "it names the vault it is orienting in");
  assert.match(out, /## Where things live/);
  assert.match(out, /\| `adr\/` \| adr \|/, "folders come from the layout");
  assert.ok(!out.includes("Use Postgres"), "a skeleton carries no artifact content");
});

test("sessions: the registry is reachable by command from any harness", () => {
  const { proj, vault } = bound();
  const touched = mps(proj, ["sessions", "--touch", "--id", "alpha", "--json"]).stdout;
  assert.match(touched, /"touched": true/);
  const listed = JSON.parse(mps(proj, ["sessions", "--id", "beta", "--json"]).stdout);
  assert.ok(listed.active.some((s) => s.id === "alpha"), "another session sees it");
  assert.ok(existsSync(join(vault, ".projectstore", "sessions", "alpha.json")));

  const outside = mps(proj, ["sessions", "--touch", "--id", "alpha", "--file", join(proj, "x.md")], { expectFail: true });
  assert.notEqual(outside.status, 0, "activity is vault-scoped");
});

test("unknown commands and unbound vaults fail loudly, never silently", () => {
  const proj = project();
  for (const args of [["nope"], ["draft"], ["scaffold"], ["brief"], ["sessions"]]) {
    const r = mps(proj, args, { expectFail: true });
    assert.notEqual(r.status, 0, `${args.join(" ")} should exit non-zero`);
  }
});

test("help lists every command the dispatcher actually implements", () => {
  const proj = project();
  const help = mps(proj, ["help"]).stdout;
  for (const cmd of ["bind", "scaffold", "status", "draft", "story", "kanban", "graph", "codemap",
    "reconcile", "doctor", "diff-refs", "agents", "prompt", "skill", "sessions", "brief"]) {
    assert.ok(help.includes(cmd), `help mentions ${cmd}`);
  }
  for (const h of HARNESSES) assert.ok(help.includes(h) || h === "claude", `help mentions ${h}`);
});

test("prompts and skills print, and name no upstream slash command", () => {
  const proj = project();
  const list = mps(proj, ["prompt"]).stdout;
  assert.match(list, /adr/);
  for (const name of ["adr", "story", "review"]) {
    const text = mps(proj, ["prompt", name]).stdout;
    assert.ok(!/\/projectstore:/.test(text), `${name} names no upstream slash command`);
    assert.ok(!/CLAUDE_PLUGIN_ROOT/.test(text), `${name} names no Claude plugin path`);
  }
  const skill = mps(proj, ["skill", "decision-detector"]).stdout;
  assert.ok(!/\/projectstore:/.test(skill));
});
