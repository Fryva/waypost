// waypost ready: a story is not work while its spec is a draft or an ADR
// that spec implements is still proposed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
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
