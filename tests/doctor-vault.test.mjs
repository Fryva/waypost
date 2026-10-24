import "./env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, chmodSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import * as focused from "../scripts/doctor-vault.mjs";
import * as doctor from "../scripts/doctor.mjs";
import { loadLayout, buildNodeIndex } from "../scripts/lib.mjs";

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "wp-vault-module-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const vault = join(root, "vault");
  const put = (rel, text) => {
    const path = join(root, rel);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, text);
    return path;
  };
  put(".waypost/projectstore.json", JSON.stringify({ vault_path: "vault", layout: "engineering" }));
  put("vault/.projectstore.json", JSON.stringify({ self_install: "off", spec_policy: "optional" }));
  put(".gitignore", ".waypost/\n");
  return { root, vault, put, cfg: Object.freeze({ vault_path: vault, layout: "engineering" }) };
}
function inProject(root, fn) {
  const values = { WAYPOST_PROJECT_DIR: root, CLAUDE_PROJECT_DIR: root, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(root, "nonexistent-global-config") };
  const saved = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  try { return fn(); } finally {
    for (const key of Object.keys(values)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}
function freeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
const md = (kind, id, extra = "", body = "") => `---\ntype: ${kind}\nid: ${id}\n${extra}---\n${body}`;

test("doctor vault module: six public imports retain identical bindings", () => {
  for (const name of ["scanArtifacts", "checkVaultPolicy", "checkWikilinks", "checkWorkWithoutStory", "checkDependencies", "checkAdrNumbers"]) {
    assert.equal(focused[name], doctor[name], name);
  }
});

test("doctor vault module: custom scan keeps hidden top-level markdown and all three story shapes, skipping read errors", t => {
  const { vault, put, cfg } = fixture(t);
  const paths = ["adr/a.md", "adr/.hidden.md", "work/epics/E/epic.md", "work/epics/E/stories/story-flat.md", "work/epics/E/stories/story-folder/README.md", "work/epics/E/story-standalone.md"];
  for (const rel of paths) put("vault/" + rel, md(rel.startsWith("adr/") ? "adr" : rel.endsWith("epic.md") ? "epic" : "story", "example"));
  put("vault/adr/README.md", "Index\n");
  put("vault/adr/UPPER.MD", md("adr", "upper"));
  put("vault/adr/nested/ignored.md", md("adr", "nested"));
  put("vault/broken", "not a directory\n");
  mkdirSync(join(vault, "adr/unreadable.md"));
  const layout = freeze({ folders: [{ path: "adr", kind: "adr" }, { path: "work/epics", kind: "epic" }, { path: "broken", kind: "research" }] });
  const before = JSON.stringify(layout);
  const result = focused.scanArtifacts(cfg, layout);
  assert.deepEqual(result.map(a => a.rel).sort(), [...paths].sort());
  assert.deepEqual(result.find(a => a.rel === "adr/a.md"), { abs: join(vault, "adr/a.md"), rel: "adr/a.md", kind: "adr", fm: { type: "adr", id: "example" }, body: md("adr", "example") });
  assert.equal(JSON.stringify(layout), before);
});

test("doctor vault module: malformed policy, missing cutoff and invalid flags keep complete findings", t => {
  const { put, cfg } = fixture(t);
  put("vault/.projectstore.json", "{");
  let detail;
  try { JSON.parse("{"); } catch (error) { detail = error.message; }
  const arts = freeze([{ kind: "spec", rel: "specs/a.md", fm: {}, body: "" }]);
  const policy = freeze({ lifecycle_gates: "yes", acceptance_gate: "maybe", self_install: "unknown" });
  const before = JSON.stringify({ arts, policy });
  assert.deepEqual(focused.checkVaultPolicy(cfg, {}, arts, policy), [
    { group: "vault", level: "issue", check: "vault-policy", message: `<vault>/.projectstore.json is not valid JSON (${detail}) — spec_policy and lifecycle_gates fall back to their defaults until it is fixed.`, file: ".projectstore.json" },
    { group: "vault", level: "info", check: "spec-policy", message: 'Vault contains specs but declares no spec_policy — consider enabling spec-first: add { "spec_policy": "required" } to <vault>/.projectstore.json (doctor gates activate).' },
    { group: "vault", level: "warn", check: "vault-policy", message: 'lifecycle_gates: "yes" in <vault>/.projectstore.json is not on/off/true/false — it is read as off, silently.', file: ".projectstore.json" },
    { group: "vault", level: "warn", check: "vault-policy", message: 'acceptance_gate: "maybe" in <vault>/.projectstore.json is not on/off/true/false — it is read as off, silently.', file: ".projectstore.json" },
    { group: "vault", level: "warn", check: "vault-policy", message: 'self_install: "unknown" in <vault>/.projectstore.json is not on/off — it is read as on: `waypost brief` installs roles and skills.', file: ".projectstore.json" },
  ]);
  assert.equal(JSON.stringify({ arts, policy }), before);
  put("vault/.projectstore.json", "{}");
  assert.deepEqual(focused.checkVaultPolicy(cfg, {}, [], { spec_policy: "required" }), [{ group: "vault", level: "warn", check: "spec-policy", message: "spec_policy is required but spec_policy_since is missing — the legacy exemption cannot be evaluated; stamp it with the enable date (ISO-8601)." }]);
});

test("doctor vault module: explicit and default link indexes keep full dead and ambiguous findings", t => {
  const { put, cfg } = fixture(t);
  const body = md("adr", "source", "", "[[missing]] [broken](./no.md) [[topic]] [[loose]]");
  put("vault/adr/source.md", body);
  put("vault/adr/topic.md", md("adr", "topic"));
  put("vault/research/topic.md", md("research", "topic"));
  put("vault/loose.md", "Outside node scope\n");
  const arts = freeze([{ rel: "adr/source.md", kind: "adr", fm: { type: "adr", id: "source" }, body }]);
  const files = doctor.walkVaultFiles(cfg.vault_path);
  const index = buildNodeIndex(cfg, loadLayout("engineering"));
  const expected = [
    { group: "vault", level: "issue", check: "wikilink", message: "Dead wiki-link [[missing]].", file: "adr/source.md" },
    { group: "vault", level: "warn", check: "wikilink", message: "Ambiguous wiki-link [[topic]] — matches adr/topic.md, research/topic.md; qualify with a path.", file: "adr/source.md" },
    { group: "vault", level: "issue", check: "rel-link", message: "Dead relative link (./no.md).", file: "adr/source.md" },
  ];
  assert.deepEqual(focused.checkWikilinks(cfg, arts, files, index), expected);
  assert.deepEqual(focused.checkWikilinks(cfg, arts), expected);
  const skipped = focused.checkWikilinks({ ...cfg, layout: "fixture-no-such-layout" }, arts);
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].level, "warn");
  assert.match(skipped[0].message, /^Link check skipped — node index failed:/);
  assert.throws(() => focused.checkWikilinks({ ...cfg, vault_path: join(cfg.vault_path, "missing") }, arts), { code: "ENOENT" });
});

