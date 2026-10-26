import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as facade from "../scripts/lib.mjs";
import * as leaf from "../scripts/lib-markdown-cells.mjs";
import { rebuildIndexRows } from "../scripts/reconcile.mjs";
import { checkIndexes } from "../scripts/doctor-generated.mjs";

test("Markdown cells retain facade bindings, arity and read budget", () => {
  assert.deepEqual(Object.keys(leaf).sort(), ["escCell", "unescCell"]);
  for (const name of ["escCell", "unescCell"]) {
    assert.equal(facade[name],leaf[name]); assert.equal(leaf[name].name,name); assert.equal(leaf[name].length,1);
  }
  assert.ok(readFileSync(new URL("../scripts/lib-markdown-cells.mjs",import.meta.url)).length<=1500);
});

test("Markdown cells retain ASCII pipe rules without normalization or idempotence", () => {
  const cases=[
    ["plain", "plain", "plain"], ["|", "\\|", "|"],
    ["\\|", "\\\\|", "|"], ["\\\\|", "\\\\\\|", "\\|"],
    ["A||B", "A\\|\\|B", "A||B"], ["中｜文\r\n", "中｜文\r\n", "中｜文\r\n"],
    ["", "", ""], ["\\x", "\\x", "\\x"], [null,"null","null"], [undefined,"undefined","undefined"],
  ];
  for (const [input,escaped,unescaped] of cases) {
    assert.equal(leaf.escCell(input),escaped); assert.equal(leaf.unescCell(input),unescaped);
    assert.equal(leaf.unescCell(leaf.escCell(input)),String(input));
  }
  assert.notEqual(leaf.escCell(leaf.escCell("|")),leaf.escCell("|"));
});

test("Markdown cells preserve String coercion hint, ordering and original errors", () => {
  for (const name of ["escCell","unescCell"]) {
    const hints=[], input={ [Symbol.toPrimitive](hint){ hints.push(hint); return "x|y"; } };
    assert.equal(leaf[name](input),name==="escCell"?"x\\|y":"x|y"); assert.deepEqual(hints,["string"]);
    const error=new Error("coercion failure");
    assert.throws(()=>leaf[name]({[Symbol.toPrimitive](){throw error}}),e=>e===error);
    assert.equal(leaf[name](Symbol("pipe|symbol")),name==="escCell"?"Symbol(pipe\\|symbol)":"Symbol(pipe|symbol)");
    assert.throws(()=>leaf[name](Object.create(null)),TypeError);
  }
});

test("Markdown cells preserve generated index and doctor title round trip", t => {
  const root=mkdtempSync(join(tmpdir(),"wp-cells-consumer-")); t.after(()=>rmSync(root,{recursive:true,force:true}));
  mkdirSync(join(root,"adr")); const title="Alpha | already \\| Unicode 中";
  const artifact={kind:"adr",rel:"adr/pipe.md",fm:{title,status:"accepted",date:"2026-01-02"}};
  writeFileSync(join(root,"adr/pipe.md"),"---\ntitle: fixture\n---\n");
  const original="Human prose\n\n| File | Title | Status | Date |\n|---|---|---|---|\n\nTail prose\n";
  const folder={path:"adr",kind:"adr"}; const before=JSON.stringify(artifact);
  const out=rebuildIndexRows(original,folder,[artifact]); writeFileSync(join(root,"adr/README.md"),out.content);
  assert.ok(out.content.startsWith("Human prose\n\n")); assert.ok(out.content.endsWith("\nTail prose\n"));
  assert.ok(out.content.includes("Alpha \\| already \\\\| Unicode 中"));
  assert.deepEqual(checkIndexes({vault_path:root},{folders:[folder]},[artifact]),[]);
  assert.equal(rebuildIndexRows(out.content,folder,[artifact]).content,out.content);
  assert.equal(JSON.stringify(artifact),before);
});
