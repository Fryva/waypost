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

test("doctor specs module: link lists preserve aliases, repeated refs and distinct same-path specs", () => {
  const first = artifact("spec", "specs/SPEC-001-rules.md", { id: "SPEC-001", stories: '["E/a", "E/a"]' });
  const second = artifact("spec", first.rel, { id: "other", stories: '[]' });
  const story = artifact("story", "epics/E/stories/a.md", { id: "a", specs: '["SPEC-001", "rules", "SPEC-001", "other", "other"]' });
  const input = freeze([first, second, first, story]);
  const before = JSON.stringify(input);
  const warning = { group: "vault", level: "warn", check: "spec-links",
    message: 'Story lists spec "other" but that spec\'s `stories:` does not list it back.', file: story.rel };
  assert.deepEqual(focused.checkSpecLinks({}, layout, input), [warning, warning]);
  assert.equal(JSON.stringify(input), before);
});

test("doctor specs module: link checks see coverage and identity edits on the same objects", () => {
  const spec = { kind: "spec", rel: "specs/rules.md", fm: { id: "rules", stories: '[]' }, body: "" };
  const story = { kind: "story", rel: "epics/E/stories/a.md", fm: { id: "a", specs: '["rules"]' }, body: "" };
  const input = [spec, story];
  const warning = { group: "vault", level: "warn", check: "spec-links",
    message: 'Story lists spec "rules" but that spec\'s `stories:` does not list it back.', file: story.rel };
  assert.deepEqual(focused.checkSpecLinks({}, layout, input), [warning]);
  spec.fm.stories = '["E/a"]';
  assert.deepEqual(focused.checkSpecLinks({}, layout, input), []);
  spec.fm.stories = "invalid list";
  assert.deepEqual(focused.checkSpecLinks({}, layout, input), [warning]);
  spec.fm.stories = '["E/a"]';
  spec.fm.id = "renamed";
  spec.rel = "specs/renamed.md";
  story.fm.specs = '["renamed"]';
  assert.deepEqual(focused.checkSpecLinks({}, layout, input), []);
  input.pop();
  assert.equal(focused.checkSpecLinks({}, layout, input)[0].level, "issue");
  input.push(story);
  assert.deepEqual(focused.checkSpecLinks({}, layout, input), []);
});

test("doctor specs module: story spec lists distinguish objects sharing a path", () => {
  const spec = artifact("spec", "specs/rules.md", { id: "rules", stories: '["E/one"]' });
  const first = artifact("story", "epics/E/stories/a.md", { id: "one", specs: '["rules", "rules"]' });
  const second = artifact("story", first.rel, { id: "two", specs: '["absent"]' });
  const input = freeze([spec, first, second]);
  const before = JSON.stringify(input);
  assert.deepEqual(focused.checkSpecLinks({}, layout, input), [{ group: "vault", level: "issue", check: "spec-links",
    message: 'Story lists spec "absent" which does not exist in specs/.', file: second.rel }]);
  assert.equal(JSON.stringify(input), before);
});

test("doctor specs module: shared story links retain duplicates and fresh specs on later calls", () => {
  const first = artifact("spec", "specs/one.md", { id: "one", stories: '["E/a", "E/a"]' });
  const second = artifact("spec", "specs/two.md", { id: "two", stories: '["E/a"]' });
  const story = { kind: "story", rel: "epics/E/stories/a.md", fm: { id: "a", specs: '["absent"]' }, body: "" };
  const input = [first, second, story];
  const warning = id => ({ group: "vault", level: "warn", check: "spec-links",
    message: `Spec "${id}" covers E/a but the story's \`specs:\` list lacks "${id}" (bidirectional link).`, file: story.rel });
  assert.deepEqual(focused.checkSpecLinks({}, layout, input), [warning("one"), warning("one"), warning("two"),
    { group: "vault", level: "issue", check: "spec-links", message: 'Story lists spec "absent" which does not exist in specs/.', file: story.rel }]);
  story.fm.specs = '["one", "two"]';
  assert.deepEqual(focused.checkSpecLinks({}, layout, input), []);
  story.fm.specs = '[]';
  assert.deepEqual(focused.checkSpecLinks({}, layout, input), [warning("one"), warning("one"), warning("two")]);
  input[2] = artifact("story", story.rel, { id: "a", specs: '["one"]' });
  assert.deepEqual(focused.checkSpecLinks({}, layout, input), [warning("two")]);
});

