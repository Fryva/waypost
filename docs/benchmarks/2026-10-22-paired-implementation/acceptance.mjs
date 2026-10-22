import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {readFileSync} from 'node:fs';
const path=process.argv[2];
const source=readFileSync(path,'utf8');
const module=await import(pathToFileURL(path).href);
assert.deepEqual(Object.keys(module),['planBatches']);
const run=module.planBatches;
let passed=0;
const tests=[];
function test(name,fn){try{fn();passed++;tests.push({name,pass:true});}catch(e){tests.push({name,pass:false,error:String(e.stack)});}}
function inputError(jobs,c,kind=TypeError){if(arguments.length===1)c=2;assert.throws(()=>run(jobs,c),kind);}
function graphError(jobs,code,remaining){assert.throws(()=>run(jobs,2),e=>e instanceof Error&&e.code===code&&(remaining===undefined||JSON.stringify(e.remaining)===JSON.stringify(remaining)));}
function frozen(v){if(v&&typeof v==='object'){for(const x of Object.values(v))frozen(x);Object.freeze(v);}return v;}
test('empty',()=>assert.deepEqual(run([],1),[]));
test('public batch',()=>assert.deepEqual(run([{id:'b'},{id:'a'},{id:'c',dependsOn:['a']}],2),[['a','b'],['c']]));
test('recomputed priority',()=>assert.deepEqual(run([{id:'a',priority:1},{id:'b',priority:3},{id:'c',dependsOn:['b'],priority:8}],1),[['b'],['c'],['a']]));
test('no same-batch dependency',()=>assert.deepEqual(run([{id:'a'},{id:'b',dependsOn:['a']},{id:'c',dependsOn:['b']}],64),[['a'],['b'],['c']]));
test('disconnected',()=>assert.deepEqual(run([{id:'z',priority:-2},{id:'a',priority:-2},{id:'b',priority:3}],2),[['b','a'],['z']]));
test('code-unit ties',()=>assert.deepEqual(run(['ä','z','a','A','😀','_'].map(id=>({id})),64),[['A','_','a','z','ä','😀']]));
test('prototype ids',()=>assert.deepEqual(run([{id:'__proto__'},{id:'constructor',dependsOn:['__proto__']},{id:'toString',dependsOn:['constructor']}],3),[['__proto__'],['constructor'],['toString']]));
test('undefined optional values',()=>assert.deepEqual(run([{id:'a',dependsOn:undefined,priority:undefined}],1),[['a']]));
test('immutable frozen graph',()=>{const x=frozen([{id:'a',dependsOn:[],priority:1},{id:'b',dependsOn:['a']}]);assert.deepEqual(run(x,2),[['a'],['b']]);});
test('repeated calls isolated',()=>{const x=[{id:'x'}];const y=run(x,1);y[0].push('junk');assert.deepEqual(run(x,1),[['x']]);});
for(const [i,c] of [0,-1,65,1.5,NaN,Infinity,'2',null,undefined,true].entries())test('invalid concurrency '+i,()=>inputError([],c,RangeError));
for(const [i,x] of [null,{},'abc',2,undefined].entries())test('invalid jobs '+i,()=>inputError(x));
for(const [i,x] of [null,[],3,'a',{}, {id:''},{id:1}].entries())test('invalid record '+i,()=>inputError([x]));
for(const [i,x] of [null,{},'a',1,[1],[''],['a','a']].entries())test('invalid dependsOn '+i,()=>inputError([{id:'b',dependsOn:x}]));
for(const [i,x] of [null,Infinity,NaN,1.5,'1',true,Number.MAX_SAFE_INTEGER+1].entries())test('invalid priority '+i,()=>inputError([{id:'a',priority:x}]));
test('duplicate id',()=>inputError([{id:'a'},{id:'a'}]));
test('validate shapes before graph',()=>inputError([{id:'a',dependsOn:['missing']},{id:3}]));
test('unknown dependency',()=>graphError([{id:'a',dependsOn:['missing']}],'INVALID_GRAPH'));
test('self dependency',()=>graphError([{id:'a',dependsOn:['a']}],'INVALID_GRAPH'));
test('cycle and blocked descendants',()=>graphError([{id:'b',dependsOn:['a']},{id:'a',dependsOn:['b']},{id:'z',dependsOn:['b']},{id:'free'}],'CYCLE',['a','b','z']));
test('cycle after schedulable prefix',()=>graphError([{id:'ready'},{id:'a',dependsOn:['b','ready']},{id:'b',dependsOn:['a']}],'CYCLE',['a','b']));
test('3000 chain iterative',()=>{const x=Array.from({length:3000},(_,i)=>({id:String(i),dependsOn:i?[String(i-1)]:[]}));const a=run(x,64);assert.equal(a.length,3000);assert.deepEqual(a[2999],['2999']);});
test('no imports or host access',()=>assert.doesNotMatch(source,/\b(?:import\s|require\s*\(|process\s*\.|fetch\s*\(|Math\s*\.\s*random)/));
let state=0x51a7;
function random(n){state=(Math.imul(state,1664525)+1013904223)>>>0;return state%n;}
function oracle(jobs,c){const done=new Set(),out=[];while(done.size<jobs.length){const ready=jobs.filter(j=>!done.has(j.id)&&j.dependsOn.every(d=>done.has(d))).sort((a,b)=>b.priority-a.priority||(a.id<b.id?-1:a.id>b.id?1:0)).slice(0,c);assert(ready.length);out.push(ready.map(j=>j.id));for(const j of ready)done.add(j.id);}return out;}
for(let n=0;n<160;n++)test('seeded DAG '+n,()=>{const size=1+random(30),jobs=[];for(let i=0;i<size;i++){const deps=[];for(let j=0;j<i;j++)if(random(5)===0)deps.push('job'+j);jobs.push({id:'job'+i,priority:random(15)-7,dependsOn:deps});}const c=1+random(8),expected=oracle(jobs,c);for(let i=jobs.length-1;i>0;i--){const j=random(i+1);[jobs[i],jobs[j]]=[jobs[j],jobs[i]];}const before=JSON.stringify(jobs);assert.deepEqual(run(frozen(jobs),c),expected);assert.equal(JSON.stringify(jobs),before);});
console.log(JSON.stringify({tests:tests.length,passed,failed:tests.length-passed,results:tests},null,2));
if(passed!==tests.length)process.exitCode=1;
