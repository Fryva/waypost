import "./env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as focused from "../scripts/doctor-generated.mjs";
import * as doctor from "../scripts/doctor.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "wp-generated-module-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
function freeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

test("doctor generated module: five public imports retain identical bindings", () => {
  for (const name of ["checkKanbanSync", "checkIndexes", "checkIndexHeaders", "checkCodeMap", "checkGraph"]) {
    assert.equal(focused[name], doctor[name], name);
  }
});

test("doctor generated module: missing code-map stays quiet while kanban and graph report info", t => {
  const cfg = Object.freeze({ vault_path: fixture(t) });
  assert.deepEqual(focused.checkCodeMap(cfg), []);
  assert.deepEqual(focused.checkKanbanSync(cfg), [{ group: "vault", level: "info", check: "kanban",
    message: "No kanban.md yet — run waypost kanban to create the board." }]);
  assert.deepEqual(focused.checkGraph(cfg), [{ group: "vault", level: "info", check: "graph",
    message: "No graph.md yet — run waypost graph to create the link graph." }]);
});

test("doctor generated module: full index findings preserve escaped pipes, order and frozen inputs", t => {
  const root = fixture(t);
  mkdirSync(join(root, "adr"));
  mkdirSync(join(root, "work/epics"), { recursive: true });
  writeFileSync(join(root, "adr/README.md"), "| File | Title | Status | Date |\n|---|---|---|---|\n" +
    "| [rules](./rules.md) | Rule \\| details | accepted | date |\n" +
    "| [bad](./bad.md) | Old title | draft | date |\n" +
    "| [ghost](./ghost.md) | Ghost | draft | date |\n");
  writeFileSync(join(root, "work/epics/README.md"), "No table\n");
  const layout = freeze({ folders: [{ path: "adr", kind: "adr" }, { path: "work/epics", kind: "epic" }] });
  const arts = freeze([
    { kind: "adr", rel: "adr/rules.md", fm: { title: "Rule | details", status: "accepted" } },
    { kind: "adr", rel: "adr/bad.md", fm: { title: "Actual title", status: "accepted" } },
    { kind: "adr", rel: "adr/unlisted.md", fm: {} },
    { kind: "adr", rel: "adr/nested/ignored.md", fm: {} },
    { kind: "epic", rel: "work/epics/E/epic.md", fm: {} },
  ]);
  const before = JSON.stringify({ layout, arts });
  assert.deepEqual(focused.checkIndexes({ vault_path: root }, layout, arts), [
    { group: "vault", level: "issue", check: "index", message: 'adr/README.md lists "bad" as "draft" but its frontmatter says "accepted".', file: "adr/bad.md" },
    { group: "vault", level: "warn", check: "index", message: 'adr/README.md title for "bad" differs from frontmatter title.', file: "adr/bad.md" },
    { group: "vault", level: "issue", check: "index", message: 'adr/README.md row "ghost" points at a missing file: ghost.md', file: "adr/README.md" },
    { group: "vault", level: "warn", check: "index", message: "adr/unlisted.md is not listed in adr/README.md's index.", file: "adr/unlisted.md" },
    { group: "vault", level: "warn", check: "index", message: "work/epics/E/epic.md is not listed in work/epics/README.md's index.", file: "work/epics/E/epic.md" },
  ]);
  assert.equal(JSON.stringify({ layout, arts }), before);
});

test("doctor generated module: index lookup keeps the first duplicate and refreshes the same array", t => {
  const root = fixture(t);
  mkdirSync(join(root, "adr"));
  mkdirSync(join(root, "specs"));
  const row = "| [rules](./rules.md) | Rules | accepted | date |\n";
  writeFileSync(join(root, "adr/README.md"), row + row);
  writeFileSync(join(root, "specs/README.md"), "| [s](./s.md) | Spec | active | date |\n");
  const cfg = { vault_path: root };
  const layout = freeze({ folders: [{ path: "adr", kind: "adr" }, { path: "specs", kind: "spec" }] });
  const first = { kind: "adr", rel: "adr/rules.md", fm: { title: "Rules", status: "accepted" } };
  const arts = [first,
    { kind: "adr", rel: "adr/rules.md", fm: { title: "Wrong duplicate", status: "draft" } },
    { kind: "spec", rel: "specs/s.md", fm: { title: "Spec", status: "active" } }];
  assert.deepEqual(focused.checkIndexes(cfg, layout, arts), []);
  first.fm.status = "proposed";
  const changed = { group: "vault", level: "issue", check: "index",
    message: 'adr/README.md lists "rules" as "accepted" but its frontmatter says "proposed".', file: "adr/rules.md" };
  assert.deepEqual(focused.checkIndexes(cfg, layout, arts), [changed, changed]);
  first.fm.status = "accepted";
  arts.splice(1, 1);
  first.rel = "adr/renamed.md";
  const missing = { group: "vault", level: "issue", check: "index",
    message: 'adr/README.md row "rules" points at a missing file: rules.md', file: "adr/README.md" };
  assert.deepEqual(focused.checkIndexes(cfg, layout, arts), [missing, missing,
    { group: "vault", level: "warn", check: "index", message: "adr/renamed.md is not listed in adr/README.md's index.", file: "adr/renamed.md" }]);
  first.rel = "adr/rules.md";
  assert.deepEqual(focused.checkIndexes(cfg, layout, arts), []);
});

