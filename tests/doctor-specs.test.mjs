import "./env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import * as focused from "../scripts/doctor-specs.mjs";
import * as doctor from "../scripts/doctor.mjs";
import { loadLayout } from "../scripts/lib.mjs";

function freeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
const artifact = (kind, rel, fm, body = "") => freeze({ kind, rel, fm, body });
const required = freeze({ spec_policy: "required", spec_policy_since: "2026-01-01" });
const layout = loadLayout("engineering");

test("doctor specs module: four public imports retain identical bindings", () => {
  for (const name of ["parseSpecAcceptance", "checkSpecLinks", "checkSpecCoverage", "checkSpecAcceptance"]) {
    assert.equal(doctor[name], focused[name], name);
  }
});

test("doctor specs module: missing, empty, fenced and full-width attributed acceptance remain distinct", () => {
  assert.equal(focused.parseSpecAcceptance({ body: "" }), null);
  assert.deepEqual(focused.parseSpecAcceptance({ body: "## Acceptance\n\n" }), []);
  const spec = artifact("spec", "specs/rules.md", {}, "## Acceptance\n\n- [x] Shared\n```md\n- [ ] Example\n```\n- [ ] Own — stories：story-a, story-b\n");
  assert.deepEqual(focused.parseSpecAcceptance(spec), [
    { checked: true, text: "Shared", stories: null },
    { checked: false, text: "Own — stories：story-a, story-b", stories: ["story-a", "story-b"] },
  ]);
});

test("doctor specs module: shared slug resolver covers nested epic paths and all three story shapes", () => {
  const nested = freeze({ ...layout, folders: layout.folders.map(folder => folder.kind === "epic" ? { ...folder, path: "work/items" } : folder) });
  for (const rel of ["work/items/E/stories/story-a.md", "work/items/E/stories/story-a/README.md", "work/items/E/stories/story-001-title.md"]) {
    const spec = artifact("spec", "specs/SPEC-001-cache-rules.md", { id: "SPEC-001", status: "draft", stories: '["E/story-a"]' }, "## Acceptance\n\n- [ ] Own — stories: story-a\n");
    const story = artifact("story", rel, { id: "story-a", status: "done", specs: '["cache-rules"]', closed_at: "2035-01-01" });
    const input = freeze([spec, story]);
    const before = JSON.stringify(input);
    assert.deepEqual(focused.checkSpecLinks({}, nested, input), [], rel);
    assert.deepEqual(focused.checkSpecCoverage(input, required, nested), [{ group: "vault", level: "issue", check: "spec-status",
      message: 'Story is done while covering spec "cache-rules" is draft — a story may close only against an active spec.', file: rel }]);
    assert.deepEqual(focused.checkSpecAcceptance(nested, input, required), [{ group: "vault", level: "issue", check: "spec-acceptance",
      message: 'Story is done but spec "cache-rules" acceptance item is unchecked: "Own — stories: story-a".', file: rel }]);
    assert.deepEqual(focused.checkSpecCoverage(input, {}), []);
    assert.deepEqual(focused.checkSpecAcceptance(nested, input, {}), []);
    assert.equal(JSON.stringify(input), before);
  }
});

test("doctor specs module: broken links retain complete findings and source order under optional policy", () => {
  const input = freeze([
    artifact("spec", "specs/rules.md", { id: "rules", stories: '["E/missing"]' }),
    artifact("story", "epics/E/stories/story-a.md", { id: "story-a", specs: '["absent"]' }),
  ]);
  assert.deepEqual(focused.checkSpecLinks({}, layout, input), [
    { group: "vault", level: "issue", check: "spec-links",
      message: 'Spec "rules" stories entry "E/missing" does not resolve: no story in epics/E matches "missing" (by exact id:, exact filename stem, or legacy story-NNN prefix).', file: "specs/rules.md" },
    { group: "vault", level: "issue", check: "spec-links",
      message: 'Story lists spec "absent" which does not exist in specs/.', file: "epics/E/stories/story-a.md" },
  ]);
});

test("doctor specs module: exact story id beats ambiguous legacy fallback without changing inputs", () => {
  const spec = artifact("spec", "specs/rules.md", { id: "rules", stories: '["E/story-001"]' });
  const first = artifact("story", "epics/E/stories/story-001-a.md", { id: "a" });
  const second = artifact("story", "epics/E/stories/story-001-b.md", { id: "b" });
  const ambiguous = freeze([spec, first, second]);
  assert.deepEqual(focused.checkSpecLinks({}, layout, ambiguous), [{ group: "vault", level: "issue", check: "spec-links",
    message: 'Spec "rules" stories entry "E/story-001" does not resolve: ambiguous — "story-001" matches story-001-a, story-001-b; qualify the reference.', file: "specs/rules.md" }]);
  const winner = artifact("story", "epics/E/stories/story-winner.md", { id: "story-001", specs: '["rules"]' });
  assert.deepEqual(focused.checkSpecLinks({}, layout, freeze([...ambiguous, winner])), []);
});

test("doctor specs module: ambiguous attribution warns once per spec while shared and attributed items keep order", () => {
  const spec = artifact("spec", "specs/rules.md", { id: "rules", status: "active", stories: '["E/story-a", "F/story-a"]' }, "## Acceptance\n\n- [ ] Shared\n- [ ] Own — stories: story-a\n");
  const paths = ["epics/E/stories/story-a.md", "epics/F/stories/story-a.md"];
  const input = freeze([spec, ...paths.map(rel => artifact("story", rel, { id: "story-a", status: "done", closed_at: "2035-01-01", specs: '["rules"]' }))]);
  const before = JSON.stringify(input);
  const issue = (text, file) => ({ group: "vault", level: "issue", check: "spec-acceptance",
    message: `Story is done but spec "rules" acceptance item is unchecked: "${text}".`, file });
  assert.deepEqual(focused.checkSpecAcceptance(layout, input, required), [
    issue("Shared", paths[0]),
    { group: "vault", level: "warn", check: "ambiguous-attribution",
      message: 'Spec "rules" acceptance item attributes bare id(s) "story-a" that match more than one covered epic — qualify as <epic-id>/<story-id>.', file: "specs/rules.md" },
    issue("Own — stories: story-a", paths[0]),
    issue("Shared", paths[1]),
    issue("Own — stories: story-a", paths[1]),
  ]);
  assert.equal(JSON.stringify(input), before);
});
