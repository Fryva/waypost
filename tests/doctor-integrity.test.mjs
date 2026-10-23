import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
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
