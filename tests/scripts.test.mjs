// waypost — CLI-script tests. The core scripts are pure compute; drive them via
// spawnSync against a throwaway bound project, never against whatever vault
// the developer's own checkout happens to be bound to.
//   node --test tests/*.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, symlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));

// A bound project of our own: story-section reads `language` and the vault
// from the config, and a test that borrows the developer's bind passes or
// fails depending on their machine.
const SCRATCH = (() => {
  const proj = mkdtempSync(join(tmpdir(), "waypost-scratch-"));
  mkdirSync(join(proj, ".waypost"), { recursive: true });
  const vault = join(proj, "vault");
  mkdirSync(join(vault, "epics"), { recursive: true });
  writeFileSync(join(proj, ".waypost", "projectstore.json"),
    JSON.stringify({ vault_path: vault, layout: "engineering", language: "en" }), "utf8");
  return proj;
})();
const ENV = { ...process.env, WAYPOST_PROJECT_DIR: SCRATCH, WAYPOST_HOME: REPO };

function run(script, args) {
  const r = spawnSync(process.execPath, [join(REPO, "scripts", script), ...args], {
    encoding: "utf8", env: ENV, cwd: REPO, timeout: 15000,
  });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

// bin/waypost end to end. WAYPOST_NO_BEAT=1 keeps a test from writing presence
// files and from paying for the heartbeat's dynamic imports on every call.
function runBinRaw(projectDir, args) {
  return spawnSync(process.execPath, [join(REPO, "bin", "waypost"), ...args], {
    encoding: "utf8", env: { ...ENV, WAYPOST_PROJECT_DIR: projectDir, WAYPOST_NO_BEAT: "1" },
    cwd: REPO, timeout: 15000,
  });
}

function runBin(projectDir, args) {
  const r = runBinRaw(projectDir, args);
  assert.equal(r.status, 0, `${args.join(" ")}\n${r.stderr}${r.stdout}`);
  return r;
}

const STORY = `---
type: story
id: "story-050"
title: "T"
status: review
updated: 2026-01-01
started_at: null
closed_at: null
plan_updated_at: null
---

# T

## Decomposition

- [x] a

## Implementation Plan

HAND WRITTEN — must survive.

## Acceptance Criteria

- [ ] c

---

*Last updated: 2026-01-01*
`;

test("story-section plan: idempotent, preserves hand-written plan, no downgrade from review", () => {
  const p = join(mkdtempSync(join(tmpdir(), "ps-ss-")), "s.md");
  writeFileSync(p, STORY);
  const out = run("story-section.mjs", ["plan", p]);
  assert.equal((out.content.match(/## Implementation Plan/g) || []).length, 1);
  assert.ok(out.content.includes("HAND WRITTEN — must survive."));
  assert.match(out.content, /status: review/);           // never downgraded
  assert.match(out.content, /started_at: "20/);          // stamped
  assert.match(out.content, /plan_updated_at: "20/);     // stamped
  assert.match(out.content, /\*Last updated: 20\d\d-\d\d-\d\d\*/); // footer synced
});

test("story-section close: inserts Final Summary, stamps closed_at, status done", () => {
  const p = join(mkdtempSync(join(tmpdir(), "ps-ss-")), "s.md");
  writeFileSync(p, STORY);
  const out = run("story-section.mjs", ["close", p]);
  assert.match(out.content, /## Final Summary/);
  assert.match(out.content, /status: done/);
  assert.match(out.content, /closed_at: "20/);
  assert.ok(out.content.includes("HAND WRITTEN — must survive."));
  writeFileSync(p, out.content);
  const again = run("story-section.mjs", ["close", p]);
  assert.equal(again.notes.filter((n) => n.includes("closed_at")).length, 0, "closed_at stamped once");
});

test("story-section plan: a CRLF story file is not \"no frontmatter block\" (P1-1, B-4)", () => {
  const p = join(mkdtempSync(join(tmpdir(), "ps-ss-")), "s.md");
  writeFileSync(p, STORY.replace(/\n/g, "\r\n"));
  const out = run("story-section.mjs", ["plan", p]);
  assert.equal((out.content.match(/## Implementation Plan/g) || []).length, 1);
  assert.ok(out.content.includes("HAND WRITTEN — must survive."));
  assert.match(out.content, /status: review/);
  assert.match(out.content, /started_at: "20/);
});

test("story-section: output carries original_sha256 of the exact bytes read (P1-6, A-2/A-3)", () => {
  const p = join(mkdtempSync(join(tmpdir(), "ps-ss-")), "s.md");
  writeFileSync(p, STORY);
  const out = run("story-section.mjs", ["plan", p]);
  const expected = createHash("sha256").update(STORY, "utf8").digest("hex");
  assert.equal(out.original_sha256, expected);
});

test("story-section plan: insertSection's fallback never splices into frontmatter on a minimal story (P1-3, G-4)", () => {
  const p = join(mkdtempSync(join(tmpdir(), "ps-ss-")), "min.md");
  // No anchor sections (Decomposition/Description) and no footer `---` —
  // exactly the shape that used to make the fallback match the frontmatter's
  // OWN closing delimiter instead of a real footer.
  writeFileSync(p, "---\ntype: story\nepic: E1\nstatus: planned\n---\n# Minimal\nSome prose without any headings.\n");
  const out = run("story-section.mjs", ["plan", p]);
  const fmBlock = out.content.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(fmBlock, "frontmatter block still well-formed");
  assert.ok(!fmBlock[1].includes("Implementation Plan"), "section not spliced inside frontmatter");
  assert.match(out.content, /^status: in-progress$/m);
  const fmEnd = out.content.indexOf("\n---\n") + 5;
  assert.ok(out.content.indexOf("## Implementation Plan") > fmEnd, "section lands in the body");
});

// ─── draft.mjs golden tests (ADR-010 / SPEC-002 contracts 1–4) ─────────
//
// draft reads the project config for vault/language, so these run against a
// throwaway project dir + vault; WAYPOST_HOME stays this repo (layouts,
// templates).

function runIn(projectDir, script, args) {
  const r = spawnSync(process.execPath, [join(REPO, "scripts", script), ...args], {
    encoding: "utf8", env: { ...ENV, WAYPOST_PROJECT_DIR: projectDir }, cwd: REPO, timeout: 15000,
  });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

function makeVaultProject() {
  const proj = mkdtempSync(join(tmpdir(), "ps-draft-"));
  const vault = join(proj, "vault");
  for (const d of ["adr", "specs", join("epics", "PS-X", "stories")]) {
    mkdirSync(join(vault, d), { recursive: true });
  }
  mkdirSync(join(proj, ".waypost"), { recursive: true });
  writeFileSync(join(proj, ".waypost", "projectstore.json"), JSON.stringify({
    vault_path: vault, layout: "engineering", language: "en", default_author: "Test",
  }));
  return { proj, vault };
}

test("draft adr/spec: slug-only filename, machine id, external_refs, no number (contracts 1, 3)", () => {
  const { proj } = makeVaultProject();
  for (const kind of ["adr", "spec"]) {
    const out = runIn(proj, "draft.mjs", [kind, "Foo Bar Baz"]);
    assert.ok(out.path.endsWith("foo-bar-baz.md"), out.path);
    assert.match(out.content, /^id: "foo-bar-baz"$/m);
    assert.match(out.content, /^external_refs: \{\}$/m);
    assert.doesNotMatch(out.content, /^number:/m);
    assert.match(out.content, /^# Foo Bar Baz$/m); // H1 without a number
    assert.equal(out.collision, null);
    assert.deepEqual(out.warnings, []);
  }
});

test("draft story: story-<slug>.md under the epic, external_refs replaces external_tracker (contracts 2, 3)", () => {
  const { proj } = makeVaultProject();
  const out = runIn(proj, "draft.mjs", ["story", "PS-X", "Do", "the", "thing"]);
  assert.ok(out.path.endsWith(join("epics", "PS-X", "stories", "story-do-the-thing.md")), out.path);
  assert.match(out.content, /^id: "story-do-the-thing"$/m);
  assert.match(out.content, /^external_refs: \{\}$/m);
  assert.doesNotMatch(out.content, /external_tracker/);
  assert.equal(out.collision, null);
});

test("draft: cross-era collisions surface in the collision field (contract 4)", () => {
  const { proj, vault } = makeVaultProject();
  writeFileSync(join(vault, "adr", "ADR-003-foo.md"), "");
  const adr = runIn(proj, "draft.mjs", ["adr", "Foo"]);
  assert.equal(adr.collision.with, "ADR-003-foo.md");
  assert.equal(adr.collision.identity, "foo");

  writeFileSync(join(vault, "epics", "PS-X", "stories", "story-006-payments.md"), "");
  const story = runIn(proj, "draft.mjs", ["story", "PS-X", "Payments"]);
  assert.equal(story.collision.with, "story-006-payments.md");
  assert.equal(story.collision.identity, "payments");

  // Standalone epics/<id>/story-*.md shares the epic's identity scope.
  writeFileSync(join(vault, "epics", "PS-X", "story-refunds.md"), "");
  const standalone = runIn(proj, "draft.mjs", ["story", "PS-X", "Refunds"]);
  assert.equal(standalone.collision.with, "story-refunds.md");

  const clean = runIn(proj, "draft.mjs", ["adr", "Unrelated topic"]);
  assert.equal(clean.collision, null);
});

test("mixed-era vault: index orders by date with number badge, doctor identity checks stay clean (contracts 6, 8)", () => {
  const { proj, vault } = makeVaultProject();
  const fm = (extra) => `---\n${extra}\n---\n\n# T\n`;
  writeFileSync(join(vault, "adr", "README.md"),
    "# ADRs\n\n| File | Title | Status | Date |\n|------|-------|--------|------|\n");
  writeFileSync(join(vault, "adr", "ADR-001-caching.md"),
    fm('type: adr\nnumber: "001"\ntitle: "Caching"\nstatus: accepted\ndate: 2026-01-01'));
  writeFileSync(join(vault, "adr", "zebra.md"),
    fm('type: adr\nid: "zebra"\ntitle: "Zebra"\nstatus: proposed\ndate: 2026-01-02\nexternal_refs: {}'));
  writeFileSync(join(vault, "adr", "apple.md"),
    fm('type: adr\nid: "apple"\ntitle: "Apple"\nstatus: proposed\ndate: 2026-01-02\nexternal_refs: {}'));
  writeFileSync(join(vault, "epics", "PS-X", "stories", "story-001-legacy-work.md"),
    fm('type: story\nid: "story-001"\ntitle: "Legacy work"\nstatus: planned\ncreated: 2026-01-01'));
  writeFileSync(join(vault, "epics", "PS-X", "stories", "story-do-thing.md"),
    fm('type: story\nid: "story-do-thing"\ntitle: "Do thing"\nstatus: planned\ncreated: 2026-01-02\nexternal_refs: {}'));

  const rec = runIn(proj, "reconcile.mjs", []);
  const adrIndex = rec.indexes.find((i) => i.folder === "adr");
  assert.ok(adrIndex.changed);
  const labels = adrIndex.content.split("\n").filter((l) => /^\| \[/.test(l))
    .map((l) => l.match(/^\| \[([^\]]+)\]/)[1]);
  // Date asc; numbered before unnumbered is moot across dates; badge only
  // where a number exists, slug labels elsewhere; same-date slugs sort by slug.
  assert.deepEqual(labels, ["ADR-001", "apple", "zebra"]);

  const r = spawnSync(process.execPath, [join(REPO, "scripts", "doctor.mjs"), "--vault", "--json"], {
    encoding: "utf8", env: { ...ENV, WAYPOST_PROJECT_DIR: proj }, cwd: REPO, timeout: 15000,
  });
  const findings = JSON.parse(r.stdout);
  const identityChecks = findings.filter((f) =>
    ["identity", "artifact-name", "external-refs", "spec-links"].includes(f.check));
  assert.deepEqual(identityChecks, [], JSON.stringify(identityChecks));
});

test("draft: digit-leading slug warns via the warnings array (contract 4)", () => {
  const { proj } = makeVaultProject();
  const out = runIn(proj, "draft.mjs", ["adr", "2026 Roadmap"]);
  assert.equal(out.warnings.length, 1);
  assert.match(out.warnings[0], /digit-leading/);
  assert.equal(out.collision, null);
});

test("draft: nextNumber is gone from the creation path (contract 1)", () => {
  assert.ok(!readFileSync(join(REPO, "scripts", "draft.mjs"), "utf8").includes("nextNumber"));
});

// ─── reconcile --write (spec: atomic-regeneration-of-derived-views) ────

// Raw sibling of runIn for tests that EXPECT a nonzero exit. runIn's
// status-0 assert is load-bearing as a failure message for six call sites —
// do not loosen it.
function runInRaw(projectDir, script, args) {
  return spawnSync(process.execPath, [join(REPO, "scripts", script), ...args], {
    encoding: "utf8", env: { ...ENV, WAYPOST_PROJECT_DIR: projectDir }, cwd: REPO, timeout: 15000,
  });
}

// A vault with one target of each kind dirty: kanban absent, code-map absent
// (epic carries code_refs), adr index empty with prose below the table.
function seedDerivedFixture() {
  const { proj, vault } = makeVaultProject();
  const fm = (extra) => `---\n${extra}\n---\n\n# T\n`;
  writeFileSync(join(vault, "adr", "README.md"),
    "# ADRs\n\n| File | Title | Status | Date |\n|------|-------|--------|------|\n\nPROSE BELOW THE TABLE.\n");
  writeFileSync(join(vault, "adr", "caching.md"),
    fm('type: adr\nid: "caching"\ntitle: "Caching"\nstatus: accepted\ndate: 2026-01-01\nexternal_refs: {}'));
  writeFileSync(join(vault, "epics", "PS-X", "epic.md"),
    fm('type: epic\nid: "PS-X"\ntitle: "X"\nstatus: in-progress\ncreated: 2026-01-01\ncode_refs: ["scripts/"]'));
  writeFileSync(join(vault, "epics", "PS-X", "stories", "story-ship-it.md"),
    fm('type: story\nid: "story-ship-it"\ntitle: "Ship it"\nstatus: planned\ncreated: 2026-01-01\nexternal_refs: {}'));
  return { proj, vault };
}

const normEq = (s) => s.split("\n").filter((l) => !l.startsWith("generated_at:")).join("\n").trimEnd();

test("reconcile --write: applies compute output atomically, idempotent second pass (contracts 1, 4, 8)", () => {
  const { proj, vault } = seedDerivedFixture();
  const preview = runIn(proj, "reconcile.mjs", []);
  const w = runIn(proj, "reconcile.mjs", ["--write"]);
  assert.equal(w.summary.failed, 0, JSON.stringify(w));
  assert.ok(w.summary.written >= 3, JSON.stringify(w.summary)); // kanban + codemap + adr index
  assert.ok(!JSON.stringify(w).includes('"content"'), "--write emits no content on stdout");
  // On-disk bytes are normalize-equal to what compute previewed (contract 8).
  assert.equal(normEq(readFileSync(join(vault, "kanban.md"), "utf8")), normEq(preview.kanban.content));
  const adrIdx = preview.indexes.find((i) => i.folder === "adr");
  assert.equal(readFileSync(adrIdx.path, "utf8"), adrIdx.content);
  assert.ok(readFileSync(adrIdx.path, "utf8").includes("PROSE BELOW THE TABLE."), "prose preserved");
  const again = runIn(proj, "reconcile.mjs", ["--write"]);
  assert.equal(again.summary.written, 0, "immediately repeated --write is a fixed point");
  assert.equal(again.summary.changed, 0);
});

test("reconcile --write: recomputes at write time — status flip and prose edit in the approval gap both land (contract 3)", () => {
  const { proj, vault } = seedDerivedFixture();
  runIn(proj, "reconcile.mjs", ["--write"]); // settle
  assert.equal(runIn(proj, "reconcile.mjs", []).summary.changed, 0);
  // The approval gap: a second session flips a status and edits README prose.
  const storyPath = join(vault, "epics", "PS-X", "stories", "story-ship-it.md");
  writeFileSync(storyPath, readFileSync(storyPath, "utf8").replace("status: planned", "status: in-progress"));
  const readmePath = join(vault, "adr", "README.md");
  writeFileSync(readmePath, readFileSync(readmePath, "utf8").replace("PROSE BELOW THE TABLE.", "PROSE EDITED DURING APPROVAL."));
  const w = runIn(proj, "reconcile.mjs", ["--write"]);
  assert.equal(w.summary.failed, 0);
  const board = readFileSync(join(vault, "kanban.md"), "utf8");
  const inProgress = board.split(/^## In Progress$/m)[1].split(/^## /m)[0];
  assert.ok(inProgress.includes("Ship it"), "written board reflects the post-preview status");
  assert.ok(readFileSync(readmePath, "utf8").includes("PROSE EDITED DURING APPROVAL."), "prose edit survives");
});

test("reconcile --only: limits both modes; unknown/absent selectors die loudly (contract 6)", () => {
  const { proj, vault } = seedDerivedFixture();
  const w = runIn(proj, "reconcile.mjs", ["--write", "--only", "kanban"]);
  assert.ok(w.kanban.written);
  assert.equal(w.codemap.skipped, "not selected");
  assert.deepEqual(w.indexes, []);
  assert.ok(!existsSync(join(vault, "code-map.md")), "codemap untouched");
  assert.ok(!readFileSync(join(vault, "adr", "README.md"), "utf8").includes("caching"), "adr index untouched");

  const named = runIn(proj, "reconcile.mjs", ["--write", "--only", "indexes=adr"]);
  assert.equal(named.indexes.length, 1);
  assert.ok(named.indexes[0].written);
  assert.ok(readFileSync(join(vault, "adr", "README.md"), "utf8").includes("caching"));

  const unknown = runInRaw(proj, "reconcile.mjs", ["--only", "kanbn"]);
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /unknown selector/);

  const notInLayout = runInRaw(proj, "reconcile.mjs", ["--write", "--only", "indexes=nonexistent"]);
  assert.notEqual(notInLayout.status, 0);
  assert.match(notInLayout.stderr, /no folder/);

  // In the layout, named explicitly, but the vault has no README for it.
  const noReadme = runInRaw(proj, "reconcile.mjs", ["--write", "--only", "indexes=specs"]);
  assert.notEqual(noReadme.status, 0);
  assert.match(noReadme.stderr, /README/);
});

test("reconcile --write: partial failure — per-target error, remaining targets written, nonzero exit (contract 1)", () => {
  const { proj, vault } = seedDerivedFixture();
  mkdirSync(join(vault, "kanban.md")); // reading/replacing a directory fails
  const r = runInRaw(proj, "reconcile.mjs", ["--write"]);
  assert.notEqual(r.status, 0, "cron caller must notice");
  const j = JSON.parse(r.stdout);
  assert.ok(j.kanban.error, "failed target carries its error");
  assert.ok(j.kanban.path, "failed target still names its path");
  assert.notEqual(j.kanban.written, true);
  assert.ok(j.codemap.written, "remaining targets still attempted");
  assert.ok(j.indexes.find((i) => i.folder === "adr").written);
  assert.equal(j.summary.failed, 1);
});

test("reconcile compute: per-target error surfaces in summary.failed, exit stays 0 (reporting tool)", () => {
  const { proj, vault } = seedDerivedFixture();
  mkdirSync(join(vault, "kanban.md"));
  const r = runInRaw(proj, "reconcile.mjs", []);
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.ok(j.kanban.error);
  assert.equal(j.summary.failed, 1, "compute mode counts failures too");
});

test("reconcile --write: a named-absent index aborts BEFORE any side effect (contract 1)", () => {
  const { proj, vault } = seedDerivedFixture();
  // specs/ is in the layout but this vault has no specs/README.md.
  const r = runInRaw(proj, "reconcile.mjs", ["--write", "--only", "kanban,indexes=specs"]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /specs\/README\.md/);
  assert.ok(!existsSync(join(vault, "kanban.md")),
    "config errors abort with nothing written — no unreported mutation");
});

// ─── creation-time index regeneration ────────────────────────────────────
// spec: creation-time-index-updates-are-regenerations-not-appends
//
// Its own fixture — seedDerivedFixture's exact board/write counts are pinned
// by six tests above; do not extend it. Every layout folder that carries a
// README gets an empty managed table plus prose below it, so a creation into
// any kind can be driven end to end.

const IDX_HEAD = "| File | Title | Status | Date |\n|------|-------|--------|------|\n";

function seedCreationFixture() {
  const { proj, vault } = makeVaultProject();
  for (const path of ["adr", "specs", "epics", "research", "concepts", "meetings", "ops"]) {
    mkdirSync(join(vault, path), { recursive: true });
    writeFileSync(join(vault, path, "README.md"),
      `# ${path}\n\n## Index\n\n${IDX_HEAD}\nPROSE BELOW THE TABLE.\n`);
  }
  return { proj, vault };
}

// The creation flow as the command prose performs it: draft (pure), Write the
// artifact, then regenerate that one folder's index through the core.
function createThrough(proj, draftArgs, extraDirs = []) {
  const out = runIn(proj, "draft.mjs", draftArgs);
  mkdirSync(dirname(out.path), { recursive: true });
  writeFileSync(out.path, out.content);
  for (const d of extraDirs) mkdirSync(join(dirname(out.path), d), { recursive: true });
  const rep = runIn(proj, "reconcile.mjs", ["--write", "--only", `indexes=${out.index.folder}`]);
  return { out, rep, entry: rep.indexes.find((i) => i.folder === out.index.folder) };
}

test("creation e2e: the index row lands via the core write path, prose survives, second pass is a no-op (contracts 1, 4)", () => {
  const { proj, vault } = seedCreationFixture();
  const { out, entry } = createThrough(proj, ["adr", "Cache invalidation"]);
  assert.equal(out.index.folder, "adr");
  assert.equal(entry.written, true, JSON.stringify(entry));

  const idx = readFileSync(join(vault, "adr", "README.md"), "utf8");
  assert.ok(idx.includes("[cache-invalidation](./cache-invalidation.md)"), idx);
  assert.ok(idx.includes("PROSE BELOW THE TABLE."), "manual prose outside the table survives");

  const again = runIn(proj, "reconcile.mjs", ["--write", "--only", "indexes=adr"]);
  assert.equal(again.indexes.find((i) => i.folder === "adr").written, false, "idempotent");
});

test("creation e2e: epic — subfolder shape, row written after the epic exists on disk (contract 1)", () => {
  const { proj, vault } = seedCreationFixture();
  const { out, entry } = createThrough(proj, ["epic", "PS-NEW", "Brand new epic"], ["stories"]);
  assert.equal(out.index.folder, "epics");
  assert.equal(entry.written, true, JSON.stringify(entry));
  const idx = readFileSync(join(vault, "epics", "README.md"), "utf8");
  assert.ok(idx.includes("[PS-NEW](./PS-NEW/epic.md)"), idx);
  assert.ok(idx.includes("PROSE BELOW THE TABLE."));
});

test("draft: index.folder is the layout folder, not the kind; stories carry no index (contract 1)", () => {
  const { proj } = seedCreationFixture();
  for (const [kind, folder] of [["runbook", "ops"], ["concept", "concepts"], ["meeting", "meetings"], ["adr", "adr"]]) {
    assert.equal(runIn(proj, "draft.mjs", [kind, "Some title"]).index.folder, folder,
      `${kind} must select its layout folder — a kind-derived selector would miss ${folder}`);
  }
  assert.equal(runIn(proj, "draft.mjs", ["story", "PS-X", "Some title"]).index, null);
});

test("draft: the previewed index row is byte-identical to the row the regeneration writes (contract 4)", () => {
  const { proj, vault } = seedCreationFixture();
  // meeting is the case that used to disagree: draft labelled by bare slug
  // while the regeneration labels by the date-prefixed filename stem.
  for (const args of [["adr", "Some decision"], ["meeting", "Some sync"], ["runbook", "Some drill"], ["epic", "PS-Z", "Some epic"]]) {
    const { out } = createThrough(proj, args, args[0] === "epic" ? ["stories"] : []);
    const rows = readFileSync(join(vault, out.index.folder, "README.md"), "utf8")
      .split("\n").filter((l) => l.startsWith("| ["));
    assert.ok(rows.includes(out.index.line),
      `${args[0]}: preview\n  ${out.index.line}\nis not among written rows\n  ${rows.join("\n  ")}`);
  }
});

test("creation e2e: rows land in SPEC-002 contract 8 order across eras (contract 4)", () => {
  const { proj, vault } = seedCreationFixture();
  const fm = (extra) => `---\n${extra}\n---\n\n# T\n`;
  writeFileSync(join(vault, "adr", "ADR-001-grandfathered.md"),
    fm('type: adr\nid: "ADR-001"\nnumber: "001"\ntitle: "Grandfathered"\nstatus: accepted\ndate: 2026-01-01'));
  writeFileSync(join(vault, "adr", "alpha.md"),
    fm('type: adr\nid: "alpha"\ntitle: "Alpha"\nstatus: accepted\ndate: 2026-01-01'));
  runIn(proj, "reconcile.mjs", ["--write", "--only", "indexes=adr"]);
  createThrough(proj, ["adr", "Zulu"]); // today's date — sorts last
  const labels = readFileSync(join(vault, "adr", "README.md"), "utf8")
    .split("\n").filter((l) => l.startsWith("| [")).map((l) => l.slice(3, l.indexOf("]")));
  assert.deepEqual(labels, ["ADR-001", "alpha", "zulu"]);
});

test("creation e2e: an unrecognized index header is rejected before any write; the artifact survives (contract 3)", () => {
  const { proj, vault } = seedCreationFixture();
  writeFileSync(join(vault, "adr", "README.md"), "# ADRs\n\n| Nope | Nah |\n|------|-----|\n\nPROSE.\n");
  const out = runIn(proj, "draft.mjs", ["adr", "Still created"]);
  writeFileSync(out.path, out.content);
  const r = runInRaw(proj, "reconcile.mjs", ["--write", "--only", `indexes=${out.index.folder}`]);
  assert.notEqual(r.status, 0);
  assert.equal(r.stdout.trim(), "", "a named pre-flight rejection emits no stdout JSON");
  assert.match(r.stderr, /adr\/README\.md/);
  assert.ok(existsSync(out.path), "the creation is not rolled back by a failed index step");
  assert.ok(readFileSync(join(vault, "adr", "README.md"), "utf8").includes("PROSE."));
});

test("index header: extra hand-added columns are not the managed table — no silent column loss (contract 6)", () => {
  const { proj, vault } = seedCreationFixture();
  const five = "# ADRs\n\n| File | Title | Status | Date | Notes |\n|------|-------|--------|------|-------|\n" +
    "| [caching](./caching.md) | Caching | accepted | 2026-01-01 | hand-kept context |\n";
  writeFileSync(join(vault, "adr", "README.md"), five);
  writeFileSync(join(vault, "adr", "caching.md"),
    '---\ntype: adr\nid: "caching"\ntitle: "Caching"\nstatus: accepted\ndate: 2026-01-01\n---\n\n# T\n');
  const r = runInRaw(proj, "reconcile.mjs", ["--write", "--only", "indexes=adr"]);
  assert.notEqual(r.status, 0, "a five-column header is not a recognised index table");
  assert.equal(readFileSync(join(vault, "adr", "README.md"), "utf8"), five,
    "the hand-kept fifth column is never rewritten away");
  // doctor sees the same fact, per its own documented intent.
  const findings = runIn(proj, "doctor.mjs", ["--vault", "--json"]);
  assert.ok(findings.some((f) => f.check === "index-header" && f.file === "adr/README.md"),
    JSON.stringify(findings));
});

test("creation e2e: a localized index header reconciles (registry-driven, not an English literal)", () => {
  const { proj, vault } = makeVaultProject();
  writeFileSync(join(proj, ".waypost", "projectstore.json"), JSON.stringify({
    vault_path: vault, layout: "engineering", language: "de", default_author: "Test",
  }));
  mkdirSync(join(vault, "adr"), { recursive: true });
  writeFileSync(join(vault, "adr", "README.md"),
    "# ADRs\n\n| Datei | Titel | Status | Datum |\n|-------|-------|--------|-------|\n\nPROSA.\n");
  const { out, entry } = createThrough(proj, ["adr", "Zwischenspeicher leeren"]);
  assert.equal(entry.written, true, JSON.stringify(entry));
  const idx = readFileSync(out.index.path, "utf8");
  assert.ok(idx.includes("[zwischenspeicher-leeren]"), idx);
  assert.ok(idx.includes("PROSA."), "prose survives in a localized vault too");
});

// ─── link graph (spec: vault-link-graph-derived-view-and-shared-link-resolver) ──

// Its own fixture — seedDerivedFixture's exact board/write counts are pinned
// by six tests above; do not extend it. One artifact of every edge kind:
// two-sided supersedes and spec↔story declarations (must collapse to one
// edge each), a dead link, an ambiguous stem, an out-of-scope link repeated
// twice (dedup), and all three story shapes.
function seedGraphFixture() {
  const { proj, vault } = makeVaultProject();
  const put = (rel, content) => {
    mkdirSync(join(vault, dirname(rel)), { recursive: true });
    writeFileSync(join(vault, rel), content);
  };
  const fm = (extra, body = "") => `---\n${extra}\n---\n\n# T\n${body}`;
  put(join("adr", "old-way.md"),
    fm('type: adr\nid: "old-way"\ntitle: "Old way"\nstatus: superseded\ndate: 2026-01-01\nsuperseded_by: "new-way"'));
  put(join("adr", "new-way.md"),
    fm('type: adr\nid: "new-way"\ntitle: "New way"\nstatus: accepted\ndate: 2026-01-02\nsupersedes: "old-way"',
      "\n[[kanban]] twice: [[kanban]]\n[[missing-target]]\n[[dup]]\n"));
  put(join("adr", "dup.md"), fm('type: adr\nid: "dup-adr"\ntitle: "Dup A"\nstatus: proposed\ndate: 2026-01-03'));
  put(join("specs", "dup.md"), fm('type: spec\nid: "dup-spec"\ntitle: "Dup S"\nstatus: draft\ndate: 2026-01-03'));
  put(join("specs", "covering.md"),
    fm('type: spec\nid: "covering"\ntitle: "Covering"\nstatus: active\ndate: 2026-01-01\nstories: ["PS-X/story-ship-it"]\nadr: ["new-way"]'));
  put(join("specs", "one-sided.md"),
    fm('type: spec\nid: "one-sided"\ntitle: "One sided"\nstatus: draft\ndate: 2026-01-04\nstories: ["PS-X/story-loose"]'));
  put(join("epics", "PS-X", "epic.md"),
    fm('type: epic\nid: "PS-X"\ntitle: "X"\nstatus: in-progress\ncreated: 2026-01-01\ncode_refs: ["scripts/"]'));
  put(join("epics", "PS-X", "stories", "story-ship-it.md"),
    fm('type: story\nid: "story-ship-it"\ntitle: "Ship it"\nstatus: planned\ncreated: 2026-01-01\nspecs: ["covering"]',
      "\n[[new-way]]\n"));
  put(join("epics", "PS-X", "stories", "story-nested", "README.md"),
    fm('type: story\nid: "story-nested"\ntitle: "Nested"\nstatus: planned\ncreated: 2026-01-02'));
  put(join("epics", "PS-X", "story-loose.md"),
    fm('type: story\nid: "story-loose"\ntitle: "Loose | Pipe"\nstatus: planned\ncreated: 2026-01-02'));
  writeFileSync(join(vault, "kanban.md"), "stub board\n");
  return { proj, vault };
}

test("graph.mjs golden: three story shapes are nodes; typed edges normalized, deduplicated, plain-text, deterministic (contracts 2, 4)", () => {
  const { proj } = seedGraphFixture();
  const g1 = runIn(proj, "graph.mjs", []);
  const g2 = runIn(proj, "graph.mjs", []);
  assert.equal(normEq(g1.content), normEq(g2.content), "byte-identical modulo generated_at");
  for (const p of ["epics/PS-X/stories/story-ship-it.md",
                   "epics/PS-X/stories/story-nested/README.md",
                   "epics/PS-X/story-loose.md"]) {
    assert.ok(g1.content.includes(`| ${p} |`), `${p} is a node`);
  }
  const edges = g1.content.split("\n").filter((l) => l.startsWith("|")).map((l) => l.trim());
  assert.deepEqual(edges.filter((l) => l.includes("| spec-covers |")),
    ["| specs/covering.md | spec-covers | epics/PS-X/stories/story-ship-it.md |",
     "| specs/one-sided.md | spec-covers | epics/PS-X/story-loose.md |"],
    "two-sided declaration collapses to ONE edge; a one-sided declaration is still an edge");
  assert.ok(g1.content.includes("| epics/PS-X/story-loose.md | Loose \\| Pipe | story |"),
    "titles escape | inside tables");
  assert.deepEqual(edges.filter((l) => l.includes("| supersedes |")),
    ["| adr/new-way.md | supersedes | adr/old-way.md |"],
    "two-sided supersedes declaration collapses to one edge");
  assert.ok(edges.includes("| specs/covering.md | spec-implements-adr | adr/new-way.md |"));
  assert.ok(edges.includes("| epics/PS-X/epic.md | epic-contains | epics/PS-X/story-loose.md |"),
    "standalone story is contained by its epic");
  assert.ok(edges.includes("| adr/new-way.md | dead | missing-target |"), "dead To = raw target text");
  assert.ok(edges.includes("| adr/new-way.md | ambiguous | dup (matches: adr/dup.md, specs/dup.md) |"),
    "ambiguous lists candidate paths in the row");
  assert.equal(edges.filter((l) => l === "| adr/new-way.md | out-of-scope | kanban.md |").length, 1,
    "duplicate (from, to, kind) triple deduplicated");
  assert.ok(!g1.content.includes("[["), "plain text — never wikilinks (Obsidian backlink pollution)");
  assert.equal(g1.stats.by_kind["spec-covers"], 2);
  assert.ok(g1.stats.nodes >= 8 && g1.stats.edges >= 7);
});

test("reconcile graph: bare skips while absent, explicit creates, repairs edits, idempotent; grep contract holds (contract 1 + ACs)", () => {
  const { proj, vault } = seedGraphFixture();
  const bare = runIn(proj, "reconcile.mjs", ["--write"]);
  assert.match(bare.graph.skipped, /does not exist/);
  assert.ok(!existsSync(join(vault, "graph.md")), "bare --write never mints graph.md");
  // The standing signal for a missing/deleted graph (contracts 1 + 6).
  const missing = runIn(proj, "doctor.mjs", ["--vault", "--json"]);
  assert.ok(missing.some((f) => f.check === "graph" && f.level === "info"),
    "missing graph.md is a standing doctor info");

  const w = runIn(proj, "reconcile.mjs", ["--write", "--only", "graph"]);
  assert.ok(w.graph.written, "explicit selection creates it");
  const again = runIn(proj, "reconcile.mjs", ["--write", "--only", "graph"]);
  assert.equal(again.graph.written, false, "idempotent");
  const bare2 = runIn(proj, "reconcile.mjs", ["--write"]);
  assert.ok(!bare2.graph.skipped, "once the file exists, bare invocation includes it");

  // Grep contract: one path returns both directions.
  const story = "epics/PS-X/stories/story-ship-it.md";
  const rows = readFileSync(join(vault, "graph.md"), "utf8").split("\n").filter((l) => l.includes(story));
  assert.ok(rows.some((l) => l.startsWith(`| ${story} | wikilink |`)), "outgoing edge in the neighborhood");
  assert.ok(rows.some((l) => l.trimEnd().endsWith(`| spec-covers | ${story} |`)), "incoming edge in the neighborhood");

  // Hand-edit → doctor staleness issue → reconcile repairs → doctor clean.
  const p = join(vault, "graph.md");
  writeFileSync(p, readFileSync(p, "utf8") + "\nHAND EDIT\n");
  const stale = runIn(proj, "doctor.mjs", ["--vault", "--json"]);
  assert.ok(stale.some((f) => f.check === "graph" && f.level === "issue"), "doctor flags a hand-edited graph");
  const repair = runIn(proj, "reconcile.mjs", ["--write", "--only", "graph"]);
  assert.ok(repair.graph.written, "reconcile repairs an existing graph.md");
  const clean = runIn(proj, "doctor.mjs", ["--vault", "--json"]);
  assert.ok(!clean.some((f) => f.check === "graph"), "no graph findings after repair");
});

test("doctor↔graph parity: dead and ambiguous body links are the same facts in both reports (contract 5)", () => {
  const { proj } = seedGraphFixture();
  const wikilink = runIn(proj, "doctor.mjs", ["--vault", "--json"]).filter((f) => f.check === "wikilink");
  const dead = wikilink.filter((f) => f.level === "issue");
  const ambiguous = wikilink.filter((f) => f.level === "warn");
  assert.equal(dead.length, 1, JSON.stringify(wikilink));
  assert.match(dead[0].message, /missing-target/);
  assert.equal(ambiguous.length, 1, "ambiguous is a NEW warn the basename set could not see");
  assert.match(ambiguous[0].message, /dup.*adr\/dup\.md, specs\/dup\.md/);
  const g = runIn(proj, "graph.mjs", []);
  assert.deepEqual(g.content.split("\n").filter((l) => l.includes("| dead |")).map((l) => l.trim()),
    ["| adr/new-way.md | dead | missing-target |"]);
  assert.equal(g.content.split("\n").filter((l) => l.includes("| ambiguous |")).length, 1);
  // out-of-scope is silent in doctor: the [[kanban]] link produced no finding.
  assert.ok(!wikilink.some((f) => f.message.includes("kanban")), "out-of-scope is not a doctor finding");
});

test("generated_at is a full ISO timestamp on all three derived views (contract 6)", () => {
  const { proj } = seedGraphFixture();
  for (const script of ["kanban.mjs", "codemap.mjs", "graph.mjs"]) {
    const out = runIn(proj, script, []);
    assert.match(out.content, /^generated_at: \d{4}-\d\d-\d\dT\d\d:\d\d/m, script);
  }
});

test("diff-refs: no args => fallback true; --since returns file lists", () => {
  const none = run("diff-refs.mjs", []);
  assert.equal(none.fallback, true);
  const since = run("diff-refs.mjs", ["--since", "2020-01-01T00:00:00Z"]);
  assert.ok(Array.isArray(since.files) && Array.isArray(since.uncommitted));
  assert.ok(!since.uncommitted.some((f) => f.endsWith("/")), "directories expanded to files");
  assert.ok(!since.files.some((f) => f.includes("package-lock")), "ignore globs applied");
});

// ─── P1-2: folder-shape and standalone stories are visible to every
// generator, `_templates` is visible to none (B-1/B-2/B-3) ────────────

// Three "done epic, one non-done child story" epics, one per story shape,
// plus a `_templates` epic that must stay invisible everywhere.
function seedStoryShapesFixture() {
  const { proj, vault } = makeVaultProject();
  const fm = (extra) => `---\n${extra}\n---\n\n# T\n`;
  const put = (rel, content) => {
    mkdirSync(join(vault, dirname(rel)), { recursive: true });
    writeFileSync(join(vault, rel), content);
  };
  put("epics/E1/epic.md", fm('type: epic\nid: "E1"\ntitle: "E1"\nstatus: done\ncreated: 2026-01-01'));
  put("epics/E1/stories/story-folder/README.md",
    fm('type: story\nid: "story-folder"\ntitle: "Folder story"\nstatus: in-progress\ncreated: 2026-01-01\ncode_refs: ["scripts/lib.mjs"]'));
  put("epics/E2/epic.md", fm('type: epic\nid: "E2"\ntitle: "E2"\nstatus: done\ncreated: 2026-01-01'));
  put("epics/E2/stories/story-flat.md",
    fm('type: story\nid: "story-flat"\ntitle: "Flat story"\nstatus: in-progress\ncreated: 2026-01-01\ncode_refs: ["scripts/lib.mjs"]'));
  put("epics/E3/epic.md", fm('type: epic\nid: "E3"\ntitle: "E3"\nstatus: done\ncreated: 2026-01-01'));
  put("epics/E3/story-standalone.md",
    fm('type: story\nid: "story-standalone"\ntitle: "Standalone story"\nstatus: in-progress\ncreated: 2026-01-01\ncode_refs: ["scripts/lib.mjs"]'));
  put("epics/_templates/epic.md", fm('type: epic\ntitle: "TEMPLATE — do not use"\nstatus: planned'));
  return { proj, vault };
}

test("doctor: epic-status sees a non-done child in ALL three story shapes, never _templates (B-1)", () => {
  const { proj } = seedStoryShapesFixture();
  const findings = runIn(proj, "doctor.mjs", ["--vault", "--json"]);
  const epicStatus = findings.filter((f) => f.check === "epic-status");
  assert.deepEqual(epicStatus.map((f) => f.file).sort(),
    ["epics/E1/epic.md", "epics/E2/epic.md", "epics/E3/epic.md"],
    JSON.stringify(epicStatus));
  assert.ok(!JSON.stringify(findings).includes("_templates"), "_templates never surfaces in any finding");
});

test("codemap.mjs: story_rows covers all three shapes; _templates is not counted as an epic (B-2/B-3)", () => {
  const { proj } = seedStoryShapesFixture();
  const out = runIn(proj, "codemap.mjs", []);
  assert.equal(out.stats.epics, 3, "_templates excluded from the epic count");
  assert.equal(out.stats.story_rows, 3, JSON.stringify(out.stats));
  for (const label of ["Folder story", "Flat story", "Standalone story"]) {
    assert.ok(out.content.includes(label), `${label} missing from code-map.md content`);
  }
  assert.ok(!out.content.includes("_templates"));
});

test("kanban.mjs: all three story shapes reach the board; _templates does not (regression)", () => {
  const { proj } = seedStoryShapesFixture();
  const out = runIn(proj, "kanban.mjs", []);
  assert.equal(out.stats.total, 3, JSON.stringify(out.stats));
  assert.ok(!out.content.includes("_templates"));
});

// ─── P1-4: a `|` in a title round-trips through reconcile/draft without
// tripping doctor's index check (B-5) ───────────────────────────────────

test("index title containing '|' round-trips without a false doctor index finding (B-5)", () => {
  const { proj, vault } = seedCreationFixture();
  const { out, entry } = createThrough(proj, ["adr", "Fix A|B toggle"]);
  assert.equal(entry.written, true, JSON.stringify(entry));
  const idx = readFileSync(join(vault, "adr", "README.md"), "utf8");
  assert.ok(idx.includes("Fix A\\|B toggle"), "the row escapes the pipe");
  const findings = runIn(proj, "doctor.mjs", ["--vault", "--json"]);
  const idxFindings = findings.filter((f) => f.check === "index");
  assert.deepEqual(idxFindings, [], JSON.stringify(idxFindings));
});

// ─── bin/waypost: vault containment, atomic writes, and the rest of the CLI
// fixes in the plan's Проход 1 (P1-5 .. P1-12). bin/waypost had no drive at all
// before this pass — every test below is a first, not a regression guard for
// something checked elsewhere. ──────────────────────────────────────────

test("bin/waypost story --write refuses to write outside the vault, file left untouched (P1-5, A-1)", () => {
  const { proj } = makeVaultProject();
  const outside = join(proj, "outside.md"); // inside the project, but not under vault/
  const original = '---\ntype: story\nstatus: planned\n---\n\n# Notes\nHand-written text, not a vault artifact.\n';
  writeFileSync(outside, original, "utf8");
  const r = runBinRaw(proj, ["story", "plan", outside, "--write"]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /refusing to write outside the vault/);
  assert.equal(readFileSync(outside, "utf8"), original, "the file outside the vault is untouched");
});

// Simulates the race between story-section.mjs's read and bin/waypost's own
// pre-write re-read without timing two real processes against each other: a
// copy of bin/waypost (a real file — its ROOT comes from import.meta.url, which
// follows a symlink to the real repo and would defeat the substitution) plus
// a story-section.mjs that delegates to the REAL script and then, using the
// answer it got back, overwrites the story file with different bytes before
// returning — landing bin/waypost in exactly the position "someone else wrote
// this file after I read it" describes.
function makeRaceRepo(raceContent) {
  const tmp = mkdtempSync(join(tmpdir(), "ps-race-"));
  mkdirSync(join(tmp, "bin"));
  mkdirSync(join(tmp, "scripts"));
  writeFileSync(join(tmp, "bin", "waypost"), readFileSync(join(REPO, "bin", "waypost"), "utf8"), "utf8");
  for (const f of readdirSync(join(REPO, "scripts"))) {
    if (f === "story-section.mjs") continue;
    symlinkSync(join(REPO, "scripts", f), join(tmp, "scripts", f));
  }
  for (const d of ["scaffold", "templates"]) symlinkSync(join(REPO, d), join(tmp, d));
  const realStorySection = JSON.stringify(join(REPO, "scripts", "story-section.mjs"));
  writeFileSync(join(tmp, "scripts", "story-section.mjs"), [
    'import { spawnSync } from "node:child_process";',
    'import { writeFileSync } from "node:fs";',
    `const r = spawnSync(process.execPath, [${realStorySection}, ...process.argv.slice(2)], { encoding: "utf8" });`,
    'if (r.status !== 0) { process.stderr.write(r.stderr || ""); process.exit(r.status ?? 1); }',
    "// The concurrent edit: lands between the real script's read (just above) and bin/waypost's own pre-write re-read.",
    `writeFileSync(process.argv[3], ${JSON.stringify(raceContent)}, "utf8");`,
    "process.stdout.write(r.stdout);",
  ].join("\n"), "utf8");
  return tmp;
}

test("bin/waypost story --write refuses a stale sha256 — a concurrent edit is not silently discarded (P1-6, A-2/A-3)", () => {
  const { proj, vault } = makeVaultProject();
  const storyPath = join(vault, "epics", "PS-X", "stories", "story-race.md");
  const original = '---\ntype: story\nid: "story-race"\nstatus: planned\n---\n\n# Race\n';
  writeFileSync(storyPath, original, "utf8");
  const raceContent = '---\ntype: story\nid: "story-race"\nstatus: planned\nconcurrent: "yes"\n---\n\n# Race\n';
  const raceRepo = makeRaceRepo(raceContent);
  const r = spawnSync(process.execPath, [join(raceRepo, "bin", "waypost"), "story", "plan", storyPath, "--write"], {
    encoding: "utf8", env: { ...process.env, WAYPOST_PROJECT_DIR: proj, WAYPOST_NO_BEAT: "1" }, timeout: 15000,
  });
  assert.notEqual(r.status, 0, r.stdout);
  assert.match(r.stderr, /changed since it was read/);
  assert.equal(readFileSync(storyPath, "utf8"), raceContent,
    "the concurrent write survives — bin/waypost must not overwrite it with content computed from stale bytes");
});

test("bin/waypost: a broken .waypost/projectstore.json fails loudly instead of letting setup rebind over it (P1-7, G-5)", () => {
  const proj = mkdtempSync(join(tmpdir(), "ps-badcfg-"));
  mkdirSync(join(proj, ".waypost"), { recursive: true });
  const cfgPath = join(proj, ".waypost", "projectstore.json");
  const broken = '{ "vault_path": "/some/vault", "layout": "engineering", }'; // trailing comma
  writeFileSync(cfgPath, broken, "utf8");
  const r = runBinRaw(proj, ["setup", "--dry-run"]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /config exists but is unreadable/);
  assert.equal(readFileSync(cfgPath, "utf8"), broken, "broken config left untouched, not silently rebound");
});

test("readConfig (lib.mjs): a script sees an unparseable config as a loud failure, not \"unbound\" (P1-7, G-5)", () => {
  const proj = mkdtempSync(join(tmpdir(), "ps-badcfg2-"));
  mkdirSync(join(proj, ".waypost"), { recursive: true });
  writeFileSync(join(proj, ".waypost", "projectstore.json"), "{ not json", "utf8");
  const r = spawnSync(process.execPath, [join(REPO, "scripts", "kanban.mjs")], {
    encoding: "utf8", env: { ...ENV, WAYPOST_PROJECT_DIR: proj }, cwd: REPO, timeout: 15000,
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /unreadable/);
  assert.doesNotMatch(r.stderr, /No projectstore config/, "must not read as simply unbound");
});

test("doctor: a broken <vault>/.projectstore.json is its own issue-level finding (P1-7, G-6)", () => {
  const { proj, vault } = makeVaultProject();
  writeFileSync(join(vault, ".projectstore.json"), '{ "spec_policy": "required", }', "utf8"); // trailing comma
  const r = spawnSync(process.execPath, [join(REPO, "scripts", "doctor.mjs"), "--vault", "--json"], {
    encoding: "utf8", env: { ...ENV, WAYPOST_PROJECT_DIR: proj }, cwd: REPO, timeout: 15000,
  });
  const findings = JSON.parse(r.stdout);
  const policy = findings.find((f) => f.check === "vault-policy" && f.level === "issue");
  assert.ok(policy, JSON.stringify(findings));
  assert.match(r.stderr, /vault policy unreadable/);
});

test("waypost next: a warn message truncates on a sentence boundary, not the first literal dot (P1-8, G-7)", () => {
  const proj = mkdtempSync(join(tmpdir(), "ps-next-"));
  spawnSync("git", ["init", "-q"], { cwd: proj });
  const vault = join(proj, "vault");
  mkdirSync(join(vault, "epics"), { recursive: true });
  mkdirSync(join(proj, ".waypost"), { recursive: true });
  writeFileSync(join(proj, ".waypost", "projectstore.json"),
    JSON.stringify({ vault_path: vault, layout: "engineering", language: "en" }), "utf8");
  const r = runBinRaw(proj, ["next"]);
  assert.equal(r.status, 0, r.stderr);
  // checkGitignore's message: "Machine-specific files not gitignored: .waypost/projectstore.json, ...".
  // Its first literal "." sits inside ".waypost/projectstore.json" — cutting there
  // used to leave a dangling "not gitignored: " with nothing after the colon.
  assert.ok(r.stdout.includes("Machine-specific files not gitignored: .waypost/projectstore.json"),
    `expected the full clause in:\n${r.stdout}`);
});

test("doctor: text-mode exit reflects an issue finding; --json stays a reporting tool (P1-9, G-10)", () => {
  const proj = mkdtempSync(join(tmpdir(), "ps-doctorexit-"));
  // No .waypost/projectstore.json at all => checkConfig is an issue-level finding.
  const rText = spawnSync(process.execPath, [join(REPO, "scripts", "doctor.mjs")], {
    encoding: "utf8", env: { ...ENV, WAYPOST_PROJECT_DIR: proj }, cwd: REPO, timeout: 15000,
  });
  assert.notEqual(rText.status, 0, "text mode must fail on an issue-level finding");
  const rJson = spawnSync(process.execPath, [join(REPO, "scripts", "doctor.mjs"), "--json"], {
    encoding: "utf8", env: { ...ENV, WAYPOST_PROJECT_DIR: proj }, cwd: REPO, timeout: 15000,
  });
  assert.equal(rJson.status, 0, "json mode (a reporting tool) always exits 0");
});

test("waypost setup: the repair step prints doctor's own report instead of swallowing it (P1-9, G-10)", () => {
  const proj = mkdtempSync(join(tmpdir(), "ps-setup-"));
  spawnSync("git", ["init", "-q"], { cwd: proj });
  const r = runBinRaw(proj, ["setup", "--vault", join(proj, "vault")]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /## repairs/, "doctor --fix's own report must be visible, not discarded");
});

test("draft --lang overrides the bound vault's language for one call (P1-10, A-5)", () => {
  const { proj } = makeVaultProject(); // language: "en"
  const out = runIn(proj, "draft.mjs", ["adr", "Lang Test", "--lang", "ru"]);
  assert.match(out.content, /## Контекст/, "ru template rendered, not the bound en default");
});

test("draft --lang rejects an unknown language before touching the vault (P1-10, A-5)", () => {
  const { proj } = makeVaultProject();
  const r = runInRaw(proj, "draft.mjs", ["adr", "Lang Test", "--lang", "xx"]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /unknown language/);
});

test("bin/waypost draft --lang forwards to draft.mjs (P1-10, A-5)", () => {
  const { proj } = makeVaultProject();
  const r = runBinRaw(proj, ["draft", "adr", "Lang Test", "--lang", "ru", "--json"]);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.match(out.content, /## Контекст/);
});

test("bin/waypost scaffold --json prints only JSON (P1-11, A-6)", () => {
  const { proj } = makeVaultProject();
  const r = runBinRaw(proj, ["scaffold", "--json"]);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotThrow(() => JSON.parse(r.stdout), `stdout must be pure JSON, got:\n${r.stdout}`);
});

test("bin/waypost search --limit rejects a non-integer instead of silently printing nothing (P1-12, A-10)", () => {
  const { proj } = makeVaultProject();
  runBin(proj, ["draft", "adr", "Findable Thing", "--write"]);
  const ok = runBinRaw(proj, ["search", "Findable", "--limit", "5"]);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /Findable Thing/);
  const bad = runBinRaw(proj, ["search", "Findable", "--limit", "abc"]);
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /--limit/);
});

test("bin/waypost search: a symlinked directory is never descended into, so a cycle cannot hang the walk (P3-3, G-13)", () => {
  const { proj, vault } = makeVaultProject();
  const loopDir = join(vault, "adr", "loop");
  mkdirSync(loopDir, { recursive: true });
  writeFileSync(join(loopDir, "inside.md"),
    "---\ntype: adr\ntitle: Inside The Loop\n---\n\nFindableLoop text.\n", "utf8");
  symlinkSync(loopDir, join(loopDir, "self")); // a directory symlinked into itself
  const r = runBinRaw(proj, ["search", "FindableLoop"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /adr\/loop\/inside\.md/, "a real file in the loop directory is still found");
});

test("bin/waypost search: .icloud placeholders are counted and reported, not silently skipped (P3-3, G-13)", () => {
  const { proj, vault } = makeVaultProject();
  writeFileSync(join(vault, "adr", ".evicted.md.icloud"), "", "utf8");
  const r = runBinRaw(proj, ["search", "nomatchanywhere"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /no match/);
  assert.match(r.stdout, /1 file\(s\) not downloaded from iCloud — open them once to sync/);
});

test("bin/waypost search -- <literal>: `--` stops flag parsing so a flag-shaped term is searched literally (P3-7, A-8)", () => {
  const { proj, vault } = makeVaultProject();
  writeFileSync(join(vault, "adr", "flaglike.md"),
    "---\ntype: adr\ntitle: Flag Title\n---\n\nliteral --project marker\n", "utf8");
  const r = runBinRaw(proj, ["search", "--", "--project"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /flaglike\.md/, "the literal term after -- is searched, not swallowed as a global/local flag");
});

// ── ADR-0009: artifact integrity ───────────────────────────────────────
//
// Built from real frontmatter, not hand-made objects: the first version of these
// tests supplied `fm` directly and so never exercised the reader — which is
// exactly where the check was blind (a bare scalar, the form these fields are
// normally written in and the form this file's own older fixtures use).

function vaultWithAdrs(entries, vaultCfg = null) {
  const { proj, vault } = makeVaultProject();
  for (const [name, fm, body = ""] of entries) {
    writeFileSync(join(vault, "adr", name), `---\n${fm}\n---\n\n# T\n${body}`, "utf8");
  }
  if (vaultCfg) {
    writeFileSync(join(vault, ".projectstore.json"), JSON.stringify(vaultCfg), "utf8");
  }
  return { proj, vault };
}

async function vaultFindings(proj, check) {
  const { readConfig, loadLayout, readVaultConfig, buildNodeIndex } = await import("../scripts/lib.mjs");
  const { scanArtifacts, walkVaultFiles } = await import("../scripts/doctor.mjs");
  const prev = process.env.WAYPOST_PROJECT_DIR;
  process.env.WAYPOST_PROJECT_DIR = proj;
  try {
    const cfg = readConfig();
    const layout = loadLayout(cfg.layout);
    return check({
      cfg, layout,
      artifacts: scanArtifacts(cfg, layout),
      vaultCfg: readVaultConfig(cfg.vault_path),
      index: buildNodeIndex(cfg, layout),
      files: walkVaultFiles(cfg.vault_path),
    });
  } finally {
    if (prev === undefined) delete process.env.WAYPOST_PROJECT_DIR;
    else process.env.WAYPOST_PROJECT_DIR = prev;
  }
}

test("doctor code_refs: unresolved is a warning at proposed, an issue at done (ADR-0009)", async () => {
  const { checkCodeRefs } = await import("../scripts/doctor.mjs");
  const proj = mkdtempSync(join(tmpdir(), "wp-refs-"));
  const at = (status) => checkCodeRefs([{ rel: "a.md", kind: "adr", fm: { status, code_refs: '["nope.rs"]' }, body: "" }], proj);
  assert.equal(at("proposed")[0].level, "warn", "a proposed artifact is checked but must not turn a vault red");
  assert.equal(at("done")[0].level, "issue", "done keeps the stronger severity");
});

test("doctor code_refs: (waiting)/(deleted)/(planned) suffixes are exempt at every status (ADR-0009)", async () => {
  const { checkCodeRefs } = await import("../scripts/doctor.mjs");
  const proj = mkdtempSync(join(tmpdir(), "wp-refs2-"));
  const refs = '["gone.rs (deleted)", "later.rs (waiting)", "soon.rs (planned)"]';
  for (const status of ["proposed", "done"]) {
    assert.deepEqual(checkCodeRefs([{ rel: "a.md", kind: "adr", fm: { status, code_refs: refs }, body: "" }], proj), [],
      `annotated paths are a promise, not a claim (status: ${status})`);
  }
  const mid = checkCodeRefs([{ rel: "a.md", kind: "adr", fm: { status: "proposed", code_refs: '["x.rs (deleted) trailing"]' }, body: "" }], proj);
  assert.equal(mid.length, 1, "the annotation is a suffix, not a substring anywhere in the path");
});

test("doctor supersedes: reads the bare-scalar form, like graph does (ADR-0009)", async () => {
  const { checkSupersedes } = await import("../scripts/doctor.mjs");
  const { proj } = vaultWithAdrs([
    ["old.md", 'type: adr\nid: "old"\ntitle: "Old"\nstatus: superseded\ndate: 2026-01-01\nsuperseded_by: "new"'],
    ["new.md", 'type: adr\nid: "new"\ntitle: "New"\nstatus: accepted\ndate: 2026-01-02\nsupersedes: "old"'],
  ]);
  const ok = await vaultFindings(proj, ({ index, files }) => checkSupersedes(index, files));
  assert.deepEqual(ok, [], "a well-formed scalar pair is silent");

  const { proj: proj2 } = vaultWithAdrs([
    ["a.md", 'type: adr\nid: "a"\ntitle: "A"\nstatus: accepted\ndate: 2026-01-01\nsupersedes: "ghost"'],
  ]);
  const dangling = await vaultFindings(proj2, ({ index, files }) => checkSupersedes(index, files));
  assert.equal(dangling.length, 1, "a scalar dangling target is caught — it used to be invisible");
  assert.equal(dangling[0].level, "issue");
});

test("doctor supersedes: a slug reference resolves through the shared resolver (ADR-0009)", async () => {
  const { checkSupersedes } = await import("../scripts/doctor.mjs");
  // Legacy-numbered filenames referenced by slug: legal for graph, and the first
  // version of this check reported both sides as dangling.
  const { proj } = vaultWithAdrs([
    ["ADR-001-old-way.md", 'type: adr\nid: "old-way"\ntitle: "Old"\nstatus: superseded\ndate: 2026-01-01\nsuperseded_by: "new-way"'],
    ["ADR-002-new-way.md", 'type: adr\nid: "new-way"\ntitle: "New"\nstatus: accepted\ndate: 2026-01-02\nsupersedes: "old-way"'],
  ]);
  const out = await vaultFindings(proj, ({ index, files }) => checkSupersedes(index, files));
  assert.deepEqual(out, [], "a correct pair must not be reported because of how the link is written");
});

test("doctor supersedes: asymmetry, self-reference and duplicates each report once (ADR-0009)", async () => {
  const { checkSupersedes } = await import("../scripts/doctor.mjs");
  const { proj } = vaultWithAdrs([
    ["a.md", 'type: adr\nid: "a"\ntitle: "A"\nstatus: accepted\ndate: 2026-01-01\nsupersedes: ["b", "b"]'],
    ["b.md", 'type: adr\nid: "b"\ntitle: "B"\nstatus: proposed\ndate: 2026-01-02'],
    ["self.md", 'type: adr\nid: "self"\ntitle: "S"\nstatus: accepted\ndate: 2026-01-03\nsupersedes: "self"'],
  ]);
  const out = await vaultFindings(proj, ({ index, files }) => checkSupersedes(index, files));
  assert.equal(out.filter((f) => /one-directional/.test(f.message)).length, 1, "a repeated entry is one finding");
  assert.ok(out.some((f) => /not "superseded"/.test(f.message)), "the replaced artifact must say so");
  assert.ok(out.some((f) => /points at the artifact itself/.test(f.message)), "self-reference is named, not left implicit");
});

test("doctor acceptance gate: its own key, and any explicit review outcome satisfies it (ADR-0009)", async () => {
  const { checkAcceptanceGate } = await import("../scripts/doctor.mjs");
  const art = (review) => [{ rel: "adr/a.md", kind: "adr", fm: { status: "accepted", review_status: review }, body: "" }];

  assert.deepEqual(checkAcceptanceGate(art("pending"), {}), [], "off by default");
  assert.deepEqual(checkAcceptanceGate(art("pending"), { lifecycle_gates: "on" }), [],
    "story gates must not enrol a project into an acceptance policy it never chose");

  const gated = checkAcceptanceGate(art("pending"), { acceptance_gate: "on" });
  assert.equal(gated.length, 1);
  assert.equal(gated[0].level, "issue");

  for (const answer of ["reviewed", "n/a", "waived", "grandfathered"]) {
    assert.deepEqual(checkAcceptanceGate(art(answer), { acceptance_gate: "on" }), [],
      `"${answer}" is an answer to the review question, not silence`);
  }
  const runbook = [{ rel: "ops/r.md", kind: "runbook", fm: { status: "accepted" }, body: "" }];
  assert.deepEqual(checkAcceptanceGate(runbook, { acceptance_gate: "on" }), [],
    "kinds whose template has no review_status are out of scope");
});

test("doctor: the ADR-0009 checks add no issue to a well-formed vault (ADR-0009)", async () => {
  const { runVaultChecks } = await import("../scripts/doctor.mjs");
  const { proj } = vaultWithAdrs([
    ["kept.md", 'type: adr\nid: "kept"\ntitle: "Kept"\nstatus: accepted\ndate: 2026-01-01\nreview_status: pending\ncode_refs: ["src/soon.rs (planned)"]'],
  ]);
  const prev = process.env.WAYPOST_PROJECT_DIR;
  process.env.WAYPOST_PROJECT_DIR = proj;
  try {
    const { readConfig } = await import("../scripts/lib.mjs");
    const issues = runVaultChecks(readConfig()).filter((f) => f.level === "issue");
    assert.deepEqual(issues, [], "the promise of the ADR: an existing vault does not turn red on upgrade");
  } finally {
    if (prev === undefined) delete process.env.WAYPOST_PROJECT_DIR;
    else process.env.WAYPOST_PROJECT_DIR = prev;
  }
});

// ─── G-4: cross-kind supersedes resolution ──────────────────────────────

test("doctor supersedes: ambiguity OUTSIDE the target's kind is named, not reported as \"not an artifact\" (G-4)", async () => {
  const { checkSupersedes } = await import("../scripts/doctor.mjs");
  const { proj, vault } = vaultWithAdrs([
    ["a.md", 'type: adr\nid: "a"\ntitle: "A"\nstatus: accepted\ndate: 2026-01-01\nsupersedes: "probe-concept"'],
  ]);
  mkdirSync(join(vault, "concepts"), { recursive: true });
  mkdirSync(join(vault, "meetings"), { recursive: true });
  writeFileSync(join(vault, "concepts", "probe-concept.md"),
    '---\ntype: concept\nslug: "probe-concept"\ntitle: "C"\nstatus: draft\n---\n\n# C\n', "utf8");
  writeFileSync(join(vault, "meetings", "probe-concept.md"),
    '---\ntype: meeting\nslug: "probe-concept"\ntitle: "M"\nstatus: draft\n---\n\n# M\n', "utf8");
  const out = await vaultFindings(proj, ({ index, files }) => checkSupersedes(index, files));
  const ambiguous = out.find((f) => /is ambiguous/.test(f.message));
  assert.ok(ambiguous, `expected an ambiguous finding, got: ${JSON.stringify(out)}`);
  assert.doesNotMatch(ambiguous.message, /not an artifact/,
    "an artifact that exists twice under that name is not the same fact as no artifact at all");
});

test("doctor supersedes: a single cross-kind match is named without an indefinite article (G-4)", async () => {
  const { checkSupersedes } = await import("../scripts/doctor.mjs");
  const { proj, vault } = vaultWithAdrs([
    ["a.md", 'type: adr\nid: "a"\ntitle: "A"\nstatus: accepted\ndate: 2026-01-01\nsupersedes: "probe-note"'],
  ]);
  mkdirSync(join(vault, "research"), { recursive: true });
  writeFileSync(join(vault, "research", "probe-note.md"),
    '---\ntype: research\nslug: "probe-note"\ntitle: "N"\nstatus: draft\n---\n\n# N\n', "utf8");
  const out = await vaultFindings(proj, ({ index, files }) => checkSupersedes(index, files));
  const cross = out.find((f) => /resolves to/.test(f.message));
  assert.ok(cross, `expected a cross-kind finding, got: ${JSON.stringify(out)}`);
  assert.match(cross.message, /\(kind: research\)/);
  assert.doesNotMatch(cross.message, /, a research/, "no dangling indefinite article");
});

// ─── G-2: vault-policy gate values ──────────────────────────────────────

test("doctor: a gate value outside on/off/true/false is warned about, not silently read as off (G-2)", async () => {
  const { checkVaultPolicy } = await import("../scripts/doctor.mjs");
  const { proj, vault } = makeVaultProject();
  const clean = checkVaultPolicy({ vault_path: vault }, null, [], { lifecycle_gates: "on", acceptance_gate: "off" });
  assert.deepEqual(clean.filter((f) => f.check === "vault-policy"), [], "on/off are recognised, no warning");

  const boolOk = checkVaultPolicy({ vault_path: vault }, null, [], { lifecycle_gates: true, acceptance_gate: false });
  assert.deepEqual(boolOk.filter((f) => f.check === "vault-policy"), [], "JSON booleans are recognised too");

  const typo = checkVaultPolicy({ vault_path: vault }, null, [], { lifecycle_gates: "yes" });
  const warned = typo.filter((f) => f.check === "vault-policy");
  assert.equal(warned.length, 1, `"yes" must be flagged, got: ${JSON.stringify(typo)}`);
  assert.equal(warned[0].level, "warn");
  assert.match(warned[0].message, /lifecycle_gates/);
});

// ─── G-7: merge driver — a foreign machine's own path ───────────────────

test("doctor: another machine's own merge-derived.mjs path is accepted, not flagged as drift (G-7)", async () => {
  const { checkMergeDriver } = await import("../scripts/doctor.mjs");
  const proj = mkdtempSync(join(tmpdir(), "wp-mergedrv-"));
  const vault = join(proj, "vault");
  mkdirSync(vault, { recursive: true });
  spawnSync("git", ["init", "-q"], { cwd: proj });
  writeFileSync(join(proj, ".gitattributes"), "*.md merge=waypost-derived\n", "utf8");
  spawnSync("git", ["config", "merge.waypost-derived.driver",
    "node /Users/someoneelse/checkout/scripts/merge-derived.mjs %A %O %B %P"], { cwd: proj });
  const out = checkMergeDriver({ vault_path: vault }, proj);
  assert.ok(!out.some((f) => f.check === "merge-driver" && /different command/.test(f.message)),
    `a foreign machine's own path must not read as drift: ${JSON.stringify(out)}`);
});

test("doctor: a driver that is not this fork's merge-derived shape is still flagged as drift (G-7)", async () => {
  const { checkMergeDriver } = await import("../scripts/doctor.mjs");
  const proj = mkdtempSync(join(tmpdir(), "wp-mergedrv2-"));
  const vault = join(proj, "vault");
  mkdirSync(vault, { recursive: true });
  spawnSync("git", ["init", "-q"], { cwd: proj });
  writeFileSync(join(proj, ".gitattributes"), "*.md merge=waypost-derived\n", "utf8");
  spawnSync("git", ["config", "merge.waypost-derived.driver", "some-old-command %A"], { cwd: proj });
  const out = checkMergeDriver({ vault_path: vault }, proj);
  assert.ok(out.some((f) => f.check === "merge-driver" && /different command/.test(f.message)));
});

// ─── A2-4: draft filters kinds by layout.commands ───────────────────────

test("draft: a command-less folder kind (diagram) dies cleanly, not with a raw stack trace (A2-4)", () => {
  const { proj } = makeVaultProject();
  const r = runInRaw(proj, "draft.mjs", ["diagram", "x"]);
  assert.notEqual(r.status, 0);
  assert.doesNotMatch(r.stderr, /at file:|Error:\s*$/m, `expected a clean die(), got:\n${r.stderr}`);
  assert.match(r.stderr, /Unknown kind: diagram/);
  const declared = r.stderr.split("declares:")[1] || "";
  assert.doesNotMatch(declared, /\bdiagram\b/, "diagram must not be offered as a valid kind either");
});
