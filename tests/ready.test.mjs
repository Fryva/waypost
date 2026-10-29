// waypost ready: a story is not work while its spec is a draft or an ADR
// that spec implements is still proposed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readiness } from "../scripts/ready.mjs";
import { loadLayout } from "../scripts/lib.mjs";

const md = (fm, title) => `---\n${Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join("\n")}\n---\n\n# ${title}\n`;

test("ready gates a story on its spec being active and the spec's ADRs being accepted", (t) => {
  const vault = mkdtempSync(join(tmpdir(), "wp-ready-"));
  t.after(() => rmSync(vault, { recursive: true, force: true }));
  const stories = join(vault, "epics", "E-1", "stories");
  for (const d of [stories, join(vault, "specs"), join(vault, "adr")]) mkdirSync(d, { recursive: true });
  writeFileSync(join(vault, "epics", "E-1", "epic.md"), md({ type: "epic", id: '"E-1"', title: "E", status: "planned" }, "E"));
  const adr = (status) => writeFileSync(join(vault, "adr", "0001-choice.md"), md({ type: "adr", id: '"ADR-0001"', title: "choice", status }, "choice"));
  const spec = (status) => writeFileSync(join(vault, "specs", "the-how.md"),
    md({ type: "spec", id: '"the-how"', title: "the how", status, adr: '["ADR-0001"]', stories: '["E-1/story-a"]' }, "the how"));
  const story = (stem, specs) => writeFileSync(join(stories, `${stem}.md`),
    md({ type: "story", id: `"${stem}"`, epic: '"E-1"', title: stem, status: "planned", specs: JSON.stringify(specs) }, stem));
  story("story-a", ["the-how"]);
  story("story-b", []);
  story("story-c", ["no-such-spec"]);
  const layout = loadLayout("engineering");
  const row = (ref) => readiness(vault, { claims: [], layout }).find((r) => r.ref === `E-1/${ref}`);

  adr("proposed"); spec("draft");
  let a = row("story-a");
  assert.equal(a.ready, false);
  assert.deepEqual(a.design_open, [
    { kind: "spec", ref: "the-how", status: "draft" },
    { kind: "adr", ref: "ADR-0001", status: "proposed", via: "the-how" },
  ]);
  assert.equal(row("story-b").ready, true, "a story with no spec is not gated");
  assert.deepEqual(row("story-c").design_open, [{ kind: "spec", ref: "no-such-spec", status: "missing" }]);

  spec("active");
  a = row("story-a");
  assert.equal(a.ready, false, "an active spec over a proposed decision is still not work");
  assert.deepEqual(a.design_open, [{ kind: "adr", ref: "ADR-0001", status: "proposed", via: "the-how" }]);

  adr("accepted");
  a = row("story-a");
  assert.deepEqual(a.design_open, []);
  assert.equal(a.ready, true, "an active spec over accepted decisions frees the story");
});


