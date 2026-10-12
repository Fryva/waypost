import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createOwnedRuntime, stopOwnedRuntime, collectOwnedRuntimeCompletion, verifyOwnedRuntimeCompletion, serializeOwnedRuntimeCompletion, serializeOwnedRuntimeStopProof } from '../scripts/team-owned-runtime.mjs';

const defer=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function fixture(){const directory=mkdtempSync(join(realpathSync(tmpdir()),'waypost-owned-runtime-'));const options={directory,team:'team',participant:'worker',incarnation:'inc',epoch:1,descriptorDigest:'a'.repeat(64)};return {options,runtime:createOwnedRuntime(options),cleanup:()=>rmSync(directory,{recursive:true,force:true})};}
const endpoint=()=>({native_id:'own-context',async stopAndWait(){return {stopped:true,owned_processes:1};}});
function record(f,suffix){const name=readdirSync(f.options.directory).find(n=>n.endsWith(suffix));return JSON.parse(readFileSync(join(f.options.directory,name),'utf8'));}
async function until(predicate){for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,5));}assert.fail('condition did not arrive');}

test('whole operation closes only after callback drain and records consumed identity',async()=>{
 const f=fixture();try{
  const value=await f.runtime.run({kind:'review',operation:'operation-one'},async scope=>{await scope.native(endpoint);scope.annotate({type:'review-consume-v1',nonce:'review-nonce',native_id:'own-context'});return 42;});assert.equal(value,42);
  const stopped=await stopOwnedRuntime({...f.options,requiredOperations:['review-nonce']});assert.equal(stopped.stopped,true);assert.deepEqual(stopped.operations,['operation-one']);
  const closed=record(f,'.closed.json');assert.equal(closed.callback_drained,true);assert.deepEqual(closed.native_ids,['own-context']);assert.equal(closed.scope.descriptor_digest,'a'.repeat(64));
  await assert.rejects(f.runtime.run({kind:'later'},async()=>{}),/epoch-stopped/);
 }finally{f.cleanup();}
});
test('stop latches before pending native factory settles and awaits outer finally',async()=>{
 const f=fixture(),started=defer(),factory=defer(),outer=defer();let scope,closed=0,drained=false;
 try{
  const running=f.runtime.run({kind:'dispatch'},async s=>{scope=s;const native=s.native(()=>{started.resolve();return factory.promise;});try{await native;}catch(e){assert.match(e.message,/operation-stopped/);}await outer.promise;drained=true;});
  await started.promise;const stopping=stopOwnedRuntime({...f.options,timeoutMs:1000});await until(()=>scope.stopRequested);
  factory.resolve({native_id:'pending',async stopAndWait(){closed++;return {stopped:true};}});await until(()=>closed>0);assert.equal(drained,false);
  outer.resolve();assert.equal((await stopping).stopped,true);await running;assert.equal(drained,true);
 }finally{factory.resolve(endpoint());outer.resolve();f.cleanup();}
});
test('child closure alone cannot confirm a callback still awaiting billing or effects',async()=>{
 const f=fixture(),ready=defer(),invoice=defer();let scope,closed=false;
 try{
  const running=f.runtime.run({kind:'dispatch'},async s=>{scope=s;await s.native(()=>({async stopAndWait(){closed=true;return {stopped:true};}}));ready.resolve();await invoice.promise;assert.throws(()=>s.assertActive(),/operation-stopped/);});
  await ready.promise;await assert.rejects(stopOwnedRuntime({...f.options,timeoutMs:100}),/operation-stop-unconfirmed/);assert.equal(closed,true);assert.equal(scope.stopRequested,true);assert.ok(!readdirSync(f.options.directory).some(n=>n.endsWith('.closed.json')));
  invoice.resolve();await running;assert.equal((await stopOwnedRuntime(f.options)).stopped,true);
 }finally{invoice.resolve();f.cleanup();}
});
test('failed endpoint stop never produces a closed proof',async()=>{
 const f=fixture();try{await assert.rejects(f.runtime.run({kind:'review'},async scope=>{await scope.native(()=>({async stopAndWait(){throw new Error('not confirmed');}}));}),/endpoint-stop-unconfirmed/);assert.ok(!readdirSync(f.options.directory).some(n=>n.endsWith('.closed.json')));await assert.rejects(stopOwnedRuntime({...f.options,timeoutMs:100}),/operation-stop-unconfirmed/);}finally{f.cleanup();}
});
test('historical consumed nonces without operation ledger remain a blocker',async()=>{
 const f=fixture();try{await assert.rejects(stopOwnedRuntime({...f.options,requiredOperations:['old-consumed-nonce']}),/historical-consumption-stop-unconfirmed/);await assert.rejects(f.runtime.run({kind:'dispatch'},async()=>{}),/epoch-stopped/);}finally{f.cleanup();}
});
test('an unknown prepared intent cannot be treated as stopped by age or absent PID',async()=>{
 const f=fixture();try{
  await f.runtime.run({kind:'seed'},async()=>{});const name=readdirSync(f.options.directory).find(n=>n.endsWith('.intent.json')),intent=record(f,'.intent.json');intent.operation='unknown';writeFileSync(join(f.options.directory,name.replace(/operation-.*\.intent.json$/,'operation-unknown.intent.json')),JSON.stringify(intent),{mode:0o600});
  await assert.rejects(stopOwnedRuntime(f.options),/prepared-operation-stop-unconfirmed/);
 }finally{f.cleanup();}
});
test('stop capability rejects an incorrect token without affecting the active callback',async()=>{
 const f=fixture(),ready=defer(),release=defer();let scope;
 try{const running=f.runtime.run({kind:'relay'},async s=>{scope=s;ready.resolve();await release.promise;s.assertActive();});await ready.promise;
  const cap=record(f,'.capability.json'),response=await fetch(cap.url,{method:'POST',headers:{Authorization:'Bearer '+'0'.repeat(64)},body:'{}'});assert.equal(response.status,403);assert.equal(scope.stopRequested,false);await response.body.cancel();release.resolve();await running;
 }finally{release.resolve();f.cleanup();}
});
test('factory launch failure cannot silently certify possible unreturned children',async()=>{
 const f=fixture();try{await assert.rejects(f.runtime.run({kind:'inspect'},async s=>{await s.native(async()=>{throw new Error('factory crashed');});}),/stop-unconfirmed/);assert.ok(!readdirSync(f.options.directory).some(n=>n.endsWith('.closed.json')));}finally{f.cleanup();}
});
test('fenced startup closes its own unstarted intent without claiming historical work',async()=>{
 const f=fixture();let entered=false;
 try{
  // run persists intent synchronously, then yields while opening its capability.
  const running=f.runtime.run({kind:'inspect',operation:'fenced-start'},async()=>{entered=true;});
  const rejected=assert.rejects(running,/operation-stopped/);
  await assert.rejects(stopOwnedRuntime(f.options),/prepared-operation-stop-unconfirmed/);
  await rejected;assert.equal(entered,false);
  const closed=record(f,'.closed.json');assert.equal(closed.callback_started,false);assert.deepEqual(closed.consumptions,[]);assert.deepEqual(closed.closure_proofs,[]);
  assert.equal((await stopOwnedRuntime(f.options)).stopped,true);
  await assert.rejects(stopOwnedRuntime({...f.options,requiredOperations:['unrelated-consumed']}),/historical-consumption-stop-unconfirmed/);
 }finally{f.cleanup();}
});