test("doctor specs module: idless forward links preserve first-error order before story parsing", () => {
  const forwardError = new Error("forward list unavailable");
  const storyError = new Error("story specs unavailable");
  let reads = 0;
  const idless = artifact("spec", "specs/idless.md", { stories: '["E/a"]' });
  const broken = { kind: "spec", rel: "specs/broken.md", fm: { id: "broken", get stories() { throw forwardError; } } };
  const story = { kind: "story", rel: "epics/E/stories/a.md", fm: { id: "a", get specs() { reads++; throw storyError; } }, body: "" };
  assert.throws(() => focused.checkSpecLinks({}, layout, [idless, broken, story]), error => error === forwardError);
  assert.equal(reads, 0);
  assert.throws(() => focused.checkSpecLinks({}, layout, [story]), error => error === storyError);
  assert.equal(reads, 1);
  assert.deepEqual(focused.checkSpecLinks({}, { folders: [] }, null), []);
});

test("doctor specs module: repeated invalid story entries retain exact raw keys and every finding", () => {
  const entries = ["bad", " bad", "BAD", "bad"];
  const specs = ["one", "two"].map(id => artifact("spec", `specs/${id}.md`, { id, stories: JSON.stringify(entries) }));
  const input = freeze(specs);
  const before = JSON.stringify(input);
  assert.deepEqual(focused.checkSpecLinks({}, layout, input), specs.flatMap(spec => entries.map(entry => ({
    group: "vault", level: "issue", check: "spec-links",
    message: `Spec "${spec.fm.id}" stories entry "${entry}" does not resolve: not in <epic-id>/<story-id> form: "${entry}".`, file: spec.rel,
  }))));
  assert.equal(JSON.stringify(input), before);
});

