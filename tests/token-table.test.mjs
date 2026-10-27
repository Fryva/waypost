import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import * as leaf from "../scripts/token-table.mjs";

// Golden results captured from the original private helpers before extraction.
const golden={
  "results": [
    {
      "label": "roles",
      "groups": [],
      "plain": "roles   runs    reqs  t/turn       cache_rd      output      cost\n─────────────────────────────────────────────────────────────────",
      "runs": "roles   runs    reqs  t/turn       cache_rd      output      cost   cost/run\n────────────────────────────────────────────────────────────────────────────",
      "totals": {
        "reqs": 0,
        "input": 0,
        "cacheWrite": 0,
        "cacheRead": 0,
        "output": 0,
        "cost": 0
      }
    },
    {
      "label": "role",
      "groups": [
        {
          "key": "critic",
          "runs": 2,
          "reqs": 3,
          "toolTurns": 2,
          "toolCalls": 5,
          "cacheRead": 1234567,
          "output": 7654,
          "cost": 1.239,
          "input": 12,
          "cacheWrite": 4
        }
      ],
      "plain": "role     runs    reqs  t/turn       cache_rd      output      cost\n──────────────────────────────────────────────────────────────────\ncritic      2       3    2.50      1,234,567       7,654     $1.24",
      "runs": "role     runs    reqs  t/turn       cache_rd      output      cost   cost/run\n─────────────────────────────────────────────────────────────────────────────\ncritic      2       3    2.50      1,234,567       7,654     $1.24      $0.62",
      "totals": {
        "reqs": 3,
        "input": 12,
        "cacheWrite": 4,
        "cacheRead": 1234567,
        "output": 7654,
        "cost": 1.239
      }
    },
    {
      "label": "a long label",
      "groups": [
        {
          "key": "a",
          "runs": 0,
          "reqs": 0,
          "toolTurns": 0,
          "toolCalls": 0,
          "cacheRead": 0,
          "output": 0,
          "cost": 0,
          "input": 0,
          "cacheWrite": 0
        },
        {
          "key": "long role name",
          "runs": 3,
          "reqs": 1000,
          "toolTurns": 3,
          "toolCalls": 4,
          "cacheRead": 4321,
          "output": 12,
          "cost": 0.001,
          "input": 7,
          "cacheWrite": 2
        }
      ],
      "plain": "a long label     runs    reqs  t/turn       cache_rd      output      cost\n──────────────────────────────────────────────────────────────────────────\na                   —       0       —              0           0     $0.00\nlong role name      3   1,000    1.33          4,321          12     $0.00",
      "runs": "a long label     runs    reqs  t/turn       cache_rd      output      cost   cost/run\n─────────────────────────────────────────────────────────────────────────────────────\na                   —       0       —              0           0     $0.00          —\nlong role name      3   1,000    1.33          4,321          12     $0.00      $0.00",
      "totals": {
        "reqs": 1000,
        "input": 7,
        "cacheWrite": 2,
        "cacheRead": 4321,
        "output": 12,
        "cost": 0.001
      }
    }
  ],
  "number": "1,234,567",
  "usd": "$12.35",
  "pricingQueryOwnership": true
};

test("token table retains formatting, totals, order and input immutability",()=>{
  for(const c of golden.results){
    const groups=Object.freeze(c.groups.map(g=>Object.freeze({...g})));
    assert.equal(leaf.table(groups,c.label),c.plain);
    assert.equal(leaf.table(groups,c.label,{runs:true}),c.runs);
    assert.deepEqual(leaf.totals(groups),c.totals);
    assert.notEqual(leaf.totals(groups),leaf.totals(groups));
  }
  assert.equal(leaf.n(1234567),golden.number);
  assert.equal(leaf.usd(12.345),golden.usd);
});

test("token table has a bounded stateless formatting surface",()=>{
  assert.deepEqual(Object.keys(leaf),["n","table","totals","usd"]);
  for(const [name,arity]of Object.entries({n:1,usd:1,table:2,totals:1}))assert.equal(leaf[name].length,arity);
  const source=readFileSync(new URL("../scripts/token-table.mjs",import.meta.url),"utf8");
  assert.ok(Buffer.byteLength(source)<=2500);
  assert.doesNotMatch(source,/^import /m);
});