test("ready shares link inputs without changing per-story resolution and refreshes membership", (t) => {
  const vault = mkdtempSync(join(tmpdir(), "wp-ready-inputs-"));
  t.after(() => rmSync(vault, { recursive: true, force: true }));
  const put = (rel, fm) => writeFileSync(join(vault, rel), md(fm, fm.title || "T"));
  for (const dir of ["specs", "adr", "epics/E-1/stories/adr", "epics/E-2/stories/story-b"]) mkdirSync(join(vault, dir), { recursive: true });
  for (const epic of ["E-1", "E-2"]) put(`epics/${epic}/epic.md`, { type: "epic", id: JSON.stringify(epic), title: epic });
  const relativeSpec = "../../../specs/spec-one.md", relativeADR = "../../../adr/first.md";
  const story = (rel, specs) => put(rel, { type: "story", status: "planned", specs: JSON.stringify(specs) });
  const spec = (status, adrs) => put("specs/spec-one.md", { type: "spec", id: '"shared"', status, adr: JSON.stringify(adrs) });
  spec("draft", [relativeADR, "adr/missing.md", relativeADR]);
  put("specs/spec-two.md", { type: "spec", id: '"shared"', status: "active" });
  put("specs/unique.md", { type: "spec", id: '"unique"', status: "active" });
  put("adr/cross-kind.md", { type: "adr", id: '"unique"', status: "accepted" });
  put("adr/first.md", { type: "adr", id: '"decision"', status: "proposed" });
  put("adr/other.md", { type: "adr", id: '"decision"', status: "accepted" });
  put("specs/review.md", { type: "spec", id: '"review"', status: "active", adr: '["decision", "specs/spec-one.md"]' });
  put("epics/E-1/stories/adr/first.md", { type: "spec", id: '"relative-shadow"', status: "active" });
  story("epics/E-1/stories/story-a.md", [relativeSpec, "shared", "absent", relativeSpec]);
  story("epics/E-1/stories/story-shadow.md", ["adr/first.md"]);
  story("epics/E-2/stories/story-b/README.md", [relativeSpec, "unique", "review"]);
  const layout = loadLayout("engineering");
  layout.folders.push({ path: "epics/E-1/stories/adr", kind: "spec" });
  const rows = () => readiness(vault, { claims: [], layout });
  const find = (all, ref) => all.find(r => r.ref === ref);
  const first = rows();
  const repeated = [
    { kind: "spec", ref: relativeSpec, status: "draft" },
    { kind: "adr", ref: relativeADR, status: "proposed", via: relativeSpec },
    { kind: "adr", ref: "adr/missing.md", status: "missing", via: relativeSpec },
    { kind: "adr", ref: relativeADR, status: "proposed", via: relativeSpec },
  ];
  assert.deepEqual(find(first, "E-1/story-a").design_open, [...repeated,
    { kind: "spec", ref: "shared", status: "ambiguous" }, { kind: "spec", ref: "absent", status: "missing" }, ...repeated]);
  assert.deepEqual(find(first, "E-2/story-b").design_open, [
    { kind: "spec", ref: relativeSpec, status: "missing" },
    { kind: "adr", ref: "decision", status: "ambiguous", via: "review" },
    { kind: "adr", ref: "specs/spec-one.md", status: "missing", via: "review" },
  ]);
  assert.deepEqual(find(first, "E-1/story-shadow").design_open, [{ kind: "spec", ref: "adr/first.md", status: "missing" }],
    "root wrong-kind hit prevents fallback to the source-relative spec");
  spec("active", [relativeADR]);
  put("adr/first.md", { type: "adr", id: '"decision"', status: "accepted" });
  assert.deepEqual(find(rows(), "E-1/story-a").design_open, [
    { kind: "spec", ref: "shared", status: "ambiguous" }, { kind: "spec", ref: "absent", status: "missing" },
  ]);
  put("specs/fresh.md", { type: "spec", id: '"fresh"', status: "active", adr: '["adr/fresh.md"]' });
  put("adr/fresh.md", { type: "adr", id: '"fresh-decision"', status: "accepted" });
  story("epics/E-1/stories/story-a.md", ["specs/fresh.md"]);
  assert.equal(find(rows(), "E-1/story-a").ready, true, "new spec and ADR paths enter the next snapshot");
  renameSync(join(vault, "specs/fresh.md"), join(vault, "specs/renamed.md"));
  story("epics/E-1/stories/story-a.md", ["specs/renamed.md"]);
  assert.equal(find(rows(), "E-1/story-a").ready, true, "renamed paths do not reuse old membership");
  unlinkSync(join(vault, "specs/renamed.md"));
  assert.deepEqual(find(rows(), "E-1/story-a").design_open, [{ kind: "spec", ref: "specs/renamed.md", status: "missing" }]);
  assert.equal(find(first, "E-1/story-a").design_open.length, 10, "later reads do not mutate earlier results");
});

test("ready without spec references keeps the node index and lookup inputs lazy", (t) => {
  const vault = mkdtempSync(join(tmpdir(), "wp-ready-no-spec-"));
  t.after(() => rmSync(vault, { recursive: true, force: true }));
  const dir = join(vault, "epics", "E-1", "stories"); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "story-empty.md"), md({ type: "story", status: "planned", specs: "[]" }, "Empty"));
  const rows = readiness(vault, { claims: [], layout: {} });
  assert.equal(rows.length, 1); assert.equal(rows[0].ready, true);
});