test("doctor generated module: no parsed index rows require no artifact lookup", t => {
  const root = fixture(t);
  const cfg = { vault_path: root };
  const layout = { folders: [{ path: "adr", kind: "adr" }] };
  // Missing README skips artifacts entirely, including lookup preparation.
  assert.deepEqual(focused.checkIndexes(cfg, layout, null), []);
  mkdirSync(join(root, "adr"));
  writeFileSync(join(root, "adr/README.md"), "No index rows\n");
  const art = { kind: "other", get rel() { throw new Error("unexpected lookup"); } };
  assert.deepEqual(focused.checkIndexes(cfg, layout, [art]), []);
  writeFileSync(join(root, "adr/README.md"), "| [absent](./absent.md) | Absent | draft | date |\n");
  assert.deepEqual(focused.checkIndexes(cfg, layout, []), [{ group: "vault", level: "issue", check: "index",
    message: 'adr/README.md row "absent" points at a missing file: absent.md', file: "adr/README.md" }]);
});

test("doctor generated module: localized headers remain valid and extra columns retain full warning", t => {
  const root = fixture(t);
  mkdirSync(join(root, "adr"));
  const layout = freeze({ folders: [{ path: "adr", kind: "adr" }] });
  const cfg = { vault_path: root };
  assert.deepEqual(focused.checkIndexHeaders(cfg, layout), []);
  for (const content of ["No table\n", "| File | Title | Status | Date |\n|---|---|---|---|\n",
    "| Файл | Заголовок | Статус | Дата |\n|---|---|---|---|\n"]) {
    writeFileSync(join(root, "adr/README.md"), content);
    assert.deepEqual(focused.checkIndexHeaders(cfg, layout), []);
  }
  const header = "| File | Title | Status | Date | Notes |";
  writeFileSync(join(root, "adr/README.md"), header + "\n|---|---|---|---|---|\n");
  assert.deepEqual(focused.checkIndexHeaders(cfg, layout), [{ group: "vault", level: "warn", check: "index-header",
    message: `adr/README.md index header "${header}" matches no registered form — reconcile cannot rebuild this index (standard form: | File | Title | Status | Date |, localized forms in scaffold/headings.json).`, file: "adr/README.md" }]);
});

test("doctor generated module: generator errors, inherited project env and timestamp normalization retain exact results", t => {
  const root = fixture(t);
  const install = join(root, "install");
  mkdirSync(join(install, "scripts"), { recursive: true });
  const program = `const mode = process.env.WAYPOST_TEST_GENERATOR_MODE;
if (mode === "fail") { process.stderr.write("fixture failure\\n"); process.exit(2); }
if (mode === "invalid") { process.stdout.write("not json"); process.exit(0); }
const content = process.env.CLAUDE_PROJECT_DIR === process.env.WAYPOST_PROJECT_DIR ? "generated_at: expected\\nbody\\n" : "wrong project\\n";
process.stdout.write(JSON.stringify({ content }));\n`;
  for (const name of ["kanban", "codemap", "graph"]) writeFileSync(join(install, "scripts", name + ".mjs"), program);
  const keys = ["WAYPOST_HOME", "WAYPOST_PROJECT_DIR", "CLAUDE_PROJECT_DIR", "WAYPOST_TEST_GENERATOR_MODE"];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, { WAYPOST_HOME: install, WAYPOST_PROJECT_DIR: root, CLAUDE_PROJECT_DIR: "wrong inherited project" });
  try {
    for (const [check, name, file, stale] of [
      [focused.checkKanbanSync, "kanban", "kanban.md", "kanban.md is out of sync with story frontmatter — run waypost kanban (or reconcile)."],
      [focused.checkCodeMap, "code-map", "code-map.md", "code-map.md is stale against frontmatter code_refs — run waypost codemap (or reconcile)."],
      [focused.checkGraph, "graph", "graph.md", "graph.md is out of sync with vault links — run waypost graph (or reconcile)."],
    ]) {
      const cfg = Object.freeze({ vault_path: root });
      const path = join(root, file);
      process.env.WAYPOST_TEST_GENERATOR_MODE = "ok";
      writeFileSync(path, "generated_at: old\nbody\n\n");
      assert.deepEqual(check(cfg), [], name);
      writeFileSync(path, "body\nstale\n");
      assert.deepEqual(check(cfg), [{ group: "vault", level: "issue", check: name, message: stale, file }]);
      process.env.WAYPOST_TEST_GENERATOR_MODE = "fail";
      const failure = name === "code-map" ? "codemap generator failed." : `${name} generator failed: fixture failure`;
      assert.deepEqual(check(cfg), [{ group: "vault", level: "warn", check: name, message: failure }]);
      process.env.WAYPOST_TEST_GENERATOR_MODE = "invalid";
      const label = name === "code-map" ? "codemap" : name;
      assert.deepEqual(check(cfg), [{ group: "vault", level: "warn", check: name, message: `${label} generator returned unparseable output.` }]);
    }
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});

test("doctor generated module: existing index read failures still propagate", t => {
  const root = fixture(t);
  mkdirSync(join(root, "adr/README.md"), { recursive: true });
  const cfg = { vault_path: root };
  const layout = { folders: [{ path: "adr", kind: "adr" }] };
  assert.throws(() => focused.checkIndexes(cfg, layout, []));
  assert.throws(() => focused.checkIndexHeaders(cfg, layout));
});
