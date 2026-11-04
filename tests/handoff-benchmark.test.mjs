import './env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { freezeCodingTask, prepareCodingFixture, prepareCodingConditions, validateCodingAnswer, applyCodingAnswer, gradeCodingObservations, runCodingCandidate, CODING_ORDER } from '../scripts/handoff-benchmark.mjs';
const source=id=>readFileSync(new URL('../scripts/'+{A:'lib-markdown-cells.mjs',B:'lib-artifact-names.mjs',C:'lib-terminal-prompt.mjs'}[id],import.meta.url),'utf8');
const sha=s=>createHash('sha256').update(s).digest('hex');
function fixture(t,id){const parent=mkdtempSync(join(tmpdir(),'waypost-coding-test-'));t.after(()=>rmSync(parent,{recursive:true,force:true}));return prepareCodingFixture(join(parent,'fixture'),freezeCodingTask(id,source(id)));}

test('coding tasks freeze actual current bytes with explicit seeded and historical versions',()=>{
  const a=freezeCodingTask('A',source('A'));
  assert.notEqual(a.source,source('A'));assert.equal(a.base_sha256,sha(a.source));assert.ok(Object.isFrozen(a.facts));
  const b=freezeCodingTask('B',source('B'));assert.equal(b.source,source('B'));
  const c=freezeCodingTask('C',source('C'));assert.match(c.source,/output = process.stderr/);assert.match(c.historical_source,/output = process.stdout/);assert.equal(c.historical_sha256,sha(c.historical_source));
  assert.deepEqual(c.preparation,{kind:'deterministic-curated-context',model_calls:0,actual_transcript:false});
  assert.deepEqual(CODING_ORDER.map(([id,arm])=>id+':'+arm),['A:history','A:summary','A:packet','B:summary','B:packet','B:history','C:packet','C:history','C:summary']);
});

test('all conditions share actual source, task, facts and permissions with curated history explicitly labeled',t=>{
  const f=fixture(t,'C'),prepared=prepareCodingConditions(f),commons=[];
  for(const condition of Object.values(prepared.conditions)){
    commons.push(JSON.parse(condition.payload.task));
    assert.equal(condition.payload.documents[0].text,f.task.source);
    assert.ok(Buffer.byteLength(condition.payload.task)<=4096);
    assert.ok(Buffer.byteLength(JSON.stringify(condition.payload))<=16384);
  }
  assert.deepEqual(commons[0],commons[1]);assert.deepEqual(commons[1],commons[2]);
  assert.match(prepared.conditions.history.payload.context,/not an actual agent transcript/);
  assert.match(prepared.conditions.summary.payload.context,/zero model calls/);
  assert.equal(prepared.preparation.model_calls,0);
});

test('replacement contract rejects extra files, keys, stale hashes, Unicode and byte overflows before writes',t=>{
  const f=fixture(t,'A'),valid={files:[{path:f.task.path,content:f.task.source,base_sha256:f.task.base_sha256}]};
  assert.deepEqual(validateCodingAnswer(JSON.stringify(valid),f.task),valid);
  for(const bad of [{...valid,pass:true},{files:[...valid.files,...valid.files]},{files:[{...valid.files[0],path:'../outside'}]},{files:[{...valid.files[0],base_sha256:'0'.repeat(64)}]},{files:[{...valid.files[0],content:'x'.repeat(6145)}]},{files:[{...valid.files[0],content:'\ud800'}]},{files:[{...valid.files[0],passed:true}]}])assert.throws(()=>validateCodingAnswer(bad,f.task));
  assert.equal(readFileSync(join(f.root,f.task.path),'utf8'),f.task.source);
  const replacement={files:[{...valid.files[0],content:source('A')}]};
  const applied=applyCodingAnswer(f,replacement);assert.equal(applied.candidate_sha256,sha(source('A')));
  assert.throws(()=>applyCodingAnswer(f,replacement),/fixture-changed/);
  assert.equal(readFileSync(new URL('../scripts/lib-markdown-cells.mjs',import.meta.url),'utf8'),source('A'));
});

test('parent grading rejects fabricated success, missing cases and false behavioral observations',()=>{
  for(const id of ['A','B','C']){
    const task=freezeCodingTask(id,source(id));
    for(const forged of [null,{}, {passed:true}, {stdout:'ok 1 - pass',exitCode:0}, {exports:[],cases:[]}])assert.equal(gradeCodingObservations(task,forged).passed,false);
  }
});

function terminalObservations(){
  const modes=['yes','singley','no','eof','sigint','timeout','preabort','abort','afteranswer','overrides','defaults'];
  return {exports:['askYesNo'],cases:modes.map(mode=>{
    const input=mode==='defaults'?'stdin':mode==='overrides'?'custom-input':'input';
    const output=mode==='overrides'?'custom-output':'stderr';
    return {
      mode,value:mode==='yes'||mode==='singley'||mode==='afteranswer'||mode==='overrides',value_type:'boolean',beforeTimers:mode!=='timeout',
      createdTimers:mode==='preabort'?0:1,activeTimers:0,abortListeners:0,
      timerDurations:mode==='preabort'?[]:[mode==='defaults'?60000:mode==='overrides'?37:20],
      events:mode==='preabort'?[]:['input:'+input,'output:'+output,'question:Continue?','close','pause:'+input],
    };
  })};
}

