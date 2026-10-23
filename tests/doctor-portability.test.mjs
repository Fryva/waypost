import "./env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as focused from "../scripts/doctor-portability.mjs";
import { checkPortableNames, checkLineEndings } from "../scripts/doctor.mjs";

test("doctor portability module: old public imports retain identical bindings", () => {
  assert.equal(checkPortableNames, focused.checkPortableNames);
  assert.equal(checkLineEndings, focused.checkLineEndings);
});

test("doctor portability module: full findings preserve segments, reason deduplication, order and frozen entries", () => {
  const input = Object.freeze(['bad:/other?/CON.md', 'trailing /control\u0001.md', 'adr/Topic.md', 'adr/topic.md']);
  const expected = [
    { group: "vault", level: "warn", check: "portable-names",
      message: '\"bad:/other?/CON.md\" cannot be checked out on Windows: it contains one of <>:\"|?* — illegal in a Windows path; a reserved device name on Windows (\"CON.md\").', file: input[0] },
    { group: "vault", level: "warn", check: "portable-names",
      message: '\"trailing /control\u0001.md\" cannot be checked out on Windows: it contains a segment ending in a space or dot (\"trailing \") — Windows silently drops it; a control character.', file: input[1] },
    { group: "vault", level: "issue", check: "portable-names",
      message: '\"adr/topic.md\" and \"adr/Topic.md\" differ only in case — on macOS and Windows one of them cannot exist, so a clone there loses a file.', file: input[3] },
  ];
  const objects = Object.freeze(input.map(rel => Object.freeze({ rel, name: rel.split("/").at(-1) })));
  const before = JSON.stringify({ input, objects });
  assert.deepEqual(focused.checkPortableNames({}, input), expected);
  assert.deepEqual(focused.checkPortableNames({}, objects), expected);
  assert.equal(JSON.stringify({ input, objects }), before);
});

test("doctor portability module: path threshold counts characters and repeated exact names are not collisions", () => {
  const ordinary = 'a'.repeat(177) + '.md';
  const long = 'b'.repeat(178) + '.md';
  assert.deepEqual(focused.checkPortableNames(null, undefined), []);
  assert.deepEqual(focused.checkPortableNames({}, [ordinary, ordinary, long]), [
    { group: "vault", level: "info", check: "portable-names",
      message: `\"${long}\" is 181 characters — close to the 260-character path limit a Windows clone still has by default.`, file: long },
  ]);
});

test("doctor portability module: line-ending fixtures preserve read errors, first match and current eol acceptance", t => {
  const root = mkdtempSync(join(tmpdir(), "wp-portability-module-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const attrs = join(root, ".gitattributes");
  const missing = [{ group: "install", level: "warn", check: "line-endings",
    message: "No `* text=auto eol=lf` in .gitattributes — a session on Windows will commit CRLF and every file it touches becomes a whole-file diff that conflicts with everyone else's edits. `waypost doctor --fix` writes it." }];
  const bare = [{ group: "install", level: "warn", check: "line-endings",
    message: "`* text=auto` in .gitattributes pins normalisation but not the checkout ending, so git falls back to core.eol=native and a checkout on Windows still writes CRLF into the working tree — invisibly, because check-in normalises back and `git status` stays clean. `waypost doctor --fix` appends `eol=lf`." }];
  assert.deepEqual(focused.checkLineEndings({}, root), []);
  mkdirSync(join(root, ".git"));
  assert.deepEqual(focused.checkLineEndings({}, root), missing);
  mkdirSync(attrs);
  assert.deepEqual(focused.checkLineEndings({}, root), missing);
  rmSync(attrs, { recursive: true });
  for (const [text, expected] of [
    ["*.md text=auto eol=lf\n", missing],
    ["* text=auto\n", bare],
    ["* text=auto\n* text=auto eol=lf\n", bare],
    ["# mine\r\n* text=auto eol=lf\r\n", []],
    ["* text=auto eol=crlf\n", []],
    ["* text=auto eol=\n", []],
  ]) {
    writeFileSync(attrs, text);
    assert.deepEqual(focused.checkLineEndings(Object.freeze({}), root), expected, JSON.stringify(text));
  }
});