test("doctor vault module: missing and block-form dependencies precede the single cycle finding", t => {
  const { root, put, vault } = fixture(t);
  put("vault/epics/E/stories/story-a.md", md("story", "story-a", 'status: planned\nblocked_by: ["E/story-b", "E/missing"]\n'));
  put("vault/epics/E/stories/story-b.md", md("story", "story-b", 'status: planned\nblocked_by: ["E/story-a"]\n'));
  put("vault/epics/E/stories/story-c.md", md("story", "story-c", "status: planned\nblocked_by:\n  - E/story-a\n"));
  inProject(root, () => assert.deepEqual(focused.checkDependencies(vault), [
    { group: "vault", level: "issue", check: "story-deps", message: 'E/story-a: blocked_by names no story: "E/missing" — use <epic>/<story-stem>, as `waypost story` prints it.', file: "vault/epics/E/stories/story-a.md" },
    { group: "vault", level: "issue", check: "story-deps", message: 'E/story-c: blocked_by is written in block form, which the line-based frontmatter reader reads as empty — write it as a JSON list: blocked_by: ["<epic>/<stem>"].', file: "vault/epics/E/stories/story-c.md" },
    { group: "vault", level: "issue", check: "story-deps", message: "dependency cycle: E/story-a → E/story-b → E/story-a — each waits for the other; drop one blocked_by.", file: "vault/epics/E/stories/story-b.md" },
  ]));
});

