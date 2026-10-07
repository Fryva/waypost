import test from 'node:test';
import assert from 'node:assert/strict';
import {protocolHostFixture} from './helpers/native-protocol-host.mjs';
import {routingDigest} from '../scripts/model-routing.mjs';
import {readdirSync,unlinkSync,realpathSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {observeCodexProtocolAccountQuota,codexAccountQuotaSourceRules} from '../scripts/team-quota-native.mjs';
import {join} from 'node:path';
const billing={provider:'route',origin:'https://provider.fixture',account:routingDigest('quota-fixture-account'),sku:'fixture-subscription',mode:'subscription',paid_fallback:false,provenance:'native-runtime',auth_method:'native-fixture',credit_availability:'unavailable',account_generation:0,consistent:true};
async function fixture(t,options={}){
 const f=await protocolHostFixture(t,{registerHosts:true,billing:name=>({...billing,account:routingDigest('quota-fixture-account-'+name)}),...options});
 await f.host.acknowledgeProtocolLeadership({actionId:'source-ack',nonce:'source-ack',estimateTokens:'40'});
 const state=f.load().state,team=state.teams.team,old=team.leader,source='subscription-source-ack';
 const sourceRules=options.sourceRules?options.sourceRules(team.participants[old].native_binding.collector_id):['exhausted','available'].map(status=>({collector_id:team.participants[old].native_binding.collector_id,source:'https://provider.fixture/quota',method:'GET /quota',evidence_kind:'provider-quota',provider_code:'provider-'+status,scope:'provider-account',status,documentation:'https://provider.fixture/docs/quota'}));
 f.host.enableNativeProtocolQuota({revision:1,policy:{automatic_handover:true,...(options.sameLeaderReactivation?{same_leader_reactivation:true}:{}),expires_at:f.expiry,source_rules:sourceRules}});
 f.host.enableNativeProtocolHandover({revision:1,policy:{kind:'protocol-handover-ack',allow_unknown_quota:true,max_calls:2,max_estimate_tokens:'40',timeout_ms:1000,expires_at:f.expiry,unit_allocations:[{unit_digest:routingDigest(f.unit),max_tokens:'80',allocation_revision:f.allocation.revision}]}});
 f.dependencies.observeNativeProtocolProviderQuota=async({binding})=>({protocol:2,observation_id:'exhaustion-one',status:'exhausted',reason:'provider-quota-exhausted',source:'https://provider.fixture/quota',method:'GET /quota',evidence_kind:'provider-quota',provider_code:'provider-exhausted',scope:'provider-account',provider_confirmed:true,billing_digest:routingDigest(binding.billing),observed_at:new Date().toISOString(),expires_at:new Date(Date.now()+30000).toISOString(),documentation:'https://provider.fixture/docs/quota'});
 return {...f,old,source,ownerHost:f.hostFor(old)};
}
test('native protocol quota handover uses strongest surviving owned Host without weakening review floor',async t=>{
 const f=await fixture(t),before=f.load().state.teams.team,floor=before.review_floor,history=structuredClone(before.required_review_identities_v2),sends=f.calls.filter(x=>x==='native-send').length;
 const result=await f.ownerHost.observeNativeProtocolQuota({sourceInvocationId:f.source});
 assert.equal(result.redistribution.handover_acknowledged,true);assert.equal(result.redistribution.protected_actions_granted,false);
 const after=f.load().state.teams.team;assert.notEqual(after.leader,f.old);assert.equal(after.epoch,before.epoch+1);assert.equal(after.review_floor,floor);assert.deepEqual(after.required_review_identities_v2,history);assert.notEqual(after.review_candidate,after.leader);assert.equal(f.calls.filter(x=>x==='native-send').length,sends+1);
 const x=Object.values(f.load().state.subscription_invocations).find(x=>x.action?.kind==='protocol-handover-ack');assert.equal(x.epoch,before.epoch);assert.equal(x.protocol_handover_ack.completion.scope.epoch,after.epoch);assert.equal(x.state,'settled');assert.equal(x.charged_tokens,'30');assert.equal(Object.keys(after.work).length,0);
});
test('handover capture recovery uses own settled seal and provisional epoch without another inference',async t=>{
 const f=await fixture(t,{interruptHandover:true});const result=await f.ownerHost.observeNativeProtocolQuota({sourceInvocationId:f.source});assert.equal(result.redistribution_blocker,'host-native-handover-blocked');
 const x=Object.values(f.load().state.subscription_invocations).find(x=>x.action?.kind==='protocol-handover-ack');assert.equal(x.state,'settled');assert.equal(x.protocol_handover_ack,undefined);const count=f.calls.filter(x=>x==='native-send').length;
 const recovered=await f.ownerHost.driveNativeProtocolQuotaHandover();assert.equal(recovered.handover_acknowledged,true);assert.equal(f.calls.filter(x=>x==='native-send').length,count);assert.equal(f.load().state.teams.team.epoch,x.action.request.target_epoch);
});
test('unsupported installed provider observer refuses without native calls or quota mutation',async t=>{
 const f=await fixture(t);delete f.dependencies.observeNativeProtocolProviderQuota;const before=structuredClone(f.load().state),count=f.calls.filter(x=>x==='native-send').length;
 await assert.rejects(f.ownerHost.observeNativeProtocolQuota({sourceInvocationId:f.source}),/observer-unsupported/);assert.deepEqual(f.load().state,before);assert.equal(f.calls.filter(x=>x==='native-send').length,count);
});
test('same quota refresh after interrupted capture preserves prepared election and recovers without inference',async t=>{
 const f=await fixture(t,{interruptHandover:true});await f.ownerHost.observeNativeProtocolQuota({sourceInvocationId:f.source});
 const before=f.load().state.teams.team,transition=structuredClone(before.native_protocol_handover),sample=structuredClone(before.participants[f.old].native_protocol_quota),revision=before.quota_revision,count=f.calls.filter(x=>x==='native-send').length;
 f.dependencies.observeNativeProtocolProviderQuota=async()=>({...sample.proof,observation_id:'exhaustion-refreshed',observed_at:new Date().toISOString(),expires_at:new Date(Date.now()+30000).toISOString()});
 const result=await f.ownerHost.observeNativeProtocolQuota({sourceInvocationId:f.source,drive:false});assert.equal(result.refreshed,true);
 const refreshed=f.load().state.teams.team;assert.deepEqual(refreshed.native_protocol_handover,transition);assert.deepEqual(refreshed.participants[f.old].native_protocol_quota,sample);assert.equal(refreshed.quota_revision,revision);
 const recovered=await f.ownerHost.driveNativeProtocolQuotaHandover();assert.equal(recovered.handover_acknowledged,true);assert.equal(f.calls.filter(x=>x==='native-send').length,count);
});
test('account-wide exhaustion pauses every verified model on that account without another call',async t=>{
 const f=await fixture(t,{billing});const count=f.calls.filter(x=>x==='native-send').length;
 const result=await f.ownerHost.observeNativeProtocolQuota({sourceInvocationId:f.source});assert.ok(result.redistribution_blocker);assert.equal(f.calls.filter(x=>x==='native-send').length,count);const after=f.load().state.teams.team;assert.equal(after.status,'paused');assert.equal(after.candidate,null);assert.equal(after.leader,f.old);
});
test('candidate account switch to exhausted billing is refused before sending handover ACK',async t=>{
 const f=await fixture(t);await f.ownerHost.observeNativeProtocolQuota({sourceInvocationId:f.source,drive:false});
 const sample=f.load().state.teams.team.participants[f.old].native_protocol_quota,original=f.options.billing,count=f.calls.filter(x=>x==='native-send').length;
 f.options.billing=name=>({...original(name),account:sample.binding.billing.account});
 await assert.rejects(f.ownerHost.driveNativeProtocolQuotaHandover(),/account.*exhaust|exhaust.*account/);assert.equal(f.calls.filter(x=>x==='native-send').length,count);assert.equal(f.load().state.teams.team.leader,f.old);
});
test('missing historical settled subscription operation ledger blocks handover preparation',async t=>{
 const f=await fixture(t);const source=f.source;
 // An audit belongs to the acknowledged old epoch, unlike the initial ACK.
 const current=f.load().state.teams.team,reviewer=f.hostFor(current.review_candidate);
 reviewer.enableProtocolReview({revision:1,policy:{kind:'protocol-leadership-audit',allow_unknown_quota:true,max_calls:2,max_estimate_tokens:'40',timeout_ms:1000,expires_at:f.expiry,unit_allocations:[{unit_digest:routingDigest(f.unit),max_tokens:'80',allocation_revision:f.allocation.revision}]}});
 await reviewer.auditProtocolLeadership({actionId:'old-audit',sourceInvocationId:source,nonce:'old-audit',estimateTokens:'40'});
 const audit=f.load().state.subscription_invocations['subscription-old-audit'],runtime=join(f.configFor(audit.participant).hostDir,'runtime');
 const path=readdirSync(runtime).find(name=>name.includes(audit.action.operation_id)&&name.endsWith('.closed.json'));assert.ok(path);unlinkSync(join(runtime,path));
 const count=f.calls.filter(x=>x==='native-send').length,result=await f.ownerHost.observeNativeProtocolQuota({sourceInvocationId:source});assert.equal(result.redistribution_required,true);assert.ok(result.redistribution_blocker);assert.equal(f.calls.filter(x=>x==='native-send').length,count);assert.equal(f.load().state.teams.team.leader,f.old);
});

async function restoreOldLeader(f,{drive=true}={}){
 const original=f.load().state.teams.team.participants[f.old].native_protocol_quota;
 f.dependencies.observeNativeProtocolProviderQuota=async()=>{const clock=f.restoredAt=Date.now();return {...original.proof,observation_id:'restored-one',status:'available',reason:'provider-quota-available',provider_code:'provider-available',observed_at:new Date(clock).toISOString(),expires_at:new Date(clock+60000).toISOString()};};
 return f.ownerHost.observeNativeProtocolQuota({sourceInvocationId:f.source,drive});
}
// Real wall clocks: every gate after the positive observation must land well
// inside its original 30-second proof age, with headroom for a slower machine.
const RECOVERY_HEADROOM_MS=15000;
test('explicit recovery opt-in reactivates the old coordinator only through stopped scopes and new epoch ACK',async t=>{
 const f=await fixture(t,{sameLeaderReactivation:true});await f.ownerHost.observeNativeProtocolQuota({sourceInvocationId:f.source,drive:false});
 const before=f.load().state.teams.team,floor=before.review_floor,history=structuredClone(before.required_review_identities_v2),count=f.calls.filter(x=>x==='native-send').length;
 const result=await restoreOldLeader(f);assert.equal(result.redistribution?.handover_acknowledged,true,result.redistribution_blocker);assert.ok(Date.now()-f.restoredAt<=RECOVERY_HEADROOM_MS,'recovery took '+(Date.now()-f.restoredAt)+'ms');
 const after=f.load().state.teams.team;assert.equal(after.leader,f.old);assert.equal(after.epoch,before.epoch+1);assert.equal(after.status,'active');assert.equal(after.review_floor,floor);assert.deepEqual(after.required_review_identities_v2,history);assert.notEqual(after.review_candidate,f.old);assert.equal(f.calls.filter(x=>x==='native-send').length,count+1);
 assert.ok(after.native_protocol_handover.reactivation);const x=Object.values(f.load().state.subscription_invocations).find(x=>x.action?.kind==='protocol-handover-ack');assert.ok(x.action.request.reactivation_digest);assert.equal(x.protocol_handover_ack.completion.scope.epoch,after.epoch);assert.equal(Object.keys(after.work).length,0);
});
test('old coordinator interrupted recovery ACK reuses its original settled invocation without another inference',async t=>{
 const f=await fixture(t,{sameLeaderReactivation:true,interruptHandover:true});await f.ownerHost.observeNativeProtocolQuota({sourceInvocationId:f.source,drive:false});
 const result=await restoreOldLeader(f);assert.equal(result.redistribution_blocker,'host-native-handover-blocked');const count=f.calls.filter(x=>x==='native-send').length;
 const x=Object.values(f.load().state.subscription_invocations).find(x=>x.action?.kind==='protocol-handover-ack');assert.equal(x.state,'settled');assert.equal(x.protocol_handover_ack,undefined);
 const recovered=await f.ownerHost.driveNativeProtocolQuotaHandover();assert.equal(recovered.handover_acknowledged,true);assert.ok(Date.now()-f.restoredAt<=RECOVERY_HEADROOM_MS,'recovery took '+(Date.now()-f.restoredAt)+'ms');assert.equal(f.calls.filter(x=>x==='native-send').length,count);assert.equal(f.load().state.teams.team.leader,f.old);assert.equal(f.load().state.teams.team.epoch,x.action.request.target_epoch);
});

// The built-in Codex account observer, fed by a fake metadata-only app-server
// in the live ChatGPT Plus shape (Codex 0.160.0), through the Host's own capture.
const codexAccount=name=>'private-account-'+name;
const codexBilling=name=>({provider:'openai',origin:'https://chatgpt.com',account:createHash('sha256').update(codexAccount(name)).digest('hex'),sku:'plus',mode:'subscription',paid_fallback:false,provenance:'native-runtime',auth_method:'chatgpt',credit_availability:'unavailable',account_generation:0,consistent:true});
function fakeCodexMetadata(name,{exhausted}){
 return ()=>{const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new EventEmitter();
  const bucket={limitId:'codex',limitName:null,normalModelSlug:null,primary:{usedPercent:exhausted?100:3,windowDurationMins:300,resetsAt:1791142753},secondary:{usedPercent:90,windowDurationMins:10080,resetsAt:1791580344},credits:{hasCredits:false,unlimited:false,balance:'0'},individualLimit:null,spendControlReached:false,planType:'plus',rateLimitReachedType:exhausted?'rate_limit_reached':null};
  child.stdin.write=line=>{const m=JSON.parse(line);queueMicrotask(()=>{if(m.id===undefined)return;const result=m.method==='initialize'?{userAgent:'Codex Desktop/0.160.0 (Mac OS 27.0.1; arm64) dumb (waypost-quota; 1.0.0)'}:m.method==='account/read'?{account:{type:'chatgpt',email:'private@example.invalid',planType:'plus'},requiresOpenaiAuth:true,workspaceRouting:{chatgptAccountId:codexAccount(name),backendOrigin:'https://chatgpt.com'}}:{ordinaryUsageAllowed:!exhausted,rateLimits:structuredClone(bucket),rateLimitsByLimitId:{codex:bucket},rateLimitResetCredits:{availableCount:0,credits:[]},accountId:codexAccount(name),rateLimitUpsell:null};child.stdout.write(JSON.stringify({id:m.id,result})+'\n');});};
  child.kill=()=>{queueMicrotask(()=>child.emit('close',0));return true;};return child;};
}
test('built-in Codex account observer proof passes Host capture under the exported owner rules and drives the handover',async t=>{
 const f=await fixture(t,{billing:codexBilling,sourceRules:codexAccountQuotaSourceRules});
 const name=f.old.slice(-1),codex={harness:'codex',managed:true,cwd:realpathSync(tmpdir()),timeout_ms:1000};
 f.dependencies.observeNativeProtocolProviderQuota=({binding})=>observeCodexProtocolAccountQuota({binding,descriptor:codex,spawnProcess:fakeCodexMetadata(name,{exhausted:true})});
 const result=await f.ownerHost.observeNativeProtocolQuota({sourceInvocationId:f.source});
 assert.equal(result.status,'exhausted');assert.equal(result.redistribution?.handover_acknowledged,true,result.redistribution_blocker);
 const after=f.load().state.teams.team;assert.notEqual(after.leader,f.old);
 const proof=Object.values(after.native_account_quotas)[0].proof;assert.equal(proof.provider_code,'rate_limit_reached');assert.equal(proof.method,'account/rateLimits/read');assert.equal(JSON.stringify(after).includes('private-account'),false);
});

// A provider may give a shorter lease than 60 seconds; 40 seconds leaves the Host
// under its 50-second renewal threshold at once.
function positiveObserver(f,{ttl=40000,status='available',calls,id,delay=0}={}){
 let n=0;return async({binding})=>{calls?.push('observe');const observed=Math.max(Date.now()-1,Date.parse(binding.source_settled_at));if(delay)await new Promise(resolve=>setTimeout(resolve,delay));return {protocol:2,observation_id:id||status+'-lease-'+(++n),status,reason:'provider-quota-'+status,source:'https://provider.fixture/quota',method:'GET /quota',evidence_kind:'provider-quota',provider_code:'provider-'+status,scope:'provider-account',provider_confirmed:true,billing_digest:routingDigest(binding.billing),observed_at:new Date(observed).toISOString(),expires_at:new Date(observed+ttl).toISOString(),documentation:'https://provider.fixture/docs/quota'};};
}
const leaseOf=f=>f.load().state.teams.team.participants[f.old].native_protocol_quota;
const revisionsOf=f=>{const t=f.load().state.teams.team;return [t.native_quota_revision,t.quota_revision];};
async function leasedFixture(t,options){const f=await fixture(t),calls=[];f.dependencies.observeNativeProtocolProviderQuota=positiveObserver(f,{calls,...options});await f.ownerHost.observeNativeProtocolQuota({sourceInvocationId:f.source});await new Promise(resolve=>setTimeout(resolve,5));return {f,calls,revisions:revisionsOf(f),lease:leaseOf(f)};}
test('a same-meaning positive observation renews the Host lease without a revision change',async t=>{
 const {f,revisions,lease}=await leasedFixture(t);
 const second=await f.ownerHost.observeNativeProtocolQuota({sourceInvocationId:f.source});assert.equal(second.renewed,true);
 assert.deepEqual(revisionsOf(f),revisions);assert.ok(Date.parse(leaseOf(f).proof.expires_at)>Date.parse(lease.proof.expires_at));assert.equal(f.load().state.teams.team.leader,f.old);
});
test('a Host entry renews a lease with 50 seconds or less left before it builds its call',async t=>{
 const {f,calls,revisions,lease}=await leasedFixture(t),start=f.calls.length;
 await f.ownerHost.subscriptionBootstrap({nonce:'lease-renewed',estimateTokens:'40',maxTokens:'40'}).catch(()=>{});
 const after=f.calls.slice(start),renew=after.indexOf('native-protocol-quota-renew-v2');
 assert.equal(calls.length,2);assert.equal(renew,0,'the renewal is the first mutation of the entry');assert.equal(after.includes('native-protocol-quota-capture-v2'),false);
 assert.notEqual(leaseOf(f).proof.observation_id,lease.proof.observation_id);assert.deepEqual(revisionsOf(f),revisions);
});
test('a Host entry with more than 50 seconds left starts no observer',async t=>{
 const {f,calls}=await leasedFixture(t,{ttl:60000}),start=f.calls.length;
 await f.ownerHost.subscriptionBootstrap({nonce:'lease-fresh',estimateTokens:'40',maxTokens:'40'}).catch(()=>{});
 assert.equal(calls.length,1);assert.equal(f.calls.slice(start).some(x=>x.startsWith('native-protocol-quota')),false);
});
test('a lapsed lease is an explicit blocker, and a renewal refused at the entry never captures',async t=>{
 const lapsed=await leasedFixture(t,{ttl:3000});await new Promise(resolve=>setTimeout(resolve,3100));const start=lapsed.f.calls.length;
 await assert.rejects(lapsed.f.ownerHost.subscriptionBootstrap({nonce:'lapsed',estimateTokens:'40',maxTokens:'40'}),{message:/host-native-quota-lease-lapsed/});
 assert.equal(lapsed.calls.length,1);assert.deepEqual(lapsed.f.calls.slice(start),[]);
 // The lease lapses while the observer runs: the positive is not captured.
 const slow=await leasedFixture(t,{ttl:3000}),slowCalls=[];slow.f.dependencies.observeNativeProtocolProviderQuota=positiveObserver(slow.f,{ttl:8000,delay:3200,id:'late-positive',calls:slowCalls});const slowStart=slow.f.calls.length;
 await assert.rejects(slow.f.ownerHost.subscriptionBootstrap({nonce:'lapses',estimateTokens:'40',maxTokens:'40'}),{message:/host-native-quota-lease-lapsed/});
 assert.equal(slowCalls.length,1,'the observer ran');assert.deepEqual(slow.f.calls.slice(slowStart),[]);assert.deepEqual(revisionsOf(slow.f),slow.revisions);
 // A reused observation id is not renewable and is not captured either.
 const reused=await leasedFixture(t);reused.f.dependencies.observeNativeProtocolProviderQuota=positiveObserver(reused.f,{id:reused.lease.proof.observation_id});const reusedStart=reused.f.calls.length;
 await assert.rejects(reused.f.ownerHost.subscriptionBootstrap({nonce:'reused',estimateTokens:'40',maxTokens:'40'}),{message:/host-native-quota-lease-not-renewable/});
 assert.deepEqual(reused.f.calls.slice(reusedStart),[]);assert.deepEqual(leaseOf(reused.f),reused.lease);
});
test('an exhaustion found while renewing at an entry is captured, freezes the team and refuses the call',async t=>{
 const {f:g,calls:gcalls}=await leasedFixture(t);g.dependencies.observeNativeProtocolProviderQuota=positiveObserver(g,{status:'exhausted',calls:gcalls});const gsends=g.calls.filter(x=>x==='native-send').length;
 await assert.rejects(g.ownerHost.subscriptionBootstrap({nonce:'lease-exhausted',estimateTokens:'40',maxTokens:'40'}),{message:/host-native-quota-exhausted/});
 assert.equal(g.calls.filter(x=>x==='native-send').length,gsends);const team=g.load().state.teams.team;assert.equal(team.participants[g.old].native_protocol_quota.proof.status,'exhausted');assert.ok(team.native_quota_freeze);
 const observed=gcalls.length;await g.ownerHost.subscriptionBootstrap({nonce:'under-freeze',estimateTokens:'40',maxTokens:'40'}).catch(()=>{});assert.equal(gcalls.length,observed,'no observer starts under a freeze');
});
test('a scheduled pass renews an unexpired lease and drives the handover after an exhaustion it finds',async t=>{
 const fresh=await leasedFixture(t,{ttl:60000}),r=await fresh.f.ownerHost.maintainNativeQuotaLease();assert.equal(r.renewed,true,'a scheduled pass renews any unexpired lease');assert.equal(fresh.calls.length,2);
 const due=await leasedFixture(t),renewed=await due.f.ownerHost.maintainNativeQuotaLease();assert.equal(renewed.renewed,true);assert.deepEqual(revisionsOf(due.f),due.revisions);assert.notEqual(leaseOf(due.f).proof.observation_id,due.lease.proof.observation_id);
 const ex=await leasedFixture(t),before=ex.f.load().state.teams.team;ex.f.dependencies.observeNativeProtocolProviderQuota=positiveObserver(ex.f,{status:'exhausted'});
 const result=await ex.f.ownerHost.maintainNativeQuotaLease();assert.equal(result.status,'exhausted');assert.equal(result.redistribution_required,true);assert.equal(result.handover_acknowledged,true);
 const after=ex.f.load().state.teams.team;assert.notEqual(after.leader,ex.f.old);assert.equal(after.epoch,before.epoch+1);assert.equal(after.review_floor,before.review_floor);
});
test('a renewal that loses to a concurrent one from another Host process is not an error',async t=>{
 const {f,lease}=await leasedFixture(t),other=f.hostFor(f.old),inner=positiveObserver(f,{id:'concurrent-winner'});let first=true;
 f.dependencies.observeNativeProtocolProviderQuota=async args=>{const mine=await positiveObserver(f,{id:'concurrent-loser'})(args);if(first){first=false;await new Promise(resolve=>setTimeout(resolve,5));f.dependencies.observeNativeProtocolProviderQuota=inner;await other.observeNativeProtocolQuota({sourceInvocationId:f.source});}return mine;};
 const r=await f.ownerHost.maintainNativeQuotaLease();assert.deepEqual(r,{renewed:false,reason:'renewed-concurrently'});
 assert.equal(leaseOf(f).proof.observation_id,'concurrent-winner');assert.notEqual(lease.proof.observation_id,'concurrent-winner');
});
test('an exhaustion whose capture loses to a concurrent positive renewal is never reported as renewed concurrently',async t=>{
 const {f}=await leasedFixture(t),other=f.hostFor(f.old),original=f.dependencies.mutate;let first=true;
 f.dependencies.observeNativeProtocolProviderQuota=async args=>{const mine=await positiveObserver(f,{status:'exhausted',id:'exhaustion-seen'})(args);if(first){first=false;await new Promise(resolve=>setTimeout(resolve,5));f.dependencies.observeNativeProtocolProviderQuota=positiveObserver(f,{id:'positive-winner'});await other.observeNativeProtocolQuota({sourceInvocationId:f.source});}return mine;};
 f.dependencies.mutate=(path,request,...rest)=>{if(request.command.type==='native-protocol-quota-capture-v2'){f.dependencies.mutate=original;throw Object.assign(Error('authority-stale-revision'),{code:'authority-stale-revision'});}return original(path,request,...rest);};
 // The lost write is retried on the current state (Host contention retry); the reducer then refuses the
 // exhaustion as older than the winner's positive, and that refusal surfaces instead of a silent success.
 await assert.rejects(f.ownerHost.maintainNativeQuotaLease(),/account-observation-order-conflict/);
 assert.equal(leaseOf(f).proof.observation_id,'positive-winner');
});
test('a handover acknowledgement lost mid-call is reconciled from its owned closure, and the next drive applies the handover with a new attempt',async t=>{
 let failed=false;const f=await fixture(t,{failSend:(_created,invocation)=>{if(!failed&&invocation.id.startsWith('handover_')){failed=true;return true;}return false;}}),before=f.load().state.teams.team;
 const first=await f.ownerHost.observeNativeProtocolQuota({sourceInvocationId:f.source});assert.equal(first.redistribution_required,true);assert.ok(first.redistribution_blocker,'the lost acknowledgement blocks this drive');
 const lost=Object.values(f.load().state.subscription_invocations).find(x=>x.action?.kind==='protocol-handover-ack');assert.equal(lost.state,'uncertain');
 const candidateHost=f.hostFor(lost.participant);
 await assert.rejects(f.ownerHost.driveNativeProtocolQuotaHandover(),'an unreconciled attempt still blocks the drive');
 assert.equal(candidateHost.reconcileProtocolControl({invocationId:lost.id}).reconciled,lost.id);
 candidateHost.acceptUnknownUsage({invocationId:lost.id,chargedTokens:lost.estimate_tokens});
 const applied=await f.ownerHost.driveNativeProtocolQuotaHandover();assert.equal(applied.handover_acknowledged,true);
 const after=f.load().state.teams.team;assert.notEqual(after.leader,f.old);assert.equal(after.epoch,before.epoch+1);assert.equal(after.review_floor,before.review_floor);
 const attempts=Object.values(f.load().state.subscription_invocations).filter(x=>x.action?.kind==='protocol-handover-ack');assert.deepEqual(attempts.map(x=>x.state).sort(),['reconciled','settled']);assert.ok(attempts.find(x=>x.state==='settled').nonce.endsWith('_1'));
});
test('a handover attempt aborted before consume is skipped by the next drive, which applies the handover with a new attempt',async t=>{
 const f=await fixture(t),original=f.dependencies.mutate;let refused=false;
 f.dependencies.mutate=(path,request,...rest)=>{if(!refused&&request.command.type==='subscription-consume-v2'&&String(request.command.nonce).startsWith('handover_')){refused=true;throw Object.assign(Error('fixture refused consume'),{code:'fixture-refused-consume'});}return original(path,request,...rest);};
 const first=await f.ownerHost.observeNativeProtocolQuota({sourceInvocationId:f.source});assert.ok(first.redistribution_blocker);
 const aborted=Object.values(f.load().state.subscription_invocations).find(x=>x.action?.kind==='protocol-handover-ack');assert.equal(aborted.state,'aborted');
 const applied=await f.ownerHost.driveNativeProtocolQuotaHandover();assert.equal(applied.handover_acknowledged,true);assert.notEqual(f.load().state.teams.team.leader,f.old);
 assert.ok(Object.values(f.load().state.subscription_invocations).find(x=>x.action?.kind==='protocol-handover-ack'&&x.state==='settled').nonce.endsWith('_1'));
});