test('post-finalization and recovery completion read exact owned effects without an epoch barrier',async()=>{
 const f=fixture(),selectors={...f.options,operation:'action-operation',invocation_id:'subscription-action',nonce:'action',native_id:'native-action'};
 try{
  await f.runtime.run({kind:'protocol-control',operation:selectors.operation},async scope=>{await scope.native(()=>({native_id:selectors.native_id,async stopAndWait(){return {stopped:true,owned_processes:1,process_group_closed:true};}}));scope.annotate({type:'subscription-consume-v2',invocation_id:selectors.invocation_id,nonce:selectors.nonce,native_id:selectors.native_id});});
  const before=readdirSync(f.options.directory),completion=collectOwnedRuntimeCompletion(selectors),snapshot=serializeOwnedRuntimeCompletion(completion);
  assert.equal(verifyOwnedRuntimeCompletion(completion,selectors),true);assert.equal(completion.callback_drained,true);assert.equal(completion.stopped,true);assert.deepEqual(readdirSync(f.options.directory),before);assert.equal(before.some(name=>name.endsWith('.barrier.json')),false);
  assert.deepEqual(serializeOwnedRuntimeCompletion(collectOwnedRuntimeCompletion(selectors)),snapshot);
  for(const fake of [snapshot,{...completion},JSON.parse(JSON.stringify(completion))])assert.throws(()=>verifyOwnedRuntimeCompletion(fake),/completion-provenance/);
  assert.throws(()=>collectOwnedRuntimeCompletion({...selectors,native_id:'foreign'}),/consumption/);assert.throws(()=>verifyOwnedRuntimeCompletion(completion,{nonce:'foreign'}),/selector-mismatch/);
  for(const partial of [{participant:'foreign'},{epoch:999},{descriptorDigest:'f'.repeat(64)}])assert.throws(()=>verifyOwnedRuntimeCompletion(completion,partial),/binding-required|scope-mismatch/);
  await f.runtime.run({kind:'still-usable',operation:'another-operation'},async()=>{});
 }finally{f.cleanup();}
});
test('completion refuses unclosed callbacks, unrelated native proof and mismatched durable effect',async()=>{
 const f=fixture(),selectors={...f.options,operation:'completion-check',invocation_id:'subscription-check',nonce:'check',native_id:'native-check'},release=defer(),ready=defer();
 try{
  const running=f.runtime.run({kind:'protocol-control',operation:selectors.operation},async scope=>{await scope.native(()=>({native_id:selectors.native_id,async stopAndWait(){return {stopped:true,owned_processes:1,process_group_closed:true};}}));scope.annotate({type:'subscription-consume-v2',invocation_id:selectors.invocation_id,nonce:selectors.nonce,native_id:selectors.native_id});ready.resolve();await release.promise;});
  await ready.promise;assert.throws(()=>collectOwnedRuntimeCompletion(selectors));release.resolve();await running;
  const closedName=readdirSync(f.options.directory).find(n=>n.endsWith('.closed.json')),closed=record(f,'.closed.json');closed.closure_proofs[0].native_id='foreign';writeFileSync(join(f.options.directory,closedName),JSON.stringify(closed));assert.throws(()=>collectOwnedRuntimeCompletion(selectors),/native-closure/);
  closed.closure_proofs[0].native_id=selectors.native_id;writeFileSync(join(f.options.directory,closedName),JSON.stringify(closed));const effectName=readdirSync(f.options.directory).find(n=>n.endsWith('.effect-0.json')),effect=JSON.parse(readFileSync(join(f.options.directory,effectName),'utf8'));effect.nonce='changed';writeFileSync(join(f.options.directory,effectName),JSON.stringify(effect));assert.throws(()=>collectOwnedRuntimeCompletion(selectors),/effect-mismatch/);
 }finally{release.resolve();f.cleanup();}
});