test("doctor vault module: ADR collisions retain native filename order and original width", t => {
  const { vault, put } = fixture(t);
  assert.deepEqual(focused.checkAdrNumbers(vault), []);
  for (const name of ["007-one.md", "0007-two.md", "017-last.md", "018-upper.MD", "17-short.md"]) put("vault/decisions/" + name, "fixture\n");
  const pair = readdirSync(join(vault, "decisions")).filter(name => ["007-one.md", "0007-two.md"].includes(name));
  const [shown, next] = pair[0].startsWith("0007") ? ["0007", "0018"] : ["007", "018"];
  assert.deepEqual(focused.checkAdrNumbers(vault, "decisions"), [{ group: "vault", level: "issue", check: "adr-number",
    message: `two decisions share number ${shown}: ${pair.join(", ")} — rename one to the next free number (${next}) and fix the links to it.`, file: "decisions/" + pair[1] }]);
});

test("doctor vault module: actual Git dirty, open and committed work keep exact warnings", t => {
  const { root, vault, cfg, put } = fixture(t);
  const path = put("vault/epics/E/stories/story-a.md", md("story", "story-a", "status: planned\n"));
  inProject(root, () => {
    assert.deepEqual(focused.checkWorkWithoutStory(null, root), []);
    assert.deepEqual(focused.checkWorkWithoutStory(cfg, root), []);
    const git = (args, date = "2020-01-01T00:00:00Z") => {
      const r = spawnSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", ...args], {
        cwd: root, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
      });
      assert.equal(r.status, 0, r.stderr);
    };
    const warning = what => [{ group: "vault", level: "warn", check: "work-without-story",
      message: `${what} in the project, and no story is in progress. If this is feature-sized work, open it in the vault: \`waypost draft story <EPIC> "<title>" --write\`.` }];
    git(["init", "-q"]);
    utimesSync(path, new Date("2025-01-01"), new Date("2025-01-01"));
    git(["add", "."]); git(["commit", "-qm", "Fixture"]);
    assert.deepEqual(focused.checkWorkWithoutStory(cfg, root), []);
    put("extra.mjs", "export const extra = 1;\n");
    assert.deepEqual(focused.checkWorkWithoutStory(cfg, root), warning("1 uncommitted source file(s)"));
    put("vault/epics/E/stories/story-a.md", md("story", "story-a", "status: in-progress\n"));
    assert.deepEqual(focused.checkWorkWithoutStory(cfg, root), []);
    put("vault/epics/E/stories/story-a.md", md("story", "story-a", "status: planned\n"));
    utimesSync(path, new Date("2025-01-01"), new Date("2025-01-01"));
    git(["add", "."]); git(["commit", "-qm", "Committed work"], "2030-01-01T00:00:00Z");
    assert.deepEqual(focused.checkWorkWithoutStory(cfg, root), warning("commits newer than the vault's last activity"));
  });
});

test("doctor vault module: an actually unreadable story remains inconclusive", t => {
  const { root, put, cfg } = fixture(t);
  const path = put("vault/epics/E/stories/story-a.md", md("story", "story-a", "status: planned\n"));
  try {
    chmodSync(path, 0);
    let unreadable = false;
    try { readFileSync(path); } catch { unreadable = true; }
    if (!unreadable) return t.skip("permissions do not make this file unreadable on this host");
    inProject(root, () => assert.deepEqual(focused.checkWorkWithoutStory(cfg, root), [{ group: "vault", level: "warn", check: "work-without-story",
      message: 'Could not read 1 story file(s), so "is any story in progress" is unproven — this check is inconclusive rather than clean.' }]));
  } finally { chmodSync(path, 0o644); }
});
