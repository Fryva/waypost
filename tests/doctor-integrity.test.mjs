import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkCodeRefs, checkSupersedes, checkAcceptanceGate } from "../scripts/doctor-integrity.mjs";
import { buildNodeIndex, loadLayout } from "../scripts/lib.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "wp-integrity-module-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
const artifact = (kind, rel, fm) => Object.freeze({ kind, rel, fm: Object.freeze(fm), body: "" });

test("doctor integrity module: nested epic footprints cover all three story shapes", t => {
  const root = fixture(t);
  for (const dir of ["src", "other"]) {
    mkdirSync(join(root, dir));
    writeFileSync(join(root, dir, "file.mjs"), "export {};\n");
  }
  const paths = ["work/projects/E/stories/story-flat.md", "work/projects/E/stories/story-folder/README.md", "work/projects/E/story-standalone.md"];
  const artifacts = Object.freeze([
    artifact("epic", "work/projects/E/epic.md", { code_refs: '["src/"]' }),
    ...paths.map(rel => artifact("story", rel, { status: "done", code_refs: '["src/file.mjs", "other/file.mjs"]' })),
  ]);
  const before = JSON.stringify(artifacts);
  assert.deepEqual(checkCodeRefs(artifacts, root, "work/projects"), paths.map(file => ({
    group: "vault", level: "warn", check: "code-refs", file,
    message: 'Story code_ref "other/file.mjs" falls outside the parent epic\'s code_refs.',
  })));
  assert.equal(JSON.stringify(artifacts), before);
});

test("doctor integrity module: reference statuses and annotation suffixes keep exact findings", t => {
  const root = fixture(t);
  for (const [status, level] of [["proposed", "warn"], ["accepted", "warn"], ["in-progress", "issue"], ["in_progress", "issue"], ["done", "issue"]]) {
    const artifacts = Object.freeze([artifact("adr", "adr/a.md", { status,
      code_refs: '["missing.mjs", "future.mjs (PLANNED)", "old.mjs (deleted)", "wait.mjs (waiting)", "src/**/*.mjs"]' })]);
    assert.deepEqual(checkCodeRefs(artifacts, root), [{ group: "vault", level, check: "code-refs",
      message: `code_refs path "missing.mjs" does not resolve inside the project (status: ${status}).`, file: "adr/a.md" }]);
  }
  const trailing = [artifact("adr", "adr/a.md", { status: "done", code_refs: '["missing.mjs (planned) later"]' })];
  assert.equal(checkCodeRefs(trailing, root).length, 1);
});

test("doctor integrity module: supersede scalars use real frontmatter and the shared slug resolver", t => {
  const root = fixture(t);
  mkdirSync(join(root, "adr"));
  const write = (file, fields) => writeFileSync(join(root, "adr", file), `---\ntype: adr\ndate: 2026-01-01\n${fields}\n---\n`);
  write("ADR-001-old-way.md", "id: old-way\ntitle: Old\nstatus: superseded\nsuperseded_by: new-way");
  write("ADR-002-new-way.md", "id: new-way\ntitle: New\nstatus: accepted\nsupersedes: old-way");
  const run = () => {
    const index = buildNodeIndex({ vault_path: root }, loadLayout("engineering"));
    const files = index.nodes.map(n => ({ rel: n.path, name: n.path.split("/").at(-1) }));
    return checkSupersedes(index, files);
  };
  assert.deepEqual(run(), []);
  write("bad.md", "id: bad\ntitle: Bad\nstatus: accepted\nsupersedes: ghost");
  assert.deepEqual(run(), [{ group: "vault", level: "issue", check: "supersedes",
    message: 'supersedes names "ghost", which is not an artifact in this vault.', file: "adr/bad.md" }]);
});

function supersedeFixture(t) {
  const root = fixture(t);
  const put = (rel, kind, id, fields = "") => {
    mkdirSync(join(root, rel, ".."), { recursive: true });
    writeFileSync(join(root, rel), `---\ntype: ${kind}\nid: ${id}\ntitle: ${id}\n${fields}\n---\n`);
  };
  const index = () => buildNodeIndex({ vault_path: root }, loadLayout("engineering"));
  return { root, put, index };
}
function membershipObserver(files) {
  let count = 0;
  return { files: new Proxy(files, { get(target, key, receiver) {
    if (key === "map") return (...args) => { count++; return Array.prototype.map.apply(target, args); };
    return Reflect.get(target, key, receiver);
  } }), count: () => count };
}