test("doctor specs module: repeated story resolution sees missing, added, ambiguous and edited candidates", () => {
  const spec = artifact("spec", "specs/rules.md", { id: "rules", stories: '["E/a", "E/a"]' });
  const input = [spec];
  const missing = { group: "vault", level: "issue", check: "spec-links",
    message: 'Spec "rules" stories entry "E/a" does not resolve: no story in epics/E matches "a" (by exact id:, exact filename stem, or legacy story-NNN prefix).', file: spec.rel };
  assert.deepEqual(focused.checkSpecLinks({}, layout, input), [missing, missing]);
  const first = { kind: "story", rel: "epics/E/stories/first.md", fm: { id: "a", specs: '["rules"]' }, body: "" };
  input.push(first);
  assert.deepEqual(focused.checkSpecLinks({}, layout, input), []);
  const second = { kind: "story", rel: "epics/E/stories/second.md", fm: { id: "a", specs: '[]' }, body: "" };
  input.push(second);
  const ambiguous = { group: "vault", level: "issue", check: "spec-links",
    message: 'Spec "rules" stories entry "E/a" does not resolve: ambiguous — "a" matches first, second; qualify the reference.', file: spec.rel };
  assert.deepEqual(focused.checkSpecLinks({}, layout, input), [ambiguous, ambiguous]);
  second.fm.id = "b";
  assert.deepEqual(focused.checkSpecLinks({}, layout, input), []);
  first.fm.id = "renamed";
  first.fm.specs = '[]';
  assert.deepEqual(focused.checkSpecLinks({}, layout, input), [missing, missing]);
  input.splice(1, 1);
  assert.deepEqual(focused.checkSpecLinks({}, layout, input), [missing, missing]);
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

function observedSpec(rel, fm, body) {
  let reads = 0;
  return { spec: Object.freeze({ kind: "spec", rel, fm: freeze(fm), get body() { reads++; return body; } }), reads: () => reads };
}

test("doctor specs module: aliases reuse rich, absent and empty acceptance without suppressing per-reference findings", () => {
  const rich = observedSpec("specs/SPEC-001-rules.md", { id: "SPEC-001", stories: '["E/a", "F/b"]' }, "## Acceptance\n- [ ] Shared\n");
  const absent = observedSpec("specs/SPEC-002-missing.md", { id: "SPEC-002" }, "No section\n");
  const empty = observedSpec("specs/SPEC-003-empty.md", { id: "SPEC-003" }, "## Acceptance\n\n");
  const stories = ["epics/E/stories/a.md", "epics/F/stories/b.md"].map((rel, i) => artifact("story", rel,
    { id: i ? "b" : "a", status: "done", closed_at: "2035-01-01", specs: '["SPEC-001", "rules", "SPEC-002", "missing", "empty"]' }));
  const input = Object.freeze([rich.spec, absent.spec, empty.spec, ...stories]);
  const expected = stories.flatMap(story => [
    ...["SPEC-001", "rules"].map(id => ({ group: "vault", level: "issue", check: "spec-acceptance",
      message: `Story is done but spec "${id}" acceptance item is unchecked: "Shared".`, file: story.rel })),
    ...["SPEC-002", "missing"].map(id => ({ group: "vault", level: "warn", check: "spec-acceptance",
      message: `Covering spec "${id}" has no Acceptance section — its criteria cannot gate this story.`, file: absent.spec.rel })),
  ]);
  assert.deepEqual(focused.checkSpecAcceptance(layout, input, required), expected);
  assert.deepEqual([rich.reads(), absent.reads(), empty.reads()], [1, 1, 1]);
});

test("doctor specs module: cache keys distinguish artifact objects sharing a path", () => {
  const first = observedSpec("specs/same.md", { id: "one" }, "## Acceptance\n- [ ] First\n");
  const second = observedSpec("specs/same.md", { id: "two" }, "## Acceptance\n- [ ] Second\n");
  const story = artifact("story", "epics/E/stories/a.md", { id: "a", status: "done", closed_at: "2035-01-01", specs: '["one", "two"]' });
  assert.deepEqual(focused.checkSpecAcceptance(layout, Object.freeze([first.spec, second.spec, story]), required), [
    { group: "vault", level: "issue", check: "spec-acceptance", message: 'Story is done but spec "one" acceptance item is unchecked: "First".', file: story.rel },
    { group: "vault", level: "issue", check: "spec-acceptance", message: 'Story is done but spec "two" acceptance item is unchecked: "Second".', file: story.rel },
  ]);
  assert.deepEqual([first.reads(), second.reads()], [1, 1]);
});

test("doctor specs module: ineligible checks do not parse and first body errors keep their identity", () => {
  const sentinel = new Error("body unavailable");
  let reads = 0;
  const spec = Object.freeze({ kind: "spec", rel: "specs/bad.md", fm: freeze({ id: "bad" }), get body() { reads++; throw sentinel; } });
  const story = artifact("story", "epics/E/stories/a.md", { id: "a", status: "done", closed_at: "2035-01-01", specs: '["bad"]' });
  assert.deepEqual(focused.checkSpecAcceptance(layout, [spec, story], {}), []);
  assert.deepEqual(focused.checkSpecAcceptance({ ...layout, folders: [] }, [spec, story], required), []);
  const skipped = [
    artifact("story", story.rel, { ...story.fm, status: "in-progress" }),
    artifact("story", story.rel, { ...story.fm, closed_at: "2010-01-01" }),
    artifact("story", story.rel, { ...story.fm, specs: '["absent"]' }),
  ];
  assert.deepEqual(focused.checkSpecAcceptance(layout, [spec, ...skipped], required), []);
  assert.equal(reads, 0);
  for (let call = 0; call < 2; call++) assert.throws(() => focused.checkSpecAcceptance(layout, [spec, story], required), error => error === sentinel);
  assert.equal(reads, 2);
});

test("doctor specs module: acceptance coverage distinguishes same-path objects and refreshes changed lists", () => {
  const body = "## Acceptance\n- [ ] Own — stories: a\n";
  const first = { kind: "spec", rel: "specs/same.md", fm: { id: "one", stories: '["E/a"]' }, body };
  const second = artifact("spec", first.rel, { id: "two", stories: '["F/a"]' }, body);
  const story = artifact("story", "epics/E/stories/a.md", { id: "a", status: "done", closed_at: "2035-01-01", specs: '["one", "two", "one"]' });
  const input = [first, second, story];
  const issue = { group: "vault", level: "issue", check: "spec-acceptance",
    message: 'Story is done but spec "one" acceptance item is unchecked: "Own — stories: a".', file: story.rel };
  assert.deepEqual(focused.checkSpecAcceptance(layout, input, required), [issue, issue]);
  first.fm.stories = '["F/a"]';
  assert.deepEqual(focused.checkSpecAcceptance(layout, input, required), []);
  first.fm.stories = '["E/a", "F/a"]';
  assert.deepEqual(focused.checkSpecAcceptance(layout, input, required), [
    { group: "vault", level: "warn", check: "ambiguous-attribution",
      message: 'Spec "one" acceptance item attributes bare id(s) "a" that match more than one covered epic — qualify as <epic-id>/<story-id>.', file: first.rel }, issue, issue]);
  first.fm.stories = '[]';
  assert.deepEqual(focused.checkSpecAcceptance(layout, input, required), []);
});

test("doctor specs module: missing acceptance skips coverage parsing but empty acceptance preserves first error", () => {
  let reads = 0;
  const sentinel = new Error("coverage unavailable");
  const spec = { kind: "spec", rel: "specs/rules.md", fm: { id: "rules", get stories() { reads++; throw sentinel; } }, body: "No criteria\n" };
  const story = artifact("story", "epics/E/stories/a.md", { id: "a", status: "done", closed_at: "2035-01-01", specs: '["rules", "rules"]' });
  const input = [spec, story];
  const warning = { group: "vault", level: "warn", check: "spec-acceptance",
    message: 'Covering spec "rules" has no Acceptance section — its criteria cannot gate this story.', file: spec.rel };
  assert.deepEqual(focused.checkSpecAcceptance(layout, input, required), [warning, warning]);
  assert.equal(reads, 0);
  spec.body = "## Acceptance\n\n";
  assert.throws(() => focused.checkSpecAcceptance(layout, input, required), error => error === sentinel);
  assert.equal(reads, 1);
  assert.deepEqual(focused.checkSpecAcceptance(layout, input, {}), []);
  assert.deepEqual(focused.checkSpecAcceptance({ ...layout, folders: [] }, input, required), []);
  assert.equal(reads, 1);
});

test("doctor specs module: later checks see changed bodies on the same artifact and array", () => {
  const spec = { kind: "spec", rel: "specs/rules.md", fm: freeze({ id: "rules" }), body: "" };
  const story = artifact("story", "epics/E/stories/a.md", { id: "a", status: "done", closed_at: "2035-01-01", specs: '["rules"]' });
  const input = Object.freeze([spec, story]);
  for (const [body, expected] of [
    ["No section", [{ group: "vault", level: "warn", check: "spec-acceptance", message: 'Covering spec "rules" has no Acceptance section — its criteria cannot gate this story.', file: spec.rel }]],
    ["## Acceptance\n\n", []],
    ["## Acceptance\n- [ ] Shared\n", [{ group: "vault", level: "issue", check: "spec-acceptance", message: 'Story is done but spec "rules" acceptance item is unchecked: "Shared".', file: story.rel }]],
    ["## Acceptance\n- [x] Shared\n", []],
  ]) {
    spec.body = body;
    const before = JSON.stringify(input);
    assert.deepEqual(focused.checkSpecAcceptance(layout, input, required), expected);
    assert.equal(JSON.stringify(input), before);
  }
});