test('strict epoch stop serialization comes only from actual callback drain and group proofs',async()=>{
 const f=fixture();try{
  await f.runtime.run({kind:'protocol-control',operation:'strict-stop'},async scope=>{await scope.native(async()=>({native_id:'strict-native',async stopAndWait(){return {stopped:true,owned_processes:1,process_group_closed:true};}}));scope.annotate({type:'subscription-consume-v2',nonce:'strict-nonce',invocation_id:'strict-invocation',native_id:'strict-native'});});
  const stopped=await stopOwnedRuntime({...f.options,requiredOperations:['strict-invocation','strict-nonce']});
  assert.deepEqual(Object.keys(stopped),['stopped','team','participant','incarnation','epoch','descriptor_digest','operations','evidence_digest']);
  const proof=serializeOwnedRuntimeStopProof(stopped);assert.equal(proof.protocol,2);assert.equal(proof.callback_drained,true);assert.equal(proof.epoch_barrier,true);assert.deepEqual(proof.required_operations,['strict-invocation','strict-nonce']);
  for(const copy of [structuredClone(stopped),JSON.parse(JSON.stringify(stopped))])assert.throws(()=>serializeOwnedRuntimeStopProof(copy),/provenance/);
  stopped.epoch++;assert.throws(()=>serializeOwnedRuntimeStopProof(stopped),/provenance/);
 }finally{f.cleanup();}
});
test('legacy child-only stop evidence cannot become a strict protocol epoch stop',async()=>{
 const f=fixture();try{
  await f.runtime.run({kind:'legacy',operation:'child-only'},scope=>scope.native(endpoint));
  const stopped=await stopOwnedRuntime(f.options);assert.equal(stopped.stopped,true);assert.throws(()=>serializeOwnedRuntimeStopProof(stopped),/provenance/);
 }finally{f.cleanup();}
});