test("doctor integrity module: shared membership preserves scoped, mirror, fallback and deduplicated findings", t => {
  const { root, put, index } = supersedeFixture(t);
  put("adr/old.md", "adr", "old", "status: superseded\nsuperseded_by: new");
  put("adr/new.md", "adr", "new", 'status: accepted\nsupersedes: ["old", "old", "missing", "cross", "many", "crowd", "new", "live", "live", "loose"]');
  put("adr/live.md", "adr", "live", "status: proposed");
  for (const name of ["dup-one", "dup-two"]) put(`adr/${name}.md`, "adr", "crowd", "status: proposed");
  put("research/old.md", "research", "old", "status: draft");
  put("research/cross.md", "research", "cross", "status: draft");
  put("research/many.md", "research", "many", "status: draft");
  put("specs/many.md", "spec", "many", "status: draft");
  writeFileSync(join(root, "loose.md"), "Outside node scope\n");
  const idx = index();
  const files = Object.freeze([...idx.nodes.map(n => Object.freeze({ rel: n.path, name: n.path.split("/").at(-1) })), Object.freeze({ rel: "loose.md", name: "loose.md" })]);
  const before = JSON.stringify({ nodes: idx.nodes, files });
  const f = (level, message, file = "adr/new.md") => ({ group: "vault", level, check: "supersedes", message, file });
  const expected = [
    f("issue", 'supersedes names "missing", which is not an artifact in this vault.'),
    f("warn", 'supersedes "cross" resolves to research/cross.md (kind: research) — graph.mjs reads these fields for adr only, so the edge is not rendered.'),
    f("issue", 'supersedes "many" is ambiguous — it matches research/many.md, specs/many.md.'),
    f("issue", 'supersedes "crowd" is ambiguous — it matches adr/dup-one.md, adr/dup-two.md.'),
    f("issue", "supersedes points at the artifact itself."),
    f("warn", 'supersedes "live" is one-directional — adr/live.md does not declare superseded_by back.'),
    f("issue", 'supersedes names "loose", which is not an artifact in this vault.'),
    f("warn", 'Declared as replaced, but its status is "proposed", not "superseded".', "adr/live.md"),
  ];
  const observed = membershipObserver(files);
  assert.deepEqual(checkSupersedes(idx, observed.files), expected);
  assert.ok(observed.count() <= 1, "all resolution paths share membership within the check");
  assert.equal(JSON.stringify({ nodes: idx.nodes, files }), before);
});

test("doctor integrity module: no-reference checks stay lazy and empty membership is reusable", t => {
  const { put, index } = supersedeFixture(t);
  put("adr/a.md", "adr", "a", "status: proposed");
  const sentinel = new Error("membership prepared");
  let mapReads = 0;
  const cold = new Proxy([], { get(target, key, receiver) {
    if (key === "map") { mapReads++; throw sentinel; }
    return Reflect.get(target, key, receiver);
  } });
  assert.deepEqual(checkSupersedes(index(), cold), []);
  assert.equal(mapReads, 0);
  put("adr/a.md", "adr", "a", 'supersedes: ["missing", "missing", "other"]');
  const idx = index();
  const observed = membershipObserver([]);
  assert.equal(checkSupersedes(idx, observed.files).length, 2);
  assert.ok(observed.count() <= 1, "empty Set is a reusable cache");
  assert.throws(() => checkSupersedes(idx, cold), error => error === sentinel);
  assert.equal(mapReads, 1);
  assert.throws(() => checkSupersedes(idx, [null]), TypeError);
});

test("doctor integrity module: qualified supersedes stay fresh after same-array create, rename and delete", t => {
  const { root, put, index } = supersedeFixture(t);
  const files = [];
  const source = target => put("adr/source.md", "adr", "source", `status: accepted\nsupersedes: ${target}`);
  const check = (target, exists) => {
    source(target);
    const idx = index();
    files.splice(0, files.length, ...idx.nodes.map(n => ({ rel: n.path, name: n.path.split("/").at(-1) })));
    const before = JSON.stringify({ nodes: idx.nodes, files });
    assert.deepEqual(checkSupersedes(idx, files), exists ? [] : [{ group: "vault", level: "issue", check: "supersedes", message: `supersedes names "${target}", which is not an artifact in this vault.`, file: "adr/source.md" }]);
    assert.equal(JSON.stringify({ nodes: idx.nodes, files }), before);
  };
  check("adr/fresh.md", false);
  put("adr/fresh.md", "adr", "fresh", "status: superseded\nsuperseded_by: source");
  check("adr/fresh.md", true);
  renameSync(join(root, "adr/fresh.md"), join(root, "adr/renamed.md"));
  check("adr/renamed.md", true);
  rmSync(join(root, "adr/renamed.md"));
  check("adr/renamed.md", false);
});

test("doctor integrity module: acceptance stays opt-in and explicit answers preserve immutable inputs", () => {
  const artifacts = Object.freeze([
    ...["adr", "spec", "research"].map(kind => artifact(kind, `${kind}/pending.md`, { status: "accepted", review_status: "pending" })),
    artifact("runbook", "ops/pending.md", { status: "accepted", review_status: "pending" }),
    artifact("epic", "epics/E/epic.md", { status: "accepted", review_status: "pending" }),
    artifact("adr", "adr/proposed.md", { status: "proposed", review_status: "pending" }),
    ...["reviewed", "n/a", "waived", "custom answer"].map(review => artifact("adr", `adr/${review}.md`, { status: "accepted", review_status: review })),
  ]);
  const before = JSON.stringify(artifacts);
  assert.deepEqual(checkAcceptanceGate(artifacts, Object.freeze({ lifecycle_gates: "on" })), []);
  assert.deepEqual(checkAcceptanceGate(artifacts, Object.freeze({ acceptance_gate: "TRUE" })), ["adr", "spec", "research"].map(kind => ({
    group: "vault", level: "issue", check: "acceptance-gate", file: `${kind}/pending.md`,
    message: 'status is "accepted" while review_status is "pending" (acceptance_gate: on — record the review outcome before accepting).',
  })));
  assert.equal(JSON.stringify(artifacts), before);
});
