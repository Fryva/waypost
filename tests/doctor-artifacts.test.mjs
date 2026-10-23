import "./env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { walkVaultFiles, checkArtifactIdentity, checkExternalRefsForm, checkArtifactNames } from "../scripts/doctor-artifacts.mjs";
import { loadLayout, parseFrontmatter } from "../scripts/lib.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "wp-artifact-module-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
const files = (...paths) => Object.freeze(paths.map(rel => Object.freeze({ rel, name: rel.split("/").at(-1) })));

test("doctor artifacts module: shared walk includes loose and folder stories, excluding dotfiles and uppercase extensions", t => {
  const root = fixture(t);
  const included = ["loose.md", "adr/README.md", "epics/E/stories/story-flat.md", "epics/E/stories/story-folder/README.md"];
  for (const rel of [...included, ".hidden.md", ".hidden/note.md", "adr/.private.md", "UPPER.MD", "plain.txt"]) {
    const target = join(root, rel);
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, "fixture\n");
  }
  assert.deepEqual([...walkVaultFiles(root)].sort((a, b) => a.rel.localeCompare(b.rel)),
    [...files(...included)].sort((a, b) => a.rel.localeCompare(b.rel)));
  assert.throws(() => walkVaultFiles(join(root, "missing")), { code: "ENOENT" });
});

test("doctor artifacts module: a failed stat is skipped by the unchanged walk", t => {
  const root = fixture(t);
  writeFileSync(join(root, "visible.md"), "visible\n");
  try {
    symlinkSync(join(root, "missing-target.md"), join(root, "broken.md"), "file");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOSYS"].includes(error.code)) return t.skip("file symlink unavailable on this host");
    throw error;
  }
  assert.deepEqual(walkVaultFiles(root), [{ rel: "visible.md", name: "visible.md" }]);
});

test("doctor artifacts module: complete identity finding and frozen inputs retain the legacy classification", () => {
  const layout = loadLayout("engineering");
  const input = files("adr/ADR-003-topic.md", "adr/topic.md", "adr/README.md");
  const before = JSON.stringify({ layout, input });
  assert.deepEqual(checkArtifactIdentity(layout, input), [{ group: "vault", level: "issue", check: "identity",
    message: 'Same normalized identity "topic" in adr: ADR-003-topic.md, topic.md — two artifacts claim one topic.',
    file: "adr/ADR-003-topic.md" }]);
  assert.equal(JSON.stringify({ layout, input }), before);
});

test("doctor artifacts module: parsed CRLF external-ref block and inline forms keep full findings", () => {
  const body = "---\r\ntype: adr\r\nexternal_refs:\r\n  jira: ABC-123\r\n---\r\n";
  const bad = Object.freeze({ rel: "adr/a.md", body, fm: Object.freeze(parseFrontmatter(body).data) });
  const inlineBody = "---\ntype: adr\nexternal_refs: {}\n---\n";
  const inline = Object.freeze({ rel: "adr/b.md", body: inlineBody, fm: Object.freeze(parseFrontmatter(inlineBody).data) });
  const input = Object.freeze([bad, inline]);
  const before = JSON.stringify(input);
  assert.deepEqual(checkExternalRefsForm(input), [{ group: "vault", level: "issue", check: "external-refs",
    message: '`external_refs:` uses block-form YAML which projectstore cannot parse — use inline flow: external_refs: {jira: "ABC-123"}.',
    file: "adr/a.md" }]);
  assert.equal(JSON.stringify(input), before);
});

test("doctor artifacts module: full sync-name findings retain order and infrastructure exemptions", () => {
  const input = files("research/foo 2.md", "adr/topic.md", "research/topic.md", "adr/README.md", "research/README.md",
    "epics/E/epic.md", "epics/F/epic.md", "kanban.md", "notes/kanban.md");
  const before = JSON.stringify(input);
  assert.deepEqual(checkArtifactNames(input), [
    { group: "vault", level: "warn", check: "artifact-name",
      message: 'Sync-conflict filename shape — trailing " <n>" numeral — sync-engine duplicate shape. Merge or remove; sync engines leave these beside the original.',
      file: "research/foo 2.md" },
    { group: "vault", level: "info", check: "artifact-name",
      message: 'Basename "topic.md" appears in 2 folders (adr, research) — short wiki-links [[topic]] are ambiguous.', file: "adr/topic.md" },
  ]);
  assert.equal(JSON.stringify(input), before);
});