// A child process holds owned operations (nested when asked) whose native stop
// is the only way their callbacks drain, then reports readiness.
async function interruptChild({signal='SIGTERM',nested=false,listener=''}={}){
 const {spawn}=await import('node:child_process'),{fileURLToPath}=await import('node:url');
 const directory=mkdtempSync(join(realpathSync(tmpdir()),'waypost-owned-interrupt-')),module=fileURLToPath(new URL('../scripts/team-owned-runtime.mjs',import.meta.url));
 const script=`import {createOwnedRuntime} from ${JSON.stringify(module)};
${listener}
const runtime=createOwnedRuntime({directory:${JSON.stringify(directory)},team:'team',participant:'worker',incarnation:'inc',epoch:1,descriptorDigest:'a'.repeat(64)});
const hold=(name,inner)=>runtime.run({kind:'subscription-bootstrap',operation:name},async scope=>{
 let fail;const pending=new Promise((_,reject)=>{fail=reject;});
 await scope.native(async()=>({native_id:name+'-context',async stopAndWait(){fail(Object.assign(new Error('native-outcome-uncertain'),{code:'native-outcome-uncertain'}));return {stopped:true,owned_processes:1,process_group_closed:true};}}));
 scope.annotate({type:'subscription-consume-v2',nonce:name,invocation_id:'subscription-'+name,native_id:name+'-context'});
 if(inner)await Promise.allSettled([inner(),pending]);else{process.stdout.write('ready\\n');await pending;}
});
await hold('outer',${nested?"()=>hold('inner')":'null'}).catch(()=>{});
process.stdout.write('after\\n');`;
 try{
  const child=spawn(process.execPath,['--input-type=module','-e',script],{stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',d=>{stdout+=d;});child.stderr.on('data',d=>{stderr+=d;});
  await new Promise((resolve,reject)=>{child.stdout.on('data',()=>{if(stdout.includes('ready'))resolve();});child.once('exit',()=>reject(new Error('child exited early: '+stderr)));});
  child.kill(signal);
  const [code,died]=await new Promise(resolve=>child.once('exit',(c,s)=>resolve([c,s])));
  const closures=Object.fromEntries(readdirSync(directory).filter(n=>n.endsWith('.closed.json')).map(n=>{const r=JSON.parse(readFileSync(join(directory,n),'utf8'));return [r.operation,r];}));
  // Each closure yields the completion a reconcile submits for its consumed call.
  const completions=Object.fromEntries(Object.keys(closures).map(name=>[name,collectOwnedRuntimeCompletion({directory,team:'team',participant:'worker',incarnation:'inc',epoch:1,descriptorDigest:'a'.repeat(64),operation:name,invocation_id:'subscription-'+name,nonce:name,native_id:name+'-context'})]));
  return {code,signal:died,stdout,stderr,closures,completions};
 }finally{rmSync(directory,{recursive:true,force:true});}
}
const posix={skip:process.platform==='win32',timeout:30000};
test('an interrupt during an owned operation stops its native process and still writes the closure before the process dies by that signal',posix,async()=>{
 const r=await interruptChild();assert.equal(r.signal,'SIGTERM',r.stderr);assert.equal(r.code,null);
 const closed=r.closures.outer;assert.ok(closed,'the closure was written before the process died');
 assert.equal(r.completions.outer.kind,'subscription-bootstrap');assert.equal(closed.stopped,true);assert.equal(closed.callback_drained,true);assert.equal(closed.kind,'subscription-bootstrap');assert.deepEqual(closed.native_ids,['outer-context']);assert.equal(closed.closure_proofs[0].process_group_closed,true);assert.equal(closed.consumptions[0].invocation_id,'subscription-outer');
});
test('nested owned operations each write a closure on one interrupt, and SIGINT and SIGHUP are handled like SIGTERM',posix,async()=>{
 for(const signal of ['SIGINT','SIGHUP']){
  const r=await interruptChild({signal,nested:true});assert.equal(r.signal,signal,r.stderr);
  assert.deepEqual(Object.keys(r.closures).sort(),['inner','outer'],signal);for(const c of Object.values(r.closures))assert.equal(c.callback_drained,true);
 }
});
test('when another listener handles the interrupt, the closure is written and the process is left to that listener',posix,async()=>{
 const r=await interruptChild({listener:"process.once('SIGTERM',()=>{process.stdout.write('graceful\\n');});"});
 assert.equal(r.code,0,r.stderr);assert.equal(r.signal,null);assert.match(r.stdout,/graceful[\s\S]*after/);assert.ok(r.closures.outer);
});
test('interrupt listeners exist only while an owned operation runs',async()=>{
 const f=fixture(),before=['SIGINT','SIGTERM','SIGHUP'].map(s=>process.listenerCount(s));let during;
 try{await f.runtime.run({kind:'review'},async scope=>{await scope.native(endpoint);during=['SIGINT','SIGTERM','SIGHUP'].map(s=>process.listenerCount(s));});}finally{f.cleanup();}
 assert.deepEqual(['SIGINT','SIGTERM','SIGHUP'].map(s=>process.listenerCount(s)),before);
 if(process.platform!=='win32')assert.deepEqual(during,before.map(n=>n+1));
});
