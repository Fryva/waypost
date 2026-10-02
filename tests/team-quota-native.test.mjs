import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { observeNativeProviderQuota } from '../scripts/team-quota-native.mjs';

const cwd=realpathSync(tmpdir()),now=Date.parse('2026-10-01T12:00:00Z');
const participant={id:'worker',incarnation:'inc',model:{provider:'openai',model_id:'fixture-model',reasoning:'low',model_revision:1}};
const descriptor={harness:'codex',managed:true,cwd,model_id:'fixture-model',reasoning:'low',timeout_ms:100};
const account=()=>({account:{type:'chatgpt',email:'private@example.invalid',planType:'pro'},requiresOpenaiAuth:true});
function quota(){const bucket={limitId:'exact-pool',normalModelSlug:'fixture-model',planType:'pro',primary:{usedPercent:10,windowDurationMins:300,resetsAt:1790870000},secondary:{usedPercent:20,windowDurationMins:10080,resetsAt:1790970000},rateLimitReachedType:null,spendControlReached:false,individualLimit:null,credits:null};return {accountId:'private-account',ordinaryUsageAllowed:true,rateLimits:structuredClone(bucket),rateLimitsByLimitId:{'exact-pool':bucket}};}
function fixture({accountRead=account,quotaRead=quota,handle}={}) {
  const methods=[];let killed=false,closed=false,accounts=0,quotas=0;
  const spawnProcess=(_exe,args,options)=>{
    assert.equal(options.shell,false);assert.ok(args.includes('app-server'));
    const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();
    child.stdin=new EventEmitter();child.stdin.write=function(line){const m=JSON.parse(line);methods.push(m);queueMicrotask(()=>{
      if(handle)return handle(m,child);
      if(m.id===undefined)return;
      const result=m.method==='initialize'?{}:m.method==='account/read'?accountRead(++accounts):m.method==='account/rateLimits/read'?quotaRead(++quotas):null;
      child.stdout.write(JSON.stringify({id:m.id,result})+'\n');
    });};
    child.kill=()=>{killed=true;queueMicrotask(()=>{closed=true;child.emit('close',0);});return true;};return child;
  };
  return {spawnProcess,methods,get killed(){return killed;},get closed(){return closed;}};
}
function observe(f,changes={}){return observeNativeProviderQuota({descriptor,participant,now,spawnProcess:f.spawnProcess,...changes});}
test('Codex availability uses only repeated nonbillable authenticated reads and opaque account',async()=>{
  const f=fixture(),result=await observe(f);
  assert.equal(result.status,'available');assert.equal(result.available_calls,1);assert.equal(result.route.pool,'exact-pool');assert.match(result.route.account,/^[a-f0-9]{64}$/);
  assert.equal(result.route.sku,'chatgpt-pro');assert.ok(!JSON.stringify(result).includes('private'));assert.equal(f.killed,true);assert.equal(f.closed,true);
  assert.deepEqual(f.methods.map(m=>m.method),['initialize','initialized','account/read','account/rateLimits/read','account/rateLimits/read','account/read']);
  assert.ok(f.methods.filter(m=>m.method==='account/read').every(m=>m.params.refreshToken===false));
});
test('backend workspace exhaustion proves account scope without guessing model slug',async()=>{
  const f=fixture({quotaRead:()=>{const q=quota();q.ordinaryUsageAllowed=false;for(const b of [q.rateLimits,q.rateLimitsByLimitId['exact-pool']]){b.rateLimitReachedType='workspace_owner_credits_depleted';b.normalModelSlug=null;b.credits={hasCredits:false,unlimited:false,balance:'0'};}return q;}});
  const r=await observe(f);assert.equal(r.status,'exhausted');assert.equal(r.scope,'provider-account');assert.equal(r.available_calls,0);
});
test('exact model exhausted window proves model scope',async()=>{
  const f=fixture({quotaRead:()=>{const q=quota();q.ordinaryUsageAllowed=false;for(const b of [q.rateLimits,q.rateLimitsByLimitId['exact-pool']]){b.primary.usedPercent=100;b.rateLimitReachedType='rate_limit_reached';b.credits={hasCredits:false,unlimited:false,balance:'0'};}return q;}});
  const r=await observe(f);assert.equal(r.status,'exhausted');assert.equal(r.scope,'provider-account-model');assert.equal(r.route.pool,'exact-pool');
});
test('bare generic rate restriction and null model scope cannot lower floor',async()=>{
  for(const slug of [null,'different-model']){const f=fixture({quotaRead:()=>{const q=quota();q.ordinaryUsageAllowed=false;for(const b of [q.rateLimits,q.rateLimitsByLimitId['exact-pool']]){b.primary.usedPercent=100;b.rateLimitReachedType='rate_limit_reached';b.normalModelSlug=slug;}return q;}});await assert.rejects(observe(f),/quota-model-scope-unverified/);assert.equal(f.closed,true);}
});
test('authorization profile, account ID and optional workspace routing must remain bound',async()=>{
  const changed=fixture({accountRead:n=>{const a=account();if(n===2)a.account.email='other@example.invalid';return a;}});await assert.rejects(observe(changed),/authorization-changed/);
  const switched=fixture({quotaRead:n=>{const q=quota();if(n===2)q.accountId='different';return q;}});await assert.rejects(observe(switched),/quota-account-or-snapshot-changed/);
  const routing=fixture({accountRead:()=>({...account(),workspaceRouting:{chatgptAccountId:'other',backendOrigin:'https://chatgpt.com'}})});await assert.rejects(observe(routing),/quota-account-or-permission-unverified/);
});
test('unknown permission, percentages, spend controls and conflicting views block recovery',async()=>{
  const mutate=[q=>q.ordinaryUsageAllowed=null,q=>q.rateLimits.primary.usedPercent=100,q=>{q.rateLimits.spendControlReached=null;q.rateLimitsByLimitId['exact-pool'].spendControlReached=null;},q=>{q.rateLimits.secondary=null;q.rateLimitsByLimitId['exact-pool'].secondary=null;}];
  for(const change of mutate){const f=fixture({quotaRead:()=>{const q=quota();change(q);return q;}});await assert.rejects(observe(f),/quota-/);assert.equal(f.closed,true);}
});
test('API key, other harness and mismatched execution identity never infer quota',async()=>{
  const f=fixture({accountRead:()=>({account:{type:'apiKey'}})});await assert.rejects(observe(f),/account-type-unsupported/);
  await assert.rejects(observe(f,{descriptor:{...descriptor,harness:'claude'}}),/harness-unsupported/);
  await assert.rejects(observe(f,{descriptor:{...descriptor,model_id:'other'}}),/execution-identity-unverified/);
  assert.equal(f.methods.filter(m=>m.method==='account/rateLimits/read').length,0);
});
test('unexpected server requests and read timeout close the owned process',async()=>{
  const callback=fixture({handle:(m,c)=>c.stdout.write(JSON.stringify({id:'server',method:'account/login/start'})+'\n')});await assert.rejects(observe(callback),/server-operation-unsupported/);assert.equal(callback.closed,true);
  const silent=fixture({handle:()=>{}});await assert.rejects(observe(silent),/read-timeout/);assert.equal(silent.closed,true);
});
test('malformed JSON values and malformed RPC results reject without escaping stream callbacks',async()=>{
  for(const value of [null,1,true,'string',[]]) {
    const f=fixture({handle:(_m,c)=>c.stdout.write(JSON.stringify(value)+'\n')});
    await assert.rejects(observe(f),/invalid-frame/);assert.equal(f.closed,true);
    const result=fixture({handle:(m,c)=>c.stdout.write(JSON.stringify({id:m.id,result:value})+'\n')});
    await assert.rejects(observe(result),/invalid-response/);assert.equal(result.closed,true);
  }
});
test('asynchronous stdin EPIPE rejects the observer and awaits owned process shutdown',async()=>{
  const f=fixture({handle:(_m,c)=>c.stdin.emit('error',Object.assign(new Error('broken pipe'),{code:'EPIPE'}))});
  await assert.rejects(observe(f),/process-write-failed/);assert.equal(f.killed,true);assert.equal(f.closed,true);
});
test('included usage exhaustion cannot waive a model with available or unknown paid credits',async()=>{
  for(const reason of ['rate_limit_reached','workspace_owner_credits_depleted'])for(const credits of [null,undefined,{}, {hasCredits:true,unlimited:false,balance:'1'}, {hasCredits:false,unlimited:true}, {hasCredits:false,unlimited:false,balance:'1'}, {hasCredits:false,unlimited:false,balance:'unknown'}]) {
    const f=fixture({quotaRead:()=>{const q=quota();q.ordinaryUsageAllowed=false;for(const b of [q.rateLimits,q.rateLimitsByLimitId['exact-pool']]){b.primary.usedPercent=100;b.rateLimitReachedType=reason;b.credits=credits;}return q;}});
    await assert.rejects(observe(f),/alternative-credits-available-or-unverified/);assert.equal(f.closed,true);
  }
});