test('terminal grading accepts immediate preabort without input, readline or timer side effects',()=>{
  const task=freezeCodingTask('C',source('C')),observations=terminalObservations();
  const preabort=observations.cases.find(c=>c.mode==='preabort');
  assert.deepEqual(gradeCodingObservations(task,observations),{passed:true,failures:[]});
  preabort.events=['pause:input'];
  assert.equal(gradeCodingObservations(task,observations).passed,true);
  preabort.createdTimers=1;
  assert.equal(gradeCodingObservations(task,observations).passed,false);
  preabort.createdTimers=0;
  for(const effect of ['output:stderr','question:Continue?','close']){
    preabort.events=[effect];
    assert.equal(gradeCodingObservations(task,observations).passed,false);
  }
});

test('terminal grading preserves single y, explicit streams, and custom and default timeout durations',()=>{
  const task=freezeCodingTask('C',source('C'));
  for(const mutate of [
    observations=>{observations.cases.find(c=>c.mode==='singley').value=false},
    observations=>{observations.cases.find(c=>c.mode==='overrides').events[0]='input:stdin'},
    observations=>{observations.cases.find(c=>c.mode==='overrides').events[1]='output:stderr'},
    observations=>{observations.cases.find(c=>c.mode==='overrides').timerDurations=[20]},
    observations=>{observations.cases.find(c=>c.mode==='defaults').timerDurations=[20]},
  ]){
    const observations=terminalObservations();mutate(observations);
    assert.equal(gradeCodingObservations(task,observations).passed,false);
  }
});

test('parent grading rejects values coerced by toJSON and requires pre-serialization type markers',()=>{
  const a=freezeCodingTask('A',source('A'));
  const inputs=['a|b|c','a\\|b|c','',null,12,'|||'];
  const observations={exports:['escCell','unescCell'],cases:inputs.map(v=>({
    escaped:String(v).split('|').join('\\|'),escaped_type:'string',unescaped:String(v).split('\\|').join('|'),unescaped_type:'string',round:String(v),round_type:'string',
  })),symbol:'Symbol(a\\|b\\|c)',symbol_type:'string'};
  assert.equal(gradeCodingObservations(a,observations).passed,true);
  const expected=observations.cases[0].escaped;
  observations.cases[0].escaped={toJSON(){return expected}};
  assert.equal(JSON.parse(JSON.stringify(observations)).cases[0].escaped,expected);
  assert.equal(gradeCodingObservations(a,observations).passed,false);
  observations.cases[0].escaped=expected;observations.cases[0].escaped_type='object';
  assert.equal(gradeCodingObservations(a,observations).passed,false);
  delete observations.cases[0].escaped_type;
  assert.equal(gradeCodingObservations(a,observations).passed,false);
  const c=freezeCodingTask('C',source('C')),terminal=terminalObservations();
  terminal.cases[0].value={toJSON(){return true}};
  assert.equal(gradeCodingObservations(c,terminal).passed,false);
  terminal.cases[0].value=true;terminal.cases[0].value_type='object';
  assert.equal(gradeCodingObservations(c,terminal).passed,false);
  const b=freezeCodingTask('B',source('B'));
  const numbers={exports:['nextNumber','nextNumberFromNames','slugify'],values:['001','014','013','8','00005'],value_types:Array(5).fill('string'),pureEvents:[],old:'014',old_type:'string',oldEvents:['exists','list'],missing:'001',missing_type:'string',slug:'privet-mir',slug_type:'string'};
  assert.equal(gradeCodingObservations(b,numbers).passed,true);
  numbers.values[0]={toJSON(){return '001'}};
  assert.equal(gradeCodingObservations(b,numbers).passed,false);
  numbers.values[0]='001';numbers.value_types[0]='object';
  assert.equal(gradeCodingObservations(b,numbers).passed,false);
});

test('runtime grading refuses absent sandbox verification before candidate execution',async t=>{
  const f=fixture(t,'A');
  await assert.rejects(runCodingCandidate(f),/sandbox-unverified|unsupported-platform/);
});

// These controls are run only by an explicitly enabled driver after actual OS probes;
// no generated code runs as part of normal preparation or on unsupported systems.
export const CODING_BAD_CANDIDATES = Object.freeze({
  earlyExit:'process.exit(0);',
  forgedSuccess:'process.stdout.write(JSON.stringify({passed:true}));',
  toJSONCoercion:'const wrap=value=>({toJSON(){return value},[Symbol.toPrimitive](){return value}});export function escCell(s){return wrap(String(s).split("|").join("\\\\|"))}export function unescCell(s){return wrap(String(s).split("\\\\|").join("|"))}',
  assertionReplacement:'import assert from "node:assert"; assert.equal=()=>{}; export const passed=true;',
});
