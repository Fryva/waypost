import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createOwnedRuntime, stopOwnedRuntime } from '../scripts/team-owned-runtime.mjs';

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
